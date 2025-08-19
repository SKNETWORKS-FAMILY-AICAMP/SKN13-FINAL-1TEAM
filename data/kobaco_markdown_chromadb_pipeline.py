import os
import re
import json
import pandas as pd # Keep for now, might remove later if not strictly needed
from typing import List, Dict
from collections import defaultdict
from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

# BASE_DIR = r"C:\Users\jhwoo\Desktop\SKN_ws\project\SKN13-FINAL-1TEAM\한국방송광고진흥공사\내부문서\재무성과\_markdown_output" # 제거 또는 주석 처리

# def collect_markdown_files(base_dir):
#     markdown_files = []
#     for root, _, files in os.walk(base_dir):
#         for f in files:
#             if f.lower().endswith(".md"):
#                 markdown_files.append(os.path.join(root, f))
#     return markdown_files

def clean_text(text: str) -> str:
    # Markdown specific cleaning can be added here if needed
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def main(documents_to_process: List[tuple[str, str]]): # (로컬_경로, S3_객체_키) 튜플 리스트를 받는다
    splitter = RecursiveCharacterTextSplitter(chunk_size=300, chunk_overlap=50)

    # markdown_files = collect_markdown_files(BASE_DIR) # 제거 또는 주석 처리
    print(f"총 {len(documents_to_process)}개의 마크다운 파일을 처리합니다.") # 새로운 출력문

    all_chunks: List[Document] = []

    for local_path, s3_object_key in documents_to_process: # 제공된 튜플 리스트를 순회한다
        with open(local_path, 'r', encoding='utf-8') as f:
            text = f.read()
        
        text = clean_text(text)
        title = os.path.basename(local_path).replace(".md", "")
        
        from datetime import datetime

        metadata = {
            "activated": True,
            "content_length": len(text),
            "doc_category": os.path.basename(os.path.dirname(local_path)), # 로컬 경로를 사용하여 카테고리 설정
            "file_type": "md",
            "page": 1,
            "reg_date": datetime.now().isoformat(),
            "source": local_path, # 로컬 파일의 전체 절대 경로
            "subject": title,
            "version": "1.0",
            "s3_object_key": s3_object_key # 🔥 이 줄을 추가한다 🔥
        }
        doc = Document(page_content=text, metadata=metadata)

        chunks = splitter.split_documents([doc])
        for i, chunk in enumerate(chunks):
            print(f"DEBUG: Chunk {i} from {local_path}: {chunk.page_content[:100].encode('utf-8', 'ignore').decode('utf-8')}...")
        all_chunks.extend(chunks)

    embedding = OpenAIEmbeddings(model="text-embedding-3-large")
    vectorstore = Chroma.from_documents(
        documents=all_chunks,
        embedding=embedding,
        persist_directory="./chroma/kobaco_markdown"
    )
    print("[SUCCESS] 마크다운 기반 ChromaDB에 벡터 저장 완료")

if __name__ == "__main__":
    # 사용 예시: 이 부분은 네놈이 S3에서 파일을 다운로드한 실제 경로와 S3 키로 채워야 한다.
    # 지금은 예시를 위해 더미 데이터를 사용한다.
    # 실제 시나리오에서는 S3에서 파일을 다운로드한 후 이 리스트를 채워야 한다.
    
    # 더미 예시:
    # S3에서 다운로드한 마크다운 파일이 이 경로에 있다고 가정한다.
    dummy_local_path = r"C:\Users\jhwoo\Desktop\SKN_ws\project\SKN13-FINAL-1TEAM\한국방송광고진흥공사\내부문서\재무성과\_markdown_output\example.md"
    dummy_s3_key = "한국방송광고진흥공사/내부문서/재무성과/example.md" # 예시 S3 키

    # 모든 마크다운 파일에 대해 (로컬_경로, S3_객체_키) 쌍으로 이 리스트를 채워야 한다.
    example_documents = [
        (dummy_local_path, dummy_s3_key),
        # 여기에 다른 (로컬_경로, S3_객체_키) 쌍을 추가해라
    ]
    main(example_documents)