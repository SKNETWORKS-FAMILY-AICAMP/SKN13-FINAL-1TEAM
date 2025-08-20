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

    user_prompt = f"""
    **기존 문서 내용:**
    {document_content}

    **사용자 편집 요청:**
    {user_command}
    """

    response = llm_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": EDITOR_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.0
    )

    return response.choices[0].message.content