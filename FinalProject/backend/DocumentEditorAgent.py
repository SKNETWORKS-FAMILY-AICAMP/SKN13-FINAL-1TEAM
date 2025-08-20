
from langchain_openai import ChatOpenAI
from .DocumentSearchAgentTools.editor_tool import run_document_edit
from .DocumentSearchAgentTools.AgentState import RagState

class DocumentEditorAgent:
    def __init__(self):
        """
        에이전트 초기화. 자체 LLM 클라이언트를 생성합니다.
        """
        self.llm_client = ChatOpenAI(model_name='gpt-4o', temperature=0)

    def run(self, state: RagState) -> RagState:
        """
        상태를 기반으로 문서 편집 툴을 호출하고, 업데이트된 상태를 반환합니다.
        """
        print("--- Running DocumentEditorAgent ---")
        
        # 툴을 실행하고 결과(상태 업데이트 사전)를 받습니다.
        result_dict = run_document_edit(
            state=state,
            llm_client=self.llm_client
        )

        # 받은 결과로 상태를 업데이트합니다.
        state["final_answer"] = result_dict.get("final_answer")
        
        return state
