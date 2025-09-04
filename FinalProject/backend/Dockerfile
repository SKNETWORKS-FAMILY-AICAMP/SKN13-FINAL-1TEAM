# Backend Dockerfile
# CLIKCA (Click + Assistant) - RAG 기반 업무 보조 AI 비서

# Base stage for common dependencies
FROM python:3.11-slim AS base
WORKDIR /app

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Install only essential system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    libpq-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* /var/tmp/*

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt \
    && rm -rf ~/.cache/pip

# Copy backend source code
COPY . ./

# Set proper permissions
RUN chown -R appuser:appuser /app
USER appuser

# Environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Expose port
EXPOSE 8000

# Development stage
FROM base AS development
ENV DEBUG=true
ENV RELOAD=true
ENV ENVIRONMENT=development
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--log-level", "debug"]

# Production stage
FROM base AS production
ENV DEBUG=false
ENV RELOAD=false
ENV ENVIRONMENT=production
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health', timeout=5)" || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker"]

# Runtime stage (default)
FROM production AS runtime
