
from ..document_editor_system_prompt import EDITOR_SYSTEM_PROMPT
from ..DocumentSearchAgentTools.AgentState import AgentState

def run_document_edit(state: AgentState, llm_client) -> dict:
    """
    문서 편집 LLM 호출을 실행하는 툴 함수.
    상태(state)에서 필요한 정보를 추출하고, 결과를 상태 업데이트 사전으로 반환합니다.
    """
    print("--- Running Document Editor Tool ---")
    user_command = state.get("user_command")
    document_content = state.get("document_content")

    if not user_command or not document_content:
        # 필요한 정보가 없는 경우, 에러 또는 빈 답변을 처리할 수 있습니다.
        return {"final_answer": "문서 편집에 필요한 정보가 부족합니다."}

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

    edited_content = response.choices[0].message.content
    
    # 상태 업데이트를 위해 사전 형태로 결과를 반환합니다.
    return {"final_answer": edited_content}
