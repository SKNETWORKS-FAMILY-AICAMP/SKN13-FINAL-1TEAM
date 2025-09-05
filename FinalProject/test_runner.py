#!/usr/bin/env python3
"""
테스트 실행 스크립트

이 스크립트는 모든 테스트 파일이 올바르게 임포트되고 실행될 수 있는지 확인합니다.
"""

import sys
import os
from pathlib import Path

# 프로젝트 루트 디렉토리를 Python 경로에 추가
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "backend"))

def test_imports():
    """모든 테스트 파일의 임포트 확인"""
    print("[TEST] 테스트 파일 임포트 확인 중...")
    
    test_files = [
        "tests.test_api",
        "tests.test_database", 
        "tests.test_agents",
        "tests.test_integration_advanced"
    ]
    
    import_results = []
    
    for test_module in test_files:
        try:
            __import__(test_module)
            import_results.append((test_module, True, None))
            print(f"[OK] {test_module} - 임포트 성공")
        except ImportError as e:
            import_results.append((test_module, False, str(e)))
            print(f"[ERROR] {test_module} - 임포트 실패: {e}")
        except Exception as e:
            import_results.append((test_module, False, f"Unexpected error: {e}"))
            print(f"[WARN] {test_module} - 예상치 못한 오류: {e}")
    
    return import_results

def run_basic_test():
    """기본 테스트 실행"""
    print("\n[RUN] 기본 테스트 실행 중...")
    
    try:
        import pytest
        
        # 테스트 디렉토리에서 간단한 테스트 실행
        test_command = [
            "-v", 
            "--tb=short",
            "tests/test_api.py::TestAuthRoutes::test_login_success",
            "-x"  # 첫 번째 실패에서 중단
        ]
        
        print(f"실행 명령: pytest {' '.join(test_command)}")
        
        # pytest를 프로그래밍 방식으로 실행
        exit_code = pytest.main(test_command)
        
        if exit_code == 0:
            print("[OK] 기본 테스트 성공")
        else:
            print(f"[ERROR] 기본 테스트 실패 (종료 코드: {exit_code})")
            
        return exit_code == 0
        
    except ImportError:
        print("[ERROR] pytest를 찾을 수 없습니다. pip install pytest로 설치해주세요.")
        return False
    except Exception as e:
        print(f"[ERROR] 테스트 실행 중 오류: {e}")
        return False

def check_environment():
    """환경 설정 확인"""
    print("[ENV] 환경 설정 확인 중...")
    
    # Python 버전
    python_version = sys.version
    print(f"Python 버전: {python_version}")
    
    # 필요한 패키지들 확인
    required_packages = [
        "pytest",
        "fastapi", 
        "sqlalchemy",
        "pydantic"
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package)
            print(f"[OK] {package} - 설치됨")
        except ImportError:
            missing_packages.append(package)
            print(f"[MISSING] {package} - 누락")
    
    if missing_packages:
        print(f"\n[WARN] 누락된 패키지: {', '.join(missing_packages)}")
        print("다음 명령으로 설치할 수 있습니다:")
        print(f"pip install {' '.join(missing_packages)}")
    
    return len(missing_packages) == 0

def main():
    """메인 함수"""
    print("=" * 60)
    print("FinalProject 테스트 시스템 검증")
    print("=" * 60)
    
    # 1. 환경 확인
    env_ok = check_environment()
    
    print("\n" + "-" * 60)
    
    # 2. 임포트 확인
    import_results = test_imports()
    
    print("\n" + "-" * 60)
    
    # 3. 기본 테스트 실행 (환경이 OK인 경우에만)
    test_ok = False
    if env_ok:
        test_ok = run_basic_test()
    else:
        print("[SKIP] 환경 설정 문제로 테스트를 건너뜁니다.")
    
    print("\n" + "=" * 60)
    print("최종 결과")
    print("=" * 60)
    
    # 결과 요약
    successful_imports = sum(1 for _, success, _ in import_results if success)
    total_imports = len(import_results)
    
    print(f"환경 설정: {'[OK]' if env_ok else '[ERROR] 문제 있음'}")
    print(f"임포트 성공: {successful_imports}/{total_imports}")
    print(f"기본 테스트: {'[OK] 성공' if test_ok else '[ERROR] 실패 또는 건너뜀'}")
    
    if successful_imports == total_imports and (test_ok or not env_ok):
        print("\n[SUCCESS] 테스트 시스템이 준비되었습니다!")
        if not env_ok:
            print("[INFO] 환경 설정을 완료한 후 실제 테스트를 실행해보세요.")
    else:
        print("\n[WARN] 일부 문제가 발견되었습니다. 위의 오류를 확인해주세요.")
    
    print("\n테스트 실행 방법:")
    print("  전체 테스트:     pytest tests/ -v")
    print("  API 테스트만:    pytest tests/test_api.py -v")
    print("  DB 테스트만:     pytest tests/test_database.py -v") 
    print("  Agent 테스트만:  pytest tests/test_agents.py -v")
    print("  통합 테스트만:   pytest tests/test_integration_advanced.py -v")
    print("  마커별 실행:     pytest -m unit -v  (또는 -m integration, -m api 등)")

if __name__ == "__main__":
    main()