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
        # If initial command or content is missing, return an error message.
        # This might need to be handled differently if it's an iterative turn.
        return {"messages": [("user", "문서 편집에 필요한 정보가 부족합니다.")]}

    messages = [
        SystemMessage(content="You are an assistant that uses tools to edit documents. You will receive a document and an edit request. Use the 'run_document_edit' tool to perform the edit. After editing, the updated document will be provided back to you. If the user provides further instructions, continue editing. If the user indicates they are done, you can finalize."),
        ("user", f"Please edit the following document based on my request.\n\n"
                 f"DOCUMENT CONTENT:\n---\n{document_content}\n---\n\n"
                 f"EDIT REQUEST: {user_command}")
    ]
    
    response = llm_with_tools.invoke(messages)
    
    return {"messages": [response]}

def clear_user_command_node(state: AgentState) -> dict:
    """
    사용자 명령을 처리한 후 AgentState에서 user_command를 지웁니다.
    """
    print("--- Clearing User Command ---")
    return {"user_command": None}

def update_document_state_node(state: AgentState) -> dict:
    """
    툴 실행 결과를 AgentState의 document_content에 반영하는 노드.
    """
    print("--- Updating Document State with Tool Output ---\n")
    tool_outputs = [msg for msg in state['messages'] if isinstance(msg, ToolMessage)]
    if tool_outputs:
        # Get the content of the last tool message, which should be the edited document
        last_tool_output = tool_outputs[-1].content
        print(f"--- Last Tool Output (Edited Document Snippet): {last_tool_output[:100]}... ---")
        return {"document_content": last_tool_output}
    return {} # No update if no tool output

def decide_next_step(state: AgentState) -> str:
    """
    다음 단계를 결정하는 조건부 함수.
    사용자의 명령이 처리되었거나 종료 지시가 포함되어 있는지 확인합니다.
    """
    print("--- Deciding Next Step ---")
    user_command = state.get("user_command") # Check if user_command is None
    
    # If user_command is None, it means the previous command was processed.
    # We should finalize unless there's a new command from the user.
    # For now, we'll finalize.
    if user_command is None:
        return "finalize"

    # If user_command is not None, check for explicit finalization keywords
    user_command_lower = user_command.lower()
    if "완료" in user_command_lower or "끝" in user_command_lower or "종료" in user_command_lower:
        return "finalize"
    
    # Otherwise, continue processing the command
    return "continue"

def final_node(state: AgentState) -> dict:
    """
    최종 답변을 정리하는 노드.
    """
    print("--- Finalizing DocumentEditorAgent ---")
    # The final answer should be the last known document_content
    final_doc_content = state.get("document_content", "문서 편집이 완료되었습니다.")
    return {"final_answer": final_doc_content}

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
    graph.add_node("clear_command", clear_user_command_node) # New node
    graph.add_node("tools", ToolNode(tools))
    graph.add_node("update_document_state", update_document_state_node)
    graph.add_node("final_answer_node", final_node)

    graph.set_entry_point("agent")
    graph.add_edge("agent", "clear_command") # New edge
    graph.add_edge("clear_command", "tools") # Modified edge
    graph.add_edge("tools", "update_document_state")
    
    # Conditional edge from update_document_state
    graph.add_conditional_edges(
        "update_document_state",
        decide_next_step,
        {
            "continue": "agent",  # Loop back to agent for more commands
            "finalize": "final_answer_node" # Go to final node
        }
    )
    graph.add_edge("final_answer_node", END)

    return graph.compile()