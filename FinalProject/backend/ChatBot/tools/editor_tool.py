# enhanced_editor_tool.py - 기존 editor_tool.py 확장

from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from ..prompts.DocumentEditorSystemPrompt import EDITOR_SYSTEM_PROMPT
from typing import List, Optional, Dict, Any
from bs4 import BeautifulSoup
import re

# === 기존 도구들 (유지) ===

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
    Tiptap 에디터 지원 기능: 헤딩(h1-h3), 텍스트 스타일(bold, italic, underline, strikethrough), 
    색상/하이라이트, 정렬, 리스트(ul/ol), 들여쓰기(blockquote), 테이블
    """
    print(f"--- Running edit_html_document Tool with instruction: '{instruction}' ---")
    soup = BeautifulSoup(document_content, 'html.parser')

    # 기존 로직 + Tiptap 기능 확장
    if "제목" in instruction or "헤딩" in instruction or "heading" in instruction.lower():
        # 헤딩 처리 로직 확장
        if "h1" in instruction.lower() or "1단계" in instruction:
            level = "h1"
        elif "h2" in instruction.lower() or "2단계" in instruction:
            level = "h2"
        elif "h3" in instruction.lower() or "3단계" in instruction:
            level = "h3"
        else:
            level = "h1"  # 기본값
            
        new_title = instruction.split("'")[1] if "'" in instruction else "새로운 제목"
        target_tag = soup.find(level)
        if target_tag:
            target_tag.string = new_title
        else:
            new_tag = soup.new_tag(level)
            new_tag.string = new_title
            if soup.body:
                soup.body.insert(0, new_tag)
            else:
                soup.append(new_tag)
                
    elif "굵게" in instruction or "bold" in instruction.lower():
        text_match = re.search(r"'(.*?)'", instruction)
        if text_match:
            target_text = text_match.group(1)
            # 텍스트를 찾아서 <strong> 태그로 감싸기
            for element in soup.find_all(text=True):
                if target_text in element:
                    element.replace_with(element.replace(target_text, f"<strong>{target_text}</strong>"))
                    
    elif "이탤릭" in instruction or "italic" in instruction.lower():
        text_match = re.search(r"'(.*?)'", instruction)
        if text_match:
            target_text = text_match.group(1)
            for element in soup.find_all(text=True):
                if target_text in element:
                    element.replace_with(element.replace(target_text, f"<em>{target_text}</em>"))
                    
    elif "밑줄" in instruction or "underline" in instruction.lower():
        text_match = re.search(r"'(.*?)'", instruction)
        if text_match:
            target_text = text_match.group(1)
            for element in soup.find_all(text=True):
                if target_text in element:
                    element.replace_with(element.replace(target_text, f"<u>{target_text}</u>"))
                    
    elif "취소선" in instruction or "strikethrough" in instruction.lower():
        text_match = re.search(r"'(.*?)'", instruction)
        if text_match:
            target_text = text_match.group(1)
            for element in soup.find_all(text=True):
                if target_text in element:
                    element.replace_with(element.replace(target_text, f"<s>{target_text}</s>"))
                    
    elif "색상" in instruction or "color" in instruction.lower():
        color_match = re.search(r"(빨간|파란|초록|노란|검은|흰|red|blue|green|yellow|black|white)", instruction)
        text_match = re.search(r"'(.*?)'", instruction)
        if color_match and text_match:
            color_map = {"빨간": "red", "파란": "blue", "초록": "green", "노란": "yellow", 
                        "검은": "black", "흰": "white"}
            color = color_map.get(color_match.group(1), color_match.group(1))
            target_text = text_match.group(1)
            for element in soup.find_all(text=True):
                if target_text in element:
                    element.replace_with(element.replace(target_text, f'<span style="color:{color}">{target_text}</span>'))
                    
    elif "하이라이트" in instruction or "highlight" in instruction.lower():
        color_match = re.search(r"(노란|빨간|파란|초록|yellow|red|blue|green)", instruction)
        text_match = re.search(r"'(.*?)'", instruction)
        if text_match:
            target_text = text_match.group(1)
            color = color_match.group(1) if color_match else "yellow"
            color_map = {"노란": "yellow", "빨간": "red", "파란": "blue", "초록": "green"}
            bg_color = color_map.get(color, color)
            for element in soup.find_all(text=True):
                if target_text in element:
                    element.replace_with(element.replace(target_text, f'<span style="background-color:{bg_color}">{target_text}</span>'))
                    
    elif "리스트" in instruction or "목록" in instruction or "list" in instruction.lower():
        if "번호" in instruction or "ol" in instruction.lower():
            list_tag = soup.new_tag("ol")
        else:
            list_tag = soup.new_tag("ul")
            
        # 간단한 예시 아이템 추가
        for i in range(3):
            li_tag = soup.new_tag("li")
            li_tag.string = f"항목 {i+1}"
            list_tag.append(li_tag)
            
        if soup.body:
            soup.body.append(list_tag)
        else:
            soup.append(list_tag)
            
    elif "테이블" in instruction or "table" in instruction.lower():
        # 기본 2x2 테이블 생성
        table = soup.new_tag("table", style="border-collapse:collapse;border:1px solid #ccc;width:100%")
        
        # 헤더
        thead = soup.new_tag("thead")
        tr_head = soup.new_tag("tr")
        for header in ["항목", "내용"]:
            th = soup.new_tag("th", style="border:1px solid #ccc;padding:8px;background-color:#f5f5f5")
            th.string = header
            tr_head.append(th)
        thead.append(tr_head)
        table.append(thead)
        
        # 본문
        tbody = soup.new_tag("tbody")
        for i in range(2):
            tr = soup.new_tag("tr")
            for j in range(2):
                td = soup.new_tag("td", style="border:1px solid #ccc;padding:8px")
                td.string = f"데이터 {i+1}-{j+1}"
                tr.append(td)
            tbody.append(tr)
        table.append(tbody)
        
        if soup.body:
            soup.body.append(table)
        else:
            soup.append(table)
            
    elif "들여쓰기" in instruction or "인용" in instruction or "blockquote" in instruction.lower():
        text_match = re.search(r"'(.*?)'", instruction)
        if text_match:
            target_text = text_match.group(1)
            blockquote = soup.new_tag("blockquote")
            p = soup.new_tag("p")
            p.string = target_text
            blockquote.append(p)
            if soup.body:
                soup.body.append(blockquote)
            else:
                soup.append(blockquote)
                
    elif "문단 추가" in instruction or "추가해줘" in instruction:
        text_match = re.search(r"'(.*?)'", instruction)
        if text_match:
            text_to_add = text_match.group(1)
        else:
            text_to_add = "새로운 내용이 추가되었습니다."

        new_p = soup.new_tag("p")
        new_p.string = text_to_add
        if soup.body:
            soup.body.append(new_p)
        else:
            soup.append(new_p)
            
    elif "정렬" in instruction or "align" in instruction.lower():
        if "가운데" in instruction or "center" in instruction.lower():
            alignment = "center"
        elif "오른쪽" in instruction or "right" in instruction.lower():
            alignment = "right"
        else:
            alignment = "left"
            
        # 마지막으로 추가된 요소에 정렬 적용
        if soup.body and soup.body.contents:
            last_element = None
            for element in reversed(soup.body.contents):
                if hasattr(element, 'name') and element.name:
                    last_element = element
                    break
            if last_element:
                current_style = last_element.get('style', '')
                new_style = f"{current_style}; text-align:{alignment}" if current_style else f"text-align:{alignment}"
                last_element['style'] = new_style

    return str(soup)

@tool
def run_document_edit(user_command: str, document_content: str) -> str:
    """
    사용자의 편집 요청에 따라 문서를 수정하는 메인 툴.
    GPT가 이 툴을 호출하여 편집 전략을 세우고 문서를 반환합니다.
    Tiptap 에디터의 모든 기능을 지원합니다.
    """
    print("--- Running Document Editor Tool (Tiptap Enhanced) ---")

    llm_client = ChatOpenAI(model_name='gpt-4o', temperature=0)
    llm_with_internal_tools = llm_client.bind_tools([replace_text_in_document, edit_html_document])

    user_prompt_content = f"""
    **현재 HTML 문서 내용:**
    {document_content}

    **사용자 편집 요청:**
    {user_command}

    **Tiptap 에디터 지원 기능들:**
    - 헤딩: <h1>, <h2>, <h3>
    - 텍스트 스타일: <strong>(굵게), <em>(이탤릭), <u>(밑줄), <s>(취소선)
    - 색상: style="color:색상명" 
    - 하이라이트: style="background-color:색상명"
    - 정렬: style="text-align:left/center/right"
    - 리스트: <ul>/<ol> + <li>
    - 들여쓰기: <blockquote>
    - 테이블: <table>/<thead>/<tbody>/<tr>/<th>/<td>

    당신은 Tiptap 에디터용 HTML 문서를 편집하는 전문가입니다. 
    사용자의 편집 요청을 분석하여 적절한 도구를 선택하고 HTML 문서를 수정해야 합니다.
    
    - 복잡한 구조 변경이나 새로운 요소 추가: `edit_html_document` 툴 사용
    - 단순 텍스트 치환: `replace_text_in_document` 툴 사용
    
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
            if tool_call["name"] == "edit_html_document":
                return edit_html_document(
                    document_content=document_content,
                    instruction=tool_call["args"]["instruction"]
                )
            elif tool_call["name"] == "replace_text_in_document":
                return replace_text_in_document(
                    document_content=document_content,
                    old_text=tool_call["args"]["old_text"],
                    new_text=tool_call["args"]["new_text"]
                )
    
    # Tool Call이 아니면 GPT의 직접 응답 (수정된 HTML)을 반환
    return response.content

