"""
HTML editing strategy - advanced HTML document editing with TipTap compatibility
"""

import logging
import re
from typing import List
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from bs4 import BeautifulSoup

from .base_strategy import BaseEditorStrategy

logger = logging.getLogger(__name__)


class HtmlEditingStrategy(BaseEditorStrategy):
    """Strategy for advanced HTML document editing with TipTap compatibility"""
    
    def get_strategy_name(self) -> str:
        return "HtmlEditingStrategy"
    
    def get_tools(self) -> List:
        return [
            edit_html_document,
            run_document_edit,
            insert_content_at_position
        ]


def _edit_html_document_impl(document_content: str, instruction: str) -> str:
    """
    HTML 문서 편집의 실제 구현 함수.
    @tool 래퍼 없이 직접 호출할 수 있도록 분리됨.
    """
    try:
        logger.info(f"HTML 문서 편집 시작 - 지시사항: {instruction[:100]}...")
        
        # Initialize soup
        soup = _initialize_soup(document_content)
        
        # Process based on instruction type
        instruction_lower = instruction.lower()
        
        # Route to appropriate handler
        if _is_heading_instruction(instruction):
            soup = _handle_heading(soup, instruction)
        elif _is_text_content_instruction(instruction):
            soup = _handle_text_content(soup, instruction)
        elif _is_styling_instruction(instruction):
            soup = _handle_styling(soup, instruction)
        elif _is_list_instruction(instruction):
            soup = _handle_list(soup, instruction)
        elif _is_table_instruction(instruction):
            soup = _handle_table(soup, instruction)
        elif _is_blockquote_instruction(instruction):
            soup = _handle_blockquote(soup, instruction)
        elif _is_alignment_instruction(instruction):
            soup = _handle_alignment(soup, instruction)
        elif _is_color_instruction(instruction):
            soup = _handle_color(soup, instruction)
        elif _is_completion_instruction(instruction):
            soup = _handle_completion(soup, instruction)
        else:
            soup = _handle_general_content(soup, instruction)
        
        # Clean and return result
        result = _clean_html_result(str(soup))
        logger.info(f"HTML 문서 편집 완료 - 결과 길이: {len(result)}자")
        return result
        
    except Exception as e:
        logger.error(f"HTML 문서 편집 중 오류 발생: {str(e)}")
        error_message = f"<p style='color: red;'>편집 중 오류가 발생했습니다: {str(e)}</p>"
        return f"{document_content}\n{error_message}"


@tool
def edit_html_document(document_content: str, instruction: str) -> str:
    """
    주어진 HTML 문서 내용과 편집 지시를 바탕으로 HTML 문서를 수정합니다.
    TipTap 에디터와 완전히 호환되는 HTML 편집을 수행합니다.
    지원 기능: 헤딩, 텍스트 스타일링, 리스트, 테이블, 블록쿼트, 텍스트 추가/수정 등
    """
    return _edit_html_document_impl(document_content, instruction)


@tool 
def run_document_edit(user_command: str, document_content: str) -> str:
    """
    사용자의 편집 요청에 따라 문서를 수정하는 메인 툴.
    대화 맥락을 고려하여 지능적인 편집을 수행합니다.
    """
    logger.info(f"문서 편집 도구 실행 - 명령: {user_command[:100]}...")
    
    try:
        # Call the actual implementation function directly, not the @tool wrapper
        return _edit_html_document_impl(document_content, user_command)
    except Exception as e:
        logger.error(f"문서 편집 실행 오류: {str(e)}")
        return document_content


@tool
def insert_content_at_position(
    document_content: str,
    content: str,
    position: str = "end",
    target_element: str = ""  # 이 인자는 텍스트 모드에서 사용되지 않음
) -> str:
    """
    문서의 특정 위치에 내용을 삽입합니다. (텍스트 문서용)
    position: start, end
    """
    logger.info("--- EXECUTING NEWLINE-SAFE INSERTION LOGIC ---")
    logger.info(f"텍스트 내용 삽입: 위치='{position}', 내용='{content[:30]}...'")
    
    # BeautifulSoup을 사용하지 않고 직접 문자열을 조작하여 줄바꿈을 보존합니다.
    if position == "start":
        return content + document_content
    elif position == "end":
        return document_content + content
    
    # 'before'와 'after'는 일반 텍스트에서 모호할 수 있으므로 현재는 start/end만 지원합니다.
    # 추후 기능 확장이 필요할 경우, re.sub 등을 사용하여 구현할 수 있습니다.
    logger.warning(f"지원되지 않는 삽입 위치 '{position}'입니다. 기본값(end)으로 처리합니다.")
    return document_content + content


