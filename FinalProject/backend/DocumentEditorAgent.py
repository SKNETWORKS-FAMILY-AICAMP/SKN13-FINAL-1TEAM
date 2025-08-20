from typing import Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

# AgentState를 임포트합니다.
from .DocumentSearchAgentTools.AgentState import AgentState
from .DocumentEditorAgentTools.editor_tool import run_document_edit

# 이 에이전트가 사용할 툴 목록
tools = [run_document_edit]

def agent_node(state: AgentState, llm_with_tools: Any) -> dict:
    """
    에이전트의 '생각'을 담당하는 노드. 상태를 보고 툴을 호출할지 결정한다.
    """
    print("--- Calling DocumentEditorAgent Node ---")
    
    user_command = state.get("user_command")
    document_content = state.get("document_content")

    if not user_command or not document_content:
        return {"messages": [("user", "문서 편집에 필요한 정보가 부족합니다.")]}

    messages = [
        SystemMessage(content="You are an assistant that uses tools to edit documents."),
        (
            "user",
            f"Please edit the following document based on my request.\n\n"
            f"DOCUMENT CONTENT:\n---\n{document_content}\n---\n\n"
            f"EDIT REQUEST: {user_command}"
        ),
    ]
    
    response = llm_with_tools.invoke(messages)
    
    return {"messages": [response]}

def final_node(state: AgentState) -> dict:
    """
    툴 실행 결과를 최종 답변으로 정리하는 노드.
    """
    print("--- Finalizing DocumentEditorAgent ---")
    tool_outputs = [msg for msg in state['messages'] if isinstance(msg, ToolMessage)]
    last_tool_output = tool_outputs[-1].content if tool_outputs else ""
    return {"final_answer": last_tool_output}

def DocumentEditorAgent() -> Any:
    """
    문서 편집 에이전트 그래프를 컴파일하고 반환합니다.
    """
    llm = ChatOpenAI(model_name='gpt-4o', temperature=0)
    llm_with_tools = llm.bind_tools(tools)

    def runnable_agent_node(state: AgentState):
        return agent_node(state, llm_with_tools)

    graph = StateGraph(AgentState)
    
    graph.add_node("agent", runnable_agent_node)
    graph.add_node("tools", ToolNode(tools))
    graph.add_node("final_answer_node", final_node)

    graph.set_entry_point("agent")
    graph.add_edge("agent", "tools")
    graph.add_edge("tools", "final_answer_node")
    graph.add_edge("final_answer_node", END)

    return graph.compile()