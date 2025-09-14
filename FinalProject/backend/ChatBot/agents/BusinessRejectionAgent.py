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

💬 **친근한 거부 메시지 작성법**:
1. 친근하고 정중한 톤 사용해주세요
2. "저는 업무 도우미예요"라고 자연스럽고 명확하게 안내해주세요  
3. 답변의 마지막에 이모지를 활용해서 친근함을 표현해주세요
4. 도움이 되는 기능들을 쉽게 소개해주세요
5. 다른 도움이 필요하면 어디서 받을 수 있는지 안내해주세요

**사용 가능한 기능:**
- 📄 문서 검색: "보고서를 찾아줘", "계약서 검색해줘"
- ✏️ 문서 편집: "이 부분을 수정해줘", "내용을 추가해줘"
- 💡 문서 관련 질문: "이 문서는 언제 작성된 건가요?", "내용을 요약해줘"

✨ **메시지 구성**:
- 공감하는 인사말로 시작
- 업무 도우미라는 역할 소개  
- 할 수 있는 일들 친근하게 안내
- 다른 도움받을 곳 안내
- 과도한 줄바꿈 없이 깔끔하게 작성

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
