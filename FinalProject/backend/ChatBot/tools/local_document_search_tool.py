# local_document_search_tool.py

import os
import re
from typing import Dict, Any, List, Tuple
from pathlib import Path
from langchain_core.tools import tool
from langchain_openai import OpenAIEmbeddings
import docx
from bs4 import BeautifulSoup
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import boto3
from botocore.config import Config
from dotenv import load_dotenv

# 환경 변수 로드
load_dotenv()

# 고정된 로컬 문서 디렉토리
LOCAL_DOCS_PATH = "C:\\ClickA Documents"

# S3 설정
S3_BUCKET_NAME = "clickabbbucket"
S3_SEARCH_PATHS = ["kobaco_data_md/", "kobaco_data/", "uploads/"]

# 지원하는 확장자 (우선순위 순)
SUPPORTED_EXTENSIONS = ['.html', '.docx', '.md', '.txt']
EXTENSION_PRIORITY = {'.html': 1, '.docx': 2, '.md': 3, '.txt': 4}

class HybridDocumentSearcher:
    """
    로컬 디렉토리와 S3 버킷에서 문서를 검색하는 클래스
    파일명 기반으로 유사도 검색 수행 (로컬 우선)
    """
    
    def __init__(self):
        self.embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
        self.tfidf_vectorizer = TfidfVectorizer(
            max_features=1000,
            stop_words=None,  # 한국어 지원을 위해 None으로 설정
            ngram_range=(1, 2)
        )
        
        # S3 클라이언트 초기화
        try:
            self.s3_client = boto3.client(
                's3',
                region_name=os.getenv('AWS_REGION', 'ap-northeast-2'),
                config=Config(signature_version='s3v4')
            )
            print(f"[HybridDocumentSearcher] S3 클라이언트 초기화 성공")
        except Exception as e:
            print(f"[HybridDocumentSearcher] S3 클라이언트 초기화 실패: {e}")
            self.s3_client = None
    
    def _extract_text_content(self, file_path: str) -> str:
        """파일에서 텍스트 내용 추출"""
        try:
            file_path = Path(file_path)
            extension = file_path.suffix.lower()
            
            if extension == '.txt' or extension == '.md':
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    return f.read()
            
            elif extension == '.html':
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    soup = BeautifulSoup(f.read(), 'html.parser')
                    return soup.get_text()
            
            elif extension == '.docx':
                doc = docx.Document(file_path)
                return '\n'.join([paragraph.text for paragraph in doc.paragraphs])
            
            return ""
        
        except Exception as e:
            print(f"Error extracting text from {file_path}: {e}")
            return ""
    
    def _get_all_supported_files(self) -> List[Dict[str, Any]]:
        """지원되는 모든 파일 목록 가져오기 (하위폴더 포함)"""
        files = []
        
        if not os.path.exists(LOCAL_DOCS_PATH):
            print(f"Warning: Local documents path does not exist: {LOCAL_DOCS_PATH}")
            return files
        
        try:
            for root, dirs, filenames in os.walk(LOCAL_DOCS_PATH):
                for filename in filenames:
                    file_path = os.path.join(root, filename)
                    extension = Path(filename).suffix.lower()
                    
                    if extension in SUPPORTED_EXTENSIONS:
                        # 파일 정보 수집
                        try:
                            stat = os.stat(file_path)
                            files.append({
                                'filename': filename,
                                'path': file_path,
                                'extension': extension,
                                'priority': EXTENSION_PRIORITY[extension],
                                'size': stat.st_size,
                                'modified_time': stat.st_mtime,
                                'relative_path': os.path.relpath(file_path, LOCAL_DOCS_PATH),
                                'source': 'local'  # 출처 표시
                            })
                        except OSError:
                            continue  # 파일 접근 불가 시 건너뛰기
            
        except Exception as e:
            print(f"Error scanning directory {LOCAL_DOCS_PATH}: {e}")
        
        return files
    
    def _get_s3_files(self) -> List[Dict[str, Any]]:
        """S3 버킷에서 지원되는 모든 파일 목록 가져오기"""
        files = []
        
        if not self.s3_client:
            print(f"[HybridDocumentSearcher] S3 클라이언트가 없어서 S3 검색 건너뜀")
            return files
        
        try:
            for search_path in S3_SEARCH_PATHS:
                print(f"[HybridDocumentSearcher] S3 경로 검색 중: {search_path}")
                
                # S3에서 객체 목록 가져오기
                response = self.s3_client.list_objects_v2(
                    Bucket=S3_BUCKET_NAME,
                    Prefix=search_path,
                    MaxKeys=1000
                )
                
                if 'Contents' not in response:
                    continue
                
                for obj in response['Contents']:
                    key = obj['Key']
                    filename = key.split('/')[-1]  # 파일명만 추출
                    
                    if not filename:  # 폴더인 경우 건너뛰기
                        continue
                    
                    extension = Path(filename).suffix.lower()
                    
                    if extension in SUPPORTED_EXTENSIONS:
                        files.append({
                            'filename': filename,
                            'path': key,  # S3 키를 경로로 사용
                            'extension': extension,
                            'priority': EXTENSION_PRIORITY[extension],
                            'size': obj['Size'],
                            'modified_time': obj['LastModified'].timestamp(),
                            'relative_path': key,
                            'source': 's3',  # 출처 표시
                            's3_bucket': S3_BUCKET_NAME
                        })
                
        except Exception as e:
            print(f"[HybridDocumentSearcher] S3 검색 중 오류: {e}")
        
        return files
    
    def _calculate_filename_similarity(self, query: str, filename: str) -> float:
        """파일명과 쿼리의 유사도 계산"""
        query_lower = query.lower()
        filename_lower = filename.lower()
        
        # 정확한 매치
        if query_lower in filename_lower:
            return 1.0
        
        # 부분 매치 점수 계산
        words = query_lower.split()
        matches = sum(1 for word in words if word in filename_lower)
        return matches / len(words) if words else 0.0
    
    def _calculate_content_similarity(self, query: str, content: str) -> float:
        """내용과 쿼리의 유사도 계산 (TF-IDF 기반)"""
        if not content.strip():
            return 0.0
        
        try:
            # TF-IDF 벡터화
            documents = [query, content]
            tfidf_matrix = self.tfidf_vectorizer.fit_transform(documents)
            
            # 코사인 유사도 계산
            similarity = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
            return float(similarity)
        
        except Exception as e:
            print(f"Error calculating content similarity: {e}")
            return 0.0
    
    def _deduplicate_by_name(self, files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """같은 이름의 파일들을 우선순위에 따라 중복 제거 (로컬 우선)"""
        name_groups = {}
        
        for file_info in files:
            # 확장자를 제외한 파일명
            base_name = Path(file_info['filename']).stem.lower()
            
            if base_name not in name_groups:
                name_groups[base_name] = []
            name_groups[base_name].append(file_info)
        
        # 각 그룹에서 우선순위가 높은 파일만 선택
        deduplicated = []
        for base_name, group in name_groups.items():
            # 1차: 출처별 우선순위 (local > s3)
            # 2차: 확장자별 우선순위 (숫자가 작을수록 높음)
            group.sort(key=lambda x: (
                0 if x['source'] == 'local' else 1,  # 로컬 우선
                x['priority']  # 확장자 우선순위
            ))
            deduplicated.append(group[0])  # 가장 우선순위 높은 파일 선택
        
        return deduplicated
    
    def search_hybrid_documents(self, query: str, max_results: int = 3) -> List[Dict[str, Any]]:
        """로컬 및 S3 문서 통합 검색 수행 (로컬 우선)"""
        print(f"[HybridDocumentSearcher] Searching for: '{query}' in local and S3")
        
        # 로컬 파일 가져오기
        local_files = self._get_all_supported_files()
        print(f"[HybridDocumentSearcher] Found {len(local_files)} local files")
        
        # S3 파일 가져오기
        s3_files = self._get_s3_files()
        print(f"[HybridDocumentSearcher] Found {len(s3_files)} S3 files")
        
        # 모든 파일 합치기 (로컬 우선)
        all_files = local_files + s3_files
        
        if not all_files:
            print("[HybridDocumentSearcher] No supported files found")
            return []
        
        print(f"[HybridDocumentSearcher] Total {len(all_files)} files to search")
        
        # 중복 제거 (같은 이름, 다른 확장자)
        unique_files = self._deduplicate_by_name(all_files)
        print(f"[HybridDocumentSearcher] After deduplication: {len(unique_files)} files")
        
        # 각 파일에 대해 유사도 계산
        scored_files = []
        
        for file_info in unique_files:
            try:
                # 파일명 유사도
                filename_score = self._calculate_filename_similarity(query, file_info['filename'])
                
                # 내용 유사도 (로컬 파일만 내용 검사, S3는 파일명만)
                content_score = 0.0
                if file_info['source'] == 'local' and (filename_score > 0 or len(unique_files) <= 20):
                    content = self._extract_text_content(file_info['path'])
                    content_score = self._calculate_content_similarity(query, content)
                
                # 종합 점수 계산
                if file_info['source'] == 'local':
                    # 로컬: 파일명 70%, 내용 30%
                    total_score = (filename_score * 0.7) + (content_score * 0.3)
                else:
                    # S3: 파일명만 100%
                    total_score = filename_score
                
                if total_score > 0:  # 점수가 있는 파일만 포함
                    scored_files.append({
                        **file_info,
                        'filename_score': filename_score,
                        'content_score': content_score,
                        'total_score': total_score
                    })
                    
            except Exception as e:
                print(f"Error processing file {file_info['path']}: {e}")
                continue
        
        # 점수순으로 정렬
        scored_files.sort(key=lambda x: x['total_score'], reverse=True)
        
        # 상위 결과 반환
        results = scored_files[:max_results]
        
        print(f"[HybridDocumentSearcher] Returning {len(results)} results:")
        for i, result in enumerate(results, 1):
            source_label = "📁 로컬" if result['source'] == 'local' else "☁️ S3"
            print(f"  {i}. {result['filename']} ({source_label}, score: {result['total_score']:.3f})")
        
        return results


# 전역 인스턴스
hybrid_searcher = HybridDocumentSearcher()

@tool
def local_document_search_tool(query: str, max_results: int = 3) -> Dict[str, Any]:
    """
    로컬 디렉토리와 S3 버킷에서 문서를 검색하는 도구입니다.
    
    이 도구는 사용자가 특정 문서를 찾아달라고 요청할 때 사용됩니다.
    로컬 파일은 파일명과 내용을 모두 검색하고, S3 파일은 파일명만 검색합니다.
    로컬 파일이 우선순위를 가집니다.
    
    지원하는 파일 형식: HTML, DOCX, MD, TXT
    검색 범위: 
    - 로컬: C:\\ClickA Documents 및 하위 폴더 전체
    - S3: clickabbbucket의 kobaco_data_md/, kobaco_data/, uploads/ 경로
    
    Args:
        query: 사용자가 찾고자 하는 문서에 대한 설명 또는 키워드
        max_results: 반환할 최대 결과 수 (기본값: 3)
    
    Returns:
        검색된 문서들의 정보를 포함한 딕셔너리
        각 문서는 filename, path, extension, source, total_score 등의 정보를 포함
    """
    try:
        results = hybrid_searcher.search_hybrid_documents(query, max_results)
        
        # 결과를 AI가 이해하기 쉬운 형태로 변환
        formatted_results = []
        for result in results:
            formatted_results.append({
                'filename': result['filename'],
                'path': result['path'],
                'relative_path': result['relative_path'],
                'extension': result['extension'],
                'source': result['source'],  # 출처 정보 추가
                'score': round(result['total_score'], 3),
                'filename_match': round(result['filename_score'], 3),
                'content_match': round(result['content_score'], 3)
            })
        
        return {
            'found_documents': formatted_results,
            'total_found': len(formatted_results),
            'search_query': query,
            'search_locations': {
                'local': LOCAL_DOCS_PATH,
                's3': f"{S3_BUCKET_NAME}/{', '.join(S3_SEARCH_PATHS)}"
            }
        }
        
    except Exception as e:
        return {
            'found_documents': [],
            'total_found': 0,
            'search_query': query,
            'error': str(e)
        }

if __name__ == '__main__':
    # 테스트 코드
    test_queries = [
        "보고서",
        "회의록",
        "계획서"
    ]
    
    for query in test_queries:
        print(f"\n=== Testing query: '{query}' ===")
        results = local_document_search_tool.invoke({"query": query})
        print(f"Results: {results}")
