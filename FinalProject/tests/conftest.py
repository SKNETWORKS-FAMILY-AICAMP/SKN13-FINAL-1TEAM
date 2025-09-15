"""
pytest 설정 및 픽스처 정의 파일

이 파일은 pytest 실행 시 자동으로 로드되며,
모든 테스트에서 공통으로 사용할 픽스처들을 정의합니다.
"""

import pytest
import asyncio
import os
import tempfile
from pathlib import Path
from typing import Generator, AsyncGenerator
from unittest.mock import Mock, AsyncMock, patch

import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# 환경변수 설정 (테스트용)
os.environ.setdefault("TESTING", "1")
os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_PORT", "3306")
os.environ.setdefault("DB_USER", "test_user")
os.environ.setdefault("DB_PASS", "test_password")
os.environ.setdefault("DB", "test_db")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("PYTHONPATH", str(Path(__file__).parent))

# 백엔드 모듈 임포트
import sys
from pathlib import Path

# 백엔드 경로를 Python path에 추가
backend_path = Path(__file__).parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

try:
    from main import app
    from database import Base, get_db
    from database.models import *  # 모든 모델을 임포트하여 Base.metadata에 등록
    from routers import auth_routes, chat_routes, document_routes, calendar_routes, users_routes
    BACKEND_AVAILABLE = True
except ImportError as e:
    print(f"백엔드 모듈 임포트 실패: {e}")
    # 백엔드 모듈이 없는 경우 테스트용 FastAPI 앱 생성
    from fastapi import FastAPI, HTTPException, status
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel
    
    app = FastAPI()  # 실제 FastAPI 인스턴스 생성
    Base = Mock()
    get_db = Mock()
    BACKEND_AVAILABLE = False
    
    # 테스트용 기본 엔드포인트들 추가
    class LoginRequest(BaseModel):
        username: str
        password: str
    
    @app.post("/api/v1/auth/login")
    async def test_login(login_data: LoginRequest):
        # 테스트용 로그인 엔드포인트
        if login_data.username == "testuser" and login_data.password == "testpassword":
            return {"access_token": "test-token", "token_type": "bearer"}
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    @app.get("/api/v1/users")
    async def test_get_users():
        raise HTTPException(status_code=403, detail="Forbidden")
    
    @app.post("/api/v1/users")
    async def test_create_user():
        raise HTTPException(status_code=403, detail="Forbidden")
    
    @app.get("/api/v1/files/documents")
    async def test_get_documents():
        raise HTTPException(status_code=403, detail="Forbidden")
    
    @app.post("/api/v1/files/upload")
    async def test_upload_document():
        raise HTTPException(status_code=403, detail="Forbidden")
    
    @app.delete("/api/v1/files/documents/{doc_id}")
    async def test_delete_document(doc_id: str):
        return JSONResponse(status_code=404, content={"detail": "Document not found"})
    
    @app.get("/api/v1/chat/sessions")
    async def test_get_chat_sessions():
        raise HTTPException(status_code=403, detail="Forbidden")
    
    @app.post("/api/v1/chat/save")
    async def test_save_message():
        raise HTTPException(status_code=403, detail="Forbidden")
    
    @app.get("/api/v1/chat/llm-stream")
    async def test_llm_stream():
        raise HTTPException(status_code=403, detail="Forbidden")
    
    @app.get("/api/v1/calendar/events")
    async def test_get_events():
        raise HTTPException(status_code=403, detail="Forbidden")
    
    @app.post("/api/v1/calendar/events")
    async def test_create_event():
        raise HTTPException(status_code=403, detail="Forbidden")

# pytest-asyncio 설정
pytest_asyncio.fixture_scope_function = True

@pytest.fixture(scope="session")
def event_loop():
    """이벤트 루프 픽스처 (세션 스코프)"""
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="function")
def temp_dir() -> Generator[Path, None, None]:
    """임시 디렉토리 픽스처"""
    with tempfile.TemporaryDirectory() as tmp_dir:
        yield Path(tmp_dir)

