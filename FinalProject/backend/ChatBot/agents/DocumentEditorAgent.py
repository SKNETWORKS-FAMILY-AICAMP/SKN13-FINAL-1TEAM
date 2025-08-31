# DocumentEditAgent.py

from typing import Any
from dotenv import load_dotenv

from langchain_core.messages import SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig
from langchain_core.prompts import ChatPromptTemplate

from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

from ..core.AgentState import AgentState
from ..tools.editor_tool import ALL_EDITOR_TOOLS

load_dotenv()

# --- Main Agent Node ---

def agent_node(state: AgentState, llm_with_tools: Any) -> dict:
    """
    DocumentEditAgent의 메인 노드
    
    현재 상태의 메시지를 받아서 LLM을 호출하고 AI의 응답을 반환합니다.
    도구 실행 후에는 최종 확인 메시지를 생성하고, 그 외에는 편집 명령을 수행합니다.
    """
    print("--- DocumentEditAgent 노드 실행 중 ---")
    
    messages = state["messages"].copy()
    document_content = state.get("document_content")
    
    # 마지막 메시지가 ToolMessage인 경우, 도구 실행 결과를 요약하는 최종 응답 생성
    if isinstance(messages[-1], ToolMessage):
        print("--- 도구 실행 완료. 최종 확인 메시지 생성 ---")
        prompt_content = f"""
        **지시사항**: 이전 단계에서 문서 편집 도구를 성공적으로 실행했습니다.
        사용자에게 문서가 수정되었음을 알리는 최종 확인 메시지를 생성해주세요. (예: \"요청하신대로 문서를 수정했습니다.\")
        
        **수정된 문서 내용 (참고용):**
        ---
        {document_content[:1000]}...
        ---
        
        이제 사용자에게 간결하고 친절한 확인 메시지를 전달하세요. 절대로 도구를 다시 호출하지 마세요.
        """
        # 도구 없이 순수 응답 생성을 위해 일반 LLM 호출
        llm = ChatOpenAI(model_name='gpt-4o', temperature=0, streaming=True)
        response = llm.invoke([SystemMessage(content=prompt_content)])
        return {"messages": [response]}

    # 일반적인 편집 요청 처리
    if document_content:
        print("--- 문서 내용 포함하여 편집 처리 ---")
        context_message = SystemMessage(
            content=f"""## 중요 지시사항 ##\n당신은 문서 편집 전문가입니다. 아래 제공되는 문서를 사용자의 명령에 따라 수정해야 합니다.
대화 기록은 단지 맥락 파악용이며, 절대 대화 내용을 편집해서는 안 됩니다.
오직 아래의 '편집할 문서' 내용만을 수정 대상으로 삼아야 합니다.

--- 편집할 문서 ---
{document_content}
--- 문서 끝 ---
"""
        )
        # Insert it before the last user message
        if len(messages) > 1:
            messages.insert(-1, context_message)
        else:
            messages.append(context_message)

    # LLM 호출 및 응답 반환
    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}

# --- State Update Node ---

def update_document_state(state: AgentState) -> dict:
    """
    ToolNode 실행 후, 도구의 출력(수정된 문서)으로 상태를 업데이트합니다.
    """
    print("--- 문서 상태 업데이트 중 ---")
    last_message = state["messages"][-1]
    if not isinstance(last_message, ToolMessage):
        return {}

    # 마지막 ToolMessage의 내용으로 document_content를 업데이트
    updated_content = last_message.content
    print(f"--- 새 문서 내용으로 상태 업데이트 ---\n{updated_content[:200]}...") # Log first 200 chars
    return {"document_content": updated_content}


# --- Graph Factory ---

def DocumentEditAgent() -> Any:
    """Compiles and returns the LangGraph agent for document edit."""

    llm = ChatOpenAI(model_name='gpt-4o', temperature=0, streaming=True)
    
    # Agent가 사용할 도구들 정의
    tools = ALL_EDITOR_TOOLS    
    
    # LLM에 도구들 바인딩
    llm_with_tools = llm.bind_tools(tools)
    
    def runnable_agent_node(state: AgentState):
        return agent_node(state, llm_with_tools)

    graph = StateGraph(AgentState)
    graph.add_node("agent", runnable_agent_node)
    graph.add_node("tools", ToolNode(tools))
    graph.add_node("update_state", update_document_state) # 상태 업데이트 노드 추가
    
    # 그래프 시작점을 agent로 설정
    graph.set_entry_point("agent")
    
    # 조건부 엣지: LLM의 응답에 따라 tool을 호출할지, 끝낼지 결정
    graph.add_conditional_edges(
        "agent",
        tools_condition,
    )
    
    # 툴 실행 후 -> 상태 업데이트 -> 다시 에이전트 호출하여 최종 응답 생성
    graph.add_edge("tools", "update_state")
    graph.add_edge("update_state", "agent")
    
    # 메모리 저장소와 함께 그래프 컴파일
    return graph.compile(checkpointer=MemorySaver())

def generate_config(session_id: str) -> RunnableConfig:
    """Generates a config for the agent run."""
    return RunnableConfig(
        recursion_limit=50,
        configurable={
            "thread_id": session_id
        },
    )
