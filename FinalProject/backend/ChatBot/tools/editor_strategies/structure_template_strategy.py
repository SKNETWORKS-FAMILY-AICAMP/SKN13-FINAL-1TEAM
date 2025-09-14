"""
Document structure and template strategy
"""

import logging
import re
import boto3
import os
from typing import List, Optional, Dict, Any
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
            generate_document_from_outline,
            analyze_reference_documents,
            create_2025_document_from_references
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


# ======================== 새로운 도구들: 참조 문서 기반 2025년 문서 생성 ========================

@tool
def analyze_reference_documents(
    search_keyword: str = "미디어다양성조사 용역",
    years: List[str] = ["2021", "2022", "2023", "2024"]
) -> Dict[str, Any]:
    """
    S3에서 참조 문서들을 검색하고 분석하여 공통 구조와 패턴을 추출합니다.

    Args:
        search_keyword: 검색할 키워드 (기본값: "미디어다양성조사 용역")
        years: 분석할 연도 목록 (기본값: 2021-2024)

    Returns:
        분석된 문서 구조, 패턴, 내용 정보
    """
    try:
        # S3 클라이언트 설정
        bucket_name = os.getenv('AWS_S3_BUCKET', 'clickabbbucket')
        s3_client = boto3.client('s3', region_name=os.getenv('AWS_REGION', 'ap-northeast-2'))

        print(f"🔍 [analyze_reference_documents] 참조 문서 검색 시작: '{search_keyword}'")

        analyzed_docs = []
        common_structure = {}

        # S3에서 관련 문서들 검색
        response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix='kobaco_data/'  # 문서가 있는 S3 prefix
        )

        found_docs = []
        if 'Contents' in response:
            for obj in response['Contents']:
                key = obj['Key']
                filename = key.split('/')[-1]

                # 키워드와 연도가 모두 포함된 문서 찾기
                if any(year in filename for year in years) and search_keyword.replace(' ', '') in filename.replace(' ', ''):
                    found_docs.append({'key': key, 'filename': filename})

        print(f"📄 [analyze_reference_documents] 발견된 문서: {len(found_docs)}개")

        # 각 문서 분석
        for doc in found_docs:
            try:
                # S3에서 문서 내용 읽기
                response = s3_client.get_object(Bucket=bucket_name, Key=doc['key'])
                content = response['Body'].read().decode('utf-8')

                # 문서 구조 분석
                doc_analysis = _analyze_document_structure(content, doc['filename'])
                analyzed_docs.append(doc_analysis)

                print(f"✅ [analyze_reference_documents] 분석 완료: {doc['filename']}")

            except Exception as e:
                print(f"❌ [analyze_reference_documents] 문서 분석 실패 {doc['filename']}: {e}")
                continue

        if not analyzed_docs:
            return {
                'success': False,
                'message': '참조할 수 있는 문서를 찾을 수 없습니다.',
                'found_documents': []
            }

        # 공통 구조 추출
        common_structure = _extract_common_patterns(analyzed_docs)

        return {
            'success': True,
            'message': f'{len(analyzed_docs)}개 문서 분석 완료',
            'analyzed_documents': analyzed_docs,
            'common_structure': common_structure,
            'total_documents': len(analyzed_docs)
        }

    except Exception as e:
        print(f"❌ [analyze_reference_documents] 전체 분석 실패: {e}")
        return {
            'success': False,
            'message': f'참조 문서 분석 중 오류 발생: {str(e)}',
            'error': str(e)
        }


