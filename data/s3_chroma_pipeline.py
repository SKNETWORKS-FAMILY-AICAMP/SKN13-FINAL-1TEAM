
import os
import boto3
import chromadb
from chromadb.utils import embedding_functions
from langchain.text_splitter import RecursiveCharacterTextSplitter
from datetime import datetime
from pathlib import Path
import logging
import tempfile
import uuid
import sys

# --- 경로 문제 해결 ---
# 스크립트가 실행되는 폴더를 sys.path에 추가하여,
# 'data_preprocessing' 모듈을 찾을 수 있도록 한다.
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
# --- 경로 문제 해결 ---

# 기존 스크립트에서 필요한 함수를 가져온다.
from data_preprocessing import process_pdf_to_markdown

# ======================== 로깅 설정 ========================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ======================== 환경 변수 및 상수 설정 ========================
AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET", "your-s3-bucket-name") # 실제 버킷 이름으로 변경 필요
AWS_REGION = os.getenv("AWS_REGION", "ap-northeast-2")
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "./chroma_db")
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "kobaco_pdf_collection")

# SentenceTransformer 모델을 사용한 임베딩 함수
# all-MiniLM-L6-v2는 가볍고 효율적인 모델
embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

# ======================== ChromaDB 클라이언트 초기화 ========================
def get_chroma_collection():
    """ChromaDB 클라이언트를 초기화하고 컬렉션을 가져옵니다."""
    try:
        chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
        collection = chroma_client.get_or_create_collection(
            name=CHROMA_COLLECTION_NAME,
            embedding_function=embedding_function,
            metadata={"hnsw:space": "cosine"}
        )
        logger.info(f"ChromaDB 컬렉션 '{CHROMA_COLLECTION_NAME}'에 연결되었습니다.")
        return collection
    except Exception as e:
        logger.error(f"ChromaDB 초기화 실패: {e}", exc_info=True)
        raise

# ======================== S3 PDF 처리 및 임베딩 ========================
def process_s3_pdfs_to_chroma(bucket_name: str, collection):
    """
    S3 버킷에서 PDF 파일을 다운로드하고, 텍스트로 변환한 후,
    Chunking 및 임베딩을 거쳐 ChromaDB에 저장합니다.
    """
    s3_client = boto3.client('s3', region_name=AWS_REGION)
    paginator = s3_client.get_paginator('list_objects_v2')
    
    try:
        pages = paginator.paginate(Bucket=bucket_name)
        pdf_files = [obj['Key'] for page in pages for obj in page.get('Contents', []) if obj['Key'].lower().endswith('.pdf')]
        logger.info(f"S3 버킷 '{bucket_name}'에서 {len(pdf_files)}개의 PDF 파일을 찾았습니다.")
    except Exception as e:
        logger.error(f"S3 버킷에서 파일 목록을 가져오는 데 실패했습니다: {e}")
        return

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
        is_separator_regex=False,
    )

    for s3_key in pdf_files:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_dir_path = Path(temp_dir)
            local_pdf_path = temp_dir_path / Path(s3_key).name
            
            try:
                logger.info(f"'{s3_key}' 다운로드 중...")
                s3_client.download_file(bucket_name, s3_key, str(local_pdf_path))

                # 기존 스크립트를 사용하여 PDF를 텍스트가 포함된 MD 파일로 처리
                # 이 함수는 처리된 MD 파일의 경로를 반환
                logger.info(f"'{local_pdf_path}' 처리 중...")
                processed_md_path = process_pdf_to_markdown(local_pdf_path, temp_dir_path)
                
                if not processed_md_path or not processed_md_path.exists():
                    logger.warning(f"'{s3_key}' 처리 후 결과 파일이 생성되지 않았습니다.")
                    continue

                full_text = processed_md_path.read_text(encoding='utf-8')
                if not full_text.strip():
                    logger.warning(f"'{s3_key}'에서 텍스트를 추출하지 못했습니다.")
                    continue
                
                chunks = text_splitter.split_text(full_text)
                logger.info(f"'{s3_key}'를 {len(chunks)}개의 chunk로 분할했습니다.")

                # 메타데이터 준비
                doc_subject = Path(s3_key).stem
                content_len = len(full_text)
                reg_timestamp = datetime.now().timestamp()

                metadatas = []
                for i, chunk in enumerate(chunks):
                    metadatas.append({
                        "activated": True,
                        "content_length": content_len,
                        "doc_category": "Uncategorized", # 필요 시 카테고리 분류 로직 추가
                        "file_type": "pdf",
                        "page": -1, # process_pdf_to_markdown에서 페이지 정보를 얻기 어려우므로 -1로 설정
                        "reg_date": reg_timestamp,
                        "source": f"s3://{bucket_name}/{s3_key}", # S3 경로
                        "subject": doc_subject,
                        "version": "1.0" # 필요 시 버전 관리 로직 추가
                    })

                # ChromaDB에 데이터 추가
                if chunks:
                    collection.add(
                        documents=chunks,
                        metadatas=metadatas,
                        ids=[f"{s3_key}_chunk_{i}" for i in range(len(chunks))]
                    )
                    logger.info(f"'{s3_key}'의 chunk들을 ChromaDB에 성공적으로 추가했습니다.")

            except Exception as e:
                logger.error(f"'{s3_key}' 처리 중 오류 발생: {e}", exc_info=True)
            finally:
                # 임시 파일은 with 구문 종료 시 자동으로 삭제됨
                pass

# ======================== 메인 실행 ========================
if __name__ == "__main__":
    if AWS_S3_BUCKET == "your-s3-bucket-name":
        logger.error("S3_BUCKET_NAME 환경변수를 설정하거나 스크립트 내에서 직접 버킷 이름을 지정해야 합니다.")
    else:
        try:
            chroma_collection = get_chroma_collection()
            process_s3_pdfs_to_chroma(AWS_S3_BUCKET, chroma_collection)
            logger.info("모든 PDF 파일 처리가 완료되었습니다.")
        except Exception as e:
            logger.critical(f"파이프라인 실행 중 심각한 오류 발생: {e}", exc_info=True)
