# 🧪 FinalProject 테스트 시스템

이 디렉토리에는 FinalProject의 완전한 pytest 테스트 시스템이 구현되어 있습니다.

## 📁 테스트 파일 구조

```
tests/
├── __init__.py                     # 테스트 패키지 초기화
├── test_api.py                     # API 엔드포인트 테스트 (22개 테스트)
├── test_database.py                # 데이터베이스 모델 테스트 (21개 테스트)
├── test_agents.py                  # AI 에이전트 테스트 (25개 테스트)
├── test_integration_advanced.py    # 고급 통합 테스트 (12개 테스트)
└── README.md                       # 이 파일

conftest.py                         # pytest 설정 및 픽스처
pytest.ini                          # pytest 전역 설정
test_runner.py                      # 테스트 검증 스크립트
```

## ✨ 구현된 테스트 기능

### 1. API 테스트 (`test_api.py`)
- **인증 관련 테스트**: 로그인, 권한 검증
- **채팅 기능 테스트**: 메시지 저장, 스트림 채팅
- **문서 관리 테스트**: 업로드, 조회, 삭제
- **캘린더 테스트**: 이벤트 생성, 조회
- **사용자 관리 테스트**: 사용자 생성, 조회
- **헬스체크 테스트**: 시스템 상태 확인
- **에러 처리 테스트**: 잘못된 입력, 권한 오류 등
- **통합 워크플로우 테스트**: 실제 사용자 시나리오

### 2. 데이터베이스 테스트 (`test_database.py`)
- **모델 테스트**: User, ChatSession, Document, Calendar, Event 등
- **관계 테스트**: 사용자-세션, 세션-메시지 관계
- **제약조건 테스트**: 유니크, NOT NULL, 외래키 제약
- **대량 데이터 테스트**: 벌크 연산, 성능 테스트
- **복합 쿼리 테스트**: JOIN, 집계 함수
- **데이터 무결성 테스트**: 트랜잭션, 롤백

### 3. AI 에이전트 테스트 (`test_agents.py`)
- **라우팅 에이전트**: 질문 분류 및 라우팅
- **문서 검색 에이전트**: ChromaDB 기반 검색
- **문서 편집 에이전트**: AI 기반 문서 편집
- **일반 채팅 에이전트**: OpenAI 기반 대화
- **도구 통합 테스트**: 에이전트 간 협업
- **성능 테스트**: 응답시간, 동시성, 메모리 효율성
- **오류 복구 테스트**: 장애 상황 처리

### 4. 고급 통합 테스트 (`test_integration_advanced.py`)
- **전체 사용자 워크플로우**: 로그인→업로드→채팅→이벤트생성
- **다중 사용자 협업**: 동시 문서 작업 시뮬레이션
- **시스템 부하 테스트**: 고부하 상황에서의 안정성
- **데이터 일관성**: 동시 작업에서의 데이터 무결성
- **시스템 복구**: 장애 후 정상 복구 확인
- **비즈니스 프로세스**: 실제 업무 시나리오
- **감사 추적**: 모든 작업의 로깅 및 추적

## 🔧 주요 기능

### Mock 시스템
- **OpenAI API 모킹**: 실제 API 호출 없이 테스트
- **ChromaDB 모킹**: 벡터 DB 동작 시뮬레이션
- **데이터베이스 모킹**: 인메모리 SQLite 사용
- **API 엔드포인트 모킹**: 백엔드 없이도 테스트 가능

### 픽스처 (Fixtures)
- `client`: FastAPI 테스트 클라이언트
- `db_session`: 데이터베이스 세션
- `mock_openai`: OpenAI API 모킹
- `mock_chromadb`: ChromaDB 모킹
- `sample_user_data`: 테스트용 사용자 데이터
- `auth_headers`: 인증된 요청 헤더

### 마커 (Markers)
- `@pytest.mark.unit`: 단위 테스트
- `@pytest.mark.integration`: 통합 테스트
- `@pytest.mark.api`: API 테스트
- `@pytest.mark.database`: 데이터베이스 테스트
- `@pytest.mark.agent`: AI 에이전트 테스트
- `@pytest.mark.performance`: 성능 테스트
- `@pytest.mark.slow`: 시간이 오래 걸리는 테스트

