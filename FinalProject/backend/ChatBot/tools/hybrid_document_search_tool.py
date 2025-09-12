# hybrid_document_search_tool.py

import json
from typing import Dict, Any, List
from langchain_core.tools import tool
from .local_document_search_tool import hybrid_searcher

@tool
def hybrid_document_search_tool(query: str, max_results: int = 3) -> Dict[str, Any]:
    """
    로컬(클라이언트) + S3(서버) 하이브리드 문서 검색 도구입니다.
    
    이 도구는 사용자가 특정 문서를 찾아달라고 요청할 때 사용됩니다.
    - 로컬 검색: Electron IPC를 통해 클라이언트에서 처리
    - S3 검색: 서버에서 직접 처리
    - 결과 통합: 로컬 우선으로 최대 3개 결과 반환
    
    지원하는 파일 형식: HTML, DOCX, MD, TXT
    검색 범위: 
    - 로컬: C:\ClickA Documents 및 하위 폴더 전체 (클라이언트)
    - S3: clickabbbucket의 kobaco_data_md/, kobaco_data/, uploads/ 경로 (서버)
    
    Args:
        query: 사용자가 찾고자 하는 문서에 대한 설명 또는 키워드
        max_results: 반환할 최대 결과 수 (기본값: 3)
    
    Returns:
        검색된 문서들의 정보를 포함한 딕셔너리
        각 문서는 filename, path, extension, source, total_score 등의 정보를 포함
    """
    try:
        print(f"[HybridDocumentSearchTool] 하이브리드 검색 시작: '{query}'")
        
        # S3 검색만 수행 (로컬은 프론트엔드에서 별도 처리)
        s3_files = hybrid_searcher._get_s3_files()
        print(f"[HybridDocumentSearchTool] S3에서 {len(s3_files)} 파일 발견")
        
        # S3 파일에 대해 파일명 유사도 검색
        query_lower = query.lower()
        scored_files = []
        
        for file_info in s3_files:
            filename_lower = file_info['filename'].lower()
            score = 0
            
            # 정확한 매치
            if query_lower in filename_lower:
                score = 1.0
            # 부분 매치
            else:
                query_words = query_lower.split()
                match_count = sum(1 for word in query_words if word in filename_lower)
                if match_count > 0:
                    score = match_count / len(query_words) * 0.8
            
            if score > 0:
                scored_files.append({
                    **file_info,
                    'filename_score': score,
                    'content_score': 0,
                    'total_score': score,
                    'score': round(score, 3)
                })
        
        # 점수순 정렬 및 결과 제한
        scored_files.sort(key=lambda x: x['total_score'], reverse=True)
        s3_results = scored_files[:max_results]
        
        print(f"[HybridDocumentSearchTool] S3 검색 결과: {len(s3_results)}개")
        for i, result in enumerate(s3_results, 1):
            print(f"  {i}. {result['filename']} (☁️ S3, score: {result['total_score']:.3f})")
        
        return {
            'found_documents': s3_results,
            'total_found': len(s3_results),
            'search_query': query,
            'search_locations': {
                'local': 'C:\\ClickA Documents (클라이언트에서 검색)',
                's3': f"clickabbbucket/{', '.join(['kobaco_data_md/', 'kobaco_data/', 'uploads/'])}"
            },
            'hybrid_search': True  # 하이브리드 검색임을 표시
        }
        
    except Exception as e:
        print(f"[HybridDocumentSearchTool] 검색 중 오류: {e}")
        return {
            'found_documents': [],
            'total_found': 0,
            'search_query': query,
            'error': str(e),
            'hybrid_search': True
        }
