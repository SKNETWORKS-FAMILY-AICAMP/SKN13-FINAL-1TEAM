from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Generator, Optional
import json, uuid
from sqlalchemy.orm import Session
from datetime import datetime
from ..database import get_db, ChatSession, ChatMessage, ToolMessageRecord, User
from ..ChatBot.agents.RoutingAgent import RoutingAgent, generate_config
from ..ChatBot.core.AgentState import AgentState
from langchain_core.messages.tool import ToolMessage

router = APIRouter()

# --- Pydantic Models ---
class MessageSaveRequest(BaseModel):
    session_id: str
    role: str
    content: str

# --- Chat Message Handling ---
def _create_chat_message(db: Session, session_id: str, role: str, content: str, message_id: str = None):
    message = ChatMessage(
        session_id=session_id,
        role=role,
        content=content,
        message_id=message_id,
        timestamp=datetime.now()
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message

def _create_tool_message(
    db: Session,
    chat_msg_id: int,
    tool_call_id: str | None = None,
    status: str | None = None,
    artifact: dict | None = None,
    raw_content: dict | str | None = None,
) -> ToolMessageRecord:
    """ToolMessageRecord를 DB에 저장하고 반환"""
    tool_record = ToolMessageRecord(
        chat_message_id=chat_msg_id,
        tool_call_id=tool_call_id,
        tool_status=status,
        tool_artifact=artifact,
        tool_raw_content=raw_content,
    )
    db.add(tool_record)
    db.commit()
    db.refresh(tool_record)
    return tool_record


async def _handle_tool_start(event: dict, session_id: str, db: Session):
    tool_name = event.get("name", "Unknown Tool")
    tool_input = event.get("data", {}).get("input", {})
    tool_call_id = event.get("tool_call_id")
    tool_artifact = event.get("artifact")

    # 사용자 화면용 메시지
    thinking_message = (
        f"[AI Thinking]: Using tool '{tool_name}' with input:\n"
        f"```json\n{json.dumps(tool_input, indent=2, ensure_ascii=False)}\n```"
    )

    # 1. ChatMessage 저장
    chat_msg = _create_chat_message(db, session_id, "assistant", thinking_message)

    # 2. ToolMessageRecord 저장
    tool_raw_content = {"tool_name": tool_name, "input": tool_input}
    _create_tool_message(
        db,
        chat_msg.id,
        tool_call_id=tool_call_id,
        status="started",
        artifact=tool_artifact,
        raw_content=tool_raw_content,
    )

    # 3. SSE 전송
    yield f"data: {json.dumps({'thinking_message': thinking_message}, ensure_ascii=False)}\n\n"


async def _handle_tool_end(event: dict, session_id: str, db: Session):
    tool_name = event.get("name")
    raw_output = event.get("data", {}).get("output", "")
    print(f"--- _handle_tool_end called. tool_name: {tool_name}, raw_output type: {type(raw_output)} ---")

    # If the editor tool finishes, its output is the new document.
    # Yield a specific event for the frontend to catch and update the editor.
    DOCUMENT_UPDATE_TOOLS = {
    "run_document_edit",  # 메인 편집 도구 (기존)
    "replace_text_in_document",  # 기존 도구
    "create_document_structure",  # 문서 구조 생성
    "create_business_report_template",  # 보고서 템플릿
    "create_meeting_minutes_template",  # 회의록 템플릿
    "add_formatted_text",  # 텍스트 스타일링
    "create_list",  # 리스트 생성
    "create_table",  # 테이블 생성
    "add_blockquote",  # 인용문/들여쓰기
    "format_text_block",  # 텍스트 블록 포맷팅
    "apply_document_styling",  # 스타일 적용
    "enhance_document_readability",  # 가독성 향상
    }
    if tool_name in DOCUMENT_UPDATE_TOOLS:
        content_to_send = raw_output.content if isinstance(raw_output, ToolMessage) else raw_output
        print(f"--- Sending document_update for replace_text_in_document. Content length: {len(content_to_send) if isinstance(content_to_send, str) else 'N/A'} ---")
        yield f"data: {json.dumps({'document_update': content_to_send}, ensure_ascii=False)}\n\n"

    formatted_output = "[Tool Output]: "
    tool_raw_json = None

    try:
        if isinstance(raw_output, ToolMessage):
            tool_raw_json = {
                "content": raw_output.content,
                "type": getattr(raw_output, "type", None),
                "tool_call_id": getattr(raw_output, "tool_call_id", None),
                "artifact": getattr(raw_output, "artifact", None),
                "status": getattr(raw_output, "status", None),
            }
            parsed_output = raw_output.content
        else:
            parsed_output = str(raw_output)
            tool_raw_json = {"raw": parsed_output}

        # 사용자용 포맷팅
        if isinstance(parsed_output, str):
            try:
                parsed_json = json.loads(parsed_output)
                formatted_output += (
                    f"\n```json\n{json.dumps(parsed_json, indent=2, ensure_ascii=False)}\n```"
                )
            except json.JSONDecodeError:
                formatted_output += f"\n```\n{parsed_output}\n```"
        elif isinstance(parsed_output, dict):
            formatted_output += (
                f"\n```json\n{json.dumps(parsed_output, indent=2, ensure_ascii=False)}\n```"
            )
        else:
            formatted_output += f"`{str(parsed_output)}`"

    except Exception as e:
        formatted_output += f"`Error processing output: {e}`"
        print(f"[Error] raw_output={raw_output} -> {e}")

    # 1. SSE 전송
    yield f"data: {json.dumps({'tool_message': formatted_output}, ensure_ascii=False)}\n\n"

    # 2. ChatMessage 저장
    chat_msg = _create_chat_message(
        db,
        session_id,
        "tool",
        content=json.dumps(tool_raw_json, ensure_ascii=False),
    )

    # 3. ToolMessageRecord 저장
    _create_tool_message(
        db,
        chat_msg.id,
        tool_call_id=tool_raw_json.get("tool_call_id"),
        status=tool_raw_json.get("status", "finished"),
        artifact=tool_raw_json.get("artifact"),
        raw_content=tool_raw_json,
    )

async def _stream_llm_response(session_id: str, prompt: str, document_content: Optional[str], chat_agent, config, db: Session) -> Generator:
    # Get or create the chat session to prevent foreign key violations
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        default_user_id = 1
        user = db.query(User).filter(User.id == default_user_id).first()
        if not user:
            user = User(id=default_user_id, unique_auth_number="default_auth", username="default_user", hashed_password="", email="default@example.com")
            db.add(user)
        session = ChatSession(id=session_id, user_id=default_user_id, title="새로운 대화")
        db.add(session)
        db.commit()

    full_response_content = ""
    llm_output_buffer = "" # 라우팅 LLM 출력을 위한 버퍼
    
    history_messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.timestamp).all()
    
    messages = []
    for msg in history_messages:
        if msg.role == "tool":
            continue
        role = "ai" if msg.role == "assistant" else msg.role
        messages.append((role, msg.content))
    
    if not messages or messages[-1] != ("user", prompt):
        messages.append(("user", prompt))

    # ✅ Create the initial state object
    initial_state: AgentState = {
        "prompt": prompt,
        "document_content": document_content,
        "messages": messages,
        # The following fields will be populated by the agents
        "intent": None,
        "needs_document_content": False,
        "intermediate_steps": [],
        "generation": None,
    }

    # Pass the state object to the agent stream
    async for event in chat_agent.astream_events(initial_state, config=config):
        
        kind = event["event"]
        name = event.get("name")

        # 'request_document' 노드가 종료되었는지 확인
        if kind == "on_chain_end" and name == "request_document":
            node_output = event.get("data", {}).get("output", {})
            if node_output and node_output.get("needs_document_content"):
                print("--- 프론트엔드에 문서 요청 신호 전송 ---")
                tool_call_id = f"req_doc_{uuid.uuid4()}"
                yield f"data: {json.dumps({'needs_document_content': True, 'agent_context': {'tool_call_id': tool_call_id}}, ensure_ascii=False)}\n\n"
                

        # 'route_question' 체인이 종료되었고, 'request_document'가 트리거되지 않았다면 버퍼된 LLM 출력을 yield
        if kind == "on_chain_end" and name == "route_question":
            if llm_output_buffer:
                yield f"data: {json.dumps({'content': llm_output_buffer}, ensure_ascii=False)}\n\n"
                llm_output_buffer = "" # 버퍼 비우기

        # 일반적인 LLM 스트림 처리 (라우팅 LLM 제외)
        if kind == "on_chat_model_stream":
            content = event["data"]["chunk"].content
            if content:
                yield f"data: {json.dumps({'content': content})}\n\n"
                full_response_content += content
                
        elif kind == "on_tool_start":
            async for chunk in _handle_tool_start(event, session_id, db):
                yield chunk
        
        elif kind == "on_tool_end":
            async for chunk in _handle_tool_end(event, session_id, db):
                yield chunk
        
        elif kind == "on_end":
            final_state = event.get("data", {}).get("output", {})
            # ... (rest of the logic)
            yield "data: [DONE]\n\n"

    if full_response_content:
        _create_chat_message(db, session_id, "assistant", full_response_content)

