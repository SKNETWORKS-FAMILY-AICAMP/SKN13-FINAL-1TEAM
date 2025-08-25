from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from backend.document_editor_system_prompt import get_document_editor_system_prompt
from typing import Dict, Any
from langchain_core.messages import ToolMessage

@tool
def replace_text_in_document(document_content: str, old_text: str, new_text: str) -> str:
    """
    단순 텍스트 치환 툴.
    사용자가 명시한 텍스트만 치환 가능하며, 이미 치환된 내용은 다시 치환하지 않습니다.
    """
    print(f"--- Running replace_text_in_document Tool --- Replacing '{old_text}' with '{new_text}'")
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
    print(f"--- Running edit_document Tool --- Instruction: '{instruction}'")
    updated_content = document_content

    if "를" in instruction and "로" in instruction:
        try:
            old_text = instruction.split("를")[0].strip().split("'")[1]
            new_text = instruction.split("로")[1].strip().split("'")[1]
            updated_content = updated_content.replace(old_text, new_text)
        except Exception:
            pass

    elif "추가" in instruction:
        match = instruction.split("'")
        if len(match) >= 2:
            text_to_add = match[1]
            updated_content += "\n" + text_to_add

    elif "삭제" in instruction:
        match = instruction.split("'")
        if len(match) >= 2:
            text_to_delete = match[1]
            updated_content = updated_content.replace(text_to_delete, "")

    return updated_content

@tool
async def run_document_edit_tool(user_command: str, document_content: str) -> ToolMessage:
    """
    사용자의 편집 요청을 받아 적절한 툴을 호출.
    """

    print("--- Running run_document_edit_tool ---")
    llm_client = ChatOpenAI(model_name='gpt-4o', temperature=0)
    llm_with_tools = llm_client.bind_tools([replace_text_in_document, edit_document])

    user_prompt_content = get_document_editor_system_prompt(document_content) + f"""
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
                output = edit_document(
                    document_content=document_content,
                    instruction=tool_call["args"]["instruction"]
                )
                return ToolMessage(content=output)
            elif tool_call["name"] == "replace_text_in_document":
                output = replace_text_in_document(
                    document_content=document_content,
                    old_text=tool_call["args"]["old_text"],
                    new_text=tool_call["args"]["new_text"]
                )
                return ToolMessage(content=output)

    # Tool Call 없으면 GPT 직접 응답
    return ToolMessage(content=response.content)

@tool
async def update_document_state_tool(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    ToolNode 실행 후, 도구의 출력(수정된 문서)으로 상태를 업데이트
    """
    print("--- Running update_document_state_tool ---")
    if not state.get("messages"):
        print("--- 메시지 없음 ---")
        return {}

    last_message = state["messages"][-1]
    if not isinstance(last_message, ToolMessage):
        print("--- 마지막 메시지가 ToolMessage 아님 ---")
        return {}

    updated_content = last_message.content

    if state.get("document_content") == updated_content:
        print("--- 문서 내용 동일, 업데이트 스킵 ---")
        return {}

    print(f"--- 문서 내용 업데이트 ---\n{updated_content[:200]}...")
    return {"document_content": updated_content}
