# DocumentSearchAgent.py

from typing import Any
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableConfig
from langchain_core.messages import SystemMessage 

from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

from .DocumentSearchAgentTools.AgentState import AgentState
from .DocumentSearchAgentTools.retriever_tool import RAG_search_tool
from .DocumentSearchAgentTools.agent_logic import AgentTools
from .document_search_system_prompt import get_document_search_system_prompt 

load_dotenv()

# --- Main Agent Node ---

def agent_node(state: AgentState, llm_with_tools: Any) -> dict:
    """Calls the LLM with the current state and returns the AI's response."""
    messages = state["messages"]
    if not any(isinstance(msg, SystemMessage) for msg in messages):
        system_prompt_content = get_document_search_system_prompt()
        messages = [SystemMessage(content=system_prompt_content)] + messages

    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}

# --- Graph Factory ---

def DocumentSearchAgent() -> Any:
    """Compiles and returns the LangGraph agent for document search."""
    
    llm = ChatOpenAI(model_name='gpt-4o', temperature=0, streaming=True)
    
    tool_executor = AgentTools(llm=llm)

    tools = [
        RAG_search_tool,
        tool_executor.expand_query_tool,
        tool_executor.route_query_tool,
        tool_executor.handle_follow_up_tool,
        tool_executor.summarize_tool
    ]
    
    llm_with_tools = llm.bind_tools(tools)
    
    def runnable_agent_node(state: AgentState):
        return agent_node(state, llm_with_tools)

    graph = StateGraph(AgentState)
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