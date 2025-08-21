# RoutingAgent.py

from typing import Literal
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage
from langgraph.graph import StateGraph, END
from langchain_core.runnables import RunnableConfig

# Import the comprehensive state and the sub-agents
from .DocumentSearchAgentTools.AgentState import AgentState
from .chat_agent import agent as GeneralChatAgent
from .DocumentSearchAgent import DocumentSearchAgent
from .DocumentEditorAgent import DocumentEditAgent

load_dotenv()

# --- Router Logic ---

def route_question(state: AgentState) -> Literal["document_search", "general_chat", "document_edit"]:
    """
    Classifies the user's question to decide which agent should handle it, considering conversation history.
    """
    print("---ROUTING QUESTION---")
    
    # Pass the entire message history to the LLM for better context
    messages = state["messages"]
    
    llm = ChatOpenAI(model_name='gpt-4o', temperature=0)
    
    # Upgraded system_prompt for more robust routing
    system_prompt = f"""당신은 사용자의 질문을 가장 적절한 전문가에게 전달하는 라우팅 전문가입니다.
정확한 라우팅 결정을 위해 전체 대화 기록을 반드시 고려해야 합니다.

**중요**: 현재 사용자가 문서 편집 세션 중(`is_document_editing_session`이 True)이라면, 사용자의 질문이 문서에 내용을 추가하거나 수정하려는 의도일 가능성이 높습니다. 이 경우, 질문 내용이 일반 대화처럼 보이더라도 **DocumentEditorAgent**를 우선적으로 고려하십시오.

세 명의 전문가가 있습니다:

1.  **DocumentSearchAgent**: 재무 보고서, 감사 결과, 내부 규정 등 **내부 문서 검색**이 필요한 질문에 사용합니다. 문서 검색 후 다운로드 링크를 요청하는 등의 후속 질문도 포함됩니다.

2.  **DocumentEditorAgent**: 사용자가 현재 작업중인 문서의 내용을 **수정, 변경, 추가, 삭제 등 편집**을 요청할 때 사용합니다. 사용자의 메시지에 '수정해줘', '바꿔줘', '추가해줘' 같은 **명령어**와 함께 **편집할 문서 내용**이 포함되어 있거나, **문서 편집 세션 중**에 문서에 내용을 추가하려는 의도(예: "재밌는 농담 작성해줘!")가 명확할 때 사용합니다.

3.  **GeneralChatAgent**: 일반적인 대화, 인사, 또는 위 두 전문가의 역할을 제외한 모든 질문에 사용합니다. **단, 요청에 문서 내용이 포함되어 있거나, 문서 편집/검색과 관련된 단어가 있다면 이 에이전트를 사용해서는 안 됩니다.**

대화 기록과 사용자의 최신 질문을 바탕으로, 어떤 전문가를 사용해야 합니까?

오직 'DocumentSearchAgent', 'DocumentEditorAgent', 'GeneralChatAgent' 중 하나로만 대답하십시오.
"""

    # Invoke LLM with the system prompt and the entire message history
    response = llm.invoke([SystemMessage(content=system_prompt)] + messages)
    decision = response.content.strip()
    
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

    # The entry point is the router function
    workflow.set_conditional_entry_point(
        route_question,
        {
            "document_search": "document_search",
            "general_chat": "general_chat",
            "document_edit": "document_edit",
        }
    )

    # Add edges from the sub-agents to the end
    workflow.add_edge("document_search", END)
    workflow.add_edge("general_chat", END)
    workflow.add_edge("document_edit", END)

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