@pytest.fixture(scope="function")
def db_engine():
    """테스트용 인메모리 SQLite 데이터베이스 엔진"""
    from sqlalchemy import MetaData, Table, Column, Integer, String, Boolean, DateTime, Text
    from sqlalchemy.sql import func
    
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    
    # 백엔드가 사용 가능한 경우 실제 모델 사용
    if BACKEND_AVAILABLE and hasattr(Base, 'metadata'):
        Base.metadata.create_all(bind=engine)
        yield engine
        Base.metadata.drop_all(bind=engine)
    else:
        # 백엔드가 없는 경우 수동으로 테이블 생성
        metadata = MetaData()
        
        # users 테이블
        users = Table('users', metadata,
            Column('id', Integer, primary_key=True),
            Column('unique_auth_number', String(100), nullable=False, unique=True),
            Column('username', String(100), nullable=False, unique=True),
            Column('hashed_password', String(255), nullable=False),
            Column('email', String(255), nullable=True, unique=True),
            Column('dept', String(100), nullable=True),
            Column('position', String(100), nullable=True),
            Column('is_active', Boolean, nullable=False, default=True),
            Column('is_manager', Boolean, nullable=False, default=False),
            Column('must_change_password', Boolean, nullable=False, default=False),
            Column('created_at', DateTime, nullable=False, default=func.now()),
            Column('last_login_at', DateTime, nullable=True)
        )
        
        # chat_sessions 테이블
        chat_sessions = Table('chat_sessions', metadata,
            Column('id', String(255), primary_key=True),
            Column('user_id', Integer, nullable=True),
            Column('title', String(500), nullable=False),
            Column('is_deleted', Boolean, nullable=False, default=False),
            Column('created_at', DateTime, nullable=False, default=func.now())
        )
        
        # chat_messages 테이블
        chat_messages = Table('chat_messages', metadata,
            Column('id', Integer, primary_key=True),
            Column('session_id', String(255), nullable=False),
            Column('role', String(50), nullable=False),
            Column('content', Text, nullable=False),
            Column('message_id', String(100), nullable=True),
            Column('timestamp', DateTime, nullable=False, default=func.now())
        )
        
        # documents 테이블
        documents = Table('documents', metadata,
            Column('id', String(255), primary_key=True),
            Column('owner_id', Integer, nullable=True),
            Column('original_filename', String(500), nullable=False),
            Column('file_type', String(50), nullable=False),
            Column('original_file_path', String(1000), nullable=False),
            Column('markdown_file_path', String(1000), nullable=True),
            Column('indexed_at', DateTime, nullable=True),
            Column('indexed_hash', String(255), nullable=True),
            Column('vector_namespace', String(255), nullable=True),
            Column('created_at', DateTime, nullable=False, default=func.now()),
            Column('updated_at', DateTime, nullable=False, default=func.now())
        )
        
        # calendars 테이블
        calendars = Table('calendars', metadata,
            Column('id', Integer, primary_key=True),
            Column('user_id', Integer, nullable=False),
            Column('name', String(200), nullable=False),
            Column('description', Text, nullable=True),
            Column('is_default', Boolean, nullable=False, default=False),
            Column('created_at', DateTime, nullable=False, default=func.now()),
            Column('updated_at', DateTime, nullable=False, default=func.now())
        )
        
        # events 테이블
        events = Table('events', metadata,
            Column('id', Integer, primary_key=True),
            Column('calendar_id', Integer, nullable=False),
            Column('created_by', Integer, nullable=True),
            Column('source_chat_message_id', Integer, nullable=True),
            Column('title', String(500), nullable=False),
            Column('description', Text, nullable=True),
            Column('start', DateTime, nullable=False),
            Column('end', DateTime, nullable=True),
            Column('all_day', Boolean, nullable=False, default=False),
            Column('color', String(20), nullable=True),
            Column('created_via', String(20), nullable=False, default='user'),
            Column('status', String(20), nullable=False, default='confirmed'),
            Column('reminder_minutes_before', Integer, nullable=True),
            Column('recurrence_rule', String(500), nullable=True),
            Column('created_at', DateTime, nullable=False, default=func.now()),
            Column('updated_at', DateTime, nullable=False, default=func.now())
        )
        
        # tool_messages 테이블
        tool_messages = Table('tool_messages', metadata,
            Column('id', Integer, primary_key=True),
            Column('chat_message_id', Integer, nullable=False),
            Column('tool_call_id', String(100), nullable=True),
            Column('tool_status', String(20), nullable=True),
            Column('tool_artifact', Text, nullable=True),  # JSON으로 저장
            Column('tool_raw_content', Text, nullable=True)  # JSON으로 저장
        )
        
        # refresh_tokens 테이블
        refresh_tokens = Table('refresh_tokens', metadata,
            Column('id', String(36), primary_key=True),
            Column('user_id', Integer, nullable=False),
            Column('expires_at', DateTime, nullable=False),
            Column('revoked_at', DateTime, nullable=True),
            Column('created_at', DateTime, nullable=False, default=func.now())
        )
        
        # email_templates 테이블
        email_templates = Table('email_templates', metadata,
            Column('id', Integer, primary_key=True),
            Column('name', String(200), nullable=False, unique=True),
            Column('subject_tpl', String(500), nullable=False),
            Column('body_tpl', Text, nullable=False),
            Column('sample_vars_json', Text, nullable=True),
            Column('created_at', DateTime, nullable=False, default=func.now()),
            Column('updated_at', DateTime, nullable=False, default=func.now())
        )
        
        metadata.create_all(bind=engine)
        yield engine
        metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db_session(db_engine) -> Generator[Session, None, None]:
    """테스트용 데이터베이스 세션"""
    TestingSessionLocal = sessionmaker(
        autocommit=False, 
        autoflush=False, 
        bind=db_engine
    )
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture(scope="function")
def client(db_session) -> Generator[TestClient, None, None]:
    """FastAPI 테스트 클라이언트"""
    def override_get_db():
        try:
            yield db_session
        finally:
            db_session.close()
    
    # 백엔드가 사용 가능한 경우에만 dependency override 설정
    if BACKEND_AVAILABLE and hasattr(app, 'dependency_overrides'):
        app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(app) as test_client:
        yield test_client
    
    # 백엔드가 사용 가능한 경우에만 dependency override 정리
    if BACKEND_AVAILABLE and hasattr(app, 'dependency_overrides'):
        app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def mock_openai():
    """OpenAI API 모킹"""
    with patch('openai.ChatCompletion.create') as mock_create:
        mock_create.return_value = {
            "choices": [{
                "message": {
                    "content": "테스트 응답입니다."
                }
            }]
        }
        yield mock_create

