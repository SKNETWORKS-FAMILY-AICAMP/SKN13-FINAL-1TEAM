#!/bin/bash

# SKN13-FINAL-1TEAM ECR 배포 스크립트
# CLIKCA (Click + Assistant) - RAG 기반 업무 보조 AI 비서

set -e  # 오류 발생 시 스크립트 중단

echo "🚀 SKN13-FINAL-1TEAM ECR 배포를 시작합니다..."

# 환경 변수 로드
if [ -f .env ]; then
    source .env
    echo "✅ .env 파일을 로드했습니다."
else
    echo "❌ .env 파일이 없습니다. setup_docker.sh를 먼저 실행하세요."
    exit 1
fi

# 필수 환경 변수 확인
if [ -z "$ECR_REPOSITORY_URI" ]; then
    echo "❌ ECR_REPOSITORY_URI가 설정되지 않았습니다."
    echo "ECR 리포지토리 URI를 .env 파일에 설정하세요."
    exit 1
fi

# AWS CLI 확인
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI가 설치되지 않았습니다."
    echo "AWS CLI를 설치하고 설정하세요: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

# AWS 자격 증명 확인
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS 자격 증명이 설정되지 않았습니다."
    echo "aws configure로 자격 증명을 설정하세요."
    exit 1
fi

echo "🔐 AWS 자격 증명을 확인했습니다."

# ECR 리포지토리에서 리전 추출
REGION=$(echo $ECR_REPOSITORY_URI | sed 's/.*\.dkr\.ecr\.\([^\.]*\)\.amazonaws\.com.*/\1/')
echo "🌍 AWS 리전: $REGION"

# ECR 로그인
echo "🔐 ECR에 로그인합니다..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY_URI

if [ $? -eq 0 ]; then
    echo "✅ ECR 로그인 성공"
else
    echo "❌ ECR 로그인 실패"
    exit 1
fi

# Docker 이미지 빌드
echo "🔨 Docker 이미지를 빌드합니다..."

# Runtime 이미지 빌드
echo "📦 Runtime 이미지 빌드 중..."
docker build -f dockerfile --target runtime -t skn13-clikca:runtime .

# Development 이미지 빌드
echo "📦 Development 이미지 빌드 중..."
docker build -f dockerfile --target development -t skn13-clikca:dev .

# Production 이미지 빌드
echo "📦 Production 이미지 빌드 중..."
docker build -f dockerfile --target production -t skn13-clikca:prod .

echo "✅ 모든 이미지 빌드 완료"

# ECR용 태깅
echo "🏷️ ECR용 이미지 태깅 중..."

# Runtime 이미지 태깅
docker tag skn13-clikca:runtime $ECR_REPOSITORY_URI:runtime
docker tag skn13-clikca:runtime $ECR_REPOSITORY_URI:latest

# Development 이미지 태깅
docker tag skn13-clikca:dev $ECR_REPOSITORY_URI:dev

# Production 이미지 태깅
docker tag skn13-clikca:prod $ECR_REPOSITORY_URI:prod

echo "✅ 이미지 태깅 완료"

# ECR에 이미지 푸시
echo "📤 ECR에 이미지를 푸시합니다..."

# Runtime 이미지 푸시
echo "📤 Runtime 이미지 푸시 중..."
docker push $ECR_REPOSITORY_URI:runtime
docker push $ECR_REPOSITORY_URI:latest

# Development 이미지 푸시
echo "📤 Development 이미지 푸시 중..."
docker push $ECR_REPOSITORY_URI:dev

# Production 이미지 푸시
echo "📤 Production 이미지 푸시 중..."
docker push $ECR_REPOSITORY_URI:prod

echo "✅ 모든 이미지 푸시 완료"

# ECR 리포지토리 정보 출력
echo ""
echo "🎉 ECR 배포가 완료되었습니다!"
echo ""
echo "📋 배포된 이미지 정보:"
echo "   리포지토리: $ECR_REPOSITORY_URI"
echo "   리전: $REGION"
echo ""
echo "🏷️ 사용 가능한 태그:"
echo "   - latest (최신 버전)"
echo "   - runtime (런타임 환경)"
echo "   - dev (개발 환경)"
echo "   - prod (프로덕션 환경)"
echo ""
echo "🚀 다음 단계:"
echo "1. docker-compose up -d 로 서비스 실행"
echo "2. AWS Console에서 ECR 리포지토리 확인"
echo "3. 로그 확인: docker-compose logs -f [service-name]"
echo ""
echo "🐳 Happy ECR Deploying!"
