# FinalProject 중심 최적화된 Dockerfile
# CLIKCA (Click + Assistant) - RAG 기반 업무 보조 AI 비서
# docsparts 경로 반영 최적화

# ===== Base Stage =====
FROM node:18-alpine AS base
WORKDIR /app

# ===== Backend Dependencies Stage =====
FROM python:3.11-slim AS backend-deps
WORKDIR /app

# 시스템 패키지 설치 (Debian 12 호환)
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    libpq-dev \
    libhdf5-dev \
    libhdf5-serial-dev \
    libopenblas-dev \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Python 의존성 설치
COPY FinalProject/backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# ===== Frontend Dependencies Stage =====
FROM node:18-alpine AS frontend-deps
WORKDIR /app

# 프론트엔드 의존성 설치
COPY FinalProject/frontend-ui/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm ci

# ===== Frontend Build Stage =====
FROM frontend-deps AS frontend-build
WORKDIR /app/frontend

# 프론트엔드 소스 복사 및 빌드
# docsparts/time.js 포함하여 전체 소스 복사
COPY FinalProject/frontend-ui/ ./
RUN npm run build

# ===== Electron Dependencies Stage =====
FROM node:18-alpine AS electron-deps
WORKDIR /app

# Electron 의존성 설치
COPY FinalProject/package*.json ./
RUN npm ci

# ===== Runtime Stage =====
FROM python:3.11-slim AS runtime
WORKDIR /app

# 시스템 패키지 설치 (Debian 12 호환)
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    libpq-dev \
    libhdf5-dev \
    libhdf5-serial-dev \
    libopenblas-dev \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Python 의존성 설치
COPY --from=backend-deps /app/backend /app/backend
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# 백엔드 소스 복사
COPY FinalProject/backend/ ./backend/

# 프론트엔드 빌드 결과 복사 (docsparts 포함)
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Electron 관련 파일 복사
COPY FinalProject/main.js ./
COPY FinalProject/preload.js ./
COPY FinalProject/package.json ./

# 포트 노출
EXPOSE 8000

# 환경 변수 설정
ENV PYTHONPATH=/app/backend
ENV PYTHONUNBUFFERED=1

# Production command (8GB 환경 최적화 - 2 vCPU에 맞춤)
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

# ===== Development Stage =====
FROM runtime AS development
WORKDIR /app

# 개발 환경 설정
ENV DEBUG=true
ENV RELOAD=true

# 개발용 명령어 (핫 리로드)
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ===== Production Stage =====
FROM runtime AS production
WORKDIR /app

# 프로덕션 환경 설정
ENV DEBUG=false
ENV RELOAD=false

# 프로덕션용 명령어 (최적화된 워커)
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
