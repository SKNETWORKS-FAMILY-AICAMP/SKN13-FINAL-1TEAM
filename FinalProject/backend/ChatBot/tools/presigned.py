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
# S3_SHARED_BUCKET
load_dotenv("/home/ubuntu/SKN13-FINAL-1TEAM/FinalProject/backend/.env")

# S3 클라이언트 생성
s3_client = boto3.client('s3')

BUCKET_NAME = os.getenv('S3_SHARED_BUCKET')

import re
from urllib.parse import quote, unquote

# ---------------------------
# 유틸: 표시용 이름 계산 로직
# ---------------------------

def _split_name_and_ext(file_name: str):
    """파일명과 확장자 분리 ('보고서.v1.pdf' -> ('보고서.v1', '.pdf'))"""
    dot = file_name.rfind(".")
    if dot == -1:
        return file_name, ""
    return file_name[:dot], file_name[dot:]

def _escape_regex(s: str) -> str:
    return re.sub(r"[.*+?^${}()|[\]\\]", r"\\\g<0>", s)

def _list_objects_by_prefix(bucket: str, prefix: str):
    """S3 list_objects_v2 (페이지네이션 포함)"""
    continuation = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": prefix, "MaxKeys": 1000}
        if continuation:
            kwargs["ContinuationToken"] = continuation
        resp = s3_client.list_objects_v2(**kwargs)
        for obj in resp.get("Contents", []):
            yield obj["Key"]
        if not resp.get("IsTruncated"):
            break
        continuation = resp.get("NextContinuationToken")

def count_existing_same_title(bucket: str, base_prefix: str, file_name: str) -> int:
    """
    '타임스탬프-원본이름' 규칙을 유지하면서,
    같은 '원본이름(file_name)'을 가진 기존 업로드 개수를 센다.
    예) uploads/1725-보고서.pdf, uploads/1726-보고서.pdf => 2개
    """
    # 타임스탬프-원본이름 구조이므로 Prefix는 base_prefix로만 필터링,
    # 끝이 "-{file_name}"인 키만 세서 개수를 구한다.
    suffix = f"-{file_name}"
    count = 0
    for key in _list_objects_by_prefix(bucket, base_prefix):
        if key.endswith(suffix):
            count += 1
    return count

def next_display_name_for_timestamp_mode(bucket: str, base_prefix: str, file_name: str) -> str:
    """
    S3 객체 키는 타임스탬프-원본이름을 유지.
    화면에 보여줄 '표시용 이름'만 같은 제목이 있으면 (1), (2) ...를 붙여 반환.
    """
    stem, ext = _split_name_and_ext(file_name)
    # 이미 저장된 '같은 원본이름' 개수
    existing = count_existing_same_title(bucket, base_prefix, file_name)
    if existing <= 0:
        return file_name
    else:
        # existing=1이면 "(1)", existing=2면 "(2)" ...
        return f"{stem} ({existing}){ext}"

# ----------------------------------------
# 필수 환경 변수 확인
# ----------------------------------------
if not BUCKET_NAME:
    raise ValueError("이봐, 아들. AWS_S3_BUCKET 환경 변수가 설정되지 않았다.")

# ----------------------------------------
# 업로드 Presigned URL (타임스탬프 키 유지 + 표시명 반환)
# ----------------------------------------
def get_upload_url(file_name: str,
                   content_type: str = 'application/octet-stream',
                   expires_in: int = 300) -> Dict[str, str]:
    """
    S3 업로드용 presigned URL 생성.
    - S3 키: uploads/{timestamp}-{file_name} (기존 충돌 방지 방식 유지)
    - 표시용 이름: 기존 동일 제목 개수 기반으로 '이름 (1).확장자' 형태 계산
    반환:
      {
        uploadUrl,          # PUT presigned URL
        fileKey,            # 실제 S3 Key (timestamp-원본이름)
        displayName         # UI에 보여줄 '이름 (n).확장자'
      }
    """
    base_prefix = "uploads/"
    decoded_name = unquote(file_name)

    # 1) 표시용 이름 계산 (키는 바꾸지 않음)
    display_name = next_display_name_for_timestamp_mode(BUCKET_NAME, base_prefix, decoded_name)

    # 2) 실제 저장될 키는 타임스탬프 기반으로 유지
    timestamp = int(datetime.now().timestamp() * 1000)
    file_key = f"{base_prefix}{timestamp}-{decoded_name}"

    try:
        signed_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': file_key,
                'ContentType': content_type,
                # 필요 시 여기에 객체 메타데이터로 표시명을 함께 저장 가능:
                # 'Metadata': {'display-name': display_name},
            },
            ExpiresIn=expires_in
        )
        return {
            'uploadUrl': signed_url,
            'fileKey': file_key,          # 실제 S3 키 (타임스탬프-원본이름)
            'displayName': display_name   # 사용자에게 보여줄 이름 (이름 (n).확장자)
        }
    except ClientError as e:
        print(f"업로드 URL 생성 중 오류: {e}")
        raise

