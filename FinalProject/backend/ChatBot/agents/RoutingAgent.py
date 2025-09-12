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
# from .DocumentSelectionAgent import DocumentSelectionAgent  # 클릭 방식으로 변경되어 불필요
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
            workflow_complete = True
            
    elif current_step == WorkflowStep.EDIT_COMPLETED:
        # After editing, usually done unless more work needed
        next_step = WorkflowStep.WORKFLOW_COMPLETED
        workflow_complete = True
        
    elif current_step == WorkflowStep.ANALYSIS_COMPLETED:
        # After analysis, check if editing is needed
        if needs_editing_after_analysis(state):
            next_agents = ["document_edit"]
            next_step = WorkflowStep.EDIT_REQUESTED
        else:
            next_step = WorkflowStep.WORKFLOW_COMPLETED
            workflow_complete = True
    
    # Document content is now always sent from frontend, no need to request it
    
    print(f"--- Next step: {next_step}, Next agents: {next_agents} ---")
    
    result = {
        "workflow_step": next_step,
        "next_agents": next_agents
    }
    
    # Add workflow_complete flag if set
    if 'workflow_complete' in locals():
        result["workflow_complete"] = workflow_complete
        
    return result

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
    """Semantic-based intent classification focusing on sentence structure."""
    
    # 1. 최종 요청 동작 파악 (가장 높은 우선순위)
    final_action_patterns = {
        'search': [
            r'(찾아|검색|보여)줘$',
            r'(어디|어떤).*?(있나|있어)$',
            r'(다운로드|링크).*?(주세요|줘)$',
            r'.*(문서편집창|편집부|편집창|에디터).*(띄워|열어|보여).*줘$',  # "문서편집창에 띄워줘" = 문서 검색 의도
        ],
        'edit': [
            r'(수정|편집|바꿔|변경|추가|삭제|넣어|제거)해?줘$',
            r'^(?!.*검색).*?(작성|써|입력)해?줘$',  # "검색"이 없는 경우만 작성 의도
            r'(만들어|생성해?)줘$'
        ],
        'multi_step': [
            r'찾아서.*?(추가|넣어|작성).*?줘$',
            r'검색해서.*?(편집|수정).*?줘$'
        ]
    }
    
    # 2. 문장 끝 동작으로 의도 판단
    for intent, patterns in final_action_patterns.items():
        for pattern in patterns:
            if re.search(pattern, user_input):
                confidence = 0.9
                if intent == 'search':
                    return {
                        "agents": ["document_search"],
                        "next_step": WorkflowStep.SEARCH_REQUESTED,
                        "confidence": confidence
                    }
                elif intent == 'edit':
                    return {
                        "agents": ["document_edit"],
                        "next_step": WorkflowStep.EDIT_REQUESTED,
                        "confidence": confidence
                    }
                elif intent == 'multi_step':
                    return {
                        "agents": ["document_search", "document_edit"],
                        "next_step": WorkflowStep.SEARCH_REQUESTED,
                        "confidence": confidence
                    }
    
    # 3. 문맥 기반 보조 판단 (명사구 vs 동사구)
    # "작성한 문서" (명사구) vs "작성해줘" (동사구)
    if re.search(r'(작성한|만든|생성한).*?(문서|보고서|파일)', user_input):
        # 명사구 형태는 검색 의도일 가능성 높음
        if any(keyword in user_input for keyword in ['찾', '검색', '보여', '어디']):
            return {
                "agents": ["document_search"],
                "next_step": WorkflowStep.SEARCH_REQUESTED,
                "confidence": 0.8
            }
    
    # 4. 기본 키워드 매칭 (낮은 우선순위)
    if any(keyword in user_input for keyword in ['찾', '검색', '보여']):
        return {
            "agents": ["document_search"],
            "next_step": WorkflowStep.SEARCH_REQUESTED,
            "confidence": 0.7
        }
    
    if any(keyword in user_input for keyword in ['수정', '편집', '변경', '추가', '삭제']):
        return {
            "agents": ["document_edit"],
            "next_step": WorkflowStep.EDIT_REQUESTED,
            "confidence": 0.7
        }
    
    # Default to business rejection
    return {
        "agents": ["business_rejection"],
        "next_step": WorkflowStep.WORKFLOW_COMPLETED,
        "confidence": 0.6
    }

