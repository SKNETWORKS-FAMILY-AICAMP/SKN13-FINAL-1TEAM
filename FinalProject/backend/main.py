from fastapi import FastAPI, Depends, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Generator, Optional
import json
from sqlalchemy.orm import Session
from datetime import datetime

from .RoutingAgent import RoutingAgent, generate_config
from .database import create_db_and_tables, SessionLocal, ChatSession, ChatMessage, User, Calendar, Event

# FastAPI 인스턴스 생성
app = FastAPI()

# API 라우터 생성
api_router = APIRouter()

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

def _create_chat_message(db: Session, session_id: str, role: str, content: str):
    """DB에 메시지를 저장하고 반환"""
    message = ChatMessage(session_id=session_id, role=role, content=content)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message

async def _handle_tool_start(event: dict, session_id: str, db: Session):
    """툴 시작 이벤트 처리"""
    tool_name = event.get("name", "Unknown Tool")
    tool_input = event["data"].get("input", {})
    print(f"DEBUG: on_tool_start event data: {event}")
    
    thinking_message = f"[AI Thinking]: Using tool '{tool_name}' with input: {tool_input}"
    yield f"data: {json.dumps({'thinking_message': thinking_message})}\n\n"
    
    _create_chat_message(db, session_id, "assistant", thinking_message)

async def _handle_tool_end(event: dict, session_id: str, db: Session):
    """툴 종료 이벤트 처리 및 결과 저장"""
    raw_output = event["data"].get("output", "")
    
    if isinstance(raw_output, dict):
        tool_output = raw_output.get("content", str(raw_output))
    else:
        tool_output = str(raw_output)

    formatted_output = f"[Tool Output]: {tool_output}"
    yield f"data: {json.dumps({'tool_message': formatted_output})}\n\n"
    
    _create_chat_message(db, session_id, "tool", formatted_output)


# --- Pydantic 모델 ---
class MessageSaveRequest(BaseModel):
    session_id: str
    role: str
    content: str

# --- Calendar Event Pydantic Models ---
class EventBase(BaseModel):
    title: str
    description: Optional[str] = None
    start: datetime
    end: Optional[datetime] = None
    all_day: bool = False
    color: Optional[str] = None

class EventCreate(EventBase):
    pass

class EventUpdate(EventBase):
    pass

class EventInDB(EventBase):
    id: int
    calendar_id: int

    class Config:
        orm_mode = True

class EventOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    start: str
    end: Optional[str] = None
    allDay: bool
    color: Optional[str] = None

# --- API 엔드포인트 ---

# Helper function to get or create a default calendar for a user
def get_or_create_default_calendar(db: Session, user_id: int) -> Calendar:
    calendar = db.query(Calendar).filter(Calendar.user_id == user_id).first()
    if not calendar:
        calendar = Calendar(user_id=user_id, name="My Calendar")
        db.add(calendar)
        db.commit()
        db.refresh(calendar)
    return calendar

