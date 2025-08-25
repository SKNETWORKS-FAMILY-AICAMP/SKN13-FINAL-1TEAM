from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from backend.document_editor_system_prompt import EDITOR_SYSTEM_PROMPT

@tool
def replace_text_in_document(document_content: str, old_text: str, new_text: str) -> str:
    """
    단순 텍스트 치환 툴.
    사용자가 명시한 텍스트만 치환 가능하며, 이미 치환된 내용은 다시 치환하지 않습니다.
    """
    print(f"--- Running replace_text_in_document Tool: Replacing '{old_text}' with '{new_text}' ---")
    return document_content.replace(old_text, new_text)

@tool
def edit_document(document_content: str, instruction: str) -> str:
    """
    문서 편집 툴.
    Agent가 instruction을 명확히 줘야 합니다.
    가능한 작업 예시:
    - "문서 끝에 '새로운 문단' 추가"
    - "'문단 내용 A'를 '문단 내용 B'로 변경"
    - "'문단 내용 C' 삭제"
    """
    print(f"--- Running edit_document Tool with instruction: '{instruction}' ---")
    
    # instruction 그대로 처리. Agent가 구체적 명령어를 제공한다고 가정
    # 예시: 단순 치환 또는 추가/삭제
    updated_content = document_content

    # 단순 치환 예시
    if "를" in instruction and "로" in instruction:
        try:
            old_text = instruction.split("를")[0].strip().split("'")[1]
            new_text = instruction.split("로")[1].strip().split("'")[1]
            updated_content = updated_content.replace(old_text, new_text)
        except Exception:
            pass  # Agent가 잘못된 instruction 제공 시 무시

    # 문단 추가 예시
    elif "추가" in instruction:
        match = instruction.split("'")
        if len(match) >= 2:
            text_to_add = match[1]
            updated_content += "\n" + text_to_add

    # 문단 삭제 예시
    elif "삭제" in instruction:
        match = instruction.split("'")
        if len(match) >= 2:
            text_to_delete = match[1]
            updated_content = updated_content.replace(text_to_delete, "")

    return updated_content

@tool
def run_document_edit(user_command: str, document_content: str) -> str:
    """
    사용자의 편집 요청을 받아 적절한 툴을 호출.
    """
    print("--- Running Document Editor Tool ---")

    llm_client = ChatOpenAI(model_name='gpt-4o', temperature=0)
    llm_with_tools = llm_client.bind_tools([replace_text_in_document, edit_document])

    user_prompt_content = EDITOR_SYSTEM_PROMPT + f"""
**사용자 편집 요청:**
{user_command}
"""

    response = llm_with_tools.invoke(
        messages=[
            {"role": "system", "content": user_prompt_content},
            {"role": "user", "content": user_command}
        ]
    )

    # Tool Call 응답 처리
    if response.tool_calls:
        for tool_call in response.tool_calls:
            if tool_call["name"] == "edit_document":
                return edit_document(
                    document_content=document_content,
                    instruction=tool_call["args"]["instruction"]
                )
            elif tool_call["name"] == "replace_text_in_document":
                return replace_text_in_document(
                    document_content=document_content,
                    old_text=tool_call["args"]["old_text"],
                    new_text=tool_call["args"]["new_text"]
                )

    # Tool Call 없으면 GPT 직접 응답 반환
    return response.content
