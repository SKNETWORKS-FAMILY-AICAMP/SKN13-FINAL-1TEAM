# enhanced_hybrid_search_tool.py

import os
import json
import boto3
import asyncio
from typing import Dict, Any, List, Tuple
from langchain_core.tools import tool
from pathlib import Path
from difflib import SequenceMatcher
from dotenv import load_dotenv

load_dotenv()

# 문서편집창에서 지원하는 확장자
SUPPORTED_EXTENSIONS = {'.docx', '.md', '.txt', '.html'}

class EnhancedHybridSearcher:
    """
    로컬 + S3 하이브리드 문서 검색기
    파일명과 내용을 모두 고려하여 유사도 검색 수행
    """
    
    def __init__(self):
        """S3 클라이언트 초기화"""
        try:
            from botocore.config import Config
            
            # S3 클라이언트 설정 (엔드포인트 문제 해결)
            config = Config(
                region_name=os.getenv('AWS_REGION', 'ap-northeast-2'),
                retries={'max_attempts': 3, 'mode': 'standard'},
                s3={
                    'addressing_style': 'virtual'  # 가상 호스팅 스타일 사용
                }
            )
            
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
                region_name=os.getenv('AWS_REGION', 'ap-northeast-2'),
                config=config
            )
            self.bucket_name = os.getenv('AWS_S3_BUCKET', 'clickabbbucket')
            print(f"[EnhancedHybridSearcher] S3 클라이언트 초기화 완료: {self.bucket_name}")
        except Exception as e:
            print(f"[EnhancedHybridSearcher] S3 초기화 실패: {e}")
            self.s3_client = None
    
    def calculate_similarity(self, query: str, text: str) -> float:
        """문자열 유사도 계산 (0.0 ~ 1.0)"""
        if not query or not text:
            return 0.0
        
        query_lower = query.lower()
        text_lower = text.lower()
        
        # 1. 정확한 매치
        if query_lower == text_lower:
            return 1.0
        
        # 2. 포함 관계 체크
        if query_lower in text_lower:
            return 0.9
        
        # 3. 단어 레벨 매칭
        query_words = set(query_lower.split())
        text_words = set(text_lower.split())
        
        if query_words and text_words:
            intersection = query_words.intersection(text_words)
            union = query_words.union(text_words)
            jaccard_score = len(intersection) / len(union) if union else 0.0
        else:
            jaccard_score = 0.0
        
        # 4. 시퀀스 매칭
        sequence_score = SequenceMatcher(None, query_lower, text_lower).ratio()
        
        # 가중 평균으로 최종 점수 계산
        final_score = (jaccard_score * 0.7) + (sequence_score * 0.3)
        return round(final_score, 3)
    
    def search_local_documents(self, query: str) -> List[Dict[str, Any]]:
        """
        로컬 문서 검색 (C:\ClickA Documents)
        """
        local_results = []
        local_path = Path("C:\\ClickA Documents")
        
        if not local_path.exists():
            print(f"[EnhancedHybridSearcher] 로컬 경로 없음: {local_path}")
            return local_results
        
        supported_extensions = {'.md', '.txt', '.html', '.docx', '.pdf'}  # 검색은 모든 파일, 처리는 구분
        
        try:
            for file_path in local_path.rglob('*'):
                if file_path.is_file() and file_path.suffix.lower() in supported_extensions:
                    # 파일명 유사도
                    filename_score = self.calculate_similarity(query, file_path.stem)
                    
                    # 텍스트 파일의 경우 내용 유사도도 계산
                    content_score = 0.0
                    if file_path.suffix.lower() in {'.md', '.txt', '.html'}:
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                content = f.read()[:1000]  # 첫 1000자만 검사
                                content_score = self.calculate_similarity(query, content)
                        except Exception as e:
                            print(f"[Local] 파일 읽기 오류 {file_path}: {e}")
                    
                    # 전체 점수 (파일명 70%, 내용 30%)
                    total_score = (filename_score * 0.7) + (content_score * 0.3)
                    
                    if total_score > 0.1:  # 최소 임계값
                        extension = file_path.suffix.lower()
                        is_supported = extension in SUPPORTED_EXTENSIONS
                        
                        local_results.append({
                            'filename': file_path.name,
                            'path': str(file_path),
                            'extension': extension,
                            'source': 'local',
                            'location': f'Local: {file_path.parent}',
                            'filename_score': filename_score,
                            'content_score': content_score,
                            'total_score': total_score,
                            'file_size': file_path.stat().st_size if file_path.exists() else 0,
                            'is_supported': is_supported,
                            'action_type': 'open_editor' if is_supported else 'download'
                        })
            
            print(f"[EnhancedHybridSearcher] 로컬 검색 결과: {len(local_results)}개")
            
        except Exception as e:
            print(f"[EnhancedHybridSearcher] 로컬 검색 오류: {e}")
        
        return local_results
    
    def search_s3_documents(self, query: str) -> List[Dict[str, Any]]:
        """
        S3 문서 검색 (kobaco_data_md/, kobaco_data/, uploads/)
        """
        s3_results = []
        
        if not self.s3_client:
            return s3_results
        
        prefixes = ['kobaco_data_md/', 'kobaco_data/', 'uploads/']
        supported_extensions = {'.md', '.txt', '.html', '.docx', '.pdf'}
        
        try:
            for prefix in prefixes:
                print(f"[S3] 검색 중: {prefix}")
                
                response = self.s3_client.list_objects_v2(
                    Bucket=self.bucket_name,
                    Prefix=prefix,
                    MaxKeys=1000
                )
                
                for obj in response.get('Contents', []):
                    key = obj['Key']
                    filename = os.path.basename(key)
                    
                    if not filename or filename.startswith('.'):
                        continue
                    
                    extension = Path(filename).suffix.lower()
                    if extension not in supported_extensions:
                        continue
                    
                    # 파일명 유사도
                    filename_score = self.calculate_similarity(query, Path(filename).stem)
                    
                    # MD 파일의 경우 내용도 검사 (작은 파일만)
                    content_score = 0.0
                    if extension == '.md' and obj.get('Size', 0) < 10000:  # 10KB 미만
                        try:
                            content_obj = self.s3_client.get_object(Bucket=self.bucket_name, Key=key)
                            content = content_obj['Body'].read().decode('utf-8')[:1000]
                            content_score = self.calculate_similarity(query, content)
                        except Exception as e:
                            print(f"[S3] 내용 읽기 오류 {key}: {e}")
                    
                    # 전체 점수
                    total_score = (filename_score * 0.7) + (content_score * 0.3)
                    
                    if total_score > 0.1:  # 최소 임계값
                        is_supported = extension in SUPPORTED_EXTENSIONS
                        
                        s3_results.append({
                            'filename': filename,
                            'path': key,
                            'extension': extension,
                            'source': 's3',
                            'location': f'S3: {prefix}',
                            'filename_score': filename_score,
                            'content_score': content_score,
                            'total_score': total_score,
                            'file_size': obj.get('Size', 0),
                            's3_url': f's3://{self.bucket_name}/{key}',
                            'is_supported': is_supported,
                            'action_type': 'open_editor' if is_supported else 'download'
                        })
            
            print(f"[EnhancedHybridSearcher] S3 검색 결과: {len(s3_results)}개")
            
        except Exception as e:
            print(f"[EnhancedHybridSearcher] S3 검색 오류: {e}")
        
        return s3_results
    
    def hybrid_search(self, query: str, max_results: int = 3) -> Dict[str, Any]:
        """
        하이브리드 검색 실행 (로컬 + S3)
        """
        print(f"[EnhancedHybridSearcher] 하이브리드 검색 시작: '{query}'")
        
        # 로컬 및 S3 검색 실행
        local_results = self.search_local_documents(query)
        s3_results = self.search_s3_documents(query)
        
        # 결과 통합
        all_results = local_results + s3_results
        
        # 점수순 정렬
        all_results.sort(key=lambda x: x['total_score'], reverse=True)
        
        # 상위 N개 선택
        top_results = all_results[:max_results]
        
        print(f"[EnhancedHybridSearcher] 최종 결과: {len(top_results)}개")
        for i, result in enumerate(top_results, 1):
            source_icon = "📂" if result['source'] == 'local' else "☁️"
            print(f"  {i}. {result['filename']} ({source_icon} {result['source'].upper()}, score: {result['total_score']:.3f})")
        
        return {
            'found_documents': top_results,
            'total_found': len(top_results),
            'search_query': query,
            'local_count': len(local_results),
            's3_count': len(s3_results),
            'search_locations': {
                'local': 'C:\\ClickA Documents',
                's3': f"{self.bucket_name}/kobaco_data_md/, kobaco_data/, uploads/"
            }
        }

# 전역 인스턴스
enhanced_searcher = EnhancedHybridSearcher()

@tool
def enhanced_hybrid_search_tool(query: str, max_results: int = 3) -> Dict[str, Any]:
    """
    개선된 하이브리드 문서 검색 도구
    
    로컬(C:\ClickA Documents)과 S3(kobaco_data_md/, kobaco_data/, uploads/)에서 
    파일명과 내용을 모두 고려하여 유사도 기반 문서 검색을 수행합니다.
    
    사용자가 "xxx문서를 찾아서 띄워줘" 같은 요청을 할 때 사용됩니다.
    
    Args:
        query: 찾고자 하는 문서의 이름이나 키워드
        max_results: 반환할 최대 결과 수 (기본값: 3)
    
    Returns:
        검색된 문서 목록과 메타데이터
        각 문서는 filename, path, source, total_score 등의 정보 포함
    """
    try:
        return enhanced_searcher.hybrid_search(query, max_results)
    except Exception as e:
        print(f"[enhanced_hybrid_search_tool] 오류: {e}")
        return {
            'found_documents': [],
            'total_found': 0,
            'search_query': query,
            'error': str(e)
        }