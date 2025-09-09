# DocumentEditorAgent.py

from typing import Any, Optional
from dotenv import load_dotenv
import logging

from langchain_core.messages import SystemMessage, ToolMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig
from langchain_core.prompts import ChatPromptTemplate

from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

from ..core.AgentState import AgentState
from ..tools.editor_tool import ALL_EDITOR_TOOLS

load_dotenv()

# 로깅 설정
logger = logging.getLogger(__name__)

# --- Main Agent Node ---

def agent_node(state: AgentState, llm_with_tools: Any) -> dict:
    """
    DocumentEditorAgent의 메인 노드
    
    문서 편집 요청을 처리하고 적절한 응답을 생성합니다.
    """
    try:
        logger.info("DocumentEditorAgent 노드 실행 중")
        
        messages = state["messages"].copy()
        document_content = state.get("document_content", "")
        
        # 도구 실행 후 최종 응답 생성
        if isinstance(messages[-1], ToolMessage):
            return _generate_completion_response(document_content)
        
        # 편집 요청 처리
        if document_content:
            messages = _prepare_editing_context(messages, document_content)
        
        # LLM 호출 및 응답 반환
        response = llm_with_tools.invoke(messages)
        return {"messages": [response]}
        
    except Exception as e:
        logger.error(f"agent_node에서 오류 발생: {str(e)}")
        error_response = HumanMessage(content=f"문서 편집 중 오류가 발생했습니다: {str(e)}")
        return {"messages": [error_response]}


def _generate_completion_response(document_content: str) -> dict:
    """도구 실행 완료 후 최종 확인 메시지 생성"""
    logger.info("도구 실행 완료. 최종 확인 메시지 생성")
    
    completion_message = HumanMessage(
        content="요청하신 문서 편집이 완료되었습니다. 수정된 내용을 확인해보세요."
    )
    return {"messages": [completion_message]}


def _prepare_editing_context(messages: list, document_content: str) -> list:
    """편집 컨텍스트 준비 - 대화 맥락 포함"""
    logger.info("문서 내용 포함하여 편집 컨텍스트 준비")
    
    # 대화 맥락 추출 - 더 많은 메시지 포함 (최대 10개)
    recent_messages = messages[-10:] if len(messages) >= 10 else messages
    conversation_context = ""
    
    for msg in recent_messages:
        if hasattr(msg, 'content') and msg.content:
            # 메시지 타입에 따른 역할 구분
            if hasattr(msg, 'type'):
                if msg.type == "human":
                    role = "사용자"
                elif msg.type == "ai":
                    role = "AI"
                else:
                    role = "시스템"
            else:
                # content에서 에이전트 이름 추출 시도
                content_start = msg.content[:50]
                if "GeneralChatAgent" in content_start:
                    role = "GeneralChatAgent"
                elif "DocumentEditorAgent" in content_start:
                    role = "DocumentEditorAgent"
                else:
                    role = "AI"
            
            # 더 긴 내용 포함 (500자까지)
            conversation_context += f"\n{role}: {msg.content[:500]}..."
    
    context_message = SystemMessage(
        content=f"""## 문서 편집 지시사항 ##
당신은 전문 문서 편집자입니다. 아래의 전체 대화 맥락을 **반드시** 참고하여 문서를 편집하세요.

**전체 대화 맥락**:
{conversation_context}

**현재 문서 상태**:
{document_content}

**핵심 편집 원칙**:
1. **대화 맥락 완전 활용**: 위의 대화 내용에서 사용자가 언급한 구체적인 주제, 요구사항, 정보를 모두 파악하세요
2. **맥락 기반 내용 생성**: 
   - "작성해줘", "내용 추가해줘" 등의 요청이 있을 때는 대화에서 언급된 구체적인 주제로 실제 내용을 작성하세요
   - 예: "세계 최고의 광고 Best3" 주제가 언급되었다면, 그에 대한 실제 보고서 내용을 작성
3. **에이전트 간 정보 연결**: GeneralChatAgent가 제공한 정보를 DocumentEditorAgent가 문서에 반영하세요
4. **구체적 내용 생성**: 추상적이거나 placeholder 텍스트가 아닌, 실용적이고 구체적인 내용을 생성하세요

대화 맥락에서 파악한 주제와 요구사항을 바탕으로 적절한 편집 도구를 선택하여 실행하세요.
"""
    )
    
    # 마지막 사용자 메시지 전에 컨텍스트 삽입
    if len(messages) > 1:
        messages.insert(-1, context_message)
    else:
        messages.append(context_message)
    
    return messages

# --- State Update Node ---

def update_document_state(state: AgentState) -> dict:
    """
    도구 실행 후 문서 상태를 업데이트합니다.
    """
    try:
        logger.info("문서 상태 업데이트 중")
        
        messages = state.get("messages", [])
        if not messages:
            return {}
        
        last_message = messages[-1]
        if not isinstance(last_message, ToolMessage):
            logger.warning("마지막 메시지가 ToolMessage가 아닙니다")
            return {}

        # 마지막 ToolMessage의 내용으로 document_content 업데이트
        updated_content = last_message.content
        logger.info(f"새 문서 내용으로 상태 업데이트 (길이: {len(updated_content)}자)")
        
        return {"document_content": updated_content}
        
    except Exception as e:
        logger.error(f"update_document_state에서 오류 발생: {str(e)}")
        return {}


# --- Graph Factory ---

def DocumentEditAgent() -> Any:
    """
    문서 편집을 위한 LangGraph 에이전트를 생성하고 반환합니다.
    
    Returns:
        LangGraph: 컴파일된 문서 편집 에이전트
    """
    try:
        logger.info("DocumentEditAgent 그래프 생성 중")
        
        # LLM 설정
        llm = ChatOpenAI(model_name='gpt-4o', temperature=0, streaming=True)
        
        # 사용 가능한 도구들
        tools = ALL_EDITOR_TOOLS
        
        # LLM에 도구 바인딩
        llm_with_tools = llm.bind_tools(tools)
        
        def runnable_agent_node(state: AgentState):
            return agent_node(state, llm_with_tools)

        # 그래프 구성
        graph = StateGraph(AgentState)
        graph.add_node("agent", runnable_agent_node)
        graph.add_node("tools", ToolNode(tools))
        graph.add_node("update_state", update_document_state)
        
        # 진입점 설정
        graph.set_entry_point("agent")
        
        # 조건부 엣지: 에이전트 응답에 따라 도구 호출 또는 종료
        graph.add_conditional_edges("agent", tools_condition)
        
        # 순차적 실행 흐름: 도구 -> 상태 업데이트 -> 에이전트
        graph.add_edge("tools", "update_state")
        graph.add_edge("update_state", "agent")
        
        # 그래프 컴파일
        compiled_graph = graph.compile(checkpointer=MemorySaver())
        logger.info("DocumentEditAgent 그래프 생성 완료")
        
        return compiled_graph
        
    except Exception as e:
        logger.error(f"DocumentEditAgent 생성 중 오류 발생: {str(e)}")
        raise

def generate_config(session_id: str) -> RunnableConfig:
    """
    에이전트 실행을 위한 설정을 생성합니다.
    
    Args:
        session_id (str): 세션 ID
        
    Returns:
        RunnableConfig: 에이전트 실행 설정
    """
    if not session_id or not isinstance(session_id, str):
        raise ValueError("유효한 session_id가 필요합니다")
    
    return RunnableConfig(
        recursion_limit=50,
        configurable={
            "thread_id": session_id
        },
    )
