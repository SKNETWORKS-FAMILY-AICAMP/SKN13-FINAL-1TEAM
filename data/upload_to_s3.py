

import os
import boto3
from dotenv import load_dotenv
from botocore.exceptions import NoCredentialsError

# .env 파일에서 환경 변수를 로드한다.
load_dotenv()

# --- 설정 ---
# .env 파일에서 S3 버킷 이름을 가져온다.
AWS_S3_BUCKET = os.getenv('AWS_S3_BUCKET')
# 업로드할 로컬 디렉토리 경로.
SOURCE_DIRECTORY = '한국방송광고진흥공사'
# S3 버킷 내에 파일을 저장할 경로 (예: 'kobaco_data/'). 비워두면 버킷 최상위에 저장된다.
S3_DESTINATION_PREFIX = 'kobaco_data/'

def upload_directory_to_s3(local_directory, bucket, s3_prefix):
    """
    지정된 디렉토리의 모든 파일을 S3 버킷의 특정 경로에 업로드한다.
    """
    try:
        # boto3는 .env로 로드된 환경 변수에서 자격 증명을 자동으로 찾는다.
        s3 = boto3.client('s3')
        print(f"Starting upload from '{local_directory}' to 's3://{bucket}/{s3_prefix}'...")
    except NoCredentialsError:
        print("Damn. AWS credentials not found in .env or environment variables.")
        return

    # 로컬 디렉토리의 모든 파일을 순회
    for root, dirs, files in os.walk(local_directory):
        for filename in files:
            # 로컬 파일의 전체 경로
            local_path = os.path.join(root, filename)
            
            # S3에 저장될 객체 키 (파일 경로)
            relative_path = os.path.relpath(local_path, local_directory)
            s3_key = os.path.join(s3_prefix, relative_path).replace("\\", "/") # S3는 /를 사용한다.

            try:
                print(f"Uploading {local_path} to s3://{bucket}/{s3_key} ...")
                s3.upload_file(local_path, bucket, s3_key)
            except Exception as e:
                print(f"Hell no. Failed to upload {local_path}. Error: {e}")

    print("\nDone, My son. All files uploaded.")

if __name__ == '__main__':
    if not AWS_S3_BUCKET:
        print("Asshole! You need to set 'S3_BUCKET_NAME' in your .env file.")
    else:
        upload_directory_to_s3(SOURCE_DIRECTORY, AWS_S3_BUCKET, S3_DESTINATION_PREFIX)