# === 새로운 Tiptap 전용 도구들 ===

@tool
def create_document_structure(
    title: str,
    sections: List[Dict[str, Any]]
) -> str:
    """
    새로운 문서의 기본 구조를 생성합니다.
    
    Args:
        title (str): 문서 제목
        sections (List[Dict]): 섹션 정보 리스트
            - heading_level (int): 헤딩 레벨 (1-3)
            - heading_text (str): 헤딩 텍스트
            - content (str, optional): 섹션 내용
    
    Returns:
        str: Tiptap 에디터용 HTML 구조
    """
    html_content = f"<h1>{title}</h1>\n\n"
    
    for section in sections:
        level = section.get("heading_level", 2)
        heading = section.get("heading_text", "")
        content = section.get("content", "")
        
        # 헤딩 추가
        html_content += f"<h{level}>{heading}</h{level}>\n"
        
        # 내용이 있으면 추가
        if content:
            html_content += f"<p>{content}</p>\n"
        
        html_content += "\n"
    
    return html_content

@tool
def add_formatted_text(
    text: str,
    bold: bool = False,
    italic: bool = False,
    underline: bool = False,
    strikethrough: bool = False,
    color: Optional[str] = None,
    highlight: Optional[str] = None,
    font_size: Optional[str] = None,
    alignment: Optional[str] = None
) -> str:
    """
    텍스트에 다양한 스타일을 적용합니다.
    
    Args:
        text (str): 스타일을 적용할 텍스트
        bold (bool): 굵게 적용 여부
        italic (bool): 이탤릭 적용 여부
        underline (bool): 밑줄 적용 여부
        strikethrough (bool): 취소선 적용 여부
        color (str, optional): 글자 색상 (예: "red", "#FF0000")
        highlight (str, optional): 하이라이트 색상 (예: "yellow", "#FFFF00")
        font_size (str, optional): 글자 크기 (예: "18px", "24px")
        alignment (str, optional): 정렬 ("left", "center", "right")
    
    Returns:
        str: 스타일이 적용된 HTML
    """
    styled_text = text
    
    # 텍스트 스타일 적용
    if bold:
        styled_text = f"<strong>{styled_text}</strong>"
    if italic:
        styled_text = f"<em>{styled_text}</em>"
    if underline:
        styled_text = f"<u>{styled_text}</u>"
    if strikethrough:
        styled_text = f"<s>{styled_text}</s>"
    
    # 인라인 스타일 구성
    styles = []
    if color:
        styles.append(f"color:{color}")
    if highlight:
        styles.append(f"background-color:{highlight}")
    if font_size:
        styles.append(f"font-size:{font_size}")
    if alignment:
        styles.append(f"text-align:{alignment}")
    
    # 스타일이 있으면 span으로 감싸기
    if styles:
        style_attr = "; ".join(styles)
        styled_text = f'<span style="{style_attr}">{styled_text}</span>'
    
    # 정렬이 있으면 p 태그로 감싸기
    if alignment and not any(tag in styled_text for tag in ['<h1>', '<h2>', '<h3>']):
        styled_text = f'<p style="text-align:{alignment}">{styled_text}</p>'
    
    return styled_text

