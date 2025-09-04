# ✅ LangGraph Agent (Streaming-fixed)

from typing import TypedDict, Annotated
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from ..core.AgentState import AgentState

from ..prompts.system_prompt import get_system_prompt

load_dotenv()



# --- Graph Nodes ---

def prompt_node(state: AgentState) -> AgentState:
    """Injects the system prompt at the beginning of the conversation."""
    system_msg = SystemMessage(content=get_system_prompt())
    # Check if system message already exists
    if not any(isinstance(msg, SystemMessage) for msg in state["messages"]):
        return {"messages": [system_msg] + state["messages"]}
    return state

async def chatbot(state: AgentState) -> dict:
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
    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("prompt", prompt_node)
    graph.add_node("chatbot", chatbot)

    # Add edges
    graph.add_edge(START, "prompt")
    graph.add_edge("prompt", "chatbot")
    graph.add_edge("chatbot",END)

    return graph.compile(checkpointer=memory)

def generate_config(session_id: str) -> RunnableConfig:
    """Generates a config for the agent run."""
    return RunnableConfig(
        recursion_limit=20,
        configurable={"thread_id": session_id},
    )