# RoutingAgent.py

from typing import Literal
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage
from langgraph.graph import StateGraph, END
from langchain_core.runnables import RunnableConfig

# Import the comprehensive state and the sub-agents
from ..core.AgentState import AgentState
from .chat_agent import agent as GeneralChatAgent
from .DocumentSearchAgent import DocumentSearchAgent
from .DocumentEditorAgent import DocumentEditAgent

load_dotenv()

# --- New Node for Requesting Document ---
def request_document_node(state: AgentState) -> dict:
    """This node sets the flag to request the document from the frontend."""
    print("--- Setting flag to request document from frontend ---")
    return {"needs_document_content": True}

# --- Router Logic ---

def route_question(state: AgentState) -> Literal["document_search", "general_chat", "document_edit", "request_document"]:
    """
    Classifies the user's question to decide which agent should handle it, considering conversation history.
    If the agent requires a document but it's not present, it routes to request the document.
    """
    print("---ROUTING QUESTION---")
    
    # Pass the entire message history to the LLM for better context
    messages = state["chat_history"]
    
    llm = ChatOpenAI(model_name='gpt-4o', temperature=0)
    
    # Upgraded system_prompt for more robust routing
    system_prompt = f"""당신은 사용자의 질문을 분석하여 가장 적절한 전문가에게 전달하는 라우Ting 전문가입니다. 대화의 전체 맥락을 고려하여 최적의 결정을 내리십시오.

**세 명의 전문가:**

1.  **DocumentSearchAgent**:
    - **역할**: 내부 문서(재무 보고서, 감사 결과, 규정 등)를 검색하고 관련 정보를 제공합니다.
    - **트리거**: 사용자가 명시적으로 문서를 찾아달라고 요청하거나, 문서의 다운로드 링크를 요구할 때 활성화됩니다.

2.  **DocumentEditorAgent**:
    - **역할**: 현재 활성화된 문서를 수정, 변경, 추가 또는 삭제합니다.
    - **트리거**: 사용자가 문서 내용에 대한 **구체적인 변경을 지시**할 때 활성화됩니다. ('...해줘', '...으로 바꿔줘', '...내용 추가해줘' 등)
    - **중요**: 문서 편집 세션(`is_document_editing_session`=True)에서는 사용자의 발언이 **편집과 관련된 지시일 가능성이 높다고 가정**하고, 우선적으로 이 에이전트를 고려해야 합니다. 단순 질문처럼 보여도 맥락상 편집 의도가 있다면 이 에이전트를 선택하세요.

3.  **GeneralChatAgent**:
    - **역할**: 일반적인 대화, 인사, 그리고 다른 두 전문가의 역할에 해당하지 않는 모든 질문을 처리합니다.
    - **트리거**: 사용자가 문서 내용을 제공하며 **설명이나 요약을 요청**하는 경우, 또는 문서 검색/편집과 무관한 대화를 나눌 때 활성화됩니다.

**라우팅 결정 프로세스:**

1.  **문서 편집 세션 확인**: `is_document_editing_session`이 `True`인지 확인합니다. `True`라면, 사용자의 요청이 편집 명령일 가능성을 높게 평가합니다.
2.  **사용자 요청 분석**: 최신 사용자 메시지와 대화 맥락을 종합하여, 위의 세 가지 역할 중 어디에 가장 부합하는지 판단합니다.
3.  **최종 결정**: 가장 적합한 전문가의 이름('DocumentSearchAgent', 'DocumentEditorAgent', 'GeneralChatAgent')을 정확하게 반환합니다.

**대화 기록과 사용자의 최신 질문을 바탕으로, 어떤 전문가를 사용해야 합니까?**

오직 'DocumentSearchAgent', 'DocumentEditorAgent', 'GeneralChatAgent' 중 하나로만 대답하십시오.
"""

    # Invoke LLM with the system prompt and the entire message history
    response = llm.invoke([SystemMessage(content=system_prompt)] + messages)
    decision = response.content.strip()

    # If agent requires a document but it's not in the state, request it.
    if ("DocumentEditorAgent" in decision or "DocumentSearchAgent" in decision) and not state.get("document_content"):
        print(f"--- Decision: {decision}, but document not found. Routing to request_document. ---")
        return "request_document"
    
    print(f"Routing decision: {decision}")

    if "DocumentSearchAgent" in decision:
        return "document_search"
    elif "DocumentEditorAgent" in decision:
        return "document_edit"
    else:
        return "general_chat"

# --- Graph Definition ---

def RoutingAgent():
    """
    Compiles the master routing agent that directs traffic to sub-agents.
    """
    # Instantiate the sub-agents that this router will call
    general_agent = GeneralChatAgent()
    document_search_agent = DocumentSearchAgent()
    document_editor_agent = DocumentEditAgent()

    # Define the master graph
    workflow = StateGraph(AgentState)

    # Add the sub-graphs as nodes
    workflow.add_node("document_search", document_search_agent)
    workflow.add_node("general_chat", general_agent)
    workflow.add_node("document_edit", document_editor_agent)
    workflow.add_node("request_document", request_document_node) # Add the new node

    # The entry point is the router function
    workflow.set_conditional_entry_point(
        route_question,
        {
            "document_search": "document_search",
            "general_chat": "general_chat",
            "document_edit": "document_edit",
            "request_document": "request_document", # Add the new route
        }
    )

    # Add edges from the sub-agents to the end
    workflow.add_edge("document_search", END)
    workflow.add_edge("general_chat", END)
    workflow.add_edge("document_edit", END)
    workflow.add_edge("request_document", END) # Add edge for the new node

    # Compile the master agent
    return workflow.compile()

def generate_config(session_id: str) -> RunnableConfig:
    """
    Generates a config for the agent run.
    """
    return RunnableConfig(
        recursion_limit=20,
        configurable={"thread_id": session_id},
    )