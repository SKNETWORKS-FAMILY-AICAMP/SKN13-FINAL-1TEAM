# DocumentSearchAgent.py

import json
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
                                    
                                    # "편집창에 띄워줘" 요청인지 확인
                                    should_auto_open = self._should_auto_open_editor(user_query)
                                    print(f"🔍 [DEBUG] 편집창 자동 열기 요청 감지: {should_auto_open}")
                                    
                                    if should_auto_open:
                                        # 첫 번째 문서를 자동으로 편집창에 열기
                                        first_doc = documents[0]
                                        print(f"🔍 [DEBUG] 첫 번째 문서: {first_doc.get('filename', 'Unknown')}")
                                        
                                        is_supported = self._is_editor_supported_file(first_doc)
                                        print(f"🔍 [DEBUG] 편집창 지원 파일 여부: {is_supported}")
                                        
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
            content = response['Body'].read().decode('utf-8')
            
            print(f"📄 [DocumentSearchAgent] 문서 자동 로드 성공: {len(content)} 문자")
            
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