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

BASE_DIR = r"C:\Users\jhwoo\Desktop\SKN_ws\project\SKN13-FINAL-1TEAM\한국방송광고진흥공사\내부문서\재무성과\_markdown_output"

def collect_markdown_files(base_dir):
    markdown_files = []
    for root, _, files in os.walk(base_dir):
        for f in files:
            if f.lower().endswith(".md"):
                markdown_files.append(os.path.join(root, f))
    return markdown_files

def clean_text(text: str) -> str:
    # Markdown specific cleaning can be added here if needed
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def main():
    splitter = RecursiveCharacterTextSplitter(chunk_size=300, chunk_overlap=50)

    markdown_files = collect_markdown_files(BASE_DIR)
    print(f"총 {len(markdown_files)}개의 마크다운 파일을 찾았습니다.")

    all_chunks: List[Document] = []

    for path in markdown_files:
        with open(path, 'r', encoding='utf-8') as f:
            text = f.read()
        
        text = clean_text(text)
        title = os.path.basename(path).replace(".md", "")
        
        from datetime import datetime

        metadata = {
            "activated": True,
            "content_length": len(text),
            "doc_category": os.path.basename(os.path.dirname(path)), # This will be '_markdown_output'
            "file_type": "md",
            "page": 1, # Markdown files are treated as single documents for now
            "reg_date": datetime.now().isoformat(),
            "source": path, # Full absolute path
            "subject": title,
            "version": "1.0"
        }
        doc = Document(page_content=text, metadata=metadata)

        chunks = splitter.split_documents([doc])
        for i, chunk in enumerate(chunks):
            print(f"DEBUG: Chunk {i} from {path}: {chunk.page_content[:100].encode('utf-8', 'ignore').decode('utf-8')}...") # Print first 100 chars of chunk
        all_chunks.extend(chunks)

    embedding = OpenAIEmbeddings(model="text-embedding-3-large")
    vectorstore = Chroma.from_documents(
        documents=all_chunks,
        embedding=embedding,
        persist_directory="./chroma/kobaco_markdown" # Changed persist directory
    )
    print("[SUCCESS] 마크다운 기반 ChromaDB에 벡터 저장 완료")

if __name__ == "__main__":
    main()
