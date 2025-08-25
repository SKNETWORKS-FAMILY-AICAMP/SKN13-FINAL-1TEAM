# -*- coding: utf-8 -*-

import os
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma

# .env 파일 로드 (OpenAI API 키를 위해)
# .env 파일 경로를 동적으로 설정
from pathlib import Path
dotenv_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=dotenv_path)

# --- 설정 ---
# [수정] 우리가 찾아낸 올바른 DB 경로로 수정
DB_PATH = "/home/ubuntu/SKN13-FINAL-1TEAM/data/chroma_db"

# 확인할 검색어
TEST_QUERY = "내부 감사 문서"

def debug_chromadb():
    """ChromaDB에 연결하여 내용을 확인하는 디버깅 스크립트입니다."""
    print(f"--- ChromaDB 디버깅 시작 ---")
    print(f"데이터베이스 경로: {DB_PATH}")

    # 1. 임베딩 함수와 ChromaDB 클라이언트 초기화
    try:
        embedding_function = OpenAIEmbeddings(model="text-embedding-3-large")
        vector_store = Chroma(
            persist_directory=DB_PATH,
            embedding_function=embedding_function
        )
        print("✅ ChromaDB 연결 성공.")
    except Exception as e:
        print(f"❌ ChromaDB 연결 실패: {e}")
        return

    # 2. 전체 문서 수 확인
    try:
        total_docs = vector_store._collection.count()
        print(f"\n- 총 문서 수: {total_docs}개")
        if total_docs == 0:
            print("  - 데이터베이스가 비어있습니다. 데이터 수집 및 임베딩 파이프라인을 먼저 실행해야 합니다.")
            return
    except Exception as e:
        print(f"❌ 전체 문서 수를 가져오는 중 오류 발생: {e}")

    # 3. 특정 쿼리로 유사도 검색 테스트
    print(f"\n- 테스트 쿼리: '{TEST_QUERY}'")
    try:
        retrieved_docs = vector_store.similarity_search(TEST_QUERY, k=5)
        
        if not retrieved_docs:
            print("  - ‼️ 이 쿼리에 대해 관련된 문서를 찾지 못했습니다.")
            print("  - 원인 1: DB에 관련 내용이 정말로 없음.")
            print("  - 원인 2: 쿼리가 너무 일반적이거나, 문서에 사용된 단어와 다름.")
        else:
            print(f"  - ✅ {len(retrieved_docs)}개의 관련 문서를 찾았습니다:")
            for i, doc in enumerate(retrieved_docs):
                source = doc.metadata.get('source', '출처 불명')
                content_preview = doc.page_content[:100].replace('\n', ' ') + "..."
                print(f"    {i+1}. [출처: {source}] {content_preview}")

    except Exception as e:
        print(f"❌ 유사도 검색 중 오류 발생: {e}")

    # 4. DB에 저장된 문서 샘플 몇 개를 직접 확인
    print("\n- DB 문서 샘플 확인 (처음 5개)")
    try:
        sample_docs = vector_store.get(limit=5, include=["metadatas", "documents"])
        if not sample_docs or not sample_docs.get('ids'):
            print("  - 샘플 문서를 가져올 수 없습니다.")
        else:
            for i in range(len(sample_docs['ids'])):
                metadata = sample_docs['metadatas'][i]
                document = sample_docs['documents'][i][:100].replace('\n', ' ') + "..."
                print(f"    {i+1}. [ID: {sample_docs['ids'][i]}] [출처: {metadata.get('source', 'N/A')}] {document}")
    except Exception as e:
        print(f"❌ 샘플 문서 확인 중 오류 발생: {e}")

    print("\n--- 디버깅 종료 ---")

if __name__ == "__main__":
    debug_chromadb()
