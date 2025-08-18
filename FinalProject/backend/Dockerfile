# Backend Dockerfile
# CLIKCA (Click + Assistant) - RAG 기반 업무 보조 AI 비서

FROM python:3.11-slim AS base
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
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 백엔드 소스 복사
COPY . ./backend/

# 포트 노출
EXPOSE 8000

# 환경 변수 설정
ENV PYTHONPATH=/app/backend
ENV PYTHONUNBUFFERED=1

# Development Stage
FROM base AS development
ENV DEBUG=true
ENV RELOAD=true
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Production Stage
FROM base AS production
ENV DEBUG=false
ENV RELOAD=false
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

# Runtime Stage (기본)
FROM base AS runtime
ENV DEBUG=false
ENV RELOAD=false
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