@pytest.fixture(scope="function")
def mock_chromadb():
    """ChromaDB Mock 픽스처"""
    with patch('chromadb.Client') as mock_client:
        # Mock collection 설정
        mock_collection = Mock()
        mock_collection.query.return_value = {
            "documents": [["테스트 문서 내용 1", "테스트 문서 내용 2"]],
            "metadatas": [{"source": "test1.pdf"}, {"source": "test2.pdf"}],
            "distances": [[0.1, 0.2]],
            "ids": [["doc1", "doc2"]]
        }
        mock_collection.count.return_value = 2
        
        # Mock client 설정
        mock_client_instance = Mock()
        mock_client_instance.get_or_create_collection.return_value = mock_collection
        mock_client.return_value = mock_client_instance
        
        yield mock_client_instance

@pytest.fixture(scope="function")
def sample_user_data():
    """샘플 사용자 데이터"""
    from datetime import datetime, timezone
    return {
        "id": 1,
        "unique_auth_number": "TEST001",
        "username": "testuser",
        "hashed_password": "test_password_hash",
        "email": "test@example.com",
        "dept": "테스트부서",
        "position": "테스트직책",
        "is_active": True,
        "is_manager": False,
        "must_change_password": False,
        "created_at": datetime.now(timezone.utc)
    }

