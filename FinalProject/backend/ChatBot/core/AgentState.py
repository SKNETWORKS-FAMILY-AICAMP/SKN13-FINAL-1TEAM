# RagState.py
from typing import TypedDict, Annotated, List, Dict, Any
from langgraph.graph.message import add_messages

# --- RAG 에이전트의 내부 상태 정의 ---
class AgentState(TypedDict):
    """ RAG 에이전트의 작업 흐름(그래프) 내에서 사용될 상태 객체입니다. """
    # 사용자의 원본 질문
    original_query: str
    # 확장된 검색 쿼리 목록
    expanded_queries: List[str]
    # 검색된 문서 목록
    retrieved_docs: List[Dict[str, Any]]
    # 생성된 최종 답변
    final_answer: str
    # 후속 질문 여부
    is_follow_up: bool
    # 대화 기록
    messages: Annotated[list, add_messages]

    # --- Document Editor Agent를 위한 추가 상태 ---
    # 편집 중인 문서의 ID
    doc_id: str | None
    # 사용자의 편집 명령어
    user_command: str | None
    # 편집할 문서의 현재 내용
    document_content: str | None
    # 현재 문서 편집 세션 중인지 여부
    is_document_editing_session: bool | None