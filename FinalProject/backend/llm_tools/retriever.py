import time
from typing import Optional, Dict, Any
from langchain_chroma import Chroma
from langchain.schema import Document
from langchain_openai import OpenAIEmbeddings
from langchain_core.tools import tool

@tool
def RAG_tool(query: str, filter: Optional[Dict[str, Any]] = None) -> str:
    """
    [Instruction]
    서울정보소통광장에서 **자주 묻는 질문**을 조회하기 위한 RAG 툴입니다.
    120 다산 콜센터에서 관리하는 자주 묻는 질문을 연계하여 제공합니다.

    [Args]
    content는 다음과 같은 컬럼으로 이루어져 있습니다:

    - 질문 : 자주 묻는 질문에 대한 컬럼
    - 본문 : 질문에 대한 답변
    """
    vector_store = Chroma(
        collection_name="QnA", 
        embedding_function=OpenAIEmbeddings(model="text-embedding-3-large"), 
        persist_directory="../chroma_db"
    )

    retriever = vector_store.as_retriever(search_kwargs={"k":10})
    print(f"retiever tool called: {query}")
    docs = retriever.invoke(query)

    result = "\n\n".join([doc.page_content for doc in docs])
    return result[:3000]  # 너무 길어지는 것 방지
