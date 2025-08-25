from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, Boolean, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os
from dotenv import load_dotenv

# --- 환경변수 로드 ---
load_dotenv(dotenv_path="/home/ubuntu/SKN13-FINAL-1TEAM/FinalProject/backend/.env")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT","3306")
DB_USER = os.getenv("DB_USER","root")
DB_PASS = os.getenv("DB_PASS")
DB   = os.getenv("DB","final")

# --- DB 연결 ---
engine = create_engine(
    f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB}",
    pool_pre_ping=True,
    pool_recycle=3600,
    future=True,
)
Base = declarative_base()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# --- 모델 정의 ---

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    unique_auth_number = Column(String(255), unique=True, index=True)
    username = Column(String(255), unique=True, index=True)
    hashed_password = Column(String(255))
    email = Column(String(255), unique=True, index=True)
    created_at = Column(DateTime, default=datetime.now, index=True)

    dept = Column(String(255))
    position = Column(String(255))

    chat_sessions = relationship("ChatSession", back_populates="user")
    calendars = relationship("Calendar", back_populates="user", cascade="all, delete-orphan")


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(String(255), primary_key=True, index=True)  # 프론트 session_id
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    title = Column(String(255), index=True, default="새로운 대화")
    created_at = Column(DateTime, default=datetime.now, index=True)

    user = relationship("User", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(255), ForeignKey("chat_sessions.id"), index=True)
    role = Column(String(50), index=True)  # "user" | "assistant" | "tool" | "thinking"
    content = Column(Text)
    message_id = Column(String(255), unique=True, index=True, nullable=True)
    timestamp = Column(DateTime, default=datetime.now, index=True)

    session = relationship("ChatSession", back_populates="messages")
    tool_message = relationship("ToolMessageRecord", back_populates="chat_message", uselist=False, cascade="all, delete-orphan")


class ToolMessageRecord(Base):
    __tablename__ = "tool_messages"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    chat_message_id = Column(Integer, ForeignKey("chat_messages.id"), index=True, nullable=False)

    # ToolMessage 관련 메타 정보
    tool_call_id = Column(String(255), nullable=True)
    tool_status = Column(String(50), nullable=True)
    tool_artifact = Column(JSON, nullable=True)        # artifact 구조 그대로
    tool_raw_content = Column(JSON, nullable=True)     # ToolMessage 전체 구조 저장

    chat_message = relationship("ChatMessage", back_populates="tool_message", uselist=False)


class Calendar(Base):
    __tablename__ = "calendars"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False, default="My Calendar")
    description = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    user = relationship("User", back_populates="calendars")
    events = relationship("Event", back_populates="calendar", cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    start = Column(DateTime, nullable=False)
    end = Column(DateTime, nullable=True)
    all_day = Column(Boolean, default=False)
    color = Column(String(20), nullable=True)
    calendar_id = Column(Integer, ForeignKey("calendars.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    calendar = relationship("Calendar", back_populates="events")


class Document(Base):
    __tablename__ = "documents"
    id = Column(String(255), primary_key=True, index=True) # UUID
    original_filename = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)  # "pdf", "docx", etc
    original_file_path = Column(String(512), nullable=False)
    markdown_file_path = Column(String(512), nullable=False)
    created_at = Column(DateTime, default=datetime.now, index=True)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


# --- 테이블 생성 ---
def create_db_and_tables():
    Base.metadata.create_all(engine)
