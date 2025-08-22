# DocumentEditAgent.py

from typing import Any, Literal
from dotenv import load_dotenv

from langchain_core.messages import AIMessage
from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig

from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

from .DocumentSearchAgentTools.AgentState import AgentState
from .DocumentEditorAgentTools.editor_tool import run_document_edit, replace_text_in_document

load_dotenv()

# --- Gatekeeper and Signaler Nodes ---

def check_content_gate(state: AgentState) -> Literal["continue", "request_content"]:
    """Checks if document content exists. If not, diverts to request it."""
    print("--- Gatekeeper: Checking for document content ---")
    if state.get("document_content"):
        print("--- Content found, proceeding to agent ---")
        return "continue"
    else:
        print("--- Content NOT found, requesting from frontend ---")
        return "request_content"

def request_content_node(state: AgentState) -> dict:
    """Returns a special message to signal the frontend to provide content."""
    return {
        "messages": [AIMessage(content="NEEDS_DOCUMENT_CONTENT")]
    }

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
    
    # LLM 호출 및 응답 반환
    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}

# --- Graph Factory ---

def DocumentEditAgent() -> Any:
    """Compiles and returns the LangGraph agent for document edit."""

    llm = ChatOpenAI(model_name='gpt-4o', temperature=0, streaming=True)
    
    tools = [
        run_document_edit,
        replace_text_in_document,
    ]
    
    llm_with_tools = llm.bind_tools(tools)
    
    def runnable_agent_node(state: AgentState):
        return agent_node(state, llm_with_tools)

    graph = StateGraph(AgentState)
    
    # Add the new nodes
    graph.add_node("agent", runnable_agent_node)
    graph.add_node("tools", ToolNode(tools))
    graph.add_node("request_content", request_content_node)

    # Set the conditional entry point
    graph.set_conditional_entry_point(
        check_content_gate,
        {
            "continue": "agent",
            "request_content": "request_content",
        }
    )
    
    # Build the rest of the graph
    graph.add_conditional_edges("agent", tools_condition)
    graph.add_edge("tools", "agent")
    graph.add_edge("request_content", END) # The signaler node is a terminal state
    
    return graph.compile(checkpointer=MemorySaver())

def generate_config(session_id: str) -> RunnableConfig:
    """Generates a config for the agent run."""
    return RunnableConfig(
        recursion_limit=50,
        configurable={"thread_id": session_id},
    )
