# WorkflowOrchestrator.py (formerly RoutingAgent.py)

from typing import Literal, Dict, Any
from dotenv import load_dotenv
import re

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END
from langchain_core.runnables import RunnableConfig

# Import the comprehensive state and the sub-agents
from ..core.AgentState import AgentState, WorkflowStep
from .GeneralChatAgent import GeneralChatAgent
from .DocumentSearchAgent import DocumentSearchAgent
from .DocumentEditorAgent import DocumentEditorAgent

load_dotenv()

# --- Workflow Management Nodes ---

def workflow_orchestrator_node(state: AgentState) -> dict:
    """
    Central orchestrator that manages multi-step workflows.
    Determines the next step based on current workflow state.
    """
    print(f"--- WORKFLOW ORCHESTRATOR: Current step = {state.get('workflow_step', 'INITIAL')} ---")
    
    current_step = state.get('workflow_step', WorkflowStep.INITIAL)
    workflow_complete = state.get('workflow_complete', False)
    
    # If workflow is already complete, just return
    if workflow_complete:
        print("--- Workflow already complete ---")
        return {"workflow_step": WorkflowStep.WORKFLOW_COMPLETED}
    
    # Determine next steps based on current state
    next_agents = []
    next_step = current_step
    
    if current_step == WorkflowStep.INITIAL:
        # Analyze user intent and plan workflow
        intent_analysis = analyze_user_intent(state)
        next_agents = intent_analysis["agents"]
        next_step = intent_analysis["next_step"]
        
    elif current_step == WorkflowStep.SEARCH_COMPLETED:
        # After search, check if more steps needed
        if needs_analysis_or_editing(state):
            next_agents = determine_post_search_agents(state)
            next_step = WorkflowStep.ANALYSIS_NEEDED
        else:
            next_step = WorkflowStep.WORKFLOW_COMPLETED
            
    elif current_step == WorkflowStep.EDIT_COMPLETED:
        # After editing, usually done unless more work needed
        next_step = WorkflowStep.WORKFLOW_COMPLETED
        
    elif current_step == WorkflowStep.ANALYSIS_COMPLETED:
        # After analysis, check if editing is needed
        if needs_editing_after_analysis(state):
            next_agents = ["document_edit"]
            next_step = WorkflowStep.EDIT_REQUESTED
        else:
            next_step = WorkflowStep.WORKFLOW_COMPLETED
    
    # Document content is now always sent from frontend, no need to request it
    
    print(f"--- Next step: {next_step}, Next agents: {next_agents} ---")
    
    return {
        "workflow_step": next_step,
        "next_agents": next_agents,
        "workflow_complete": (next_step == WorkflowStep.WORKFLOW_COMPLETED)
    }

def request_document_node(state: AgentState) -> dict:
    """This node sets the flag to request the document from the frontend."""
    print("--- Setting flag to request document from frontend ---")
    return {"needs_document_content": True}

# --- Intent Analysis Functions ---

def analyze_user_intent(state: AgentState) -> Dict[str, Any]:
    """
    Analyzes user intent using 3-tier approach:
    1. Rule-based (fast)
    2. Lightweight classification (medium)
    3. LLM fallback (slow but accurate)
    """
    messages = state.get("messages", [])
    if not messages:
        return {"agents": ["general_chat"], "next_step": WorkflowStep.WORKFLOW_COMPLETED}
    
    # Get last user message
    last_message = messages[-1]
    user_input = getattr(last_message, 'content', str(last_message)).lower()
    
    print(f"--- Analyzing intent for: {user_input[:100]}... ---")
    
    # TIER 1: Rule-based classification
    rule_result = rule_based_intent_analysis(user_input)
    if rule_result["confidence"] > 0.8:
        return rule_result
    
    # TIER 2: Pattern-based classification
    pattern_result = pattern_based_intent_analysis(user_input, state)
    if pattern_result["confidence"] > 0.7:
        return pattern_result
    
    # TIER 3: LLM fallback for complex cases
    return llm_based_intent_analysis(user_input, state)

