# -*- coding: utf-8 -*-

import os
import uuid
from typing import TypedDict, Annotated, Optional
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, BaseMessage
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
    # 대화 기록을 저장합니다.
    messages: Annotated[list, add_messages]
    # 다음으로 실행할 노드를 지정합니다. (예: 'researcher' 또는 'end')
    next: str
    # RAG 에이전트와의 연속적인 대화를 위한 고유 세션 ID입니다.
    # RAG 관련 대화가 아닐 때는 None으로 유지됩니다.
    rag_session_id: Optional[str]

# --- 노드 함수 정의 ---

def run_rag_agent_node(state: AgentState):
    """
    RAG_Agent를 실행하는 노드입니다.
    슈퍼바이저로부터 RAG 작업 세션 ID를 받아, RAG_Agent를 실행하고
    그 결과를 스트리밍으로 처리하여 state의 messages에 추가합니다.
    """
    query = state["messages"][-1].content
    rag_session_id = state["rag_session_id"]
    
    print(f"[Main Graph] RAG 에이전트 호출 (세션 ID: {rag_session_id})")

    # RAG 에이전트 인스턴스 생성 및 실행
    rag_agent = RAG_Agent()
    # RAG 에이전트의 스트리밍 출력을 받아 처리합니다.
    # 마지막 END 이벤트에서 최종 메시지를 받아 state에 추가합니다.
    final_rag_message = None
    # run 메서드는 이제 제너레이터(스트림)를 반환하므로, 루프를 통해 이벤트를 처리해야 합니다.
    for event in rag_agent.run(query, rag_session_id):
        if event.get(END):
            final_rag_message = event[END]["messages"][-1]

    # RAG 에이전트가 반환한 최종 메시지를 전체 대화 기록에 추가합니다.
    return {"messages": [final_rag_message]}

@tool
def research_tool_supervisor(query: str) -> str:
    """
    한국방송광고진흥공사(KOBACO)의 내부 문서, 재무 성과, 감사 보고서, 내부 규정 등에 대한
    질문에 답변해야 할 때 사용하는 도구입니다. 사용자의 원본 질문을 그대로 전달해야 합니다.
    """
    # 이 도구는 실제로 코드를 실행하지 않습니다.
    # 슈퍼바이저가 'researcher' 노드로 작업을 라우팅하도록 결정하는 용도로만 사용됩니다.
    return "리서치 에이전트가 이 질문을 처리할 것입니다."

def supervisor_node(state: AgentState):
    """
    슈퍼바이저 노드입니다. 사용자의 요청을 분석하여 어떤 에이전트에게 작업을 위임할지,
    또는 직접 답변할지를 결정합니다. 또한 RAG 세션을 관리합니다.
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
    result = llm_with_tools.invoke(messages_for_supervisor)
    
    # RAG 에이전트를 호출해야 하는 경우
    if result.tool_calls and result.tool_calls[0]['name'] == 'research_tool_supervisor':
        print("[Main Graph] 슈퍼바이저 결정: RAG 에이전트 호출")
        # 기존 RAG 세션 ID가 없으면 새로 생성합니다.
        rag_session_id = state.get("rag_session_id") or str(uuid.uuid4())
        return {
            "next": "researcher",
            "rag_session_id": rag_session_id
        }
    
    # 슈퍼바이저가 직접 답변하는 경우
    else:
        print("[Main Graph] 슈퍼바이저 결정: 직접 답변")
        # RAG와 관련 없는 대화이므로, 진행 중이던 RAG 세션을 종료합니다.
        return {
            "messages": [result],
            "next": "end",
            "rag_session_id": None 
        }

# --- 그래프 구축 ---

def create_multi_agent_graph():
    """전체 멀티 에이전트 시스템의 StateGraph를 구축하고 반환합니다."""
    graph = StateGraph(AgentState)

    # 노드 추가
    graph.add_node("supervisor", supervisor_node)
    graph.add_node("researcher", run_rag_agent_node)

    # 진입점 설정
    graph.set_entry_point("supervisor")

    # 엣지(흐름) 정의
    graph.add_conditional_edges(
        "supervisor",
        lambda x: x["next"],
        {
            "researcher": "researcher",
            "end": END,
        },
    )
    graph.add_edge("researcher", END)

    # 전체 대화 내용을 기억하기 위한 메모리(Checkpointer)와 함께 그래프를 컴파일합니다.
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
    # 전체 대화를 위한 고유 ID
    main_session_id = f"session-{str(uuid.uuid4())}"
    config = {"configurable": {"thread_id": main_session_id}}

    async def run_agent_turn(query: str):
        """에이전트의 한 턴을 실행하고 결과를 출력합니다."""
        async for event in app.astream(
            {"messages": [HumanMessage(content=query)]},
            config=config,
        ):
            # 스트리밍 이벤트의 내용을 화면에 출력합니다.
            # 실제 애플리케이션에서는 이 부분을 웹소켓 등으로 클라이언트에 전달하게 됩니다.
            for key, value in event.items():
                if key != "__end__":
                    print(value)

    async def main():
        # 1. RAG 에이전트를 호출하는 질문
        await run_agent_turn("을지연습 복무감사 관련 보고서 좀 찾아줄래?")
        
        print("\n" + "="*40 + "\n")

        # 2. RAG 에이전트와의 후속 질문
        await run_agent_turn("좋아. 그거 다운로드 링크만 깔끔하게 다시 줘.")
        
        print("\n" + "="*40 + "\n")
        
        # 3. 일반적인 질문 (RAG 세션 종료)
        await run_agent_turn("고마워. 이제 다른 거 물어볼게. 오늘 날씨 어때?")

    asyncio.run(main())
