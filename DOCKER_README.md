# CLIKCA Docker 환경 구성 가이드

## 개요
CLIKCA (Click + Assistant) - RAG 기반 업무 보조 AI 비서의 Docker 환경이 backend, frontend-ui, data로 분리되어 구성되었습니다.

## 디렉토리 구조
```
.
├── FinalProject/
│   ├── backend/
│   │   ├── Dockerfile          # 백엔드 전용 Dockerfile
│   │   └── requirements.txt    # 백엔드 Python 의존성
│   └── frontend-ui/
│       ├── Dockerfile          # 프론트엔드 전용 Dockerfile
│       └── nginx.conf         # Nginx 설정 파일
├── data/
│   ├── Dockerfile              # 데이터 처리 전용 Dockerfile
│   └── requirements.txt        # 데이터 처리 Python 의존성
├── docker-compose.yml          # 전체 서비스 오케스트레이션
└── DOCKER_README.md           # 이 파일
```

## 서비스 구성

### 1. Backend Service
- **기술 스택**: Python 3.11 + FastAPI
- **포트**: 8000
- **기능**: API 서버, RAG 처리, 데이터베이스 연동

### 2. Frontend Service
- **기술 스택**: Node.js 18 + React
- **포트**: 3000 (개발), 80 (프로덕션)
- **기능**: 사용자 인터페이스, API 연동

### 3. Data Processing Service
- **기술 스택**: Python 3.11
- **기능**: 데이터 전처리, ChromaDB 연동, 파일 처리

### 4. Infrastructure Services
- **MySQL**: 관계형 데이터베이스 (포트: 3306)
- **ChromaDB**: 벡터 데이터베이스 (포트: 8001)
- **Redis**: 캐시 서버 (포트: 6379)
- **Nginx**: 웹 서버 (프로덕션용)

## 사용법

### 개발 환경 실행
```bash
# 개발 환경 전체 실행
docker-compose --profile development up -d

# 특정 서비스만 실행
docker-compose --profile development up backend-dev frontend-dev -d
```

### 프로덕션 환경 실행
```bash
# 프로덕션 환경 전체 실행
docker-compose --profile production up -d

# 백엔드만 프로덕션으로 실행
docker-compose --profile production up backend-prod -d
```

### 데이터 처리 서비스 실행
```bash
# 데이터 처리 서비스 실행
docker-compose --profile data-processing up data-processor -d
```

### 서비스 중지
```bash
# 모든 서비스 중지
docker-compose down

# 특정 프로파일만 중지
docker-compose --profile development down
```

### 로그 확인
```bash
# 특정 서비스 로그 확인
docker-compose logs backend-dev
docker-compose logs frontend-dev

# 실시간 로그 확인
docker-compose logs -f backend-dev
```

### 서비스 재빌드
```bash
# 특정 서비스 재빌드
docker-compose build backend-dev

# 모든 서비스 재빌드
docker-compose build --no-cache
```

## 환경 변수 설정

`.env` 파일을 생성하여 다음 환경 변수들을 설정할 수 있습니다:

```env
# 데이터베이스 설정
MYSQL_ROOT_PASSWORD=root1234
MYSQL_DATABASE=clikca_db
MYSQL_USER=clikca_user
MYSQL_PASSWORD=clikca1234

# API 키
OPENAI_API_KEY=your_openai_api_key
VOYAGE_API_KEY=your_voyage_api_key

# 백엔드 API URL
BACKEND_API_URL=http://localhost:8000

# 프론트엔드 URL
FRONTEND_URL=http://localhost:3000

# 디버그 모드
DEBUG=false
RELOAD=false
```

## 프로파일별 실행

### Development Profile
- 핫 리로드 지원
- 소스 코드 볼륨 마운트
- 디버그 모드 활성화

### Production Profile
- 최적화된 빌드
- Nginx를 통한 정적 파일 서빙
- 보안 헤더 설정

### Data Processing Profile
- 데이터 전처리 작업
- ChromaDB 연동
- 배치 처리 지원

## 문제 해결

### 포트 충돌
```bash
# 사용 중인 포트 확인
netstat -tulpn | grep :8000
netstat -tulpn | grep :3000

# 충돌하는 프로세스 종료
sudo kill -9 <PID>
```

### 볼륨 문제
```bash
# 볼륨 초기화
docker-compose down -v
docker volume prune
```

### 이미지 재빌드
```bash
# 강제 재빌드
docker-compose build --no-cache --pull
```

## 성능 최적화

### 메모리 제한
- Backend: 512MB (제한) / 256MB (예약)
- Redis: 128MB (제한) / 64MB (예약)

### 워커 프로세스
- Development: 1 워커 (핫 리로드)
- Production: 2 워커 (최적화)

## 모니터링

### 리소스 사용량 확인
```bash
docker stats
```

### 서비스 상태 확인
```bash
docker-compose ps
```

### 네트워크 확인
```bash
docker network ls
docker network inspect skn13_network
```

## 보안 고려사항

1. **환경 변수**: 민감한 정보는 `.env` 파일에 저장
2. **네트워크 격리**: `skn13_network`를 통한 서비스 간 통신
3. **보안 헤더**: Nginx를 통한 보안 헤더 설정
4. **포트 노출**: 필요한 포트만 외부에 노출

## 추가 정보

- **GitHub**: 프로젝트 소스 코드
- **문서**: API 문서 및 사용자 가이드
- **이슈**: 버그 리포트 및 기능 요청
