# workflow_graph.py
"""
Centralized workflow graph management with clean OOP design.
Separates graph logic from business logic for better maintainability.
"""

from typing import Dict, Any, Optional
from abc import ABC, abstractmethod

from langgraph.graph import StateGraph, END, START
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.runnables import RunnableConfig

from .AgentState import AgentState, WorkflowStep


class BaseWorkflowGraph(ABC):
    """Abstract base class for all workflow graphs."""
    
    def __init__(self, checkpointer=None):
        self.checkpointer = checkpointer or MemorySaver()
        self.graph = None
        self._compiled_graph = None
    
    @abstractmethod
    def build_graph(self) -> StateGraph:
        """Build and return the workflow graph."""
        pass
    
    def compile(self) -> Any:
        """Compile the graph with checkpointer."""
        if not self.graph:
            self.graph = self.build_graph()
        
        if not self._compiled_graph:
            self._compiled_graph = self.graph.compile(checkpointer=self.checkpointer)
        
        return self._compiled_graph
    
    def generate_config(self, session_id: str) -> RunnableConfig:
        """Generate standard config for agent runs."""
        return RunnableConfig(
            recursion_limit=50,
            configurable={"thread_id": session_id}
        )


class MultiStepWorkflowGraph(BaseWorkflowGraph):
    """
    Multi-step workflow graph that supports complex agent orchestration.
    Handles search -> analysis -> edit workflows intelligently.
    """
    
    def __init__(self, agents_registry: Dict[str, Any], checkpointer=None):
        super().__init__(checkpointer)
        self.agents_registry = agents_registry
        
    def build_graph(self) -> StateGraph:
        """Build the multi-step workflow graph."""
        
        # Create the main workflow graph
        workflow = StateGraph(AgentState)
        
        # Add core workflow nodes
        workflow.add_node("workflow_orchestrator", self._workflow_orchestrator_node)
        workflow.add_node("request_document", self._request_document_node)
        
        # Add specialized agent nodes (using new class-based agents)
        workflow.add_node("document_search", self._document_search_node)
        workflow.add_node("document_edit", self._document_edit_node) 
        # workflow.add_node("general_chat", self._general_chat_node)  # 업무 전용으로 비활성화
        workflow.add_node("business_rejection", self._business_rejection_node)
        
        # Add workflow completion tracker
        workflow.add_node("workflow_tracker", self._workflow_tracker_node)
        
        # Define the workflow entry point
        workflow.set_entry_point("workflow_orchestrator")
        
        # Add conditional edges from orchestrator
        workflow.add_conditional_edges(
            "workflow_orchestrator",
            self._route_next_step,
            {
                # Document management
                "request_document": "request_document",
                
                # Agent routing
                "document_search": "document_search", 
                "document_edit": "document_edit",
                "general_chat": "business_rejection",
                "business_rejection": "business_rejection",
                
                # Workflow control
                "workflow_tracker": "workflow_tracker",
                "end": END
            }
        )
        
        # Agent completion routes back to orchestrator for next steps
        for agent_name in self.agents_registry.keys():
            workflow.add_edge(agent_name, "workflow_tracker")
        
        # Document request routes back to orchestrator
        workflow.add_edge("request_document", "workflow_orchestrator")
        
        # Tracker decides next action
        workflow.add_conditional_edges(
            "workflow_tracker",
            self._check_workflow_completion,
            {
                "continue": "workflow_orchestrator",
                "complete": END
            }
        )
        
        return workflow
    
    def _workflow_orchestrator_node(self, state: AgentState) -> Dict[str, Any]:
        """Central orchestrator that manages workflow steps."""
        print("--- EXECUTING NODE: workflow_orchestrator ---")
        from ..agents.RoutingAgent import workflow_orchestrator_node
        return workflow_orchestrator_node(state)
    
    def _request_document_node(self, state: AgentState) -> Dict[str, Any]:
        """Handle document requests from frontend."""
        from ..agents.RoutingAgent import request_document_node
        return request_document_node(state)
    
    def _document_search_node(self, state: AgentState) -> Dict[str, Any]:
        """Document search processing node."""
        search_agent = self.agents_registry.get("document_search")
        if search_agent:
            return search_agent.process(state)
        return {"workflow_error": "DocumentSearchAgent not found"}
    
    def _document_edit_node(self, state: AgentState) -> Dict[str, Any]:
        """Document editing processing node."""
        edit_agent = self.agents_registry.get("document_edit")
        if edit_agent:
            return edit_agent.process(state)
        return {"workflow_error": "DocumentEditorAgent not found"}
    
    # def _general_chat_node(self, state: AgentState) -> Dict[str, Any]:
    #     """General chat processing node."""
    #     chat_agent = self.agents_registry.get("general_chat")
    #     if chat_agent:
    #         return chat_agent.process(state)
    #     return {"workflow_error": "GeneralChatAgent not found"}
    
    def _business_rejection_node(self, state: AgentState) -> Dict[str, Any]:
        """Business rejection processing node."""
        print("--- EXECUTING NODE: business_rejection ---")
        rejection_agent = self.agents_registry.get("business_rejection")
        if rejection_agent:
            return rejection_agent.process(state)
        return {"workflow_error": "BusinessRejectionAgent not found"}
    
    def _workflow_tracker_node(self, state: AgentState) -> Dict[str, Any]:
        """Track workflow progress and update state."""
        print("--- EXECUTING NODE: workflow_tracker ---")
        print(f"--- WORKFLOW TRACKER: Processing step {state.get('workflow_step')} ---")
        
        current_step = state.get('workflow_step')
        workflow_results = state.get('workflow_results', {})
        
        # Update workflow state based on completed step
        updates = {}
        
        if current_step == WorkflowStep.SEARCH_REQUESTED:
            updates['workflow_step'] = WorkflowStep.SEARCH_COMPLETED
        elif current_step == WorkflowStep.EDIT_REQUESTED:
            updates['workflow_step'] = WorkflowStep.EDIT_COMPLETED
        elif current_step == WorkflowStep.ANALYSIS_NEEDED:
            updates['workflow_step'] = WorkflowStep.ANALYSIS_COMPLETED
        
        print(f"--- Workflow tracker updates: {updates} ---")
        return updates
    
    def _route_next_step(self, state: AgentState) -> str:
        """Route to the next step based on workflow state."""
        
        workflow_step = state.get('workflow_step', WorkflowStep.INITIAL)
        next_agents = state.get('next_agents', [])
        workflow_complete = state.get('workflow_complete', False)
        
        print(f"--- ROUTING: step={workflow_step}, agents={next_agents}, complete={workflow_complete} ---")
        
        # Document content is now always sent from frontend, no need to request it
        
        # Route to specific agents
        if next_agents:
            next_agent = next_agents[0]  # Take first agent from queue
            if next_agent in self.agents_registry:
                return next_agent
        
        # Check workflow completion
        if workflow_complete or workflow_step == WorkflowStep.WORKFLOW_COMPLETED:
            return "end"
        
        # Continue workflow processing
        return "workflow_tracker"
    
    def _check_workflow_completion(self, state: AgentState) -> str:
        """Check if workflow should continue or complete."""
        
        workflow_complete = state.get('workflow_complete', False)
        next_agents = state.get('next_agents', [])
        
        if workflow_complete:
            return "complete"
        
        # If there are more agents in queue, continue
        if len(next_agents) > 1:
            # Remove the completed agent from queue
            remaining_agents = next_agents[1:]
            # Update state to continue with remaining agents
            state['next_agents'] = remaining_agents
            return "continue"
        
        # If no more agents, check if workflow should continue
        workflow_step = state.get('workflow_step')
        if workflow_step in [WorkflowStep.SEARCH_COMPLETED, WorkflowStep.EDIT_COMPLETED, WorkflowStep.ANALYSIS_COMPLETED]:
            return "continue"  # Let orchestrator decide next steps
        
        return "complete"


