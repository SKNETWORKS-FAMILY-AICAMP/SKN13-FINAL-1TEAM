# Frontend Dockerfile
# CLIKCA (Click + Assistant) - RAG 기반 업무 보조 AI 비서

# Build Stage
FROM node:18-alpine AS build
WORKDIR /app

# 프론트엔드 의존성 설치
COPY package*.json ./
RUN npm ci

# 프론트엔드 소스 복사 및 빌드
COPY . ./
RUN npm run build

# Development Stage
FROM node:18-alpine AS development
WORKDIR /app

# 의존성 설치
COPY package*.json ./
RUN npm ci

# 소스 복사
COPY . ./

# 포트 노출
EXPOSE 3000

# 개발용 명령어 (핫 리로드)
CMD ["npm", "run", "dev"]

# Production Stage (Nginx)
FROM nginx:alpine AS production
WORKDIR /usr/share/nginx/html

# 빌드 결과 복사
COPY --from=build /app/dist ./

# 포트 노출
EXPOSE 80

# Nginx 설정
COPY nginx.conf /etc/nginx/nginx.conf

# Runtime Stage (기본)
FROM development AS runtime
CMD ["npm", "start"]
