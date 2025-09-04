from typing import TypedDict, List, Optional, Annotated
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

# AgentState
class AgentState(TypedDict):
    """
    에이전트 그래프의 상태를 나타냅니다.
    그래프의 각 노드를 거치면서 이 상태 객체가 업데이트됩니다.
    """
    # 사용자로부터 받은 최신 입력
    prompt: str
    
    # 편집 또는 검색 대상 문서의 내용
    document_content: Optional[str]

    # 전체 대화 기록 (LangGraph에 의해 관리됨)
    messages: Annotated[List[BaseMessage], add_messages]

    # 라우팅 결과
    intent: Optional[str]

    # 프론트엔드에 문서 내용을 요청해야 하는지 여부
    needs_document_content: bool

    # 각 도구 실행 후 중간 결과물
    intermediate_steps: list

    # 최종 생성된 답변
    generation: Optional[str]