@tool
def create_list(
    items: List[str],
    list_type: str = "ul",
    nested_items: Optional[Dict[int, List[str]]] = None
) -> str:
    """
    번호 매기기 또는 글머리 기호 리스트를 생성합니다.
    
    Args:
        items (List[str]): 리스트 항목들
        list_type (str): "ul" (글머리 기호) 또는 "ol" (번호 매기기)
        nested_items (Dict[int, List[str]], optional): 중첩 리스트 {부모인덱스: [하위항목들]}
    
    Returns:
        str: HTML 리스트
    """
    tag = "ul" if list_type == "ul" else "ol"
    html_content = f"<{tag}>\n"
    
    for i, item in enumerate(items):
        html_content += f"  <li>{item}"
        
        # 중첩 항목이 있으면 추가
        if nested_items and i in nested_items:
            nested_tag = tag  # 같은 타입으로 중첩
            html_content += f"\n    <{nested_tag}>\n"
            for nested_item in nested_items[i]:
                html_content += f"      <li>{nested_item}</li>\n"
            html_content += f"    </{nested_tag}>\n  "
        
        html_content += "</li>\n"
    
    html_content += f"</{tag}>"
    return html_content

@tool
def create_table(
    headers: List[str],
    rows: List[List[str]],
    table_style: Optional[str] = None
) -> str:
    """
    테이블을 생성합니다.
    
    Args:
        headers (List[str]): 테이블 헤더
        rows (List[List[str]]): 테이블 행 데이터
        table_style (str, optional): 테이블 스타일 (예: "border-collapse:collapse;border:1px solid black")
    
    Returns:
        str: HTML 테이블
    """
    style_attr = f' style="{table_style}"' if table_style else ""
    html_content = f"<table{style_attr}>\n"
    
    # 헤더 생성
    if headers:
        html_content += "  <thead>\n    <tr>\n"
        for header in headers:
            html_content += f"      <th>{header}</th>\n"
        html_content += "    </tr>\n  </thead>\n"
    
    # 본문 생성
    html_content += "  <tbody>\n"
    for row in rows:
        html_content += "    <tr>\n"
        for cell in row:
            html_content += f"      <td>{cell}</td>\n"
        html_content += "    </tr>\n"
    html_content += "  </tbody>\n"
    
    html_content += "</table>"
    return html_content

