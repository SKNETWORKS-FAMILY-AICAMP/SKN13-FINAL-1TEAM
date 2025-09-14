from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Generator, Optional, Sequence
import json, uuid, os, logging
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from ..database import get_db, ChatSession, ChatMessage, ToolMessageRecord, User
from ..routers.auth_routes import get_current_user
from ..services.greeting_service import GreetingService
import boto3
from botocore.config import Config
from ..ChatBot.agents.RoutingAgent import RoutingAgent, generate_config
from ..ChatBot.core.AgentState import AgentState
from langchain_core.messages.tool import ToolMessage

# 로깅 설정
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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

# 문서 클릭 요청을 위한 데이터 모델
class DocumentClickRequest(BaseModel):
    document_id: str # 클릭된 문서 ID
    document_data: dict # 문서의 전체 데이터
    session_id: str # 채팅 세션 ID

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
    tool_name = event.get("name", "Unknown Tool")
    tool_input = event.get("data", {}).get("input", {})

    # 사용자 친화적인 메시지 생성
    user_friendly_message = ""
    if tool_name in ["hybrid_document_search_tool", "enhanced_hybrid_search_tool"]:
        keywords = tool_input.get('keywords', [])
        query = tool_input.get('query', '')
        search_term = keywords or [query] if query else []

        if search_term:
            if isinstance(search_term, list):
                search_display = ', '.join(search_term)
            else:
                search_display = str(search_term)
            user_friendly_message = f"'{search_display}' 관련 문서를 검색하고 있습니다... 🔎"
            logger.debug(f"[DOCUMENT_SEARCH] 검색 시작 - 키워드: {search_term}")
        else:
            user_friendly_message = "문서를 검색하고 있습니다... 🔎"
            logger.debug("[DOCUMENT_SEARCH] 일반 검색 시작")
    elif tool_name == "get_presigned_download_url":
        file_key = tool_input.get('file_key', '문서')
        user_friendly_message = f"'{file_key}'의 다운로드 링크를 생성하고 있습니다... 🔗"
    elif tool_name == "run_document_edit":
        user_friendly_message = "문서 편집 작업을 준비하고 있습니다... ✍️"
        logger.debug(f"[DOCUMENT_EDIT] 문서 편집 도구 시작 - 입력: {tool_input}")
    else:
        user_friendly_message = "요청하신 작업을 처리하기 위해 도구를 준비하고 있습니다... ⚙️"

    # thinking_message를 사용자 친화적인 메시지로 교체
    thinking_message = user_friendly_message

    # 1. ChatMessage 저장 (AI의 생각 중 메시지) - DB에는 상세 정보 저장
    db_message_content = f"[Tool Start: {tool_name}]\nInput:\n```json\n{json.dumps(tool_input, indent=2, ensure_ascii=False)}\n```"
    chat_msg = _create_chat_message(db, session_id, "assistant", db_message_content)

    # 2. ToolMessageRecord 저장 (기존 로직 유지)
    tool_call_id = event.get("tool_call_id")
    tool_artifact = event.get("artifact")
    tool_raw_content = {"tool_name": tool_name, "input": tool_input}
    _create_tool_message(
        db,
        chat_msg.id,
        tool_call_id=tool_call_id,
        status="started",
        artifact=tool_artifact,
        raw_content=tool_raw_content,
    )

    # 3. SSE 전송 (프론트엔드로 사용자 친화적 메시지 전송)
    yield f"data: {json.dumps({'thinking_message': thinking_message}, ensure_ascii=False)}\n\n"

