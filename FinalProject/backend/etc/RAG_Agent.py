# -*- coding: utf-8 -*-

import os
import uuid
from typing import TypedDict, Annotated, List, Dict, Any, Optional
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver

# RAG 도구를 임포트합니다.
from llm_tools.retriever import RAG_tool

# .env 파일에서 환경 변수를 로드합니다.
load_dotenv()

# --- RAG 에이전트의 내부 상태 정의 ---
class RagState(TypedDict):
    """ RAG 에이전트의 작업 흐름(그래프) 내에서 사용될 상태 객체입니다. """
    # 사용자의 원본 질문
    original_query: str
    # 확장된 검색 쿼리 목록
    expanded_queries: List[str]
    # 검색된 문서 목록
    retrieved_docs: List[Dict[str, Any]]
    # 생성된 최종 답변
    final_answer: str
    # 후속 질문 여부
    is_follow_up: bool
    # 대화 기록
    messages: Annotated[list, add_messages]


class RAG_Agent:
    """대화의 맥락을 기억하고 후속 질문에 답변할 수 있는, LangGraph 기반의 지능형 RAG 에이전트입니다."""

    def __init__(self):
        """에이전트를 초기화하고, 내부에서 사용할 LangGraph를 구축합니다."""
        self.llm = ChatOpenAI(model="gpt-4o", temperature=0)
        # RAG 에이전트의 내부 작업 흐름을 정의하는 그래프입니다.
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        """RAG 에이전트의 내부 작업 흐름을 정의하는 StateGraph를 구축합니다."""
        graph = StateGraph(RagState)

        # --- 그래프의 각 노드(작업 단계)를 정의합니다. ---
        graph.add_node("route_query", self._route_query_node) # 1. 쿼리 라우팅
        graph.add_node("expand_query", self._expand_query_node) # 2a. 쿼리 확장 (신규 검색)
        graph.add_node("search", self._search_node) # 2b. 문서 검색 (신규 검색)
        graph.add_node("handle_follow_up", self._handle_follow_up_node) # 3. 후속 질문 처리
        graph.add_node("summarize", self._summarize_node) # 4. 요약 및 답변 생성
        graph.add_node("format_response", self._format_response_node) # 5. 최종 응답 포맷팅

        # --- 그래프의 흐름(엣지)을 정의합니다. ---
        graph.set_entry_point("route_query")

        # 1. 쿼리 라우팅 노드 이후의 분기 처리
        graph.add_conditional_edges(
            "route_query",
            lambda state: "follow_up" if state["is_follow_up"] else "new_search",
            {
                "follow_up": "handle_follow_up",
                "new_search": "expand_query",
            },
        )
        
        # 2. 신규 검색 경로
        graph.add_edge("expand_query", "search")
        graph.add_conditional_edges(
            "search",
            # 검색된 문서가 있는지 여부로 분기
            lambda state: "summarize" if state["retrieved_docs"] else END,
            {"summarize": "summarize", END: END},
        )

        # 3. 후속 질문 경로
        graph.add_edge("handle_follow_up", "summarize")
        
        # 4. 요약 이후 최종 포맷팅
        graph.add_edge("summarize", "format_response")
        graph.add_edge("format_response", END)

        # RAG 에이전트 전용 메모리(Checkpointer)를 사용하여 그래프를 컴파일합니다.
        # 이를 통해 RAG 에이전트는 자신의 작업 내용을 기억할 수 있습니다.
        memory = MemorySaver()
        return graph.compile(checkpointer=memory)

    # --- 각 노드에서 실행될 함수들을 정의합니다. ---

    def _route_query_node(self, state: RagState) -> Dict[str, Any]:
        """사용자의 최신 질문이 후속 질문인지, 아니면 새로운 검색인지를 판단합니다."""
        # 현재 상태에 저장된 문서가 있고, 사용자의 질문이 짧고 모호하다면 후속 질문으로 간주합니다.
        # (간단한 휴리스틱, 실제로는 더 정교한 로직(예: LLM 호출)이 필요할 수 있습니다)
        is_follow_up = False
        if state.get("retrieved_docs"):
            last_query = state["messages"][-1].content
            if len(last_query.split()) < 5 and ("링크" in last_query or "그거" in last_query or "자세히" in last_query):
                is_follow_up = True
        
        print(f"[RAG_Agent] 쿼리 라우팅: {'후속 질문' if is_follow_up else '신규 검색'}")
        return {"is_follow_up": is_follow_up, "original_query": state["messages"][-1].content}

    def _expand_query_node(self, state: RagState) -> Dict[str, Any]:
        """사용자의 원본 질문을 기반으로, 검색에 더 효과적인 여러 개의 쿼리를 생성합니다."""
        print("[RAG_Agent] 쿼리 확장 중...")
        query = state["original_query"]
        prompt = f"""당신은 검색 쿼리 생성 전문가입니다. 사용자의 질문을 분석하여, 벡터 데이터베이스 검색에 사용할 수 있는 다양하고 구체적인 검색 질문 3개를 생성해주세요. 각 질문은 한 줄로 구분합니다.

원본 질문: {query}

생성된 검색 질문:"""
        response = self.llm.invoke([HumanMessage(content=prompt)])
        expanded_queries = response.content.strip().split('\n')
        queries = [query] + [q.strip() for q in expanded_queries if q.strip()]
        print(f"[RAG_Agent] 확장된 쿼리: {queries}")
        return {"expanded_queries": queries}

    def _search_node(self, state: RagState) -> Dict[str, Any]:
        """확장된 쿼리들을 사용하여 RAG_tool로 문서를 검색하고, 중복을 제거하여 저장합니다."""
        print("[RAG_Agent] 문서 검색 중...")
        all_docs = []
        seen_sources = set()
        for q in state["expanded_queries"]:
            docs = RAG_tool.invoke({"query": q})
            for doc in docs:
                source = doc.get('metadata', {}).get('source')
                if source and source not in seen_sources:
                    all_docs.append(doc)
                    seen_sources.add(source)
        print(f"[RAG_Agent] {len(all_docs)}개의 고유한 문서 검색 완료.")
        return {"retrieved_docs": all_docs}

    def _handle_follow_up_node(self, state: RagState) -> Dict[str, Any]:
        """후속 질문을 처리합니다. 이미 검색된 문서를 재사용합니다."""
        print("[RAG_Agent] 후속 질문 처리 중...")
        # 이 노드는 상태를 변경하지 않고, 단지 이미 로드된 `retrieved_docs`를
        # 다음 요약 노드로 전달하는 역할만 합니다.
        return {}

    def _summarize_node(self, state: RagState) -> Dict[str, Any]:
        """검색된 문서들을 바탕으로 사용자의 질문에 대한 답변을 생성합니다."""
        print("[RAG_Agent] 답변 요약 및 생성 중...")
        query = state["original_query"]
        docs = state["retrieved_docs"]
        context_str = "\n\n---\n\n".join([f"문서 출처: {doc.get('metadata', {}).get('source', '알 수 없음')}\n\n내용: {doc['page_content']}" for doc in docs])
        system_prompt = """당신은 주어진 문서를 바탕으로 사용자의 질문에 답변하는 AI 어시스턴트입니다.
        1. 제공된 문서 내용에만 근거하여, 명확하고 간결하게 답변하세요.
        2. 문서 내용을 요약하고 있다는 사실을 언급하지 말고, 질문에 직접 답하세요.
        3. 문서에 답변의 근거가 부족하면, 정보가 없다고 명확히 밝히세요.
        4. 답변은 반드시 한국어로 작성하세요."""
        user_prompt = f"""아래 문서들을 바탕으로 다음 질문에 답변해주세요.

질문: {query}

문서:
{context_str}

답변:"""
        response = self.llm.invoke([SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)])
        return {"final_answer": response.content.strip()}

    def _format_response_node(self, state: RagState) -> Dict[str, Any]:
        """생성된 답변과 문서 다운로드 링크를 합쳐 최종 응답 메시지를 만듭니다."""
        print("[RAG_Agent] 최종 응답 포맷팅 중...")
        answer = state["final_answer"]
        docs = state["retrieved_docs"]
        unique_sources = sorted(list(set([doc.get('metadata', {}).get('source') for doc in docs if doc.get('metadata', {}).get('source')]))) 
        links_markdown = "\n\n---\n**관련 문서 다운로드 링크:**\n" + "\n".join([f"- {source}" for source in unique_sources])
        final_response = answer + links_markdown
        return {"messages": [AIMessage(content=final_response)]}

    def run(self, query: str, thread_id: str):
        """에이전트의 그래프를 실행하여 쿼리를 처리합니다."""
        config = {"configurable": {"thread_id": thread_id}}
        # 스트리밍 출력을 위해 astream을 사용합니다.
        return self.graph.astream({"messages": [HumanMessage(content=query)]}, config=config)

# --- 테스트용 실행 코드 ---
if __name__ == "__main__":
    import asyncio

    async def main():
        # RAG 에이전트 인스턴스 생성
        rag_agent = RAG_Agent()
        # 고유한 대화 ID 생성
        thread_id = str(uuid.uuid4())

        print("--- 첫 번째 질문 (신규 검색) ---")
        async for event in rag_agent.run("을지연습 복무감사 관련 보고서 찾아줘", thread_id):
            if event.get(END):
                print("\n\n[최종 답변]:")
                print(event[END]["messages"][-1].content)
        
        print("\n" + "="*40 + "\n")

        print("--- 두 번째 질문 (후속 질문) ---")
        async for event in rag_agent.run("그거 다운로드 링크 좀 줘봐", thread_id):
            if event.get(END):
                print("\n\n[최종 답변]:")
                print(event[END]["messages"][-1].content)

    asyncio.run(main())