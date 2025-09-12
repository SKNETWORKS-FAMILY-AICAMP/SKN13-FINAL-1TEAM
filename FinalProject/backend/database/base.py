# database/base.py
"""
데이터베이스 기본 설정 및 공통 유틸리티
"""
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import declarative_base
from datetime import datetime, timezone

# SQLAlchemy Base 클래스
Base = declarative_base()

# 공용 헬퍼 함수
def now_utc():
    """현재 시간을 UTC로 반환하는 헬퍼 함수"""
    return datetime.now(timezone.utc)