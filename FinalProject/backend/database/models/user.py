# database/models/user.py
"""
사용자 관련 모델들
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from ..base import Base, now_utc


class User(Base):
    """
    사용자 정보를 관리하는 테이블
    
    시스템의 모든 사용자 정보를 저장하며, 채팅 세션, 캘린더, 문서 등의 
    소유권을 관리합니다.
    """
    __tablename__ = "users"
    
    # ✅ 1. 기본키 (항상 맨 위)
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # ✅ 2. 인증 관련 필수 컬럼 (보안 중요)  
    unique_auth_number = Column(String(100), nullable=False, unique=True, index=True, comment="사원번호")
    username = Column(String(100), nullable=False, unique=True, index=True, comment="사용자명")
    hashed_password = Column(String(255), nullable=False, comment="암호화된 비밀번호")
    
    # ✅ 3. 개인정보 컬럼
    email = Column(String(255), nullable=True, unique=True, index=True, comment="이메일 주소")
    
    # ✅ 4. 조직정보 컬럼  
    dept = Column(String(100), nullable=True, index=True, comment="부서명")
    position = Column(String(100), nullable=True, index=True, comment="직책/직급")
    
    # ✅ 5. 상태/권한 컬럼
    is_active = Column(Boolean, nullable=False, default=True, comment="계정 활성화 상태")
    is_manager = Column(Boolean, nullable=False, default=False, comment="관리자 권한 여부") 
    must_change_password = Column(Boolean, nullable=False, default=True, comment="초기 비밀번호 변경 필요")
    
    # ✅ 6. 시간 컬럼 (항상 마지막)
    created_at = Column(DateTime, nullable=False, default=now_utc, index=True, comment="계정 생성시간")
    last_login_at = Column(DateTime, nullable=True, index=True, comment="마지막 로그인시간")
    
    # 관계 정의
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")  # 사용자의 리프레시 토큰들
    chat_sessions = relationship("ChatSession", back_populates="user")     # 사용자의 채팅 세션들
    calendars = relationship("Calendar", back_populates="user", cascade="all, delete-orphan")  # 사용자의 캘린더들
    documents = relationship("Document", back_populates="owner", passive_deletes=True)         # 사용자의 문서들
    events_created = relationship("Event", back_populates="creator", foreign_keys="Event.created_by")  # 사용자가 생성한 이벤트들


class RefreshToken(Base):
    """
    사용자 리프레시 토큰을 관리하는 테이블
    
    JWT 리프레시 토큰의 생명주기를 추적하여 토큰 회전과
    재사용 탐지를 통한 보안을 강화합니다.
    """
    __tablename__ = "refresh_tokens"

    # ✅ 1. 기본키 (JWT jti와 동일)
    id = Column(String(36), primary_key=True, comment="JWT JTI (UUID)")
    
    # ✅ 2. 외래키
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True, comment="토큰 소유자")
    
    # ✅ 3. 토큰 상태 컬럼
    expires_at = Column(DateTime, nullable=False, index=True, comment="토큰 만료시간")
    revoked_at = Column(DateTime, nullable=True, index=True, comment="토큰 폐기시간 (재사용 탐지)")
    
    # ✅ 4. 시간 컬럼
    created_at = Column(DateTime, nullable=False, default=now_utc, comment="토큰 생성시간")
    
    # 관계 정의 (back_populates로 통일)
    user = relationship("User", back_populates="refresh_tokens")