@tool
def create_2025_document_from_references(
    analysis_result: Dict[str, Any],
    document_title: str = "2025년 미디어다양성조사 용역"
) -> str:
    """
    분석된 참조 문서들을 바탕으로 2025년 버전 문서를 생성합니다.

    Args:
        analysis_result: analyze_reference_documents의 결과
        document_title: 생성할 문서 제목

    Returns:
        생성된 HTML 문서
    """
    try:
        print(f"📝 [create_2025_document] 2025년 문서 생성 시작: '{document_title}'")

        if not analysis_result.get('success', False):
            return "참조 문서 분석 결과가 올바르지 않습니다."

        common_structure = analysis_result.get('common_structure', {})
        analyzed_docs = analysis_result.get('analyzed_documents', [])

        if not common_structure or not analyzed_docs:
            return "분석된 문서 구조가 없습니다."

        # HTML 문서 생성 시작
        soup = BeautifulSoup('<div></div>', 'html.parser')

        # 1. 문서 제목 및 헤더
        header_div = soup.new_tag("div", style="text-align:center;margin-bottom:40px;border-bottom:2px solid #007acc;padding-bottom:20px")

        title_h1 = soup.new_tag("h1", style="color:#007acc;font-size:28px;font-weight:bold;margin:0;text-align:center")
        title_h1.string = document_title
        header_div.append(title_h1)

        # 작성일 추가 (2025년 기준)
        date_p = soup.new_tag("p", style="margin:16px 0;color:#666;font-size:14px;text-align:center")
        date_p.string = "작성일: 2025년 [작성월일을 입력하세요]"
        header_div.append(date_p)

        soup.append(header_div)

        # 2. 공통 구조를 바탕으로 섹션 생성
        sections = common_structure.get('common_sections', [])

        for i, section in enumerate(sections, 1):
            # 섹션 헤더
            section_h2 = soup.new_tag("h2", style="color:#007acc;font-size:20px;font-weight:bold;margin-top:32px;margin-bottom:16px;border-bottom:1px solid #ddd;padding-bottom:8px")
            section_h2.string = f"{i}. {section.get('title', f'섹션 {i}')}"
            soup.append(section_h2)

            # 섹션 내용 - 2025년에 맞게 조정된 가이드
            content_p = soup.new_tag("p", style="margin:16px 0;line-height:1.6;color:#333")

            # 섹션별 2025년 맞춤 내용 생성
            if '목적' in section.get('title', ''):
                content_p.string = "[2025년 미디어다양성 현황을 반영한 조사 목적을 작성하세요]"
            elif '기간' in section.get('title', '') or '일정' in section.get('title', ''):
                content_p.string = "[2025년 조사 일정: 예시 - 2025년 3월~11월]"
            elif '방법' in section.get('title', ''):
                content_p.string = "[2025년 최신 조사 방법론을 반영하여 작성하세요]"
            elif '예산' in section.get('title', '') or '비용' in section.get('title', ''):
                content_p.string = "[2025년 기준 예산 계획을 작성하세요]"
            else:
                content_p.string = f"[이 부분에 2025년 {section.get('title', '')} 관련 내용을 작성하세요]"

            content_p['style'] = "margin:16px 0;line-height:1.6;color:#666;font-style:italic;background:#f8f9fa;padding:12px;border-radius:4px"
            soup.append(content_p)

            # 하위 항목이 있는 경우
            if section.get('subsections'):
                for subsection in section.get('subsections', []):
                    sub_h3 = soup.new_tag("h3", style="color:#333;font-size:16px;font-weight:bold;margin-top:20px;margin-bottom:12px")
                    sub_h3.string = f"{i}.{len(section.get('subsections', []))}. {subsection}"
                    soup.append(sub_h3)

                    sub_content = soup.new_tag("p", style="margin:12px 0;line-height:1.6;color:#666;font-style:italic")
                    sub_content.string = f"[{subsection} 관련 2025년 계획을 작성하세요]"
                    soup.append(sub_content)

        # 3. 참조 문서 정보 추가
        ref_section = soup.new_tag("div", style="margin-top:40px;padding-top:20px;border-top:1px solid #ddd")
        ref_h3 = soup.new_tag("h3", style="color:#666;font-size:14px;margin-bottom:12px")
        ref_h3.string = "참조 문서"
        ref_section.append(ref_h3)

        ref_list = soup.new_tag("ul", style="color:#888;font-size:12px;margin-left:20px")
        for doc in analyzed_docs:
            li = soup.new_tag("li", style="margin-bottom:4px")
            li.string = doc.get('filename', 'Unknown Document')
            ref_list.append(li)
        ref_section.append(ref_list)
        soup.append(ref_section)

        print(f"✅ [create_2025_document] 2025년 문서 생성 완료")
        return str(soup)

    except Exception as e:
        print(f"❌ [create_2025_document] 문서 생성 실패: {e}")
        return f"문서 생성 중 오류가 발생했습니다: {str(e)}"


