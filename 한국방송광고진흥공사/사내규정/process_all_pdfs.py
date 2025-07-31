import os
import pandas as pd
import re
import uuid
import logging
from typing import List, Optional, Tuple, Dict, Any
from dataclasses import dataclass
from abc import ABC, abstractmethod

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Error: PyMuPDF is not installed. Please install it using 'pip install PyMuPDF'")
    exit()

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class Config:
    """설정 클래스"""
    # 더 유연한 정규식 패턴들
    CHAPTER_PATTERNS: List[str] = None
    ARTICLE_PATTERNS: List[str] = None
    DATE_PATTERN: str = r'(\d{4})년도?\s*(\d{1,2})월'
    OUTPUT_FILENAME: str = '사내규정.csv'
    ENCODING: str = 'utf-8-sig'
    MIN_CONTENT_LENGTH: int = 10
    PRESERVE_PARAGRAPH_BREAKS: bool = True
    
    def __post_init__(self):
        if self.CHAPTER_PATTERNS is None:
            self.CHAPTER_PATTERNS = [
                r'^제\s*\d+\s*장.*',           # 제1장, 제 1 장
                r'^\[\s*제\s*\d+\s*장.*\]',   # [제1장]
                r'^Chapter\s+\d+.*',          # Chapter 1 (영문)
                r'^\d+\.\s*장.*',             # 1. 장
            ]
        
        if self.ARTICLE_PATTERNS is None:
            self.ARTICLE_PATTERNS = [
                r'^(제\s*\d+조(?:의\d+)?(?:\([^)]*\))?(?:\s*\[[^\]]*\])?)',  # 기본
                r'^\[\s*(제\s*\d+조(?:의\d+)?)\s*\]',                        # [제1조]
                r'^(제\s*\d+\s*조(?:의\d+)?)',                              # 띄어쓰기 허용
                r'^(Article\s+\d+)',                                         # Article 1
                r'^(\d+\.\s*조)',                                           # 1. 조
            ]

@dataclass
class DocumentChunk:
    """문서 청크 데이터 클래스"""
    id: str
    filename: str
    last_updated: Optional[str]
    chapter: str
    article: str
    content: str
    paragraph_count: int = 0
    content_type: str = "regulation"  # regulation, header, footer 등

    def to_dict(self) -> Dict[str, Any]:
        """딕셔너리 형태로 변환"""
        return {
            'id': self.id,
            '원본 파일명': self.filename,
            '최종 업데이트 날짜': self.last_updated,
            '제 O장': self.chapter,
            '제 O조': self.article,
            'content': self.content,
            '단락 수': self.paragraph_count,
            '콘텐츠 타입': self.content_type
        }

    def is_valid(self) -> bool:
        """청크 유효성 검사"""
        return all([
            self.id,
            self.filename,
            self.article,
            self.content.strip(),
            len(self.content.strip()) >= Config().MIN_CONTENT_LENGTH
        ])

class TextExtractor:
    """PDF 텍스트 추출 전용 클래스"""
    
    def extract_from_pdf(self, file_path: str) -> Optional[str]:
        """PDF에서 텍스트 추출"""
        try:
            doc = fitz.open(file_path)
            text = ""
            for page_num, page in enumerate(doc, 1):
                try:
                    page_text = page.get_text()
                    text += page_text
                except Exception as e:
                    logger.warning(f"Failed to extract text from page {page_num}: {e}")
            doc.close()
            return text
        except fitz.FileDataError:
            logger.error(f"Invalid PDF file: {file_path}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error reading PDF {file_path}: {e}")
            return None

class PatternMatcher:
    """패턴 매칭 전용 클래스"""
    
    def __init__(self, config: Config):
        self.config = config
        self.chapter_patterns = [re.compile(pattern) for pattern in config.CHAPTER_PATTERNS]
        self.article_patterns = [re.compile(pattern) for pattern in config.ARTICLE_PATTERNS]
        self.date_pattern = re.compile(config.DATE_PATTERN)
    
    def match_chapter(self, text: str) -> Optional[str]:
        """장 패턴 매칭"""
        for pattern in self.chapter_patterns:
            match = pattern.match(text)
            if match:
                return text.strip()
        return None
    
    def match_article(self, text: str) -> Optional[Tuple[str, str]]:
        """조 패턴 매칭 - (매칭된 조 번호, 나머지 텍스트) 반환"""
        for pattern in self.article_patterns:
            match = pattern.match(text)
            if match:
                article_title = match.group(1).strip()
                remaining = text[match.end():].strip()
                return article_title, remaining
        return None
    
    def extract_date_from_filename(self, filename: str) -> Optional[str]:
        """파일명에서 날짜 추출"""
        match = self.date_pattern.search(filename)
        if match:
            year = match.group(1)
            month = match.group(2).zfill(2)
            return f"{year}-{month}"
        return None