def rule_based_intent_analysis(user_input: str) -> Dict[str, Any]:
    """Fast rule-based intent classification."""
    
    # Document editing patterns
    edit_patterns = [
        r'(수정|편집|바꿔|변경|추가|삭제|넣어|제거).*?줘',
        r'(작성|써|입력).*?줘',
        r'(제목|문단|리스트|테이블).*?(만들|추가|생성)',
        r'(굵게|이탤릭|밑줄|색깔|정렬)'
    ]
    
    # Document search patterns  
    search_patterns = [
        r'(찾아|검색).*?줘',
        r'(문서|보고서|자료|파일).*?(어디|있나|보여줘)',
        r'(다운로드|링크).*?(주세요|줘)'
    ]
    
    # Multi-step patterns (search then edit)
    multi_step_patterns = [
        r'찾아서.*?(추가|넣어|작성)',
        r'검색해서.*?(편집|수정)',
        r'문서.*?찾아.*?(요약|정리)'
    ]
    
    # Check patterns
    for pattern in multi_step_patterns:
        if re.search(pattern, user_input):
            return {
                "agents": ["document_search", "document_edit"],
                "next_step": WorkflowStep.SEARCH_REQUESTED,
                "confidence": 0.9
            }
    
    for pattern in edit_patterns:
        if re.search(pattern, user_input):
            return {
                "agents": ["document_edit"],
                "next_step": WorkflowStep.EDIT_REQUESTED,
                "confidence": 0.85
            }
    
    for pattern in search_patterns:
        if re.search(pattern, user_input):
            return {
                "agents": ["document_search"],
                "next_step": WorkflowStep.SEARCH_REQUESTED,
                "confidence": 0.85
            }
    
    # Default to general chat
    return {
        "agents": ["general_chat"],
        "next_step": WorkflowStep.WORKFLOW_COMPLETED,
        "confidence": 0.6
    }

def pattern_based_intent_analysis(user_input: str, state: AgentState) -> Dict[str, Any]:
    """Context-aware pattern analysis."""
    
    # Check previous workflow context
    workflow_results = state.get("workflow_results", {})
    
    # If we have search results, user might want to do something with them
    if "search" in workflow_results:
        analysis_keywords = ["요약", "정리", "분석", "설명"]
        edit_keywords = ["추가", "넣어", "작성", "포함"]
        
        if any(keyword in user_input for keyword in edit_keywords):
            return {
                "agents": ["document_edit"],
                "next_step": WorkflowStep.EDIT_REQUESTED,
                "confidence": 0.75
            }
        elif any(keyword in user_input for keyword in analysis_keywords):
            return {
                "agents": ["general_chat"],
                "next_step": WorkflowStep.ANALYSIS_NEEDED,
                "confidence": 0.75
            }
    
    return {"agents": [], "next_step": None, "confidence": 0.5}

def llm_based_intent_analysis(user_input: str, state: AgentState) -> Dict[str, Any]:
    """LLM-based fallback for complex intent analysis."""
    
    llm = ChatOpenAI(model_name='gpt-4o-mini', temperature=0)  # Use cheaper model
    
    prompt = f"""Classify user intent concisely:

User input: "{user_input}"

Respond with JSON only:
{{
    "primary_intent": "search|edit|chat|multi_step",
    "agents": ["document_search"|"document_edit"|"general_chat"],
    "next_step": "search_requested|edit_requested|analysis_needed|workflow_completed",
    "confidence": 0.0-1.0
}}

Rules:
- search: finding/downloading documents
- edit: modifying document content  
- chat: general conversation/analysis
- multi_step: requires multiple agents (e.g., "find report and summarize")"""

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        import json
        result = json.loads(response.content)
        return result
    except Exception as e:
        from ..utils.error_handler import log_error_with_context, is_retryable_error
        log_error_with_context(e, {"function": "llm_based_intent_analysis", "input": user_input[:50]})
        
        # 재시도 가능한 에러면 confidence를 낮추고, 아니면 더 낮춤
        confidence = 0.4 if is_retryable_error(e) else 0.2
        
        return {
            "agents": ["general_chat"],
            "next_step": WorkflowStep.WORKFLOW_COMPLETED,
            "confidence": confidence
        }

