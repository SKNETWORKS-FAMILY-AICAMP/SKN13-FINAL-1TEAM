# database/models/system.py
"""
시스템 관련 모델들
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, func
from sqlalchemy.orm import relationship
from ..base import Base, now_utc


class EmailTemplate(Base):
    """
    이메일 템플릿을 관리하는 테이블
    
    시스템에서 사용하는 이메일 발송을 위한 템플릿들을 저장하며,
    제목과 본문에 변수를 포함할 수 있습니다.
    """
    __tablename__ = "email_templates"
    
    # ✅ 1. 기본키
    id = Column(Integer, primary_key=True, autoincrement=True, comment="템플릿 고유 ID")
    
    # ✅ 2. 템플릿 내용 컬럼
    name = Column(String(100), nullable=False, unique=True, index=True, comment="템플릿 이름 (고유)")
    subject_tpl = Column(Text, nullable=False, comment="이메일 제목 템플릿")
    body_tpl = Column(Text, nullable=False, comment="이메일 본문 템플릿")
    sample_vars_json = Column(JSON, nullable=True, comment="샘플 변수 데이터")
    
    # ✅ 3. 시간 컬럼
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True, comment="템플릿 생성시간")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), comment="템플릿 수정시간")