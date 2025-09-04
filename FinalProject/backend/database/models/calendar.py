# database/models/calendar.py
"""
캘린더 관련 모델들
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, CheckConstraint, UniqueConstraint, Index, Computed
from sqlalchemy.orm import relationship
from ..base import Base, now_utc


class Calendar(Base):
    """
    사용자 캘린더를 관리하는 테이블
    
    각 사용자는 여러 개의 캘린더를 가질 수 있으며, 하나의 기본 캘린더를
    지정할 수 있습니다.
    """
    __tablename__ = "calendars"
    
    # ✅ 1. 기본키
    id = Column(Integer, primary_key=True, autoincrement=True, comment="캘린더 고유 ID")
    
    # ✅ 2. 외래키
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True, comment="캘린더 소유자")
    
    # ✅ 3. 캘린더 정보 컬럼
    name = Column(String(100), nullable=False, default="My Calendar", comment="캘린더 이름")
    description = Column(Text, nullable=True, comment="캘린더 설명")
    
    # ✅ 4. 상태 컬럼
    is_default = Column(Boolean, nullable=False, default=False, comment="기본 캘린더 여부")
    
    # ✅ 5. 시간 컬럼
    created_at = Column(DateTime, nullable=False, default=now_utc, index=True, comment="캘린더 생성시간")
    updated_at = Column(DateTime, nullable=False, default=now_utc, onupdate=now_utc, comment="캘린더 수정시간")
    
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
    
    # ✅ 1. 기본키
    id = Column(Integer, primary_key=True, autoincrement=True, comment="이벤트 고유 ID")
    
    # ✅ 2. 외래키
    calendar_id = Column(Integer, ForeignKey("calendars.id", ondelete="CASCADE"), nullable=False, index=True, comment="소속 캘린더")
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True, comment="생성자 사용자")
    source_chat_message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True, comment="생성 원인 채팅 메시지")
    
    # ✅ 3. 이벤트 내용 컬럼
    title = Column(String(255), nullable=False, comment="이벤트 제목")
    description = Column(Text, nullable=True, comment="이벤트 상세 설명")
    
    # ✅ 4. 시간 관련 컬럼
    start = Column(DateTime, nullable=False, index=True, comment="시작 시간")
    end = Column(DateTime, nullable=True, comment="종료 시간")
    all_day = Column(Boolean, nullable=False, default=False, comment="종일 이벤트 여부")
    
    # ✅ 5. 표시/설정 컬럼
    color = Column(String(20), nullable=True, comment="이벤트 색상 (HEX 코드)")
    created_via = Column(String(20), nullable=False, default="user", comment="생성 경로: user/assistant/system")
    status = Column(String(20), nullable=False, default="confirmed", comment="이벤트 상태: confirmed/cancelled")
    reminder_minutes_before = Column(Integer, nullable=True, comment="알림 시간 (분 단위)")
    recurrence_rule = Column(String(500), nullable=True, comment="반복 규칙 (iCalendar RFC 5545 형식)")
    
    # ✅ 6. 시간 컬럼
    created_at = Column(DateTime, nullable=False, default=now_utc, index=True, comment="이벤트 생성시간")
    updated_at = Column(DateTime, nullable=False, default=now_utc, onupdate=now_utc, comment="이벤트 수정시간")
    
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