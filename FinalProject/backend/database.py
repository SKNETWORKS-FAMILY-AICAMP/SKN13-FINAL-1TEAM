from sqlalchemy import (
    create_engine, Column, Integer, String, Text, DateTime, ForeignKey, Boolean,
    Index, UniqueConstraint, JSON, CheckConstraint, Computed
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

# --- 공용: UTC 타임스탬프 ---
def now_utc():
    """현재 시간을 UTC로 반환하는 헬퍼 함수"""
    return datetime.now(timezone.utc)

# --- 환경변수 로드 ---
load_dotenv(dotenv_path="/home/ubuntu/SKN13-FINAL-1TEAM/FinalProject/backend/.env")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS")
DB = os.getenv("DB", "FINAL")

# --- DB 연결 ---
engine = create_engine(
    f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB}?charset=utf8mb4",
    pool_pre_ping=True,
    pool_recycle=3600,
    future=True,
)
Base = declarative_base()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# --- 모델 정의 ---

class User(Base):
    """
    사용자 정보를 관리하는 테이블
    
    시스템의 모든 사용자 정보를 저장하며, 채팅 세션, 캘린더, 문서 등의 
    소유권을 관리합니다.
    """
    __tablename__ = "users"
    
    # 기본 식별자
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)  # 사용자 고유 ID
    unique_auth_number = Column(String(255), unique=True, index=True)      # 고유 인증 번호 (사번 등)
    username = Column(String(255), unique=True, index=True)                # 사용자명 (로그인 ID)
    hashed_password = Column(String(255))                                  # 암호화된 비밀번호
    email = Column(String(255), unique=True, index=True)                   # 이메일 주소
    is_manager = Column(Boolean)
    
    # 시간 정보
    created_at = Column(DateTime, default=now_utc, index=True)             # 계정 생성 시간
    
    # 조직 정보
    dept = Column(String(255), index=True)                                # 부서명
    position = Column(String(255), index=True)                            # 직책/직급
    
    # 보안/운영 필드
    is_active = Column(Boolean, default=True, nullable=False)              # 계정 활성화 상태
    must_change_password = Column(Boolean, nullable=False, server_default='1', default=True) # 초기 비밀번호 변경 필요 여부
    last_login_at = Column(DateTime, nullable=True, index=True)           # 마지막 로그인 시간
    
    # 관계 정의
    chat_sessions = relationship("ChatSession", back_populates="user")     # 사용자의 채팅 세션들
    calendars = relationship("Calendar", back_populates="user", cascade="all, delete-orphan")  # 사용자의 캘린더들
    documents = relationship("Document", back_populates="owner", passive_deletes=True)         # 사용자의 문서들
    events_created = relationship("Event", back_populates="creator", foreign_keys="Event.created_by")  # 사용자가 생성한 이벤트들

class ChatSession(Base):
    """
    채팅 세션을 관리하는 테이블
    
    사용자와 AI 간의 대화 세션을 추적하며, 각 세션은 고유한 ID를 가지고
    여러 메시지를 포함할 수 있습니다.
    """
    __tablename__ = "chat_sessions"
    
    # 기본 식별자
    id = Column(String(255), primary_key=True, index=True)                 # 세션 고유 ID (프론트엔드 session_id)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)  # 소유자 사용자 ID
    
    # 세션 정보
    title = Column(String(255), index=True, default="새로운 대화")         # 세션 제목 (첫 번째 사용자 메시지 기반)
    created_at = Column(DateTime, default=now_utc, index=True)            # 세션 생성 시간
    
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
    
    # 기본 식별자
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)  # 메시지 고유 ID
    session_id = Column(String(255), ForeignKey("chat_sessions.id"), index=True)  # 소속 세션 ID
    
    # 메시지 내용
    role = Column(String(50), index=True)                                 # 메시지 역할: "user" | "assistant" | "tool" | "thinking"
    content = Column(Text)                                                # 메시지 내용 (텍스트)
    message_id = Column(String(255), unique=True, index=True, nullable=True)  # 외부 시스템 메시지 ID
    
    # 시간 정보
    timestamp = Column(DateTime, default=now_utc, index=True)             # 메시지 생성 시간
    
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
    
    # 기본 식별자
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)  # 도구 메시지 고유 ID
    chat_message_id = Column(Integer, ForeignKey("chat_messages.id"), index=True, nullable=False)  # 연결된 채팅 메시지 ID
    
    # 도구 실행 메타데이터
    tool_call_id = Column(String(255), nullable=True)                     # 도구 호출 고유 ID
    tool_status = Column(String(50), nullable=True)                       # 도구 실행 상태 (success, error, pending 등)
    tool_artifact = Column(JSON, nullable=True)                           # 도구 실행 결과물 (파일 경로, URL 등)
    tool_raw_content = Column(JSON, nullable=True)                        # 도구 실행 원시 데이터
    
    # 관계 정의
    chat_message = relationship("ChatMessage", back_populates="tool_message", uselist=False)  # 연결된 채팅 메시지

