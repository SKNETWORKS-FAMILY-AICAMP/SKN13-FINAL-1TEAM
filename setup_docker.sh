#!/bin/bash

# FinalProject 중심 최적화된 Docker 설정 스크립트
# CLIKCA (Click + Assistant) - RAG 기반 업무 보조 AI 비서

set -e  # 오류 발생 시 스크립트 중단

echo "🚀 FinalProject 중심 Docker 설정을 시작합니다..."

# FinalProject 디렉토리 확인
if [ ! -d "FinalProject" ]; then
    echo "❌ FinalProject 디렉토리가 없습니다."
    echo "현재 디렉토리: $(pwd)"
    echo "FinalProject 디렉토리가 있는 위치에서 실행하세요."
    exit 1
fi

if [ ! -d "FinalProject/backend" ]; then
    echo "❌ FinalProject/backend 디렉토리가 없습니다."
    exit 1
fi

if [ ! -d "FinalProject/frontend-ui" ]; then
    echo "❌ FinalProject/frontend-ui 디렉토리가 없습니다."
    exit 1
fi

echo "✅ FinalProject 디렉토리 구조 확인 완료"

# ===== .env 파일 생성 =====
echo "🔐 .env 파일을 생성합니다..."
cat > .env << 'EOF'
# ===== FinalProject Environment Variables =====
# CLIKCA (Click + Assistant) - RAG 기반 업무 보조 AI 비서

# ===== AWS ECR Configuration =====
ECR_REPOSITORY_URI=123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/skn13-clikca
IMAGE_TAG=runtime

# ===== API Keys =====
OPENAI_API_KEY=your_openai_api_key_here
VOYAGE_API_KEY=your_voyage_api_key_here

# ===== Database Configuration =====
MYSQL_ROOT_PASSWORD=root1234
MYSQL_DATABASE=clikca_db
MYSQL_USER=clikca_user
MYSQL_PASSWORD=clikca1234

# ===== Backend Configuration =====
DEBUG=true
RELOAD=true
BACKEND_API_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
CHROMA_URL=http://localhost:8001

# ===== Environment =====
ENVIRONMENT=development
LOG_LEVEL=debug
EOF

echo "✅ .env 파일 생성 완료"

# ===== MySQL 초기화 스크립트 생성 =====
echo "🗄️ MySQL 초기화 스크립트를 생성합니다..."
mkdir -p FinalProject/backend

cat > FinalProject/backend/init.sql << 'EOF'
-- CLIKCA 데이터베이스 초기화 스크립트

-- 데이터베이스 생성 (이미 존재하면 무시)
CREATE DATABASE IF NOT EXISTS clikca_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 사용자 생성 및 권한 부여
CREATE USER IF NOT EXISTS 'clikca_user'@'%' IDENTIFIED BY 'clikca1234';
GRANT ALL PRIVILEGES ON clikca_db.* TO 'clikca_user'@'%';
FLUSH PRIVILEGES;

-- 기본 테이블 생성
USE clikca_db;

-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 문서 테이블
CREATE TABLE IF NOT EXISTS documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    file_path VARCHAR(500),
    mime_type VARCHAR(100),
    file_size BIGINT,
    user_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 채팅 히스토리 테이블
CREATE TABLE IF NOT EXISTS chat_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    message TEXT NOT NULL,
    response TEXT NOT NULL,
    document_ids JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 샘플 데이터 삽입
INSERT IGNORE INTO users (username, email, password_hash) VALUES 
('admin', 'admin@clikca.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK8i');

INSERT IGNORE INTO documents (title, content, mime_type, user_id) VALUES 
('CLIKCA 소개', 'CLIKCA는 RAG 기반 업무 보조 AI 비서입니다.', 'text/plain', 1);

echo "✅ MySQL 초기화 스크립트 생성 완료"

# ===== Nginx 설정 디렉토리 생성 =====
echo "🌐 Nginx 설정 디렉토리를 생성합니다..."
mkdir -p nginx