## 🚀 테스트 실행 방법

### 1. 환경 설정 확인
```bash
python test_runner.py
```

### 2. 전체 테스트 실행
```bash
pytest tests/ -v
```

### 3. 파일별 테스트 실행
```bash
# API 테스트만
pytest tests/test_api.py -v

# 데이터베이스 테스트만
pytest tests/test_database.py -v

# AI 에이전트 테스트만
pytest tests/test_agents.py -v

# 통합 테스트만
pytest tests/test_integration_advanced.py -v
```

### 4. 마커별 테스트 실행
```bash
# 단위 테스트만
pytest -m unit -v

# 통합 테스트만
pytest -m integration -v

# 빠른 테스트만 (느린 테스트 제외)
pytest -m "not slow" -v

# 성능 테스트만
pytest -m performance -v
```

### 5. 커버리지 리포트
```bash
pytest --cov=backend --cov-report=html:htmlcov
```

## 📊 테스트 통계

| 카테고리 | 파일 수 | 테스트 수 | 설명 |
|---------|---------|-----------|------|
| **API 테스트** | 1개 | 22개 | REST API 엔드포인트 테스트 |
| **DB 테스트** | 1개 | 21개 | 데이터베이스 모델 및 관계 테스트 |
| **Agent 테스트** | 1개 | 25개 | AI 에이전트 및 도구 테스트 |
| **통합 테스트** | 1개 | 12개 | 고급 시스템 통합 테스트 |
| **전체** | **4개** | **80개** | **완전한 테스트 커버리지** |

## 🛠️ 설치 요구사항

### 필수 패키지
```bash
pip install pytest pytest-asyncio pytest-cov
pip install fastapi sqlalchemy pydantic
pip install httpx  # async client용
```

### 선택적 패키지 (실제 백엔드 연동시)
```bash
pip install openai chromadb
pip install mysql-connector-python  # MySQL 사용시
```

## 🎯 테스트 설계 원칙

### 1. Mock-First 접근
- 외부 의존성을 모킹하여 독립적인 테스트 환경 구축
- 실제 API 호출이나 DB 연결 없이도 테스트 가능

### 2. 계층별 테스트
- **Unit Tests**: 개별 함수/클래스 테스트
- **Integration Tests**: 컴포넌트 간 상호작용 테스트
- **System Tests**: 전체 워크플로우 테스트

### 3. 실제 시나리오 기반
- 실제 사용자의 업무 프로세스를 기반으로 테스트 설계
- 오류 상황과 복구 프로세스까지 포함

### 4. 성능 및 안정성
- 동시성 테스트로 멀티유저 환경 검증
- 메모리 사용량과 응답시간 모니터링
- 시스템 한계 상황에서의 동작 검증

## 🔍 트러블슈팅

### 자주 발생하는 문제

1. **Import Error**: 
   - `python test_runner.py`로 환경 확인
   - 필요한 패키지 설치 확인

2. **Database Error**:
   - SQLite 인메모리 DB 사용으로 권한 문제 없음
   - 테스트 간 데이터 격리 보장

3. **Mock Error**:
   - Mock 객체의 응답 구조 확인
   - 실제 API 응답과 일치하는지 검증

### 디버깅 팁

```bash
# 상세한 오류 정보 표시
pytest -vvv --tb=long

# 특정 테스트만 실행
pytest tests/test_api.py::TestAuthRoutes::test_login_success -v

# 실패한 테스트만 재실행
pytest --lf

# pdb 디버거 사용
pytest --pdb
```

## 📈 향후 확장 계획

- [ ] E2E 테스트 추가 (Selenium/Playwright)
- [ ] 보안 테스트 구현 (SQL Injection, XSS 등)
- [ ] 성능 벤치마크 테스트 확장
- [ ] CI/CD 파이프라인 통합
- [ ] 테스트 데이터 생성기 구현

---

**이 테스트 시스템은 FinalProject의 품질과 안정성을 보장하기 위해 설계되었습니다.** 🚀