# ----------------------------------------
# 다운로드 Presigned URL (표시명으로 저장되도록 강제 가능)
# ----------------------------------------
def get_download_url(file_key: str,
                     display_name: Optional[str] = None,
                     expires_in: int = 3600) -> str:
    """
    S3에서 파일을 다운로드하기 위한 presigned URL 생성.
    display_name이 주어지면 Content-Disposition을 통해 저장 파일명을 강제한다.
    """
    try:
        params = {
            'Bucket': BUCKET_NAME,
            'Key': file_key
        }
        if display_name:
            # UTF-8 안전: RFC 5987 형식 사용 (filename*)
            params['ResponseContentDisposition'] = f"attachment; filename*=UTF-8''{quote(display_name)}"

        signed_url = s3_client.generate_presigned_url(
            'get_object',
            Params=params,
            ExpiresIn=expires_in
        )
        print(f"다운로드용 서명된 URL 생성 성공: {signed_url}")
        return signed_url
    except ClientError as e:
        print(f"젠장. 다운로드 URL 생성 중 오류 발생: {e}")
        raise e

# ----------------------------------------
# 공개 URL (버킷이 public-read일 때만)
# ----------------------------------------
def get_public_url(file_key: str) -> str:
    """
    공개 파일의 직접 URL을 생성한다 (presigned 아님).
    버킷이 public read 권한이 있을 때만 동작한다.
    """
    region = os.getenv('AWS_REGION', 'us-east-1')
    return f"https://{BUCKET_NAME}.s3.{region}.amazonaws.com/{file_key}"

# ----------------------------------------
# 서버에서 직접 업로드 (옵션) - 기존 로직 유지
# ----------------------------------------
def upload_file_directly(file_path: str, file_key: Optional[str] = None) -> str:
    """
    파일을 S3에 직접 업로드한다 (서버에서 직접 업로드할 때 사용).
    기본값은 타임스탬프-원본이름을 사용(프론트/백엔드 일관성).
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

# ----------------------------------------
# 1회용 URL 매니저 (데모)
# ----------------------------------------
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
        print(f"   표시명: {result['displayName']}")
        print(f"   만료시간: 300초 후")

        return result

    def generate_one_time_download_url(self, file_key: str, display_name: Optional[str] = None) -> str:
        """
        진짜 1회용 다운로드 URL 생성 (개념적으로)
        """
        download_url = get_download_url(file_key, display_name)
        url_id = hash(download_url)

        print(f"🎯 1회용 다운로드 URL 생성됨 (1시간 후 자동 만료)")
        print(f"   파일키: {file_key}")
        if display_name:
            print(f"   저장명: {display_name}")
        print(f"   만료시간: 3600초 후")

        return download_url

# ---------------------------
# 사용 예시 (로컬 테스트)
# ---------------------------
if __name__ == "__main__":
    try:
        url_manager = OneTimePresignedURLManager()

        print("=" * 50)
        print("🔥 1회용 PRESIGNED URL 데모")
        print("=" * 50)

        # 1. 업로드용 URL 생성 (표시명은 내부에서 계산)
        result = url_manager.generate_one_time_upload_url('my-file.jpg', 'image/jpeg')
        print(f"\n📤 업로드 URL: {result['uploadUrl'][:50]}...")
        print(f"📝 표시명: {result['displayName']}")
        print(f"⚠️  이 URL은 5분 후 만료되며, PUT 요청으로만 사용 가능합니다!")

        # 2. 다운로드 URL 생성 (표시명으로 저장되도록 강제)
        download_url = url_manager.generate_one_time_download_url(result['fileKey'], display_name=result['displayName'])
        print(f"\n📥 다운로드 URL: {download_url[:50]}...")
        print(f"⚠️  이 URL은 1시간 후 만료되며, GET 요청으로만 사용 가능합니다!")

        # 3. 공개 URL (이건 영구적)
        public_url = get_public_url(result['fileKey'])
        print(f"\n🌍 공개 URL: {public_url}")
        print(f"⚠️  이 URL은 버킷이 public일 때만 작동하며, 영구적입니다!")

        print("\n" + "=" * 50)
        print("🎯 핵심: S3 키는 타임스탬프-원본이름으로 안전하게 유지하고,")
        print("        사용자에게는 '이름 (n).확장자'로 친절하게 보여준다!")
        print("=" * 50)

    except Exception as e:
        print(f"오류 발생: {e}")
