

import boto3
from botocore.exceptions import NoCredentialsError, PartialCredentialsError
from urllib.parse import urlparse
import logging
import os

# ======================== 로깅 설정 ========================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ======================== S3 Presigned URL 생성 툴 ========================

def get_presigned_s3_url(s3_path: str, expiration: int = 3600) -> str:
    """
    S3 경로(예: "s3://bucket-name/path/to/file.pdf")를 받아
    다운로드용 presigned URL을 생성하는 에이전트 툴.

    Args:
        s3_path: "s3://"로 시작하는 전체 S3 객체 경로.
        expiration: URL이 유효한 시간(초 단위). 기본값은 1시간(3600초).

    Returns:
        생성된 presigned URL 문자열. 실패 시 에러 메시지를 담은 문자열을 반환.
    """
    if not s3_path or not s3_path.startswith("s3://"):
        return "오류: 유효하지 않은 S3 경로입니다. 's3://'로 시작해야 합니다."

    aws_region = os.getenv("AWS_REGION", "ap-northeast-2")
    s3_client = boto3.client('s3', region_name=aws_region)

    try:
        parsed_url = urlparse(s3_path, allow_fragments=False)
        bucket_name = parsed_url.netloc
        object_key = parsed_url.path.lstrip('/')

        if not bucket_name or not object_key:
            return f"오류: S3 경로를 파싱할 수 없습니다. 경로: {s3_path}"

        logger.info(f"Presigned URL 생성 요청: Bucket='{bucket_name}', Key='{object_key}'")

        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket_name, 'Key': object_key},
            ExpiresIn=expiration
        )
        return url

    except (NoCredentialsError, PartialCredentialsError):
        logger.error("AWS 자격 증명을 찾을 수 없습니다. 환경 변수나 IAM 역할을 확인하세요.")
        return "오류: AWS 서버에 연결할 수 없습니다. 관리자에게 문의하세요."
    except Exception as e:
        logger.error(f"Presigned URL 생성 중 예기치 않은 오류 발생: {e}", exc_info=True)
        return f"오류: 내부 서버 문제로 URL을 생성하지 못했습니다."

# ======================== 직접 실행하여 테스트 ========================

if __name__ == '__main__':
    # 테스트를 위한 S3 경로 예시
    # 실행 전, AWS 자격 증명이 설정되어 있어야 함 (예: ~/.aws/credentials 또는 IAM 역할)
    # 또한, 아래 버킷과 파일이 실제로 존재해야 URL이 유효함
    import os
    test_s3_path = "s3://clickabbbucket/kobaco_data/관계법령/공공기관의 운영에 관한 법률 시행령(대통령령)(제33078호)(20230101).pdf" # 실제 S3 경로로 변경 필요

    print(f"테스트 S3 경로: {test_s3_path}")

    if "your-real-bucket-name" in test_s3_path:
        print("\n경고: `test_s3_path`를 실제 S3 파일 경로로 변경한 후 테스트하세요.")
    else:
        generated_url = get_presigned_s3_url(test_s3_path)
        print(f"\n생성된 Presigned URL (1시간 유효):\n{generated_url}")

        # 10초만 유효한 URL 생성 테스트
        short_lived_url = get_presigned_s3_url(test_s3_path, expiration=10)
        print(f"\n생성된 Presigned URL (10초 유효):\n{short_lived_url}")


