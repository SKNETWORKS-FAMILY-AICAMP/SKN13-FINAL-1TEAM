from typing import Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END

# 상태 타입
from .DocumentSearchAgentTools.AgentState import AgentState
from .DocumentEditorAgentTools.editor_tool import run_document_edit, replace_text_in_document, read_document_content, request_frontend_document_content


# -------------------------------
# LangChain Tool 등록
# -------------------------------
@tool
def document_edit_tool(document: str, instruction: str) -> str:
    """문서와 편집 요청을 입력받아 문서를 수정하는 툴"""
    return run_document_edit(document=document, instruction=instruction)


tools = [run_document_edit, replace_text_in_document, read_document_content, request_frontend_document_content]


# -------------------------------
# Agent 노드: Tool Calling Agent
# -------------------------------
def agent_node(state: AgentState, llm_with_tools: Any) -> dict:
    """
    GPT가 Tool을 자동으로 호출하는 노드.
    """
    print("--- Calling DocumentEditAgent (Tool Calling Mode) ---")

    user_command = state.get("user_command")
    document_content = state.get("document_content")

    if not user_command or not document_content:
        return {"messages": [HumanMessage(content="문서 편집에 필요한 정보가 부족합니다.")]}

    messages = [
        SystemMessage(
            content=(
                "You are a document editor assistant. "
                "You receive a document and an edit request from the user. "
                "If the edit request requires modifying the document, "
                "use the 'document_edit_tool' to perform the edit. "
                "Return the updated document content after applying the changes."
            )
        ),
        HumanMessage(
            content=f"""
DOCUMENT CONTENT:
---
{document_content}
---

EDIT REQUEST:
{user_command}
            """
        )
    ]

    # Tool Calling 수행
    response = llm_with_tools.invoke(messages)
    
    # GPT의 응답이 Tool Call이면 Tool을 실행하고 결과를 반환
    if response.tool_calls:
        tool_outputs = []
        for tool_call in response.tool_calls:
            # 여기서 실제 툴 함수를 호출해야 합니다.
            # DocumentEditorAgentTools/editor_tool.py에 정의된 함수들을 직접 호출합니다.
            if tool_call.function.name == "run_document_edit":
                # run_document_edit은 이미 내부적으로 다른 툴을 바인딩하고 있으므로,
                # 여기서는 run_document_edit의 인자를 직접 전달합니다.
                # 이 부분은 LangGraph의 ToolNode와 유사하게 동작해야 합니다.
                # 현재 구조에서는 run_document_edit이 최종 결과를 반환하므로,
                # 여기서 직접 호출하고 그 결과를 tool_outputs에 추가합니다.
                # 하지만 LangGraph의 AgentState는 ToolMessage를 기대하므로,
                # ToolMessage 형태로 변환하여 반환해야 합니다.
                # 이 부분은 LangGraph의 ToolNode가 자동으로 처리하는 부분입니다.
                # 여기서는 수동으로 ToolMessage를 생성합니다.
                from .DocumentEditorAgentTools.editor_tool import run_document_edit
                output = run_document_edit(
                    user_command=tool_call.function.args["user_command"],
                    document_content=tool_call.function.args["document_content"]
                )
                tool_outputs.append(ToolMessage(content=output, tool_call_id=tool_call.id))
            # 다른 툴이 있다면 여기에 추가
            # elif tool_call.function.name == "another_tool":
            #    ...
        return {"messages": [response] + tool_outputs}
    else:
        # Tool Call이 아니면 GPT의 직접 응답을 반환
        return {"messages": [response]}


# -------------------------------
# 사용자 명령어 클리어 노드
# -------------------------------
def clear_user_command_node(state: AgentState) -> dict:
    print("--- Clearing User Command ---")
    return {"user_command": None}


# -------------------------------
# 문서 상태 업데이트 노드
# -------------------------------
def update_document_state_node(state: AgentState) -> dict:
    print("--- Updating Document State with Tool Output ---")
    tool_outputs = [msg for msg in state['messages'] if isinstance(msg, ToolMessage)]
    if tool_outputs:
        last_tool_output = tool_outputs[-1].content
        print(f"--- Updated Document Snippet ---\n{last_tool_output[:100]}...\n")
        return {"document_content": last_tool_output}
    return {}


# -------------------------------
# 다음 단계 결정 로직
# -------------------------------
def decide_next_step(state: AgentState) -> str:
    print("--- Deciding Next Step ---")
    user_command = state.get("user_command")

    if user_command is None:
        return "finalize"

    user_command_lower = user_command.lower()
    if any(kw in user_command_lower for kw in ["완료", "끝", "종료"]):
        return "finalize"
    return "continue"


# -------------------------------
# 최종 답변 노드
# -------------------------------
def final_node(state: AgentState) -> dict:
    print("--- Finalizing DocumentEditAgent ---")
    final_doc_content = state.get("document_content", "문서 편집이 완료되었습니다.")
    return {"final_answer": final_doc_content}


# -------------------------------
# DocumentEditorAgent 컴파일
# -------------------------------
def DocumentEditorAgent() -> Any:
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    llm_with_tools = llm.bind_tools(tools)

    def runnable_agent_node(state: AgentState):
        return agent_node(state, llm_with_tools)

    graph = StateGraph(AgentState)

    graph.add_node("agent", runnable_agent_node)
    graph.add_node("clear_command", clear_user_command_node)
    graph.add_node("update_document_state", update_document_state_node)
    graph.add_node("final_answer_node", final_node)

    graph.set_entry_point("agent")
    graph.add_edge("agent", "clear_command")
    graph.add_edge("clear_command", "update_document_state")
    graph.add_conditional_edges(
        "update_document_state",
        decide_next_step,
        {
            "continue": "agent",
            "finalize": "final_answer_node",
        },
    )
    graph.add_edge("final_answer_node", END)

    return graph.compile()