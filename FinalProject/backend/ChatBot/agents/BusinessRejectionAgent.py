# BusinessRejectionAgent.py

from typing import Dict, Any
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, BaseMessage

from ..core.AgentState import AgentState, AgentStateHelper, AgentType, WorkflowStep

load_dotenv()


class BusinessRejectionAgent:
    """
    업무 외 요청 거부 에이전트
    업무와 관련 없는 요청에 대해 친근하지만 명확한 거부 메시지 제공
    """
    
    def __init__(self):
        """업무 거부 전용 LLM 초기화"""
        self.llm = ChatOpenAI(model_name='gpt-4o', temperature=0.3)  # 약간의 창의성
        
        print("--- BusinessRejectionAgent initialized ---")
    
    def process(self, state: AgentState) -> Dict[str, Any]:
        """
        업무 외 요청 거부 프로세스
        """
        print("--- BusinessRejectionAgent: 업무 외 요청 거부 처리 ---")
        
        try:
            # 1. 사용자 쿼리 내용(content) 추출
            last_user_message = AgentStateHelper.get_last_user_message(state)
            user_query_content = getattr(last_user_message, 'content', "일반적인 질문")

            # 2. 거부 메시지 생성
            rejection_message = self._generate_rejection_message(user_query_content)
            
            # 3. 상태 업데이트 및 워크플로우 완료 처리
            state["messages"].append(rejection_message)
            state["workflow_complete"] = True
            
            print("--- BusinessRejectionAgent: 거부 메시지 생성 완료 ---")
            
            return {
                "messages": state["messages"],
                "generation": rejection_message.content,
                "workflow_complete": True
            }
            
        except Exception as e:
            print(f"--- BusinessRejectionAgent 오류: {e} ---")
            return self._handle_error(state, str(e))
    
    def _generate_rejection_message(self, user_query: str) -> BaseMessage:
        """친근하지만 명확한 거부 메시지 생성"""
        from langchain_core.messages import HumanMessage

        system_prompt = """당신은 업무 전용 AI 어시스턴트입니다. 사용자의 업무 외 요청에 대해 친근하지만 명확하게 거부 메시지를 작성해주세요.

**거부 메시지 작성 가이드라인:**
1. 친근하고 정중한 톤 사용
2. 업무 전용 시스템임을 명확히 안내
3. 사용 가능한 기능 간단히 소개
4. 추가 문의는 관련 부서로 안내

**사용 가능한 기능:**
- 📄 문서 검색: "보고서를 찾아줘", "계약서 검색해줘"
- ✏️ 문서 편집: "이 부분을 수정해줘", "내용을 추가해줘"
- 💡 문서 관련 질문: "이 문서는 언제 작성된 건가요?", "내용을 요약해줘"

**메시지 구조:**
1. 친근한 인사와 이해 표현
2. 업무 전용 시스템임을 안내
3. 사용 가능한 기능 소개
4. 추가 문의 안내

사용자 요청에 맞춰 자연스럽고 도움이 되는 거부 메시지를 작성해주세요."""

        user_message_content = f"사용자 요청: {user_query}"
        
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_message_content)
        ]
        
        response = self.llm.invoke(messages)
        return BaseMessage(content=response.content, type="ai")
    
    def _handle_error(self, state: AgentState, error_message: str) -> Dict[str, Any]:
        """에러 처리"""
        AgentStateHelper.set_workflow_error(state, error_message)
        
        # 기본 거부 메시지
        default_message = """안녕하세요! 😊

죄송하지만 저는 업무 전용 AI 어시스턴트로, 문서 편집과 검색 업무만 도와드릴 수 있어요.

**제가 도와드릴 수 있는 일:**
📄 문서 검색: "보고서를 찾아줘"
✏️ 문서 편집: "이 부분을 수정해줘" 
💡 문서 관련 질문: "내용을 요약해줘"

다른 문의사항은 관련 부서로 연락해주시면 더 정확한 도움을 받으실 수 있습니다.

감사합니다! 🙏"""
        
        return {
            "messages": [BaseMessage(content=default_message, type="ai")],
            "generation": default_message,
            "workflow_error": error_message,
            "workflow_complete": True
        }
