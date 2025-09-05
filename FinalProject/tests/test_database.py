"""
데이터베이스 모델 및 연산 테스트 모듈

SQLAlchemy 모델들과 데이터베이스 연산을 테스트합니다.
"""

import pytest
from datetime import datetime, timezone
from sqlalchemy.exc import IntegrityError
from unittest.mock import patch

# 데이터베이스 모델 임포트
MODELS_AVAILABLE = True
try:
    from backend.database.models.user import User
    from backend.database.models.chat import ChatSession, ChatMessage, ToolMessageRecord
    from backend.database.models.document import Document
    from backend.database.models.calendar import Calendar, Event
    from backend.database.models.system import EmailTemplate
except ImportError as e:
    print(f"데이터베이스 모델 임포트 실패: {e}")
    # 모델이 없는 경우 Mock으로 대체
    from unittest.mock import Mock
    User = ChatSession = ChatMessage = ToolMessageRecord = Mock
    Document = Calendar = Event = EmailTemplate = Mock
    MODELS_AVAILABLE = False

class TestUserModel:
    """사용자 모델 테스트"""
    
    def test_create_user(self, db_session):
        """사용자 생성 테스트"""
        user = User(
            unique_auth_number="TEST001",
            username="testuser",
            hashed_password="hashed_password_123",
            email="test@example.com",
            dept="테스트부서",
            position="테스트직책",
            is_active=True,
            is_manager=False,
            must_change_password=False,
            created_at=datetime.now(timezone.utc)
        )
        
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        
        assert user.id is not None
        assert user.username == "testuser"
        assert user.email == "test@example.com"
        assert user.is_active is True
        assert user.created_at is not None
    
    def test_user_unique_constraints(self, db_session):
        """사용자 유니크 제약 조건 테스트"""
        # 첫 번째 사용자 생성
        user1 = User(
            unique_auth_number="TEST001",
            username="testuser",
            hashed_password="password1",
            email="test@example.com",
            is_active=True,
            is_manager=False,
            must_change_password=False,
            created_at=datetime.now(timezone.utc)
        )
        db_session.add(user1)
        db_session.commit()
        
        # 같은 username으로 두 번째 사용자 생성 시도
        user2 = User(
            unique_auth_number="TEST002",
            username="testuser",  # 중복
            hashed_password="password2",
            email="test2@example.com",
            created_at=datetime.now(timezone.utc)
        )
        db_session.add(user2)
        
        with pytest.raises(IntegrityError):
            db_session.commit()
    
    def test_user_relationships(self, db_session):
        """사용자 관계 테스트"""
        user = User(
            unique_auth_number="TEST001",
            username="testuser",
            hashed_password="password",
            email="test@example.com",
            is_active=True,
            is_manager=False,
            must_change_password=False,
            created_at=datetime.now(timezone.utc)
        )
        db_session.add(user)
        db_session.commit()
        
        # 채팅 세션 생성
        chat_session = ChatSession(
            id="test-session",
            user_id=user.id,
            title="테스트 세션",
            is_deleted=False,
            created_at=datetime.now(timezone.utc)
        )
        db_session.add(chat_session)
        db_session.commit()
        
        # 관계 확인
        db_session.refresh(user)
        assert len(user.chat_sessions) == 1
        assert user.chat_sessions[0].title == "테스트 세션"

