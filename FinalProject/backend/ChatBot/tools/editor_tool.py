# enhanced_editor_tool.py - 기존 editor_tool.py 확장

from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from ..prompts.DocumentEditorSystemPrompt import EDITOR_SYSTEM_PROMPT
from typing import List, Optional, Dict, Any
from bs4 import BeautifulSoup
import re
import logging
# === 기존 도구들 (유지) ===
logger = logging.getLogger(__name__)

@tool
def replace_text_in_document(document_content: str, old_text: str, new_text: str) -> str:
    """
    주어진 문서 내용에서 특정 텍스트를 찾아 다른 텍스트로 교체합니다.
    GPT가 단순 문자열 치환을 해야 할 때 사용하는 경량 툴.
    """
    logger.debug(f"[EDITOR_TOOL] replace_text_in_document 실행 - 교체 전: '{old_text[:50]}...', 교체 후: '{new_text[:50]}...'")
    print(f"--- Running replace_text_in_document Tool: Replacing '{old_text}' with '{new_text}' ---")
    return document_content.replace(old_text, new_text)

@tool
def edit_html_document(document_content: str, instruction: str) -> str:
    """
    주어진 HTML 문서 내용과 편집 지시를 바탕으로 HTML 문서를 수정합니다.
    TipTap 에디터와 완전히 호환되는 HTML 편집을 수행합니다.
    지원 기능: 헤딩, 텍스트 스타일링, 리스트, 테이블, 블록쿼트, 텍스트 추가/수정 등
    """
    try:
        logger.info(f"[EDITOR_TOOL] HTML 문서 편집 시작 - 지시사항: {instruction[:100]}...")
        logger.debug(f"[EDITOR_TOOL] 입력 문서 길이: {len(document_content)} 문자")

        # HTML 문서가 비어있거나 매우 간단한 경우 기본 구조 생성
        if not document_content.strip() or document_content.strip() == '<p></p>':
            logger.debug("[EDITOR_TOOL] 빈 문서 감지, 기본 구조 생성")
            soup = BeautifulSoup('<p></p>', 'html.parser')
        else:
            soup = BeautifulSoup(document_content, 'html.parser')
            logger.debug(f"[EDITOR_TOOL] HTML 파싱 완료 - 요소 수: {len(soup.find_all())}")

        # 텍스트에서 따옴표나 특정 패턴으로 내용 추출
        def extract_quoted_text(text, default=""):
            # 따옴표로 감싸진 텍스트 찾기
            quote_patterns = [
                r"'([^']*)'",  # 작은따옴표
                r'"([^"]*)"',  # 큰따옴표
                r"「([^」]*)」", # 일본식 따옴표
                r"『([^』]*)』"  # 한국식 따옴표
            ]
            
            for pattern in quote_patterns:
                match = re.search(pattern, text)
                if match:
                    return match.group(1)
            
            # 따옴표가 없으면 키워드 다음의 내용 추출 시도
            keywords = ["추가", "작성", "입력", "넣어", "써"]
            for keyword in keywords:
                if keyword in text:
                    parts = text.split(keyword, 1)
                    if len(parts) > 1:
                        content = parts[1].strip()
                        # 불필요한 조사나 어미 제거
                        content = re.sub(r'^(해줘|줘|주세요|하세요|.\s*)', '', content)
                        if content:
                            return content
            
            return default

        # 더 포괄적인 패턴 매칭 및 처리
        instruction_lower = instruction.lower()
        
        # 1. 제목/헤딩 관련
        if any(keyword in instruction for keyword in ["제목", "헤딩", "heading"]) or re.search(r"h[123]", instruction_lower):
            level = "h2"  # 기본값
            if "h1" in instruction_lower or "1단계" in instruction or "큰 제목" in instruction:
                level = "h1"
            elif "h2" in instruction_lower or "2단계" in instruction or "중간 제목" in instruction:
                level = "h2"
            elif "h3" in instruction_lower or "3단계" in instruction or "작은 제목" in instruction:
                level = "h3"
            
            title_text = extract_quoted_text(instruction, "새로운 제목")
            
            # 기존 같은 레벨의 제목이 있으면 수정, 없으면 추가
            existing_heading = soup.find(level)
            if existing_heading and "수정" in instruction:
                existing_heading.string = title_text
            else:
                new_heading = soup.new_tag(level)
                new_heading.string = title_text
                
                # 문서 구조에 따라 적절한 위치에 삽입
                if soup.find('p') or soup.find(['h1', 'h2', 'h3']):
                    # 기존 내용이 있으면 맨 앞에 추가
                    first_element = soup.find(['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'table', 'blockquote'])
                    if first_element:
                        first_element.insert_before(new_heading)
                    else:
                        soup.append(new_heading)
                else:
                    soup.append(new_heading)
        
        # 2. 문단/텍스트 추가 (가장 일반적인 요청) - 맥락 기반 개선
        elif any(keyword in instruction for keyword in ["문단", "내용", "텍스트", "글", "추가", "작성", "입력", "써줘", "넣어"]):
            content_to_add = extract_quoted_text(instruction)
            
            # 인용된 텍스트가 없으면 문서 주제를 파악해서 관련 내용 생성
            if not content_to_add or content_to_add == instruction:
                # 문서에서 주제 추출
                existing_text = soup.get_text().lower()
                
                if "kobako" in existing_text or "광고" in existing_text:
                    content_to_add = """KoBaKo(한국방송광고진흥공사)는 매년 우수한 광고 작품을 선정하여 시상하고 있습니다. 

선정 기준에는 창의성, 소비자 반응, 사회적 영향력, 제작 기술력 등이 포함됩니다. 

최근 트렌드를 보면 디지털 플랫폼을 활용한 인터랙티브 광고와 사회적 메시지를 담은 광고들이 높은 평가를 받고 있습니다."""

                elif "보고서" in existing_text or "report" in existing_text:
                    content_to_add = """본 보고서는 체계적인 분석을 통해 작성되었습니다.

    주요 조사 방법론으로는 문헌 조사, 전문가 인터뷰, 데이터 분석 등이 활용되었습니다.

    분석 결과를 바탕으로 실무진을 위한 구체적인 제언사항을 포함하고 있습니다."""
                
                elif "프로젝트" in existing_text or "project" in existing_text:
                    content_to_add = """프로젝트 추진 배경과 목적을 명확히 정의하였습니다.

    단계별 실행 계획과 주요 마일스톤을 설정하였으며, 각 단계별 예상 소요 기간과 필요 자원을 산정하였습니다.

    리스크 관리 방안과 품질 관리 체계도 포함되어 있습니다."""
                
                else:
                    # 기본 내용
                    content_to_add = "관련 내용을 체계적으로 정리하고 분석한 결과를 제시합니다."
            
            # 여러 문단으로 나눠진 경우 처리
            paragraphs = content_to_add.split('\n\n') if '\n\n' in content_to_add else [content_to_add]
            
            for para_content in paragraphs:
                if para_content.strip():
                    new_p = soup.new_tag("p")
                    new_p.string = para_content.strip()
                    soup.append(new_p)
        
        # 3. 텍스트 스타일링
        elif "굵게" in instruction or "bold" in instruction_lower:
            target_text = extract_quoted_text(instruction)
            if target_text:
                content = str(soup)
                # 텍스트를 찾아서 <strong> 태그로 감싸기
                content = content.replace(target_text, f"<strong>{target_text}</strong>")
                soup = BeautifulSoup(content, 'html.parser')
        
        elif "이탤릭" in instruction or "italic" in instruction_lower or "기울임" in instruction:
            target_text = extract_quoted_text(instruction)
            if target_text:
                content = str(soup)
                content = content.replace(target_text, f"<em>{target_text}</em>")
                soup = BeautifulSoup(content, 'html.parser')
        
        elif "밑줄" in instruction or "underline" in instruction_lower:
            target_text = extract_quoted_text(instruction)
            if target_text:
                content = str(soup)
                content = content.replace(target_text, f"<u>{target_text}</u>")
                soup = BeautifulSoup(content, 'html.parser')
        
        elif "취소선" in instruction or "strikethrough" in instruction_lower:
            target_text = extract_quoted_text(instruction)
            if target_text:
                content = str(soup)
                content = content.replace(target_text, f"<s>{target_text}</s>")
                soup = BeautifulSoup(content, 'html.parser')
        
        # 4. 리스트/목록
        elif any(keyword in instruction for keyword in ["리스트", "목록", "list", "항목"]):
            list_type = "ul"  # 기본값
            if any(keyword in instruction for keyword in ["번호", "숫자", "순서", "ol"]):
                list_type = "ol"
            
            list_tag = soup.new_tag(list_type)
            
            # 사용자가 항목을 제공했는지 확인
            items_text = extract_quoted_text(instruction)
            if items_text:
                # 줄바꿈이나 쉼표로 구분된 항목들 처리
                items = [item.strip() for item in re.split(r'[,\n]', items_text) if item.strip()]
            else:
                # 기본 예시 항목
                items = ["항목 1", "항목 2", "항목 3"]
            
            for item in items:
                li_tag = soup.new_tag("li")
                li_tag.string = item
                list_tag.append(li_tag)
            
            soup.append(list_tag)
        
        # 5. 테이블
        elif "테이블" in instruction or "table" in instruction_lower or "표" in instruction:
            # 행과 열 수 파악 (기본값: 2x2)
            rows = 2
            cols = 2
            
            row_match = re.search(r"(\d+)[x×](\d+)", instruction)
            if row_match:
                rows = int(row_match.group(1))
                cols = int(row_match.group(2))
            
            table = soup.new_tag("table", style="border-collapse:collapse;border:1px solid #ddd;width:100%;margin:16px 0")
            
            # 헤더가 필요한지 확인
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
                rows -= 1  # 헤더가 있으면 데이터 행 수 조정
            
            # 본문
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
        
        # 6. 들여쓰기/인용문
        elif any(keyword in instruction for keyword in ["들여쓰기", "인용", "blockquote", "인용문"]):
            quote_text = extract_quoted_text(instruction, "인용문 내용입니다.")
            
            blockquote = soup.new_tag("blockquote")
            p = soup.new_tag("p")
            p.string = quote_text
            blockquote.append(p)
            soup.append(blockquote)
        
        # 7. 정렬
        elif "정렬" in instruction or "align" in instruction_lower:
            alignment = "left"  # 기본값
            if any(keyword in instruction for keyword in ["가운데", "center", "중앙"]):
                alignment = "center"
            elif any(keyword in instruction for keyword in ["오른쪽", "right"]):
                alignment = "right"
            
            # 마지막 요소에 정렬 적용
            all_elements = soup.find_all(['p', 'h1', 'h2', 'h3', 'div'])
            if all_elements:
                last_element = all_elements[-1]
                current_style = last_element.get('style', '')
                new_style = f"{current_style}; text-align:{alignment}".strip('; ')
                last_element['style'] = new_style
        
        # 8. 색상/하이라이트
        elif "색상" in instruction or "color" in instruction_lower:
            color_map = {
                "빨간": "red", "빨강": "red", "red": "red",
                "파란": "blue", "파랑": "blue", "blue": "blue", 
                "초록": "green", "녹색": "green", "green": "green",
                "노란": "yellow", "노랑": "yellow", "yellow": "yellow",
                "검은": "black", "검정": "black", "black": "black",
                "흰": "white", "하얀": "white", "white": "white"
            }
            
            target_text = extract_quoted_text(instruction)
            color = None
            for korean, english in color_map.items():
                if korean in instruction:
                    color = english
                    break
            
            if target_text and color:
                content = str(soup)
                content = content.replace(target_text, f'<span style="color:{color}">{target_text}</span>')
                soup = BeautifulSoup(content, 'html.parser')
        
        elif "하이라이트" in instruction or "highlight" in instruction_lower:
            target_text = extract_quoted_text(instruction)
            color = "yellow"  # 기본 하이라이트 색상
            
            color_map = {"노란": "yellow", "빨간": "red", "파란": "blue", "초록": "green"}
            for korean, english in color_map.items():
                if korean in instruction:
                    color = english
                    break
            
            if target_text:
                content = str(soup)
                content = content.replace(target_text, f'<span style="background-color:{color};padding:2px 4px">{target_text}</span>')
                soup = BeautifulSoup(content, 'html.parser')
        
        # 9. 빈 부분 채우기 및 완성 요청 처리
        elif any(word in instruction for word in ["완성", "채워", "빈", "placeholder", "작성하세요"]):
            # 문서에서 placeholder 텍스트들을 찾아서 AI로 실제 내용 생성
            existing_html = str(soup)
            existing_text = soup.get_text()
            
            # placeholder 패턴 찾기
            placeholders = []
            
            # [이 부분에 ... 내용을 작성하세요] 패턴
            import re
            placeholder_pattern = r'\[이 부분에 ([^]]+) 내용을 작성하세요\]'
            matches = re.findall(placeholder_pattern, existing_text)
            
            if matches:
                from langchain_openai import ChatOpenAI
                try:
                    llm = ChatOpenAI(model_name='gpt-4o', temperature=0.3)
                    
                    for placeholder_topic in matches:
                        # 각 placeholder에 대해 AI가 실제 내용 생성
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
                            # placeholder를 실제 내용으로 교체
                            placeholder_text = f"[이 부분에 {placeholder_topic} 내용을 작성하세요]"
                            existing_html = existing_html.replace(placeholder_text, real_content)
                        
                except Exception as e:
                    logger.error(f"AI 내용 생성 중 오류: {str(e)}")
            
            # 수정된 HTML로 soup 재생성
            soup = BeautifulSoup(existing_html, 'html.parser')
        
        # 10. 기타 일반적인 요청들 - 맥락 기반 처리
        else:
            content_to_add = extract_quoted_text(instruction)
            
            # 구체적인 내용이 없으면 문서 주제를 파악해서 관련 내용 생성
            if not content_to_add or content_to_add == instruction:
                existing_text = soup.get_text().lower()
                
                # 요청 패턴 분석
                if any(word in instruction for word in ["분석", "조사"]):
                    if "kobako" in existing_text or "광고" in existing_text:
                        content_to_add = "심층적인 광고 분석을 통해 소비자 반응과 시장 트렌드를 파악하였습니다."
                    else:
                        content_to_add = "체계적인 분석을 통해 핵심 인사이트를 도출하였습니다."
                
                elif any(word in instruction for word in ["결론", "요약"]):
                    content_to_add = "종합적인 검토를 통해 다음과 같은 결론에 도달하였습니다."
                
                elif any(word in instruction for word in ["제언", "제안", "권고"]):
                    content_to_add = "분석 결과를 바탕으로 다음과 같이 제언합니다."
                
                else:
                    # 기본 처리: 문서 주제에 맞는 일반적인 내용
                    if "kobako" in existing_text or "광고" in existing_text:
                        content_to_add = "광고 업계의 최신 동향과 소비자 인식 변화를 반영한 내용입니다."
                    elif "보고서" in existing_text:
                        content_to_add = "상세한 조사와 분석을 통해 도출된 결과입니다."
                    else:
                        content_to_add = "관련 정보를 종합하여 정리한 내용입니다."
            
            if content_to_add and len(content_to_add) > 1:
                new_p = soup.new_tag("p")
                new_p.string = content_to_add
                soup.append(new_p)

            # 결과 반환 전 정리
            result = str(soup)
            
            # 불필요한 HTML 태그 정리
            result = result.replace('<html><body>', '').replace('</body></html>', '')
            result = result.strip()
            
            logger.info(f"[EDITOR_TOOL] HTML 문서 편집 완료 - 결과 길이: {len(result)}자")
            logger.debug(f"[EDITOR_TOOL] 편집 결과 미리보기: {result[:200]}...")
            return result
        
    except Exception as e:
        logger.error(f"[EDITOR_TOOL] HTML 문서 편집 중 오류 발생: {str(e)}", exc_info=True)
        logger.debug(f"[EDITOR_TOOL] 오류 발생 시 원본 문서 반환 - 길이: {len(document_content)}")
        # 오류 발생 시 원본 문서 반환하면서 오류 메시지 추가
        error_message = f"<p style='color: red;'>편집 중 오류가 발생했습니다: {str(e)}</p>"
        return f"{document_content}\n{error_message}"

@tool
def run_document_edit(user_command: str, document_content: str) -> str:
    """
    사용자의 편집 요청에 따라 문서를 수정하는 메인 툴.
    대화 맥락을 고려하여 지능적인 편집을 수행합니다.
    Tiptap 에디터의 모든 기능을 지원합니다.
    """
    logger.info(f"문서 편집 도구 실행 - 명령: {user_command[:100]}...")

    llm_client = ChatOpenAI(model_name='gpt-4o', temperature=0)
    llm_with_internal_tools = llm_client.bind_tools([replace_text_in_document, edit_html_document])

    user_prompt_content = f"""
    **현재 HTML 문서 내용:**
    {document_content}

    **사용자 편집 요청:**
    {user_command}

    **중요한 편집 지침:**
    1. **맥락 기반 내용 생성**: 사용자가 "내용 작성해줘", "추가해줘" 등의 요청을 할 때는:
       - 현재 문서의 주제와 맥락을 파악하세요
       - 단순히 "새로운 내용이 추가되었습니다" 같은 placeholder 텍스트가 아닌
       - 문서 주제에 맞는 구체적이고 실질적인 내용을 생성하세요
       
    2. **문서 주제 파악**: 
       - 문서 제목이나 기존 내용에서 주제를 파악하세요
       - 예: "KoBaKo 광고 보고서"라면 광고 관련 실제 내용을 작성
       - 예: "프로젝트 계획서"라면 프로젝트 관련 실제 내용을 작성

    **TipTap 에디터 지원 기능:**
    - 제목/헤딩: h1(큰제목), h2(중간제목), h3(작은제목)
    - 텍스트 스타일: 굵게(strong), 이탤릭(em), 밑줄(u), 취소선(s)
    - 목록: 글머리 기호(ul), 번호 매기기(ol)
    - 들여쓰기: 인용문(blockquote)
    - 테이블: 완전한 테이블 구조 지원
    - 문단 추가: 실질적인 텍스트 내용 추가

    **도구 선택 가이드:**
    - 새로운 실질적 내용 추가, 문서 구조 변경: `edit_html_document` 사용
    - 기존 텍스트의 단순 교체: `replace_text_in_document` 사용

    반드시 사용자의 요청에 맞는 실질적이고 구체적인 내용을 생성하세요.
    """

    try:
        response = llm_with_internal_tools.invoke([
            {"role": "system", "content": EDITOR_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt_content}
        ])

        # GPT의 응답이 Tool Call이면 Tool을 실행하고 결과를 반환
        if response.tool_calls:
            for tool_call in response.tool_calls:
                if tool_call["name"] == "edit_html_document":
                    return edit_html_document.invoke({
                        "document_content": document_content,
                        "instruction": tool_call["args"]["instruction"]
                    })
                elif tool_call["name"] == "replace_text_in_document":
                    return replace_text_in_document.invoke({
                        "document_content": document_content,
                        "old_text": tool_call["args"]["old_text"],
                        "new_text": tool_call["args"]["new_text"]
                    })
        
        # Tool Call이 아니면 GPT의 직접 응답을 처리
        content = response.content
        
        # HTML 태그가 포함된 응답인지 확인하고 HTML만 추출
        if '<' in content and '>' in content:
            html_match = re.search(r'<[^>]+>.*?</[^>]+>|<[^>]+/>', content, re.DOTALL)
            if html_match:
                return html_match.group(0)
        
        # HTML이 없으면 edit_html_document로 처리
        return edit_html_document.invoke({
            "document_content": document_content,
            "instruction": user_command
        })
    
    except Exception as e:
        logger.error(f"run_document_edit에서 오류 발생: {str(e)}")
        # 오류 발생 시 기본적인 편집 시도
        return edit_html_document.invoke({
            "document_content": document_content,
            "instruction": user_command
        })

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