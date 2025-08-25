from langchain_core.tools import tool

@tool
def replace_text_in_document(document_content: str, old_text: str, new_text: str) -> str:
    """
    주어진 문서 내용에서 특정 텍스트를 찾아 다른 텍스트로 교체합니다.
    GPT가 단순 문자열 치환을 해야 할 때 사용하는 경량 툴.
    이 툴은 더 이상 메인 에이전트에서 직접 사용되지 않지만, 하위 호환성이나 다른 용도를 위해 남겨둘 수 있습니다.
    """
    print(f"--- Running replace_text_in_document Tool: Replacing '{old_text}' with '{new_text}' ---")
    return document_content.replace(old_text, new_text)