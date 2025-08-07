from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()
HOST = os.getenv("HOST")
PORT = os.getenv("PORT")
USER = os.getenv("USER")
PASS = os.getenv("PASS")
DB = os.getenv("DB")

# 데이터베이스 연결 설정    
engine = create_engine(f"mysql+pymysql://{USER}:{PASS}@{HOST}:{PORT}/{DB}")
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
    created_at = Column(DateTime, default=datetime.now)

    chat_sessions = relationship("ChatSession", back_populates="user")

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String(255), index=True)
    created_at = Column(DateTime, default=datetime.now)

    user = relationship("User", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String(255), ForeignKey("chat_sessions.id"))
    role = Column(String(50))
    content = Column(Text)
    timestamp = Column(DateTime, default=datetime.now)

    session = relationship("ChatSession", back_populates="messages")

# 테이블 생성 (데이터베이스에 테이블이 없으면 생성)
def create_db_and_tables():
    Base.metadata.create_all(engine)
