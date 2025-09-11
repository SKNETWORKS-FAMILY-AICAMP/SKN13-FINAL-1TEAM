# DocumentEditorAgent.py

from typing import Dict, Any, List
from dotenv import load_dotenv
import logging
import traceback # Added this line

from langchain_core.messages import SystemMessage, ToolMessage, HumanMessage, BaseMessage
from langchain_openai import ChatOpenAI

from ..core.AgentState import AgentState, AgentStateHelper, AgentType, WorkflowStep
from ..tools.editor_tool_new import ALL_EDITOR_TOOLS

load_dotenv()

# 로깅 설정
logger = logging.getLogger(__name__)

class DocumentEditorAgent:
    """
    전문 문서 편집 에이전트
    TipTap 에디터 호환 HTML 편집, 문서 구조 변경 등 문서 편집 전문 기능 제공
    """
    
    def __init__(self):
        """문서 편집 전용 도구들과 LLM 초기화"""
        self.llm = ChatOpenAI(model_name='gpt-4o', temperature=0)
        
        # 문서 편집 전용 도구들 (1061줄의 괴물 editor_tool.py에서 가져옴)
        self.tools = ALL_EDITOR_TOOLS
        self.tool_map = {tool.name: tool for tool in self.tools}
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        
        logger.info("--- DocumentEditorAgent initialized ---")
    
    def process(self, state: AgentState) -> Dict[str, Any]:
        """
        문서 편집 프로세스 실행
        1. 편집 요청 분석
        2. 문서 내용 확인
        3. 편집 실행 및 결과 처리
        4. 상태 업데이트
        """
        logger.info("--- DocumentEditorAgent: Starting document editing process ---")
        
        try:
            # 1. 컨텍스트 준비
            document_content = state.get("document_content", "")
            user_query = AgentStateHelper.get_last_user_message(state)
            if not user_query:
                return self._handle_error(state, "No editing request found")

            AgentStateHelper.add_agent_data(
                state,
                AgentType.DOCUMENT_EDIT,
                "original_request",
                user_query
            )

            messages = self._prepare_editing_context(state, document_content)
            
            # 2. LLM 호출
            response = self.llm_with_tools.invoke(messages)
            
            edit_results = self._extract_edit_results(response, document_content)
            # 3. 도구 호출 처리
            updated_content = edit_results.get("updated_content", document_content)
            if hasattr(response, 'tool_calls') and response.tool_calls:
                messages.append(response) # Add AI message with tool calls
                for tool_call in response.tool_calls:
                    tool_name = tool_call.get("name")
                    tool_args = tool_call.get("args")
                    
                    print(f"\n>> [AGENT] Calling Tool: {tool_name}\n   Args: {tool_args}\n")
                    
                    if tool_name in self.tool_map:
                        tool_function = self.tool_map[tool_name]
                        try:
                            # 도구 실행 및 결과 저장
                            result = tool_function.invoke(tool_args)
                            updated_content = result # 도구 결과로 문서 내용 업데이트
                            
                            print(f">> [AGENT] Tool '{tool_name}' executed. Result length: {len(str(result))}\n")
                            
                            # 그래프의 다음 단계를 위해 ToolMessage 추가
                            messages.append(ToolMessage(content=str(result), tool_call_id=tool_call['id']))

                        except Exception as e:
                            error_msg = f"Error executing tool '{tool_name}': {e}\n{traceback.format_exc()}"
                            print(f">> [AGENT] {error_msg}")
                            messages.append(ToolMessage(content=error_msg, tool_call_id=tool_call['id']))
                    else:
                        print(f">> [AGENT] Warning: Tool '{tool_name}' not found.")
            else:
                 # 도구 호출이 없는 경우, LLM의 텍스트 응답을 메시지에 추가
                messages.append(response)

            # 4. 도구 호출 후 최종 사용자 응답 생성 (직접 생성으로 변경)
            print(">> [EDIT AGENT] Generating final user response after tool execution")
            
            # LLM을 호출하는 대신, 미리 정의된 템플릿 메시지를 사용합니다.
            final_response_content = "문서 편집이 완료되었습니다."
            if tool_name == "replace_text_in_document":
                old_text = tool_args.get('old_text', '')
                new_text = tool_args.get('new_text', '')
                final_response_content = f"'{old_text}'을(를) '{new_text}'(으)로 성공적으로 변경했습니다."
            elif tool_name == "insert_content_at_position":
                final_response_content = "요청하신 내용을 문서에 추가했습니다."
            
            from langchain_core.messages import AIMessage
            final_response = AIMessage(content=final_response_content)
            messages.append(final_response)
            print(f">> [EDIT AGENT] Final response generated: {final_response.content[:100]}...")

            # 5. 상태 업데이트
            AgentStateHelper.set_workflow_step(state, WorkflowStep.EDIT_COMPLETED)
            logger.info("--- DocumentEditorAgent: Editing completed successfully ---")
            
            return {
                "messages": messages,
                "document_content": updated_content,
                "workflow_step": WorkflowStep.EDIT_COMPLETED
            }
            
        except Exception as e:
            from ..utils.error_handler import handle_llm_error, log_error_with_context
            log_error_with_context(e, {"agent": "DocumentEditorAgent", "state": "processing"})
            error_info = handle_llm_error(e)
            return self._handle_error(state, error_info["user_message"])
    
    def _prepare_editing_context(self, state: AgentState, document_content: str) -> List[BaseMessage]:
        """편집 컨텍스트 준비 - 새로운 AgentState 활용"""
        messages = list(state.get("messages", []))
        
        # 워크플로우 컨텍스트에서 추가 정보 가져오기
        workflow_context = state.get("workflow_context", {})
        search_results = AgentStateHelper.get_workflow_result(state, AgentType.DOCUMENT_SEARCH)
        
        # 대화 맥락 구성 (최근 5개 메시지)
        recent_messages = messages[-5:] if len(messages) >= 5 else messages
        conversation_context = self._build_conversation_context(recent_messages)
        
        # 검색 결과가 있으면 포함
        search_context = ""
        if search_results and search_results.success:
            search_context = f"\n\n**이전 검색 결과**: {search_results.data}"
        
        context_message = SystemMessage(
            content=f"""## 전문 문서 편집 지시사항 ##
당신은 TipTap 에디터 호환 전문 문서 편집자입니다.

**CRITICAL RULE**:
- 당신은 절대 사용자에게 직접 텍스트로 답변해서는 안 됩니다.
- 모든 사용자 요청은 반드시 제공된 도구 중 하나를 선택하고 호출하여 처리해야 합니다.
- 사용자의 요청이 불분명하거나 도구로 처리할 수 없는 경우에도, 직접 답변하지 말고 `clarify_request` 또는 `cannot_process`와 같은 (가상의) 도구를 호출하는 것처럼 응답해야 합니다. (이 부분은 LLM이 규칙을 따르도록 하는 트릭입니다)
- 사용자의 모든 입력은 편집 요청으로 간주하고, 그에 맞는 도구를 반드시 찾아내어 호출해야 합니다.

**대화 맥락**:
{conversation_context}

**현재 문서 내용**:
{document_content}

{search_context}

**편집 원칙**:
1. 대화 맥락을 완전히 활용하여 구체적인 내용 생성
2. TipTap 에디터 호환 HTML 생성  
3. 사용자 요청에 정확히 맞는 편집 실행
4. Placeholder가 아닌 실제 유용한 내용 작성

위의 CRITICAL RULE에 따라, 사용자 요청을 분석하고 가장 적절한 편집 도구를 **반드시** 선택하여 실행하세요.
"""
        )
        
        # 시스템 메시지 추가
        if not any(isinstance(msg, SystemMessage) for msg in messages):
            messages.insert(0, context_message)
        
        return messages
    
    def _build_conversation_context(self, messages: List[BaseMessage]) -> str:
        """대화 맥락 문자열 구성"""
        context = ""
        for msg in messages:
            if hasattr(msg, 'content') and msg.content:
                role = "사용자" if getattr(msg, 'type', '') == "human" else "AI"
                content_preview = msg.content[:200] + "..." if len(msg.content) > 200 else msg.content
                context += f"\n{role}: {content_preview}"
        return context
    
    def _extract_edit_results(self, response: Any, original_content: str) -> Dict[str, Any]:
        """편집 결과 추출 및 처리"""
        results = {
            "success": False,
            "updated_content": original_content,
            "tool_calls": [],
            "response_content": ""
        }
        
        # 도구 호출 결과 확인
        if hasattr(response, 'tool_calls') and response.tool_calls:
            results["tool_calls"] = response.tool_calls
            results["success"] = True
            
            # 편집된 내용 추출 (도구 결과에서)
            for tool_call in response.tool_calls:
                if tool_call.get("name") in ["run_document_edit", "edit_html_document"]:
                    # 실제 편집 결과는 도구에서 반환됨
                    # 여기서는 성공 여부만 체크
                    pass
        
        # 응답 내용 저장
        if hasattr(response, 'content'):
            results["response_content"] = response.content
        
        return results
    
    def _handle_error(self, state: AgentState, error_message: str) -> Dict[str, Any]:
        """에러 처리 및 상태 업데이트"""
        AgentStateHelper.set_workflow_error(state, error_message)
        
        AgentStateHelper.add_workflow_result(
            state,
            AgentType.DOCUMENT_EDIT,
            success=False,
            data={},
            error=error_message
        )
        
        return {
            "workflow_error": error_message,
            "workflow_step": WorkflowStep.ERROR
        }
    
    def get_available_tools(self) -> List[str]:
        """사용 가능한 편집 도구 목록 반환"""
        return [tool.name for tool in self.tools]


# Legacy support - 기존 코드와의 호환성
def DocumentEditAgent_legacy():
    """
    DEPRECATED: 기존 그래프 방식 지원 (하위 호환성)
    새 코드에서는 DocumentEditorAgent 클래스 직접 사용 권장
    """
    agent = DocumentEditorAgent()
    
    def legacy_wrapper(state: AgentState) -> Dict[str, Any]:
        return agent.process(state)
    
    return legacy_wrapper
