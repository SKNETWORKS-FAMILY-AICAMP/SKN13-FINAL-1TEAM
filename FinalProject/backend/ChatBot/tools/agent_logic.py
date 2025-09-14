# agent_logic.py
# This file contains the core logic tools for the RAG agent, encapsulated in a class.

from typing import Dict, Any, List
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from ..core.AgentState import AgentState
from ...presigned import get_download_url
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)
class AgentTools:
    """Encapsulates the logical tools for the document search agent."""
    def __init__(self, llm: Any):
        """Initializes the tools with a language model instance."""
        self.llm = llm

    @tool
    def expand_query_tool(self, query: str) -> Dict[str, Any]:
        """
        사용자의 원본 질문을 기반으로 검색에 효과적인 쿼리 생성
        """
        prompt = f"""당신은 검색 쿼리 생성 전문가입니다. 사용자의 질문을 분석하여, 
벡터 데이터베이스 검색에 사용할 수 있는 다양하고 구체적인 검색 질문 3개를 생성해주세요.
각 질문은 한 줄로 구분합니다.

원본 질문: {query}

생성된 검색 질문:"""
        response = self.llm.invoke([HumanMessage(content=prompt)])
        expanded_queries = response.content.strip().split('\n')
        queries = [query] + [q.strip() for q in expanded_queries if q.strip()]
        return {"expanded_queries": queries}

    @tool
    def route_query_tool(self, state: AgentState) -> Dict[str, Any]:
        """
        LLM을 사용하여 사용자의 최신 질문이 후속 질문인지, 신규 검색인지 지능적으로 판단합니다.
        """
        if not state.get("retrieved_docs"):
            return {"is_follow_up": False, "original_query": state["messages"][-1].content}

        last_query = state["messages"][-1].content
        
        history = ""
        if len(state["messages"]) > 1:
            for msg in state["messages"][:-1]:
                history += f"{msg.type}: {msg.content}\n"
        history = history.strip()

        prompt = f"""당신은 사용자의 의도를 분석하는 전문가입니다. 주어진 대화 기록과 마지막 질문을 바탕으로, 그 질문이 '후속 질문'인지 '새로운 검색'인지 분류해주세요.

- '후속 질문': 이미 제공된 정보에 대해 더 자세한 내용을 묻거나, 링크를 열어달라고 하는 등 대화의 맥락에 강하게 의존하는 질문입니다. (예: "더 자세히 알려줘", "두 번째 링크는 뭐야?", "그거 흥미롭네")
- '새로운 검색': 이전 대화와 관련이 적은 새로운 주제에 대한 질문입니다.

---
대화 기록:
{history}

분석할 마지막 질문: "{last_query}"
---

분류 결과 ('후속 질문' 또는 '새로운 검색' 이 두 단어 중 하나로만 답변해주세요):"""

        response = self.llm.invoke([SystemMessage(content=prompt)])
        decision = response.content.strip()

        is_follow_up = (decision == '후속 질문')
        
        return {"is_follow_up": is_follow_up, "original_query": last_query}

    @tool
    def handle_follow_up_tool(self, state: AgentState) -> Dict[str, Any]:
        """
        후속 질문 처리, 상태 변경 없이 기존 retrieved_docs 사용. (의도적인 No-Op)
        """
        return {}

    @tool
    def summarize_tool(self, query: str, retrieved_docs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        검색된 문서를 바탕으로 최종 답변을 생성하고, 답변의 근거가 된 문서 출처를 함께 반환합니다.
        """
        if not retrieved_docs:
            return {
                "final_answer": "아, 죄송해요! 질문하신 내용과 관련된 정보를 찾을 수 없네요. 다른 키워드로 질문해보시거나 좀 더 구체적으로 물어봐 주시면 도움을 드릴 수 있을 것 같아요! 🙂",
                "sources": []
            }

        context_str = "\n\n---\n\n".join([
            f"문서 출처: {doc.get('metadata', {}).get('source', '알 수 없음')}\n\n내용: {doc['page_content']}"
            for doc in retrieved_docs
        ])

        sources = [doc.get('metadata', {}).get('source', '알 수 없음') for doc in retrieved_docs]
        unique_sources = sorted(list(set(sources)))

        system_prompt = """당신은 친근하고 도움이 되는 AI 어시스턴트입니다. 다음 규칙을 따라 답변해주세요:

🎯 **답변 스타일**:
- 친근하고 자연스러운 말투 사용 (딱딱한 존댓말 대신 부드러운 어조)
- 답변의 가장 마지막에는 이모지를 활용하여 친밀감 표현
- 사용자가 이해하기 쉽게 설명

📝 **답변 구조**:
- 문단 간 줄바꿈은 한 번만 사용 (과도한 엔터 금지)
- 중요한 정보는 불릿 포인트나 번호로 구분
- 길고 복잡한 문장보다는 짧고 명확한 문장 선호

📚 **내용 원칙**:
- 제공된 문서 내용에만 근거하여 답변
- 문서에 정보가 없으면 "찾을 수 없어요"라고 친근하게 안내
- 답변 마지막에 추가 도움이 필요하면 언제든 말하라는 멘트 추가"""
        
        user_prompt = f"""아래 문서들을 참고해서 친근하게 답변해주세요! 😊

💬 질문: {query}

📄 참고 문서:
{context_str}

답변을 부탁드려요:"""

        response = self.llm.invoke([SystemMessage(content=system_prompt),
                               HumanMessage(content=user_prompt)])
        
        return {
            "final_answer": response.content.strip(),
            "sources": unique_sources
        }

    @staticmethod
    @tool
    def get_presigned_download_url(file_key: str) -> Dict[str, Any]:
        """
        파일 다운로드용 presigned URL 생성.
        """
        try:
            logger.info(f"도구 호출 성공! 다운로드용 서명된 URL 생성 시도: {file_key}")
            url = get_download_url(file_key)
            return {"downloadUrl": url}
        except Exception as e:
            logger.error(f"error: {e}")
            return {"error": str(e)}