class Calendar(Base):
    """
    사용자 캘린더를 관리하는 테이블
    
    각 사용자는 여러 개의 캘린더를 가질 수 있으며, 하나의 기본 캘린더를
    지정할 수 있습니다.
    """
    __tablename__ = "calendars"
    
    # 기본 식별자
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)  # 캘린더 고유 ID
    name = Column(String(255), nullable=False, default="My Calendar")      # 캘린더 이름
    description = Column(Text, nullable=True)                              # 캘린더 설명
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)      # 소유자 사용자 ID
    
    # 캘린더 설정
    is_default = Column(Boolean, default=False, nullable=False)            # 기본 캘린더 여부 (사용자당 1개만 가능)
    
    # 관계 정의
    user = relationship("User", back_populates="calendars")                # 캘린더 소유자
    events = relationship("Event", back_populates="calendar", cascade="all, delete-orphan")  # 캘린더의 이벤트들
    
    # 제약 조건 (사용자별 이름 유니크 + 사용자당 기본 캘린더 1개)
    default_owner_for_unique = Column(
        Integer,
        Computed("CASE WHEN is_default THEN user_id ELSE NULL END", persisted=True)  # 기본 캘린더 소유자 식별용
    )
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_calendars_user_name"),           # 사용자별 캘린더 이름 유니크
        UniqueConstraint("default_owner_for_unique", name="uq_one_default_calendar_per_user"),  # 사용자당 기본 캘린더 1개
    )

class Event(Base):
    """
    캘린더 이벤트를 관리하는 테이블
    
    사용자의 일정, 미팅, 할 일 등을 저장하며, 시작/종료 시간,
    반복 규칙, 알림 설정 등을 관리합니다.
    """
    __tablename__ = "events"
    
    # 기본 식별자
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)  # 이벤트 고유 ID
    
    # 이벤트 내용
    title = Column(String(255), nullable=False)                            # 이벤트 제목
    description = Column(Text, nullable=True)                              # 이벤트 상세 설명
    
    # 시간 정보
    start = Column(DateTime, nullable=False)                               # 시작 시간
    end = Column(DateTime, nullable=True)                                  # 종료 시간 (null이면 시작 시간과 동일)
    all_day = Column(Boolean, default=False)                              # 종일 이벤트 여부
    
    # 표시 설정
    color = Column(String(20), nullable=True)                             # 이벤트 색상 (HEX 코드)
    calendar_id = Column(Integer, ForeignKey("calendars.id"), nullable=False)  # 소속 캘린더 ID
    
    # 시간 정보
    created_at = Column(DateTime, default=now_utc)                        # 이벤트 생성 시간
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)      # 이벤트 수정 시간
    
    # 생성 주체/경로 추적
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # 생성자 사용자 ID
    created_via = Column(String(20), nullable=False, default="user")       # 생성 경로: "user" | "assistant" | "system"
    source_chat_message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)  # 생성 원인 채팅 메시지 ID
    
    # 이벤트 설정
    status = Column(String(20), nullable=False, default="confirmed")       # 이벤트 상태: "confirmed" | "cancelled"
    reminder_minutes_before = Column(Integer, nullable=True)               # 알림 시간 (분 단위, 시작 전)
    recurrence_rule = Column(String(255), nullable=True)                   # 반복 규칙 (iCalendar RFC 5545 형식)
    
    # 관계 정의
    calendar = relationship("Calendar", back_populates="events")            # 소속 캘린더
    creator = relationship("User", back_populates="events_created", foreign_keys=[created_by], passive_deletes=True)  # 생성자
    source_message = relationship("ChatMessage", foreign_keys=[source_chat_message_id], passive_deletes=True)  # 생성 원인 메시지
    
    # 제약 조건 및 인덱스
    __table_args__ = (
        Index("idx_events_cal_start", "calendar_id", "start"),            # 캘린더별 시작 시간 인덱스
        Index("idx_events_creator_start", "created_by", "start"),          # 생성자별 시작 시간 인덱스
        CheckConstraint("(`end` IS NULL) OR (`end` >= `start`)", name="ck_event_time_range"),  # 시간 범위 유효성 검사
    )

