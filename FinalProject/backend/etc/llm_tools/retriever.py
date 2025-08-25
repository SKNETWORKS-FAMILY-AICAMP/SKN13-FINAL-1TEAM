from typing import Optional, Dict, Any, List
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain_core.tools import tool
from langchain_core.documents import Document
from dotenv import load_dotenv

load_dotenv()

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
    vector_store = Chroma(
        embedding_function=OpenAIEmbeddings(model="text-embedding-3-large"), 
        persist_directory="../../chroma_db",
        collection_name="kobaco_pdf_collection"
    )

    retriever = vector_store.as_retriever(search_kwargs={"k": 5})
    docs: List[Document] = retriever.invoke(query)
    
    print(f"Retrieved docs for query '{query}': {docs}")

    # Return a list of dictionaries with content and metadata
    return [
        {"page_content": doc.page_content, "metadata": doc.metadata}
        for doc in docs
    ]