def _analyze_document_structure(content: str, filename: str) -> Dict[str, Any]:
    """개별 문서의 구조를 분석합니다."""
    try:
        analysis = {
            'filename': filename,
            'sections': [],
            'year': None,
            'length': len(content),
            'structure_patterns': []
        }

        # 연도 추출
        year_match = re.search(r'20(2[0-9])', filename)
        if year_match:
            analysis['year'] = year_match.group(0)

        # 섹션 구조 분석 (마크다운 헤더 기준)
        lines = content.split('\n')
        current_section = None

        for line in lines:
            line = line.strip()

            # 헤더 패턴 감지
            if re.match(r'^#+\s+', line):  # Markdown 헤더
                header_level = len(line.split()[0])
                header_text = line.replace('#', '').strip()

                section_info = {
                    'title': header_text,
                    'level': header_level,
                    'content_preview': ''
                }
                analysis['sections'].append(section_info)
                current_section = section_info

            elif re.match(r'^\d+\.', line):  # 숫자 목록
                section_info = {
                    'title': line,
                    'level': 2,
                    'content_preview': ''
                }
                analysis['sections'].append(section_info)
                current_section = section_info

            elif current_section and line and len(line) > 10:
                # 현재 섹션의 내용 미리보기 추가
                if len(current_section['content_preview']) < 100:
                    current_section['content_preview'] += line[:100] + ' '

        return analysis

    except Exception as e:
        print(f"❌ [_analyze_document_structure] 구조 분석 실패 {filename}: {e}")
        return {'filename': filename, 'error': str(e)}


def _extract_common_patterns(analyzed_docs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """분석된 문서들에서 공통 패턴을 추출합니다."""
    try:
        all_sections = []
        common_sections = []

        # 모든 문서의 섹션 수집
        for doc in analyzed_docs:
            if 'sections' in doc:
                all_sections.extend(doc['sections'])

        # 섹션 제목 빈도 분석
        section_frequency = {}
        for section in all_sections:
            title = section.get('title', '').lower()
            # 일반화된 키워드로 그룹화
            normalized_title = _normalize_section_title(title)
            if normalized_title:
                section_frequency[normalized_title] = section_frequency.get(normalized_title, 0) + 1

        # 공통 섹션 추출 (2개 이상 문서에서 발견된 섹션)
        min_frequency = max(1, len(analyzed_docs) // 2)
        for title, freq in section_frequency.items():
            if freq >= min_frequency:
                common_sections.append({
                    'title': title,
                    'frequency': freq,
                    'subsections': []
                })

        # 섹션을 일반적인 순서로 정렬
        section_order = ['목적', '개요', '범위', '기간', '방법', '내용', '절차', '예산', '일정', '결과', '기대효과']
        common_sections.sort(key=lambda x: section_order.index(x['title']) if x['title'] in section_order else 999)

        return {
            'common_sections': common_sections,
            'total_unique_sections': len(section_frequency),
            'analysis_summary': f"{len(analyzed_docs)}개 문서에서 {len(common_sections)}개 공통 섹션 발견"
        }

    except Exception as e:
        print(f"❌ [_extract_common_patterns] 패턴 추출 실패: {e}")
        return {'error': str(e)}


def _normalize_section_title(title: str) -> str:
    """섹션 제목을 정규화하여 공통 패턴을 찾습니다."""
    title = title.lower().strip()

    # 키워드 매핑
    if '목적' in title or 'purpose' in title:
        return '목적'
    elif '개요' in title or '요약' in title or 'overview' in title:
        return '개요'
    elif '범위' in title or 'scope' in title:
        return '범위'
    elif '기간' in title or '일정' in title or '스케줄' in title:
        return '기간'
    elif '방법' in title or '절차' in title or 'method' in title:
        return '방법'
    elif '내용' in title or 'content' in title:
        return '내용'
    elif '예산' in title or '비용' in title or 'budget' in title:
        return '예산'
    elif '결과' in title or 'result' in title:
        return '결과'
    elif '기대' in title or '효과' in title:
        return '기대효과'

    return title if len(title) > 2 else ''


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