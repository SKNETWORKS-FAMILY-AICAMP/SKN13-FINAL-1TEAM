"""
Central configuration management for ChatBot system
하드코딩된 값들을 체계적으로 관리
"""

import os
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class LogLevel(str, Enum):
    """로그 레벨 열거형"""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class ModelProvider(str, Enum):
    """LLM 제공자 열거형"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    AZURE_OPENAI = "azure_openai"


@dataclass
class LLMConfig:
    """LLM 설정 구성"""
    provider: ModelProvider
    model_name: str
    temperature: float
    max_tokens: Optional[int] = None
    timeout: int = 120
    retry_attempts: int = 3
    api_key: Optional[str] = None
    base_url: Optional[str] = None


@dataclass 
class WorkflowConfig:
    """워크플로우 설정 구성"""
    recursion_limit: int
    timeout_seconds: int
    enable_checkpointing: bool
    checkpoint_storage_path: Optional[str] = None


@dataclass
class EditorConfig:
    """편집기 설정 구성"""
    default_style_theme: str
    default_color_scheme: str
    enable_ai_completion: bool
    max_completion_tokens: int


@dataclass
class SearchConfig:
    """검색 설정 구성"""
    vector_store_type: str
    embedding_model: str
    chunk_size: int
    chunk_overlap: int
    max_search_results: int


class ChatBotSettings:
    """
    중앙집중식 설정 관리 클래스
    환경변수와 기본값을 체계적으로 관리
    """
    
    def __init__(self):
        self._load_settings()
    
    def _load_settings(self):
        """환경변수에서 설정을 로드하고 기본값 적용"""
        
        # === LLM 설정 ===
        self.llm_configs = {
            "main": LLMConfig(
                provider=ModelProvider(os.getenv("LLM_PROVIDER", "openai")),
                model_name=os.getenv("LLM_MODEL_NAME", "gpt-4o"),
                temperature=float(os.getenv("LLM_TEMPERATURE", "0")),
                max_tokens=self._get_optional_int("LLM_MAX_TOKENS"),
                timeout=int(os.getenv("LLM_TIMEOUT", "120")),
                retry_attempts=int(os.getenv("LLM_RETRY_ATTEMPTS", "3")),
                api_key=os.getenv("OPENAI_API_KEY")
            ),
            "routing": LLMConfig(
                provider=ModelProvider(os.getenv("ROUTING_LLM_PROVIDER", "openai")),
                model_name=os.getenv("ROUTING_LLM_MODEL", "gpt-4o"),
                temperature=float(os.getenv("ROUTING_LLM_TEMPERATURE", "0")),
                timeout=int(os.getenv("ROUTING_LLM_TIMEOUT", "60")),
                retry_attempts=int(os.getenv("ROUTING_LLM_RETRY_ATTEMPTS", "2")),
                api_key=os.getenv("OPENAI_API_KEY")
            ),
            "completion": LLMConfig(
                provider=ModelProvider(os.getenv("COMPLETION_LLM_PROVIDER", "openai")),
                model_name=os.getenv("COMPLETION_LLM_MODEL", "gpt-4o-mini"),
                temperature=float(os.getenv("COMPLETION_LLM_TEMPERATURE", "0.3")),
                max_tokens=int(os.getenv("COMPLETION_LLM_MAX_TOKENS", "1000")),
                timeout=int(os.getenv("COMPLETION_LLM_TIMEOUT", "90")),
                retry_attempts=int(os.getenv("COMPLETION_LLM_RETRY_ATTEMPTS", "2")),
                api_key=os.getenv("OPENAI_API_KEY")
            )
        }
        
        # === 워크플로우 설정 ===
        self.workflow = WorkflowConfig(
            recursion_limit=int(os.getenv("WORKFLOW_RECURSION_LIMIT", "50")),
            timeout_seconds=int(os.getenv("WORKFLOW_TIMEOUT", "300")),
            enable_checkpointing=os.getenv("WORKFLOW_ENABLE_CHECKPOINTING", "true").lower() == "true",
            checkpoint_storage_path=os.getenv("WORKFLOW_CHECKPOINT_PATH")
        )
        
        # === 편집기 설정 ===
        self.editor = EditorConfig(
            default_style_theme=os.getenv("EDITOR_DEFAULT_THEME", "professional"),
            default_color_scheme=os.getenv("EDITOR_DEFAULT_COLORS", "default"),
            enable_ai_completion=os.getenv("EDITOR_ENABLE_AI_COMPLETION", "true").lower() == "true",
            max_completion_tokens=int(os.getenv("EDITOR_MAX_COMPLETION_TOKENS", "800"))
        )
        
        # === 검색 설정 ===
        self.search = SearchConfig(
            vector_store_type=os.getenv("SEARCH_VECTOR_STORE", "chroma"),
            embedding_model=os.getenv("SEARCH_EMBEDDING_MODEL", "text-embedding-ada-002"),
            chunk_size=int(os.getenv("SEARCH_CHUNK_SIZE", "1000")),
            chunk_overlap=int(os.getenv("SEARCH_CHUNK_OVERLAP", "200")),
            max_search_results=int(os.getenv("SEARCH_MAX_RESULTS", "5"))
        )
        
        # === 로깅 설정 ===
        self.logging = {
            "level": LogLevel(os.getenv("LOG_LEVEL", "INFO")),
            "format": os.getenv("LOG_FORMAT", "%(asctime)s - %(name)s - %(levelname)s - %(message)s"),
            "file_path": os.getenv("LOG_FILE_PATH"),
            "max_file_size": int(os.getenv("LOG_MAX_FILE_SIZE", "10485760")),  # 10MB
            "backup_count": int(os.getenv("LOG_BACKUP_COUNT", "5"))
        }
        
        # === 개발/운영 환경 설정 ===
        self.environment = {
            "env": os.getenv("ENVIRONMENT", "development"),
            "debug": os.getenv("DEBUG", "false").lower() == "true",
            "enable_metrics": os.getenv("ENABLE_METRICS", "false").lower() == "true",
            "cors_origins": self._parse_list(os.getenv("CORS_ORIGINS", "*")),
            "rate_limiting": {
                "enabled": os.getenv("RATE_LIMITING_ENABLED", "true").lower() == "true",
                "requests_per_minute": int(os.getenv("RATE_LIMIT_RPM", "60"))
            }
        }
        
        # === 보안 설정 ===
        self.security = {
            "enable_api_key_auth": os.getenv("ENABLE_API_KEY_AUTH", "false").lower() == "true",
            "api_key_header": os.getenv("API_KEY_HEADER", "X-API-Key"),
            "allowed_api_keys": self._parse_list(os.getenv("ALLOWED_API_KEYS", "")),
            "enable_request_validation": os.getenv("ENABLE_REQUEST_VALIDATION", "true").lower() == "true"
        }
        
        logger.info(f"Settings loaded for environment: {self.environment['env']}")
    
    def _get_optional_int(self, env_var: str) -> Optional[int]:
        """환경변수에서 선택적 정수 값 가져오기"""
        value = os.getenv(env_var)
        return int(value) if value else None
    
    def _parse_list(self, value: str) -> List[str]:
        """콤마 구분 문자열을 리스트로 변환"""
        if not value:
            return []
        return [item.strip() for item in value.split(",") if item.strip()]
    
    def get_llm_config(self, config_name: str = "main") -> LLMConfig:
        """특정 LLM 설정 가져오기"""
        if config_name not in self.llm_configs:
            logger.warning(f"Unknown LLM config: {config_name}, using 'main'")
            config_name = "main"
        return self.llm_configs[config_name]
    
    def is_development(self) -> bool:
        """개발 환경인지 확인"""
        return self.environment["env"] == "development"
    
    def is_production(self) -> bool:
        """운영 환경인지 확인"""
        return self.environment["env"] == "production"
    
    def get_setting(self, key: str, default: Any = None) -> Any:
        """점 표기법으로 중첩된 설정 값 가져오기 (예: 'llm.main.temperature')"""
        keys = key.split(".")
        current = self.__dict__
        
        try:
            for k in keys:
                if hasattr(current, k):
                    current = getattr(current, k)
                elif isinstance(current, dict) and k in current:
                    current = current[k]
                else:
                    return default
            return current
        except (KeyError, AttributeError):
            return default
    
    def validate_settings(self) -> List[str]:
        """설정 유효성 검증, 문제점 리스트 반환"""
        issues = []
        
        # API 키 검증
        if not self.llm_configs["main"].api_key:
            issues.append("OPENAI_API_KEY environment variable is required")
        
        # 워크플로우 설정 검증
        if self.workflow.recursion_limit <= 0:
            issues.append("WORKFLOW_RECURSION_LIMIT must be positive")
        
        if self.workflow.timeout_seconds <= 0:
            issues.append("WORKFLOW_TIMEOUT must be positive")
        
        # 검색 설정 검증
        if self.search.chunk_size <= 0:
            issues.append("SEARCH_CHUNK_SIZE must be positive")
        
        if self.search.chunk_overlap >= self.search.chunk_size:
            issues.append("SEARCH_CHUNK_OVERLAP must be less than SEARCH_CHUNK_SIZE")
        
        return issues
    
    def to_dict(self) -> Dict[str, Any]:
        """설정을 딕셔너리로 변환 (로깅/디버깅용)"""
        return {
            "llm_configs": {k: v.__dict__ for k, v in self.llm_configs.items()},
            "workflow": self.workflow.__dict__,
            "editor": self.editor.__dict__,
            "search": self.search.__dict__,
            "logging": self.logging,
            "environment": self.environment,
            "security": {k: v if k != "allowed_api_keys" else ["***"] for k, v in self.security.items()}
        }


# === 전역 설정 인스턴스 ===
settings = ChatBotSettings()

# === 편의 함수들 ===
def get_llm_config(config_name: str = "main") -> LLMConfig:
    """LLM 설정 가져오기"""
    return settings.get_llm_config(config_name)

def is_development() -> bool:
    """개발 환경 확인"""
    return settings.is_development()

def is_production() -> bool:
    """운영 환경 확인"""
    return settings.is_production()

def validate_configuration() -> None:
    """설정 유효성 검증 및 오류 시 예외 발생"""
    issues = settings.validate_settings()
    if issues:
        error_msg = "Configuration validation failed:\n" + "\n".join(f"- {issue}" for issue in issues)
        logger.error(error_msg)
        raise ValueError(error_msg)

def get_safe_config_summary() -> Dict[str, Any]:
    """보안에 민감한 정보를 제외한 설정 요약"""
    config = settings.to_dict()
    
    # API 키 등 민감한 정보 마스킹
    for llm_name, llm_config in config["llm_configs"].items():
        if llm_config.get("api_key"):
            llm_config["api_key"] = "***"
    
    return config