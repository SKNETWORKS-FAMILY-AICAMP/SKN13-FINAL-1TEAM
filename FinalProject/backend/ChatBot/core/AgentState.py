from typing import TypedDict, List, Optional

class AgentState(TypedDict):
    """
    에이전트 그래프의 상태를 나타냅니다.
    그래프의 각 노드를 거치면서 이 상태 객체가 업데이트됩니다.
    """
    # 사용자로부터 받은 초기 입력
    prompt: str
    document_content: Optional[str]

    # 채팅 기록
    chat_history: List[tuple]

    # 라우팅 결과
    intent: Optional[str]

    # 프론트엔드에 문서 내용을 요청해야 하는지 여부
    needs_document_content: Optional[bool]

    # 각 도구 실행 후 중간 결과물
    intermediate_steps: List[tuple]

    # 최종 생성된 답변
    generation: Optional[str]
