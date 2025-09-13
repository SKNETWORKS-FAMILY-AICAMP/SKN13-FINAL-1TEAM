#!/usr/bin/env python3
"""
DocumentSearchAgent 자동 열기 기능 테스트 스크립트 (독립 실행)
"""

import re

def test_should_auto_open_editor(user_query):
    """사용자 쿼리에서 편집창 자동 열기 요청인지 확인"""
    print(f"[DEBUG] _should_auto_open_editor 호출됨. 쿼리: '{user_query}'")

    editor_patterns = [
        r'.*(문서편집창|편집창|에디터).*(띄워|열어|보여).*줘',
        r'.*(편집창|에디터).*(띄워|열어|오픈).*',
        r'.*편집창.*에.*띄워.*',
        r'.*편집창.*에서.*열.*'
    ]

    for i, pattern in enumerate(editor_patterns):
        match = re.search(pattern, user_query, re.IGNORECASE)
        print(f"[DEBUG] 패턴 {i+1}: {pattern} -> 매치: {bool(match)}")
        if match:
            print(f"[DEBUG] 매치된 부분: '{match.group()}'")
            return True

    print(f"[DEBUG] 편집창 패턴 매치 실패")
    return False

def test_is_editor_supported_file(document):
    """문서편집창에서 지원하는 파일 형식인지 확인"""
    filename = document.get('filename', '')
    supported_extensions = ['.md', '.txt', '.html', '.docx']

    for ext in supported_extensions:
        if filename.lower().endswith(ext):
            return True
    return False

# 테스트 설정
def main():
    print("=== DocumentSearchAgent 자동 열기 기능 테스트 ===")

    # 편집창 열기 패턴 테스트
    test_queries = [
        "공고문_2024년 미디어다양성조사 용역.md 문서편집창에 띄워줘",
        "공고문_2024년 미디어다양성조사 용역.md 편집창에 열어줘",
        "공고문_2024년 미디어다양성조사 용역.md 에디터에서 열어줘",
        "공고문_2024년 미디어다양성조사 용역.md 찾아줘"  # 일반 검색
    ]

    for query in test_queries:
        print(f"\n--- 테스트 쿼리: '{query}' ---")
        should_auto_open = test_should_auto_open_editor(query)
        print(f"자동 열기 여부: {should_auto_open}")

    print("\n=== 지원 파일 형식 테스트 ===")

    test_documents = [
        {"filename": "test.md", "extension": ".md"},
        {"filename": "test.txt", "extension": ".txt"},
        {"filename": "test.docx", "extension": ".docx"},
        {"filename": "test.html", "extension": ".html"},
        {"filename": "test.pdf", "extension": ".pdf"},  # 지원하지 않음
        {"filename": "test.xlsx", "extension": ".xlsx"}  # 지원하지 않음
    ]

    for doc in test_documents:
        is_supported = test_is_editor_supported_file(doc)
        print(f"{doc['filename']}: {'지원' if is_supported else '지원하지 않음'}")

if __name__ == "__main__":
    main()