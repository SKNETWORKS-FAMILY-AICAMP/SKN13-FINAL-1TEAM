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
    print("--- Calling DocumentEditAgent (Final Version) ---")

    current_messages = state["messages"]
    document_content = state.get("document_content")

    system_prompt_content = (
        "You are a helpful document editor assistant. "
        "You will be given the full content of a document and a user request. "
        "Fulfill the user's request to the best of your ability. "
        "Use the available tools if necessary to perform edits."
    )

    # If document content is present, create a clean, single prompt for this turn
    if document_content:
        print("--- Document content found, creating clean prompt. ---")
        last_user_message_content = ""
        for msg in reversed(current_messages):
            if isinstance(msg, HumanMessage):
                last_user_message_content = msg.content
                break
        
        # Combine context into a single, clear prompt
        prompt_with_context = f"""
DOCUMENT CONTENT:
---
{document_content}
---

USER REQUEST: "{last_user_message_content}"

Please fulfill the request based on the document content provided.
        """
        # Use a clean message list for the LLM call to avoid loops
        messages_for_llm = [
            SystemMessage(content=system_prompt_content),
            HumanMessage(content=prompt_with_context)
        ]
    else:
        # No document content, just respond that it's needed.
        print("--- No document content, responding to user. ---")
        # This path should ideally not be taken if the frontend works correctly.
        messages_for_llm = current_messages
        if not any(isinstance(msg, SystemMessage) for msg in messages_for_llm):
            messages_for_llm = [
                SystemMessage(content="You are a document editor. If the user asks for an edit but does not provide the document, inform them you need the document content."),
                *messages_for_llm
            ]

    response = llm_with_tools.invoke(messages_for_llm)
    
    # The graph will append this response to the state's messages list
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