@api_router.post("/events", response_model=EventOut)
def create_event(event: EventCreate, db: Session = Depends(get_db)):
    """
    새로운 일정을 생성합니다.
    """
    default_user_id = 1  # 임시 사용자
    calendar = get_or_create_default_calendar(db, default_user_id)
    
    db_event = Event(
        **event.dict(),
        calendar_id=calendar.id
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    
    return EventOut(
        id=db_event.id,
        title=db_event.title,
        description=db_event.description,
        start=db_event.start.isoformat(),
        end=db_event.end.isoformat() if db_event.end else None,
        allDay=db_event.all_day,
        color=db_event.color
    )

@api_router.get("/events", response_model=List[EventOut])
def get_events(start: datetime, end: datetime, db: Session = Depends(get_db)):
    """
    특정 기간 내의 모든 일정을 조회합니다. (FullCalendar 연동용)
    """
    default_user_id = 1 # 임시 사용자
    
    calendar = get_or_create_default_calendar(db, default_user_id)
    
    events = db.query(Event).filter(
        Event.calendar_id == calendar.id,
        Event.start < end,
        Event.end > start
    ).all()
    
    return [
        EventOut(
            id=e.id,
            title=e.title,
            description=e.description,
            start=e.start.isoformat(),
            end=e.end.isoformat() if e.end else None,
            allDay=e.all_day,
            color=e.color
        ) for e in events
    ]

@api_router.put("/events/{event_id}", response_model=EventOut)
def update_event(event_id: int, event: EventUpdate, db: Session = Depends(get_db)):
    """
    기존 일정을 업데이트합니다.
    """
    db_event = db.query(Event).filter(Event.id == event_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")

    default_user_id = 1
    if db_event.calendar.user_id != default_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this event")

    for key, value in event.dict().items():
        setattr(db_event, key, value)
    
    db.commit()
    db.refresh(db_event)

    return EventOut(
        id=db_event.id,
        title=db_event.title,
        description=db_event.description,
        start=db_event.start.isoformat(),
        end=db_event.end.isoformat() if db_event.end else None,
        allDay=db_event.all_day,
        color=db_event.color
    )

@api_router.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: int, db: Session = Depends(get_db)):
    """
    일정을 삭제합니다.
    """
    db_event = db.query(Event).filter(Event.id == event_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")

    default_user_id = 1
    if db_event.calendar.user_id != default_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this event")

    db.delete(db_event)
    db.commit()
    return

@api_router.post("/chat/save")
async def save_message(request: MessageSaveRequest, db: Session = Depends(get_db)):
    """프론트엔드에서 보낸 메시지를 저장합니다."""
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

@api_router.get("/chat/sessions")
async def get_chat_sessions(db: Session = Depends(get_db)):
    """저장된 모든 채팅 세션의 목록을 반환합니다."""
    default_user_id = 1
    sessions = db.query(ChatSession).filter(ChatSession.user_id == default_user_id).order_by(ChatSession.created_at.desc()).all()
    sessions_list = []
    for session in sessions:
        sessions_list.append({"id": session.id, "title": session.title})
    return {"sessions": sessions_list}

@api_router.get("/chat/messages/{session_id}")
async def get_messages(session_id: str, db: Session = Depends(get_db)):
    """특정 세션 ID의 모든 메시지를 반환합니다."""
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.timestamp).all()
    return {"messages": [{"role": msg.role, "content": msg.content} for msg in messages]}

@api_router.get("/llm/stream")
async def llm_stream(session_id: str, prompt: str, db: Session = Depends(get_db)):
    """LLM의 응답을 실시간 스트리밍으로 반환합니다."""
    config = generate_config(session_id)
    chat_agent = RoutingAgent()

    return StreamingResponse(_stream_llm_response(session_id, prompt, chat_agent, config, db), media_type="text/event-stream")

async def _stream_llm_response(session_id: str, prompt: str, chat_agent, config, db: Session) -> Generator:
    """AI 응답을 조각내어 실시간으로 생성하는 제너레이터"""
    full_response_content = ""
    
    history_messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.timestamp).all()
    
    messages = []
    for msg in history_messages:
        if msg.role == "tool":
            continue
        role = "ai" if msg.role == "assistant" else msg.role
        messages.append((role, msg.content))
    
    if not messages or messages[-1] != ("user", prompt):
        messages.append(("user", prompt))

    input_data = {"messages": messages}

    async for event in chat_agent.astream_events(input_data, config=config):
        kind = event["event"]
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

    if full_response_content:
        new_message = ChatMessage(session_id=session_id, role="assistant", content=full_response_content)
        db.add(new_message)
        db.commit()
        db.refresh(new_message)
        
    yield "data: [DONE]\n\n"

@api_router.get("/open")
async def open_document(url):
    pass


# API 라우터를 앱에 포함
app.include_router(api_router, prefix="/api/v1")