@tool
def add_blockquote(
    text: str,
    indent_level: int = 1
) -> str:
    """
    인용문이나 들여쓰기된 텍스트를 생성합니다.
    
    Args:
        text (str): 인용할 텍스트
        indent_level (int): 들여쓰기 레벨 (기본값: 1)
    
    Returns:
        str: 들여쓰기가 적용된 HTML
    """
    content = text
    
    # 중첩된 blockquote 적용
    for _ in range(indent_level):
        content = f"<blockquote>{content}</blockquote>"
    
    return content

@tool
def create_business_report_template(
    report_title: str,
    author: str,
    date: str,
    sections: Optional[List[str]] = None
) -> str:
    """
    사내 보고서 템플릿을 생성합니다.
    
    Args:
        report_title (str): 보고서 제목
        author (str): 작성자
        date (str): 작성 날짜
        sections (List[str], optional): 포함할 섹션들
    
    Returns:
        str: 보고서 템플릿 HTML
    """
    default_sections = ["개요", "현황 분석", "문제점 및 개선방안", "결론"]
    sections = sections or default_sections
    
    html_content = f"""<h1 style="text-align:center">{report_title}</h1>

<p style="text-align:right"><strong>작성자:</strong> {author}</p>
<p style="text-align:right"><strong>작성일:</strong> {date}</p>

<hr>

"""
    
    for section in sections:
        html_content += f"<h2>{section}</h2>\n<p>[이 부분에 {section} 내용을 작성하세요]</p>\n\n"
    
    return html_content

