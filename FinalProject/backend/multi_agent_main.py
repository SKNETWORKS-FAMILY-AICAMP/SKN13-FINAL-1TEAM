# -*- coding: utf-8 -*-

import os
import uuid
from typing import TypedDict, Annotated, Optional
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, BaseMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.runnables import RunnableConfig

# 우리가 만든 RAG_Agent 클래스를 임포트합니다.
from RAG_Agent import RAG_Agent

# .env 파일에서 환경 변수를 로드합니다.
load_dotenv()

# --- 전체 에이전트 시스템의 상태 정의 ---
class AgentState(TypedDict):
    """
    슈퍼바이저를 포함한 전체 에이전트 시스템의 상태를 정의합니다.
    이 상태는 여러 에이전트 간의 대화 흐름을 제어하는 데 사용됩니다.
    """
    messages: Annotated[list, add_messages]
    next: str
    rag_session_id: Optional[str]

# --- 노드 함수 정의 ---

# [수정] RAG 에이전트의 비동기 스트림을 처리하기 위해 함수를 async def로 변경합니다.
async def run_rag_agent_node(state: AgentState) -> dict:
    """
    RAG_Agent를 실행하는 비동기 노드입니다.
    RAG 에이전트의 스트리밍 출력을 비동기적으로 처리하여 최종 메시지를 반환합니다.
    """
    query = state["messages"][-1].content
    rag_session_id = state["rag_session_id"]
    
    print(f"[Main Graph] RAG 에이전트 호출 (세션 ID: {rag_session_id})")

    rag_agent = RAG_Agent()
    final_rag_message = None
    
    # [수정] 비동기 제너레이터는 `async for`를 사용하여 반복해야 합니다.
    async for event in rag_agent.run(query, rag_session_id):
        if event.get(END):
            # [수정] RAG 에이전트가 메시지를 생성한 경우에만 값을 할당합니다.
            if event[END].get("messages"):
                final_rag_message = event[END]["messages"][-1]

    # [수정] 만약 RAG 에이전트가 아무런 메시지를 생성하지 않고 종료했다면(예: 문서를 찾지 못함),
    # NoneType 에러를 방지하기 위해 기본 응답 메시지를 생성합니다.
    if final_rag_message is None:
        final_rag_message = AIMessage(content="죄송합니다. 해당 질문에 대한 관련 문서를 찾지 못했습니다.")

    return {"messages": [final_rag_message]}

@tool
def research_tool_supervisor(query: str) -> str:
    """한국방송광고진흥공사(KOBACO)의 내부 문서, 재무, 감사 등에 대한 질문에 사용하는 도구입니다."""
    return "리서치 에이전트가 이 질문을 처리할 것입니다."

# [수정] 슈퍼바이저 노드 또한 비동기 함수로 변경하여 일관성을 유지합니다.
async def supervisor_node(state: AgentState) -> dict:
    """
    슈퍼바이저 노드입니다. 사용자의 요청을 분석하여 작업을 위임하거나 직접 답변합니다.
    """
    print("[Main Graph] 슈퍼바이저 노드 실행")
    
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    llm_with_tools = llm.bind_tools([research_tool_supervisor])
    
    system_prompt = (
        "당신은 여러 전문가 AI 에이전트를 관리하는 슈퍼바이저입니다. "
        "사용자의 요청을 분석하여 가장 적합한 전문가에게 작업을 위임하세요. "
        "현재 'researcher'라는 전문가가 한 명 있습니다. "
        "만약 사용자의 질문이 '한국방송광고진흥공사(KOBACO)의 내부 문서, 재무, 감사, 규정'에 관련된 것이거나, 이전 대화의 연장선상에 있는 후속 질문이라면, "
        "반드시 'research_tool_supervisor'를 호출하여 'researcher'에게 작업을 위임해야 합니다. "
        "그 외의 일반적인 대화(인사, 잡담 등)는 직접 답변하세요."
    )
    
    messages_for_supervisor = [SystemMessage(content=system_prompt)] + state["messages"]
    # [수정] llm.ainvoke를 사용하여 비동기적으로 LLM을 호출합니다.
    result = await llm_with_tools.ainvoke(messages_for_supervisor)
    
    if result.tool_calls and result.tool_calls[0]['name'] == 'research_tool_supervisor':
        print("[Main Graph] 슈퍼바이저 결정: RAG 에이전트 호출")
        rag_session_id = state.get("rag_session_id") or str(uuid.uuid4())
        return {"next": "researcher", "rag_session_id": rag_session_id}
    else:
        print("[Main Graph] 슈퍼바이저 결정: 직접 답변")
        return {"messages": [result], "next": "end", "rag_session_id": None}

# --- 그래프 구축 ---

def create_multi_agent_graph():
    """전체 멀티 에이전트 시스템의 StateGraph를 구축하고 반환합니다."""
    graph = StateGraph(AgentState)

    graph.add_node("supervisor", supervisor_node)
    graph.add_node("researcher", run_rag_agent_node)

    graph.set_entry_point("supervisor")

    graph.add_conditional_edges(
        "supervisor",
        lambda x: x["next"],
        {"researcher": "researcher", "end": END},
    )
    graph.add_edge("researcher", END)

    memory = MemorySaver()
    return graph.compile(checkpointer=memory)

def generate_config(session_id: str) -> RunnableConfig:
    """Generates a config for the agent run."""
    return RunnableConfig(
        recursion_limit=20,
        configurable={"thread_id": session_id},
    )

# --- 메인 테스트 로직 ---
if __name__ == "__main__":
    import asyncio

    app = create_multi_agent_graph()
    main_session_id = f"session-{str(uuid.uuid4())}"
    config = {"configurable": {"thread_id": main_session_id}}

    async def run_agent_turn(query: str):
        """에이전트의 한 턴을 실행하고 결과를 출력합니다."""
        async for event in app.astream({"messages": [HumanMessage(content=query)]}, config=config):
            for key, value in event.items():
                if key != "__end__":
                    print(value)

    async def main():
        await run_agent_turn("을지연습 복무감사 관련 보고서 좀 찾아줄래?")
        print("\n" + "="*40 + "\n")
        await run_agent_turn("좋아. 그거 다운로드 링크만 깔끔하게 다시 줘.")
        print("\n" + "="*40 + "\n")
        await run_agent_turn("고마워. 이제 다른 거 물어볼게. 오늘 날씨 어때?")

    asyncio.run(main())
