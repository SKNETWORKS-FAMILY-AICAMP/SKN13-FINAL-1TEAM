"""
Document structure and template strategy
"""

import logging
import re
from typing import List, Optional
from langchain_core.tools import tool
from bs4 import BeautifulSoup

from .base_strategy import BaseEditorStrategy

logger = logging.getLogger(__name__)


class StructureTemplateStrategy(BaseEditorStrategy):
    """Strategy for document structure creation and templates"""
    
    def get_strategy_name(self) -> str:
        return "StructureTemplateStrategy"
    
    def get_tools(self) -> List:
        return [
            create_document_structure,
            create_business_report_template,
            create_meeting_minutes_template,
            generate_document_from_outline
        ]


@tool
def create_document_structure(
    title: str,
    sections: List[str],
    document_type: str = "report",
    include_toc: bool = True
) -> str:
    """
    체계적인 문서 구조를 생성합니다.
    document_type: report, proposal, meeting_minutes, analysis
    """
    logger.info(f"문서 구조 생성: {title} ({document_type})")
    
    soup = BeautifulSoup('', 'html.parser')
    
    # Main title
    main_title = soup.new_tag("h1", style="text-align:center;margin-bottom:24px;color:#333")
    main_title.string = title
    soup.append(main_title)
    
    # Table of contents
    if include_toc:
        toc_title = soup.new_tag("h2", style="margin-top:32px;color:#666")
        toc_title.string = "목차"
        soup.append(toc_title)
        
        toc_list = soup.new_tag("ol", style="margin-bottom:32px")
        for i, section in enumerate(sections, 1):
            li = soup.new_tag("li", style="margin-bottom:8px")
            li.string = section
            toc_list.append(li)
        soup.append(toc_list)
        
        # Separator
        hr = soup.new_tag("hr", style="margin:32px 0;border:none;border-top:1px solid #eee")
        soup.append(hr)
    
    # Document sections
    for i, section in enumerate(sections, 1):
        section_title = soup.new_tag("h2", style="margin-top:32px;margin-bottom:16px;color:#444")
        section_title.string = f"{i}. {section}"
        soup.append(section_title)
        
        # Placeholder content
        placeholder = soup.new_tag("p", style="color:#888;font-style:italic")
        placeholder.string = f"[이 부분에 {section} 내용을 작성하세요]"
        soup.append(placeholder)
    
    return str(soup)


@tool
def create_business_report_template(
    title: str = "사업 보고서",
    company_name: str = "",
    report_date: str = "",
    include_executive_summary: bool = True
) -> str:
    """
    전문적인 사업 보고서 템플릿을 생성합니다.
    """
    logger.info(f"사업 보고서 템플릿 생성: {title}")
    
    soup = BeautifulSoup('', 'html.parser')
    
    # Header section
    header_div = soup.new_tag("div", style="text-align:center;margin-bottom:40px;padding:20px;border-bottom:2px solid #333")
    
    main_title = soup.new_tag("h1", style="margin:0 0 16px 0;color:#333;font-size:28px")
    main_title.string = title
    header_div.append(main_title)
    
    if company_name:
        company_p = soup.new_tag("p", style="margin:8px 0;font-size:18px;color:#666")
        company_p.string = company_name
        header_div.append(company_p)
    
    if report_date:
        date_p = soup.new_tag("p", style="margin:8px 0;color:#888")
        date_p.string = f"보고서 작성일: {report_date}"
        header_div.append(date_p)
    
    soup.append(header_div)
    
    # Executive Summary
    if include_executive_summary:
        exec_title = soup.new_tag("h2", style="margin-top:32px;color:#333;border-bottom:1px solid #ccc;padding-bottom:8px")
        exec_title.string = "요약"
        soup.append(exec_title)
        
        exec_content = soup.new_tag("p", style="color:#888;font-style:italic;background:#f9f9f9;padding:16px;border-left:4px solid #007acc")
        exec_content.string = "[이 부분에 보고서 요약 내용을 작성하세요]"
        soup.append(exec_content)
    
    # Standard sections
    sections = [
        "배경 및 목적",
        "현황 분석", 
        "주요 이슈",
        "해결 방안",
        "기대 효과",
        "결론 및 제언"
    ]
    
    for i, section in enumerate(sections, 1):
        section_title = soup.new_tag("h2", style="margin-top:32px;color:#333;border-bottom:1px solid #ccc;padding-bottom:8px")
        section_title.string = f"{i}. {section}"
        soup.append(section_title)
        
        placeholder = soup.new_tag("p", style="color:#888;font-style:italic;margin:16px 0")
        placeholder.string = f"[이 부분에 {section} 내용을 작성하세요]"
        soup.append(placeholder)
    
    # Appendix section
    appendix_title = soup.new_tag("h2", style="margin-top:48px;color:#333;border-bottom:1px solid #ccc;padding-bottom:8px")
    appendix_title.string = "부록"
    soup.append(appendix_title)
    
    appendix_content = soup.new_tag("p", style="color:#888;font-style:italic")
    appendix_content.string = "[이 부분에 참고 자료, 데이터, 추가 문서 등을 작성하세요]"
    soup.append(appendix_content)
    
    return str(soup)


