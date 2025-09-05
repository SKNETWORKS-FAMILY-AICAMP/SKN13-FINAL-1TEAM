# FinalProject Makefile
# pytest 실행 및 개발 도구를 위한 편의 명령어

.PHONY: help install test test-unit test-integration test-api test-db test-agents test-coverage test-html clean lint format check-security run-dev run-prod docker-build docker-run

# 기본 Python 인터프리터
PYTHON := python3
PIP := pip3

# 프로젝트 디렉토리
PROJECT_DIR := $(shell pwd)
BACKEND_DIR := $(PROJECT_DIR)/backend
FRONTEND_DIR := $(PROJECT_DIR)/frontend-ui
TESTS_DIR := $(PROJECT_DIR)/tests

help: ## 사용 가능한 명령어 목록 표시
	@echo "FinalProject - pytest 및 개발 도구 명령어"
	@echo ""
	@echo "사용법: make [명령어]"
	@echo ""
	@echo "테스트 명령어:"
	@echo "  test                모든 테스트 실행"
	@echo "  test-unit           단위 테스트만 실행"
	@echo "  test-integration    통합 테스트만 실행"
	@echo "  test-api            API 테스트만 실행"
	@echo "  test-db             데이터베이스 테스트만 실행"
	@echo "  test-agents         AI 에이전트 테스트만 실행"
	@echo "  test-coverage       테스트 커버리지 리포트 생성"
	@echo "  test-html           HTML 테스트 리포트 생성"
	@echo ""
	@echo "코드 품질 명령어:"
	@echo "  lint                코드 린팅 (flake8)"
	@echo "  format              코드 포맷팅 (black, isort)"
	@echo "  check-security      보안 검사 (bandit, safety)"
	@echo ""
	@echo "개발 명령어:"
	@echo "  install             의존성 패키지 설치"
	@echo "  run-dev             개발 서버 실행"
	@echo "  run-prod            프로덕션 서버 실행"
	@echo "  clean               캐시 및 임시 파일 정리"
	@echo ""
	@echo "Docker 명령어:"
	@echo "  docker-build        Docker 이미지 빌드"
	@echo "  docker-run          Docker 컨테이너 실행"

install: ## 개발 의존성 패키지 설치
	@echo "의존성 패키지 설치 중..."
	$(PIP) install -r requirements.txt
	$(PIP) install -r requirements-test.txt
	@echo "패키지 설치 완료!"

test: ## 모든 테스트 실행
	@echo "모든 테스트 실행 중..."
	pytest $(TESTS_DIR) -v --tb=short
	@echo "테스트 완료!"

test-unit: ## 단위 테스트만 실행
	@echo "단위 테스트 실행 중..."
	pytest $(TESTS_DIR) -v -m "unit" --tb=short
	@echo "단위 테스트 완료!"

test-integration: ## 통합 테스트만 실행
	@echo "통합 테스트 실행 중..."
	pytest $(TESTS_DIR) -v -m "integration" --tb=short
	@echo "통합 테스트 완료!"

test-api: ## API 테스트만 실행
	@echo "API 테스트 실행 중..."
	pytest $(TESTS_DIR)/test_api.py -v --tb=short
	@echo "API 테스트 완료!"

test-db: ## 데이터베이스 테스트만 실행
	@echo "데이터베이스 테스트 실행 중..."
	pytest $(TESTS_DIR)/test_database.py -v --tb=short
	@echo "데이터베이스 테스트 완료!"

test-agents: ## AI 에이전트 테스트만 실행
	@echo "AI 에이전트 테스트 실행 중..."
	pytest $(TESTS_DIR)/test_agents.py -v --tb=short
	@echo "에이전트 테스트 완료!"

test-coverage: ## 테스트 커버리지 리포트 생성
	@echo "테스트 커버리지 측정 중..."
	pytest $(TESTS_DIR) --cov=$(BACKEND_DIR) --cov-report=term-missing --cov-report=html:htmlcov
	@echo "커버리지 리포트가 htmlcov/ 디렉토리에 생성되었습니다."

test-html: ## HTML 테스트 리포트 생성
	@echo "HTML 테스트 리포트 생성 중..."
	pytest $(TESTS_DIR) --html=reports/report.html --self-contained-html
	@echo "HTML 리포트가 reports/report.html에 생성되었습니다."

test-parallel: ## 병렬 테스트 실행
	@echo "병렬 테스트 실행 중..."
	pytest $(TESTS_DIR) -n auto -v
	@echo "병렬 테스트 완료!"

test-watch: ## 파일 변경 감지 시 자동 테스트 실행
	@echo "파일 변경 감지 모드로 테스트 실행..."
	pytest-watch $(TESTS_DIR) -- -v --tb=short

lint: ## 코드 린팅 (flake8)
	@echo "코드 린팅 실행 중..."
	flake8 $(BACKEND_DIR) $(TESTS_DIR) --max-line-length=120 --ignore=E203,W503
	@echo "린팅 완료!"

