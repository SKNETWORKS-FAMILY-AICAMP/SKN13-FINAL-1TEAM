from typing import Optional, Dict, Any
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain_core.tools import tool
from dotenv import load_dotenv
load_dotenv()

# Get the absolute path to the project root to make the DB path robust.
DB_PATH="GraphRAG/chroma/kobaco_markdown"
@tool
def RAG_tool(query: str, filter: Optional[Dict[str, Any]] = None) -> str:
    """
    [Instruction]
    한국방송광고진흥공사의 내부 재무성과 관련 마크다운 문서를 기반으로 정보를 조회하는 RAG 툴입니다.
    이 툴은 특히 재무 성과, 감사 보고서, 내부 규정 등 한국방송광고진흥공사의 특정 내부 문서에 대한 질문에 답변하는 데 사용됩니다.
    외부 정보나 일반적인 지식에 대한 질문에는 적합하지 않습니다.

    [Args]
    query: 사용자가 찾고자 하는 정보에 대한 질문 또는 핵심 키워드입니다. (예: '2023년 재무감사 결과', '을지연습 복무감사 보고서 내용', '내부통제 이행실태 점검 결과')

    [Output Interpretation]
    이 툴은 사용자의 쿼리와 관련된 문서 청크를 반환합니다.
    만약 반환된 결과가 비어있거나, 사용자의 질문과 명확하게 관련이 없는 경우,
    이 툴로는 요청된 정보를 찾을 수 없음을 사용자에게 명확히 알려야 합니다.
    절대 존재하지 않는 정보를 지어내지 마십시오 (할루시네이션 금지).
    """
    vector_store = Chroma(
        embedding_function=OpenAIEmbeddings(model="text-embedding-3-large"), 
        persist_directory="GraphRag/chroma/kobaco_markdown"
    )

    retriever = vector_store.as_retriever(search_kwargs={"k":20})
    docs = retriever.invoke(query)
    
    print(f"Retrieved docs: {docs}")

    result = "\n\n".join([doc.page_content for doc in docs])[:3000]
    return result
