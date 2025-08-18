# RoutingAgent.py

from typing import Literal
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage
from langgraph.graph import StateGraph, END
from langchain_core.runnables import RunnableConfig

# Import the comprehensive state and the sub-agents
from .DocumentSearchAgentTools.RagState import RagState
from .chat_agent import agent as GeneralChatAgent
from .DocumentSearchAgent import DocumentSearchAgent

load_dotenv()

# --- Router Logic ---

def route_question(state: RagState) -> Literal["document_search", "general_chat"]:
    """
    Classifies the user's question to decide which agent should handle it, considering conversation history.
    """
    print("---ROUTING QUESTION---")
    
    # Pass the entire message history to the LLM for better context
    messages = state["messages"]
    
    llm = ChatOpenAI(model_name='gpt-4o', temperature=0)
    
    # Modified system_prompt to include history and better routing instructions
    system_prompt = f"""You are an expert at routing a user's question to the correct specialized agent.
You must consider the entire conversation history to make an accurate routing decision.

There are two available agents:
1.  **DocumentSearchAgent**: Use this agent for questions that require searching through specific internal documents, such as financial reports, audit results, internal regulations, or other official company materials. This includes follow-up questions related to previous document searches (e.g., asking for a download link after a document was found).
2.  **GeneralChatAgent**: Use this for all other questions, including general conversation, greetings, or questions about topics not contained in the internal documents.

Based on the conversation history and the user's latest question, which agent should be used?

Respond with ONLY 'DocumentSearchAgent' or 'GeneralChatAgent'.
"""

    # Invoke LLM with the system prompt and the entire message history
    response = llm.invoke([SystemMessage(content=system_prompt)] + messages)
    decision = response.content.strip()
    
    print(f"Routing decision: {decision}")

    if "DocumentSearchAgent" in decision:
        return "document_search"
    else:
        return "general_chat"

# --- Graph Definition ---

def RoutingAgent():
    """
    Compiles the master routing agent that directs traffic to sub-agents.
    """
    # Instantiate the sub-agents that this router will call
    general_agent = GeneralChatAgent()
    document_search_agent = DocumentSearchAgent()

    # Define the master graph
    workflow = StateGraph(RagState)

    # Add the sub-graphs as nodes
    workflow.add_node("document_search", document_search_agent)
    workflow.add_node("general_chat", general_agent)

    # The entry point is the router function
    workflow.set_conditional_entry_point(
        route_question,
        {
            "document_search": "document_search",
            "general_chat": "general_chat",
        }
    )

    # Add edges from the sub-agents to the end
    workflow.add_edge("document_search", END)
    workflow.add_edge("general_chat", END)

    # Compile the master agent
    return workflow.compile()

def generate_config(session_id: str) -> RunnableConfig:
    """
    Generates a config for the agent run.
    """
    return RunnableConfig(
        recursion_limit=20,
        configurable={"thread_id": session_id},
    )