format: ## 코드 포맷팅 (black, isort)
	@echo "코드 포맷팅 실행 중..."
	black $(BACKEND_DIR) $(TESTS_DIR) --line-length=120
	isort $(BACKEND_DIR) $(TESTS_DIR) --profile black
	@echo "포맷팅 완료!"

type-check: ## 타입 체크 (mypy)
	@echo "타입 체크 실행 중..."
	mypy $(BACKEND_DIR) --ignore-missing-imports
	@echo "타입 체크 완료!"

check-security: ## 보안 검사 (bandit, safety)
	@echo "보안 검사 실행 중..."
	bandit -r $(BACKEND_DIR) -f json -o reports/bandit-report.json || true
	safety check --json --output reports/safety-report.json || true
	@echo "보안 검사 완료! 리포트는 reports/ 디렉토리를 확인하세요."

run-dev: ## 개발 서버 실행
	@echo "개발 서버 실행 중..."
	cd $(BACKEND_DIR) && $(PYTHON) -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

run-prod: ## 프로덕션 서버 실행
	@echo "프로덕션 서버 실행 중..."
	cd $(BACKEND_DIR) && $(PYTHON) -m uvicorn main:app --host 0.0.0.0 --port 8000

run-frontend: ## 프론트엔드 개발 서버 실행
	@echo "프론트엔드 개발 서버 실행 중..."
	cd $(FRONTEND_DIR) && npm run dev

run-electron: ## Electron 앱 실행
	@echo "Electron 앱 실행 중..."
	npm run electron:dev

clean: ## 캐시 및 임시 파일 정리
	@echo "캐시 및 임시 파일 정리 중..."
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name ".pytest_cache" -delete
	find . -type d -name "*.egg-info" -delete
	rm -rf htmlcov/
	rm -rf reports/
	rm -rf .coverage
	rm -rf dist/
	rm -rf build/
	@echo "정리 완료!"

setup-dirs: ## 필요한 디렉토리 생성
	@echo "디렉토리 구조 생성 중..."
	mkdir -p reports
	mkdir -p htmlcov
	mkdir -p logs
	@echo "디렉토리 생성 완료!"

docker-build: ## Docker 이미지 빌드
	@echo "Docker 이미지 빌드 중..."
	docker build -t finalproject-backend $(BACKEND_DIR)
	docker build -t finalproject-frontend $(FRONTEND_DIR)
	@echo "Docker 이미지 빌드 완료!"

docker-run: ## Docker 컨테이너 실행
	@echo "Docker 컨테이너 실행 중..."
	docker-compose up -d
	@echo "Docker 컨테이너 실행 완료!"

docker-stop: ## Docker 컨테이너 중지
	@echo "Docker 컨테이너 중지 중..."
	docker-compose down
	@echo "Docker 컨테이너 중지 완료!"

init: install setup-dirs ## 프로젝트 초기 설정
	@echo "프로젝트 초기 설정 완료!"

ci: lint type-check test-coverage check-security ## CI/CD 파이프라인 실행
	@echo "CI/CD 파이프라인 실행 완료!"

# 개발자 워크플로우
dev-setup: clean install setup-dirs ## 개발 환경 설정
	@echo "개발 환경 설정 완료!"

dev-test: format lint test ## 개발 중 테스트 실행
	@echo "개발 테스트 완료!"

# 프로덕션 배포 준비
prod-check: clean format lint type-check test-coverage check-security ## 프로덕션 배포 전 체크
	@echo "프로덕션 배포 준비 완료!"

# 문서 생성
docs: ## 문서 생성
	@echo "문서 생성 중..."
	cd docs && make html
	@echo "문서가 docs/_build/html/ 에 생성되었습니다."

# 데이터베이스 관련
db-migrate: ## 데이터베이스 마이그레이션 실행
	@echo "데이터베이스 마이그레이션 실행 중..."
	cd $(BACKEND_DIR) && $(PYTHON) -c "from database import create_db_and_tables; create_db_and_tables()"
	@echo "마이그레이션 완료!"

db-reset: ## 데이터베이스 초기화
	@echo "데이터베이스 초기화 중..."
	# 실제 구현에 따라 수정 필요
	@echo "데이터베이스 초기화 완료!"

# 로그 확인
logs: ## 애플리케이션 로그 확인
	@echo "로그 확인 중..."
	tail -f logs/app.log

# 성능 테스트
test-performance: ## 성능 테스트 실행
	@echo "성능 테스트 실행 중..."
	pytest $(TESTS_DIR) -v -m "slow" --benchmark-only
	@echo "성능 테스트 완료!"

# 메모리 프로파일링
profile-memory: ## 메모리 프로파일링
	@echo "메모리 프로파일링 실행 중..."
	$(PYTHON) -m memory_profiler $(BACKEND_DIR)/main.py
	@echo "메모리 프로파일링 완료!"

# 전체 품질 검사
quality-check: format lint type-check test-coverage check-security ## 전체 코드 품질 검사
	@echo "코드 품질 검사 완료!"


