# DocumentEditAgent.py

from typing import Any
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig
from langchain_core.messages import SystemMessage 

from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

from .DocumentSearchAgentTools.AgentState import AgentState
from .DocumentEditorAgentTools.editor_tool import run_document_edit, replace_text_in_document
#from .DocumentEditorAgentTools.agent_logic import DocumentEditTools
#rom .document_edit_system_prompt import get_document_edit_system_prompt

load_dotenv()

# --- Main Agent Node ---

def agent_node(state: AgentState, llm_with_tools: Any) -> dict:
    """
    DocumentEditAgent의 메인 노드
    
    현재 상태의 메시지를 받아서 LLM을 호출하고 AI의 응답을 반환합니다.
    시스템 프롬프트가 없는 경우 문서 편집용 시스템 프롬프트를 자동으로 추가합니다.
    
    Args:
        state (AgentState): 현재 Agent 상태 (메시지, 문서 내용 등)
        llm_with_tools (Any): 도구가 바인딩된 LLM 인스턴스
    
    Returns:
        dict: 업데이트된 메시지를 포함한 딕셔너리
    """
    print("--- DocumentEditAgent 노드 실행 중 ---")
    
    messages = state["messages"]
    document_content = state.get("document_content")
    
    # 시스템 메시지가 없는 경우 문서 편집용 시스템 프롬프트 추가
    """if not any(isinstance(msg, SystemMessage) for msg in messages):
        print("--- 시스템 프롬프트 추가 ---")
        system_prompt_content = get_document_edit_system_prompt()
        messages = [SystemMessage(content=system_prompt_content)] + messages
    """
    # 문서 내용이 있는 경우 컨텍스트에 포함
    if document_content:
        print("--- 문서 내용 포함하여 처리 ---")
        # 마지막 사용자 메시지에 문서 컨텍스트 추가 (필요시)
        # 현재는 시스템 프롬프트에서 document_content 처리를 담당
    else:
        print("--- 문서 내용 없음, 요청 필요 ---")

    # LLM 호출 및 응답 반환
    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}

# --- Graph Factory ---

def DocumentEditAgent() -> Any:
    """Compiles and returns the LangGraph agent for document edit."""

    llm = ChatOpenAI(model_name='gpt-4o', temperature=0, streaming=True)
    
    #tool_executor = DocumentEditTools(llm=llm)

    # Agent가 사용할 도구들 정의
    tools = [
        run_document_edit,                    # 문서 전체 편집 도구
        replace_text_in_document,            # 텍스트 교체 도구
        #tool_executor.get_document_content,   # 문서 내용 가져오기 도구
        #tool_executor.validate_edit_tool,     # 편집 결과 검증 도구
        #tool_executor.format_output_tool,     # 출력 형식 정리 도구
        #tool_executor.handle_edit_request_tool # 편집 요청 처리 도구
    ]
    
    # LLM에 도구들 바인딩
    llm_with_tools = llm.bind_tools(tools)
    
    def runnable_agent_node(state: AgentState):
        return agent_node(state, llm_with_tools)

    graph = StateGraph(AgentState)
    graph.add_node("agent", runnable_agent_node)
    graph.add_node("tools", ToolNode(tools))
    
    # 그래프 시작점을 agent로 설정
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", tools_condition,)
    graph.add_edge("tools", "agent")
    
    # 메모리 저장소와 함께 그래프 컴파일
    return graph.compile(checkpointer=MemorySaver())

def generate_config(session_id: str) -> RunnableConfig:
    """Generates a config for the agent run."""
    return RunnableConfig(
        recursion_limit=50,  # 복잡한 편집 작업을 위한 충분한 재귀 한계
        configurable={"thread_id": session_id},
    )