@tool
def create_meeting_minutes_template(
    meeting_title: str,
    date: str,
    attendees: List[str],
    agenda_items: Optional[List[str]] = None
) -> str:
    """
    회의록 템플릿을 생성합니다.
    
    Args:
        meeting_title (str): 회의 제목
        date (str): 회의 날짜
        attendees (List[str]): 참석자 목록
        agenda_items (List[str], optional): 안건 목록
    
    Returns:
        str: 회의록 템플릿 HTML
    """
    html_content = f"""<h1>{meeting_title}</h1>

<h3>회의 정보</h3>
<p><strong>일시:</strong> {date}</p>
<p><strong>참석자:</strong> {", ".join(attendees)}</p>

<h3>안건</h3>
"""
    
    if agenda_items:
        html_content += "<ol>\n"
        for item in agenda_items:
            html_content += f"  <li>{item}</li>\n"
        html_content += "</ol>\n\n"
    else:
        html_content += "<p>[안건 내용을 입력하세요]</p>\n\n"
    
    html_content += """<h3>논의 내용</h3>
<p>[논의 내용을 입력하세요]</p>

<h3>결정 사항</h3>
<ul>
  <li>[결정사항 1]</li>
  <li>[결정사항 2]</li>
</ul>

<h3>액션 아이템</h3>
<table style="border-collapse:collapse;border:1px solid #ccc;width:100%">
  <thead>
    <tr style="background-color:#f5f5f5">
      <th style="border:1px solid #ccc;padding:8px">담당자</th>
      <th style="border:1px solid #ccc;padding:8px">할일</th>
      <th style="border:1px solid #ccc;padding:8px">기한</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid #ccc;padding:8px">[담당자명]</td>
      <td style="border:1px solid #ccc;padding:8px">[할일 내용]</td>
      <td style="border:1px solid #ccc;padding:8px">[완료기한]</td>
    </tr>
  </tbody>
</table>
"""
    
    return html_content

@tool
def insert_content_at_position(
    document: str,
    content: str,
    position: str,
    target: str
) -> str:
    """
    문서의 특정 위치에 내용을 삽입합니다.
    
    Args:
        document (str): 원본 문서 HTML
        content (str): 삽입할 내용
        position (str): 위치 ("before", "after", "inside")
        target (str): 대상 요소나 텍스트
    
    Returns:
        str: 수정된 문서 HTML
    """
    if position == "before":
        return document.replace(target, f"{content}\n{target}")
    elif position == "after":
        return document.replace(target, f"{target}\n{content}")
    elif position == "inside":
        # 태그 내부에 삽입 (예: <h2>제목</h2> -> <h2>제목 추가내용</h2>)
        pattern = f"(<{target}[^>]*>)(.*?)(</{target}>)"
        def replacer(match):
            return f"{match.group(1)}{match.group(2)} {content}{match.group(3)}"
        return re.sub(pattern, replacer, document, flags=re.DOTALL)
    
    return document