class Document(Base):
    """
    사용자 문서를 관리하는 테이블
    
    업로드된 문서 파일들의 메타데이터를 저장하며, 원본 파일과
    마크다운 변환 파일의 경로를 관리합니다.
    """
    __tablename__ = "documents"
    
    # 기본 식별자
    id = Column(String(255), primary_key=True, index=True)                 # 문서 고유 ID (UUID)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # 소유자 사용자 ID
    
    # 파일 정보
    original_filename = Column(String(255), nullable=False)                # 원본 파일명
    file_type = Column(String(50), nullable=False)                        # 파일 형식 (pdf, docx, hwp 등)
    original_file_path = Column(String(512), nullable=False)               # 원본 파일 저장 경로
    markdown_file_path = Column(String(512), nullable=False)               # 마크다운 변환 파일 경로
    
    # 벡터DB 인덱싱 정보
    indexed_at = Column(DateTime, nullable=True)                           # 벡터DB 인덱싱 완료 시간
    indexed_hash = Column(String(64), nullable=True)                      # 파일 내용 해시값 (변경 감지용)
    vector_namespace = Column(String(200), nullable=True)                  # 벡터DB 네임스페이스
    
    # 시간 정보
    created_at = Column(DateTime, default=now_utc, index=True)            # 문서 업로드 시간
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)      # 문서 수정 시간
    
    # 관계 정의
    owner = relationship("User", back_populates="documents", passive_deletes=True)  # 문서 소유자
    
    # 인덱스
    __table_args__ = (
        Index("idx_documents_owner_created", "owner_id", "created_at"),    # 소유자별 생성 시간 인덱스
    )

class EmailTemplate(Base):
    """
    이메일 템플릿을 관리하는 테이블
    
    시스템에서 사용하는 이메일 발송을 위한 템플릿들을 저장하며,
    제목과 본문에 변수를 포함할 수 있습니다.
    """
    __tablename__ = "email_templates"
    
    # 기본 식별자
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)  # 템플릿 고유 ID
    
    # 템플릿 내용
    name = Column(String(160), unique=True, index=True, nullable=False)    # 템플릿 이름 (고유)
    subject_tpl = Column(Text, nullable=False)                             # 이메일 제목 템플릿 (예: "[{project}] 주간 보고서")
    body_tpl = Column(Text, nullable=False)                                # 이메일 본문 템플릿 (예: "안녕하세요 {owner}님, ...")
    sample_vars_json = Column(JSON, nullable=True)                         # 샘플 변수 데이터 (예: {"project":"CLIKCA","owner":"홍길동"})
    
    # 시간 정보
    created_at = Column(DateTime, default=now_utc, index=True)            # 템플릿 생성 시간
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)      # 템플릿 수정 시간

# --- 테이블 생성 ---
def create_db_and_tables():
    """데이터베이스에 모든 테이블을 생성하는 함수"""
    Base.metadata.create_all(engine)
    
# DB 세션 의존성
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()