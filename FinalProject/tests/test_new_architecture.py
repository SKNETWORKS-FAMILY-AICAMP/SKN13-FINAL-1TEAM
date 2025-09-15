#!/usr/bin/env python3
"""
새로운 아키텍처 기본 동작 테스트
Graph in Graph → Class 기반 구조로 변경 후 검증
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_imports():
    """모든 임포트가 정상적으로 되는지 테스트"""
    print("=== 임포트 테스트 ===")
    
    try:
        # 새로운 AgentState 임포트 테스트
        from backend.ChatBot.core.AgentState import (
            AgentState, AgentStateHelper, AgentType, WorkflowStep
        )
        print("[OK] AgentState 임포트 성공")
        
        # 새로운 클래스 기반 에이전트들 임포트 테스트
        from backend.ChatBot.agents.DocumentSearchAgent import DocumentSearchAgent
        from backend.ChatBot.agents.DocumentEditorAgent import DocumentEditorAgent  
        from backend.ChatBot.agents.GeneralChatAgent import GeneralChatAgent
        print("[OK] 모든 Agent 클래스 임포트 성공")
        
        # WorkflowGraph 임포트 테스트
        from backend.ChatBot.core.workflow_graph import WorkflowGraphFactory
        print("[OK] WorkflowGraph 임포트 성공")
        
        # RoutingAgent 임포트 테스트  
        from backend.ChatBot.agents.RoutingAgent import RoutingAgent
        print("[OK] RoutingAgent 임포트 성공")
        
        return True
        
    except Exception as e:
        print(f"[ERR] 임포트 실패: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_agent_state_helper():
    """AgentStateHelper 기능 테스트"""
    print("\n=== AgentStateHelper 테스트 ===")
    
    try:
        from backend.ChatBot.core.AgentState import (
            AgentStateHelper, AgentType, WorkflowStep
        )
        
        # 1. 초기 상태 생성 테스트
        state = AgentStateHelper.create_initial_state(
            prompt="테스트 메시지",
            document_content="<p>테스트 문서</p>"
        )
        print("[OK] 초기 상태 생성 성공")
        print(f"   - prompt: {state['prompt']}")
        print(f"   - workflow_step: {state['workflow_step']}")
        
        # 2. 워크플로우 결과 추가 테스트
        AgentStateHelper.add_workflow_result(
            state,
            AgentType.DOCUMENT_SEARCH,
            success=True,
            data={"test": "search_result"}
        )
        print("[OK] 워크플로우 결과 추가 성공")
        
        # 3. 다음 에이전트 설정 테스트
        AgentStateHelper.set_next_agents(state, [AgentType.DOCUMENT_EDIT])
        print("[OK] 다음 에이전트 설정 성공")
        
        # 4. 워크플로우 단계 업데이트 테스트
        AgentStateHelper.set_workflow_step(state, WorkflowStep.SEARCH_COMPLETED)
        print("[OK] 워크플로우 단계 업데이트 성공")
        
        return True
        
    except Exception as e:
        print(f"[ERR] AgentStateHelper 테스트 실패: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_individual_agents():
    """개별 에이전트 클래스 인스턴스 생성 테스트"""
    print("\n=== 개별 에이전트 인스턴스 테스트 ===")
    
    try:
        from backend.ChatBot.agents.DocumentSearchAgent import DocumentSearchAgent
        from backend.ChatBot.agents.DocumentEditorAgent import DocumentEditorAgent  
        from backend.ChatBot.agents.GeneralChatAgent import GeneralChatAgent
        
        # 1. DocumentSearchAgent 인스턴스 생성
        search_agent = DocumentSearchAgent()
        print("[OK] DocumentSearchAgent 인스턴스 생성 성공")
        print(f"   - 사용 가능한 도구: {len(search_agent.get_available_tools())}개")
        
        # 2. DocumentEditorAgent 인스턴스 생성
        editor_agent = DocumentEditorAgent()
        print("[OK] DocumentEditorAgent 인스턴스 생성 성공") 
        print(f"   - 사용 가능한 도구: {len(editor_agent.get_available_tools())}개")
        
        # 3. GeneralChatAgent 인스턴스 생성
        chat_agent = GeneralChatAgent()
        print("[OK] GeneralChatAgent 인스턴스 생성 성공")
        
        return True
        
    except Exception as e:
        print(f"[ERR] 개별 에이전트 테스트 실패: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_workflow_graph_creation():
    """WorkflowGraph 생성 테스트"""
    print("\n=== WorkflowGraph 생성 테스트 ===")
    
    try:
        from backend.ChatBot.agents.RoutingAgent import RoutingAgent
        
        # 1. 멀티스텝 워크플로우 생성 테스트
        workflow_agent = RoutingAgent(workflow_type="multi_step")
        print("[OK] 멀티스텝 워크플로우 생성 성공")
        
        # 2. 심플 라우팅 생성 테스트  
        simple_agent = RoutingAgent(workflow_type="simple")
        print("[OK] 심플 라우팅 생성 성공")
        
        return True
        
    except Exception as e:
        print(f"[ERR] WorkflowGraph 생성 테스트 실패: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_basic_workflow():
    """기본 워크플로우 실행 테스트 (실제 LLM 호출 없이)"""
    print("\n=== 기본 워크플로우 테스트 ===")
    
    try:
        from backend.ChatBot.core.AgentState import AgentStateHelper
        from backend.ChatBot.agents.GeneralChatAgent import GeneralChatAgent
        
        # 1. 초기 상태 생성
        state = AgentStateHelper.create_initial_state(
            prompt="안녕하세요, 테스트입니다"
        )
        print("[OK] 초기 상태 생성 성공")
        
        # 2. GeneralChatAgent로 간단한 처리 테스트
        # Note: 실제 LLM 호출은 환경 변수나 API 키 문제로 실패할 수 있음
        # 여기서는 인스턴스 생성과 기본 구조만 확인
        chat_agent = GeneralChatAgent()
        
        print("[OK] 에이전트 인스턴스 생성 성공")
        print("[WARN]  실제 LLM 호출 테스트는 환경 설정 후 별도 진행")
        
        return True
        
    except Exception as e:
        print(f"[ERR] 기본 워크플로우 테스트 실패: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """전체 테스트 실행"""
    print("=== 새로운 아키텍처 기본 동작 테스트 시작 ===\n")
    
    test_results = []
    
    # 각 테스트 실행
    test_results.append(("임포트 테스트", test_imports()))
    test_results.append(("AgentStateHelper 테스트", test_agent_state_helper())) 
    test_results.append(("개별 에이전트 테스트", test_individual_agents()))
    test_results.append(("WorkflowGraph 생성 테스트", test_workflow_graph_creation()))
    test_results.append(("기본 워크플로우 테스트", test_basic_workflow()))
    
    # 결과 요약
    print("\n" + "="*50)
    print("=== 테스트 결과 요약")
    print("="*50)
    
    success_count = 0
    for test_name, result in test_results:
        status = "[OK] 성공" if result else "[ERR] 실패"
        print(f"{test_name}: {status}")
        if result:
            success_count += 1
    
    print(f"\n총 {len(test_results)}개 테스트 중 {success_count}개 성공")
    
    if success_count == len(test_results):
        print(">>> 모든 테스트 통과! 새로운 아키텍처가 정상 동작합니다.")
    else:
        print(">>> 일부 테스트 실패. 문제 해결이 필요합니다.")
    
    return success_count == len(test_results)

if __name__ == "__main__":
    main()