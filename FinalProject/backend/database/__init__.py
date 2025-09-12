# database/__init__.py
"""
데이터베이스 패키지의 메인 진입점
"""

from .base import Base, now_utc
from .connection import engine, SessionLocal, get_db
from .models import *

# 테이블 생성 함수
def create_db_and_tables():
    """데이터베이스에 모든 테이블을 생성하는 함수"""
    Base.metadata.create_all(engine)

# 외부에서 자주 사용하는 것들을 쉽게 접근할 수 있도록
__all__ = [
    # 기본 클래스
    "Base",
    "now_utc",
    
    # 연결 관련
    "engine", 
    "SessionLocal", 
    "get_db",
    
    # 테이블 생성
    "create_db_and_tables",
    
    # 모든 모델들 (models/__init__.py에서 가져옴)
    "User", "RefreshToken",
    "ChatSession", "ChatMessage", "ToolMessageRecord", 
    "Calendar", "Event",
    "Document",
    "EmailTemplate",
]