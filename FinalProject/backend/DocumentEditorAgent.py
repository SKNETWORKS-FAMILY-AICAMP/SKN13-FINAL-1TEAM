from typing import Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition

from .DocumentSearchAgentTools.AgentState import AgentState
from .DocumentEditorAgentTools.editor_tool import run_document_edit, replace_text_in_document

# Tools available to the agent
tools = [run_document_edit, replace_text_in_document]

def agent_node(state: AgentState, llm_with_tools: Any) -> dict:
    """
    The primary node for the Document Editor Agent.
    It constructs a prompt based on the current state and calls the LLM.
    """
    print("--- Calling DocumentEditAgent (Simple Mode) ---")

    messages = state["messages"]
    
    # Add a system prompt if one doesn't exist
    if not any(isinstance(msg, SystemMessage) for msg in messages):
        system_prompt_content = (
            "You are a document editor assistant. "
            "You receive an edit request from the user, and sometimes the document content itself. "
            "If the document content is provided, use it to fulfill the request. "
            "Use the available tools to perform edits."
        )
        messages = [SystemMessage(content=system_prompt_content)] + messages

    # If document_content is in the state, add it to the prompt
    document_content = state.get("document_content")
    if document_content:
        # We get the user command from the last message in the history
        last_message = messages[-1].content if messages else ""
        prompt_with_context = f"""
DOCUMENT CONTENT:
---
{document_content}
---

EDIT REQUEST:
{last_message}
        """
        # Replace the last user message with this new combined prompt
        if messages and isinstance(messages[-1], HumanMessage):
            messages[-1] = HumanMessage(content=prompt_with_context)
        else:
            messages.append(HumanMessage(content=prompt_with_context))

    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}

def DocumentEditorAgent() -> Any:
    """Compiles the Document Editor Agent graph."""
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
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

    return graph.compile()
