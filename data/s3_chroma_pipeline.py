import os
import boto3
from langchain_chroma import Chroma
from langchain_openai.embeddings import OpenAIEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from datetime import datetime
from pathlib import Path
import logging
import tempfile
import sys

# --- 경로 문제 해결 ---
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
# --- 경로 문제 해결 ---

from data_preprocessing import process_pdf_to_markdown

# ======================== 로깅 설정 ========================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ======================== 환경 변수 및 상수 설정 ========================
AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET", "your-s3-bucket-name")
AWS_REGION = os.getenv("AWS_REGION", "ap-northeast-2")
# Corrected DB Path to point to the project root
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "../chroma_db") 
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "kobaco_pdf_collection")

embedding_function = OpenAIEmbeddings(model="text-embedding-3-large")

# ======================== ChromaDB 클라이언트 초기화 ========================
def get_chroma_collection():
    """ChromaDB 클라이언트를 초기화하고 컬렉션을 가져옵니다."""
    try:
        # Using LangChain's Chroma wrapper directly
        vector_store = Chroma(
            embedding_function=embedding_function,
            collection_name=CHROMA_COLLECTION_NAME,
            persist_directory=CHROMA_DB_PATH, # Use the consistent path
        )
        logger.info(f"ChromaDB 컬렉션 '{CHROMA_COLLECTION_NAME}'에 연결되었습니다.")
        return vector_store
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
        s3_prefix = "kobaco_data/내부문서/투자/"
        logger.info(f"S3 경로 '{s3_prefix}'에서 파일을 찾습니다.")

        pages = paginator.paginate(Bucket=bucket_name, Prefix=s3_prefix)
        pdf_files = [obj['Key'] for page in pages for obj in page.get('Contents', []) if obj['Key'].lower().endswith('.pdf')]
        logger.info(f"S3 버킷 '{bucket_name}'의 '{s3_prefix}' 경로에서 {len(pdf_files)}개의 PDF 파일을 찾았습니다.")
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

                metadatas = []
                for i, chunk in enumerate(chunks):
                    metadatas.append({
                        "source": f"s3://{bucket_name}/{s3_key}",
                    })

                if chunks:
                    collection.add_texts(
                        texts=chunks,
                        metadatas=metadatas,
                        ids=[f"{s3_key}_chunk_{i}" for i in range(len(chunks))]
                    )
                    logger.info(f"'{s3_key}'의 chunk들을 ChromaDB에 성공적으로 추가했습니다.")

            except Exception as e:
                logger.error(f"'{s3_key}' 처리 중 오류 발생: {e}", exc_info=True)

# ======================== 메인 실행 ========================
if __name__ == "__main__":
    if AWS_S3_BUCKET == "your-s3-bucket-name":
        logger.error("AWS_S3_BUCKET 환경변수를 설정하거나 스크립트 내에서 직접 버킷 이름을 지정해야 합니다.")
    else:
        try:
            chroma_collection = get_chroma_collection()
            process_s3_pdfs_to_chroma(AWS_S3_BUCKET, chroma_collection)
            logger.info("모든 PDF 파일 처리가 완료되었습니다.")
        except Exception as e:
            logger.critical(f"파이프라인 실행 중 심각한 오류 발생: {e}", exc_info=True)