cat > nginx/nginx.conf << 'EOF'
# CLIKCA Nginx 설정
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    
    # 로그 설정
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    
    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log;
    
    # Gzip 압축
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # 업스트림 서버 정의
    upstream backend {
        server backend:8000;
    }
    
    upstream frontend {
        server frontend-dev:3000;
    }
    
    # HTTP 서버 (80 포트)
    server {
        listen 80;
        server_name localhost;
        
        # 프론트엔드 정적 파일
        location / {
            root /usr/share/nginx/html;
            try_files $uri $uri/ /index.html;
            
            # 캐시 설정
            location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
                expires 1y;
                add_header Cache-Control "public, immutable";
            }
        }
        
        # 백엔드 API 프록시
        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # 타임아웃 설정
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }
        
        # ChromaDB 프록시
        location /chroma/ {
            proxy_pass http://chromadb:8000/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
EOF

echo "✅ Nginx 설정 파일 생성 완료"

# ===== 실행 스크립트 생성 =====
echo "📜 실행 스크립트를 생성합니다..."

# 개발 환경 실행 스크립트
cat > run_dev.sh << 'EOF'
#!/bin/bash
echo "🚀 CLIKCA 개발 환경을 시작합니다..."

# 환경 변수 로드
if [ -f .env ]; then
    source .env
    echo "✅ .env 파일을 로드했습니다."
else
    echo "❌ .env 파일이 없습니다."
    exit 1
fi

# Docker Compose로 개발 환경 실행
docker-compose up -d mysql chromadb redis backend frontend-dev

echo ""
echo "🎉 개발 환경이 시작되었습니다!"
echo ""
echo "📋 서비스 정보:"
echo "   - Backend API: http://localhost:8000"
echo "   - Frontend Dev: http://localhost:3000"
echo "   - MySQL: localhost:3306"
echo "   - ChromaDB: http://localhost:8001"
echo "   - Redis: localhost:6379"
echo ""
echo "📝 로그 확인:"
echo "   - Backend: docker-compose logs -f backend"
echo "   - Frontend: docker-compose logs -f frontend-dev"
echo "   - MySQL: docker-compose logs -f mysql"
echo ""
EOF

# 프로덕션 환경 실행 스크립트
cat > run_prod.sh << 'EOF'
#!/bin/bash
echo "🚀 CLIKCA 프로덕션 환경을 시작합니다..."

# 환경 변수 로드
if [ -f .env ]; then
    source .env
    echo "✅ .env 파일을 로드했습니다."
else
    echo "❌ .env 파일이 없습니다."
    exit 1
fi

# 프로덕션 환경 변수 설정
export DEBUG=false
export RELOAD=false
export ENVIRONMENT=production

# Docker Compose로 프로덕션 환경 실행
docker-compose --profile production up -d

echo ""
echo "🎉 프로덕션 환경이 시작되었습니다!"
echo ""
echo "📋 서비스 정보:"
echo "   - Frontend: http://localhost"
echo "   - Backend API: http://localhost/api"
echo "   - MySQL: localhost:3306"
echo "   - ChromaDB: http://localhost/chroma"
echo "   - Redis: localhost:6379"
echo ""
echo "📝 로그 확인:"
echo "   - All: docker-compose logs -f"
echo "   - Nginx: docker-compose logs -f nginx"
echo ""
EOF

# 실행 권한 부여
chmod +x run_dev.sh run_prod.sh

echo "✅ 실행 스크립트 생성 완료"

# ===== 완료 메시지 =====
echo ""
echo "🎉 FinalProject 중심 Docker 설정이 완료되었습니다!"
echo ""
echo "📋 생성된 파일들:"
echo "   ✅ .env - 환경 변수 설정"
echo "   ✅ FinalProject/backend/init.sql - MySQL 초기화 스크립트"
echo "   ✅ nginx/nginx.conf - Nginx 설정"
echo "   ✅ run_dev.sh - 개발 환경 실행 스크립트"
echo "   ✅ run_prod.sh - 프로덕션 환경 실행 스크립트"
echo ""
echo "🚀 다음 단계:"
echo "1. .env 파일에서 API 키들을 설정하세요"
echo "2. ./run_dev.sh 로 개발 환경을 시작하세요"
echo "3. Docker 이미지 빌드: docker build -f dockerfile --target development ."
echo ""
echo "🐳 Happy Dockerizing!"
