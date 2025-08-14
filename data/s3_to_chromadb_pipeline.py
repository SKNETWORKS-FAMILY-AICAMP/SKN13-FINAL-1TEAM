import os
import sys
import boto3
import chromadb
import logging
from pathlib import Path
from datetime import datetime
import tempfile
import shutil
from tqdm import tqdm
from dotenv import load_dotenv
load_dotenv()

# ======================== 시스템 경로 강제 주입 ========================
# 이 스크립트의 위치를 기준으로 프로젝트 루트 경로를 계산하여 시스템 경로에 추가한다.
# 이렇게 하면 모듈 경로 문제에서 벗어날 수 있다.
try:
    project_root = Path(__file__).resolve().parents[3] 
    if str(project_root) not in sys.path:
        sys.path.append(str(project_root))
except NameError:
    # 대화형 환경 등에서 __file__이 정의되지 않은 경우를 대비
    project_root = Path('.').resolve()
    if str(project_root) not in sys.path:
        sys.path.append(str(project_root))

# 이제 data 모듈을 확실하게 임포트할 수 있다.
from data.data_preprocessing import process_pdf_to_markdown, stitch_markdown_flow_for_vector

# ======================== 로깅 설정 ========================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ======================== 설정 변수 ========================
# 사용자의 환경에 맞게 수정해야 할 값들
AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET")  # 본인의 S3 버킷 이름으로 변경
CHROMA_DB_PATH = "./chroma_db"  # ChromaDB를 저장할 로컬 경로
COLLECTION_NAME = "kobaco_pdf_collection" # ChromaDB 컬렉션 이름
AWS_REGION = os.getenv("AWS_REGION") # AWS 리전

# ======================== S3 클라이언트 초기화 ========================
def get_s3_client():
    """S3 클라이언트를 생성하고 반환한다."""
    try:
        s3_client = boto3.client('s3', region_name=AWS_REGION)
        # 간단한 호출로 자격 증명 확인
        s3_client.head_bucket(Bucket=AWS_S3_BUCKET)
        logger.info("S3 클라이언트 연결 성공 및 버킷 확인 완료.")
        return s3_client
    except Exception as e:
        logger.error(f"S3 클라이언트 생성 또는 버킷 접근 실패: {e}")
        logger.error("AWS 자격 증명(Access Key, Secret Key)이 올바르게 설정되었는지 확인하십시오.")
        logger.error("IAM 사용자에게 S3 버킷에 대한 ListBucket, GetObject 권한이 필요합니다.")
        return None

def list_s3_pdfs(s3_client, bucket_name):
    """S3 버킷에서 모든 PDF 파일의 목록을 가져온다."""
    try:
        paginator = s3_client.get_paginator('list_objects_v2')
        page_iterator = paginator.paginate(Bucket=bucket_name)
        pdf_files = []
        for page in page_iterator:
            if "Contents" in page:
                for obj in page['Contents']:
                    if obj['Key'].lower().endswith('.pdf'):
                        pdf_files.append(obj['Key'])
        logger.info(f"S3 버킷 '{bucket_name}'에서 {len(pdf_files)}개의 PDF 파일을 찾았습니다.")
        return pdf_files
    except Exception as e:
        logger.error(f"S3 버킷에서 파일 목록을 가져오는 중 오류 발생: {e}")
        return []

# ======================== ChromaDB 클라이언트 초기화 ========================
def get_chromadb_collection():
    """ChromaDB 클라이언트를 초기화하고 컬렉션을 가져오거나 생성한다."""
    try:
        client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
        collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"} # 코사인 유사도 사용
        )
        logger.info(f"ChromaDB 컬렉션 '{COLLECTION_NAME}'에 연결되었습니다.")
        return collection
    except Exception as e:
        logger.error(f"ChromaDB 초기화 또는 컬렉션 생성 실패: {e}")
        return None