class SimpleRoutingGraph(BaseWorkflowGraph):
    """
    Simple single-step routing graph (backward compatibility).
    For cases that don't need multi-step workflows.
    """
    
    def __init__(self, agents_registry: Dict[str, Any], checkpointer=None):
        super().__init__(checkpointer)
        self.agents_registry = agents_registry
    
    def build_graph(self) -> StateGraph:
        """Build simple routing graph."""
        
        workflow = StateGraph(AgentState)
        
        # Add agent nodes
        for agent_name, agent_instance in self.agents_registry.items():
            workflow.add_node(agent_name, agent_instance)
        
        # Add document request node
        workflow.add_node("request_document", self._request_document_node)
        
        # Set conditional entry point (legacy routing)
        workflow.set_conditional_entry_point(
            self._legacy_route_question,
            {
                "document_search": "document_search",
                "general_chat": "business_rejection",
                "business_rejection": "business_rejection",
                "document_edit": "document_edit",
                "request_document": "request_document"
            }
        )
        
        # All agents route to END
        for agent_name in self.agents_registry.keys():
            workflow.add_edge(agent_name, END)
        
        workflow.add_edge("request_document", END)
        
        return workflow
    
    def _request_document_node(self, state: AgentState) -> Dict[str, Any]:
        """Handle document requests."""
        from ..agents.RoutingAgent import request_document_node
        return request_document_node(state)
    
    def _legacy_route_question(self, state: AgentState) -> str:
        """Legacy routing function for backward compatibility."""
        from ..agents.RoutingAgent import route_question
        return route_question(state)


# Factory class for creating workflow graphs
class WorkflowGraphFactory:
    """Factory for creating different types of workflow graphs."""
    
    @staticmethod
    def create_multi_step_workflow(agents_registry: Dict[str, Any]) -> MultiStepWorkflowGraph:
        """Create a multi-step workflow graph."""
        return MultiStepWorkflowGraph(agents_registry)
    
    @staticmethod
    def create_simple_routing(agents_registry: Dict[str, Any]) -> SimpleRoutingGraph:
        """Create a simple routing graph."""
        return SimpleRoutingGraph(agents_registry)
    
    @staticmethod
    def create_default_workflow(agents_registry: Dict[str, Any]) -> MultiStepWorkflowGraph:
        """Create the default workflow (multi-step)."""
        return WorkflowGraphFactory.create_multi_step_workflow(agents_registry)