class TestChatModels:
    """채팅 관련 모델 테스트"""
    
    def test_create_chat_session(self, db_session, sample_user_data):
        """채팅 세션 생성 테스트"""
        # 사용자 생성
        user = User(**sample_user_data)
        db_session.add(user)
        db_session.commit()
        
        # 채팅 세션 생성
        session = ChatSession(
            id="test-session-123",
            user_id=user.id,
            title="테스트 채팅",
            is_deleted=False,
            created_at=datetime.now(timezone.utc)
        )
        db_session.add(session)
        db_session.commit()
        db_session.refresh(session)
        
        assert session.id == "test-session-123"
        assert session.user_id == user.id
        assert session.title == "테스트 채팅"
        assert session.created_at is not None
    
    def test_create_chat_message(self, db_session):
        """채팅 메시지 생성 테스트"""
        # 채팅 세션 생성
        session = ChatSession(
            id="test-session",
            user_id=None,  # 사용자 없이도 세션 생성 가능
            title="테스트",
            is_deleted=False,
            created_at=datetime.now(timezone.utc)
        )
        db_session.add(session)
        db_session.commit()
        
        # 메시지 생성
        message = ChatMessage(
            session_id=session.id,
            role="user",
            content="안녕하세요",
            timestamp=datetime.now(timezone.utc)
        )
        db_session.add(message)
        db_session.commit()
        db_session.refresh(message)
        
        assert message.session_id == session.id
        assert message.role == "user"
        assert message.content == "안녕하세요"
        assert message.timestamp is not None
    
    def test_tool_message_record(self, db_session):
        """도구 메시지 레코드 테스트"""
        # 채팅 메시지 생성
        session = ChatSession(id="test-session", title="테스트", is_deleted=False, created_at=datetime.now(timezone.utc))
        db_session.add(session)
        db_session.commit()
        
        message = ChatMessage(
            session_id=session.id,
            role="assistant",
            content="도구를 사용했습니다",
            timestamp=datetime.now(timezone.utc)
        )
        db_session.add(message)
        db_session.commit()
        
        # 도구 메시지 레코드 생성
        tool_record = ToolMessageRecord(
            chat_message_id=message.id,
            tool_call_id="tool-123",
            tool_status="success",
            tool_artifact={"result": "성공"},
            tool_raw_content={"raw": "원시 데이터"}
        )
        db_session.add(tool_record)
        db_session.commit()
        db_session.refresh(tool_record)
        
        assert tool_record.chat_message_id == message.id
        assert tool_record.tool_call_id == "tool-123"
        assert tool_record.tool_status == "success"
        assert tool_record.tool_artifact["result"] == "성공"

