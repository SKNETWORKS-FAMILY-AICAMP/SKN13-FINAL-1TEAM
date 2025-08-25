# DocumentEditAgent.py

from typing import Any, List
from dotenv import load_dotenv
import asyncio

from langchain_core.messages import SystemMessage, ToolMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig
from langchain_core.prompts import ChatPromptTemplate

from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

from .DocumentSearchAgentTools.AgentState import AgentState
from .DocumentEditorAgentTools.editor_tool import run_document_edit, replace_text_in_document
from document_editor_system_prompt import get_document_editor_system_prompt
load_dotenv()


# --- Main Agent Node ---

async def agent_node(state: AgentState, llm_with_tools: Any) -> dict:
    """
    DocumentEditAgent의 메인 노드
    
    현재 상태의 메시지를 받아서 LLM을 호출하고 AI의 응답을 반환합니다.
    시스템 프롬프트가 없는 경우 문서 편집용 시스템 프롬프트를 자동으로 추가합니다.
    """
    print("--- DocumentEditAgent 노드 실행 중 ---")
    
    # IMPORTANT: Make a copy so we don't modify the original state list
    messages = state["messages"].copy()
    document_content = state.get("document_content")

    # Inject the document content as a system message for the LLM to see
    if document_content:
        print("--- 문서 내용 포함하여 처리 ---")
        context_message = SystemMessage(
            content=get_document_editor_system_prompt(document_content)
        )
        # Insert it before the last user message
        if len(messages) > 1:
            messages.insert(-1, context_message)
        else:
            messages.append(context_message)

    # LLM 호출 및 응답 반환
    prompt = ChatPromptTemplate.from_messages(messages)
    response = await llm_with_tools.ainvoke(prompt.format())
    return {"messages": [response]}


# --- State Update Node ---

async def update_document_state(state: AgentState) -> dict:
    """
    ToolNode 실행 후, 도구의 출력(수정된 문서)으로 상태를 업데이트합니다.
    """
    print("--- 문서 상태 업데이트 중 ---")
    last_message = state["messages"][-1]
    if not isinstance(last_message, ToolMessage):
        return {}
    # 마지막 ToolMessage의 내용으로 document_content를 업데이트
    updated_content = last_message.content
    print(f"--- 새 문서 내용으로 상태 업데이트 ---\n{updated_content[:200]}...")
    return {"document_content": updated_content}


# --- Graph Factory ---

def DocumentEditAgent() -> Any:
    """Compiles and returns the LangGraph agent for document edit."""
    llm = ChatOpenAI(model_name='gpt-4o', temperature=0, streaming=True)
    
    # Agent가 사용할 도구들 정의
    tools = [
        run_document_edit,
        replace_text_in_document,
    ]
    
    # LLM에 도구들 바인딩
    llm_with_tools = llm.bind_tools(tools)
    
    async def runnable_agent_node(state: AgentState):
        return await agent_node(state, llm_with_tools)

    graph = StateGraph(AgentState)
    graph.add_node("agent", runnable_agent_node)
    graph.add_node("tools", ToolNode(tools))
    graph.add_node("update_state", update_document_state)
    
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", tools_condition)
    graph.add_edge("tools", "update_state")
    graph.add_edge("update_state", "agent")
    
    return graph.compile(checkpointer=MemorySaver())


def generate_config(session_id: str) -> RunnableConfig:
    return RunnableConfig(
        recursion_limit=50,
        configurable={"thread_id": session_id},
    )
