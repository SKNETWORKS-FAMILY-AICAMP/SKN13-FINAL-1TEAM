# 🐳 SKN13-FINAL-1TEAM Docker 배포 가이드

**CLIKCA (Click + Assistant)** - RAG 기반 업무 보조 AI 비서 시스템의 Docker 배포 가이드입니다.

## 📋 목차

- [시스템 요구사항](#시스템-요구사항)
- [빠른 시작](#빠른-시작)
- [환경 설정](#환경-설정)
- [서비스 실행](#서비스-실행)
- [개발 환경](#개발-환경)
- [프로덕션 배포](#프로덕션-배포)
- [모니터링](#모니터링)
- [문제 해결](#문제-해결)

## 🖥️ 시스템 요구사항

### 최소 요구사항
- **OS**: Ubuntu 20.04+, macOS 10.15+, Windows 10/11
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **RAM**: 8GB+
- **Storage**: 20GB+ (SSD 권장)
- **CPU**: 4코어+

### 권장 사양
- **RAM**: 16GB+
- **Storage**: 50GB+ SSD
- **CPU**: 8코어+
- **GPU**: CUDA 지원 GPU (선택사항)

## 🚀 빠른 시작

### 1. 저장소 클론
```bash
git clone <repository-url>
cd SKN13-FINAL-1TEAM
```

### 2. 환경 변수 설정
```bash
cp .env.example .env
# .env 파일을 편집하여 API 키와 데이터베이스 설정을 입력
```

### 3. 서비스 실행
```bash
# 개발 환경
docker-compose --profile dev up -d

# 프로덕션 환경
docker-compose --profile production up -d
```

### 4. 접속 확인
- **백엔드 API**: http://localhost:8000
- **프론트엔드**: http://localhost:3000
- **ChromaDB**: http://localhost:8001
- **MySQL**: localhost:3306

## ⚙️ 환경 설정

### .env 파일 설정
```bash
# API Keys
OPENAI_API_KEY=your_openai_api_key_here
VOYAGE_API_KEY=your_voyage_api_key_here

# Database
MYSQL_ROOT_PASSWORD=secure_root_password
MYSQL_DATABASE=clikca_db
MYSQL_USER=clikca_user
MYSQL_PASSWORD=secure_user_password

# Environment
ENVIRONMENT=development  # development, production
LOG_LEVEL=info          # debug, info, warning, error

# External Services
CHROMA_HOST=chromadb
CHROMA_PORT=8000
DATABASE_URL=mysql+pymysql://clikca_user:secure_user_password@mysql:3306/clikca_db
```

### 디렉토리 구조
```
SKN13-FINAL-1TEAM/
├── docker/
│   ├── mysql/
│   │   └── init/           # MySQL 초기화 스크립트
│   ├── nginx/
│   │   ├── nginx.conf      # Nginx 설정
│   │   ├── conf.d/         # 사이트별 설정
│   │   └── ssl/            # SSL 인증서
│   └── chromadb/
│       └── chroma.htpasswd # ChromaDB 인증 파일
├── data/                   # 업로드된 파일 저장
├── chroma_db/             # 벡터 데이터베이스
├── logs/                  # 로그 파일
├── dockerfile             # 메인 Dockerfile
├── docker-compose.yml     # Docker Compose 설정
└── .dockerignore          # Docker 빌드 제외 파일
```

## 🏃‍♂️ 서비스 실행

### 개발 환경 실행
```bash
# 전체 서비스 실행 (개발용)
docker-compose --profile dev up -d

# 특정 서비스만 실행
docker-compose up -d mysql chromadb backend

# 로그 확인
docker-compose logs -f backend
```

### 프로덕션 환경 실행
```bash
# 전체 서비스 실행 (프로덕션용)
docker-compose --profile production up -d

# 백그라운드 실행
docker-compose --profile production up -d --build
```

### 서비스 상태 확인
```bash
# 실행 중인 서비스 확인
docker-compose ps

# 서비스 상태 및 로그 확인
docker-compose ps && docker-compose logs

# 특정 서비스 상태 확인
docker-compose ps backend mysql chromadb
```

## 🛠️ 개발 환경

### 개발 모드 실행
```bash
# 개발 환경 실행
docker-compose --profile dev up -d

# 프론트엔드 개발 서버 실행
docker-compose exec frontend-dev npm run dev

# 백엔드 개발 서버 실행 (자동 리로드)
docker-compose exec backend uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### 코드 수정 및 반영
```bash
# 프론트엔드 코드 수정 시 자동 반영 (Vite HMR)
# 백엔드 코드 수정 시 자동 반영 (Uvicorn --reload)

# 수동 재시작이 필요한 경우
docker-compose restart backend
docker-compose restart frontend-dev
```

### 개발 도구 접근
```bash
# 백엔드 컨테이너 접속
docker-compose exec backend bash

# MySQL 접속
docker-compose exec mysql mysql -u clikca_user -p clikca_db

# ChromaDB 접속
docker-compose exec chromadb bash
```

## 🚀 프로덕션 배포

### 프로덕션 빌드
```bash
# 프로덕션 이미지 빌드
docker-compose --profile production build

# 특정 서비스만 빌드
docker-compose build backend
```

### 프로덕션 실행
```bash
# 프로덕션 환경 실행
docker-compose --profile production up -d

# 백그라운드 실행 및 로그 확인
docker-compose --profile production up -d --build
docker-compose --profile production logs -f
```

### SSL 설정
```bash
# SSL 인증서 준비
mkdir -p docker/nginx/ssl
# SSL 인증서 파일을 docker/nginx/ssl/ 디렉토리에 복사

# Nginx SSL 설정 확인
docker-compose exec nginx nginx -t
docker-compose restart nginx
```

## 📊 모니터링

### 헬스 체크
```bash
# 서비스 상태 확인
docker-compose ps

# 헬스 체크 결과 확인
curl http://localhost:8000/health
curl http://localhost:8001/api/v1/heartbeat
```

### 로그 모니터링
```bash
# 실시간 로그 확인
docker-compose logs -f

# 특정 서비스 로그
docker-compose logs -f backend
docker-compose logs -f mysql
docker-compose logs -f chromadb

# 로그 파일 확인
tail -f logs/backend.log
tail -f logs/nginx/access.log
```

### 리소스 사용량 확인
```bash
# 컨테이너 리소스 사용량
docker stats

# 특정 컨테이너 상세 정보
docker inspect skn13_backend
```

## 🔧 문제 해결

### 일반적인 문제들

#### 1. 포트 충돌
```bash
# 사용 중인 포트 확인
netstat -tulpn | grep :8000
lsof -i :8000

# 포트 변경 (docker-compose.yml 수정)
ports:
  - "8001:8000"  # 호스트 포트를 8001로 변경
```

#### 2. 메모리 부족
```bash
# 메모리 사용량 확인
docker stats

# 메모리 제한 설정 (docker-compose.yml)
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
```

#### 3. 데이터베이스 연결 오류
```bash
# MySQL 상태 확인
docker-compose exec mysql mysqladmin ping

# 데이터베이스 재시작
docker-compose restart mysql

# 연결 문자열 확인
echo $DATABASE_URL
```

#### 4. ChromaDB 연결 오류
```bash
# ChromaDB 상태 확인
curl http://localhost:8001/api/v1/heartbeat

# ChromaDB 재시작
docker-compose restart chromadb

# 인증 파일 확인
ls -la docker/chromadb/chroma.htpasswd
```

### 로그 분석
```bash
# 에러 로그 필터링
docker-compose logs backend | grep ERROR
docker-compose logs mysql | grep -i error

# 특정 시간대 로그
docker-compose logs --since="2024-01-01T00:00:00" backend
```

### 컨테이너 재시작
```bash
# 전체 서비스 재시작
docker-compose restart

# 특정 서비스 재시작
docker-compose restart backend mysql chromadb

# 강제 재시작
docker-compose down
docker-compose up -d
```

## 📚 추가 리소스

### 유용한 명령어
```bash
# 컨테이너 내부 파일 확인
docker-compose exec backend ls -la /app

# 환경 변수 확인
docker-compose exec backend env

# 프로세스 확인
docker-compose exec backend ps aux

# 네트워크 확인
docker network ls
docker network inspect skn13_skn13_network
```

### 백업 및 복구
```bash
# 데이터베이스 백업
docker-compose exec mysql mysqldump -u root -p clikca_db > backup.sql

# 데이터베이스 복구
docker-compose exec -T mysql mysql -u root -p clikca_db < backup.sql

# ChromaDB 데이터 백업
docker cp skn13_chromadb:/chroma/chroma ./chroma_backup

# 볼륨 백업
docker run --rm -v skn13_mysql_data:/data -v $(pwd):/backup alpine tar czf /backup/mysql_backup.tar.gz -C /data .
```

### 성능 최적화
```bash
# 이미지 최적화
docker system prune -a

# 볼륨 정리
docker volume prune

# 네트워크 정리
docker network prune

# 전체 정리
docker system prune -a --volumes
```

## 🆘 지원

문제가 발생하거나 추가 도움이 필요한 경우:

1. **로그 확인**: `docker-compose logs -f [service-name]`
2. **상태 확인**: `docker-compose ps`
3. **헬스 체크**: 각 서비스의 헬스 엔드포인트 확인
4. **문서 참조**: 프로젝트 README.md 및 관련 문서

---

**Happy Dockerizing! 🐳✨**
