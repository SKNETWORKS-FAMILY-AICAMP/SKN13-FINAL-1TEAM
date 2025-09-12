# DocumentSelectionAgent.py

import os
import re
import json
import boto3
from typing import Dict, Any, List, Optional
from pathlib import Path
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, BaseMessage

from ..core.AgentState import AgentState, AgentStateHelper, AgentType, WorkflowStep

load_dotenv()

class DocumentSelectionAgent:
    """
    문서 선택 처리 에이전트
    사용자가 3개 선택지 중 하나를 선택했을 때, 해당 문서를 로드하여 문서편집창으로 전송
    """
    
    def __init__(self):
        """에이전트 초기화"""
        self.llm = ChatOpenAI(model_name='gpt-4o', temperature=0)
        
        # S3 클라이언트 초기화
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
            print(f"[DocumentSelectionAgent] S3 클라이언트 초기화 완료: {self.bucket_name}")
        except Exception as e:
            print(f"[DocumentSelectionAgent] S3 초기화 실패: {e}")
            self.s3_client = None
        
        print("--- DocumentSelectionAgent initialized ---")
    
    def process(self, state: AgentState) -> Dict[str, Any]:
        """
        문서 선택 프로세스 실행
        1. 사용자 선택 번호 추출
        2. 이전 검색 결과에서 선택된 문서 찾기
        3. 문서 내용 로드
        4. IPC를 통해 문서편집창으로 전송
        """
        print("--- DocumentSelectionAgent: Starting document selection process ---")
        
        try:
            # 1. 사용자 메시지에서 선택 번호 추출
            user_message = AgentStateHelper.get_last_user_message(state)
            if not user_message:
                return self._handle_error(state, "사용자 메시지를 찾을 수 없습니다.")
            
            user_text = user_message.content if hasattr(user_message, 'content') else str(user_message)
            selection_number = self._extract_selection_number(user_text)
            
            if selection_number is None:
                return self._handle_error(state, "선택 번호를 찾을 수 없습니다. 1, 2, 3 중 하나를 말씀해주세요.")
            
            # 2. 이전 검색 결과에서 문서 옵션 가져오기
            document_options = self._get_document_options_from_state(state)
            if not document_options:
                return self._handle_error(state, "이전 검색 결과를 찾을 수 없습니다. 다시 문서를 검색해주세요.")
            
            # 3. 선택된 문서 가져오기
            if selection_number > len(document_options):
                return self._handle_error(state, f"잘못된 선택입니다. 1부터 {len(document_options)} 사이의 번호를 선택해주세요.")
            
            selected_document = document_options[selection_number - 1]  # 0-indexed
            print(f"[DocumentSelectionAgent] 선택된 문서: {selected_document.get('filename')}")
            
            # 4. 문서 내용 로드
            document_content = self._load_document_content(selected_document)
            if document_content is None:
                return self._handle_error(state, f"문서 '{selected_document.get('filename')}'를 로드할 수 없습니다.")
            
            # 5. 문서편집창으로 전송 데이터 준비
            document_data = {
                'filename': selected_document.get('filename', '문서'),
                'content': document_content,
                'filePath': selected_document.get('path', ''),
                'source': selected_document.get('source', 'unknown')
            }
            
            # 6. 상태에 문서 데이터 저장 (chat_routes.py에서 IPC 전송)
            state['selected_document'] = document_data
            state['send_to_editor'] = True  # 문서편집창 전송 플래그
            
            # 7. 성공 메시지 생성
            success_message = f"✅ **{selected_document.get('filename')}** 문서를 문서편집창에서 열었습니다!\n\n" \
                            f"📂 출처: {selected_document.get('location', '알 수 없음')}\n" \
                            f"📝 이제 문서편집창에서 내용을 확인하고 편집할 수 있습니다."
            
            # 8. 워크플로우 결과 저장
            AgentStateHelper.add_workflow_result(
                state,
                AgentType.DOCUMENT_SEARCH,  # 문서 검색 관련 결과로 분류
                success=True,
                data={
                    'selected_document': document_data,
                    'selection_number': selection_number
                }
            )
            
            # 9. 워크플로우 완료
            AgentStateHelper.set_workflow_step(state, WorkflowStep.WORKFLOW_COMPLETED)
            
            print(f"--- DocumentSelectionAgent: Document selection completed successfully ---")
            
            return {
                "messages": state.get("messages", []) + [BaseMessage(content=success_message, type="ai")],
                "generation": success_message,
                "workflow_step": WorkflowStep.WORKFLOW_COMPLETED,
                "workflow_complete": True,
                "selected_document": document_data,
                "send_to_editor": True
            }
            
        except Exception as e:
            print(f"--- DocumentSelectionAgent error: {str(e)} ---")
            return self._handle_error(state, f"문서 선택 처리 중 오류가 발생했습니다: {str(e)}")
    
    def _extract_selection_number(self, text: str) -> Optional[int]:
        """텍스트에서 선택 번호 추출 (1, 2, 3)"""
        if not text:
            return None
        
        # 숫자 패턴 찾기
        patterns = [
            r'(\d+)번',  # "1번", "2번"
            r'(\d+)\s*번째',  # "1번째", "2 번째"
            r'^(\d+)$',  # "1", "2", "3"
            r'번호\s*(\d+)',  # "번호 1", "번호1"
            r'(\d+)\s*선택',  # "1 선택", "2선택"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text.strip())
            if match:
                number = int(match.group(1))
                if 1 <= number <= 3:  # 유효한 선택지 범위
                    return number
        
        # 한글 숫자 처리
        korean_numbers = {'하나': 1, '첫': 1, '첫번째': 1, '둘': 2, '두': 2, '둘째': 2, '두번째': 2, '셋': 3, '세': 3, '세번째': 3, '셋째': 3}
        text_lower = text.lower().strip()
        for korean, number in korean_numbers.items():
            if korean in text_lower:
                return number
        
        return None
    
    def _get_document_options_from_state(self, state: AgentState) -> Optional[List[Dict[str, Any]]]:
        """상태에서 이전 검색 결과의 문서 옵션 가져오기"""
        try:
            # 워크플로우 결과에서 찾기
            workflow_results = state.get('workflow_results', {})
            document_search_results = workflow_results.get('document_search', {})
            
            if 'data' in document_search_results:
                data = document_search_results['data']
                if 'document_options' in data:
                    return data['document_options']
                elif 'found_documents' in data:
                    return data['found_documents']
            
            # 메시지에서 직접 찾기 (백업 방법)
            messages = state.get('messages', [])
            for message in reversed(messages):  # 최근 메시지부터
                if hasattr(message, 'type') and message.type == 'ai':
                    # AI 메시지에서 document_options 찾기 시도
                    pass
            
            return None
            
        except Exception as e:
            print(f"[DocumentSelectionAgent] 문서 옵션 가져오기 실패: {e}")
            return None
    
    def _load_document_content(self, document: Dict[str, Any]) -> Optional[str]:
        """문서 내용 로드 (로컬 또는 S3)"""
        try:
            source = document.get('source', '')
            filepath = document.get('path', '')
            filename = document.get('filename', '')
            
            print(f"[DocumentSelectionAgent] 문서 로드 시도: {filename} ({source})")
            
            if source == 'local':
                # 로컬 파일 읽기
                return self._load_local_document(filepath)
            elif source == 's3':
                # S3 파일 읽기
                return self._load_s3_document(filepath)
            else:
                print(f"[DocumentSelectionAgent] 알 수 없는 소스: {source}")
                return None
                
        except Exception as e:
            print(f"[DocumentSelectionAgent] 문서 로드 오류: {e}")
            return None
    
    def _load_local_document(self, filepath: str) -> Optional[str]:
        """로컬 문서 로드"""
        try:
            file_path = Path(filepath)
            if not file_path.exists():
                print(f"[DocumentSelectionAgent] 로컬 파일 없음: {filepath}")
                return None
            
            extension = file_path.suffix.lower()
            
            if extension in ['.md', '.txt', '.html']:
                # 텍스트 파일 직접 읽기
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                return content
            elif extension == '.docx':
                # DOCX 파일 처리
                try:
                    from docx import Document as DocxDocument
                    doc = DocxDocument(file_path)
                    content = '\n'.join([paragraph.text for paragraph in doc.paragraphs])
                    return content
                except ImportError:
                    print("[DocumentSelectionAgent] python-docx 라이브러리가 설치되지 않음")
                    return None
            else:
                print(f"[DocumentSelectionAgent] 지원하지 않는 파일 형식: {extension}")
                return None
                
        except Exception as e:
            print(f"[DocumentSelectionAgent] 로컬 파일 읽기 오류: {e}")
            return None
    
    def _load_s3_document(self, s3_key: str) -> Optional[str]:
        """S3 문서 로드"""
        if not self.s3_client:
            print("[DocumentSelectionAgent] S3 클라이언트 없음")
            return None
        
        try:
            print(f"[DocumentSelectionAgent] S3 파일 다운로드: {s3_key}")
            
            response = self.s3_client.get_object(Bucket=self.bucket_name, Key=s3_key)
            content = response['Body'].read().decode('utf-8')
            
            print(f"[DocumentSelectionAgent] S3 파일 로드 성공: {len(content)} 문자")
            return content
            
        except Exception as e:
            print(f"[DocumentSelectionAgent] S3 파일 읽기 오류: {e}")
            return None
    
    def _handle_error(self, state: AgentState, error_message: str) -> Dict[str, Any]:
        """에러 처리"""
        AgentStateHelper.set_workflow_error(state, error_message)
        
        error_response = f"❌ {error_message}\n\n" \
                        "다시 시도하시려면 문서를 검색한 후 올바른 번호(1, 2, 3)를 선택해주세요."
        
        return {
            "messages": state.get("messages", []) + [BaseMessage(content=error_response, type="ai")],
            "generation": error_response,
            "workflow_error": error_message,
            "workflow_step": WorkflowStep.ERROR,
            "workflow_complete": True
        }

# Legacy support
def document_selection_agent():
    """문서 선택 에이전트 팩토리 함수"""
    agent = DocumentSelectionAgent()
    
    def wrapper(state: AgentState) -> Dict[str, Any]:
        return agent.process(state)
    
    return wrapper