class TestDocumentModel:
    """문서 모델 테스트"""
    
    def test_create_document(self, db_session, sample_user_data):
        """문서 생성 테스트"""
        # 사용자 생성
        user = User(**sample_user_data)
        db_session.add(user)
        db_session.commit()
        
        # 문서 생성
        document = Document(
            id="doc-123",
            owner_id=user.id,
            original_filename="test.pdf",
            file_type="pdf",
            original_file_path="/uploads/test.pdf",
            markdown_file_path="/markdown/test.md",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db_session.add(document)
        db_session.commit()
        db_session.refresh(document)
        
        assert document.id == "doc-123"
        assert document.owner_id == user.id
        assert document.original_filename == "test.pdf"
        assert document.file_type == "pdf"
        assert document.created_at is not None
    
    def test_document_indexing_info(self, db_session):
        """문서 인덱싱 정보 테스트"""
        document = Document(
            id="doc-456",
            owner_id=None,
            original_filename="indexed.pdf",
            file_type="pdf",
            original_file_path="/uploads/indexed.pdf",
            markdown_file_path="/markdown/indexed.md",
            indexed_at=datetime.now(timezone.utc),
            indexed_hash="abc123",
            vector_namespace="test_namespace",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db_session.add(document)
        db_session.commit()
        db_session.refresh(document)
        
        assert document.indexed_at is not None
        assert document.indexed_hash == "abc123"
        assert document.vector_namespace == "test_namespace"

class TestCalendarModels:
    """캘린더 관련 모델 테스트"""
    
    def test_create_calendar(self, db_session, sample_user_data):
        """캘린더 생성 테스트"""
        # 사용자 생성
        user = User(**sample_user_data)
        db_session.add(user)
        db_session.commit()
        
        # 캘린더 생성
        calendar = Calendar(
            name="업무 캘린더",
            description="업무용 캘린더입니다",
            user_id=user.id,
            is_default=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db_session.add(calendar)
        db_session.commit()
        db_session.refresh(calendar)
        
        assert calendar.name == "업무 캘린더"
        assert calendar.user_id == user.id
        assert calendar.is_default is True
    
    def test_create_event(self, db_session):
        """이벤트 생성 테스트"""
        # 사용자와 캘린더 생성
        user = User(
            unique_auth_number="TEST001",
            username="testuser",
            hashed_password="password",
            email="test@example.com",
            is_active=True,
            is_manager=False,
            must_change_password=False,
            created_at=datetime.now(timezone.utc)
        )
        db_session.add(user)
        db_session.commit()
        
        calendar = Calendar(
            name="테스트 캘린더",
            user_id=user.id,
            is_default=False,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db_session.add(calendar)
        db_session.commit()
        
        # 이벤트 생성
        event = Event(
            title="테스트 미팅",
            description="중요한 미팅입니다",
            start=datetime(2025, 1, 15, 10, 0),
            end=datetime(2025, 1, 15, 11, 0),
            all_day=False,
            calendar_id=calendar.id,
            created_by=user.id,
            created_via="user",
            status="confirmed",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db_session.add(event)
        db_session.commit()
        db_session.refresh(event)
        
        assert event.title == "테스트 미팅"
        assert event.calendar_id == calendar.id
        assert event.created_by == user.id
        assert event.status == "confirmed"  # 기본값
    
    def test_event_time_constraint(self, db_session):
        """이벤트 시간 제약 조건 테스트"""
        calendar = Calendar(name="테스트", user_id=1, is_default=False, created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
        db_session.add(calendar)
        db_session.commit()
        
        # 종료 시간이 시작 시간보다 이른 이벤트
        invalid_event = Event(
            title="잘못된 시간",
            start=datetime(2025, 1, 15, 11, 0),
            end=datetime(2025, 1, 15, 10, 0),  # 시작보다 이른 종료
            all_day=False,
            calendar_id=calendar.id,
            status="confirmed",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db_session.add(invalid_event)
        
        with pytest.raises(IntegrityError):
            db_session.commit()

class TestEmailTemplate:
    """이메일 템플릿 모델 테스트"""
    
    def test_create_email_template(self, db_session):
        """이메일 템플릿 생성 테스트"""
        template = EmailTemplate(
            name="회의_알림",
            subject_tpl="[{project}] 회의 알림",
            body_tpl="안녕하세요 {name}님, {meeting_time}에 회의가 있습니다.",
            sample_vars_json={
                "project": "KOBACO",
                "name": "홍길동",
                "meeting_time": "2025-01-15 10:00"
            },
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db_session.add(template)
        db_session.commit()
        db_session.refresh(template)
        
        assert template.name == "회의_알림"
        assert "{project}" in template.subject_tpl
        assert template.sample_vars_json["project"] == "KOBACO"
        assert template.created_at is not None

@pytest.mark.database
class TestDatabaseOperations:
    """데이터베이스 연산 테스트"""
    
    def test_cascade_delete_user_sessions(self, db_session):
        """사용자 삭제 시 세션 처리 테스트"""
        # 사용자와 세션 생성
        user = User(
            unique_auth_number="CASCADE_TEST",
            username="cascadeuser",
            hashed_password="password",
            email="cascade@test.com",
            is_active=True,
            is_manager=False,
            must_change_password=False,
            created_at=datetime.now(timezone.utc)
        )
        db_session.add(user)
        db_session.commit()
        
        session = ChatSession(
            id="cascade-session",
            user_id=user.id,
            title="삭제될 세션",
            is_deleted=False,
            created_at=datetime.now(timezone.utc)
        )
        db_session.add(session)
        db_session.commit()
        
        # 사용자 삭제
        db_session.delete(user)
        db_session.commit()
        
        # 세션의 user_id가 NULL로 설정되었는지 확인
        remaining_session = db_session.query(ChatSession).filter(
            ChatSession.id == "cascade-session"
        ).first()
        assert remaining_session is not None
        assert remaining_session.user_id is None
    
    def test_query_with_relationships(self, db_session):
        """관계를 포함한 쿼리 테스트"""
        # 테스트 데이터 생성
        user = User(
            unique_auth_number="REL_TEST",
            username="reluser",
            hashed_password="password",
            email="rel@test.com",
            is_active=True,
            is_manager=False,
            must_change_password=False,
            created_at=datetime.now(timezone.utc)
        )
        db_session.add(user)
        db_session.commit()
        
        session = ChatSession(
            id="rel-session",
            user_id=user.id,
            title="관계 테스트",
            is_deleted=False,
            created_at=datetime.now(timezone.utc)
        )
        db_session.add(session)
        db_session.commit()
        
        message = ChatMessage(
            session_id=session.id,
            role="user",
            content="테스트 메시지",
            timestamp=datetime.now(timezone.utc)
        )
        db_session.add(message)
        db_session.commit()
        
        # 관계를 포함한 쿼리
        result = db_session.query(ChatSession).filter(
            ChatSession.user_id == user.id
        ).first()
        
        assert result is not None
        assert result.user.username == "reluser"
        assert len(result.messages) == 1
        assert result.messages[0].content == "테스트 메시지"

