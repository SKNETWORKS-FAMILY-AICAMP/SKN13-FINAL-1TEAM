# DocumentEditorAgent.py (Refactored)

from typing import Any
from dotenv import load_dotenv

from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig

from langgraph.graph import StateGraph
from langgraph.checkpoint.memory import MemorySaver

from .DocumentSearchAgentTools.AgentState import AgentState

load_dotenv()

# --- Main Agent Node (Refactored) ---

def agent_node(state: AgentState, llm: Any) -> dict:
    """
    Refactored main node for DocumentEditAgent.
    This node directly instructs the LLM to perform the edit and return the full HTML.
    It does not use tools for the editing process itself.
    """
    print("--- DocumentEditAgent Node (Direct Edit Mode) ---")

    messages = state["messages"]
    document_content = state.get("document_content")

    if not document_content:
        return {"messages": [HumanMessage(content="Error: No document content provided to edit.")]}

    user_request = ""
    if messages and messages[-1].type == "human":
        user_request = messages[-1].content

    system_prompt = """You are an expert HTML document editor.
Your task is to take the user's request and the current document content and return the complete, fully edited HTML document.
Do not add any explanations, apologies, or introductory text like 'Here is the edited document:'.
Your response must be ONLY the raw, edited HTML content.
The HTML you return will be used directly to replace the old document.
"""

    final_prompt = f"""CURRENT DOCUMENT:\n---\n{document_content}\n---\n
USER REQUEST:\n---\n{user_request}\n---\n
Based on the user's request, return the complete and updated HTML content of the document.
"""

    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=final_prompt)
    ])
    
    return {"messages": [response]}

# --- Graph Factory (Refactored) ---

def DocumentEditAgent() -> Any:
    """Compiles and returns the refactored, simplified LangGraph agent."""

    llm = ChatOpenAI(model_name='gpt-4o', temperature=0, streaming=True)
    
    def runnable_agent_node(state: AgentState):
        return agent_node(state, llm)

    graph = StateGraph(AgentState)
    graph.add_node("agent", runnable_agent_node)
    graph.set_entry_point("agent")
    graph.set_finish_point("agent")
    
    return graph.compile(checkpointer=MemorySaver())

def generate_config(session_id: str) -> RunnableConfig:
    """Generates a config for the agent run."""
    return RunnableConfig(
        recursion_limit=5, # Recursion is no longer the main mechanism
        configurable={"thread_id": session_id},
    )