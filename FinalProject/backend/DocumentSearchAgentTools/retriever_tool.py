import os
from typing import Dict, Any, List
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document
from langchain_core.tools import tool
from dotenv import load_dotenv

load_dotenv()

class DocumentRetriever:
    """
    A class to retrieve documents from a ChromaDB vector store.
    """
    def __init__(self, db_path: str = None, collection_name: str = None, model_name: str = "text-embedding-3-large"): # Changed default model_name
        """
        Initializes the DocumentRetriever.
        """
        # Corrected DB path to point to project root
        self.db_path = db_path or "../../chroma_db"
        self.collection_name = collection_name or os.getenv("CHROMA_COLLECTION_NAME", "kobaco_pdf_collection")
        # Changed embedding function class and model
        self.embedding_function = OpenAIEmbeddings(model=model_name)
        
        self.vector_store = Chroma(
            persist_directory=self.db_path,
            collection_name=self.collection_name,
            embedding_function=self.embedding_function,
        )
        self.retriever = self.vector_store.as_retriever(search_kwargs={"k": 5})

    def _search_single_query(self, query: str) -> List[Document]:
        """Helper to search for a single query."""
        print(f"Retrieving docs for query '{query}'")
        return self.retriever.invoke(query)

    def search(self, keywords: List[str]) -> Dict[str, Any]:
        """
        Searches for documents using a list of keywords, deduplicates the results, and returns them.
        """
        all_docs = []
        seen_sources = set()
        for q in keywords:
            docs = self._search_single_query(q)
            for doc in docs:
                source = doc.metadata.get('source')
                if source and source not in seen_sources:
                    all_docs.append({"page_content": doc.page_content, "metadata": doc.metadata})
                    seen_sources.add(source)
        return {"retrieved_docs": all_docs}

# Create a single instance of the retriever for the tool
# Pass the model name explicitly to ensure consistency
retriever_instance = DocumentRetriever(model_name="text-embedding-3-large")

@tool
def RAG_search_tool(keywords: List[str]) -> Dict[str, Any]:
    """
    [Instruction]
    한국방송광고진흥공사의 내부 재무성과 관련 마크다운 문서를 기반으로 정보를 조회하는 RAG 툴입니다.
    이 툴은 특히 재무 성과, 감사 보고서, 내부 규정 등 한국방송광고진흥공사의 특정 내부 문서에 대한 질문에 답변하는 데 사용됩니다.
    외부 정보나 일반적인 지식에 대한 질문에는 적합하지 않습니다.

    [Args]
    keywords: 사용자가 찾고자 하는 정보에 대한 질문 또는 핵심 키워드의 리스트입니다. (예: ['2023년 재무감사 결과', '을지연습 복무감사 보고서 내용'])

    [Output]
    This tool returns a list of document chunks. Each chunk is a dictionary containing 'page_content' and 'metadata'.
    The 'metadata' dictionary contains the 'source' of the document, which can be used as a download link.
    If the returned list is empty, it means no relevant information was found.
    """
    return retriever_instance.search(keywords)

if __name__ == '__main__':
    # Test code
    test_queries = [
        "2023년 재무감사 결과",
        "을지연습",
        "내부통제"
    ]
    
    for query in test_queries:
        print(f"--- Testing query: {query} ---")
        results = RAG_search_tool.invoke({"keywords": [query]})
        retrieved_docs = results.get('retrieved_docs', [])
        print(f"검색 결과 ({len(retrieved_docs)}개):\n")
        for doc in retrieved_docs:
            print(f"- 출처: {doc['metadata']['source']}")
            print(f"  내용: {doc['page_content'][:100]}...\n")
        print("-" * 20)