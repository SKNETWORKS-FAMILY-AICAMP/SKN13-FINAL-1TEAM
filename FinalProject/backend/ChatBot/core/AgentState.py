from typing import TypedDict, List, Optional, Annotated, Dict, Any, Union
from langchain_core.messages import BaseMessage
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

# Enhanced AgentState with clean design
class AgentState(TypedDict, total=False):
    """
    Comprehensive agent state that supports both simple and multi-step workflows.
    Designed for easy use by all agent types.
    """
    
    # === Core Communication Fields ===
    # User's latest input prompt
    prompt: str
    
    # Document content for editing/searching
    document_content: Optional[str]
    
    # Full conversation history (managed by LangGraph)
    messages: Annotated[List[BaseMessage], add_messages]
    
    # Final generated response
    generation: Optional[str]
    
    # === Frontend Communication ===
    # Request document content from frontend
    needs_document_content: bool
    
    # === Multi-Step Workflow Fields ===
    # Current workflow step
    workflow_step: WorkflowStep
    
    # Whether workflow is complete
    workflow_complete: bool
    
    # Structured results from each workflow step
    workflow_results: Dict[AgentType, WorkflowResult]
    
    # Queue of agents to execute next
    next_agents: List[AgentType]
    
    # Shared context between workflow steps
    workflow_context: Dict[str, Any]
    
    # Current workflow error (if any)
    workflow_error: Optional[str]
    
    # === Agent-Specific Data ===
    # Agent-specific intermediate data
    agent_data: Dict[AgentType, Dict[str, Any]]


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
            prompt=prompt,
            document_content=document_content,
            messages=messages or [],
            generation=None,
            needs_document_content=False,
            workflow_step=WorkflowStep.INITIAL,
            workflow_complete=False,
            workflow_results={},
            next_agents=[],
            workflow_context={},
            workflow_error=None,
            agent_data={}
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
