from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from backend.document_editor_system_prompt import EDITOR_SYSTEM_PROMPT
from bs4 import BeautifulSoup
import re
import requests

@tool
def replace_text_in_document(document_content: str, old_text: str, new_text: str) -> str:
    """
    주어진 문서 내용에서 특정 텍스트를 찾아 다른 텍스트로 교체합니다.
    GPT가 단순 문자열 치환을 해야 할 때 사용하는 경량 툴.
    """
    print(f"--- Running replace_text_in_document Tool: Replacing '{old_text}' with '{new_text}' ---")
    return document_content.replace(old_text, new_text)

@tool
def edit_html_document(document_content: str, instruction: str) -> str:
    """
    주어진 HTML 문서 내용과 편집 지시를 바탕으로 HTML 문서를 수정합니다.
    이 툴은 HTML 구조를 이해하고, 특정 요소의 텍스트를 변경하거나, 요소를 추가/삭제하는 등의 복잡한 편집을 수행할 수 있습니다.
    예시:
    - "제목을 '새로운 제목'으로 변경해줘"
    - "본문에 '안녕하세요'라는 문단을 추가해줘"
    - "첫 번째 이미지 태그를 삭제해줘"
    """
    print(f"--- Running edit_html_document Tool with instruction: '{instruction}' ---")
    soup = BeautifulSoup(document_content, 'html.parser')

    # instruction에 따른 HTML 수정 로직
    if "제목" in instruction:
        new_title = instruction.split("'")[1] if "'" in instruction else "새로운 제목"
        h1_tag = soup.find('h1')
        if h1_tag:
            h1_tag.string = new_title
        else:
            new_h1 = soup.new_tag("h1")
            new_h1.string = new_title
            if soup.body:
                soup.body.insert(0, new_h1)
            else:
                soup.append(new_h1)
    elif "문단 추가" in instruction or "추가해줘" in instruction:
        match = re.search(r"'(.*?)'", instruction)
        if match:
            text_to_add = match.group(1)
        else:
            text_to_add = "새로운 내용이 추가되었습니다." # 기본값

        new_p = soup.new_tag("p")
        new_p.string = text_to_add
        if soup.body:
            soup.body.append(new_p)
        else:
            soup.append(new_p)
    elif "이미지 삭제" in instruction:
        img_tag = soup.find('img')
        if img_tag:
            img_tag.decompose()

    return str(soup)

@tool
def read_document_content(document_content: str) -> str:
    """
    현재 편집 중인 문서의 전체 내용을 읽어서 반환합니다.
    GPT가 문서의 현재 상태를 파악해야 할 때 사용합니다.
    """
    print("--- Running read_document_content Tool ---")
    return document_content

@tool
def request_frontend_document_content() -> str:
    """
    프론트엔드(Electron)에서 현재 편집 중인 문서의 content를 요청하여 반환합니다.
    이 툴은 백엔드에서 프론트엔드의 최신 문서 내용을 가져와야 할 때 사용합니다.
    """
    print("--- Running request_frontend_document_content Tool ---")
    try:
        response = requests.get("http://localhost:8080/get-document-content")
        response.raise_for_status() # HTTP 오류 발생 시 예외 발생
        data = response.json()
        return data.get("content", "")
    except requests.exceptions.RequestException as e:
        print(f"Error requesting content from frontend: {e}")
        return f"Error: Could not retrieve content from frontend. {e}"

@tool
def run_document_edit(user_command: str, document_content: str) -> str:
    """
    사용자의 편집 요청에 따라 문서를 수정하는 툴.
    GPT가 이 툴을 호출하여 편집 전략을 세우고 문서를 반환합니다.
    이 툴은 HTML 문서를 수정하는 데 특화되어 있습니다.
    """
    print("--- Running Document Editor Tool (HTML Focused) ---")

    llm_client = ChatOpenAI(model_name='gpt-4o', temperature=0)

    llm_with_internal_tools = llm_client.bind_tools([replace_text_in_document, edit_html_document, read_document_content, request_frontend_document_content])

    user_prompt_content = f"""
    **현재 HTML 문서 내용:**
    {document_content}

    **사용자 편집 요청:**
    {user_command}

    당신은 HTML 문서를 편집하는 전문가입니다. 사용자의 편집 요청을 분석하여 HTML 문서를 수정해야 합니다.
    HTML 문서의 특정 부분을 수정해야 한다면 `edit_html_document` 툴을 사용하십시오.
    단순 텍스트 치환이 필요하다면 `replace_text_in_document` 툴을 사용하십시오.
    문서의 현재 내용을 확인해야 한다면 `read_document_content` 툴을 사용하십시오.
    만약 현재 가지고 있는 `document_content`가 최신이 아니라고 판단되거나, 프론트엔드에서 최신 내용을 가져와야 한다면 `request_frontend_document_content` 툴을 사용하십시오.
    최종적으로 수정된 HTML 문서 내용을 반환해야 합니다.
    """

    response = llm_with_internal_tools.invoke(
        messages=[
            {"role": "system", "content": EDITOR_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt_content}
        ]
    )

    # GPT의 응답이 Tool Call이면 Tool을 실행하고 결과를 반환
    if response.tool_calls:
        for tool_call in response.tool_calls:
            if tool_call.function.name == "edit_html_document":
                return edit_html_document(
                    document_content=document_content,
                    instruction=tool_call.function.args["instruction"]
                )
            elif tool_call.function.name == "replace_text_in_document":
                return replace_text_in_document(
                    document_content=document_content,
                    old_text=tool_call.function.args["old_text"],
                    new_text=tool_call.function.args["new_text"]
                )
            elif tool_call.function.name == "read_document_content":
                return read_document_content(
                    document_content=document_content
                )
            elif tool_call.function.name == "request_frontend_document_content":
                # 프론트엔드에서 content를 가져온 후, 그 content를 사용하여 다시 GPT에게 요청을 보내거나
                # 해당 content를 기반으로 다른 툴을 호출하도록 로직을 추가해야 합니다.
                fetched_content = request_frontend_document_content()
                # 가져온 content를 사용하여 다시 run_document_edit을 호출하여 GPT에게 재판단 요청
                return run_document_edit(user_command, fetched_content)
    
    # Tool Call이 아니면 GPT의 직접 응답 (수정된 HTML)을 반환
    return response.content