@tool
def format_text_block(
    text: str,
    format_type: str,
    **kwargs
) -> str:
    """
    텍스트 블록에 특정 포맷을 적용합니다.
    
    Args:
        text (str): 포맷을 적용할 텍스트
        format_type (str): 포맷 유형 ("heading", "paragraph", "quote", "highlight")
        **kwargs: 추가 스타일 옵션
    
    Returns:
        str: 포맷이 적용된 HTML
    """
    if format_type == "heading":
        level = kwargs.get("level", 2)
        alignment = kwargs.get("alignment")
        style = f' style="text-align:{alignment}"' if alignment else ""
        return f"<h{level}{style}>{text}</h{level}>"
    
    elif format_type == "paragraph":
        alignment = kwargs.get("alignment")
        style = f' style="text-align:{alignment}"' if alignment else ""
        return f"<p{style}>{text}</p>"
    
    elif format_type == "quote":
        return f"<blockquote><p>{text}</p></blockquote>"
    
    elif format_type == "highlight":
        color = kwargs.get("color", "yellow")
        return f'<span style="background-color:{color}">{text}</span>'
    
    return f"<p>{text}</p>"

@tool
def apply_document_styling(
    document: str,
    element_selector: str,
    styles: Dict[str, str]
) -> str:
    """
    문서의 특정 요소에 스타일을 적용합니다.
    
    Args:
        document (str): 원본 문서 HTML
        element_selector (str): 대상 HTML 태그 (예: "h1", "p", "table")
        styles (Dict[str, str]): 적용할 스타일 {"속성": "값"}
    
    Returns:
        str: 스타일이 적용된 문서 HTML
    """
    style_string = "; ".join([f"{prop}:{value}" for prop, value in styles.items()])
    
    # 기존 스타일이 있는지 확인하고 추가/수정
    pattern = f"<{element_selector}([^>]*)>"
    
    def add_style(match):
        existing_attrs = match.group(1)
        if 'style=' in existing_attrs:
            # 기존 스타일에 추가
            style_pattern = r'style="([^"]*)"'
            def update_style(style_match):
                existing_style = style_match.group(1)
                new_style = f"{existing_style}; {style_string}" if existing_style else style_string
                return f'style="{new_style}"'
            return f"<{element_selector}" + re.sub(style_pattern, update_style, existing_attrs) + ">"
        else:
            # 새로운 스타일 추가
            return f'<{element_selector}{existing_attrs} style="{style_string}">'
    
    return re.sub(pattern, add_style, document)

@tool
def generate_document_from_outline(
    title: str,
    outline: List[Dict[str, Any]],
    document_type: str = "report"
) -> str:
    """
    개요를 바탕으로 완전한 문서를 생성합니다.
    
    Args:
        title (str): 문서 제목
        outline (List[Dict]): 문서 개요
            - heading (str): 섹션 제목
            - level (int): 헤딩 레벨 (1-3)
            - content (str): 섹션 내용
            - subsections (List[Dict], optional): 하위 섹션
        document_type (str): 문서 유형 ("report", "meeting", "general")
    
    Returns:
        str: 완성된 문서 HTML
    """
    html_content = ""
    
    # 문서 유형별 헤더
    if document_type == "report":
        html_content += f'<h1 style="text-align:center">{title}</h1>\n\n'
    elif document_type == "meeting":
        html_content += f"<h1>{title}</h1>\n\n"
    else:
        html_content += f"<h1>{title}</h1>\n\n"
    
    def process_sections(sections, base_level=2):
        content = ""
        for section in sections:
            heading = section.get("heading", "")
            level = min(section.get("level", base_level), 3)  # 최대 h3까지
            text_content = section.get("content", "")
            subsections = section.get("subsections", [])
            
            # 헤딩 추가
            content += f"<h{level}>{heading}</h{level}>\n"
            
            # 내용 추가
            if text_content:
                # 여러 문단으로 나누어진 내용 처리
                paragraphs = text_content.split('\n\n')
                for para in paragraphs:
                    if para.strip():
                        content += f"<p>{para.strip()}</p>\n"
            
            # 하위 섹션 처리
            if subsections:
                content += process_sections(subsections, level + 1)
            
            content += "\n"
        
        return content
    
    html_content += process_sections(outline)
    
    return html_content