class TextProcessor:
    """텍스트 처리 및 청킹 전용 클래스"""
    
    def __init__(self, config: Config):
        self.config = config
        self.pattern_matcher = PatternMatcher(config)
    
    def preprocess_text(self, text: str) -> List[str]:
        """텍스트 전처리 - 라인 정리 및 정규화"""
        lines = text.split('\n')
        processed_lines = []
        
        for line in lines:
            stripped = line.strip()
            if not stripped:
                if self.config.PRESERVE_PARAGRAPH_BREAKS:
                    processed_lines.append('')  # 빈 줄 유지
                continue
            processed_lines.append(stripped)
        
        return processed_lines
    
    def count_paragraphs(self, content_lines: List[str]) -> int:
        """단락 수 계산"""
        if not content_lines:
            return 0
        
        paragraph_count = 1
        for line in content_lines:
            if line == '':  # 빈 줄이 단락 구분자
                paragraph_count += 1
        
        return paragraph_count
    
    def chunk_text(self, text: str, filename: str) -> List[DocumentChunk]:
        """텍스트를 장과 조 단위로 청킹"""
        chunks = []
        lines = self.preprocess_text(text)
        
        current_chapter = ''
        current_article_title = ''
        current_content = []
        last_updated_date = self.pattern_matcher.extract_date_from_filename(filename)

        for line in lines:
            if not line:  # 빈 줄 처리
                if current_article_title and self.config.PRESERVE_PARAGRAPH_BREAKS:
                    current_content.append('')
                continue
            
            # 장 패턴 확인
            chapter_match = self.pattern_matcher.match_chapter(line)
            if chapter_match:
                # 이전 조 저장
                if current_article_title:
                    chunk = self._create_chunk(
                        filename, last_updated_date, current_chapter,
                        current_article_title, current_content
                    )
                    if chunk and chunk.is_valid():
                        chunks.append(chunk)
                    current_content = []
                
                current_chapter = chapter_match
                current_article_title = ''
                continue

            # 조 패턴 확인
            article_match = self.pattern_matcher.match_article(line)
            if article_match:
                article_title, remaining_content = article_match
                
                # 이전 조 저장
                if current_article_title:
                    chunk = self._create_chunk(
                        filename, last_updated_date, current_chapter,
                        current_article_title, current_content
                    )
                    if chunk and chunk.is_valid():
                        chunks.append(chunk)
                
                current_article_title = article_title
                current_content = [remaining_content] if remaining_content else []
            else:
                # 일반 콘텐츠 라인
                if current_article_title:
                    current_content.append(line)

        # 마지막 조 처리
        if current_article_title:
            chunk = self._create_chunk(
                filename, last_updated_date, current_chapter,
                current_article_title, current_content
            )
            if chunk and chunk.is_valid():
                chunks.append(chunk)

        return chunks

    def _create_chunk(self, filename: str, last_updated_date: Optional[str],
                     chapter: str, article_title: str, content_lines: List[str]) -> Optional[DocumentChunk]:
        """DocumentChunk 객체 생성"""
        # 빈 라인 정리하면서 콘텐츠 구성
        content_str = self._join_content_lines(content_lines)
        if not content_str:
            return None
        
        paragraph_count = self.count_paragraphs(content_lines)
        
        return DocumentChunk(
            id=str(uuid.uuid4()),
            filename=filename,
            last_updated=last_updated_date,
            chapter=chapter,
            article=article_title,
            content=content_str,
            paragraph_count=paragraph_count
        )
    
    def _join_content_lines(self, lines: List[str]) -> str:
        """콘텐츠 라인들을 적절히 조인"""
        if not lines:
            return ""
        
        if self.config.PRESERVE_PARAGRAPH_BREAKS:
            # 빈 줄은 단락 구분으로 유지, 연속된 빈 줄은 하나로 정리
            result = []
            prev_empty = False
            
            for line in lines:
                if line == '':
                    if not prev_empty:
                        result.append('')
                    prev_empty = True
                else:
                    result.append(line)
                    prev_empty = False
            
            return '\n'.join(result).strip()
        else:
            # 빈 줄 제거하고 조인
            return '\n'.join(line for line in lines if line).strip()

