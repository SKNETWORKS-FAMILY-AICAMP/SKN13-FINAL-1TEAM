from typing import Optional, Dict, Any, List
from langchain_chroma import Chroma
from chromadb.utils import embedding_functions
from langchain_core.tools import tool
from langchain_core.documents import Document
from dotenv import load_dotenv
import os

load_dotenv()

# [수정] 데이터 파이프라인(s3_chroma_pipeline.py)과 완벽히 동일한 설정을 사용합니다.

# 1. 임베딩 함수를 동일하게 설정
embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

# 2. 컬렉션 이름을 동일하게 설정
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "kobaco_pdf_collection")

# 3. DB 경로 설정 (사용자가 수정한 최종 경로)
DB_PATH = "/home/ubuntu/SKN13-FINAL-1TEAM/data/chroma_db"

@tool
def RAG_tool(query: str, filter: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    [Instruction]
    한국방송광고진흥공사의 내부 재무성과 관련 마크다운 문서를 기반으로 정보를 조회하는 RAG 툴입니다.
    이 툴은 특히 재무 성과, 감사 보고서, 내부 규정 등 한국방송광고진흥공사의 특정 내부 문서에 대한 질문에 답변하는 데 사용됩니다.
    외부 정보나 일반적인 지식에 대한 질문에는 적합하지 않습니다.

    [Args]
    query: 사용자가 찾고자 하는 정보에 대한 질문 또는 핵심 키워드입니다. (예: '2023년 재무감사 결과', '을지연습 복무감사 보고서 내용', '내부통제 이행실태 점검 결과')

    [Output]
    This tool returns a list of document chunks. Each chunk is a dictionary containing 'page_content' and 'metadata'.
    The 'metadata' dictionary contains the 'source' of the document, which can be used as a download link.
    If the returned list is empty, it means no relevant information was found.
    """
    # [수정] LangChain Chroma 래퍼를 사용하되, collection_name과 embedding_function을 명시적으로 지정합니다.
    vector_store = Chroma(
        persist_directory=DB_PATH,
        collection_name=CHROMA_COLLECTION_NAME,
        embedding_function=embedding_function,
    )

    retriever = vector_store.as_retriever(search_kwargs={"k": 5})
    docs: List[Document] = retriever.invoke(query)
    
    print(f"Retrieved docs for query '{query}': {docs}")

    # Return a list of dictionaries with content and metadata
    return [
        {"page_content": doc.page_content, "metadata": doc.metadata}
        for doc in docs
    ]

