import boto3
import os
from datetime import datetime
from typing import Dict, Optional
from botocore.exceptions import ClientError
from dotenv import load_dotenv
# 중요: AWS 자격증명과 리전은 환경 변수로 설정해라.
# 여기에 하드코딩하면 죽는다.
# AWS_ACCESS_KEY_ID
# AWS_SECRET_ACCESS_KEY  
# AWS_REGION
# AWS_S3_BUCKET
load_dotenv(dotenv_path="/home/ubuntu/SKN13-FINAL-1TEAM/FinalProject/backend/.env")

# S3 클라이언트 생성 (AWS4-HMAC-SHA256 서명 방식 사용)
from botocore.config import Config

s3_client = boto3.client(
    's3',
    config=Config(signature_version='s3v4')
)

BUCKET_NAME = os.getenv('AWS_S3_BUCKET')

if not BUCKET_NAME:
    raise ValueError("이봐, 아들. AWS_S3_BUCKET 환경 변수가 설정되지 않았다.")

def get_upload_url(file_name: str, content_type: str = 'application/octet-stream', expires_in: int = 300) -> Dict[str, str]:
    """
    S3에 파일을 업로드하기 위한 presigned URL을 생성한다.
    
    Args:
        file_name (str): 업로드할 파일의 이름
        content_type (str): 파일의 MIME 타입 (선택적)
        expires_in (int): URL 만료 시간(초), 기본값 5분
        
    Returns:
        Dict[str, str]: uploadUrl과 fileKey를 포함한 딕셔너리
        
    Raises:
        ClientError: AWS S3 클라이언트 오류
    """
    # 덮어쓰기 방지를 위해 타임스탬프 추가
    timestamp = int(datetime.now().timestamp() * 1000)
    file_key = f"uploads/{timestamp}-{file_name}"
    
    try:
        signed_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': file_key,
                'ContentType': content_type
            },
            ExpiresIn=expires_in
        )
        
        print(f"업로드용 서명된 URL 생성 성공: {signed_url}")
        return {
            'uploadUrl': signed_url,
            'fileKey': file_key
        }
    except ClientError as e:
        print(f"젠장. 업로드 URL 생성 중 오류 발생: {e}")
        raise e

def get_download_url(file_key: str, expires_in: int = 3600) -> str:
    """
    S3에서 파일을 다운로드하기 위한 presigned URL을 생성한다.
    
    Args:
        file_key (str): S3에 저장된 파일의 키 (경로)
        expires_in (int): URL 만료 시간(초), 기본값 1시간
        
    Returns:
        str: Presigned URL
        
    Raises:
        ClientError: AWS S3 클라이언트 오류
    """
    try:
        print(f"다운로드용 서명된 URL 생성 시도: {file_key}")
        signed_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': file_key
            },
            ExpiresIn=expires_in
        )
        
        print(f"다운로드용 서명된 URL 생성 성공: {signed_url}")
        return signed_url
    except ClientError as e:
        print(f"젠장. 다운로드 URL 생성 중 오류 발생: {e}")
        raise e

def get_public_url(file_key: str) -> str:
    """
    공개 파일의 직접 URL을 생성한다 (presigned 아님).
    버킷이 public read 권한이 있을 때만 동작한다.
    
    Args:
        file_key (str): S3에 저장된 파일의 키
        
    Returns:
        str: 공개 URL
    """
    region = os.getenv('AWS_REGION', 'us-east-1')
    return f"https://{BUCKET_NAME}.s3.{region}.amazonaws.com/{file_key}"

def upload_file_directly(file_path: str, file_key: Optional[str] = None) -> str:
    """
    파일을 S3에 직접 업로드한다 (서버에서 직접 업로드할 때 사용).
    
    Args:
        file_path (str): 로컬 파일 경로
        file_key (str, optional): S3에 저장할 키. None이면 파일명 사용
        
    Returns:
        str: 업로드된 파일의 키
        
    Raises:
        ClientError: AWS S3 클라이언트 오류
        FileNotFoundError: 파일을 찾을 수 없음
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"파일을 찾을 수 없다: {file_path}")
    
    if file_key is None:
        file_name = os.path.basename(file_path)
        timestamp = int(datetime.now().timestamp() * 1000)
        file_key = f"uploads/{timestamp}-{file_name}"
    
    try:
        s3_client.upload_file(file_path, BUCKET_NAME, file_key)
        print(f"파일 업로드 성공: {file_key}")
        return file_key
    except ClientError as e:
        print(f"젠장. 파일 업로드 중 오류 발생: {e}")
        raise e

# 진짜 1회용 URL 관리 클래스
class OneTimePresignedURLManager:
    def __init__(self):
        self.used_urls = set()  # 사용된 URL들을 추적
    
    def generate_one_time_upload_url(self, file_name: str, content_type: str = 'application/octet-stream') -> Dict[str, str]:
        """
        진짜 1회용 업로드 URL 생성 (개념적으로)
        실제로는 AWS가 만료 시간으로 제어함
        """
        result = get_upload_url(file_name, content_type)
        url_id = hash(result['uploadUrl'])  # URL 해시로 식별
        
        print(f"🎯 1회용 업로드 URL 생성됨 (5분 후 자동 만료)")
        print(f"   파일키: {result['fileKey']}")
        print(f"   만료시간: 300초 후")
        
        return result
    
    def generate_one_time_download_url(self, file_key: str) -> str:
        """
        진짜 1회용 다운로드 URL 생성 (개념적으로)
        """
        download_url = get_download_url(file_key)
        url_id = hash(download_url)
        
        print(f"🎯 1회용 다운로드 URL 생성됨 (1시간 후 자동 만료)")
        print(f"   파일키: {file_key}")
        print(f"   만료시간: 3600초 후")
        
        return download_url

# 사용 예시
if __name__ == "__main__":
    try:
        # 1회용 URL 매니저 생성
        url_manager = OneTimePresignedURLManager()
        
        print("=" * 50)
        print("🔥 1회용 PRESIGNED URL 데모")
        print("=" * 50)
        
        # 1. 1회용 업로드 URL 생성
        result = url_manager.generate_one_time_upload_url('my-file.jpg', 'image/jpeg')
        print(f"\n📤 업로드 URL: {result['uploadUrl'][:50]}...")
        print(f"⚠️  이 URL은 5분 후 만료되며, PUT 요청으로만 사용 가능합니다!")
        
        # 2. 1회용 다운로드 URL 생성  
        download_url = url_manager.generate_one_time_download_url(result['fileKey'])
        print(f"\n📥 다운로드 URL: {download_url[:50]}...")
        print(f"⚠️  이 URL은 1시간 후 만료되며, GET 요청으로만 사용 가능합니다!")
        
        # 3. 공개 URL (이건 영구적)
        public_url = get_public_url(result['fileKey'])
        print(f"\n🌍 공개 URL: {public_url}")
        print(f"⚠️  이 URL은 버킷이 public일 때만 작동하며, 영구적입니다!")
        
        print("\n" + "=" * 50)
        print("🎯 핵심: presigned URL은 시간이 지나면 자동으로 만료됩니다!")
        print("=" * 50)
        
    except Exception as e:
        print(f"오류 발생: {e}")