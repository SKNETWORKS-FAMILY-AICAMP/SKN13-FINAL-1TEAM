# DocumentDraftAgent.py - 문서 초안 생성 전용 에이전트

from typing import Dict, Any, List
from dotenv import load_dotenv
import logging
import traceback
import re

from langchain_core.messages import SystemMessage, ToolMessage, HumanMessage, BaseMessage, AIMessage
from langchain_openai import ChatOpenAI

from ..core.AgentState import AgentState, AgentStateHelper, AgentType, WorkflowStep
from ..tools.document_draft_generator_tool import document_draft_generator_tool
from ..tools.editor_tool import run_document_edit

load_dotenv()

# 로깅 설정
logger = logging.getLogger(__name__)

class DocumentDraftAgent:
    """
    문서 초안 생성 전용 에이전트
    로컬 참조 문서들을 분석하여 새로운 문서 초안을 생성하고 편집창에 전달
    """

    def __init__(self):
        """문서 초안 생성 도구 및 LLM 초기화"""
        self.llm = ChatOpenAI(model_name='gpt-4o', temperature=0.3)

        # 문서 초안 생성 관련 도구들
        self.tools = [
            document_draft_generator_tool,
            run_document_edit  # 추가 편집이 필요한 경우
        ]
        self.tool_map = {tool.name: tool for tool in self.tools}
        self.llm_with_tools = self.llm.bind_tools(self.tools)

        logger.info("--- DocumentDraftAgent initialized ---")

    def process(self, state: AgentState) -> Dict[str, Any]:
        """
        문서 초안 생성 프로세스 실행
        1. 사용자 요청 분석
        2. 참조 문서 패턴 추출
        3. 문서 초안 생성
        4. 결과 처리 및 편집창 전달
        """
        logger.info("--- DocumentDraftAgent: Starting document draft generation ---")

        try:
            # 1. 사용자 요청 분석
            user_query = AgentStateHelper.get_last_user_message(state)
            if not user_query:
                return self._handle_error(state, "No draft generation request found")

            logger.info(f"Processing draft request: {user_query[:100]}...")

            # 2. 문서 생성 파라미터 추출
            generation_params = self._extract_generation_params(user_query)

            AgentStateHelper.add_agent_data(
                state,
                AgentType.DOCUMENT_EDIT,  # DocumentDraft 타입이 없으므로 EDIT 사용
                "original_request",
                user_query
            )

            # 3. 메시지 컨텍스트 준비
            messages = self._prepare_draft_context(state, generation_params)

            # 4. LLM 호출하여 도구 실행
            response = self.llm_with_tools.invoke(messages)

            generated_content = ""
            success_message = ""

            # 5. 도구 호출 처리
            if hasattr(response, 'tool_calls') and response.tool_calls:
                messages.append(response)  # AI 메시지 추가

                for tool_call in response.tool_calls:
                    tool_name = tool_call.get("name")
                    tool_args = tool_call.get("args")

                    logger.info(f"Executing tool: {tool_name}")

                    if tool_name in self.tool_map:
                        tool_function = self.tool_map[tool_name]
                        try:
                            # 도구 실행
                            result = tool_function.invoke(tool_args)

                            if tool_name == "document_draft_generator_tool":
                                generated_content = result
                                success_message = self._create_success_message(
                                    generation_params["target_description"],
                                    len(result)
                                )

                            # ToolMessage 추가
                            messages.append(ToolMessage(content=str(result), tool_call_id=tool_call['id']))

                        except Exception as e:
                            error_msg = f"Error executing tool '{tool_name}': {e}"
                            logger.error(f"{error_msg}\n{traceback.format_exc()}")
                            messages.append(ToolMessage(content=error_msg, tool_call_id=tool_call['id']))
            else:
                # 도구 호출이 없는 경우 직접 문서 생성 도구 호출
                logger.info("No tool calls found, directly invoking draft generator")
                try:
                    generated_content = document_draft_generator_tool.invoke(generation_params)
                    success_message = self._create_success_message(
                        generation_params["target_description"],
                        len(generated_content)
                    )
                except Exception as e:
                    return self._handle_error(state, f"문서 생성 실패: {str(e)}")

            # 6. 최종 응답 생성
            if generated_content:
                # 성공 메시지 추가
                messages.append(AIMessage(content=success_message))

                # 7. 상태 업데이트
                AgentStateHelper.set_workflow_step(state, WorkflowStep.EDIT_COMPLETED)

                logger.info(f"--- DocumentDraftAgent: Draft generation completed ({len(generated_content)} chars) ---")

                # 더 명확한 파일명 생성
                filename = self._generate_filename(generation_params)
                
                return {
                    "messages": messages,
                    "document_content": generated_content,
                    "workflow_step": WorkflowStep.EDIT_COMPLETED,
                    "send_to_editor": True,  # 편집창으로 전송 플래그
                    "selected_document": {  # 편집창으로 보낼 문서 정보
                        "filename": filename,
                        "content": generated_content,
                        "filePath": f"generated_{filename}",
                        "source": "generated"
                    }
                }
            else:
                return self._handle_error(state, "문서 생성 결과가 없습니다")

        except Exception as e:
            logger.error(f"DocumentDraftAgent process failed: {e}\n{traceback.format_exc()}")
            return self._handle_error(state, f"문서 초안 생성 중 오류 발생: {str(e)}")

    def _extract_generation_params(self, user_query: str) -> Dict[str, Any]:
        """사용자 쿼리에서 문서 생성 파라미터를 추출합니다."""
        params = {
            "target_description": user_query,
            "reference_pattern": "",
            "target_year": 2025
        }

        # 연도 추출
        year_match = re.search(r'20(\d{2})', user_query)
        if year_match:
            params["target_year"] = int(f"20{year_match.group(1)}")

        # 참조 문서 패턴 추출 (우선순위 순으로 매칭)
        if "미디어다양성" in user_query and "조사" in user_query:
            params["reference_pattern"] = "미디어다양성 조사용역"
        elif "미디어다양성" in user_query:
            params["reference_pattern"] = "미디어다양성"
        elif "공고문" in user_query:
            params["reference_pattern"] = "공고문"
        elif "광고" in user_query:
            params["reference_pattern"] = "광고"
        elif "보고서" in user_query:
            params["reference_pattern"] = "보고서"

        # 키워드에서 패턴 추출
        if not params["reference_pattern"]:
            # 일반적인 키워드들 제거하고 의미있는 키워드 추출
            keywords = re.findall(r'[\w가-힣]+', user_query)
            exclude_words = {
                '년', '연도', '문서', '작성', '생성', '만들어', '줘', '주세요',
                '보고서', '초안', '용역', '에', '관한', '대한', '을', '를'
            }
            meaningful_keywords = [kw for kw in keywords if kw not in exclude_words and len(kw) > 1]
            if meaningful_keywords:
                params["reference_pattern"] = " ".join(meaningful_keywords[:3])

        logger.info(f"Extracted generation params: {params}")
        return params

    def _generate_filename(self, generation_params: Dict[str, Any]) -> str:
        """생성된 문서의 파일명을 생성합니다."""
        target_year = generation_params.get("target_year", 2025)
        reference_pattern = generation_params.get("reference_pattern", "문서")
        
        # 특별 패턴에 따른 파일명 생성
        if "미디어다양성" in reference_pattern:
            filename = f"공고문_{target_year}년_미디어다양성조사용역.html"
        elif "공고문" in reference_pattern:
            filename = f"공고문_{target_year}년_{reference_pattern.replace('공고문', '').strip()}.html"
        elif "보고서" in reference_pattern:
            filename = f"{target_year}년_{reference_pattern}_보고서.html"
        else:
            # 기본 형식
            clean_pattern = reference_pattern.replace(" ", "_")[:20]
            filename = f"{target_year}년_{clean_pattern}_초안.html"
        
        # 파일명에서 사용할 수 없는 문자 제거
        import string
        valid_chars = f"-_.() {string.ascii_letters}{string.digits}가-힣"
        filename = ''.join(c for c in filename if c in valid_chars)
        
        return filename

    def _prepare_draft_context(self, state: AgentState, generation_params: Dict[str, Any]) -> List[BaseMessage]:
        """문서 초안 생성을 위한 컨텍스트 준비"""
        messages = list(state.get("messages", []))

        context_message = SystemMessage(
            content=f"""## 문서 초안 생성 지시사항 ##

당신은 전문적인 문서 초안 생성 전문가입니다.

**주요 임무**:
1. 사용자의 문서 생성 요청을 분석
2. 로컬 참조 문서들을 활용하여 새로운 문서 초안 생성
3. 전문적이고 실무에 활용 가능한 수준의 문서 작성

**현재 요청**:
- 목표 문서: {generation_params['target_description']}
- 참조 패턴: {generation_params.get('reference_pattern', '없음')}
- 대상 연도: {generation_params.get('target_year', 2025)}

**중요 원칙**:
1. 반드시 document_draft_generator_tool을 사용하여 문서를 생성하세요
2. 플레이스홀더나 임시 텍스트 대신 실제 내용을 생성하세요
3. 참조 문서들의 패턴을 분석하여 일관성 있는 구조로 작성하세요
4. 전문적이고 공식적인 톤앤매너를 유지하세요
5. {generation_params.get('target_year', 2025)}년도에 맞는 최신 내용을 반영하세요

사용자의 요청에 따라 document_draft_generator_tool을 호출하여 문서를 생성해주세요.
"""
        )

        # 시스템 메시지가 없으면 추가
        if not any(isinstance(msg, SystemMessage) for msg in messages):
            messages.insert(0, context_message)

        return messages

    def _create_success_message(self, target_description: str, content_length: int) -> str:
        """성공 메시지 생성"""
        return f"""✅ **{target_description}** 초안 생성이 완료되었습니다!

📄 **생성된 문서 정보**:
- 문서 크기: {content_length:,} 문자
- 구조: 전문적인 형식으로 구성
- 참조: 로컬 문서 패턴 분석 기반

🔄 **다음 단계**:
생성된 문서가 편집창에 자동으로 표시됩니다. 필요에 따라 내용을 검토하고 수정해 주세요.

💡 **추가 편집**: 내용 추가나 수정이 필요하면 언제든 말씀해 주세요!"""

    def _handle_error(self, state: AgentState, error_message: str) -> Dict[str, Any]:
        """에러 처리 및 상태 업데이트"""
        logger.error(f"DocumentDraftAgent Error: {error_message}")

        AgentStateHelper.set_workflow_error(state, error_message)
        AgentStateHelper.add_workflow_result(
            state,
            AgentType.DOCUMENT_EDIT,
            success=False,
            data={},
            error=error_message
        )

        return {
            "workflow_error": error_message,
            "workflow_step": WorkflowStep.ERROR
        }

    def _is_draft_generation_request(self, user_query: str) -> bool:
        """사용자 요청이 초안 생성 요청인지 확인"""
        draft_patterns = [
            r'(초안|draft).*?작성',
            r'20\d{2}.*?(작성|만들어|생성)',
            r'(문서|보고서).*?(작성|만들어|생성)',
            r'.*?용역.*?(공고문|보고서).*?작성',
            r'미디어다양성.*?조사.*?용역'
        ]

        user_query_lower = user_query.lower()
        for pattern in draft_patterns:
            if re.search(pattern, user_query_lower):
                return True
        return False

# Legacy support
def DocumentDraftAgent_legacy():
    """기존 그래프 방식 지원 (하위 호환성)"""
    agent = DocumentDraftAgent()

    def legacy_wrapper(state: AgentState) -> Dict[str, Any]:
        return agent.process(state)

    return legacy_wrapper