@tool
def create_meeting_minutes_template(
    meeting_title: str = "회의록",
    meeting_date: str = "",
    attendees: List[str] = None,
    agenda_items: List[str] = None
) -> str:
    """
    회의록 템플릿을 생성합니다.
    """
    logger.info(f"회의록 템플릿 생성: {meeting_title}")
    
    if attendees is None:
        attendees = []
    if agenda_items is None:
        agenda_items = []
    
    soup = BeautifulSoup('', 'html.parser')
    
    # Title
    title = soup.new_tag("h1", style="text-align:center;margin-bottom:32px;color:#333;border-bottom:2px solid #333;padding-bottom:16px")
    title.string = meeting_title
    soup.append(title)
    
    # Meeting info table
    info_table = soup.new_tag("table", style="width:100%;margin-bottom:32px;border-collapse:collapse;border:1px solid #ddd")
    
    # Date row
    date_row = soup.new_tag("tr")
    date_label = soup.new_tag("td", style="border:1px solid #ddd;padding:12px;background:#f5f5f5;width:120px;font-weight:bold")
    date_label.string = "회의 일시"
    date_value = soup.new_tag("td", style="border:1px solid #ddd;padding:12px")
    date_value.string = meeting_date if meeting_date else "[회의 날짜 및 시간]"
    date_row.append(date_label)
    date_row.append(date_value)
    info_table.append(date_row)
    
    # Attendees row
    attendees_row = soup.new_tag("tr")
    attendees_label = soup.new_tag("td", style="border:1px solid #ddd;padding:12px;background:#f5f5f5;font-weight:bold")
    attendees_label.string = "참석자"
    attendees_value = soup.new_tag("td", style="border:1px solid #ddd;padding:12px")
    if attendees:
        attendees_value.string = ", ".join(attendees)
    else:
        attendees_value.string = "[참석자 명단]"
    attendees_row.append(attendees_label)
    attendees_row.append(attendees_value)
    info_table.append(attendees_row)
    
    soup.append(info_table)
    
    # Agenda
    agenda_title = soup.new_tag("h2", style="margin-top:32px;color:#333;border-bottom:1px solid #ccc;padding-bottom:8px")
    agenda_title.string = "회의 안건"
    soup.append(agenda_title)
    
    if agenda_items:
        agenda_list = soup.new_tag("ol")
        for item in agenda_items:
            li = soup.new_tag("li", style="margin-bottom:8px")
            li.string = item
            agenda_list.append(li)
        soup.append(agenda_list)
    else:
        agenda_placeholder = soup.new_tag("p", style="color:#888;font-style:italic")
        agenda_placeholder.string = "[이 부분에 회의 안건을 작성하세요]"
        soup.append(agenda_placeholder)
    
    # Discussion sections
    discussion_title = soup.new_tag("h2", style="margin-top:32px;color:#333;border-bottom:1px solid #ccc;padding-bottom:8px")
    discussion_title.string = "논의 사항"
    soup.append(discussion_title)
    
    for i in range(1, 4):  # 3 discussion items by default
        item_title = soup.new_tag("h3", style="margin-top:24px;color:#444")
        item_title.string = f"안건 {i}"
        soup.append(item_title)
        
        item_content = soup.new_tag("p", style="color:#888;font-style:italic")
        item_content.string = f"[이 부분에 안건 {i} 논의 내용을 작성하세요]"
        soup.append(item_content)
    
    # Action items
    action_title = soup.new_tag("h2", style="margin-top:32px;color:#333;border-bottom:1px solid #ccc;padding-bottom:8px")
    action_title.string = "결정 사항 및 액션 아이템"
    soup.append(action_title)
    
    action_table = soup.new_tag("table", style="width:100%;border-collapse:collapse;border:1px solid #ddd;margin:16px 0")
    
    # Table header
    header_row = soup.new_tag("tr")
    headers = ["액션 아이템", "담당자", "완료 기한"]
    for header in headers:
        th = soup.new_tag("th", style="border:1px solid #ddd;padding:12px;background:#f5f5f5;text-align:left")
        th.string = header
        header_row.append(th)
    action_table.append(header_row)
    
    # Sample rows
    for i in range(1, 4):
        row = soup.new_tag("tr")
        for j in range(3):
            td = soup.new_tag("td", style="border:1px solid #ddd;padding:12px")
            if j == 0:
                td.string = f"[액션 아이템 {i}]"
            elif j == 1:
                td.string = "[담당자명]"
            else:
                td.string = "[완료 기한]"
            row.append(td)
        action_table.append(row)
    
    soup.append(action_table)
    
    # Next meeting
    next_title = soup.new_tag("h2", style="margin-top:32px;color:#333;border-bottom:1px solid #ccc;padding-bottom:8px")
    next_title.string = "다음 회의"
    soup.append(next_title)
    
    next_content = soup.new_tag("p", style="color:#888;font-style:italic")
    next_content.string = "[이 부분에 다음 회의 일정을 작성하세요]"
    soup.append(next_content)
    
    return str(soup)


