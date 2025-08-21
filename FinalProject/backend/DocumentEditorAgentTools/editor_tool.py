from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from backend.document_editor_system_prompt import EDITOR_SYSTEM_PROMPT

@tool
def run_document_edit(user_command: str, document_content: str) -> str:
    """
    사용자의 명령에 따라 주어진 문서의 내용을 수정합니다.
    이 툴은 문서 편집 요청이 있을 때 사용해야 합니다.
    """
    print("--- Running Document Editor Tool ---")
    
    llm_client = ChatOpenAI(model_name='gpt-4o', temperature=0)

    # Modify user_prompt to be more explicit about appending for generation tasks
    # This is a heuristic, might need more sophisticated NLP if requests vary widely
    if "작성해줘" in user_command or "만들어줘" in user_command or "생성해줘" in user_command:
        # If it's a generation request, instruct to append
        user_prompt_content = f"""
        **기존 문서 내용:**
        {document_content}

        **사용자 편집 요청:**
        사용자의 요청에 따라 새로운 내용을 생성하고, 이를 **기존 문서 내용의 마지막에 추가**하여 전체 문서를 반환하십시오.
        요청: {user_command}
        """
    else:
        # For other types of edits (modification, deletion, etc.)
        user_prompt_content = f"""
        **기존 문서 내용:**
        {document_content}

        **사용자 편집 요청:**
        {user_command}
        """

    response = llm_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": EDITOR_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt_content} # Use the modified user_prompt_content
        ],
        temperature=0.0
    )

    return response.choices[0].message.content