@tool
def enhance_document_readability(
    document: str,
    enhancements: List[str]
) -> str:
    """
    문서의 가독성을 향상시킵니다.
    
    Args:
        document (str): 원본 문서 HTML
        enhancements (List[str]): 적용할 개선사항
            - "add_spacing": 섹션 간 간격 추가
            - "style_headers": 헤더 스타일링
            - "format_tables": 테이블 스타일링
            - "highlight_important": 중요한 부분 하이라이트
    
    Returns:
        str: 개선된 문서 HTML
    """
    enhanced_doc = document
    
    for enhancement in enhancements:
        if enhancement == "add_spacing":
            # h2, h3 태그 전에 여백 추가
            enhanced_doc = re.sub(r"<h([23])", r'<h\1 style="margin-top:24px"', enhanced_doc)
        
        elif enhancement == "style_headers":
            # 헤더에 기본 스타일 적용
            enhanced_doc = re.sub(
                r"<h1([^>]*)>", 
                r'<h1\1 style="font-size:28px;font-weight:bold;margin-bottom:16px">', 
                enhanced_doc
            )
            enhanced_doc = re.sub(
                r"<h2([^>]*)>", 
                r'<h2\1 style="font-size:22px;font-weight:bold;margin-bottom:12px;color:#333">', 
                enhanced_doc
            )
        
        elif enhancement == "format_tables":
            # 테이블에 기본 스타일 적용
            enhanced_doc = re.sub(
                r"<table([^>]*)>",
                r'<table\1 style="border-collapse:collapse;border:1px solid #ddd;width:100%;margin:16px 0">',
                enhanced_doc
            )
            enhanced_doc = re.sub(
                r"<th([^>]*)>",
                r'<th\1 style="border:1px solid #ddd;padding:8px;background-color:#f5f5f5;font-weight:bold">',
                enhanced_doc
            )
            enhanced_doc = re.sub(
                r"<td([^>]*)>",
                r'<td\1 style="border:1px solid #ddd;padding:8px">',
                enhanced_doc
            )
        
        elif enhancement == "highlight_important":
            # "중요", "주의", "핵심" 등의 단어가 있는 문장 하이라이트
            important_keywords = ["중요", "주의", "핵심", "필수", "반드시"]
            for keyword in important_keywords:
                pattern = f"([^>]*{keyword}[^<]*)"
                enhanced_doc = re.sub(
                    pattern,
                    r'<strong style="background-color:#fff3cd;padding:2px 4px">\1</strong>',
                    enhanced_doc
                )
    
    return enhanced_doc

# Helper function for prompt construction
def create_final_prompt(user_command: str, document_content: str) -> str:
    """
    Constructs a final, clean prompt for the LLM by combining the document content
    and the user's command.
    """
    return f"""
DOCUMENT CONTENT:
---
{document_content}
---

Based on the document content above, please fulfill the original request: "{user_command}"
    """

# 모든 도구들을 포함한 리스트 (DocumentEditAgent에서 사용)
ALL_EDITOR_TOOLS = [
    run_document_edit,  # 메인 편집 도구 (기존)
    replace_text_in_document,  # 기존 도구
    create_document_structure,  # 문서 구조 생성
    create_business_report_template,  # 보고서 템플릿
    create_meeting_minutes_template,  # 회의록 템플릿
    add_formatted_text,  # 텍스트 스타일링
    create_list,  # 리스트 생성
    create_table,  # 테이블 생성
    add_blockquote,  # 인용문/들여쓰기
    format_text_block,  # 텍스트 블록 포맷팅
    apply_document_styling,  # 스타일 적용
    enhance_document_readability,  # 가독성 향상
]