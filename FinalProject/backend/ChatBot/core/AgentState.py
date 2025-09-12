from typing import TypedDict, List, Optional, Annotated, Dict, Any, Union
from langchain_core.messages import BaseMessage, HumanMessage # Added HumanMessage
from langgraph.graph.message import add_messages
from enum import Enum
from dataclasses import dataclass

# Workflow step enumeration for type safety
class WorkflowStep(str, Enum):
    """Workflow step enumeration with clear progression."""
    INITIAL = "initial"
    SEARCH_REQUESTED = "search_requested"
    SEARCH_COMPLETED = "search_completed"
    EDIT_REQUESTED = "edit_requested"
    EDIT_COMPLETED = "edit_completed"
    ANALYSIS_NEEDED = "analysis_needed"
    ANALYSIS_COMPLETED = "analysis_completed"
    WORKFLOW_COMPLETED = "workflow_completed"
    ERROR = "error"
    AWAITING_SELECTION = "awaiting_selection"

# Agent types for better routing
class AgentType(str, Enum):
    """Available agent types."""
    DOCUMENT_SEARCH = "document_search"
    DOCUMENT_EDIT = "document_edit"
    GENERAL_CHAT = "general_chat"

@dataclass
class WorkflowResult:
    """Structured workflow result data."""
    agent_type: AgentType
    success: bool
    data: Dict[str, Any]
    error: Optional[str] = None
    timestamp: Optional[str] = None



class AgentState(TypedDict):
    messages: List[BaseMessage]
    workflow_step: WorkflowStep
    next_agents: List[str]
    workflow_complete: bool
    tool_name: str
    tool_args: Dict[str, Any]
    tool_output: Any
    response: str
    needs_document_content: bool
    document_content: str
    search_results: List[Dict[str, Any]]
    
    # 다운로드 버튼 관련 필드들
    action: Optional[str]  # "show_document_buttons" 등 프론트엔드 액션
    document_selection: Optional[Dict[str, Any]]  # 문서 선택 버튼 데이터
    final_answer: Optional[str]  # 최종 답변
    
    # 워크플로우 관련 필드들 (create_initial_state에서 사용됨)
    generation: Optional[Any]
    workflow_results: Optional[Dict[str, Any]]
    workflow_context: Optional[Dict[str, Any]]
    workflow_error: Optional[str]
    agent_data: Optional[Dict[str, Any]]
    
    # 문서 편집 관련 필드들
    send_to_editor: Optional[bool]
    selected_document: Optional[Dict[str, Any]]


# Helper functions for easier AgentState manipulation
class AgentStateHelper:
    """Utility class for common AgentState operations."""
    
    @staticmethod
    def create_initial_state(
        prompt: str,
        document_content: Optional[str] = None,
        messages: Optional[List[BaseMessage]] = None
    ) -> AgentState:
        """Create a clean initial state."""
        return AgentState(
            # 기본 필드들
            messages=(messages or []) + [HumanMessage(content=prompt)], # Add current prompt as HumanMessage
            workflow_step=WorkflowStep.INITIAL,
            next_agents=[],
            workflow_complete=False,
            tool_name="",
            tool_args={},
            tool_output=None,
            response="",
            needs_document_content=False,
            document_content=document_content or "",
            search_results=[], # Ensure search_results is initialized
            
            # 다운로드 버튼 관련 필드들
            action=None,
            document_selection=None,
            final_answer=None,
            
            # 워크플로우 관련 필드들
            generation=None,
            workflow_results={},
            workflow_context={},
            workflow_error=None,
            agent_data={},
            
            # 문서 편집 관련 필드들
            send_to_editor=None,
            selected_document=None
        )
    
    @staticmethod
    def add_workflow_result(
        state: AgentState,
        agent_type: AgentType,
        success: bool,
        data: Dict[str, Any],
        error: Optional[str] = None
    ) -> None:
        """Add a workflow result to the state."""
        if "workflow_results" not in state:
            state["workflow_results"] = {}
        
        state["workflow_results"][agent_type] = WorkflowResult(
            agent_type=agent_type,
            success=success,
            data=data,
            error=error
        )
    
    @staticmethod
    def get_workflow_result(
        state: AgentState,
        agent_type: AgentType
    ) -> Optional[WorkflowResult]:
        """Get workflow result for specific agent."""
        return state.get("workflow_results", {}).get(agent_type)
    
    @staticmethod
    def set_next_agents(state: AgentState, agents: List[AgentType]) -> None:
        """Set the queue of agents to execute next."""
        state["next_agents"] = agents
    
    @staticmethod
    def pop_next_agent(state: AgentState) -> Optional[AgentType]:
        """Remove and return the next agent to execute."""
        next_agents = state.get("next_agents", [])
        if next_agents:
            return next_agents.pop(0)
        return None
    
    @staticmethod
    def add_agent_data(
        state: AgentState,
        agent_type: AgentType,
        key: str,
        value: Any
    ) -> None:
        """Add agent-specific data."""
        if "agent_data" not in state:
            state["agent_data"] = {}
        if agent_type not in state["agent_data"]:
            state["agent_data"][agent_type] = {}
        
        state["agent_data"][agent_type][key] = value
    
    @staticmethod
    def get_agent_data(
        state: AgentState,
        agent_type: AgentType,
        key: str,
        default: Any = None
    ) -> Any:
        """Get agent-specific data."""
        return state.get("agent_data", {}).get(agent_type, {}).get(key, default)
    
    @staticmethod
    def set_workflow_step(state: AgentState, step: WorkflowStep) -> None:
        """Update workflow step."""
        state["workflow_step"] = step
    
    @staticmethod
    def mark_workflow_complete(state: AgentState) -> None:
        """Mark workflow as complete."""
        state["workflow_complete"] = True
        state["workflow_step"] = WorkflowStep.WORKFLOW_COMPLETED
    
    @staticmethod
    def set_workflow_error(state: AgentState, error: str) -> None:
        """Set workflow error."""
        state["workflow_error"] = error
        state["workflow_step"] = WorkflowStep.ERROR
    
    @staticmethod
    def is_workflow_complete(state: AgentState) -> bool:
        """Check if workflow is complete."""
        return state.get("workflow_complete", False)
    
    @staticmethod
    def has_workflow_error(state: AgentState) -> bool:
        """Check if workflow has error."""
        return bool(state.get("workflow_error"))
    
    @staticmethod
    def get_last_user_message(state: AgentState) -> Optional[str]:
        """Get the last user message content."""
        messages = state.get("messages", [])
        for msg in reversed(messages):
            if hasattr(msg, 'type') and msg.type == "human":
                return getattr(msg, 'content', None)
            elif hasattr(msg, 'content'):
                # Fallback for different message types
                content = getattr(msg, 'content', '')
                if content and not content.startswith('['):  # Skip tool messages
                    return content
        return None


# Convenience functions for backward compatibility
def create_simple_state(prompt: str, document_content: Optional[str] = None) -> AgentState:
    """Create a simple state for single-step agents."""
    return AgentStateHelper.create_initial_state(prompt, document_content)
