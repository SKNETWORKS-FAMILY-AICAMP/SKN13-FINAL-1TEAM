from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Generator, Optional, Sequence
import json, uuid, os
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from ..database import get_db, ChatSession, ChatMessage, ToolMessageRecord, User
from ..routers.auth_routes import get_current_user
import boto3
from botocore.config import Config
from ..ChatBot.agents.RoutingAgent import RoutingAgent, generate_config
from ..ChatBot.core.AgentState import AgentState
from langchain_core.messages.tool import ToolMessage

# APIRouter 인스턴스 생성
router = APIRouter()

# S3 설정
DOCS_BUCKET = os.getenv("DOCS_BUCKET", "your-docs-bucket-name")
_s3 = boto3.client("s3", config=Config(retries={"max_attempts": 3, "mode": "standard"}))

# --- Pydantic 모델 ---
# 메시지 저장 요청을 위한 데이터 모델
class MessageSaveRequest(BaseModel):
    session_id: str # 채팅 세션 ID
    role: str # 메시지 발신자 역할 (예: "user", "ai")
    content: str # 메시지 내용

# --- 채팅 메시지 처리 헬퍼 함수 ---
# 채팅 메시지를 데이터베이스에 저장하는 함수
def _create_chat_message(db: Session, session_id: str, role: str, content: str, message_id: str = None):
    message = ChatMessage(
        session_id=session_id,
        role=role,
        content=content,
        message_id=message_id,
        timestamp=datetime.now(timezone.utc) # 현재 시간을 UTC로 타임스탬프 설정
    )
    db.add(message) # DB 세션에 추가
    db.commit() # 변경사항 커밋
    db.refresh(message) # DB에서 메시지 정보 새로고침
    return message # 저장된 메시지 객체 반환

# 도구 메시지 기록을 데이터베이스에 저장하는 함수
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
    db.add(tool_record) # DB 세션에 추가
    db.commit() # 변경사항 커밋
    db.refresh(tool_record) # DB에서 도구 메시지 기록 새로고침
    return tool_record # 저장된 도구 메시지 기록 객체 반환

# 도구 시작 이벤트를 처리하고 SSE(Server-Sent Events)를 전송하는 함수
async def _handle_tool_start(event: dict, session_id: str, db: Session):
    tool_name = event.get("name", "Unknown Tool") # 도구 이름
    tool_input = event.get("data", {}).get("input", {}) # 도구 입력
    tool_call_id = event.get("tool_call_id") # 도구 호출 ID
    tool_artifact = event.get("artifact") # 도구 아티팩트

    # 사용자 화면에 표시할 생각 중 메시지
    thinking_message = (
        f"[AI Thinking]: Using tool '{tool_name}' with input:\n"
        f"```json\n{json.dumps(tool_input, indent=2, ensure_ascii=False)}\n```"
    )

    # 1. ChatMessage 저장 (AI의 생각 중 메시지)
    chat_msg = _create_chat_message(db, session_id, "assistant", thinking_message)

    # 2. ToolMessageRecord 저장 (도구 호출 시작 기록)
    tool_raw_content = {"tool_name": tool_name, "input": tool_input}
    _create_tool_message(
        db,
        chat_msg.id,
        tool_call_id=tool_call_id,
        status="started",
        artifact=tool_artifact,
        raw_content=tool_raw_content,
    )

    # 3. SSE 전송 (프론트엔드로 생각 중 메시지 전송)
    yield f"data: {json.dumps({'thinking_message': thinking_message}, ensure_ascii=False)}\n\n"