# ======================== 메인 파이프라인 ========================
def process_and_embed_pipeline():
    """S3에서 PDF를 다운로드하고, 처리하여 ChromaDB에 임베딩하는 전체 파이프라인."""
    s3_client = get_s3_client()
    if not s3_client:
        return

    collection = get_chromadb_collection()
    if not collection:
        return

    pdf_keys = list_s3_pdfs(s3_client, AWS_S3_BUCKET)
    if not pdf_keys:
        logger.warning("처리할 PDF 파일이 없습니다.")
        return

    # 임시 디렉터리 생성
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        pdf_download_dir = temp_path / "pdfs"
        md_output_dir = temp_path / "markdowns"
        pdf_download_dir.mkdir()
        md_output_dir.mkdir()

        logger.info(f"임시 디렉터리 생성: {temp_dir}")

        for pdf_key in tqdm(pdf_keys, desc="PDF 처리 및 임베딩"):
            try:
                # 1. S3에서 PDF 다운로드
                local_pdf_path = pdf_download_dir / Path(pdf_key).name
                logger.info(f"'{pdf_key}' 다운로드 중 -> {local_pdf_path}")
                s3_client.download_file(AWS_S3_BUCKET, pdf_key, str(local_pdf_path))

                # 2. data_preprocessing.py를 통해 PDF를 MD로 변환
                # 이 함수는 처리된 텍스트가 담긴 md 파일의 경로를 반환한다.
                processed_md_path = process_pdf_to_markdown(local_pdf_path, md_output_dir)
                
                if not processed_md_path or not processed_md_path.exists():
                    logger.warning(f"'{local_pdf_path.name}' 처리 후 마크다운 파일이 생성되지 않았습니다. 건너뜁니다.")
                    continue

                # 3. 생성된 MD 파일 읽기
                full_text_content = processed_md_path.read_text(encoding="utf-8")
                content_length = len(full_text_content)
                
                # 벡터화를 위해 텍스트를 문장/단락으로 분할
                chunks = stitch_markdown_flow_for_vector(full_text_content)
                
                if not chunks:
                    logger.warning(f"'{processed_md_path.name}'에서 벡터화할 텍스트를 추출하지 못했습니다.")
                    continue

                # 4. 메타데이터 생성 및 ChromaDB에 임베딩
                doc_subject = Path(pdf_key).stem
                documents_to_add = []
                metadatas_to_add = []
                ids_to_add = []

                for i, chunk in enumerate(chunks):
                    metadata = {
                        "activated": True,
                        "content_length": content_length,
                        "doc_category": "PDF",  # 문서 카테고리 (필요 시 로직 추가)
                        "file_type": "pdf",
                        "page": i + 1,  # 청크 순서를 페이지처럼 사용
                        "reg_date": datetime.now().isoformat(),
                        "source": pdf_key,  # S3 경로 (다운로드에 사용)
                        "subject": doc_subject,
                        "version": "1.0"  # 버전 (필요 시 로직 추가)
                    }
                    
                    doc_id = f"{pdf_key}_chunk_{i}"

                    documents_to_add.append(chunk)
                    metadatas_to_add.append(metadata)
                    ids_to_add.append(doc_id)

                if documents_to_add:
                    collection.add(
                        documents=documents_to_add,
                        metadatas=metadatas_to_add,
                        ids=ids_to_add
                    )
                    logger.info(f"'{pdf_key}'에서 {len(documents_to_add)}개의 청크를 ChromaDB에 추가했습니다.")

            except Exception as e:
                logger.error(f"'{pdf_key}' 처리 중 파이프라인 오류 발생: {e}", exc_info=True)

    logger.info("모든 PDF 파일의 처리 및 임베딩이 완료되었습니다.")

if __name__ == "__main__":
    # OpenAI API 키가 환경 변수에 설정되어 있는지 확인
    if "OPENAI_API_KEY" not in os.environ:
        logger.error("OPENAI_API_KEY 환경 변수가 설정되지 않았습니다. .env 파일을 생성하거나 직접 설정하십시오.")
    else:
        process_and_embed_pipeline()