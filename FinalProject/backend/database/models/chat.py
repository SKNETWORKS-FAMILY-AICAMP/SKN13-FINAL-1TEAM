# database/models/chat.py
"""
채팅 관련 모델들
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON, Index
from sqlalchemy.orm import relationship
from ..base import Base, now_utc


class ChatSession(Base):
    """
    채팅 세션을 관리하는 테이블
    
    사용자와 AI 간의 대화 세션을 추적하며, 각 세션은 고유한 ID를 가지고
    여러 메시지를 포함할 수 있습니다.
    """
    __tablename__ = "chat_sessions"
    
    # ✅ 1. 기본키
    id = Column(String(100), primary_key=True, comment="세션 고유 ID")
    
    # ✅ 2. 외래키
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True, comment="세션 소유자")
    
    # ✅ 3. 세션 정보 컬럼
    title = Column(String(200), nullable=False, default="새로운 대화", comment="세션 제목")
    
    # ✅ 4. 상태 컬럼
    is_deleted = Column(Boolean, nullable=False, default=False, comment="소프트 삭제 여부")
    
    # ✅ 5. 시간 컬럼
    created_at = Column(DateTime, nullable=False, default=now_utc, index=True, comment="세션 생성시간")
    
    # 관계 정의
    user = relationship("User", back_populates="chat_sessions", passive_deletes=True)  # 세션 소유자
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")  # 세션의 메시지들


class ChatMessage(Base):
    """
    채팅 메시지를 저장하는 테이블
    
    사용자와 AI 간의 모든 대화 내용을 저장하며, 메시지 타입, 내용, 
    시간 등을 추적합니다.
    """
    __tablename__ = "chat_messages"
    
    # ✅ 1. 기본키
    id = Column(Integer, primary_key=True, autoincrement=True, comment="메시지 고유 ID")
    
    # ✅ 2. 외래키
    session_id = Column(String(100), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True, comment="소속 세션 ID")
    
    # ✅ 3. 메시지 내용 컬럼
    role = Column(String(20), nullable=False, index=True, comment="메시지 역할: user/assistant/tool/thinking")
    content = Column(Text, nullable=False, comment="메시지 내용")
    message_id = Column(String(100), nullable=True, unique=True, index=True, comment="외부 시스템 메시지 ID (멱등성용)")
    
    # ✅ 4. 시간 컬럼  
    timestamp = Column(DateTime, nullable=False, default=now_utc, index=True, comment="메시지 생성시간")
    
    # 관계 정의
    session = relationship("ChatSession", back_populates="messages")       # 소속 세션
    tool_message = relationship("ToolMessageRecord", back_populates="chat_message", uselist=False, cascade="all, delete-orphan")  # 도구 실행 결과
    
    # 복합 인덱스 (세션별 시간순 조회 최적화)
    __table_args__ = (
        Index("idx_cm_session_time", "session_id", "timestamp"),
    )


class ToolMessageRecord(Base):
    """
    도구 실행 결과를 기록하는 테이블
    
    AI가 사용한 도구들의 실행 결과와 메타데이터를 저장하여
    도구 사용 이력을 추적합니다.
    """
    __tablename__ = "tool_messages"
    
    # ✅ 1. 기본키
    id = Column(Integer, primary_key=True, autoincrement=True, comment="도구 메시지 고유 ID")
    
    # ✅ 2. 외래키
    chat_message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False, index=True, comment="연결된 채팅 메시지")
    
    # ✅ 3. 도구 실행 메타데이터 컬럼
    tool_call_id = Column(String(100), nullable=True, comment="도구 호출 고유 ID")
    tool_status = Column(String(20), nullable=True, comment="실행 상태: success/error/pending")
    tool_artifact = Column(JSON, nullable=True, comment="실행 결과물 (파일경로, URL 등)")
    tool_raw_content = Column(JSON, nullable=True, comment="원시 실행 데이터")
    
    # 관계 정의
    chat_message = relationship("ChatMessage", back_populates="tool_message", uselist=False)  # 연결된 채팅 메시지