# 도구 종료 이벤트를 처리하고 SSE를 전송하는 함수
async def _handle_tool_end(event: dict, session_id: str, db: Session):
    tool_name = event.get("name") # 도구 이름
    raw_output = event.get("data", {}).get("output", "") # 도구 출력
    print(f"--- _handle_tool_end called. tool_name: {tool_name}, raw_output type: {type(raw_output)} ---")

    # 문서 업데이트 관련 도구 목록
    DOCUMENT_UPDATE_TOOLS = {
    "insert_content_at_position", # 방금 추가
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
    "document_draft_generator_tool",  # 문서 초안 생성 도구
    }
    # 문서 업데이트 도구인 경우, 프론트엔드에 문서 업데이트 신호 전송
    if tool_name in DOCUMENT_UPDATE_TOOLS:
        content_to_send = raw_output.content if isinstance(raw_output, ToolMessage) else raw_output
        print(f"--- Sending document_update for replace_text_in_document. Content length: {len(content_to_send) if isinstance(content_to_send, str) else 'N/A'} ---")
        try:
            json_data = json.dumps({'document_update': content_to_send}, ensure_ascii=False, separators=(',', ':'))
            yield f"data: {json_data}\n\n"
        except Exception as json_error:
            print(f"❌ [DEBUG] JSON 직렬화 오류 (document_update): {json_error}")
            yield f"data: {{\"document_update_error\": \"문서 업데이트 데이터가 너무 큽니다\"}}\n\n"
    
    # 로컬 문서 검색 도구 또는 하이브리드 검색 도구인 경우, 프론트엔드에 문서 목록 전송
    if tool_name in ["local_document_search_tool", "hybrid_document_search_tool"]:
        try:
            # raw_output이 ToolMessage 객체인 경우 content 추출
            if isinstance(raw_output, ToolMessage):
                tool_output = raw_output.content
            else:
                tool_output = raw_output
            
            # 문자열인 경우 JSON으로 파싱 시도
            if isinstance(tool_output, str):
                import json as json_module
                try:
                    parsed_output = json_module.loads(tool_output)
                except json_module.JSONDecodeError:
                    parsed_output = {"found_documents": []}
            else:
                parsed_output = tool_output
            
            # 찾은 문서가 있으면 프론트엔드로 전송
            if isinstance(parsed_output, dict) and "found_documents" in parsed_output:
                documents = parsed_output["found_documents"]
                if documents:
                    print(f"--- Sending local_documents. Found {len(documents)} documents ---")
                    yield f"data: {json.dumps({'local_documents': documents}, ensure_ascii=False)}\n\n"
                    
        except Exception as e:
            print(f"--- Error processing local document search results: {e} ---")