class DocumentSaver(ABC):
    """문서 저장 인터페이스"""
    
    @abstractmethod
    def save(self, chunks: List[DocumentChunk], output_path: str) -> bool:
        pass

class CSVDocumentSaver(DocumentSaver):
    """CSV 형태로 문서 저장"""
    
    def __init__(self, encoding: str = 'utf-8-sig'):
        self.encoding = encoding
    
    def save(self, chunks: List[DocumentChunk], output_path: str) -> bool:
        """CSV 파일로 저장"""
        if not chunks:
            logger.warning("No chunks to save")
            return False
        
        try:
            # DataFrame 생성
            data = [chunk.to_dict() for chunk in chunks]
            df = pd.DataFrame(data)
            
            # CSV 저장
            df.to_csv(output_path, index=False, encoding=self.encoding)
            logger.info(f"Successfully saved {len(chunks)} chunks to '{output_path}'")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save CSV file: {e}")
            return False

class PDFProcessor:
    """PDF 문서 처리 메인 클래스 - 각 컴포넌트 조율 역할"""
    
    def __init__(self, config: Config = None, saver: DocumentSaver = None):
        self.config = config or Config()
        self.text_extractor = TextExtractor()
        self.text_processor = TextProcessor(self.config)
        self.saver = saver or CSVDocumentSaver(self.config.ENCODING)

    def process_pdf_file(self, file_path: str) -> List[DocumentChunk]:
        """단일 PDF 파일 처리"""
        filename = os.path.basename(file_path)
        logger.info(f"Processing {filename}...")
        
        # 1. 텍스트 추출
        text = self.text_extractor.extract_from_pdf(file_path)
        if not text:
            logger.warning(f"No text extracted from {filename}")
            return []
        
        # 2. 텍스트 청킹
        chunks = self.text_processor.chunk_text(text, filename)
        logger.info(f"Extracted {len(chunks)} valid chunks from {filename}")
        return chunks

    def process_directory(self, directory: str = None) -> List[DocumentChunk]:
        """디렉토리 내 모든 PDF 파일 처리"""
        if directory is None:
            directory = os.path.dirname(os.path.realpath(__file__))
        
        all_chunks = []
        pdf_files = [f for f in os.listdir(directory) if f.lower().endswith('.pdf')]
        
        if not pdf_files:
            logger.warning(f"No PDF files found in {directory}")
            return []
        
        logger.info(f"Found {len(pdf_files)} PDF files to process")
        
        for filename in pdf_files:
            file_path = os.path.join(directory, filename)
            try:
                chunks = self.process_pdf_file(file_path)
                all_chunks.extend(chunks)
            except Exception as e:
                logger.error(f"Failed to process {filename}: {e}")
        
        logger.info(f"Total chunks extracted: {len(all_chunks)}")
        return all_chunks

    def save_chunks(self, chunks: List[DocumentChunk], output_path: str = None) -> bool:
        """청크들을 파일로 저장"""
        if output_path is None:
            output_path = self.config.OUTPUT_FILENAME
        
        return self.saver.save(chunks, output_path)

def main():
    """메인 함수"""
    try:
        # 설정 커스터마이징 예시
        config = Config()
        config.PRESERVE_PARAGRAPH_BREAKS = True
        config.MIN_CONTENT_LENGTH = 15
        
        # CSV 저장기 설정
        csv_saver = CSVDocumentSaver(encoding='utf-8-sig')
        
        # 프로세서 생성
        processor = PDFProcessor(config=config, saver=csv_saver)
        
        # 처리 실행
        chunks = processor.process_directory()
        
        if not chunks:
            logger.warning("No data was processed. Exiting.")
            return
        
        # 저장
        success = processor.save_chunks(chunks)
        if success:
            logger.info("Processing completed successfully!")
            logger.info(f"Average paragraphs per chunk: {sum(c.paragraph_count for c in chunks) / len(chunks):.1f}")
        else:
            logger.error("Failed to save results")
            
    except KeyboardInterrupt:
        logger.info("Process interrupted by user")
    except Exception as e:
        logger.error(f"Unexpected error in main: {e}")

if __name__ == '__main__':
    main()