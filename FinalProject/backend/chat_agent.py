# ✅ LangGraph Agent (Streaming-fixed)

from typing import TypedDict, Annotated
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, BaseMessage
from langchain_core.runnables import RunnableConfig

from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

from .llm_tools.retriever import RAG_tool
from .llm_tools.naver_search import NaverSearchTool
from .llm_tools.sEOUl import get_data_seoul
from .llm_tools.edit_hwpx1 import edit_hwpx
from .llm_tools.read_hwpx import read_hwpx
from .system_prompt import get_system_prompt

load_dotenv()

# --- State Definition ---
class State(TypedDict):
    messages: Annotated[list, add_messages]

# --- Graph Nodes ---

def prompt_node(state: State) -> State:
    """Injects the system prompt at the beginning of the conversation."""
    system_msg = SystemMessage(content=get_system_prompt())
    # Check if system message already exists
    if not any(isinstance(msg, SystemMessage) for msg in state["messages"]):
        return {"messages": [system_msg] + state["messages"]}
    return state

async def chatbot(state: State) -> dict:
    """Calls the LLM with the current state and returns the AI's response."""
    llm = ChatOpenAI(model_name='gpt-4o', temperature=0, streaming=True)
    
    # naver_tool = NaverSearchTool()
    # tools = [RAG_tool, naver_tool, get_data_seoul, read_hwpx, edit_hwpx]
    tools = []
    llm_with_tools = llm.bind_tools(tools)
    # tool_choice 포함된 RunnableConfig 생성
    config = RunnableConfig(configurable={"tool_choice": "auto"})

    # Invoke the LLM to get the full AI message, which might contain tool calls
    ai_message = await llm_with_tools.ainvoke(state["messages"], config=config)
    return {"messages": [ai_message]}

# --- Graph Definition ---

# In-memory checkpointing
memory = MemorySaver()

def agent():
    """Compiles and returns the LangGraph agent."""
    graph = StateGraph(State)

    # Add nodes
    graph.add_node("prompt", prompt_node)
    graph.add_node("chatbot", chatbot)
    # graph.add_node("tools", ToolNode([RAG_tool, NaverSearchTool(), get_data_seoul, read_hwpx, edit_hwpx]))
    graph.add_node("tools",ToolNode([]))
    
    # Add edges
    graph.add_edge(START, "prompt")
    graph.add_edge("prompt", "chatbot")
    graph.add_conditional_edges("chatbot", tools_condition)
    graph.add_edge("tools", "chatbot")
    graph.add_edge("chatbot",END)

    return graph.compile(checkpointer=memory)

def generate_config(session_id: str) -> RunnableConfig:
    """Generates a config for the agent run."""
    return RunnableConfig(
        recursion_limit=20,
        configurable={"thread_id": session_id},
    )