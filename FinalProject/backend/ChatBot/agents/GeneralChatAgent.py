# GeneralChatAgent.py

from typing import Dict, Any, List
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, BaseMessage

from ..core.AgentState import AgentState, AgentStateHelper, AgentType, WorkflowStep
from ..prompts.system_prompt import get_system_prompt

load_dotenv()


class GeneralChatAgent:
    """
    일반 대화 및 분석 에이전트
    일반적인 대화, 문서 요약, 분석 등 범용적인 채팅 기능 제공
    """
    
    def __init__(self):
        """일반 채팅용 LLM 초기화 (도구 없음)"""
        self.llm = ChatOpenAI(model_name='gpt-4o', temperature=0)
        
        print("--- GeneralChatAgent initialized ---")
    
    def process(self, state: AgentState) -> Dict[str, Any]:
        """
        일반 대화 프로세스 실행
        1. 대화 맥락 분석
        2. 시스템 프롬프트 준비
        3. 응답 생성
        4. 상태 업데이트
        """
        print("--- GeneralChatAgent: Starting general chat process ---")
        
        try:
            # 1. 사용자 쿼리 추출
            user_query = AgentStateHelper.get_last_user_message(state)
            if not user_query:
                return self._handle_error(state, "No user message found")
            
            # 2. 에이전트별 데이터 저장
            AgentStateHelper.add_agent_data(
                state, 
                AgentType.GENERAL_CHAT, 
                "user_query", 
                user_query
            )
            
            # 3. 메시지 준비 (시스템 프롬프트 포함)
            messages = self._prepare_chat_messages(state)
            
            # 4. LLM 호출 (도구 없이 순수 채팅)
            response = self.llm.invoke(messages)
            
            # 5. 워크플로우 결과 저장
            AgentStateHelper.add_workflow_result(
                state,
                AgentType.GENERAL_CHAT,
                success=True,
                data={
                    "response": response.content if hasattr(response, 'content') else str(response),
                    "query": user_query
                }
            )
            
            # 6. 워크플로우 단계 업데이트 (분석이 필요했으면 완료로 표시)
            current_step = state.get('workflow_step')
            if current_step == WorkflowStep.ANALYSIS_NEEDED:
                AgentStateHelper.set_workflow_step(state, WorkflowStep.ANALYSIS_COMPLETED)
            else:
                AgentStateHelper.set_workflow_step(state, WorkflowStep.WORKFLOW_COMPLETED)
            
            print("--- GeneralChatAgent: Chat process completed successfully ---")
            
            return {
                "messages": [response],
                "generation": response.content if hasattr(response, 'content') else str(response)
            }
            
        except Exception as e:
            print(f"--- GeneralChatAgent error: {str(e)} ---")
            return self._handle_error(state, f"Chat failed: {str(e)}")
    
    def _prepare_chat_messages(self, state: AgentState) -> List[BaseMessage]:
        """채팅을 위한 메시지 준비"""
        messages = list(state.get("messages", []))
        
        # 워크플로우 컨텍스트 확인 (검색 결과나 편집 결과 활용)
        context_info = self._build_workflow_context(state)
        
        # 시스템 프롬프트 생성 (컨텍스트 포함)
        system_content = get_system_prompt()
        if context_info:
            system_content += f"\n\n**워크플로우 컨텍스트**:\n{context_info}"
        
        # 시스템 메시지가 없으면 추가
        if not any(isinstance(msg, SystemMessage) for msg in messages):
            messages.insert(0, SystemMessage(content=system_content))
        
        return messages
    
    def _build_workflow_context(self, state: AgentState) -> str:
        """워크플로우에서 다른 에이전트 결과 활용"""
        context_parts = []
        
        # 검색 결과가 있으면 포함
        search_result = AgentStateHelper.get_workflow_result(state, AgentType.DOCUMENT_SEARCH)
        if search_result and search_result.success:
            context_parts.append(f"문서 검색 결과: {search_result.data}")
        
        # 편집 결과가 있으면 포함  
        edit_result = AgentStateHelper.get_workflow_result(state, AgentType.DOCUMENT_EDIT)
        if edit_result and edit_result.success:
            context_parts.append(f"문서 편집 완료: {edit_result.data}")
        
        # 워크플로우 컨텍스트
        workflow_context = state.get('workflow_context', {})
        if workflow_context:
            context_parts.append(f"워크플로우 정보: {workflow_context}")
        
        return "\n".join(context_parts) if context_parts else ""
    
    def _handle_error(self, state: AgentState, error_message: str) -> Dict[str, Any]:
        """에러 처리 및 상태 업데이트"""
        AgentStateHelper.set_workflow_error(state, error_message)
        
        AgentStateHelper.add_workflow_result(
            state,
            AgentType.GENERAL_CHAT,
            success=False,
            data={},
            error=error_message
        )
        
        return {
            "workflow_error": error_message,
            "workflow_step": WorkflowStep.ERROR,
            "generation": f"죄송합니다. 오류가 발생했습니다: {error_message}"
        }


# Legacy support - 기존 코드와의 호환성
def agent():
    """
    DEPRECATED: 기존 그래프 방식 지원 (하위 호환성)
    새 코드에서는 GeneralChatAgent 클래스 직접 사용 권장
    """
    chat_agent = GeneralChatAgent()
    
    def legacy_wrapper(state: AgentState) -> Dict[str, Any]:
        return chat_agent.process(state)
    
    return legacy_wrapper