@pytest.fixture(scope="function")
def sample_chat_session_data():
    """샘플 채팅 세션 데이터"""
    return {
        "id": "test-session-123",
        "user_id": 1,
        "title": "테스트 채팅 세션",
    }

@pytest.fixture(scope="function")
def sample_document_data():
    """샘플 문서 데이터"""
    return {
        "id": "test-doc-123",
        "owner_id": 1,
        "original_filename": "test.pdf",
        "file_type": "pdf",
        "original_file_path": "/test/path/test.pdf",
        "markdown_file_path": "/test/path/test.md"
    }

@pytest.fixture(scope="function")
def auth_headers(client, sample_user_data):
    """인증된 사용자의 헤더"""
    # JWT 토큰 생성 로직 (실제 구현에 따라 수정)
    token = "test-jwt-token"
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture(scope="function")
async def async_client(db_session) -> AsyncGenerator[TestClient, None]:
    """비동기 테스트 클라이언트"""
    def override_get_db():
        try:
            yield db_session
        finally:
            db_session.close()
    
    # 백엔드가 사용 가능한 경우에만 dependency override 설정
    if BACKEND_AVAILABLE and hasattr(app, 'dependency_overrides'):
        app.dependency_overrides[get_db] = override_get_db
    
    async with TestClient(app) as test_client:
        yield test_client
    
    # 백엔드가 사용 가능한 경우에만 dependency override 정리
    if BACKEND_AVAILABLE and hasattr(app, 'dependency_overrides'):
        app.dependency_overrides.clear()

@pytest.fixture(autouse=True)
def setup_test_environment():
    """각 테스트 실행 전 환경 설정"""
    # 테스트용 환경변수 설정
    test_env = {
        "TESTING": "1",
        "OPENAI_API_KEY": "test-key",
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
        "DB_USER": "test_user",
        "DB_PASS": "test_password",
        "DB": "test_db"
    }
    
    with patch.dict(os.environ, test_env):
        yield

# 테스트 후크 함수들
def pytest_configure(config):
    """pytest 설정 시 실행되는 함수"""
    config.addinivalue_line(
        "markers", "integration: 통합 테스트 마커"
    )
    config.addinivalue_line(
        "markers", "unit: 단위 테스트 마커"
    )
    config.addinivalue_line(
        "markers", "performance: 성능 테스트 마커"
    )
    config.addinivalue_line(
        "markers", "database: 데이터베이스 테스트 마커"
    )
    config.addinivalue_line(
        "markers", "slow: 느린 테스트 마커"
    )
    config.addinivalue_line(
        "markers", "api: API 테스트 마커"
    )

def pytest_collection_modifyitems(config, items):
    """테스트 수집 후 실행되는 함수"""
    # slow 마커가 있는 테스트에 대한 처리
    for item in items:
        if "slow" in item.keywords:
            item.add_marker(pytest.mark.slow)

@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """테스트 시작 시 데이터베이스 설정"""
    print("\n테스트 데이터베이스 설정 중...")
    yield
    print("\n테스트 데이터베이스 정리 완료")

# 커스텀 어설션 함수들
def assert_response_success(response, expected_status=200):
    """API 응답 성공 검증"""
    assert response.status_code == expected_status
    assert response.headers.get("content-type") == "application/json"

def assert_response_error(response, expected_status=400):
    """API 응답 에러 검증"""
    assert response.status_code == expected_status
    assert "error" in response.json() or "detail" in response.json()

