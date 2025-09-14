# DocumentSearchAgent.py

import json
import re
from typing import Dict, Any, List
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, BaseMessage

from ..core.AgentState import AgentState, AgentStateHelper, AgentType, WorkflowStep
from ..tools.retriever_tool import RAG_search_tool
from ..tools.local_document_search_tool import local_document_search_tool, HybridDocumentSearcher
from ..tools.hybrid_document_search_tool import hybrid_document_search_tool
from ..tools.enhanced_hybrid_search_tool import enhanced_hybrid_search_tool
from ..tools.agent_logic import AgentTools
from ..prompts.DocumentSearchSystemPrompt import get_document_search_system_prompt

load_dotenv()


class DocumentSearchAgent:
    """
    전문 문서 검색 에이전트
    RAG 검색, 쿼리 확장, 결과 요약 등 문서 검색 관련 전문 기능 제공
    """
    
    def __init__(self):
        """문서 검색 전용 도구들과 LLM 초기화"""
        self.llm = ChatOpenAI(model_name='gpt-4o', temperature=0)
        self.tool_executor = AgentTools(llm=self.llm)
        
        # 문서 검색 전용 도구들
        self.tools = [
            RAG_search_tool,  # 벡터 DB 검색 (s3_path 메타데이터 포함, 우선순위)
            enhanced_hybrid_search_tool,  # 개선된 하이브리드 검색 도구  
            local_document_search_tool,  # 기존 로컬 문서 검색 도구
            hybrid_document_search_tool,  # 기존 하이브리드 검색 도구
            self.tool_executor.expand_query_tool,
            self.tool_executor.route_query_tool,
            self.tool_executor.handle_follow_up_tool,
            self.tool_executor.summarize_tool,
            self.tool_executor.get_presigned_download_url
        ]
        
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        
        print("--- DocumentSearchAgent initialized ---")
    
    def process(self, state: AgentState) -> Dict[str, Any]:
        """
        문서 검색 프로세스 실행
        1. 사용자 쿼리 분석
        2. 검색 실행
        3. 결과 처리 및 상태 업데이트
        """
        print("--- DocumentSearchAgent: Starting document search process ---")
        
        try:
            # 1. 사용자 쿼리 추출 및 저장
            user_query = AgentStateHelper.get_last_user_message(state)
            if not user_query:
                return self._handle_error(state, "No user query found")
            
            AgentStateHelper.add_agent_data(
                state, 
                AgentType.DOCUMENT_SEARCH, 
                "original_query", 
                user_query
            )
            
            # 2. 시스템 프롬프트와 메시지 준비
            messages = self._prepare_messages(state)
            
            # 3. LLM 호출 (도구 사용 포함)
            response = self.llm_with_tools.invoke(messages)
            
            # 4. 도구 호출 처리
            search_results = {}
            if hasattr(response, 'tool_calls') and response.tool_calls:
                messages.append(response)  # Add AI message with tool calls
                for tool_call in response.tool_calls:
                    tool_name = tool_call.get("name")
                    tool_args = tool_call.get("args")
                    
                    print(f"\n>> [SEARCH AGENT] Calling Tool: {tool_name}\n   Args: {tool_args}\n")
                    
                    # Find and execute the tool
                    tool_function = None
                    for tool in self.tools:
                        if hasattr(tool, 'name') and tool.name == tool_name:
                            tool_function = tool
                            break
                    
                    if tool_function:
                        try:
                            # 도구 실행 및 결과 저장
                            result = tool_function.invoke(tool_args)
                            
                            # 하이브리드 검색 도구들 특별 처리 (enhanced와 기본 hybrid 모두)
                            if tool_name in ["enhanced_hybrid_search_tool", "hybrid_document_search_tool"]:
                                documents = result.get('found_documents', [])
                                print(f"🔍 [DEBUG] {tool_name} 결과: {len(documents)}개 문서 발견")
                                if documents:
                                    print(f"🔍 [DEBUG] 사용자 쿼리: '{user_query}'")
                                    
                                    # 문서 초안 생성 요청인지 먼저 확인
                                    should_create_draft = self._should_create_document_draft(user_query)
                                    print(f"🔍 [DEBUG] 문서 초안 생성 요청 감지: {should_create_draft}")

                                    if should_create_draft:
                                        # 여러 문서를 참고해서 새로운 초안 생성
                                        print(f"🔍 [DEBUG] {len(documents)}개 문서를 참고하여 초안 생성 시작...")
                                        draft_result = self._create_document_draft(documents, user_query)
                                        print(f"🔍 [DEBUG] 초안 생성 결과: {draft_result}")
                                        search_results.update(draft_result)
                                    else:
                                        # "편집창에 띄워줘" 요청인지 확인
                                        should_auto_open = self._should_auto_open_editor(user_query)
                                        print(f"🔍 [DEBUG] 편집창 자동 열기 요청 감지: {should_auto_open}")

                                        if should_auto_open:
                                            # 종합 보고서 요청인지 확인
                                            should_synthesize = self._should_synthesize_documents(user_query)
                                            print(f"🔍 [DEBUG] 종합 보고서 요청 감지: {should_synthesize}")
                                            
                                            if should_synthesize and len(documents) > 1:
                                                # 여러 문서를 종합한 보고서 생성
                                                print(f"🔍 [DEBUG] {len(documents)}개 문서를 종합한 보고서 생성 시도...")
                                                synthesis_result = self._synthesize_documents_to_report(documents, user_query)
                                                print(f"🔍 [DEBUG] 종합 보고서 생성 결과: {synthesis_result}")
                                                search_results.update(synthesis_result)
                                            else:
                                                # 첫 번째 문서를 자동으로 편집창에 열기
                                                first_doc = documents[0]
                                                print(f"🔍 [DEBUG] 첫 번째 문서: {first_doc.get('filename', 'Unknown')}")

                                                is_supported = self._is_editor_supported_file(first_doc)
                                                print(f"🔍 [DEBUG] 편집창 지원 파일 여부: {is_supported}")

                                                auto_result = {"auto_open_success": False}  # 기본값 설정
                                                
                                                if is_supported:
                                                    print(f"🔍 [DEBUG] 자동으로 편집창에 문서 열기 시도...")
                                                    auto_result = self._auto_open_document_in_editor(first_doc, user_query)
                                                    print(f"🔍 [DEBUG] 자동 열기 결과: {auto_result}")
                                                    search_results.update(auto_result)

                                                    # 자동 열기 실패한 경우에만 버튼 표시 로직 진행
                                                    if not auto_result.get("auto_open_success", False):
                                                        print(f"🔍 [DEBUG] 자동 열기 실패 - 다운로드 버튼 표시")
                                                        # 편집창 지원하지만 자동 열기 실패한 경우 다운로드 버튼 표시
                                                        document_selection_data = self._create_document_selection_data(documents, result.get('search_query', ''))
                                                        search_results["document_selection"] = document_selection_data["selection_data"]
                                                        search_results["action"] = "show_document_buttons"
                                                        search_results["search_summary"] = f"문서 로드에 실패했습니다. 아래 버튼을 클릭해 주세요."
                                                    else:
                                                        print(f"🔍 [DEBUG] 자동 열기 성공 - 버튼 표시 생략")
                                                else:
                                                    print(f"🔍 [DEBUG] 지원하지 않는 파일 - 다운로드 버튼 표시")
                                                    # 편집창 지원하지 않는 파일이면 다운로드 버튼 표시
                                                    document_selection_data = self._create_document_selection_data(documents, result.get('search_query', ''))
                                                    search_results["document_selection"] = document_selection_data["selection_data"]
                                                    search_results["action"] = "show_document_buttons"
                                                    search_results["search_summary"] = f"편집창에서 지원하지 않는 파일입니다. 다운로드하여 확인해주세요."
                                        else:
                                            print(f"🔍 [DEBUG] 일반 검색 요청 - 문서 버튼 표시")
                                            # 일반 검색 요청 - 문서 버튼 표시
                                            document_selection_data = self._create_document_selection_data(documents, result.get('search_query', ''))
                                            search_results["document_selection"] = document_selection_data["selection_data"]
                                            search_results["action"] = "show_document_buttons"
                                            search_results["search_summary"] = f"{len(documents)}개의 관련 문서를 찾았습니다."
                            
                            # 다운로드 링크 도구 특별 처리 - 다운로드 버튼 생성
                            elif tool_name == "get_presigned_download_url":
                                download_url = result.get("downloadUrl")
                                if download_url:
                                    # 파일명 추출 (file_key에서)
                                    file_key = tool_args.get("file_key", "")
                                    filename = file_key.split("/")[-1] if "/" in file_key else file_key
                                    
                                    # 다운로드 버튼 데이터 생성
                                    download_button = {
                                        "id": f"download_{filename}",
                                        "filename": filename,
                                        "action_type": "download",
                                        "download_url": download_url,
                                        "document_data": {
                                            "filename": filename,
                                            "source": "s3",
                                            "path": file_key
                                        }
                                    }
                                    
                                    search_results["document_selection"] = {
                                        "documents": [download_button],
                                        "query": f"{filename} 다운로드"
                                    }
                                    search_results["action"] = "show_document_buttons"
                                    search_results["download_message"] = "다운로드 버튼을 아래에서 확인하세요."

                            search_results.update(result if isinstance(result, dict) else {"result": result})
                            
                            print(f">> [SEARCH AGENT] Tool '{tool_name}' executed successfully\n")
                            
                            # Add ToolMessage for the graph
                            from langchain_core.messages import ToolMessage
                            messages.append(ToolMessage(content=str(result), tool_call_id=tool_call['id']))
                            
                        except Exception as e:
                            error_msg = f"Error executing tool '{tool_name}': {e}"
                            print(f">> [SEARCH AGENT] {error_msg}")
                            from langchain_core.messages import ToolMessage
                            messages.append(ToolMessage(content=error_msg, tool_call_id=tool_call['id']))
                    else:
                        print(f">> [SEARCH AGENT] Warning: Tool '{tool_name}' not found.")
            else:
                # LLM didn't use tools, add the response message
                messages.append(response)
                search_results = self._extract_search_results(response)
            
            # After tool execution, always generate final response for the user
            if hasattr(response, 'tool_calls') and response.tool_calls:
                print(">> [SEARCH AGENT] Generating final user response after tool execution")
                
                try:
                    # Create a prompt for final response generation
                    from langchain_core.messages import HumanMessage
                    final_prompt = HumanMessage(content="이제 검색 결과를 바탕으로 사용자에게 도움이 되는 답변을 생성해주세요. 검색된 문서들의 내용을 요약하고 사용자의 질문에 답해주세요.")
                    messages.append(final_prompt)
                    
                    # Generate final response - use invoke without tools to get pure text response
                    final_llm = ChatOpenAI(model_name='gpt-4o', temperature=0)
                    final_response = final_llm.invoke(messages)
                    messages.append(final_response)
                    
                    print(f">> [SEARCH AGENT] Final response generated: {final_response.content[:100]}...")
                    
                    # Ensure the final response content is captured for streaming
                    if hasattr(final_response, 'content') and final_response.content:
                        search_results["final_answer"] = final_response.content
                    
                except Exception as e:
                    print(f">> [SEARCH AGENT] Error generating final response: {e}")
                    # Fallback: create a simple response
                    from langchain_core.messages import AIMessage
                    fallback_response = AIMessage(content="검색이 완료되었습니다. 검색 결과를 확인해주세요.")
                    messages.append(fallback_response)
            
            # 5. 워크플로우 결과 저장
            AgentStateHelper.add_workflow_result(
                state,
                AgentType.DOCUMENT_SEARCH,
                success=bool(search_results),
                data=search_results
            )

            # 6. 워크플로우 단계 업데이트
            AgentStateHelper.set_workflow_step(state, WorkflowStep.SEARCH_COMPLETED)

            print(f"--- DocumentSearchAgent: Search completed successfully ---")

            # search_results에 action과 document_selection이 있으면 반환에 포함
            result = {
                "messages": messages,
                "workflow_step": WorkflowStep.SEARCH_COMPLETED
            }

            # 에디터 자동 열기 데이터가 있으면 우선적으로 처리
            if search_results.get("send_to_editor", False):
                result["send_to_editor"] = search_results["send_to_editor"]
                result["selected_document"] = search_results.get("selected_document")
                result["workflow_complete"] = True  # 자동 열기 성공 시 워크플로 완료
                if search_results.get("search_summary"):
                    result["final_answer"] = search_results["search_summary"]
                print(f"📄 [DocumentSearchAgent] 에디터 자동 열기 데이터 설정됨: {search_results.get('selected_document', {}).get('filename', 'Unknown')}")
            elif search_results.get("action") == "show_document_buttons":
                result["action"] = search_results["action"]
                result["document_selection"] = search_results["document_selection"]
                if search_results.get("final_answer"):
                    result["final_answer"] = search_results["final_answer"]
                print(f"📋 [DocumentSearchAgent] 다운로드 버튼 데이터 생성됨: {search_results['document_selection']}")

            return result
            
        except Exception as e:
            print(f"--- DocumentSearchAgent error: {str(e)} ---")
            return self._handle_error(state, f"Search failed: {str(e)}")
    
    def _prepare_messages(self, state: AgentState) -> List[BaseMessage]:
        """시스템 프롬프트와 메시지 준비"""
        messages = list(state.get("messages", []))
        
        # 시스템 메시지가 없으면 추가
        if not any(isinstance(msg, SystemMessage) for msg in messages):
            system_prompt_content = get_document_search_system_prompt()
            messages.insert(0, SystemMessage(content=system_prompt_content))
        
        return messages
    
    def _extract_search_results(self, response: Any) -> Dict[str, Any]:
        """LLM 응답에서 검색 결과 추출"""
        results = {}
        
        # 도구 호출 결과 확인
        if hasattr(response, 'tool_calls') and response.tool_calls:
            results["tool_calls"] = [
                {
                    "name": tc.get("name", "unknown"),
                    "args": tc.get("args", {}),
                    "id": tc.get("id", "")
                }
                for tc in response.tool_calls
            ]
            results["has_tool_calls"] = True
        else:
            results["has_tool_calls"] = False
        
        # 응답 내용 저장
        if hasattr(response, 'content'):
            results["response_content"] = response.content
        
        return results
    
    def _create_document_selection_response(self, documents: List[Dict[str, Any]], query: str) -> str:
        """
        검색된 문서들로부터 클릭 가능한 3개 선택지 응답 생성
        """
        if not documents:
            return f"'{query}'와 관련된 문서를 찾지 못했습니다."
        
        # 최대 3개까지만 표시
        top_documents = documents[:3]
        
        response_parts = [
            f"'{query}'와 관련된 문서를 찾았습니다! 원하시는 문서를 클릭해주세요:\n"
        ]
        
        # JSON 형태로 클릭 가능한 버튼 데이터 생성
        button_data = {
            "type": "document_selection",
            "query": query,
            "documents": []
        }
        
        for i, doc in enumerate(top_documents, 1):
            filename = doc.get('filename', '알 수 없는 파일')
            source = doc.get('source', '알 수 없음')
            location = doc.get('location', '')
            score = doc.get('total_score', 0)
            
            # 소스 아이콘
            source_icon = "📂" if source == 'local' else "☁️"
            score_percentage = int(score * 100) if score else 0
            
            # 클릭 가능한 버튼용 문서 데이터
            doc_data = {
                "id": i,
                "filename": filename,
                "path": doc.get('path', ''),
                "source": source,
                "location": location,
                "score": score_percentage,
                "icon": source_icon,
                "full_data": doc  # 전체 문서 데이터
            }
            
            button_data["documents"].append(doc_data)
            
            # 텍스트 표시용
            response_parts.append(
                f"🔘 **{filename}** {source_icon}\n"
                f"   📍 {location}\n"
                f"   🎯 관련도: {score_percentage}%\n"
            )
        
        response_parts.append("\n💡 위 문서 중 하나를 클릭하면 문서편집창에서 바로 열립니다!")
        
        # 응답에 버튼 데이터를 JSON으로 포함
        text_response = "\n".join(response_parts)
        
        return f"{text_response}\n\n```json\n{json.dumps(button_data, ensure_ascii=False, indent=2)}\n```"
    
    def _create_document_selection_data(self, documents: List[Dict[str, Any]], query: str) -> Dict[str, Any]:
        """
        클릭 가능한 문서 선택지 데이터 생성 (프론트엔드 최적화)
        """
        if not documents:
            return {
                "text_response": f"'{query}'와 관련된 문서를 찾지 못했습니다.",
                "selection_data": None
            }
        
        # 최대 3개까지만 표시
        top_documents = documents[:3]
        
        # 텍스트 응답 생성
        text_response = f"'{query}'와 관련된 문서를 {len(top_documents)}개 찾았습니다! 원하시는 문서를 클릭해주세요:"
        
        # 구조화된 선택 데이터
        selection_data = {
            "type": "document_selection",
            "query": query,
            "total_found": len(top_documents),
            "documents": []
        }
        
        for i, doc in enumerate(top_documents, 1):
            filename = doc.get('filename', '알 수 없는 파일')
            source = doc.get('source', '알 수 없음')
            location = doc.get('location', '')
            score = doc.get('total_score', 0)
            
            # 소스 아이콘과 설명
            if source == 'local':
                source_icon = "📂"
                source_desc = "로컬 파일"
            else:
                source_icon = "☁️"
                source_desc = "클라우드 파일"
            
            score_percentage = int(score * 100) if score else 0
            
            # 클릭 가능한 버튼용 문서 데이터
            doc_data = {
                "id": f"doc_{i}",
                "filename": filename,
                "path": doc.get('path', ''),
                "source": source,
                "source_desc": source_desc,
                "location": location,
                "score": score_percentage,
                "icon": source_icon,
                "display_name": f"{source_icon} {filename}",
                "subtitle": f"{location} (관련도: {score_percentage}%)",
                # 문서 로드에 필요한 전체 데이터
                "document_data": doc
            }
            
            selection_data["documents"].append(doc_data)
        
        return {
            "text_response": text_response,
            "selection_data": selection_data
        }
    
    def _handle_error(self, state: AgentState, error_message: str) -> Dict[str, Any]:
        """에러 처리 및 상태 업데이트"""
        AgentStateHelper.set_workflow_error(state, error_message)
        
        AgentStateHelper.add_workflow_result(
            state,
            AgentType.DOCUMENT_SEARCH,
            success=False,
            data={},
            error=error_message
        )
        
        return {
            "workflow_error": error_message,
            "workflow_step": WorkflowStep.ERROR
        }
    
    def get_available_tools(self) -> List[str]:
        """사용 가능한 도구 목록 반환"""
        return [tool.name for tool in self.tools]
    
    def _should_create_document_draft(self, user_query: str) -> bool:
        """사용자 쿼리에서 문서 초안 생성 요청인지 확인"""
        print(f"=== [DEBUG] 문서 초안 생성 요청 확인 ===")
        print(f"🔍 [DEBUG] _should_create_document_draft 호출됨. 쿼리: '{user_query}'")

        draft_patterns = [
            r'.*(토대로|참고.*해서|기반.*으로).*(만들|작성|생성).*',
            r'.*(년|연도).*용.*문서.*(만들|작성|생성).*',
            r'.*(초안|draft).*(만들|작성|생성).*',
            r'.*([0-9]{4}년.*){2,}.*(토대|참고|기반).*',  # 여러 연도 언급
            r'.*(이전.*년도|과거.*문서).*(참고|토대).*'
        ]

        print(f"🔍 [DEBUG] 총 {len(draft_patterns)}개의 패턴으로 검사 시작...")

        for i, pattern in enumerate(draft_patterns):
            match = re.search(pattern, user_query, re.IGNORECASE)
            print(f"🔍 [DEBUG] 초안생성 패턴 {i+1}: {pattern}")
            print(f"🔍 [DEBUG] -> 매치 결과: {bool(match)}")
            if match:
                print(f"🔍 [DEBUG] -> 매치된 부분: '{match.group()}'")
                print(f"✅ [DEBUG] 문서 초안 생성 요청으로 판단됨!")
                print(f"=== [DEBUG] 문서 초안 생성 요청 확인 완료 ===")
                return True

        print(f"❌ [DEBUG] 문서 초안 생성 패턴 매치 실패")
        print(f"=== [DEBUG] 문서 초안 생성 요청 확인 완료 ===")
        return False

    def _should_auto_open_editor(self, user_query: str) -> bool:
        """사용자 쿼리에서 편집창 자동 열기 요청인지 확인"""
        import re
        print(f"🔍 [DEBUG] _should_auto_open_editor 호출됨. 쿼리: '{user_query}'")
        
        editor_patterns = [
            r'.*(문서편집창|편집창|에디터).*(띄워|열어|보여).*줘',
            r'.*(편집창|에디터).*(띄워|열어|오픈).*',
            r'.*편집창.*에.*띄워.*',
            r'.*편집창.*에서.*열.*'
        ]
        
        for i, pattern in enumerate(editor_patterns):
            match = re.search(pattern, user_query, re.IGNORECASE)
            print(f"🔍 [DEBUG] 패턴 {i+1}: {pattern} -> 매치: {bool(match)}")
            if match:
                print(f"🔍 [DEBUG] 매치된 부분: '{match.group()}'")
                return True
        
        print(f"🔍 [DEBUG] 편집창 패턴 매치 실패")
        return False
    
    def _is_editor_supported_file(self, document: Dict[str, Any]) -> bool:
        """문서편집창에서 지원하는 파일 형식인지 확인"""
        filename = document.get('filename', '')
        supported_extensions = ['.md', '.txt', '.html', '.docx']
        
        for ext in supported_extensions:
            if filename.lower().endswith(ext):
                return True
        return False
    
    def _create_document_draft(self, documents: List[Dict[str, Any]], user_query: str) -> Dict[str, Any]:
        """여러 문서를 참고해서 새로운 문서 초안 생성"""
        import boto3
        import os
        from botocore.config import Config
        from openai import OpenAI

        try:
            print(f"=== [DRAFT] 문서 초안 생성 프로세스 시작 ===")
            print(f"📝 [DocumentSearchAgent] 문서 초안 생성 시작: {len(documents)}개 문서 참고")
            print(f"📝 [DEBUG] 사용자 쿼리: '{user_query}'")

            for i, doc in enumerate(documents):
                print(f"📄 [DEBUG] 참고 문서 {i+1}: {doc.get('filename', 'Unknown')} (path: {doc.get('path', 'Unknown')})")

            # S3 클라이언트 설정
            config = Config(
                region_name=os.getenv('AWS_REGION', 'ap-northeast-2'),
                retries={'max_attempts': 3, 'mode': 'standard'},
                s3={'addressing_style': 'virtual'}
            )

            s3_client = boto3.client(
                's3',
                aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
                region_name=os.getenv('AWS_REGION', 'ap-northeast-2'),
                config=config
            )

            bucket_name = os.getenv('AWS_S3_BUCKET', 'clickabbbucket')

            # 참고 문서들의 내용 로드
            reference_documents = []
            for i, doc in enumerate(documents[:5]):  # 최대 5개 문서만 참고
                try:
                    s3_key = doc.get('path', '')
                    filename = doc.get('filename', f'문서{i+1}')

                    print(f"📄 [DocumentSearchAgent] 참고 문서 {i+1} 로드: {filename}")
                    response = s3_client.get_object(Bucket=bucket_name, Key=s3_key)
                    content = response['Body'].read().decode('utf-8')

                    reference_documents.append({
                        'filename': filename,
                        'content': content[:10000],  # 최대 10,000자만 참고
                        'year': self._extract_year_from_filename(filename)
                    })

                except Exception as e:
                    print(f"❌ [DocumentSearchAgent] 참고 문서 로드 실패 {filename}: {e}")
                    continue

            if not reference_documents:
                return {
                    "action": "show_message",
                    "message": "참고할 문서들을 로드할 수 없어 초안을 생성할 수 없습니다."
                }

            # OpenAI 클라이언트로 초안 생성
            openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

            # 새 문서의 연도 추출 (사용자 쿼리에서)
            target_year = self._extract_target_year_from_query(user_query)

            # 프롬프트 생성
            prompt = self._create_draft_generation_prompt(reference_documents, user_query, target_year)

            print(f"📝 [DocumentSearchAgent] AI로 초안 생성 중... (참고문서: {len(reference_documents)}개)")

            # AI로 초안 생성
            response = openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "당신은 한국방송광고진흥공사의 전문 문서 작성자입니다. 이전 연도의 문서들을 참고하여 새로운 연도의 문서 초안을 정확하고 전문적으로 작성해주세요."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=4000
            )

            draft_content = response.choices[0].message.content
            print(f"📝 [DEBUG] OpenAI 응답 길이: {len(draft_content)} 문자")
            print(f"📝 [DEBUG] OpenAI 응답 첫 200자: {draft_content[:200]}...")

            # HTML 형식으로 변환
            draft_html = self._convert_text_to_html(draft_content)
            print(f"📝 [DEBUG] HTML 변환 완료: {len(draft_html)} 문자")

            # 새 문서의 파일명 생성
            draft_filename = self._generate_draft_filename(reference_documents, target_year)
            print(f"📝 [DEBUG] 생성된 파일명: {draft_filename}")

            print(f"📝 [DocumentSearchAgent] 초안 생성 완료: {len(draft_content)} 문자")

            # 편집창에 전송할 문서 데이터 준비
            document_for_editor = {
                "filename": draft_filename,
                "content": draft_html,
                "filePath": f"draft/{draft_filename}",
                "source": "generated"
            }

            print(f"📝 [DEBUG] 편집창 전송용 문서 데이터:")
            print(f"  - filename: {document_for_editor['filename']}")
            print(f"  - content 길이: {len(document_for_editor['content'])}")
            print(f"  - filePath: {document_for_editor['filePath']}")
            print(f"  - source: {document_for_editor['source']}")

            result = {
                "action": "open_document_in_editor",
                "document": document_for_editor,
                "message": f"📝 {draft_filename} 초안이 생성되었습니다. ({len(reference_documents)}개 문서 참고)"
            }

            print(f"📝 [DEBUG] 반환할 result:")
            print(f"  - action: {result['action']}")
            print(f"  - message: {result['message']}")
            print(f"=== [DRAFT] 문서 초안 생성 프로세스 완료 ===")

            return result

        except Exception as e:
            print(f"❌ [DocumentSearchAgent] 문서 초안 생성 실패: {e}")
            import traceback
            traceback.print_exc()

            return {
                "action": "show_message",
                "message": f"문서 초안 생성 중 오류가 발생했습니다: {str(e)}"
            }

    def _extract_year_from_filename(self, filename: str) -> str:
        """파일명에서 연도를 추출 (예: '2024년' 또는 '2024' 형태)"""
        import re

        # 2024년 형태 또는 _2024 형태 또는 공고문_2024년 형태 매칭
        year_patterns = [
            r'(\d{4})년',  # 2024년
            r'_(\d{4})년', # _2024년
            r'(\d{4})',    # 2024
            r'공고문_(\d{4})년'  # 공고문_2024년
        ]

        for pattern in year_patterns:
            match = re.search(pattern, filename)
            if match:
                return match.group(1)

        return "알 수 없음"

    def _extract_target_year_from_query(self, user_query: str) -> str:
        """사용자 쿼리에서 목표 연도 추출 (예: '2025년용', '2025년'"""
        import re

        # 2025년용, 2025년, 2025 형태 매칭
        target_patterns = [
            r'(\d{4})년용',  # 2025년용
            r'(\d{4})년',    # 2025년
            r'(\d{4})',      # 2025
        ]

        for pattern in target_patterns:
            match = re.search(pattern, user_query)
            if match:
                year = match.group(1)
                # 현재 연도보다 미래이거나 같은 연도만 반환
                import datetime
                current_year = datetime.datetime.now().year
                if int(year) >= current_year:
                    return year

        # 기본적으로 내년 반환
        import datetime
        return str(datetime.datetime.now().year + 1)

    def _create_draft_generation_prompt(self, reference_documents: List[Dict[str, Any]], user_query: str, target_year: str) -> str:
        """AI 문서 생성을 위한 프롬프트 생성"""

        # 참고 문서들의 정보 정리
        docs_info = []
        for i, doc in enumerate(reference_documents):
            year = doc.get('year', '알 수 없음')
            filename = doc.get('filename', f'문서{i+1}')
            content = doc.get('content', '')[:1000]  # 프롬프트용으로는 1000자만

            docs_info.append(f"""
참고문서 {i+1}: {filename} ({year}년)
내용 요약:
{content}
""")

        docs_text = "\n".join(docs_info)

        prompt = f"""
사용자 요청: {user_query}

아래 {len(reference_documents)}개의 참고 문서들을 기반으로 {target_year}년용 문서 초안을 작성해주세요.

{docs_text}

작성 지침:
1. 기존 문서들의 구조와 형식을 유지하되, {target_year}년에 맞게 내용을 업데이트
2. 연도, 기간, 일정 등은 {target_year}년 기준으로 수정
3. 기존 문서들의 주요 항목과 내용을 참고하되, 최신 트렌드나 변화사항을 반영
4. 한국어로 작성하고, 공식 문서의 어투와 형식을 유지
5. 문서 제목에는 반드시 '{target_year}년'을 포함

새로운 {target_year}년용 문서를 작성해주세요:
"""

        return prompt

    def _generate_draft_filename(self, reference_documents: List[Dict[str, Any]], target_year: str) -> str:
        """새 초안의 파일명 생성"""

        # 가장 최근 참고 문서의 파일명 패턴을 기반으로 생성
        if reference_documents:
            base_filename = reference_documents[0].get('filename', '')

            # 기존 연도를 새 연도로 교체
            import re

            # 연도 패턴들 찾아서 교체
            year_patterns = [
                (r'\d{4}년', f'{target_year}년'),
                (r'_\d{4}년', f'_{target_year}년'),
                (r'\d{4}', target_year)
            ]

            new_filename = base_filename
            for pattern, replacement in year_patterns:
                if re.search(pattern, new_filename):
                    new_filename = re.sub(pattern, replacement, new_filename)
                    break

            # 만약 연도 교체가 안 되었다면 기본 형태로
            if new_filename == base_filename:
                # 확장자 분리
                name_parts = base_filename.rsplit('.', 1)
                if len(name_parts) == 2:
                    name, ext = name_parts
                    new_filename = f"{name}_{target_year}년.{ext}"
                else:
                    new_filename = f"{base_filename}_{target_year}년"

            return new_filename

        # 참고 문서가 없는 경우 기본 파일명
        return f"초안_문서_{target_year}년.md"

    def _convert_text_to_html(self, text: str) -> str:
        """
        텍스트 파일의 줄바꿈을 HTML 형식으로 변환
        """
        if not text:
            return ""

        import html

        # HTML 특수문자 이스케이프
        escaped_text = html.escape(text)

        # 줄바꿈 문자들을 HTML로 변환
        # \r\n -> <br>, \n -> <br>, \r -> <br>
        html_content = escaped_text.replace('\r\n', '<br>').replace('\n', '<br>').replace('\r', '<br>')

        # 연속된 공백을 &nbsp;로 변환하여 들여쓰기 유지
        import re
        html_content = re.sub(r'  +', lambda m: '&nbsp;' * len(m.group()), html_content)

        # 전체를 <p> 태그로 감싸기
        return f"<p>{html_content}</p>"

    def _auto_open_document_in_editor(self, document: Dict[str, Any], user_query: str) -> Dict[str, Any]:
        """문서를 자동으로 편집창에 열기"""
        import asyncio
        import boto3
        import os
        from botocore.config import Config
        
        try:
            # S3에서 문서 내용 로드
            s3_key = document.get('path', '')
            filename = document.get('filename', '알 수 없는 파일')
            
            # S3 클라이언트 설정
            config = Config(
                region_name=os.getenv('AWS_REGION', 'ap-northeast-2'),
                retries={'max_attempts': 3, 'mode': 'standard'},
                s3={'addressing_style': 'virtual'}
            )
            
            s3_client = boto3.client(
                's3',
                aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
                region_name=os.getenv('AWS_REGION', 'ap-northeast-2'),
                config=config
            )
            
            bucket_name = os.getenv('AWS_S3_BUCKET', 'clickabbbucket')
            
            print(f"📄 [DocumentSearchAgent] S3에서 문서 자동 로드: {s3_key}")
            
            # S3에서 파일 내용 다운로드
            response = s3_client.get_object(Bucket=bucket_name, Key=s3_key)
            raw_content = response['Body'].read().decode('utf-8')

            # 파일 확장자에 따라 적절한 HTML로 변환
            file_extension = filename.lower().split('.')[-1] if '.' in filename else ''

            if file_extension == 'html':
                # HTML 파일은 그대로 사용 (이미 HTML 형식)
                content = raw_content
            elif file_extension == 'docx':
                # DOCX 파일은 이미 HTML로 변환되어 들어옴 (S3에 저장 시 변환됨)
                content = raw_content
            else:
                # 모든 텍스트 파일(.md, .txt, 기타)을 HTML로 변환
                content = self._convert_text_to_html(raw_content)

            print(f"📄 [DocumentSearchAgent] 문서 자동 로드 성공: {len(content)} 문자 (원본: {len(raw_content)} 문자)")
            
            # 편집창에 전송할 문서 데이터 준비
            document_for_editor = {
                "filename": filename,
                "content": content,
                "filePath": s3_key,
                "source": "s3"
            }
            
            # 상태 업데이트 - 편집창에 문서 전송 (프론트엔드에서 자동 처리)
            return {
                "send_to_editor": True,
                "selected_document": document_for_editor,
                "auto_open_success": True,
                "search_summary": f"✅ **{filename}** 문서를 편집창에서 열었습니다!"
            }
            
        except Exception as e:
            print(f"❌ [DocumentSearchAgent] 문서 자동 로드 실패: {e}")
            # 실패 시 일반 버튼 표시로 폴백
            return {
                "auto_open_success": False,
                "search_summary": f"문서 로드에 실패했습니다. 아래 버튼을 클릭해 주세요."
            }

    def _should_synthesize_documents(self, user_query: str) -> bool:
        """사용자 요청이 여러 문서 종합 요청인지 확인"""
        synthesis_keywords = [
            "종합", "종합한", "종합하여", "합쳐", "합친", "합쳐서",
            "통합", "통합한", "통합하여", "정리", "정리한", "정리하여",
            "요약", "요약한", "요약하여", "비교", "비교한", "비교하여",
            "분석", "분석한", "분석하여", "검토", "검토한", "검토하여",
            "보고서", "리포트", "문서", "자료"
        ]
        
        # 복합 패턴 확인
        user_query_lower = user_query.lower()
        
        # "A와 B를 종합한" 패턴
        if any(keyword in user_query_lower for keyword in ["종합", "합쳐", "통합", "정리"]):
            return True
            
        # "A, B 문서를 찾아서 보고서" 패턴
        if "보고서" in user_query_lower and any(keyword in user_query_lower for keyword in ["찾아", "찾아서"]):
            return True
            
        # 숫자 패턴 (1), 2) 등)
        if re.search(r'\d+\)', user_query) and ("문서" in user_query_lower or "기준" in user_query_lower):
            return True
            
        return False

    def _synthesize_documents_to_report(self, documents: List[Dict[str, Any]], user_query: str) -> Dict[str, Any]:
        """여러 문서를 종합하여 하나의 보고서로 생성"""
        try:
            print(f"📊 [DocumentSearchAgent] {len(documents)}개 문서 종합 보고서 생성 시작")
            
            # 각 문서의 내용 로드
            document_contents = []
            for i, doc in enumerate(documents, 1):
                print(f"📄 [DocumentSearchAgent] 문서 {i} 로드: {doc.get('filename', 'Unknown')}")
                content = self._load_document_content_for_synthesis(doc)
                if content:
                    document_contents.append({
                        'filename': doc.get('filename', f'문서{i}'),
                        'content': content,
                        'source': doc.get('source', 'unknown')
                    })
            
            if not document_contents:
                return {
                    "auto_open_success": False,
                    "search_summary": "문서 내용을 로드할 수 없어 종합 보고서를 생성할 수 없습니다."
                }
            
            # ChatGPT를 사용하여 종합 보고서 생성
            synthesis_prompt = self._create_synthesis_prompt(document_contents, user_query)
            
            print(f"🤖 [DocumentSearchAgent] GPT를 사용하여 종합 보고서 생성 중...")
            response = self.llm.invoke([{"role": "user", "content": synthesis_prompt}])
            synthesized_content = response.content.strip()
            
            # 마크다운을 HTML로 변환
            html_content = self._convert_markdown_to_html(synthesized_content)
            
            # 편집창에 전송할 문서 데이터 준비
            synthesis_filename = f"종합보고서_{len(document_contents)}개문서.html"
            document_for_editor = {
                "filename": synthesis_filename,
                "content": html_content,
                "filePath": synthesis_filename,
                "source": "synthesized"
            }
            
            print(f"✅ [DocumentSearchAgent] 종합 보고서 생성 완료: {len(html_content)} 문자")
            
            return {
                "send_to_editor": True,
                "selected_document": document_for_editor,
                "auto_open_success": True,
                "search_summary": f"✅ **{len(document_contents)}개 문서를 종합한 보고서**를 편집창에서 열었습니다!"
            }
            
        except Exception as e:
            print(f"❌ [DocumentSearchAgent] 종합 보고서 생성 실패: {e}")
            return {
                "auto_open_success": False,
                "search_summary": f"종합 보고서 생성 중 오류가 발생했습니다: {str(e)}"
            }

    def _load_document_content_for_synthesis(self, document: Dict[str, Any]) -> str:
        """종합 보고서용 문서 내용 로드"""
        try:
            source = document.get('source', '')
            if source == 's3':
                s3_key = document.get('path', '')
                if s3_key:
                    # S3에서 문서 내용 로드 (기존 로직 재사용)
                    return self._load_s3_document_content(s3_key)
            elif source == 'local':
                file_path = document.get('path', '')
                if file_path:
                    # 로컬에서 문서 내용 로드
                    return self._load_local_document_content(file_path)
            
            return None
        except Exception as e:
            print(f"❌ [DocumentSearchAgent] 문서 내용 로드 실패: {e}")
            return None

    def _create_synthesis_prompt(self, document_contents: List[Dict[str, str]], user_query: str) -> str:
        """종합 보고서 생성을 위한 프롬프트 작성"""
        prompt = f"""다음 {len(document_contents)}개의 문서를 분석하여 종합 보고서를 작성해주세요.

사용자 요청: "{user_query}"

"""
        
        # 각 문서 내용 추가
        for i, doc in enumerate(document_contents, 1):
            prompt += f"""## 문서 {i}: {doc['filename']}

{doc['content'][:3000]}{'...(내용 생략)' if len(doc['content']) > 3000 else ''}

---

"""
        
        prompt += f"""위 {len(document_contents)}개 문서를 종합하여 다음과 같은 보고서를 작성해주세요:

요구사항:
1. 각 문서의 핵심 내용을 정확히 파악하여 종합
2. 문서들 간의 공통점과 차이점 분석
3. 전체적인 구조와 체계적인 내용 정리
4. 실무에서 활용할 수 있는 수준의 전문적인 보고서
5. 마크다운 형식으로 작성

구조:
- 제목 (# 태그)
- 개요/요약 (## 태그)
- 각 문서별 주요 내용 (## 태그)
- 종합 분석 및 비교 (## 태그)
- 결론 및 시사점 (## 태그)

지금 종합 보고서를 작성해주세요."""
        
        return prompt

    def _convert_markdown_to_html(self, markdown_content: str) -> str:
        """마크다운을 HTML로 변환"""
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

    def _load_local_document_content(self, file_path: str) -> str:
        """로컬 파일 내용 로드"""
        try:
            from pathlib import Path
            path = Path(file_path)
            if not path.exists():
                return None
                
            extension = path.suffix.lower()
            if extension in ['.md', '.txt', '.html']:
                with open(path, 'r', encoding='utf-8') as f:
                    return f.read()
            elif extension == '.docx':
                try:
                    from docx import Document as DocxDocument
                    doc = DocxDocument(path)
                    return '\n'.join([paragraph.text for paragraph in doc.paragraphs])
                except ImportError:
                    return None
            
            return None
        except Exception as e:
            print(f"❌ [DocumentSearchAgent] 로컬 파일 로드 오류: {e}")
            return None


# Legacy support - 기존 코드와의 호환성
def DocumentSearchAgent_legacy():
    """
    DEPRECATED: 기존 그래프 방식 지원 (하위 호환성)
    새 코드에서는 DocumentSearchAgent 클래스 직접 사용 권장
    """
    agent = DocumentSearchAgent()
    
    def legacy_wrapper(state: AgentState) -> Dict[str, Any]:
        return agent.process(state)
    
    return legacy_wrapper