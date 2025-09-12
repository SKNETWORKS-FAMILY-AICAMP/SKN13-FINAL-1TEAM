# database/models/__init__.py
"""
모든 데이터베이스 모델을 하나의 지점에서 import
"""

# 모든 모델을 import (순서 중요: 외래키 의존성 고려)
from .user import User, RefreshToken
from .chat import ChatSession, ChatMessage, ToolMessageRecord  
from .calendar import Calendar, Event
from .document import Document
from .system import EmailTemplate

# 외부에서 쉽게 사용할 수 있도록 __all__ 정의
__all__ = [
    # 사용자 관련
    "User",
    "RefreshToken",
    
    # 채팅 관련  
    "ChatSession", 
    "ChatMessage", 
    "ToolMessageRecord",
    
    # 캘린더 관련
    "Calendar", 
    "Event",
    
    # 문서 관련
    "Document",
    
    # 시스템 관련
    "EmailTemplate",
]