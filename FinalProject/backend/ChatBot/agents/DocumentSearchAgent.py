# DocumentSearchAgent.py

from typing import Dict, Any, List
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, BaseMessage

from ..core.AgentState import AgentState, AgentStateHelper, AgentType, WorkflowStep
from ..tools.retriever_tool import RAG_search_tool
from ..tools.local_document_search_tool import local_document_search_tool
from ..tools.hybrid_document_search_tool import hybrid_document_search_tool
from ..tools.agent_logic import AgentTools
from ..prompts.DocumentSearchSystemPrompt import get_document_search_system_prompt

load_dotenv()


class DocumentSearchAgent:
    """
    전문 문서 검색 에이전트
    RAG 검색, 쿼리 확장, 결과 요약 등 문서 검색 관련 전문 기능 제공
    """
    
    def __init__(self):
        """문서 검색 전용 도구들과 LLM 초기화"""
        self.llm = ChatOpenAI(model_name='gpt-4o', temperature=0)
        self.tool_executor = AgentTools(llm=self.llm)
        
        # 문서 검색 전용 도구들
        self.tools = [
            RAG_search_tool,
            local_document_search_tool,  # 기존 로컬 문서 검색 도구
            hybrid_document_search_tool,  # 하이브리드 검색 도구 추가
            self.tool_executor.expand_query_tool,
            self.tool_executor.route_query_tool,
            self.tool_executor.handle_follow_up_tool,
            self.tool_executor.summarize_tool,
            self.tool_executor.get_presigned_download_url
        ]
        
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        
        print("--- DocumentSearchAgent initialized ---")
    
    def process(self, state: AgentState) -> Dict[str, Any]:
        """
        문서 검색 프로세스 실행
        1. 사용자 쿼리 분석
        2. 검색 실행
        3. 결과 처리 및 상태 업데이트
        """
        print("--- DocumentSearchAgent: Starting document search process ---")
        
        try:
            # 1. 사용자 쿼리 추출 및 저장
            user_query = AgentStateHelper.get_last_user_message(state)
            if not user_query:
                return self._handle_error(state, "No user query found")
            
            AgentStateHelper.add_agent_data(
                state, 
                AgentType.DOCUMENT_SEARCH, 
                "original_query", 
                user_query
            )
            
            # 2. 시스템 프롬프트와 메시지 준비
            messages = self._prepare_messages(state)
            
            # 3. LLM 호출 (도구 사용 포함)
            response = self.llm_with_tools.invoke(messages)
            
            # 4. 도구 호출 처리
            search_results = {}
            if hasattr(response, 'tool_calls') and response.tool_calls:
                messages.append(response)  # Add AI message with tool calls
                for tool_call in response.tool_calls:
                    tool_name = tool_call.get("name")
                    tool_args = tool_call.get("args")
                    
                    print(f"\n>> [SEARCH AGENT] Calling Tool: {tool_name}\n   Args: {tool_args}\n")
                    
                    # Find and execute the tool
                    tool_function = None
                    for tool in self.tools:
                        if hasattr(tool, 'name') and tool.name == tool_name:
                            tool_function = tool
                            break
                    
                    if tool_function:
                        try:
                            # 도구 실행 및 결과 저장
                            result = tool_function.invoke(tool_args)
                            search_results.update(result if isinstance(result, dict) else {"result": result})
                            
                            print(f">> [SEARCH AGENT] Tool '{tool_name}' executed successfully\n")
                            
                            # Add ToolMessage for the graph
                            from langchain_core.messages import ToolMessage
                            messages.append(ToolMessage(content=str(result), tool_call_id=tool_call['id']))
                            
                        except Exception as e:
                            error_msg = f"Error executing tool '{tool_name}': {e}"
                            print(f">> [SEARCH AGENT] {error_msg}")
                            from langchain_core.messages import ToolMessage
                            messages.append(ToolMessage(content=error_msg, tool_call_id=tool_call['id']))
                    else:
                        print(f">> [SEARCH AGENT] Warning: Tool '{tool_name}' not found.")
            else:
                # LLM didn't use tools, add the response message
                messages.append(response)
                search_results = self._extract_search_results(response)
            
            # After tool execution, generate final response for the user
            if hasattr(response, 'tool_calls') and response.tool_calls:
                print(">> [SEARCH AGENT] Generating final user response after tool execution")
                
                try:
                    # Create a prompt for final response generation
                    from langchain_core.messages import HumanMessage
                    final_prompt = HumanMessage(content="이제 검색 결과를 바탕으로 사용자에게 도움이 되는 답변을 생성해주세요. 검색된 문서들의 내용을 요약하고 사용자의 질문에 답해주세요.")
                    messages.append(final_prompt)
                    
                    # Generate final response - use invoke without tools to get pure text response
                    final_llm = ChatOpenAI(model_name='gpt-4o', temperature=0)
                    final_response = final_llm.invoke(messages)
                    messages.append(final_response)
                    
                    print(f">> [SEARCH AGENT] Final response generated: {final_response.content[:100]}...")
                    
                    # Ensure the final response content is captured for streaming
                    if hasattr(final_response, 'content') and final_response.content:
                        search_results["final_answer"] = final_response.content
                    
                except Exception as e:
                    print(f">> [SEARCH AGENT] Error generating final response: {e}")
                    # Fallback: create a simple response
                    from langchain_core.messages import AIMessage
                    fallback_response = AIMessage(content="검색이 완료되었습니다. 검색 결과를 확인해주세요.")
                    messages.append(fallback_response)
            
            # 5. 워크플로우 결과 저장
            AgentStateHelper.add_workflow_result(
                state,
                AgentType.DOCUMENT_SEARCH,
                success=bool(search_results),
                data=search_results
            )
            
            # 6. 워크플로우 단계 업데이트
            AgentStateHelper.set_workflow_step(state, WorkflowStep.SEARCH_COMPLETED)
            
            print(f"--- DocumentSearchAgent: Search completed successfully ---")
            
            return {
                "messages": messages,
                "workflow_step": WorkflowStep.SEARCH_COMPLETED
            }
            
        except Exception as e:
            print(f"--- DocumentSearchAgent error: {str(e)} ---")
            return self._handle_error(state, f"Search failed: {str(e)}")
    
    def _prepare_messages(self, state: AgentState) -> List[BaseMessage]:
        """시스템 프롬프트와 메시지 준비"""
        messages = list(state.get("messages", []))
        
        # 시스템 메시지가 없으면 추가
        if not any(isinstance(msg, SystemMessage) for msg in messages):
            system_prompt_content = get_document_search_system_prompt()
            messages.insert(0, SystemMessage(content=system_prompt_content))
        
        return messages
    
    def _extract_search_results(self, response: Any) -> Dict[str, Any]:
        """LLM 응답에서 검색 결과 추출"""
        results = {}
        
        # 도구 호출 결과 확인
        if hasattr(response, 'tool_calls') and response.tool_calls:
            results["tool_calls"] = [
                {
                    "name": tc.get("name", "unknown"),
                    "args": tc.get("args", {}),
                    "id": tc.get("id", "")
                }
                for tc in response.tool_calls
            ]
            results["has_tool_calls"] = True
        else:
            results["has_tool_calls"] = False
        
        # 응답 내용 저장
        if hasattr(response, 'content'):
            results["response_content"] = response.content
        
        return results
    
    def _handle_error(self, state: AgentState, error_message: str) -> Dict[str, Any]:
        """에러 처리 및 상태 업데이트"""
        AgentStateHelper.set_workflow_error(state, error_message)
        
        AgentStateHelper.add_workflow_result(
            state,
            AgentType.DOCUMENT_SEARCH,
            success=False,
            data={},
            error=error_message
        )
        
        return {
            "workflow_error": error_message,
            "workflow_step": WorkflowStep.ERROR
        }
    
    def get_available_tools(self) -> List[str]:
        """사용 가능한 도구 목록 반환"""
        return [tool.name for tool in self.tools]


# Legacy support - 기존 코드와의 호환성
def DocumentSearchAgent_legacy():
    """
    DEPRECATED: 기존 그래프 방식 지원 (하위 호환성)
    새 코드에서는 DocumentSearchAgent 클래스 직접 사용 권장
    """
    agent = DocumentSearchAgent()
    
    def legacy_wrapper(state: AgentState) -> Dict[str, Any]:
        return agent.process(state)
    
    return legacy_wrapper