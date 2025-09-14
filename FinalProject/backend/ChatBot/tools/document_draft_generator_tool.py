# document_draft_generator_tool.py - 문서 초안 생성 도구

import os
import re
from typing import Dict, Any, List, Optional
from pathlib import Path
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
import logging

# 환경 변수 및 설정
from dotenv import load_dotenv
load_dotenv()

# 로깅 설정
logger = logging.getLogger(__name__)

# 로컬 문서 디렉토리 설정
LOCAL_DOCS_PATH = "C:\\ClickA Documents"
SUPPORTED_EXTENSIONS = ['.md', '.txt', '.html', '.docx']

class DocumentDraftGenerator:
    """
    로컬 참조 문서들을 기반으로 새로운 문서 초안을 생성하는 클래스
    """

    def __init__(self):
        self.llm = ChatOpenAI(model_name='gpt-4o', temperature=1.0)

    def _read_local_file(self, file_path: str) -> str:
        """로컬 파일의 내용을 읽어옵니다."""
        try:
            file_path = Path(file_path)
            extension = file_path.suffix.lower()

            if extension in ['.md', '.txt']:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    return f.read()

            elif extension == '.html':
                from bs4 import BeautifulSoup
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    soup = BeautifulSoup(f.read(), 'html.parser')
                    return soup.get_text()

            elif extension == '.docx':
                try:
                    import docx
                    doc = docx.Document(file_path)
                    return '\n'.join([paragraph.text for paragraph in doc.paragraphs])
                except ImportError:
                    logger.error("python-docx library not installed. Cannot read .docx files")
                    return ""

            return ""

        except Exception as e:
            logger.error(f"Error reading file {file_path}: {e}")
            return ""

    def _find_reference_documents(self, search_pattern: str) -> List[Dict[str, Any]]:
        """검색 패턴에 맞는 참조 문서들을 찾습니다."""
        found_files = []

        if not os.path.exists(LOCAL_DOCS_PATH):
            logger.warning(f"Local documents path does not exist: {LOCAL_DOCS_PATH}")
            return found_files

        try:
            # 디렉토리 내의 모든 파일 검색
            for root, dirs, filenames in os.walk(LOCAL_DOCS_PATH):
                for filename in filenames:
                    file_path = os.path.join(root, filename)
                    extension = Path(filename).suffix.lower()

                    # 지원하는 확장자만 처리
                    if extension in SUPPORTED_EXTENSIONS:
                        # 파일명이 검색 패턴과 일치하는지 확인
                        if self._matches_search_pattern(filename.lower(), search_pattern.lower()):
                            try:
                                stat = os.stat(file_path)
                                content = self._read_local_file(file_path)

                                found_files.append({
                                    'filename': filename,
                                    'path': file_path,
                                    'extension': extension,
                                    'size': stat.st_size,
                                    'modified_time': stat.st_mtime,
                                    'content': content,
                                    'content_length': len(content)
                                })
                            except OSError:
                                continue

            # 파일명 유사도와 수정 시간으로 정렬
            found_files.sort(key=lambda x: (
                -self._calculate_filename_similarity(search_pattern.lower(), x['filename'].lower()),
                -x['modified_time']
            ))

            logger.info(f"Found {len(found_files)} reference documents for pattern: {search_pattern}")
            if found_files:
                logger.info("Reference documents found:")
                for i, doc in enumerate(found_files, 1):
                    logger.info(f"  {i}. {doc['filename']} ({doc['content_length']} chars)")
            return found_files

        except Exception as e:
            logger.error(f"Error searching for reference documents: {e}")
            return found_files

    def _matches_search_pattern(self, filename: str, pattern: str) -> bool:
        """파일명이 검색 패턴과 일치하는지 확인합니다."""
        # 키워드 기반 매칭
        pattern_words = pattern.split()
        filename_words = filename.split()

        matches = 0
        for pattern_word in pattern_words:
            if any(pattern_word in filename_word for filename_word in filename_words):
                matches += 1

        # 절반 이상의 키워드가 매칭되면 관련 문서로 간주
        return matches >= len(pattern_words) * 0.5

    def _calculate_filename_similarity(self, pattern: str, filename: str) -> float:
        """파일명과 패턴의 유사도를 계산합니다."""
        pattern_words = set(pattern.split())
        filename_words = set(filename.split())

        if not pattern_words:
            return 0.0

        intersection = pattern_words.intersection(filename_words)
        return len(intersection) / len(pattern_words)

    def _extract_year_from_filename(self, filename: str) -> Optional[int]:
        """파일명에서 연도를 추출합니다."""
        year_pattern = r'(20\d{2})'
        matches = re.findall(year_pattern, filename)
        if matches:
            return int(matches[0])
        return None

    def _analyze_document_patterns(self, reference_docs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """참조 문서들을 분석하여 패턴을 추출합니다."""
        if not reference_docs:
            return {}

        analysis_prompt = f"""
다음은 {len(reference_docs)}개의 참조 문서들입니다. 이 문서들의 구조와 패턴을 분석해주세요.

"""

        for i, doc in enumerate(reference_docs[:4], 1):  # 최대 4개 문서만 분석
            year = self._extract_year_from_filename(doc['filename'])
            year_info = f" ({year}년)" if year else ""

            analysis_prompt += f"""
=== 참조 문서 {i}: {doc['filename']}{year_info} ===
{doc['content'][:2000]}{'...' if len(doc['content']) > 2000 else ''}

"""

        analysis_prompt += """
위 참조 문서들을 분석하여 다음 정보를 JSON 형태로 제공해주세요:

{
    "document_type": "문서 유형 (예: 공고문, 보고서, 계획서 등)",
    "common_structure": [
        "공통적으로 나타나는 문서 구조나 섹션들의 순서대로 나열"
    ],
    "key_patterns": {
        "title_format": "제목 형식의 패턴",
        "content_style": "내용 작성 스타일의 특징",
        "formal_elements": "공통적으로 나타나는 공식적 요소들"
    },
    "yearly_evolution": "연도별로 어떤 변화나 발전이 있었는지",
    "essential_elements": [
        "반드시 포함되어야 하는 필수 요소들"
    ]
}

JSON만 응답해주세요.
"""

        try:
            response = self.llm.invoke([{"role": "user", "content": analysis_prompt}])
            import json
            pattern_analysis = json.loads(response.content.strip())
            logger.info("Successfully analyzed document patterns")
            return pattern_analysis
        except Exception as e:
            logger.error(f"Error analyzing document patterns: {e}")
            return {}

    def generate_document_draft(
        self,
        target_description: str,
        reference_pattern: str,
        target_year: int = 2025
    ) -> str:
        """
        참조 문서들을 기반으로 새로운 문서 초안을 생성합니다.

        Args:
            target_description: 생성할 문서에 대한 설명
            reference_pattern: 참조할 문서들을 찾기 위한 검색 패턴
            target_year: 생성할 문서의 대상 연도

        Returns:
            생성된 문서 HTML
        """
        logger.info(f"Starting document draft generation for: {target_description}")

        # 1. 참조 문서들 찾기
        reference_docs = self._find_reference_documents(reference_pattern)

        if not reference_docs:
            logger.warning(f"No reference documents found for pattern: {reference_pattern}")
            return self._generate_basic_document(target_description, target_year)

        logger.info(f"Found {len(reference_docs)} reference documents")

        # 2. 패턴 분석 생략하고 직접 문서 생성 (ChatGPT 웹과 유사)
        generation_prompt = self._create_generation_prompt(
            target_description,
            reference_docs,
            {},  # 패턴 분석 생략
            target_year
        )

        try:
            response = self.llm.invoke([{"role": "user", "content": generation_prompt}])
            generated_content = response.content.strip()

            # HTML 형태로 변환
            html_content = self._convert_to_html(generated_content)

            logger.info(f"Successfully generated document draft ({len(html_content)} characters)")
            return html_content

        except Exception as e:
            logger.error(f"Error generating document draft: {e}")
            return self._generate_basic_document(target_description, target_year)

    def _create_generation_prompt(
        self,
        target_description: str,
        reference_docs: List[Dict[str, Any]],
        pattern_analysis: Dict[str, Any],
        target_year: int
    ) -> str:
        """문서 생성을 위한 프롬프트를 작성합니다."""

        # ChatGPT 웹과 유사한 직접적이고 간단한 프롬프트
        doc_count = len(reference_docs)
        prompt = f"""다음 {doc_count}개의 참조 문서들을 보고 "{target_description}"를 작성해주세요:

"""
        # 참조 문서들을 간결하게 제시 (최대 4개)
        for i, doc in enumerate(reference_docs[:4], 1):
            year = self._extract_year_from_filename(doc['filename'])
            year_info = f" ({year}년)" if year else ""
            
            prompt += f"""**참조문서 {i}: {doc['filename']}{year_info}**
{doc['content'][:2000]}{'...' if len(doc['content']) > 2000 else ''}

---

"""

        prompt += f"""위 {min(doc_count, 4)}개 참조 문서들의 형식과 구조를 참고하여 {target_year}년도 버전으로 "{target_description}"를 작성해주세요. 

요구사항:
- 실제 공문서 수준의 정확하고 전문적인 내용
- 참조 문서들의 구조와 형식 유지  
- {target_year}년도에 맞는 내용으로 업데이트
- 마크다운 형식으로 작성
- 구체적이고 실용적인 내용 (플레이스홀더 금지)

지금 작성해주세요."""

        return prompt

    def _convert_to_html(self, markdown_content: str) -> str:
        """마크다운 콘텐츠를 HTML로 변환합니다."""
        try:
            import markdown
            html = markdown.markdown(markdown_content, extensions=['tables'])
            return html
        except ImportError:
            # markdown 라이브러리가 없는 경우 간단한 변환
            html_content = markdown_content

            # 기본적인 마크다운 -> HTML 변환
            html_content = re.sub(r'^# (.+)$', r'<h1>\1</h1>', html_content, flags=re.MULTILINE)
            html_content = re.sub(r'^## (.+)$', r'<h2>\1</h2>', html_content, flags=re.MULTILINE)
            html_content = re.sub(r'^### (.+)$', r'<h3>\1</h3>', html_content, flags=re.MULTILINE)

            # 목록 변환
            html_content = re.sub(r'^\- (.+)$', r'<li>\1</li>', html_content, flags=re.MULTILINE)
            html_content = re.sub(r'(<li>.*</li>)', r'<ul>\1</ul>', html_content, flags=re.DOTALL)
            html_content = re.sub(r'</ul>\s*<ul>', '', html_content)

            # 문단 변환
            paragraphs = html_content.split('\n\n')
            html_paragraphs = []
            for para in paragraphs:
                para = para.strip()
                if para and not para.startswith('<'):
                    para = f'<p>{para}</p>'
                html_paragraphs.append(para)

            html_content = '\n'.join(html_paragraphs)

            return html_content

    def _generate_basic_document(self, target_description: str, target_year: int) -> str:
        """참조 문서가 없을 때 기본 문서를 생성합니다."""
        logger.info("Generating basic document without reference documents")

        basic_prompt = f""""{target_description}"를 작성해주세요.

요구사항:
- {target_year}년도에 맞는 최신 내용
- 전문적이고 공식적인 문서
- 마크다운 형식으로 작성
- 실제 사용 가능한 구체적인 내용
- 플레이스홀더나 임시 텍스트 금지

지금 작성해주세요."""

        try:
            response = self.llm.invoke([{"role": "user", "content": basic_prompt}])
            generated_content = response.content.strip()
            return self._convert_to_html(generated_content)
        except Exception as e:
            logger.error(f"Error generating basic document: {e}")
            return f"<h1>{target_description}</h1><p>문서 생성 중 오류가 발생했습니다.</p>"


# 전역 인스턴스
document_draft_generator = DocumentDraftGenerator()

@tool
def document_draft_generator_tool(
    target_description: str,
    reference_pattern: str = "",
    target_year: int = 2025,
    max_reference_docs: int = 4
) -> str:
    """
    로컬 참조 문서들을 기반으로 새로운 문서 초안을 생성하는 도구입니다.

    이 도구는 사용자가 특정 유형의 문서 작성을 요청할 때 사용됩니다.
    로컬 디렉토리에서 비슷한 참조 문서들을 찾아 분석하고,
    그 패턴을 바탕으로 새로운 문서를 생성합니다.

    Args:
        target_description: 생성할 문서에 대한 설명 (예: "2025년 미디어다양성조사 용역 공고문")
        reference_pattern: 참조할 문서들을 찾기 위한 검색 키워드 (예: "미디어다양성조사")
        target_year: 생성할 문서의 대상 연도 (기본값: 2025)
        max_reference_docs: 분석할 최대 참조 문서 수 (기본값: 4)

    Returns:
        생성된 문서 HTML 콘텐츠
    """
    try:
        logger.info(f"Document draft generation requested: {target_description}")

        # 참조 패턴이 없으면 설명에서 추출
        if not reference_pattern:
            # 키워드 추출 시도
            keywords = re.findall(r'[\w가-힣]+', target_description)
            # 일반적인 단어들 제외
            common_words = {'년', '연도', '보고서', '문서', '작성', '생성', '만들어', '줘', '주세요'}
            reference_pattern = ' '.join([kw for kw in keywords if kw not in common_words])

        # 문서 초안 생성
        html_content = document_draft_generator.generate_document_draft(
            target_description=target_description,
            reference_pattern=reference_pattern,
            target_year=target_year
        )

        return html_content

    except Exception as e:
        logger.error(f"Error in document_draft_generator_tool: {e}")
        return f"<h1>문서 생성 오류</h1><p>문서 생성 중 오류가 발생했습니다: {str(e)}</p>"

if __name__ == '__main__':
    # 테스트 코드
    test_cases = [
        {
            "target_description": "2025년 미디어다양성조사 용역 공고문",
            "reference_pattern": "미디어다양성조사",
            "target_year": 2025
        }
    ]

    for test in test_cases:
        print(f"\n=== Testing: {test['target_description']} ===")
        result = document_draft_generator_tool.invoke(test)
        print(f"Generated {len(result)} characters")
        print(f"Preview: {result[:200]}...")