#    formatted_output = "[Tool Output]: " # 도구 출력 포맷팅을 위한 초기 문자열
    formatted_output = ""
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

    # 1. SSE 전송 (도구 출력 메시지 전송) - 사용자에게는 숨김
    # yield f"data: {json.dumps({'tool_message': formatted_output}, ensure_ascii=False)}\n\n"

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
async def _stream_llm_response(session_id: str, prompt: str, document_content: Optional[str], workflow_agent, config, db: Session) -> Generator:
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

    # 초기 AgentState 생성 (새로운 헬퍼 사용)
    from ..ChatBot.core.AgentState import AgentStateHelper
    initial_state = AgentStateHelper.create_initial_state(
        prompt=prompt,
        document_content=document_content,
        messages=messages
    )

    # 에이전트 스트림을 통해 상태 객체 전달
    async for event in workflow_agent.astream_events(initial_state, config=config):
        
        kind = event["event"] # 이벤트 종류
        name = event.get("name") # 이벤트 이름

        # 'request_document' 노드가 종료되었는지 확인
        if kind == "on_chain_end" and name == "request_document":
            node_output = event.get("data", {}).get("output", {})
            if node_output and node_output.get("needs_document_content"):
                print("--- 프론트엔드에 문서 요청 신호 전송 ---")
                tool_call_id = f"req_doc_{uuid.uuid4()}"
                yield f"data: {json.dumps({'needs_document_content': True, 'agent_context': {'tool_call_id': tool_call_id}}, ensure_ascii=False)}\n\n"
                
        # 'workflow_tracker' 노드가 종료되었는지 확인하고 워크플로 완료 처리
        if kind == "on_chain_end" and name == "workflow_tracker":
            node_output = event.get("data", {}).get("output", {})
            print(f"🔍 [DEBUG] workflow_tracker 노드 완료: {node_output}")

            # 워크플로가 완료되었고 에디터 자동 열기 데이터가 있는지 확인
            if node_output and node_output.get('workflow_complete', False) and node_output.get('send_to_editor', False):
                selected_document = node_output.get('selected_document')
                print(f"🔍 [DEBUG] workflow_tracker에서 워크플로 완료 + 에디터 데이터 감지!")
                print(f"🔍 [DEBUG] selected_document 있음: {selected_document is not None}")

                if selected_document:
                    print(f"🔍 [DEBUG] 문서편집창 IPC 전송 준비: {selected_document.get('filename', 'Unknown')}")
                    # IPC 메시지 데이터 준비
                    ipc_data = {
                        "action": "open_document_in_editor",
                        "document": {
                            "filename": selected_document.get("filename", "문서"),
                            "content": selected_document.get("content", ""),
                            "filePath": selected_document.get("filePath", ""),
                            "source": selected_document.get("source", "unknown")
                        }
                    }

                    print(f"🔍 [DEBUG] IPC 데이터 전송: {ipc_data['document']['filename']}")
                    # 대용량 문서 처리: 청크 전송 방식 사용
                    document_content = ipc_data['document']['content']
                    content_length = len(document_content)

                    if content_length > 5000:  # 5KB 이상인 경우 청크 전송
                        print(f"🔍 [DEBUG] 대용량 문서 감지 ({content_length} 문자), 청크 전송 시작")

                        # 메타데이터 먼저 전송
                        meta_data = {
                            "action": "open_document_in_editor_chunked",
                            "document_meta": {
                                "filename": ipc_data['document']['filename'],
                                "filePath": ipc_data['document']['filePath'],
                                "source": ipc_data['document']['source'],
                                "total_chunks": (content_length // 4000) + 1,
                                "content_length": content_length
                            }
                        }
                        yield f"data: {json.dumps(meta_data, ensure_ascii=False, separators=(',', ':'))}\n\n"

                        # 콘텐츠를 청크 단위로 전송
                        chunk_size = 4000
                        for i in range(0, content_length, chunk_size):
                            chunk = document_content[i:i+chunk_size]
                            chunk_data = {
                                "action": "document_chunk",
                                "chunk_index": i // chunk_size,
                                "chunk_content": chunk,
                                "is_last": i + chunk_size >= content_length
                            }
                            yield f"data: {json.dumps(chunk_data, ensure_ascii=False, separators=(',', ':'))}\n\n"

                    else:
                        # 작은 문서는 기존 방식으로 전송
                        try:
                            json_data = json.dumps(ipc_data, ensure_ascii=False, separators=(',', ':'))
                            yield f"data: {json_data}\n\n"
                        except Exception as json_error:
                            print(f"❌ [DEBUG] JSON 직렬화 오류 (workflow_tracker): {json_error}")
                            # 대용량 콘텐츠 처리: 청크 단위로 전송
                            ipc_data['document']['content'] = f"[문서 로드 오류: {len(document_content)} 문자]"
                            yield f"data: {json.dumps(ipc_data, ensure_ascii=False, separators=(',', ':'))}\n\n"
                    print(f"📄 [chat_routes] IPC 문서 전송: {selected_document.get('filename')}")
                else:
                    print(f"🔍 [DEBUG] selected_document가 None입니다!")

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
            has_tool_execution = True  # 도구 실행 플래그 설정
            async for chunk in _handle_tool_start(event, session_id, db):
                yield chunk
        
        elif kind == "on_tool_end": # 도구 종료 이벤트
            async for chunk in _handle_tool_end(event, session_id, db):
                yield chunk
        
        elif kind == "on_end": # 스트림 종료 이벤트
            final_state = event.get("data", {}).get("output", {})
            print(f"🐛 [DEBUG] on_end event: final_state keys = {list(final_state.keys()) if final_state else 'None'}")
            if final_state and final_state.get("action"):
                print(f"🐛 [DEBUG] action found: {final_state.get('action')}")
                print(f"🐛 [DEBUG] document_selection: {final_state.get('document_selection', 'None')}")
            
            # --- 문서편집창 IPC 전송 로직 ---
            print(f"🔍 [DEBUG] on_end 이벤트 - send_to_editor 확인: {final_state.get('send_to_editor', False) if final_state else 'final_state is None'}")
            if final_state and final_state.get("send_to_editor", False):
                selected_document = final_state.get("selected_document")
                print(f"🔍 [DEBUG] selected_document 있음: {selected_document is not None}")
                if selected_document:
                    print(f"🔍 [DEBUG] 문서편집창 IPC 전송 준비: {selected_document.get('filename', 'Unknown')}")
                    # IPC 메시지 데이터 준비
                    ipc_data = {
                        "action": "open_document_in_editor",
                        "document": {
                            "filename": selected_document.get("filename", "문서"),
                            "content": selected_document.get("content", ""),
                            "filePath": selected_document.get("filePath", ""),
                            "source": selected_document.get("source", "unknown")
                        }
                    }

                    print(f"🔍 [DEBUG] IPC 데이터 전송: {ipc_data['document']['filename']}")
                    # 대용량 문서 처리: 청크 전송 방식 사용
                    document_content = ipc_data['document']['content']
                    content_length = len(document_content)

                    if content_length > 5000:  # 5KB 이상인 경우 청크 전송
                        print(f"🔍 [DEBUG] 대용량 문서 감지 ({content_length} 문자), 청크 전송 시작")

                        # 메타데이터 먼저 전송
                        meta_data = {
                            "action": "open_document_in_editor_chunked",
                            "document_meta": {
                                "filename": ipc_data['document']['filename'],
                                "filePath": ipc_data['document']['filePath'],
                                "source": ipc_data['document']['source'],
                                "total_chunks": (content_length // 4000) + 1,
                                "content_length": content_length
                            }
                        }
                        yield f"data: {json.dumps(meta_data, ensure_ascii=False, separators=(',', ':'))}\n\n"

                        # 콘텐츠를 청크 단위로 전송
                        chunk_size = 4000
                        for i in range(0, content_length, chunk_size):
                            chunk = document_content[i:i+chunk_size]
                            chunk_data = {
                                "action": "document_chunk",
                                "chunk_index": i // chunk_size,
                                "chunk_content": chunk,
                                "is_last": i + chunk_size >= content_length
                            }
                            yield f"data: {json.dumps(chunk_data, ensure_ascii=False, separators=(',', ':'))}\n\n"

                    else:
                        # 작은 문서는 기존 방식으로 전송
                        try:
                            json_data = json.dumps(ipc_data, ensure_ascii=False, separators=(',', ':'))
                            yield f"data: {json_data}\n\n"
                        except Exception as json_error:
                            print(f"❌ [DEBUG] JSON 직렬화 오류 (on_end): {json_error}")
                            # 대용량 콘텐츠 처리: 청크 단위로 전송
                            ipc_data['document']['content'] = f"[문서 로드 오류: {len(document_content)} 문자]"
                            yield f"data: {json.dumps(ipc_data, ensure_ascii=False, separators=(',', ':'))}\n\n"
                    print(f"📄 [chat_routes] IPC 문서 전송: {selected_document.get('filename')}")
                else:
                    print(f"🔍 [DEBUG] selected_document가 None입니다!")
            
            # --- NEW LOGIC FOR HANDLING SPECIAL ACTION PAYLOAD ---
            if final_state and "response" in final_state:
                try:
                    # Attempt to parse the final response as JSON
                    parsed_response = json.loads(final_state["response"])
                    if "action" in parsed_response:
                        # If it contains an "action" key, stream the whole JSON
                        try:
                            json_data = json.dumps(parsed_response, ensure_ascii=False, separators=(',', ':'))
                            yield f"data: {json_data}\n\n"
                        except Exception as json_error:
                            print(f"❌ [DEBUG] JSON 직렬화 오류 (parsed_response): {json_error}")
                            yield f"data: {{\"error\": \"대용량 응답 데이터 처리 오류\"}}\n\n"
                        # Do not process further as this is a special action
                        yield "data: [DONE]\n\n" # Stream end signal
                        return # Exit the generator
                except json.JSONDecodeError:
                    # Not a JSON action payload, continue with normal processing
                    pass
            # --- END NEW LOGIC ---

            # 문서 선택 버튼 데이터 전송 로직
            if final_state and final_state.get("action") == "show_document_buttons":
                document_selection = final_state.get("document_selection")
                print(f"🐛 [DEBUG] show_document_buttons 조건 만족, document_selection = {document_selection}")
                if document_selection:
                    # 문서 선택 버튼을 위한 특별한 메시지 전송
                    button_message = {
                        "type": "document_buttons",
                        "content": final_state.get("final_answer", "문서를 찾았습니다!"),
                        "document_selection": document_selection
                    }
                    print(f"🐛 [DEBUG] button_message 생성됨: {button_message['type']}")
                    try:
                        json_data = json.dumps(button_message, ensure_ascii=False, separators=(',', ':'))
                        yield f"data: {json_data}\n\n"
                    except Exception as json_error:
                        print(f"❌ [DEBUG] JSON 직렬화 오류 (button_message): {json_error}")
                        yield f"data: {{\"error\": \"문서 버튼 데이터 처리 오류\"}}\n\n"
                    print(f"📋 [chat_routes] 문서 선택 버튼 전송: {len(document_selection.get('documents', []))}개")
                else:
                    print(f"🐛 [DEBUG] document_selection이 None입니다!")
            else:
                print(f"🐛 [DEBUG] show_document_buttons 조건 불만족: action = {final_state.get('action') if final_state else 'final_state is None'}")

            # Extract and stream final messages from agents (existing logic)
            if final_state and "messages" in final_state:
                messages = final_state["messages"]
                for msg in messages:
                    if hasattr(msg, 'content') and msg.content and hasattr(msg, 'type'):
                        if msg.type == "ai" and msg.content:
                            content_to_stream = msg.content
                            if not content_to_stream.startswith("{}") and len(content_to_stream) > 10:
                                full_response_content += content_to_stream
                                # 문서 선택 버튼이 있는 경우 일반 콘텐츠는 스트리밍하지 않음
                                if not (final_state and final_state.get("action") == "show_document_buttons"):
                                    yield f"data: {json.dumps({'content': content_to_stream}, ensure_ascii=False)}\n\n"
            
            yield "data: [DONE]\n\n"

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
async def llm_stream(session_id: str, prompt: str, current_user: User = Depends(get_current_user), document_content: Optional[str] = None, db: Session = Depends(get_db)):
    config = generate_config(session_id) # 세션 ID로 설정 생성
    workflow_agent = RoutingAgent() # 멀티스텝 워크플로우 에이전트 인스턴스 생성

    # LLM 응답을 스트리밍 형태로 반환
    return StreamingResponse(_stream_llm_response(session_id, prompt, document_content, workflow_agent, config, db), media_type="text/event-stream")

# 문서 클릭 처리 엔드포인트
@router.post("/document/open")
async def open_document(
    request: DocumentClickRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """사용자가 문서 버튼을 클릭했을 때 문서를 로드하고 문서편집창에 전송"""
    try:
        logger.info(f"📄 [OPEN_DOCUMENT] 문서 클릭 요청 - 문서ID: {request.document_id}, 세션ID: {request.session_id}")
        print(f"📄 [open_document] 문서 클릭 요청: {request.document_id}")
        
        # 세션 권한 확인
        session = db.query(ChatSession).filter(
            ChatSession.id == request.session_id,
            ChatSession.user_id == current_user.id
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found or access denied")
        
        # 문서 데이터 추출
        doc_data = request.document_data.get("document_data", {})
        filename = doc_data.get('filename', '알 수 없는 파일')
        source = doc_data.get('source', '')
        file_path = doc_data.get('path', '')
        
        logger.info(f"📄 [OPEN_DOCUMENT] 문서 정보 - 파일명: {filename}, 소스: {source}, 경로: {file_path}")
        print(f"📄 [open_document] 문서 정보: {filename} ({source})")

        # 문서 내용 로드
        document_content = None

        if source == 'local':
            logger.debug(f"📄 [OPEN_DOCUMENT] 로컬 파일 로드 시작 - 경로: {file_path}")
            document_content = await _load_local_document(file_path)
        elif source == 's3':
            logger.debug(f"📄 [OPEN_DOCUMENT] S3 파일 로드 시작 - 키: {file_path}")
            document_content = await _load_s3_document(file_path)
        else:
            logger.error(f"📄 [OPEN_DOCUMENT] 지원하지 않는 소스: {source}")
        
        if document_content is None:
            logger.error(f"📄 [OPEN_DOCUMENT] 문서 로드 실패 - 파일명: {filename}, 소스: {source}")
            return JSONResponse(
                status_code=400,
                content={"error": f"문서 '{filename}'를 로드할 수 없습니다."}
            )
        
        # IPC 메시지 데이터 생성
        ipc_data = {
            "action": "open_document_in_editor",
            "document": {
                "filename": filename,
                "content": document_content,
                "filePath": file_path,
                "source": source
            }
        }
        
        # 클릭 완료 메시지를 채팅에 추가
        success_message = f"✅ **{filename}** 문서를 문서편집창에서 열었습니다!"
        _create_chat_message(db, request.session_id, "assistant", success_message)

        logger.info(f"📄 [OPEN_DOCUMENT] 문서 로드 완료 - 파일명: {filename}, 문서 크기: {len(document_content)} 문자")
        logger.debug(f"📄 [OPEN_DOCUMENT] IPC 데이터 생성 - 액션: {ipc_data['action']}")
        print(f"📄 [open_document] 문서 로드 완료: {filename}")

        # 성공 응답과 함께 IPC 데이터 반환
        return JSONResponse(content={
            "success": True,
            "message": success_message,
            "ipc_data": ipc_data
        })
        
    except Exception as e:
        logger.error(f"❌ [OPEN_DOCUMENT] 예외 발생 - 오류: {str(e)}", exc_info=True)
        print(f"❌ [open_document] 오류: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": f"문서 열기 중 오류가 발생했습니다: {str(e)}"}
        )

# 문서 다운로드 처리 엔드포인트
@router.post("/document/download")
async def download_document(
    request: DocumentClickRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """사용자가 지원하지 않는 파일 버튼을 클릭했을 때 다운로드 URL 제공"""
    try:
        print(f"⬇️ [download_document] 다운로드 요청: {request.document_id}")
        
        # 세션 권한 확인
        session = db.query(ChatSession).filter(
            ChatSession.id == request.session_id,
            ChatSession.user_id == current_user.id
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found or access denied")
        
        # 문서 데이터 추출
        doc_data = request.document_data.get("document_data", {})
        filename = doc_data.get('filename', '알 수 없는 파일')
        source = doc_data.get('source', '')
        file_path = doc_data.get('path', '')
        
        print(f"⬇️ [download_document] 다운로드 정보: {filename} ({source})")
        
        download_url = None
        
        if source == 'local':
            # 로컬 파일 다운로드: 임시 URL 생성 또는 파일 전송
            download_url = await _generate_local_download_url(file_path, filename)
        elif source == 's3':
            # S3 파일: presigned URL 생성
            download_url = await _generate_s3_download_url(file_path, filename)
        
        if download_url is None:
            return JSONResponse(
                status_code=400,
                content={"error": f"파일 '{filename}'의 다운로드 URL을 생성할 수 없습니다."}
            )
        
        # 성공 메시지 생성
        success_message = f"📄 '{filename}' 파일이 다운로드 준비되었습니다."
        
        # 채팅 메시지로 기록
        _create_chat_message(db, request.session_id, "assistant", success_message)
        
        print(f"⬇️ [download_document] 다운로드 준비 완료: {filename}")
        
        # 성공 응답과 함께 다운로드 URL 반환
        return JSONResponse(content={
            "success": True,
            "message": success_message,
            "download_url": download_url,
            "filename": filename
        })
        
    except Exception as e:
        print(f"❌ [download_document] 오류: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": f"파일 다운로드 중 오류가 발생했습니다: {str(e)}"}
        )

# 새 세션 생성 및 인사말 전송 엔드포인트
@router.post("/session/new-with-greeting")
async def create_new_session_with_greeting(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    로그인 시 새로운 세션을 생성하고 개인화된 인사말을 전송
    """
    try:
        # 새 세션 ID 생성
        new_session_id = f"session-{uuid.uuid4().hex[:12]}-{int(datetime.now().timestamp())}"
        
        # 새 채팅 세션 생성
        new_session = ChatSession(
            id=new_session_id,
            user_id=current_user.id,
            title="새로운 대화",
            created_at=datetime.now(timezone.utc)
        )
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        
        # 개인화된 인사말 생성
        greeting_message = GreetingService.create_initial_chat_message(current_user, db)
        
        # 인사말을 채팅 메시지로 저장
        greeting_chat_message = ChatMessage(
            session_id=new_session_id,
            role=greeting_message["role"],
            content=greeting_message["content"],
            timestamp=greeting_message["timestamp"]
        )
        db.add(greeting_chat_message)
        db.commit()
        
        print(f"🎉 [create_new_session_with_greeting] 새 세션 생성 완료: {new_session_id}")
        print(f"👋 [create_new_session_with_greeting] 인사말 전송: {current_user.username}")
        
        return {
            "success": True,
            "session": {
                "id": new_session_id,
                "title": new_session.title,
                "created_at": new_session.created_at.isoformat()
            },
            "greeting_message": {
                "role": greeting_message["role"],
                "content": greeting_message["content"],
                "timestamp": greeting_message["timestamp"].isoformat(),
                "is_greeting": greeting_message.get("is_greeting", True)
            }
        }
        
    except Exception as e:
        print(f"❌ [create_new_session_with_greeting] 오류: {e}")
        logger.error(f"새 세션 생성 중 오류 발생: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": f"새 세션 생성 중 오류가 발생했습니다: {str(e)}"}
        )

# --- 문서 로드 헬퍼 함수들 ---
async def _load_local_document(file_path: str) -> Optional[str]:
    """로컬 문서 로드"""
    try:
        from pathlib import Path
        
        path = Path(file_path)
        if not path.exists():
            logger.error(f"❌ [_LOAD_LOCAL] 파일 없음 - 경로: {file_path}")
            print(f"❌ [_load_local_document] 파일 없음: {file_path}")
            return None
        
        extension = path.suffix.lower()
        
        if extension in ['.md', '.txt', '.html']:
            # 텍스트 파일 직접 읽기
            logger.debug(f"📄 [_LOAD_LOCAL] 텍스트 파일 읽기 - 확장자: {extension}")
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            logger.info(f"📄 [_LOAD_LOCAL] 텍스트 파일 로드 성공 - 크기: {len(content)} 문자")
            return content
        elif extension == '.docx':
            # DOCX 파일 처리
            try:
                from docx import Document as DocxDocument
                doc = DocxDocument(path)
                content = '\n'.join([paragraph.text for paragraph in doc.paragraphs])
                return content
            except ImportError:
                print("❌ [_load_local_document] python-docx 라이브러리가 설치되지 않음")
                return None
        else:
            print(f"❌ [_load_local_document] 지원하지 않는 파일 형식: {extension}")
            return None
            
    except Exception as e:
        print(f"❌ [_load_local_document] 로컬 파일 읽기 오류: {e}")
        return None

async def _load_s3_document(s3_key: str) -> Optional[str]:
    """S3 문서 로드"""
    try:
        from botocore.config import Config
        
        # S3 클라이언트 설정 (엔드포인트 문제 해결)
        config = Config(
            region_name=os.getenv('AWS_REGION', 'ap-northeast-2'),
            retries={'max_attempts': 3, 'mode': 'standard'},
            s3={'addressing_style': 'virtual'}
        )
        
        s3_client = boto3.client(
            's3',
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION', 'ap-northeast-2'),
            config=config
        )
        
        bucket_name = os.getenv('AWS_S3_BUCKET', 'clickabbbucket')
        
        logger.debug(f"📄 [_LOAD_S3] S3 파일 다운로드 시작 - 버킷: {bucket_name}, 키: {s3_key}")
        print(f"📄 [_load_s3_document] S3 파일 다운로드: {s3_key}")

        response = s3_client.get_object(Bucket=bucket_name, Key=s3_key)
        content = response['Body'].read().decode('utf-8')
        logger.info(f"📄 [_LOAD_S3] S3 파일 로드 성공 - 크기: {len(content)} 문자")
        
        print(f"📄 [_load_s3_document] S3 파일 로드 성공: {len(content)} 문자")
        return content
        
    except Exception as e:
        print(f"❌ [_load_s3_document] S3 파일 읽기 오류: {e}")
        return None

# --- 다운로드 URL 생성 헬퍼 함수들 ---
async def _generate_local_download_url(file_path: str, filename: str) -> Optional[str]:
    """로컬 파일에 대한 다운로드 URL 생성"""
    try:
        from pathlib import Path
        import base64
        
        path = Path(file_path)
        if not path.exists():
            print(f"❌ [_generate_local_download_url] 파일 없음: {file_path}")
            return None
        
        # 파일을 Base64로 인코딩하여 data URL 생성
        with open(path, 'rb') as f:
            file_content = f.read()
        
        # MIME 타입 추정
        import mimetypes
        mime_type, _ = mimetypes.guess_type(filename)
        if mime_type is None:
            mime_type = 'application/octet-stream'
        
        # Base64 인코딩
        base64_content = base64.b64encode(file_content).decode('utf-8')
        
        # Data URL 생성
        data_url = f"data:{mime_type};base64,{base64_content}"
        
        print(f"✅ [_generate_local_download_url] 로컬 파일 data URL 생성 완료: {filename}")
        return data_url
        
    except Exception as e:
        print(f"❌ [_generate_local_download_url] 로컬 다운로드 URL 생성 오류: {e}")
        return None

async def _generate_s3_download_url(s3_key: str, filename: str) -> Optional[str]:
    """S3 파일에 대한 presigned URL 생성"""
    try:
        from botocore.config import Config
        
        # S3 클라이언트 설정
        config = Config(
            region_name=os.getenv('AWS_REGION', 'ap-northeast-2'),
            retries={'max_attempts': 3, 'mode': 'standard'},
            s3={'addressing_style': 'virtual'}
        )
        
        s3_client = boto3.client(
            's3',
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION', 'ap-northeast-2'),
            config=config
        )
        
        bucket_name = os.getenv('AWS_S3_BUCKET', 'clickabbbucket')
        
        # Presigned URL 생성 (1시간 유효)
        download_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': bucket_name,
                'Key': s3_key,
                'ResponseContentDisposition': f'attachment; filename="{filename}"'
            },
            ExpiresIn=3600  # 1시간
        )
        
        print(f"✅ [_generate_s3_download_url] S3 presigned URL 생성 완료: {filename}")
        return download_url
        
    except Exception as e:
        print(f"❌ [_generate_s3_download_url] S3 다운로드 URL 생성 오료: {e}")
        return None

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