def pattern_based_intent_analysis(user_input: str, state: AgentState) -> Dict[str, Any]:
    """Context-aware pattern analysis."""
    
    user_input_clean = user_input.lower().strip()
    
    # Check previous workflow context
    workflow_results = state.get("workflow_results", {})
    
    # 문서 선택은 이제 클릭 방식으로 처리되므로 해당 로직 제거
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
    
    prompt = f"""Classify user intent based on the user input and respond with the classification only.

User input: "{user_input}"

**Classification Options:**
1. SEARCH - If user wants to find, search, or retrieve documents
2. EDIT - If user wants to modify, edit, add content, or create documents
3. MULTI_STEP - If user wants to search first then edit/modify the results
4. REJECT - If user input is not work-related or cannot be processed

Respond with only ONE WORD: SEARCH, EDIT, MULTI_STEP, or REJECT"""

    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        classification = response.content.strip().upper()
        
        if "SEARCH" in classification:
            return {
                "agents": ["document_search"],
                "next_step": WorkflowStep.SEARCH_REQUESTED,
                "confidence": 0.8
            }
        elif "EDIT" in classification:
            return {
                "agents": ["document_edit"],
                "next_step": WorkflowStep.EDIT_REQUESTED,
                "confidence": 0.8
            }
        elif "MULTI_STEP" in classification:
            return {
                "agents": ["document_search", "document_edit"],
                "next_step": WorkflowStep.SEARCH_REQUESTED,
                "confidence": 0.8
            }
        else:  # REJECT or any other response
            return {
                "agents": ["business_rejection"],
                "next_step": WorkflowStep.WORKFLOW_COMPLETED,
                "confidence": 0.8
            }
            
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
    업무 전용 챗봇 라우팅 - 구조적 의미 분석 기반 라우팅
    """
    print("---ROUTING QUESTION (업무 전용)---")
    
    # Get user input from messages
    messages = state.get("messages", [])
    if not messages:
        return "business_rejection"
    
    last_message = messages[-1]
    user_input = getattr(last_message, 'content', str(last_message)).lower()
    
    print(f"--- 분석할 입력: {user_input[:100]}... ---")
    
    # Apply our improved semantic analysis
    intent_result = rule_based_intent_analysis(user_input)
    confidence = intent_result.get("confidence", 0.0)
    agents = intent_result.get("agents", [])
    
    print(f"--- 의미 분석 결과: {agents}, 신뢰도: {confidence} ---")
    
    # Map to legacy return format
    if "document_search" in agents:
        # If agent requires a document but it's not in the state, request it.
        if not state.get("document_content"):
            print("--- Document search requested but no document content. Routing to request_document. ---")
            return "request_document"
        return "document_search"
    elif "document_edit" in agents:
        # If agent requires a document but it's not in the state, request it.
        if not state.get("document_content"):
            print("--- Document edit requested but no document content. Routing to request_document. ---")
            return "request_document"
        return "document_edit"
    elif "business_rejection" in agents:
        return "business_rejection"
    
    # Fallback to LLM if confidence is too low
    if confidence < 0.7:
        print("--- 신뢰도 낮음, LLM fallback 사용 ---")
        return _llm_fallback_route(state, user_input)
    
    # Default fallback
    return "business_rejection"

def _llm_fallback_route(state: AgentState, user_input: str) -> Literal["document_search", "business_rejection", "document_edit", "request_document"]:
    """LLM 기반 fallback 라우팅."""
    messages = state["messages"]
    llm = ChatOpenAI(model_name='gpt-4o-mini', temperature=0)  # 더 빠른 모델 사용
    
    system_prompt = """업무 전용 AI 어시스턴트 라우팅. 간결하게 판단하세요.

**분류:**
- 문서 검색 요청 → "DocumentSearchAgent"
- 문서 편집 요청 → "DocumentEditorAgent"  
- 업무 외 요청 → "BusinessRejection"

**예시:**
- "엄준식이 작성한 문서 검색해줘" → DocumentSearchAgent
- "문서에 내용 추가해줘" → DocumentEditorAgent
- "안녕하세요" → BusinessRejection

한 단어로만 응답하세요: DocumentSearchAgent, DocumentEditorAgent, BusinessRejection 중 하나"""

    response = llm.invoke([SystemMessage(content=system_prompt)] + messages)
    decision = response.content.strip()
    
    print(f"--- LLM Fallback 결과: {decision} ---")
    
    if "DocumentSearchAgent" in decision:
        if not state.get("document_content"):
            return "request_document"
        return "document_search"
    elif "DocumentEditorAgent" in decision:
        if not state.get("document_content"):
            return "request_document"
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
        # "document_selection": DocumentSelectionAgent()  # 클릭 방식으로 변경되어 불필요
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