@tool 
def generate_document_from_outline(
    outline: str,
    document_title: str = "문서",
    include_introduction: bool = True,
    include_conclusion: bool = True
) -> str:
    """
    아웃라인을 기반으로 문서 구조를 생성합니다.
    outline 형식: "1. 섹션1\n2. 섹션2\n3. 섹션3"
    """
    logger.info(f"아웃라인 기반 문서 생성: {document_title}")
    
    soup = BeautifulSoup('', 'html.parser')
    
    # Title
    title = soup.new_tag("h1", style="text-align:center;margin-bottom:32px;color:#333")
    title.string = document_title
    soup.append(title)
    
    # Introduction
    if include_introduction:
        intro_title = soup.new_tag("h2", style="margin-top:32px;color:#333;border-bottom:1px solid #ccc;padding-bottom:8px")
        intro_title.string = "서론"
        soup.append(intro_title)
        
        intro_content = soup.new_tag("p", style="color:#888;font-style:italic")
        intro_content.string = "[이 부분에 문서의 목적과 개요를 작성하세요]"
        soup.append(intro_content)
    
    # Parse outline and create sections
    sections = _parse_outline(outline)
    
    for section_num, section_title in sections:
        # Section title
        sect_title = soup.new_tag("h2", style="margin-top:32px;color:#333;border-bottom:1px solid #ccc;padding-bottom:8px")
        sect_title.string = f"{section_num}. {section_title}"
        soup.append(sect_title)
        
        # Section content placeholder
        sect_content = soup.new_tag("p", style="color:#888;font-style:italic;margin:16px 0")
        sect_content.string = f"[이 부분에 {section_title} 내용을 작성하세요]"
        soup.append(sect_content)
    
    # Conclusion
    if include_conclusion:
        conclusion_title = soup.new_tag("h2", style="margin-top:32px;color:#333;border-bottom:1px solid #ccc;padding-bottom:8px")
        conclusion_title.string = "결론"
        soup.append(conclusion_title)
        
        conclusion_content = soup.new_tag("p", style="color:#888;font-style:italic")
        conclusion_content.string = "[이 부분에 결론 및 요약을 작성하세요]"
        soup.append(conclusion_content)
    
    return str(soup)


def _parse_outline(outline: str) -> List[tuple]:
    """Parse outline text into structured sections"""
    sections = []
    lines = outline.strip().split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Try to extract number and title
        import re
        match = re.match(r'^(\d+)\.?\s*(.+)', line)
        if match:
            num = match.group(1)
            title = match.group(2).strip()
            sections.append((num, title))
        else:
            # If no number, add with auto-numbering
            sections.append((str(len(sections) + 1), line))
    
    return sections