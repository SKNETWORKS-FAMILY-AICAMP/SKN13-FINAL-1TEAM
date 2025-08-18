# DocumentSearchAgent.py

from typing import Any
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig

from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

from .DocumentSearchAgentTools.RagState import RagState
from .DocumentSearchAgentTools.retriever_tool import RAG_search_tool
# Import the new class instead of the individual functions
from .DocumentSearchAgentTools.agent_logic import AgentTools

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
    
    # Instantiate the class that holds our logical tools
    tool_executor = AgentTools(llm=llm)

    # Create the list of tools from the class methods and other tools
    tools = [
        RAG_search_tool,
        tool_executor.expand_query_tool,
        tool_executor.route_query_tool,
        tool_executor.handle_follow_up_tool,
        tool_executor.summarize_tool
    ]
    
    llm_with_tools = llm.bind_tools(tools)
    
    # Define the agent node that will be run
    def runnable_agent_node(state: RagState):
        return agent_node(state, llm_with_tools)

    # Build the graph
    graph = StateGraph(RagState)
    graph.add_node("agent", runnable_agent_node)
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
