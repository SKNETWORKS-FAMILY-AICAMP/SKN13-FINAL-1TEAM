from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()
HOST = os.getenv("HOST","192.168.0.12")
PORT = os.getenv("PORT","3306")
USER = os.getenv("USER","root")
PASS = os.getenv("PASS",r"%clicka1234")
DB   = os.getenv("DB","final")

# MySQL 연결 (pymysql 드라이버 사용)
# 예: mysql+pymysql://user:pass@localhost:3306/dbname
engine = create_engine(
    f"mysql+pymysql://{USER}:{PASS}@{HOST}:{PORT}/{DB}",
    pool_pre_ping=True,
    pool_recycle=3600,
    future=True,  # 기존 코드 스타일 유지
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

    chat_sessions = relationship("ChatSession", back_populates="user")


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String(255), primary_key=True, index=True)  # 프론트의 session_id와 동일
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
    # ✅ 멱등 키(프론트에서 보내는 messageId). 중복 저장 방지용
    message_id = Column(String(255), unique=True, index=True, nullable=True)
    # 프론트에 created_at로 내려줄 값
    timestamp = Column(DateTime, default=datetime.now, index=True)

    session = relationship("ChatSession", back_populates="messages")


# 테이블 생성 (데이터베이스에 테이블이 없으면 생성)
def create_db_and_tables():
    Base.metadata.create_all(engine)
