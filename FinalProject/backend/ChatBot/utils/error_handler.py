"""
간단한 에러 핸들링 유틸리티
복잡하지 않게, 실용적으로!
"""

import logging
import traceback
from typing import Any, Dict, Optional, Callable
from enum import Enum
from functools import wraps

logger = logging.getLogger(__name__)


class ErrorType(str, Enum):
    """에러 타입 분류"""
    LLM_ERROR = "llm_error"
    TOOL_ERROR = "tool_error"
    WORKFLOW_ERROR = "workflow_error"
    VALIDATION_ERROR = "validation_error"
    NETWORK_ERROR = "network_error"
    UNKNOWN_ERROR = "unknown_error"


class ChatBotError(Exception):
    """ChatBot 시스템 기본 예외 클래스"""
    
    def __init__(self, message: str, error_type: ErrorType = ErrorType.UNKNOWN_ERROR, details: Optional[Dict] = None):
        super().__init__(message)
        self.error_type = error_type
        self.details = details or {}
        self.message = message


def safe_execute(func: Callable, *args, fallback_value: Any = None, error_type: ErrorType = ErrorType.UNKNOWN_ERROR, **kwargs) -> Any:
    """
    함수를 안전하게 실행하고 에러 시 fallback 값 반환
    
    Args:
        func: 실행할 함수
        fallback_value: 에러 시 반환할 기본값
        error_type: 에러 타입
        *args, **kwargs: 함수에 전달할 인자들
    """
    try:
        return func(*args, **kwargs)
    except Exception as e:
        logger.error(f"Error in {func.__name__}: {str(e)}")
        logger.debug(f"Traceback: {traceback.format_exc()}")
        return fallback_value


def error_handler(error_type: ErrorType = ErrorType.UNKNOWN_ERROR, fallback_value: Any = None, log_traceback: bool = False):
    """
    데코레이터: 함수 에러를 자동으로 처리
    
    Args:
        error_type: 에러 타입
        fallback_value: 에러 시 반환할 값
        log_traceback: 스택 트레이스 로그 여부
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                logger.error(f"Error in {func.__name__}: {str(e)}")
                if log_traceback:
                    logger.debug(f"Traceback: {traceback.format_exc()}")
                return fallback_value
        return wrapper
    return decorator


def handle_llm_error(e: Exception) -> Dict[str, Any]:
    """LLM 에러 처리"""
    error_msg = str(e).lower()
    
    if "rate limit" in error_msg or "quota" in error_msg:
        return {
            "error_type": ErrorType.LLM_ERROR,
            "user_message": "서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요.",
            "retry_suggested": True,
            "retry_delay": 60
        }
    
    elif "api_key" in error_msg or "authentication" in error_msg or "invalid" in error_msg:
        return {
            "error_type": ErrorType.LLM_ERROR,
            "user_message": "인증 오류가 발생했습니다. 관리자에게 문의하세요.",
            "retry_suggested": False
        }
    
    elif "timeout" in error_msg or "connection" in error_msg:
        return {
            "error_type": ErrorType.NETWORK_ERROR,
            "user_message": "네트워크 연결에 문제가 있습니다. 다시 시도해주세요.",
            "retry_suggested": True,
            "retry_delay": 10
        }
    
    else:
        return {
            "error_type": ErrorType.LLM_ERROR,
            "user_message": "AI 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
            "retry_suggested": True
        }


def handle_tool_error(e: Exception, tool_name: str) -> Dict[str, Any]:
    """도구 실행 에러 처리"""
    return {
        "error_type": ErrorType.TOOL_ERROR,
        "user_message": f"{tool_name} 실행 중 오류가 발생했습니다: {str(e)[:100]}",
        "retry_suggested": True,
        "tool_name": tool_name
    }


def create_error_response(error: Exception, context: str = "") -> Dict[str, Any]:
    """통합 에러 응답 생성"""
    if isinstance(error, ChatBotError):
        return {
            "success": False,
            "error_type": error.error_type,
            "message": error.message,
            "details": error.details,
            "context": context
        }
    
    # 일반 예외 처리
    error_str = str(error)
    
    if any(keyword in error_str.lower() for keyword in ["rate limit", "quota", "api_key", "timeout"]):
        error_info = handle_llm_error(error)
    else:
        error_info = {
            "error_type": ErrorType.UNKNOWN_ERROR,
            "user_message": f"오류가 발생했습니다: {error_str[:100]}",
            "retry_suggested": True
        }
    
    return {
        "success": False,
        "error_type": error_info["error_type"],
        "message": error_info["user_message"],
        "retry_suggested": error_info.get("retry_suggested", False),
        "context": context
    }


# === 자주 사용하는 패턴들 ===

@error_handler(ErrorType.TOOL_ERROR, fallback_value={})
def safe_tool_execution(tool_func, *args, **kwargs):
    """도구 실행을 안전하게 처리"""
    return tool_func(*args, **kwargs)


@error_handler(ErrorType.LLM_ERROR, fallback_value="죄송합니다. 처리 중 문제가 발생했습니다.")
def safe_llm_call(llm, messages):
    """LLM 호출을 안전하게 처리"""
    response = llm.invoke(messages)
    return response.content if hasattr(response, 'content') else str(response)


def validate_required_fields(data: Dict, required_fields: list, context: str = "") -> None:
    """필수 필드 검증"""
    missing_fields = [field for field in required_fields if field not in data or not data[field]]
    
    if missing_fields:
        raise ChatBotError(
            f"필수 필드가 누락되었습니다: {', '.join(missing_fields)}",
            ErrorType.VALIDATION_ERROR,
            {"missing_fields": missing_fields, "context": context}
        )


def log_error_with_context(error: Exception, context: Dict[str, Any] = None):
    """컨텍스트와 함께 에러 로그"""
    context = context or {}
    logger.error(f"Error occurred: {str(error)}")
    logger.error(f"Context: {context}")
    logger.debug(f"Traceback: {traceback.format_exc()}")


# === 간편 함수들 ===

def is_retryable_error(error: Exception) -> bool:
    """재시도 가능한 에러인지 확인"""
    error_str = str(error).lower()
    retryable_keywords = ["timeout", "connection", "network", "rate limit", "temporary"]
    return any(keyword in error_str for keyword in retryable_keywords)


def get_user_friendly_message(error: Exception) -> str:
    """사용자 친화적인 에러 메시지 생성"""
    if isinstance(error, ChatBotError):
        return error.message
    
    error_str = str(error).lower()
    
    if "api_key" in error_str:
        return "서비스 설정에 문제가 있습니다. 관리자에게 문의하세요."
    elif "rate limit" in error_str:
        return "요청이 많아 잠시 대기가 필요합니다. 잠시 후 다시 시도해주세요."
    elif "timeout" in error_str:
        return "처리 시간이 초과되었습니다. 다시 시도해주세요."
    elif "connection" in error_str:
        return "네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인해주세요."
    else:
        return "처리 중 문제가 발생했습니다. 다시 시도해주세요."