# --- Chat API Endpoints ---
@router.post("/chat/save")
async def save_message(request: MessageSaveRequest, db: Session = Depends(get_db)):
    default_user_id = 1
    user = db.query(User).filter(User.id == default_user_id).first()
    if not user:
        user = User(id=default_user_id, unique_auth_number="default_auth", username="default_user", hashed_password="", email="default@example.com")
        db.add(user)
        db.commit()
        db.refresh(user)

    session = db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
    if not session:
        session = ChatSession(id=request.session_id, user_id=user.id, title="새로운 대화")
        db.add(session)
        db.commit()
        db.refresh(session)

    new_message = ChatMessage(session_id=request.session_id, role=request.role, content=request.content)
    db.add(new_message)
    db.commit()
    db.refresh(new_message)

    if request.role == "user" and session.title == "새로운 대화":
        session.title = request.content[:50]
        db.commit()

    return {"status": "success"}

@router.get("/chat/sessions")
async def get_chat_sessions(db: Session = Depends(get_db)):
    default_user_id = 1
    sessions = db.query(ChatSession).filter(ChatSession.user_id == default_user_id).order_by(ChatSession.created_at.desc()).all()
    sessions_list = []
    for session in sessions:
        sessions_list.append({"id": session.id, "title": session.title})
    return {"sessions": sessions_list}

@router.get("/chat/messages/{session_id}")
async def get_messages(session_id: str, db: Session = Depends(get_db)):
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.timestamp).all()
    return {"messages": [{"role": msg.role, "content": msg.content} for msg in messages]}

@router.get("/llm/stream")
async def llm_stream(session_id: str, prompt: str, document_content: Optional[str] = None, db: Session = Depends(get_db)):
    config = generate_config(session_id)
    chat_agent = RoutingAgent()

    return StreamingResponse(_stream_llm_response(session_id, prompt, document_content, chat_agent, config, db), media_type="text/event-stream")
