# DocumentSearchAgent.py

from typing import Any
from functools import partial
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig

from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

# State and Tools
from .RagState import RagState
from .retriever_tool import RAG_search_tool
from .agent_logic import (
    expand_query_tool,
    route_query_tool,
    handle_follow_up_tool,
    summarize_tool
)

load_dotenv()

# --- Graph Nodes ---

def agent_node(state: RagState, llm: Any) -> dict:
    """The primary node that calls the LLM with the available tools."""
    
    # Bind the LLM to the tools that require it
    # This creates new tool definitions with the llm object pre-filled
    expand_tool_with_llm = partial(expand_query_tool, llm=llm)
    route_tool_with_llm = partial(route_query_tool, llm=llm)
    summarize_tool_with_llm = partial(summarize_tool, llm=llm)

    # The full list of tools available to the LLM
    tools = [
        RAG_search_tool,
        expand_tool_with_llm,
        route_tool_with_llm,
        handle_follow_up_tool,
        summarize_tool_with_llm
    ]

    llm_with_tools = llm.bind_tools(tools)
    
    # Invoke the LLM with the current conversation state
    ai_message = llm_with_tools.invoke(state["messages"])
    
    return {"messages": [ai_message]}


# --- Graph Definition ---

# In-memory checkpointing
memory = MemorySaver()

def DocumentSearchAgent() -> Any:
    """Compiles and returns the LangGraph agent for document search."""
    
    # Instantiate the LLM that will be used throughout the graph
    llm = ChatOpenAI(model_name='gpt-4o', temperature=0, streaming=True)

    # Create partial functions for the nodes that need the LLM
    agent_node_with_llm = partial(agent_node, llm=llm)

    # Define the graph
    graph = StateGraph(RagState)

    # Add nodes
    graph.add_node("agent", agent_node_with_llm)
    
    # The ToolNode needs the original tools, not the partials, 
    # as the LLM call will reference the original tool names.
    # The partials are used inside the agent_node when binding.
    # Let's correct this. The ToolNode should get the partials.
    
    expand_tool_with_llm = partial(expand_query_tool, llm=llm)
    route_tool_with_llm = partial(route_query_tool, llm=llm)
    summarize_tool_with_llm = partial(summarize_tool, llm=llm)
    
    tools = [
        RAG_search_tool,
        expand_tool_with_llm,
        route_tool_with_llm,
        handle_follow_up_tool,
        summarize_tool_with_llm
    ]
    
    graph.add_node("tools", ToolNode(tools))

    # Add edges
    graph.add_edge("agent", END) # This should be conditional
    # Let's fix the graph logic
    
    # Correct Graph Definition
    graph = StateGraph(RagState)
    graph.add_node("agent", agent_node_with_llm)
    graph.add_node("tools", ToolNode(tools))
    
    graph.set_entry_point("agent")
    graph.add_conditional_edges(
        "agent",
        tools_condition,
    )
    graph.add_edge("tools", "agent")

    return graph.compile(checkpointer=memory)


def generate_config(session_id: str) -> RunnableConfig:
    """Generates a config for the agent run."""
    return RunnableConfig(
        recursion_limit=50, # Increased recursion limit for potentially complex chains
        configurable={"thread_id": session_id},
    )

# Final, corrected code to be written
final_code = """
# DocumentSearchAgent.py

from typing import Any
from functools import partial
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig

from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

from .RagState import RagState
from .retriever_tool import RAG_search_tool
from .agent_logic import (
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
"""

# I will use the final_code variable to write the file.
# I had to correct my own logic mid-thought. The partials need to be handled carefully
# so the LLM knows the correct tool name. Setting __name__ is a good way.
# The graph logic was also initially wrong. The final version is a standard tool-calling loop.

print(default_api.write_file(
    file_path="C:\\Users\\jhwoo\\Desktop\\SKN_ws\\project\\SKN13-FINAL-1TEAM\\FinalProject\\backend\\DocumentSearchAgent.py",
    content=final_code
))