# 도구 종료 이벤트를 처리하고 SSE를 전송하는 함수
async def _handle_tool_end(event: dict, session_id: str, db: Session):
    tool_name = event.get("name") # 도구 이름
    raw_output = event.get("data", {}).get("output", "") # 도구 출력
    print(f"--- _handle_tool_end called. tool_name: {tool_name}, raw_output type: {type(raw_output)} ---")

    # 문서 업데이트 관련 도구 목록
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
    # 문서 업데이트 도구인 경우, 프론트엔드에 문서 업데이트 신호 전송
    if tool_name in DOCUMENT_UPDATE_TOOLS:
        content_to_send = raw_output.content if isinstance(raw_output, ToolMessage) else raw_output
        print(f"--- Sending document_update for replace_text_in_document. Content length: {len(content_to_send) if isinstance(content_to_send, str) else 'N/A'} ---")
        yield f"data: {json.dumps({'document_update': content_to_send}, ensure_ascii=False)}\n\n"

    formatted_output = "[Tool Output]: " # 도구 출력 포맷팅을 위한 초기 문자열
    tool_raw_json = None

    try:
        if isinstance(raw_output, ToolMessage): # ToolMessage 객체인 경우
            tool_raw_json = {
                "content": raw_output.content,
                "type": getattr(raw_output, "type", None),
                "tool_call_id": getattr(raw_output, "tool_call_id", None),
                "artifact": getattr(raw_output, "artifact", None),
                "status": getattr(raw_output, "status", None),
            }
            parsed_output = raw_output.content
        else: # 그 외의 경우
            parsed_output = str(raw_output)
            tool_raw_json = {"raw": parsed_output}

        # 사용자에게 보여줄 형식으로 출력 포맷팅
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
                f"\n```json\n{json.dumps(parsed_json, indent=2, ensure_ascii=False)}\n```"
            )
        else:
            formatted_output += f"`{str(parsed_output)}`"

    except Exception as e:
        formatted_output += f"`Error processing output: {e}`"
        print(f"[Error] raw_output={raw_output} -> {e}")

    # 1. SSE 전송 (도구 출력 메시지 전송)
    yield f"data: {json.dumps({'tool_message': formatted_output}, ensure_ascii=False)}\n\n"

    # 2. ChatMessage 저장 (도구 출력 메시지)
    chat_msg = _create_chat_message(
        db,
        session_id,
        "tool",
        content=json.dumps(tool_raw_json, ensure_ascii=False),
    )

    # 3. ToolMessageRecord 저장 (도구 호출 종료 기록)
    _create_tool_message(
        db,
        chat_msg.id,
        tool_call_id=tool_raw_json.get("tool_call_id"),
        status=tool_raw_json.get("status", "finished"),
        artifact=tool_raw_json.get("artifact"),
        raw_content=tool_raw_json,
    )

# LLM 응답 스트리밍을 위한 비동기 함수
async def _stream_llm_response(session_id: str, prompt: str, document_content: Optional[str], chat_agent, config, db: Session) -> Generator:
    # 채팅 세션 가져오기 또는 생성 (외래 키 제약 조건 방지)
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        default_user_id = 1 # 임시 사용자 ID
        user = db.query(User).filter(User.id == default_user_id).first()
        if not user: # 사용자가 없으면 새로 생성
            user = User(id=default_user_id, unique_auth_number="default_auth", username="default_user", hashed_password="", email="default@example.com")
            db.add(user)
        session = ChatSession(id=session_id, user_id=default_user_id, title="새로운 대화")
        db.add(session)
        db.commit()

    full_response_content = "" # 전체 응답 내용을 저장할 버퍼
    llm_output_buffer = "" # 라우팅 LLM 출력을 위한 버퍼
    
    # 이전 채팅 메시지 가져오기
    history_messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.timestamp).all()
    
    messages = []
    for msg in history_messages:
        if msg.role == "tool": # 도구 메시지는 건너뛰기
            continue
        role = "ai" if msg.role == "assistant" else msg.role # 역할 매핑
        messages.append((role, msg.content))
    
    if not messages or messages[-1] != ("user", prompt): # 마지막 메시지가 현재 프롬프트와 다르면 추가
        messages.append(("user", prompt))

    # 초기 AgentState 객체 생성
    initial_state: AgentState = {
        "prompt": prompt,
        "document_content": document_content,
        "messages": messages,
        # 다음 필드들은 에이전트에 의해 채워질 것임
        "intent": None,
        "needs_document_content": False,
        "intermediate_steps": [],
        "generation": None,
    }

    # 에이전트 스트림을 통해 상태 객체 전달
    async for event in chat_agent.astream_events(initial_state, config=config):
        
        kind = event["event"] # 이벤트 종류
        name = event.get("name") # 이벤트 이름

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
                
        elif kind == "on_tool_start": # 도구 시작 이벤트
            async for chunk in _handle_tool_start(event, session_id, db):
                yield chunk
        
        elif kind == "on_tool_end": # 도구 종료 이벤트
            async for chunk in _handle_tool_end(event, session_id, db):
                yield chunk
        
        elif kind == "on_end": # 스트림 종료 이벤트
            final_state = event.get("data", {}).get("output", {})
            # ... (나머지 로직)
            yield "data: [DONE]\n\n" # 스트림 종료 신호

    if full_response_content: # 전체 응답 내용이 있으면 저장
        _create_chat_message(db, session_id, "assistant", full_response_content)