# === Helper Functions ===

def _initialize_soup(document_content: str) -> BeautifulSoup:
    """Initialize BeautifulSoup with proper handling of empty content"""
    if not document_content.strip() or document_content.strip() == '<p></p>':
        return BeautifulSoup('<p></p>', 'html.parser')
    return BeautifulSoup(document_content, 'html.parser')


def _extract_quoted_text(text: str, default: str = "") -> str:
    """Extract text from quotes or context"""
    quote_patterns = [
        r"'([^']*)'",  # Single quotes
        r'"([^"]*)"',  # Double quotes  
        r"「([^」]*)」", # Japanese quotes
        r"『([^』]*)』"  # Korean quotes
    ]
    
    for pattern in quote_patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1)
    
    # Try extracting after keywords
    keywords = ["추가", "작성", "입력", "넣어", "써"]
    for keyword in keywords:
        if keyword in text:
            parts = text.split(keyword, 1)
            if len(parts) > 1:
                content = parts[1].strip()
                content = re.sub(r'^(해줘|줘|주세요|하세요|.\s*)', '', content)
                if content:
                    return content
    
    return default


def _is_heading_instruction(instruction: str) -> bool:
    """Check if instruction is about headings"""
    return any(keyword in instruction for keyword in ["제목", "헤딩", "heading"]) or \
           re.search(r"h[123]", instruction.lower())


def _is_text_content_instruction(instruction: str) -> bool:
    """Check if instruction is about text content"""
    return any(keyword in instruction for keyword in ["문단", "내용", "텍스트", "글", "추가", "작성", "입력", "써줘", "넣어"])


def _is_styling_instruction(instruction: str) -> bool:
    """Check if instruction is about text styling"""
    return any(keyword in instruction for keyword in ["굵게", "bold", "이탤릭", "italic", "기울임", "밑줄", "underline", "취소선", "strikethrough"])


def _is_list_instruction(instruction: str) -> bool:
    """Check if instruction is about lists"""
    return any(keyword in instruction for keyword in ["리스트", "목록", "list", "항목"])


def _is_table_instruction(instruction: str) -> bool:
    """Check if instruction is about tables"""
    return any(keyword in instruction for keyword in ["테이블", "table", "표"])


def _is_blockquote_instruction(instruction: str) -> bool:
    """Check if instruction is about blockquotes"""
    return any(keyword in instruction for keyword in ["들여쓰기", "인용", "blockquote", "인용문"])


def _is_alignment_instruction(instruction: str) -> bool:
    """Check if instruction is about alignment"""
    return "정렬" in instruction or "align" in instruction.lower()


def _is_color_instruction(instruction: str) -> bool:
    """Check if instruction is about colors or highlighting"""
    return "색상" in instruction or "color" in instruction.lower() or "하이라이트" in instruction or "highlight" in instruction.lower()


def _is_completion_instruction(instruction: str) -> bool:
    """Check if instruction is about completing placeholders"""
    return any(word in instruction for word in ["완성", "채워", "빈", "placeholder", "작성하세요"])


