#!/usr/bin/env python3
"""
에러 핸들링 개선 테스트
간단하고 실용적인 에러 처리 검증
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_error_handler_imports():
    """에러 핸들러 임포트 테스트"""
    print("=== Error Handler 임포트 테스트 ===")
    
    try:
        from backend.ChatBot.utils.error_handler import (
            ChatBotError, ErrorType, safe_execute, error_handler,
            handle_llm_error, handle_tool_error, create_error_response
        )
        print("[OK] 모든 에러 핸들러 컴포넌트 임포트 성공")
        return True
        
    except Exception as e:
        print(f"[ERR] 에러 핸들러 임포트 실패: {str(e)}")
        return False

def test_safe_execute():
    """safe_execute 함수 테스트"""
    print("\n=== safe_execute 테스트 ===")
    
    try:
        from backend.ChatBot.utils.error_handler import safe_execute
        
        # 정상 실행 테스트
        def success_func(x, y):
            return x + y
        
        result = safe_execute(success_func, 5, 3, fallback_value=0)
        if result == 8:
            print("[OK] safe_execute 정상 실행 성공")
        else:
            print(f"[ERR] safe_execute 결과 이상: {result}")
            return False
        
        # 에러 발생 테스트
        def error_func():
            raise ValueError("테스트 에러")
        
        result = safe_execute(error_func, fallback_value="fallback")
        if result == "fallback":
            print("[OK] safe_execute 에러 처리 성공")
        else:
            print(f"[ERR] safe_execute 에러 처리 실패: {result}")
            return False
        
        return True
        
    except Exception as e:
        print(f"[ERR] safe_execute 테스트 실패: {str(e)}")
        return False

def test_error_classification():
    """에러 분류 테스트"""
    print("\n=== 에러 분류 테스트 ===")
    
    try:
        from backend.ChatBot.utils.error_handler import handle_llm_error, get_user_friendly_message
        
        # Rate limit 에러 테스트
        rate_limit_error = Exception("Rate limit exceeded")
        result = handle_llm_error(rate_limit_error)
        
        if result["error_type"] == "llm_error" and result["retry_suggested"]:
            print("[OK] Rate limit 에러 분류 성공")
        else:
            print(f"[ERR] Rate limit 에러 분류 실패: {result}")
            return False
        
        # API 키 에러 테스트
        api_error = Exception("Invalid API key")
        result = handle_llm_error(api_error)
        
        if not result["retry_suggested"]:
            print("[OK] API 키 에러 분류 성공")
        else:
            print(f"[ERR] API 키 에러 분류 실패: {result}")
            return False
        
        # 사용자 친화적 메시지 테스트
        friendly_msg = get_user_friendly_message(rate_limit_error)
        if "대기" in friendly_msg or "잠시" in friendly_msg:
            print("[OK] 사용자 친화적 메시지 생성 성공")
        else:
            print(f"[ERR] 사용자 친화적 메시지 생성 실패: {friendly_msg}")
            return False
        
        return True
        
    except Exception as e:
        print(f"[ERR] 에러 분류 테스트 실패: {str(e)}")
        return False

def test_custom_error():
    """커스텀 에러 클래스 테스트"""
    print("\n=== ChatBotError 클래스 테스트 ===")
    
    try:
        from backend.ChatBot.utils.error_handler import ChatBotError, ErrorType, create_error_response
        
        # ChatBotError 생성
        custom_error = ChatBotError(
            "테스트 에러 메시지",
            ErrorType.VALIDATION_ERROR,
            {"field": "test_field"}
        )
        
        if custom_error.error_type == ErrorType.VALIDATION_ERROR:
            print("[OK] ChatBotError 생성 성공")
        else:
            print(f"[ERR] ChatBotError 속성 설정 실패: {custom_error.error_type}")
            return False
        
        # 에러 응답 생성 테스트
        response = create_error_response(custom_error, "test_context")
        
        if (response["success"] == False and 
            response["error_type"] == ErrorType.VALIDATION_ERROR and
            response["context"] == "test_context"):
            print("[OK] 커스텀 에러 응답 생성 성공")
        else:
            print(f"[ERR] 커스텀 에러 응답 생성 실패: {response}")
            return False
        
        return True
        
    except Exception as e:
        print(f"[ERR] 커스텀 에러 테스트 실패: {str(e)}")
        return False

def test_decorator():
    """에러 핸들링 데코레이터 테스트"""
    print("\n=== 에러 핸들링 데코레이터 테스트 ===")
    
    try:
        from backend.ChatBot.utils.error_handler import error_handler, ErrorType
        
        @error_handler(ErrorType.TOOL_ERROR, fallback_value="데코레이터 fallback")
        def decorated_error_func():
            raise RuntimeError("데코레이터 테스트 에러")
        
        result = decorated_error_func()
        
        if result == "데코레이터 fallback":
            print("[OK] 에러 핸들링 데코레이터 성공")
        else:
            print(f"[ERR] 에러 핸들링 데코레이터 실패: {result}")
            return False
        
        return True
        
    except Exception as e:
        print(f"[ERR] 데코레이터 테스트 실패: {str(e)}")
        return False

def main():
    """전체 에러 핸들링 테스트 실행"""
    print("=== 에러 핸들링 개선 테스트 시작 ===\n")
    
    test_results = []
    
    # 각 테스트 실행
    test_results.append(("에러 핸들러 임포트 테스트", test_error_handler_imports()))
    test_results.append(("safe_execute 테스트", test_safe_execute()))
    test_results.append(("에러 분류 테스트", test_error_classification()))
    test_results.append(("커스텀 에러 테스트", test_custom_error()))
    test_results.append(("데코레이터 테스트", test_decorator()))
    
    # 결과 요약
    print("\n" + "="*50)
    print("=== 에러 핸들링 테스트 결과 요약 ===")
    print("="*50)
    
    success_count = 0
    for test_name, result in test_results:
        status = "[OK] 성공" if result else "[ERR] 실패"
        print(f"{test_name}: {status}")
        if result:
            success_count += 1
    
    print(f"\n총 {len(test_results)}개 테스트 중 {success_count}개 성공")
    
    if success_count == len(test_results):
        print(">>> 모든 테스트 통과! 에러 핸들링 개선 완료!")
    else:
        print(">>> 일부 테스트 실패. 문제 해결이 필요합니다.")
    
    return success_count == len(test_results)

if __name__ == "__main__":
    main()