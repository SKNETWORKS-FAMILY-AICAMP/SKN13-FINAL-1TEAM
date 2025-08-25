# DocumentEditAgent.py

from typing import Any, Dict, List
from dotenv import load_dotenv
import asyncio

from langchain_core.messages import SystemMessage, ToolMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig
from langchain_core.prompts import ChatPromptTemplate

from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

from .DocumentSearchAgentTools.AgentState import AgentState
from .DocumentEditorAgentTools.editor_tool import (
    replace_text_in_document,
    edit_document,
    run_document_edit_tool,
    update_document_state_tool
)
from backend.document_editor_system_prompt import get_document_editor_system_prompt

load_dotenv()


# --- Agent Node ---
async def agent_node(state: AgentState, llm_with_tools: Any) -> Dict[str, List[Any]]:
    """
    DocumentEditAgent의 메인 노드.
    현재 상태의 메시지를 받아 LLM을 호출하고 Tool 호출 결과를 반환.
    """
    print("--- DocumentEditAgent 노드 실행 ---")
    
    messages = state["messages"].copy()
    document_content = state.get("document_content")

    if document_content:
        system_msg = SystemMessage(
            content=get_document_editor_system_prompt(document_content)
        )
        # 마지막 유저 메시지 앞에 system message 삽입
        if len(messages) > 1:
            messages.insert(-1, system_msg)
        else:
            messages.append(system_msg)

    # ChatPromptTemplate로 메시지 포맷
    prompt = ChatPromptTemplate.from_messages(messages)

    # LLM 호출
    response = await llm_with_tools.ainvoke(prompt.format())
    
    return {"messages": [response]}


# --- Graph Factory ---
def DocumentEditAgent() -> Any:
    """LangGraph용 DocumentEditAgent 생성 및 컴파일."""
    
    llm = ChatOpenAI(model_name='gpt-4o', temperature=0, streaming=True)
    
    # Agent에서 사용할 도구들
    tools = [
        replace_text_in_document,
        edit_document,
        run_document_edit_tool,
        update_document_state_tool
    ]
    
    # LLM에 도구 바인딩
    llm_with_tools = llm.bind_tools(tools)
    
    async def runnable_agent_node(state: AgentState):
        return await agent_node(state, llm_with_tools)

    graph = StateGraph(AgentState)
    
    # Agent Node
    graph.add_node("agent", runnable_agent_node)
    
    # Tool Node
    graph.add_node("tools", ToolNode(tools))
    
    # Graph 연결
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", tools_condition)
    graph.add_edge("tools", "agent")
    
    # MemorySaver를 통한 상태 체크포인트
    return graph.compile(checkpointer=MemorySaver())


# --- RunnableConfig Generator ---
def generate_config(session_id: str) -> RunnableConfig:
    return RunnableConfig(
        recursion_limit=50,
        configurable={"thread_id": session_id},
    )
