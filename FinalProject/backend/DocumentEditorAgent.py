from typing import Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition # tools_condition 임포트

# 상태 타입
from .DocumentSearchAgentTools.AgentState import AgentState # AgentState 재사용
from .DocumentEditorAgentTools.editor_tool import run_document_edit, replace_text_in_document


# -------------------------------
# LangChain Tool 등록
# -------------------------------
# @tool 데코레이터는 editor_tool.py에 이미 적용되어 있으므로 여기서는 tools 리스트만 정의
tools = [run_document_edit, replace_text_in_document]


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

    # DocumentSearchAgent의 agent_node와 유사하게 메시지 구성
    messages = state["messages"]
    if not any(isinstance(msg, SystemMessage) for msg in messages):
        system_prompt_content = (
            "You are a document editor assistant. "
            "You receive a document and an edit request from the user. "
            "If the edit request requires modifying the document, "
            "use the 'run_document_edit' tool to perform the edit. "
            "Return the updated document content after applying the changes."
        )
        messages = [SystemMessage(content=system_prompt_content)] + messages

    # 사용자 명령과 문서 내용을 HumanMessage로 추가
    if user_command and document_content:
        messages.append(HumanMessage(
            content=f"""
DOCUMENT CONTENT:
---
{document_content}
---

EDIT REQUEST:
{user_command}
            """
        ))
    elif user_command:
        messages.append(HumanMessage(content=user_command))
    elif document_content:
        messages.append(HumanMessage(content=f"Current document content: {document_content}"))


    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}


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
    graph.add_node("tools", ToolNode(tools)) # ToolNode 추가

    graph.set_entry_point("agent")

    # tools_condition을 사용하여 조건부 엣지 추가
    graph.add_conditional_edges(
        "agent",
        tools_condition,
        # tools_condition은 자동으로 "tools"와 END를 반환
    )
    graph.add_edge("tools", "agent") # 도구 실행 후 다시 agent 노드로 돌아옴

    # DocumentSearchAgent와 유사하게 최종 답변을 처리하는 노드 추가 (필요시)
    # 현재는 tools_condition이 END로 바로 갈 수 있으므로, 최종 답변 노드는 필요 없을 수도 있음.
    # 만약 최종 답변을 위한 별도의 로직이 필요하다면, summarize_tool과 유사한 노드를 추가해야 함.

    return graph.compile()