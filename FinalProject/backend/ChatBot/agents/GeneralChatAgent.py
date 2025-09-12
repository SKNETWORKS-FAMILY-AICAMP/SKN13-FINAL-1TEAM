# GeneralChatAgent.py
# ⚠️ 업무 전용 챗봇으로 변경되어 비활성화됨
# 일반 채팅 기능은 BusinessRejectionAgent로 대체

from typing import Dict, Any

class GeneralChatAgent:
    """
    ⚠️ 업무 전용 챗봇으로 변경되어 비활성화됨
    일반 대화 기능은 BusinessRejectionAgent로 대체
    
    하위 호환성을 위해 클래스는 유지하되 기능은 비활성화
    """
    
    def __init__(self):
        """비활성화된 에이전트"""
        print("--- GeneralChatAgent 비활성화됨 (업무 전용 챗봇) ---")
    
    def process(self, state) -> Dict[str, Any]:
        """
        ⚠️ 비활성화된 프로세스 - BusinessRejectionAgent 사용 권장
        """
        print("--- GeneralChatAgent: 비활성화됨, BusinessRejectionAgent 사용 필요 ---")
        
        return {
            "messages": [],
            "generation": "GeneralChatAgent가 비활성화되었습니다. BusinessRejectionAgent를 사용하세요.",
            "workflow_error": "GeneralChatAgent 비활성화됨",
            "workflow_complete": True
        }

# Legacy support - 기존 코드와의 호환성
def agent():
    """
    DEPRECATED: GeneralChatAgent 비활성화됨
    BusinessRejectionAgent 사용 권장
    """
    chat_agent = GeneralChatAgent()
    
    def legacy_wrapper(state):
        return chat_agent.process(state)
    
    return legacy_wrapper