# --- Workflow Decision Functions ---

def needs_analysis_or_editing(state: AgentState) -> bool:
    """Check if search results need further processing."""
    workflow_results = state.get("workflow_results", {})
    search_results = workflow_results.get("search", {})
    
    # If search found documents, check if user wanted to do something with them
    if search_results and search_results.get("documents"):
        messages = state.get("messages", [])
        if messages:
            last_message = getattr(messages[-1], 'content', '').lower()
            return any(keyword in last_message for keyword in ['요약', '정리', '분석', '추가', '편집'])
    
    return False

def determine_post_search_agents(state: AgentState) -> list:
    """Determine which agents to call after search completion."""
    messages = state.get("messages", [])
    if messages:
        last_message = getattr(messages[-1], 'content', '').lower()
        if any(keyword in last_message for keyword in ['추가', '편집', '넣어', '작성']):
            return ["document_edit"]
        else:
            return ["general_chat"]  # For analysis/summarization
    return ["general_chat"]

def needs_editing_after_analysis(state: AgentState) -> bool:
    """Check if editing is needed after analysis."""
    # For now, assume no editing after analysis unless explicitly requested
    return False

# --- Legacy Router Function (for backward compatibility) ---

def route_question(state: AgentState) -> Literal["document_search", "general_chat", "document_edit", "request_document"]:
    """
    Classifies the user's question to decide which agent should handle it, considering conversation history.
    If the agent requires a document but it's not present, it routes to request the document.
    """
    print("---ROUTING QUESTION---")
    
    # Pass the entire message history to the LLM for better context
    messages = state["messages"]
    
    llm = ChatOpenAI(model_name='gpt-4o', temperature=0)
    
    # Upgraded system_prompt for more robust routing
    system_prompt = f"""당신은 사용자의 질문을 분석하여 가장 적절한 전문가에게 전달하는 라우팅 전문가입니다. 대화의 전체 맥락을 고려하여 최적의 결정을 내리십시오.

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

# --- Workflow Graph Creation ---

def RoutingAgent(workflow_type: str = "multi_step"):
    """
    Creates and returns the appropriate workflow graph.
    
    Args:
        workflow_type: "multi_step" (default) or "simple" for backward compatibility
    """
    from ..core.workflow_graph import WorkflowGraphFactory
    
    # Create agents registry with new class-based agents
    agents_registry = {
        "general_chat": GeneralChatAgent(),
        "document_search": DocumentSearchAgent(), 
        "document_edit": DocumentEditorAgent()
    }
    
    # Create appropriate workflow graph
    if workflow_type == "simple":
        workflow_graph = WorkflowGraphFactory.create_simple_routing(agents_registry)
    else:
        workflow_graph = WorkflowGraphFactory.create_multi_step_workflow(agents_registry)
    
    # Return compiled graph
    return workflow_graph.compile()

def MultiStepWorkflowAgent():
    """
    Creates a multi-step workflow agent.
    Supports complex workflows like: search -> analyze -> edit
    """
    return RoutingAgent(workflow_type="multi_step")

def SimpleRoutingAgent():
    """
    Creates a simple routing agent (backward compatibility).
    Single-step routing only.
    """
    return RoutingAgent(workflow_type="simple")

def generate_config(session_id: str) -> RunnableConfig:
    """
    Generates a config for the agent run.
    """
    return RunnableConfig(
        recursion_limit=50,  # Increased for multi-step workflows
        configurable={"thread_id": session_id},
    )

# --- Legacy Support ---

def create_legacy_routing_agent():
    """
    Creates the old-style routing agent for backward compatibility.
    DEPRECATED: Use RoutingAgent() or MultiStepWorkflowAgent() instead.
    """
    return SimpleRoutingAgent()