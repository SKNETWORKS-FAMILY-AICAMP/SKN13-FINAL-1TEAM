from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.pydantic_v1 import BaseModel, Field

# --- Tool Input Schema ---
class EditInstruction(BaseModel):
    """Input schema for the edit_document tool."""
    instruction: str = Field(description="A clear, specific instruction detailing the edit to be made. For example: 'Change the h1 tag content to New Title'.")
    document_content: str = Field(description="The full HTML content of the document to be edited.")

# --- The One Tool to Rule Them All ---
@tool("edit_document", args_schema=EditInstruction, return_direct=False)
def edit_document(instruction: str, document_content: str) -> str:
    """
    Edits the given HTML document based on a specific instruction.

    This tool takes the user's instruction and the full document content,
    then calls an LLM to perform the edit and return the modified document.
    It should be the primary tool for all document modifications.
    """
    print(f"--- Running edit_document tool with instruction: '{instruction}' ---")

    # Dedicated LLM for performing the edit
    editor_llm = ChatOpenAI(model_name='gpt-4o', temperature=0)

    # Focused prompt for the editor LLM
    editor_prompt_template = ChatPromptTemplate.from_messages([
        ("system", 
         "You are a precise code editor. Your task is to modify the provided HTML document based on the given instruction. "
         "You must output only the complete, raw, and valid HTML code of the modified document. "
         "Do not add any explanations, comments, or markdown formatting like ```html ... ```. "
         "Just return the pure HTML."),
        ("human", 
         "Please apply the following instruction to the document.\n\n"
         "**Instruction:**\n{instruction}\n\n"
         "**Original Document:**\n```html\n{document}\n```")
    ])

    # Chain the prompt and LLM
    editor_chain = editor_prompt_template | editor_llm

    # Invoke the chain to get the edited document
    response = editor_chain.invoke({
        "instruction": instruction,
        "document": document_content
    })

    # Return the raw content from the LLM response
    edited_content = response.content
    print(f"--- edit_document tool finished. Returning updated content. ---")
    return edited_content