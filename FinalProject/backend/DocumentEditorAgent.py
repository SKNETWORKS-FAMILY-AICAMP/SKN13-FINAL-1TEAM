# DocumentEditAgent.py

from typing import Any, List
from dotenv import load_dotenv

from langchain_core.messages import SystemMessage, ToolMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig
from langchain_core.prompts import ChatPromptTemplate

from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

from .DocumentSearchAgentTools.AgentState import AgentState
from .DocumentEditorAgentTools.editor_tool import run_document_edit, replace_text_in_document

load_dotenv()

# --- Main Agent Node ---

def agent_node(state: AgentState, llm_with_tools: Any) -> dict:
    """
    DocumentEditAgent의 메인 노드
    
    대화 기록 대신, 상태의 문서 내용과 사용자의 마지막 명령만을 사용하여 LLM을 호출합니다.
    이것은 LLM이 대화 내용에 혼동되지 않고 편집 작업에만 집중하도록 보장합니다.
    """
    print("--- DocumentEditAgent 노드 실행 중 (상태 기반) ---")
    
    document_content = state.get("document_content")
    if not document_content:
        # 편집할 문서가 없으면 AI가 사용자에게 알려주도록 함
        return {"messages": [SystemMessage("편집할 문서 내용이 없습니다. 사용자에게 문서가 비어있다고 알려주세요.")]}

    # Get the last user message from the history
    last_user_message = None
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            last_user_message = msg
            break
    
    if not last_user_message:
         return {"messages": [SystemMessage("사용자의 편집 명령을 찾을 수 없습니다.")]}

    # Construct a clean message list for the LLM
    # LLM이 대화 기록이 아닌 실제 문서와 명령에만 집중하도록 강제
    messages_for_llm = [
        SystemMessage(
            f"""당신은 다음 문서 내용을 바탕으로 사용자의 편집 요청을 처리해야 합니다. 
사용자가 문서의 일부를 언급하면, 이 내용에서 찾아야 합니다. 
사용자가 내용을 추가하거나 요약하라고 하면, 이 내용을 기준으로 작업해야 합니다.

--- 문서 시작 ---
{document_content}
--- 문서 끝 ---"""
        ),
        last_user_message # The user's actual command
    ]

    # LLM 호출 및 응답 반환
    response = llm_with_tools.invoke(messages_for_llm)
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
    tools = [
        run_document_edit,
        replace_text_in_document,
    ]
    
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
    
    # 툴 실행 후 -> 상태 업데이트 -> 다시 에이전트 호출
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
