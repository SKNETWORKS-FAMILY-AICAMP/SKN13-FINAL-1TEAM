from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Generator
import json
from sqlalchemy.orm import Session

from chat_agent import agent, generate_config
from database import create_db_and_tables, SessionLocal, ChatSession, ChatMessage, User

# FastAPI 인스턴스 생성

app = FastAPI()

# CORS 미들웨어 설정
origins = [
    "http://localhost",
    "http://localhost:5173",  # 프론트엔드 개발 서버
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 데이터베이스 테이블 생성
@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# DB 세션 의존성
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Pydantic 모델 ---
class MessageSaveRequest(BaseModel):
    session_id: str
    role: str
    content: str

# --- API 엔드포인트 ---

@app.post("/chat/save")
async def save_message(request: MessageSaveRequest, db: Session = Depends(get_db)):
    """프론트엔드에서 보낸 메시지를 저장합니다."""
    # 임시 사용자 처리: user_id=1인 기본 사용자 사용
    default_user_id = 1
    user = db.query(User).filter(User.id == default_user_id).first()
    if not user:
        # 기본 사용자 생성 (임시)
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

    # 첫 사용자 메시지로 세션 제목 업데이트
    if request.role == "user" and session.title == "새로운 대화":
        session.title = request.content[:50]
        db.commit()

    return {"status": "success"}

@app.get("/chat/sessions")
async def get_chat_sessions(db: Session = Depends(get_db)):
    """저장된 모든 채팅 세션의 목록을 반환합니다."""
    # 임시 사용자 처리: user_id=1인 기본 사용자 사용
    default_user_id = 1
    sessions = db.query(ChatSession).filter(ChatSession.user_id == default_user_id).order_by(ChatSession.created_at.desc()).all()
    sessions_list = []
    for session in sessions:
        sessions_list.append({"id": session.id, "title": session.title})
    return {"sessions": sessions_list}

@app.get("/chat/messages/{session_id}")
async def get_messages(session_id: str, db: Session = Depends(get_db)):
    """특정 세션 ID의 모든 메시지를 반환합니다."""
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.timestamp).all()
    return {"messages": [{"role": msg.role, "content": msg.content} for msg in messages]}

@app.get("/llm/stream")
async def llm_stream(session_id: str, prompt: str, db: Session = Depends(get_db)):
    """LLM의 응답을 실시간 스트리밍으로 반환합니다."""
    config = generate_config(session_id)
    chat_agent = agent()

    return StreamingResponse(_stream_llm_response(session_id, prompt, chat_agent, config, db), media_type="text/event-stream")

async def _stream_llm_response(session_id: str, prompt: str, chat_agent, config, db: Session) -> Generator:
    """AI 응답을 조각내어 실시간으로 생성하는 제너레이터"""
    full_response_content = ""
    
    # 세션 ID로 전체 대화 기록을 DB에서 가져옴
    history_messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.timestamp).all()
    
    # LangGraph가 이해하는 형식으로 대화 기록을 변환
    messages = []
    for msg in history_messages:
        role = "ai" if msg.role == "assistant" else msg.role
        messages.append((role, msg.content))
    
    # 현재 프롬프트를 대화 기록에 추가 (중복 방지)
    if not messages or messages[-1] != ("user", prompt):
        messages.append(("user", prompt))

    input_data = {"messages": messages}

    # astream_events를 사용하여 각 단계를 스트리밍
    async for event in chat_agent.astream_events(input_data, config=config):
        kind = event["event"]
        if kind == "on_chat_model_stream":
            content = event["data"]["chunk"].content
            if content:
                # 생성된 콘텐츠 조각을 클라이언트로 바로 전송   
                yield f"data: {json.dumps({'content': content})}\n\n"
                full_response_content += content
                
        elif kind == "on_tool_start":
            tool_name = event.get("name", "Unknown Tool")
            tool_input = event["data"].get("input", {})
            print(f"DEBUG: on_tool_start event data: {event}") # 디버깅을 위한 print 문 추가
            thinking_message = f"[AI Thinking]: Using tool '{tool_name}' with input: {tool_input}"
            yield f"data: {json.dumps({'thinking_message': thinking_message})}\n\n"
            # DB에 role:assistant로 저장
            thinking_chat_message = ChatMessage(session_id=session_id, role="assistant", content=thinking_message)
            db.add(thinking_chat_message)
            db.commit()
            db.refresh(thinking_chat_message)

        elif kind == "on_tool_end":
            tool_output = event["data"].get("output", "")
            if tool_output:
                # 도구 사용 결과를 클라이언트로 전송
                formatted_output = f"[Tool Output]: {tool_output}"
                yield f"data: {json.dumps({'tool_message': formatted_output})}\n\n"
                # DB에 role:tool로 저장
                tool_message = ChatMessage(session_id=session_id, role="tool", content=formatted_output)
                db.add(tool_message)
                db.commit()
                db.refresh(tool_message)

    # 스트리밍이 끝나면, 완성된 AI 응답 전체를 저장
    if full_response_content:
        new_message = ChatMessage(session_id=session_id, role="assistant", content=full_response_content)
        db.add(new_message)
        db.commit()
        db.refresh(new_message)