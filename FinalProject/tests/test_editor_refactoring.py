#!/usr/bin/env python3
"""
Editor 리팩토링 테스트
Strategy Pattern 적용 후 기본 동작 검증
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_editor_strategies_import():
    """새로운 전략 패턴 임포트 테스트"""
    print("=== Editor Strategies 임포트 테스트 ===")
    
    try:
        # Base strategy 임포트
        from backend.ChatBot.tools.editor_strategies.base_strategy import EditorToolRegistry, BaseEditorStrategy
        print("[OK] BaseEditorStrategy 임포트 성공")
        
        # Individual strategies
        from backend.ChatBot.tools.editor_strategies.basic_text_strategy import BasicTextStrategy
        from backend.ChatBot.tools.editor_strategies.html_editing_strategy import HtmlEditingStrategy
        from backend.ChatBot.tools.editor_strategies.structure_template_strategy import StructureTemplateStrategy
        from backend.ChatBot.tools.editor_strategies.advanced_editing_strategy import AdvancedEditingStrategy
        print("[OK] 모든 전략 클래스 임포트 성공")
        
        # New unified tool
        from backend.ChatBot.tools.editor_tool_new import ALL_EDITOR_TOOLS, STRATEGY_INFO
        print("[OK] 새로운 통합 editor_tool_new 임포트 성공")
        
        return True
        
    except Exception as e:
        print(f"[ERR] 전략 패턴 임포트 실패: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_strategy_initialization():
    """전략 초기화 테스트"""
    print("\n=== 전략 초기화 테스트 ===")
    
    try:
        from backend.ChatBot.tools.editor_tool_new import EDITOR_REGISTRY, get_strategy_summary
        
        # Registry 정보 확인
        summary = get_strategy_summary()
        print(f"[OK] 전략 레지스트리 초기화 성공")
        print(f"   - 총 전략 수: {summary['total_strategies']}개")
        print(f"   - 총 도구 수: {summary['total_tools']}개")
        
        # 각 전략 정보 출력
        for strategy_name, tools in summary['strategies'].items():
            print(f"   - {strategy_name}: {len(tools)}개 도구")
        
        return True
        
    except Exception as e:
        print(f"[ERR] 전략 초기화 테스트 실패: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_individual_strategies():
    """개별 전략 인스턴스 테스트"""
    print("\n=== 개별 전략 인스턴스 테스트 ===")
    
    try:
        from backend.ChatBot.tools.editor_strategies.basic_text_strategy import BasicTextStrategy
        from backend.ChatBot.tools.editor_strategies.html_editing_strategy import HtmlEditingStrategy
        from backend.ChatBot.tools.editor_strategies.structure_template_strategy import StructureTemplateStrategy
        from backend.ChatBot.tools.editor_strategies.advanced_editing_strategy import AdvancedEditingStrategy
        
        # 각 전략 인스턴스 생성 및 테스트
        strategies = [
            BasicTextStrategy(),
            HtmlEditingStrategy(), 
            StructureTemplateStrategy(),
            AdvancedEditingStrategy()
        ]
        
        for strategy in strategies:
            strategy_name = strategy.get_strategy_name()
            tools = strategy.get_tools()
            tool_names = strategy.get_tool_names()
            
            print(f"[OK] {strategy_name}: {len(tools)}개 도구")
            print(f"   도구 목록: {', '.join(tool_names[:3])}{'...' if len(tool_names) > 3 else ''}")
        
        return True
        
    except Exception as e:
        print(f"[ERR] 개별 전략 테스트 실패: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_backward_compatibility():
    """기존 코드와의 호환성 테스트"""
    print("\n=== 기존 코드 호환성 테스트 ===")
    
    try:
        # DocumentEditorAgent가 새 도구를 사용할 수 있는지 테스트
        from backend.ChatBot.agents.DocumentEditorAgent import DocumentEditorAgent
        print("[OK] DocumentEditorAgent 임포트 성공")
        
        # 에이전트 인스턴스 생성 (LLM 초기화는 환경 설정 필요로 스킵)
        try:
            agent = DocumentEditorAgent()
            available_tools = agent.get_available_tools()
            print(f"[OK] DocumentEditorAgent 인스턴스 생성 성공")
            print(f"   - 사용 가능한 도구: {len(available_tools)}개")
        except Exception as e:
            if "api_key" in str(e).lower():
                print("[WARN] DocumentEditorAgent - OpenAI API 키 필요 (예상된 상황)")
                print("   - 전략 패턴 임포트는 성공")
            else:
                raise e
        
        return True
        
    except Exception as e:
        print(f"[ERR] 호환성 테스트 실패: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_tool_functionality():
    """도구 기본 기능 테스트 (LLM 호출 없이)"""
    print("\n=== 도구 기본 기능 테스트 ===")
    
    try:
        from backend.ChatBot.tools.editor_tool_new import replace_text_in_document
        
        # 간단한 텍스트 교체 테스트
        test_content = "<p>Hello World</p>"
        result = replace_text_in_document.invoke({
            "document_content": test_content,
            "old_text": "Hello",
            "new_text": "안녕하세요"
        })
        
        if "안녕하세요" in result and "World" in result:
            print("[OK] replace_text_in_document 기능 정상 동작")
        else:
            print("[ERR] replace_text_in_document 결과 이상")
            return False
        
        return True
        
    except Exception as e:
        print(f"[ERR] 도구 기능 테스트 실패: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """전체 리팩토링 테스트 실행"""
    print("=== Editor 리팩토링 Strategy Pattern 테스트 시작 ===\n")
    
    test_results = []
    
    # 각 테스트 실행
    test_results.append(("전략 패턴 임포트 테스트", test_editor_strategies_import()))
    test_results.append(("전략 초기화 테스트", test_strategy_initialization()))
    test_results.append(("개별 전략 테스트", test_individual_strategies()))
    test_results.append(("기존 코드 호환성 테스트", test_backward_compatibility()))
    test_results.append(("도구 기본 기능 테스트", test_tool_functionality()))
    
    # 결과 요약
    print("\n" + "="*60)
    print("=== 리팩토링 테스트 결과 요약 ===")
    print("="*60)
    
    success_count = 0
    for test_name, result in test_results:
        status = "[OK] 성공" if result else "[ERR] 실패"
        print(f"{test_name}: {status}")
        if result:
            success_count += 1
    
    print(f"\n총 {len(test_results)}개 테스트 중 {success_count}개 성공")
    
    if success_count == len(test_results):
        print(">>> 모든 테스트 통과! Strategy Pattern 리팩토링 성공!")
    else:
        print(">>> 일부 테스트 실패. 문제 해결이 필요합니다.")
    
    return success_count == len(test_results)

if __name__ == "__main__":
    main()