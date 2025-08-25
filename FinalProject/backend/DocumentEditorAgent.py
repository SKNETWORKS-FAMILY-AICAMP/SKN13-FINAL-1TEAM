# DocumentEditAgent.py

from typing import Any
from dotenv import load_dotenv

from langchain_core.messages import SystemMessage
from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig
from langchain_core.prompts import ChatPromptTemplate

from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

from .DocumentSearchAgentTools.AgentState import AgentState
from .DocumentEditorAgentTools.editor_tool import run_document_edit, replace_text_in_document

load_dotenv()

# --- Main Agent Node ---

async def agent_node(state: AgentState, llm_with_tools: Any) -> dict:
    """
    DocumentEditAgent의 메인 노드
    
    현재 상태의 메시지를 받아서 LLM을 호출하고 AI의 응답을 반환합니다.
    시스템 프롬프트가 없는 경우 문서 편집용 시스템 프롬프트를 자동으로 추가합니다.
    
    Args:
        state (AgentState): 현재 Agent 상태 (메시지, 문서 내용 등)
        llm_with_tools (Any): 도구가 바인딩된 LLM 인스턴스
    
    Returns:
        dict: 업데이트된 메시지를 포함한 딕셔너리
    """
    print("--- DocumentEditAgent 노드 실행 중 ---")
    
    # IMPORTANT: Make a copy so we don't modify the original state list
    messages = state["messages"].copy()
    document_content = state.get("document_content")

    # Inject the document content as a system message for the LLM to see
    if document_content:
        print("--- 문서 내용 포함하여 처리 ---")
        context_message = SystemMessage(
            content=f"""당신은 다음 문서 내용을 바탕으로 사용자의 편집 요청을 처리해야 합니다. 
사용자가 문서의 일부를 언급하면, 이 내용에서 찾아야 합니다. 
사용자가 내용을 추가하거나 요약하라고 하면, 이 내용을 기준으로 작업해야 합니다.

--- 문서 시작 ---
{document_content}
--- 문서 끝 ---"""
        )
        # Insert it before the last user message
        if len(messages) > 1:
            messages.insert(-1, context_message)
        else:
            messages.append(context_message)

    # LLM 호출 및 응답 반환
    prompt = ChatPromptTemplate.from_messages(messages)
    response = await llm_with_tools.invoke(prompt.format())
    return {"messages": [response]}

# --- Graph Factory ---

def DocumentEditAgent() -> Any:
    """Compiles and returns the LangGraph agent for document edit."""

    llm = ChatOpenAI(model_name='gpt-4o', temperature=0, streaming=True)
    
    #tool_executor = DocumentEditTools(llm=llm)

    # Agent가 사용할 도구들 정의
    tools = [
        run_document_edit,                    # 문서 전체 편집 도구
        replace_text_in_document,            # 텍스트 교체 도구
        #tool_executor.get_document_content,   # 문서 내용 가져오기 도구
        #tool_executor.validate_edit_tool,     # 편집 결과 검증 도구
        #tool_executor.format_output_tool,     # 출력 형식 정리 도구
        #tool_executor.handle_edit_request_tool # 편집 요청 처리 도구
    ]
    
    # LLM에 도구들 바인딩
    llm_with_tools = llm.bind_tools(tools)
    
    def runnable_agent_node(state: AgentState):
        return agent_node(state, llm_with_tools)

    graph = StateGraph(AgentState)
    graph.add_node("agent", runnable_agent_node)
    graph.add_node("tools", ToolNode(tools))
    
    # 그래프 시작점을 agent로 설정
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", tools_condition,)
    graph.add_edge("tools", "agent")
    
    # 메모리 저장소와 함께 그래프 컴파일
    return graph.compile(checkpointer=MemorySaver())

def generate_config(session_id: str) -> RunnableConfig:
    """Generates a config for the agent run."""
    return RunnableConfig(
        recursion_limit=50,  # 복잡한 편집 작업을 위한 충분한 재귀 한계
        configurable={"thread_id": session_id},
    )
