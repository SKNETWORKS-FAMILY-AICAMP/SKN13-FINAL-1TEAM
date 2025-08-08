from fastapi import FastAPI, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRouter
from pydantic import BaseModel
from typing import Generator, Optional
import json

from sqlalchemy.orm import Session
from sqlalchemy import asc

from chat_agent import agent, generate_config
from database import create_db_and_tables, SessionLocal, ChatSession, ChatMessage, User

# -----------------------------
# FastAPI & CORS
# -----------------------------
app = FastAPI(title="Chat Backend", version="1.0.0")

origins = [
    "http://localhost",
    "http://localhost:5173",  # Vite dev
    "http://127.0.0.1:5173",
    "*",                      # Electron 환경 고려(필요 시 좁혀도 됨)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API v1 라우터
api = APIRouter(prefix="/api/v1")

# -----------------------------
# DB 의존성
# -----------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# -----------------------------
# Pydantic Schemas
# -----------------------------
class MessageSaveRequest(BaseModel):
    session_id: str
    role: str
    content: str
    message_id: Optional[str] = None  # 프론트 멱등키(옵션)

# -----------------------------
# Endpoints
# -----------------------------

@api.post("/chat/save")
def save_message(
    request: MessageSaveRequest,
    db: Session = Depends(get_db),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key")
):
    """
    프론트에서 보낸 메시지를 멱등하게 저장.
    """
    default_user_id = 1
    user = db.query(User).filter(User.id == default_user_id).first()
    if not user:
        user = User(
            id=default_user_id,
            unique_auth_number="default_auth",
            username="default_user",
            hashed_password="",
            email="default@example.com",
        )
        db.add(user); db.commit(); db.refresh(user)

    session = db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
    if not session:
        session = ChatSession(id=request.session_id, user_id=default_user_id, title="새로운 대화")
        db.add(session); db.commit(); db.refresh(session)

    # 멱등키 결정
    mid = request.message_id or idempotency_key
    if mid:
        exists = db.query(ChatMessage).filter(ChatMessage.message_id == mid).first()
        if exists:
            return {"status": "ok", "idempotent": True}

    new_message = ChatMessage(
        session_id=request.session_id,
        role=request.role,
        content=request.content,
        message_id=mid,
    )
    db.add(new_message); db.commit(); db.refresh(new_message)

    if request.role == "user" and session.title == "새로운 대화":
        session.title = request.content[:50]
        db.commit()

    return {"status": "success"}


@api.get("/chat/sessions")
def get_chat_sessions(page: int = 1, size: int = 30, db: Session = Depends(get_db)):
    default_user_id = 1
    q = (db.query(ChatSession)
           .filter(ChatSession.user_id == default_user_id)
           .order_by(ChatSession.created_at.desc()))
    items = q.offset((page - 1) * size).limit(size).all()
    return {"sessions": [{"id": s.id, "session_id": s.id, "title": s.title, "updated_at": s.created_at.isoformat()} for s in items]}


@api.get("/chat/messages/{session_id}")
def get_messages(session_id: str, page: int = 1, size: int = 50, db: Session = Depends(get_db)):
    q = (db.query(ChatMessage)
           .filter(ChatMessage.session_id == session_id)
           .order_by(asc(ChatMessage.timestamp), asc(ChatMessage.id)))
    items = q.offset((page - 1) * size).limit(size).all()
    return {"messages": [
        {
            "role": m.role if m.role != "assistant" else "ai",
            "content": m.content,
            "message_id": m.message_id,
            "created_at": m.timestamp.isoformat(),
        } for m in items
    ]}


@api.get("/llm/stream")
def llm_stream(session_id: str, prompt: str, db: Session = Depends(get_db)):
    """
    LLM 응답을 SSE로 스트리밍.
    """
    print(f"[DEBUG] /llm/stream called — session_id={session_id}, prompt={prompt}", flush=True)

    config = generate_config(session_id)
    chat_graph = agent()

    return StreamingResponse(
        _stream_llm_response(session_id, prompt, chat_graph, config, db),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )


async def _stream_llm_response(session_id: str, prompt: str, chat_graph, config, db: Session) -> Generator:
    """
    LangGraph 이벤트를 받아 조각 단위로 클라이언트에 전달.
    """
    full_text = ""

    # 과거 대화 로드
    history = (db.query(ChatMessage)
                 .filter(ChatMessage.session_id == session_id)
                 .order_by(asc(ChatMessage.timestamp))
                 .all())
    messages = []
    for msg in history:
        role = "ai" if msg.role == "assistant" else msg.role
        messages.append((role, msg.content))

    if not messages or messages[-1] != ("user", prompt):
        messages.append(("user", prompt))

    input_data = {"messages": messages}

    print(f"[DEBUG] Starting LLM stream — input_data={input_data}", flush=True)

    async for event in chat_graph.astream_events(input_data, config=config):
        print(f"[DEBUG] Event received: {event}", flush=True)

        kind = event["event"]
        if kind == "on_chat_model_stream":
            piece = event["data"]["chunk"].content
            if piece:
                yield f"data: {json.dumps({'content': piece})}\n\n"
                full_text += piece
        elif kind == "on_tool_start":
            tool_name = event.get("name", "Unknown Tool")
            tool_input = event["data"].get("input", {})
            thinking = f"[AI Thinking]: Using tool '{tool_name}' with input: {tool_input}"
            yield f"data: {json.dumps({'thinking_message': thinking})}\n\n"
            db.add(ChatMessage(session_id=session_id, role="assistant", content=thinking)); db.commit()
        elif kind == "on_tool_end":
            tool_output = event["data"].get("output", "")
            if tool_output:
                formatted = f"[Tool Output]: {tool_output}"
                yield f"data: {json.dumps({'tool_message': formatted})}\n\n"
                db.add(ChatMessage(session_id=session_id, role="tool", content=formatted)); db.commit()

    if full_text:
        db.add(ChatMessage(session_id=session_id, role="assistant", content=full_text))
        db.commit()

    print(f"[DEBUG] LLM stream finished — total_length={len(full_text)}", flush=True)

    yield "data: {\"done\": true}\n\n"


# 라우터 등록
app.include_router(api)
