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
from .GeneralChatAgent import GeneralChatAgent  # 주석처리 예정
from .DocumentSearchAgent import DocumentSearchAgent
from .DocumentEditorAgent import DocumentEditorAgent
from .BusinessRejectionAgent import BusinessRejectionAgent

load_dotenv()

# --- Workflow Management Nodes ---

def workflow_orchestrator_node(state: AgentState) -> dict:
    """
    Central orchestrator that manages multi-step workflows.
    Determines the next step based on current workflow state.
    """
    print(f"--- WORKFLOW ORCHESTRATOR: Current step = {state.get('workflow_step', 'INITIAL')} ---")
    
    # --- Global check: if document is required but missing ---
    requires_document = state.get("workflow_step") in [
        WorkflowStep.EDIT_REQUESTED,
        WorkflowStep.SEARCH_REQUESTED
    ]
    if requires_document and not state.get("document_content"):
        print("--- Document missing, requesting from frontend ---")
        return request_document_node(state)
    
    current_step = state.get('workflow_step', WorkflowStep.INITIAL)
    # --- Document missing check ---
    if current_step in [WorkflowStep.EDIT_REQUESTED, WorkflowStep.SEARCH_REQUESTED] \
       and not state.get("document_content"):
        print("--- Document missing, forcing request_document step ---")
        return {"workflow_step": WorkflowStep.REQUEST_DOCUMENT,
                "next_agents": [],
                "workflow_complete": False,
                "needs_document_content": True}
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
        "next_agents": next_agents
    }

def request_document_node(state: AgentState) -> dict:
    """
    Sets the flag to request the document from the frontend.
    This node can now be safely called in any state where document_content is missing.
    """
    print("--- REQUESTING DOCUMENT CONTENT FROM FRONTEND ---")
    return {"needs_document_content": True, "workflow_step": WorkflowStep.REQUEST_DOCUMENT}

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
    
    # Default to business rejection
    return {
        "agents": ["business_rejection"],
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
                "agents": ["document_search"],
                "next_step": WorkflowStep.SEARCH_REQUESTED,
                "confidence": 0.75
            }
    
    return {"agents": [], "next_step": None, "confidence": 0.5}

def llm_based_intent_analysis(user_input: str, state: AgentState) -> Dict[str, Any]:
    """LLM-based fallback for complex intent analysis."""
    
    llm = ChatOpenAI(model_name='gpt-4o-mini', temperature=0)
    
    prompt = f"""Classify user intent concisely based on the rules.

User input: "{user_input}"

Respond with JSON only.

**Rules & JSON format:**
- **For document search:**
  {{
      "primary_intent": "search",
      "agents": ["document_search"],
      "next_step": "search_requested",
      "confidence": 0.9
  }}
- **For document editing:**
  {{
      "primary_intent": "edit",
      "agents": ["document_edit"],
      "next_step": "edit_requested",
      "confidence": 0.9
  }}
- **For multi-step tasks (e.g., "find and summarize"):**
  {{
      "primary_intent": "multi_step",
      "agents": ["document_search", "document_edit"],
      "next_step": "search_requested",
      "confidence": 0.9
  }}
- **For anything else (general chat, non-work topics):**
  {{
      "primary_intent": "rejection",
      "agents": ["business_rejection"],
      "next_step": "workflow_completed",
      "confidence": 0.9
  }}
"""

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        import json
        # Find the JSON block in the response
        json_match = re.search(r'```json\n(.*?)\n```', response.content, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Fallback for raw JSON
            json_str = response.content
        
        result = json.loads(json_str)
        return result
    except Exception as e:
        from ..utils.error_handler import log_error_with_context, is_retryable_error
        log_error_with_context(e, {"function": "llm_based_intent_analysis", "input": user_input[:50]})
        
        return {
            "agents": ["business_rejection"],
            "next_step": WorkflowStep.WORKFLOW_COMPLETED,
            "confidence": 0.4
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
            return ["document_search"]  # For analysis/summarization
    return ["document_search"]

def needs_editing_after_analysis(state: AgentState) -> bool:
    """Check if editing is needed after analysis."""
    # For now, assume no editing after analysis unless explicitly requested
    return False

# --- Legacy Router Function (for backward compatibility) ---

def route_question(state: AgentState) -> Literal["document_search", "business_rejection", "document_edit", "request_document"]:
    """
    업무 전용 챗봇 라우팅 - 문서 편집/검색만 허용, 나머지는 거부
    """
    print("---ROUTING QUESTION (업무 전용)---")
    
    # Pass the entire message history to the LLM for better context
    messages = state["messages"]
    
    llm = ChatOpenAI(model_name='gpt-4o', temperature=0)
    
    # 업무 전용 라우팅 프롬프트
    system_prompt = f"""당신은 업무 전용 AI 어시스턴트의 라우팅 전문가입니다. 사용자의 요청이 업무 관련인지 판단하고 적절한 처리 방향을 결정합니다.

**허용되는 업무 영역:**

1. **DocumentSearchAgent** (문서 검색):
   - 내부 문서 검색 요청
   - 문서 찾기, 다운로드 링크 요청
   - 문서 관련 정보 검색

2. **DocumentEditorAgent** (문서 편집):
   - 문서 내용 수정, 변경, 추가, 삭제
   - 문서 편집 지시사항
   - 문서 구조 변경 요청

3. **업무 관련 질문** (DocumentSearchAgent로 처리):
   - 문서 내용에 대한 설명이나 요약 요청
   - "이 문서는 언제 작성된 건가요?" 같은 문서 관련 질문
   - 업무 프로세스나 규정에 대한 질문

**거부 대상 (BusinessRejection):**
- 일반적인 대화 (안녕하세요, 날씨, 개인적인 질문 등)
- 업무와 무관한 정보 요청
- 오락, 게임, 개인적 상담
- 회사 업무와 직접 관련 없는 모든 요청
- 모호하여 업무 관련인지 불분명한 요청

**판단 기준:**
1. 문서 편집/검색과 직접 관련이 있는가?
2. 회사 업무 수행에 필요한 정보인가?
3. 문서나 업무 프로세스와 연관이 있는가?

**결과:** 다음 중 하나로만 응답하세요:
- "DocumentSearchAgent" (문서 검색/업무 질문)
- "DocumentEditorAgent" (문서 편집)
- "BusinessRejection" (업무 외 요청 거부)
"""

    # Invoke LLM with the system prompt and the entire message history
    response = llm.invoke([SystemMessage(content=system_prompt)] + messages)
    decision = response.content.strip()

    # If agent requires a document but it's not in the state, request it.
    if ("DocumentEditorAgent" in decision or "DocumentSearchAgent" in decision) and not state.get("document_content"):
        print(f"--- Decision: {decision}, but document not found. Routing to request_document. ---")
        return "request_document"
    
    print(f"업무 전용 라우팅 결과: {decision}")

    if "DocumentSearchAgent" in decision:
        return "document_search"
    elif "DocumentEditorAgent" in decision:
        return "document_edit"
    else:
        return "business_rejection"

# --- Workflow Graph Creation ---

def RoutingAgent(workflow_type: str = "multi_step"):
    """
    Creates and returns the appropriate workflow graph.
    
    Args:
        workflow_type: "multi_step" (default) or "simple" for backward compatibility
    """
    from ..core.workflow_graph import WorkflowGraphFactory
    
    # Create agents registry with new class-based agents (업무 전용)
    agents_registry = {
        # "general_chat": GeneralChatAgent(),  # 업무 전용으로 비활성화
        "business_rejection": BusinessRejectionAgent(),  # 업무 외 요청 거부
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