# --- 채팅 API 엔드포인트 ---
# 메시지 저장 엔드포인트
@router.post("/save")
async def save_message(
    request: MessageSaveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 보안: 실제 로그인 사용자 사용

    session = db.query(ChatSession).filter(
        ChatSession.id == request.session_id,
        ChatSession.user_id == current_user.id  # 보안: 자신의 세션만
    ).first()
    if not session: # 세션이 없으면 새로 생성
        session = ChatSession(id=request.session_id, user_id=current_user.id, title="새로운 대화")
        db.add(session)
        db.commit()
        db.refresh(session)

    new_message = ChatMessage(session_id=request.session_id, role=request.role, content=request.content)
    db.add(new_message) # 새 메시지 추가
    db.commit() # 변경사항 커밋
    db.refresh(new_message) # DB에서 메시지 정보 새로고침

    if request.role == "user" and session.title == "새로운 대화": # 사용자 메시지이고 세션 제목이 기본값이면
        session.title = request.content[:50] # 메시지 내용으로 세션 제목 업데이트
        db.commit()

    return {"status": "success"} # 성공 상태 반환

# 채팅 세션 목록 조회 엔드포인트
@router.get("/sessions")
async def get_chat_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 보안: 자신의 세션만 조회
    sessions = db.query(ChatSession).filter(
        ChatSession.user_id == current_user.id
    ).order_by(ChatSession.created_at.desc()).all()
    sessions_list = []
    for session in sessions: # 세션 정보를 딕셔너리 형태로 변환
        sessions_list.append({"id": session.id, "title": session.title})
    return {"sessions": sessions_list} # 세션 목록 반환

# 특정 세션의 메시지 목록 조회 엔드포인트
@router.get("/{session_id}/messages")
async def get_messages(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 보안: 자신의 세션인지 확인
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or access denied")
    
    messages = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.timestamp).all()
    return {"messages": [{"role": msg.role, "content": msg.content} for msg in messages]} # 메시지 목록 반환

# LLM 응답 스트리밍 엔드포인트
@router.get("/stream")
async def llm_stream(session_id: str, prompt: str, document_content: Optional[str] = None, db: Session = Depends(get_db)):
    config = generate_config(session_id) # 세션 ID로 설정 생성
    chat_agent = RoutingAgent() # 라우팅 에이전트 인스턴스 생성

    # LLM 응답을 스트리밍 형태로 반환
    return StreamingResponse(_stream_llm_response(session_id, prompt, document_content, chat_agent, config, db), media_type="text/event-stream")

# --- S3 파일 삭제 유틸리티 ---
def delete_s3_objects(bucket: str, keys: list[str]) -> None:
    """S3에서 파일들을 삭제하는 함수"""
    if not keys:
        return
    # 1000개 단위로 삭제
    for i in range(0, len(keys), 1000):
        chunk = keys[i : i + 1000]
        _s3.delete_objects(
            Bucket=bucket,
            Delete={"Objects": [{"Key": k} for k in chunk], "Quiet": True},
        )

def _collect_attachment_keys(messages: Sequence[ChatMessage]) -> list[str]:
    """메시지들에서 첨부파일 S3 키들을 추출하는 함수"""
    keys: list[str] = []
    for msg in messages:
        # 메시지 content에서 첨부파일 정보 추출 (JSON 파싱 필요시)
        try:
            if hasattr(msg, 'tool_message') and msg.tool_message:
                artifact = msg.tool_message.tool_artifact
                if artifact and isinstance(artifact, dict):
                    # S3 키 추출 로직 (프로젝트에 맞게 수정 필요)
                    s3_key = artifact.get('s3_key') or artifact.get('key')
                    if s3_key:
                        keys.append(s3_key)
        except Exception:
            # 파싱 실패시 무시
            pass
    return keys

# --- 삭제 엔드포인트들 ---
@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: str,
    hard: bool = Query(False, description="하드 삭제 여부 (True: 완전삭제, False: 소프트삭제)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """메시지 삭제 (소프트/하드 삭제 지원)"""
    # 메시지 조회 및 권한 확인
    message = db.query(ChatMessage).filter(ChatMessage.message_id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # 세션 소유자 확인
    session = db.query(ChatSession).filter(ChatSession.id == message.session_id).first()
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if hard:
        # 하드 삭제: S3 파일도 함께 삭제
        keys = _collect_attachment_keys([message])
        if keys:
            delete_s3_objects(DOCS_BUCKET, keys)
        db.delete(message)
    else:
        # 소프트 삭제: is_deleted 플래그 설정 (향후 구현)
        # message.is_deleted = True  # 현재 ChatMessage 모델에 is_deleted 필드가 없음
        db.delete(message)  # 임시로 하드 삭제
    
    db.commit()
    return {"ok": True, "message": "Message deleted successfully"}

@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    hard: bool = Query(False, description="하드 삭제 여부"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """세션 삭제 (세션의 모든 메시지 포함)"""
    # 세션 조회 및 권한 확인
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if hard:
        # 하드 삭제: 세션의 모든 메시지와 S3 파일 삭제
        messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).all()
        keys = _collect_attachment_keys(messages)
        if keys:
            delete_s3_objects(DOCS_BUCKET, keys)
        
        # 메시지들 삭제 (CASCADE로 인해 자동 삭제되지만 명시적으로)
        db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
        db.delete(session)
    else:
        # 소프트 삭제
        session.is_deleted = True
    
    db.commit()
    return {"ok": True, "message": "Session deleted successfully"}

@router.delete("/sessions/{session_id}/messages")
async def delete_older_messages_in_session(
    session_id: str,
    before: Optional[str] = Query(None, description="이 날짜 이전 메시지 삭제 (ISO8601 형식, 예: 2025-01-01T00:00:00Z)"),
    keep_last: Optional[int] = Query(None, ge=0, description="최신 N개 메시지만 보존"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """세션 내 특정 조건의 오래된 메시지들 삭제"""
    # 세션 권한 확인
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    deleted_count = 0
    
    if before:
        # 특정 날짜 이전 메시지 삭제
        try:
            before_datetime = datetime.fromisoformat(before.replace('Z', '+00:00'))
            messages_to_delete = db.query(ChatMessage).filter(
                ChatMessage.session_id == session_id,
                ChatMessage.timestamp < before_datetime
            ).all()
            deleted_count = len(messages_to_delete)
            
            for msg in messages_to_delete:
                db.delete(msg)
                
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use ISO8601 format.")
    
    elif keep_last is not None:
        # 최신 N개만 보존하고 나머지 삭제
        all_messages = db.query(ChatMessage).filter(
            ChatMessage.session_id == session_id
        ).order_by(ChatMessage.timestamp.desc()).all()
        
        if len(all_messages) > keep_last:
            messages_to_delete = all_messages[keep_last:]
            deleted_count = len(messages_to_delete)
            
            for msg in messages_to_delete:
                db.delete(msg)
    
    else:
        raise HTTPException(status_code=400, detail="Either 'before' or 'keep_last' parameter is required")
    
    db.commit()
    return {"ok": True, "soft_deleted": deleted_count, "message": f"Deleted {deleted_count} messages"}