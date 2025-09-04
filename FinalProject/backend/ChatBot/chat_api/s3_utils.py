import boto3
from botocore.config import Config

_s3 = boto3.client("s3", config=Config(retries={"max_attempts": 3, "mode": "standard"}))

def delete_objects(bucket: str, keys: list[str]) -> None:
    if not keys:
        return
    # 1000개 단위로 삭제
    for i in range(0, len(keys), 1000):
        chunk = keys[i : i + 1000]
        _s3.delete_objects(
            Bucket=bucket,
            Delete={"Objects": [{"Key": k} for k in chunk], "Quiet": True},
        )