def _handle_heading(soup: BeautifulSoup, instruction: str) -> BeautifulSoup:
    """Handle heading creation/modification"""
    level = "h2"  # default
    if "h1" in instruction.lower() or "1단계" in instruction or "큰 제목" in instruction:
        level = "h1"
    elif "h3" in instruction.lower() or "3단계" in instruction or "작은 제목" in instruction:
        level = "h3"
    
    title_text = _extract_quoted_text(instruction, "새로운 제목")
    
    existing_heading = soup.find(level)
    if existing_heading and "수정" in instruction:
        existing_heading.string = title_text
    else:
        new_heading = soup.new_tag(level)
        new_heading.string = title_text
        
        # Insert at appropriate position
        first_element = soup.find(['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'table', 'blockquote'])
        if first_element:
            first_element.insert_before(new_heading)
        else:
            soup.append(new_heading)
    
    return soup


def _handle_text_content(soup: BeautifulSoup, instruction: str) -> BeautifulSoup:
    """Handle text content addition"""
    content_to_add = _extract_quoted_text(instruction)
    
    if not content_to_add or content_to_add == instruction:
        content_to_add = _generate_contextual_content(soup, instruction)
    
    # Handle multiple paragraphs
    paragraphs = content_to_add.split('\n\n') if '\n\n' in content_to_add else [content_to_add]
    
    for para_content in paragraphs:
        if para_content.strip():
            new_p = soup.new_tag("p")
            new_p.string = para_content.strip()
            soup.append(new_p)
    
    return soup


def _handle_styling(soup: BeautifulSoup, instruction: str) -> BeautifulSoup:
    """Handle text styling (bold, italic, underline, etc.)"""
    target_text = _extract_quoted_text(instruction)
    if not target_text:
        return soup
    
    content = str(soup)
    
    if "굵게" in instruction or "bold" in instruction.lower():
        content = content.replace(target_text, f"<strong>{target_text}</strong>")
    elif "이탤릭" in instruction or "italic" in instruction.lower() or "기울임" in instruction:
        content = content.replace(target_text, f"<em>{target_text}</em>")
    elif "밑줄" in instruction or "underline" in instruction.lower():
        content = content.replace(target_text, f"<u>{target_text}</u>")
    elif "취소선" in instruction or "strikethrough" in instruction.lower():
        content = content.replace(target_text, f"<s>{target_text}</s>")
    
    return BeautifulSoup(content, 'html.parser')


def _handle_list(soup: BeautifulSoup, instruction: str) -> BeautifulSoup:
    """Handle list creation"""
    list_type = "ul"  # default
    if any(keyword in instruction for keyword in ["번호", "숫자", "순서", "ol"]):
        list_type = "ol"
    
    list_tag = soup.new_tag(list_type)
    
    items_text = _extract_quoted_text(instruction)
    if items_text:
        items = [item.strip() for item in re.split(r'[,\n]', items_text) if item.strip()]
    else:
        items = ["항목 1", "항목 2", "항목 3"]
    
    for item in items:
        li_tag = soup.new_tag("li")
        li_tag.string = item
        list_tag.append(li_tag)
    
    soup.append(list_tag)
    return soup


def _handle_table(soup: BeautifulSoup, instruction: str) -> BeautifulSoup:
    """Handle table creation"""
    rows, cols = 2, 2  # defaults
    
    row_match = re.search(r"(\d+)[x×](\d+)", instruction)
    if row_match:
        rows = int(row_match.group(1))
        cols = int(row_match.group(2))
    
    table = soup.new_tag("table", style="border-collapse:collapse;border:1px solid #ddd;width:100%;margin:16px 0")
    
    has_header = "헤더" in instruction or "제목" in instruction or not ("헤더 없" in instruction)
    
    if has_header:
        thead = soup.new_tag("thead")
        tr_head = soup.new_tag("tr")
        for i in range(cols):
            th = soup.new_tag("th", style="border:1px solid #ddd;padding:8px;background-color:#f5f5f5")
            th.string = f"제목 {i+1}"
            tr_head.append(th)
        thead.append(tr_head)
        table.append(thead)
        rows -= 1
    
    tbody = soup.new_tag("tbody")
    for i in range(rows):
        tr = soup.new_tag("tr")
        for j in range(cols):
            td = soup.new_tag("td", style="border:1px solid #ddd;padding:8px")
            td.string = f"데이터 {i+1}-{j+1}"
            tr.append(td)
        tbody.append(tr)
    table.append(tbody)
    
    soup.append(table)
    return soup


def _handle_blockquote(soup: BeautifulSoup, instruction: str) -> BeautifulSoup:
    """Handle blockquote creation"""
    quote_text = _extract_quoted_text(instruction, "인용문 내용입니다.")
    
    blockquote = soup.new_tag("blockquote")
    p = soup.new_tag("p")
    p.string = quote_text
    blockquote.append(p)
    soup.append(blockquote)
    return soup


def _handle_alignment(soup: BeautifulSoup, instruction: str) -> BeautifulSoup:
    """Handle text alignment"""
    alignment = "left"  # default
    if any(keyword in instruction for keyword in ["가운데", "center", "중앙"]):
        alignment = "center"
    elif any(keyword in instruction for keyword in ["오른쪽", "right"]):
        alignment = "right"
    
    all_elements = soup.find_all(['p', 'h1', 'h2', 'h3', 'div'])
    if all_elements:
        last_element = all_elements[-1]
        current_style = last_element.get('style', '')
        new_style = f"{current_style}; text-align:{alignment}".strip('; ')
        last_element['style'] = new_style
    
    return soup


def _handle_color(soup: BeautifulSoup, instruction: str) -> BeautifulSoup:
    """Handle color and highlighting"""
    target_text = _extract_quoted_text(instruction)
    if not target_text:
        return soup
    
    content = str(soup)
    
    if "하이라이트" in instruction or "highlight" in instruction.lower():
        color = "yellow"  # default
        color_map = {"노란": "yellow", "빨간": "red", "파란": "blue", "초록": "green"}
        for korean, english in color_map.items():
            if korean in instruction:
                color = english
                break
        content = content.replace(target_text, f'<span style="background-color:{color};padding:2px 4px">{target_text}</span>')
    
    elif "색상" in instruction or "color" in instruction.lower():
        color_map = {
            "빨간": "red", "빨강": "red", "red": "red",
            "파란": "blue", "파랑": "blue", "blue": "blue",
            "초록": "green", "녹색": "green", "green": "green",
            "노란": "yellow", "노랑": "yellow", "yellow": "yellow",
        }
        
        color = None
        for korean, english in color_map.items():
            if korean in instruction:
                color = english
                break
        
        if color:
            content = content.replace(target_text, f'<span style="color:{color}">{target_text}</span>')
    
    return BeautifulSoup(content, 'html.parser')


def _handle_completion(soup: BeautifulSoup, instruction: str) -> BeautifulSoup:
    """Handle placeholder completion with AI"""
    existing_html = str(soup)
    existing_text = soup.get_text()
    
    placeholder_pattern = r'\[이 부분에 ([^]]+) 내용을 작성하세요\]'
    matches = re.findall(placeholder_pattern, existing_text)
    
    if matches:
        try:
            llm = ChatOpenAI(model_name='gpt-4o', temperature=0.3)
            
            for placeholder_topic in matches:
                content_prompt = f"""
문서 전체 맥락: {existing_text[:500]}...

위 문서에서 "{placeholder_topic}" 섹션에 들어갈 전문적이고 구체적인 내용을 작성해주세요.

요구사항:
1. 문서의 전체 주제와 일치하는 내용
2. 해당 섹션의 특성에 맞는 구체적이고 실질적인 정보
3. 2-3개 문단으로 구성 (각 문단은 2-4문장)
4. 전문적이고 신뢰할 수 있는 톤앤매너
5. placeholder나 메타 설명 없이 본문 내용만

직접적으로 본문 내용만 작성해주세요.
"""
                
                response = llm.invoke([{"role": "user", "content": content_prompt}])
                real_content = response.content.strip()
                
                if real_content and len(real_content) > 50:
                    placeholder_text = f"[이 부분에 {placeholder_topic} 내용을 작성하세요]"
                    existing_html = existing_html.replace(placeholder_text, real_content)
            
        except Exception as e:
            logger.error(f"AI 내용 생성 중 오류: {str(e)}")
    
    return BeautifulSoup(existing_html, 'html.parser')


def _handle_general_content(soup: BeautifulSoup, instruction: str) -> BeautifulSoup:
    """Handle general content requests with contextual generation"""
    content_to_add = _extract_quoted_text(instruction)
    
    if not content_to_add or content_to_add == instruction:
        content_to_add = _generate_contextual_content(soup, instruction)
    
    if content_to_add and len(content_to_add) > 1:
        new_p = soup.new_tag("p")
        new_p.string = content_to_add
        soup.append(new_p)
    
    return soup


def _generate_contextual_content(soup: BeautifulSoup, instruction: str) -> str:
    """Generate contextual content based on document theme and instruction"""
    existing_text = soup.get_text().lower()
    
    # Request pattern analysis
    if any(word in instruction for word in ["분석", "조사"]):
        if "kobako" in existing_text or "광고" in existing_text:
            return "심층적인 광고 분석을 통해 소비자 반응과 시장 트렌드를 파악하였습니다."
        return "체계적인 분석을 통해 핵심 인사이트를 도출하였습니다."
    
    elif any(word in instruction for word in ["결론", "요약"]):
        return "종합적인 검토를 통해 다음과 같은 결론에 도달하였습니다."
    
    elif any(word in instruction for word in ["제언", "제안", "권고"]):
        return "분석 결과를 바탕으로 다음과 같이 제언합니다."
    
    # Default content based on document theme
    if "kobako" in existing_text or "광고" in existing_text:
        return "광고 업계의 최신 동향과 소비자 인식 변화를 반영한 내용입니다."
    elif "보고서" in existing_text:
        return "상세한 조사와 분석을 통해 도출된 결과입니다."
    
    return "관련 정보를 종합하여 정리한 내용입니다."


def _clean_html_result(html: str) -> str:
    """Clean HTML result by removing unnecessary tags"""
    result = html.replace('<html><body>', '').replace('</body></html>', '')
    return result.strip()