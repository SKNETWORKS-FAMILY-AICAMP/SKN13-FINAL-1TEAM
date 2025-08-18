# DocumentSearchAgent.py

from typing import Any
from functools import partial
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig

from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

# Corrected import for RagState and tools
from .DocumentSearchAgentTools.RagState import RagState
from .DocumentSearchAgentTools.retriever_tool import RAG_search_tool
from .DocumentSearchAgentTools.agent_logic import (
    expand_query_tool,
    route_query_tool,
    handle_follow_up_tool,
    summarize_tool
)

load_dotenv()

# --- Main Agent Node ---

def agent_node(state: RagState, llm_with_tools: Any) -> dict:
    """Calls the LLM with the current state and returns the AI's response."""
    response = llm_with_tools.invoke(state["messages"])
    return {"messages": [response]}

# --- Graph Factory ---

def DocumentSearchAgent() -> Any:
    """Compiles and returns the LangGraph agent for document search."""
    
    llm = ChatOpenAI(model_name='gpt-4o', temperature=0, streaming=True)
    
    # Create partials for tools that need the LLM
    expand_tool_with_llm = partial(expand_query_tool, llm=llm)
    route_tool_with_llm = partial(route_query_tool, llm=llm)
    summarize_tool_with_llm = partial(summarize_tool, llm=llm)

    # Assign custom names to avoid issues with functools.partial
    expand_tool_with_llm.__name__ = "expand_query_tool"
    route_tool_with_llm.__name__ = "route_query_tool"
    summarize_tool_with_llm.__name__ = "summarize_tool"

    tools = [
        RAG_search_tool,
        expand_tool_with_llm,
        route_tool_with_llm,
        handle_follow_up_tool,
        summarize_tool_with_llm
    ]
    
    llm_with_tools = llm.bind_tools(tools)
    
    agent_node_with_llm = partial(agent_node, llm_with_tools=llm_with_tools)

    graph = StateGraph(RagState)
    graph.add_node("agent", agent_node_with_llm)
    graph.add_node("tools", ToolNode(tools))
    
    graph.set_entry_point("agent")
    graph.add_conditional_edges(
        "agent",
        tools_condition,
    )
    graph.add_edge("tools", "agent")

    return graph.compile(checkpointer=MemorySaver())

def generate_config(session_id: str) -> RunnableConfig:
    """Generates a config for the agent run."""
    return RunnableConfig(
        recursion_limit=50,
        configurable={"thread_id": session_id},
    )