import zipfile, os, shutil, xml.etree.ElementTree as ET
import tempfile
import json
import re
from typing import List, Tuple, Optional
from pathlib import Path
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from dotenv import load_dotenv

load_dotenv()

# HWPX 문서용 네임스페이스 정의 (다양한 버전 지원)
NS_VARIANTS = [
    {'w': 'http://www.hancom.co.kr/hwpml/2010/section'},
    {'w': 'http://www.hancom.co.kr/hwpml/2011/section'},
    {'w': 'http://www.hancom.co.kr/hwpml/2012/section'},
    {'hp': 'http://www.hancom.co.kr/hwpml/2010/paragraph'},
    {'hs': 'http://www.hancom.co.kr/hwpml/2010/structure'},
]

# 기본 네임스페이스
NS = NS_VARIANTS[0]
for ns_dict in NS_VARIANTS:
    for prefix, uri in ns_dict.items():
        ET.register_namespace(prefix, uri)

@tool   
def edit_hwpx(hwpx_path: str, user_query: str) -> str:
    """
    .hwpx 한글 문서 파일을 불러와 사용자 지시문에 따라 문서를 수정하는 도구
    """
    try:
        print(f"edit_hwpx called: {hwpx_path}, {user_query}")
        
        # 1. 파일 존재 확인
        if not os.path.exists(hwpx_path):
            return f"[Error] 파일을 찾을 수 없습니다: {hwpx_path}"
            
        # 2. 임시 디렉토리 생성 (더 안전한 방법)
        with tempfile.TemporaryDirectory() as temp_dir:
            base_name = Path(hwpx_path).stem
            extract_dir = os.path.join(temp_dir, base_name)
            
            # 3. 압축 해제
            try:
                _extract_hwpx(hwpx_path, extract_dir)
                _analyze_hwpx_structure(extract_dir)  # 구조 분석 추가
            except Exception as e:
                return f"[Error] 압축 해제 실패: {e}"

            # 4. 다양한 XML 파일에서 텍스트 찾기 시도
            section_files = [
                'Contents/section0.xml',
                'Contents/content.xml',
                'Contents/header.xml',
                'docInfo.xml'
            ]
            
            paras, para_nodes, used_file = None, None, None
            
            for section_file in section_files:
                section_path = os.path.join(extract_dir, section_file)
                if os.path.exists(section_path):
                    try:
                        tree, root = _parse_section(section_path)
                        temp_paras, temp_nodes = _extract_paragraphs(root)
                        if temp_paras:  # 텍스트를 찾았다면
                            paras, para_nodes, used_file = temp_paras, temp_nodes, section_file
                            print(f"텍스트를 {section_file}에서 찾았습니다!")
                            break
                    except Exception as e:
                        print(f"{section_file} 처리 중 오류: {e}")
                        continue
            
            if not paras:
                return "[Error] 어떤 XML 파일에서도 본문 텍스트를 찾을 수 없습니다"

            # 5. LLM을 통한 수정
            try:
                revised_content = _get_llm_revisions(paras, user_query)
                if not revised_content:
                    return "[Error] LLM 수정 결과가 없습니다"
            except Exception as e:
                return f"[Error] LLM 호출 실패: {e}"

            # 6. 수정 적용
            try:
                _apply_revisions_improved(root, para_nodes, revised_content)
                
                # 사용된 파일에 다시 저장
                final_section_path = os.path.join(extract_dir, used_file)
                tree.write(final_section_path, encoding='utf-8', xml_declaration=True)
                
                # Preview 업데이트
                preview_path = os.path.join(extract_dir, 'Preview', 'PrvText.txt')
                if os.path.exists(os.path.dirname(preview_path)):
                    _write_preview(preview_path, revised_content)
                    
            except Exception as e:
                return f"[Error] 문서 수정 실패: {e}"

            # 7. 재압축 (더 안전한 경로)
            try:
                output_path = _repack_hwpx_improved(extract_dir, hwpx_path)
                return f"수정 완료: {output_path}"
            except Exception as e:
                return f"[Error] 재압축 실패: {e}"

    except Exception as e:
        return f"[Error] 알 수 없는 오류: {e}"


def _analyze_hwpx_structure(extract_dir: str):
    """HWPX 파일 구조 분석"""
    print("=== HWPX 파일 구조 분석 ===")
    
    # 폴더 구조 확인
    for root, dirs, files in os.walk(extract_dir):
        level = root.replace(extract_dir, '').count(os.sep)
        indent = ' ' * 2 * level
        print(f"{indent}{os.path.basename(root)}/")
        subindent = ' ' * 2 * (level + 1)
        for file in files:
            file_path = os.path.join(root, file)
            try:
                size = os.path.getsize(file_path)
                print(f"{subindent}{file} ({size} bytes)")
            except:
                print(f"{subindent}{file}")
    
    # 주요 XML 파일들 확인
    xml_files_to_check = [
        'Contents/section0.xml',
        'Contents/header.xml', 
        'Contents/footer.xml',
        'Contents/content.xml',
        'docInfo.xml',
        'META-INF/manifest.xml'
    ]
    
    for xml_file in xml_files_to_check:
        xml_path = os.path.join(extract_dir, xml_file)
        if os.path.exists(xml_path):
            print(f"\n=== {xml_file} 분석 ===")
            try:
                tree = ET.parse(xml_path)
                root = tree.getroot()
                print(f"루트 태그: {root.tag}")
                print(f"네임스페이스: {root.nsmap if hasattr(root, 'nsmap') else '확인불가'}")
                
                # 텍스트 노드 찾기
                all_elements = list(root.iter())
                text_elements = [elem for elem in all_elements if elem.text and elem.text.strip()]
                
                print(f"전체 요소 수: {len(all_elements)}")
                print(f"텍스트가 있는 요소 수: {len(text_elements)}")
                
                # 샘플 텍스트 출력
                for i, elem in enumerate(text_elements[:5]):
                    tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
                    print(f"  {tag}: '{elem.text.strip()[:50]}...'")
                    
            except Exception as e:
                print(f"파싱 오류: {e}")
        else:
            print(f"{xml_file}: 존재하지 않음")
    
    print("==========================")


def _extract_hwpx(zip_path: str, target_dir: str):
    """HWPX 파일 압축 해제"""
    os.makedirs(target_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(target_dir)


def _parse_section(xml_path: str) -> Tuple[ET.ElementTree, ET.Element]:
    """XML 파일 파싱"""
    tree = ET.parse(xml_path)
    return tree, tree.getroot()


def _extract_paragraphs(root) -> Tuple[List[str], List[ET.Element]]:
    """문단 추출 개선 - 다양한 HWPX 구조 지원"""
    paras, nodes = [], []
    
    # 디버깅: XML 구조 출력
    print("=== XML 구조 분석 ===")
    _debug_xml_structure(root)
    
    # 다양한 네임스페이스와 태그 조합으로 시도
    search_patterns = [
        # 표준 문단 패턴들
        ('.//w:p', './/w:t', NS),
        ('.//p', './/t', {}),  # 네임스페이스 없는 경우
        ('.//hp:p', './/hp:t', {'hp': 'http://www.hancom.co.kr/hwpml/2010/paragraph'}),
        # 다른 버전들
        ('.//w:para', './/w:text', NS),
        ('.//para', './/text', {}),
        # 섹션 내 직접 텍스트
        ('.//w:section//w:t', None, NS),
        ('.//section//t', None, {}),
    ]
    
    for i, (para_pattern, text_pattern, namespace) in enumerate(search_patterns):
        print(f"\n--- 패턴 {i+1} 시도: {para_pattern} ---")
        
        try:
            if text_pattern:
                # 문단 기반 검색
                para_elements = root.findall(para_pattern, namespace)
                print(f"발견된 문단 요소: {len(para_elements)}개")
                
                for j, p in enumerate(para_elements):
                    text_parts = []
                    text_elements = p.findall(text_pattern, namespace)
                    print(f"  문단 {j}의 텍스트 요소: {len(text_elements)}개")
                    
                    for t in text_elements:
                        if t.text:
                            text_parts.append(t.text)
                    
                    text = ''.join(text_parts).strip()
                    if text:
                        print(f"  추출된 텍스트: '{text[:50]}...'")
                        paras.append(text)
                        nodes.append(p)
            else:
                # 직접 텍스트 검색
                text_elements = root.findall(para_pattern, namespace)
                print(f"직접 텍스트 요소: {len(text_elements)}개")
                
                for t in text_elements:
                    if t.text and t.text.strip():
                        text = t.text.strip()
                        print(f"  발견된 텍스트: '{text[:50]}...'")
                        paras.append(text)
                        # 부모 요소를 노드로 사용
                        parent = t.getparent()
                        if parent not in nodes:
                            nodes.append(parent)
        
        except Exception as e:
            print(f"패턴 {i+1} 처리 중 오류: {e}")
            continue
        
        # 텍스트를 찾았으면 중단
        if paras:
            print(f"패턴 {i+1}에서 성공적으로 {len(paras)}개 문단 발견!")
            break
    
    # 마지막 수단: 모든 텍스트 노드 수집
    if not paras:
        print("\n--- 마지막 수단: 모든 텍스트 수집 ---")
        all_text_elements = []
        
        # 다양한 방법으로 텍스트 수집
        for element in root.iter():
            if element.text and element.text.strip():
                text = element.text.strip()
                # 의미있는 길이의 텍스트만 수집 (단순 공백이나 기호 제외)
                if len(text) > 2 and not text.isspace():
                    all_text_elements.append((text, element))
        
        print(f"수집된 텍스트 요소: {len(all_text_elements)}개")
        
        # 중복 제거하면서 추가
        seen_texts = set()
        for text, element in all_text_elements:
            if text not in seen_texts:
                seen_texts.add(text)
                paras.append(text)
                nodes.append(element)
                print(f"  추가된 텍스트: '{text[:50]}...'")
    
    print(f"\n최종 추출된 문단 수: {len(paras)}")
    for i, para in enumerate(paras):
        print(f"문단 {i}: '{para[:50]}...' (길이: {len(para)})")
    
    return paras, nodes


def _debug_xml_structure(root, max_depth=3, current_depth=0):
    """XML 구조 디버깅"""
    if current_depth > max_depth:
        return
    
    indent = "  " * current_depth
    tag = root.tag.split('}')[-1] if '}' in root.tag else root.tag
    
    # 텍스트 내용이 있으면 표시
    text_content = ""
    if root.text and root.text.strip():
        text_content = f" -> '{root.text.strip()[:30]}...'"
    
    print(f"{indent}<{tag}>{text_content}")
    
    # 자식 요소들 중 처음 몇 개만 표시
    children = list(root)
    for i, child in enumerate(children[:5]):  # 처음 5개만
        _debug_xml_structure(child, max_depth, current_depth + 1)
    
    if len(children) > 5:
        print(f"{indent}  ... (총 {len(children)}개 자식 요소)")
        
    if current_depth == 0:
        print("=== 전체 텍스트 노드 탐색 ===")
        all_texts = root.findall('.//w:t', NS)
        print(f"w:t 네임스페이스 텍스트 노드: {len(all_texts)}개")
        
        all_texts_no_ns = root.findall('.//t')
        print(f"네임스페이스 없는 t 노드: {len(all_texts_no_ns)}개")
        
        # 실제 텍스트 내용 샘플 출력
        for i, t in enumerate(all_texts[:10]):  # 처음 10개만
            if t.text and t.text.strip():
                print(f"  텍스트 {i}: '{t.text.strip()}'")
                
        if not all_texts:
            for i, t in enumerate(all_texts_no_ns[:10]):
                if t.text and t.text.strip():
                    print(f"  텍스트(no NS) {i}: '{t.text.strip()}'")
        
        print("========================")


def _get_llm_revisions(paragraphs: List[str], user_query: str) -> List[str]:
    """LLM 호출 개선 - JSON 형태로 응답 받기"""
    prompt = _build_improved_prompt(paragraphs, user_query)
    
    client = ChatOpenAI(model_name="gpt-4o", temperature=0)
    response = client.invoke(prompt)
    
    try:
        # JSON 응답 파싱 시도
        content = response.content.strip()
        
        # JSON 추출 (마크다운 코드 블록 제거)
        json_match = re.search(r'```json\s*(.*?)\s*```', content, re.DOTALL)
        if json_match:
            content = json_match.group(1)
        
        result = json.loads(content)
        return result.get('revised_paragraphs', paragraphs)
        
    except (json.JSONDecodeError, KeyError) as e:
        print(f"JSON 파싱 실패, 원본 반환: {e}")
        # 실패 시 기존 방식으로 폴백
        return _parse_legacy_format(response.content.strip(), paragraphs)


def _build_improved_prompt(paragraphs: List[str], instruction: str) -> str:
    """개선된 프롬프트 - JSON 형태로 요청"""
    context = '\n'.join(f"{i}: {p}" for i, p in enumerate(paragraphs))
    
    return f"""
다음은 한글 문서의 문단들입니다:

{context}

지시사항: "{instruction}"

위 지시사항에 따라 문서를 수정하고, 결과를 다음 JSON 형태로 반환해주세요:

```json
{{
    "revised_paragraphs": [
        "수정된 첫 번째 문단",
        "수정된 두 번째 문단",
        "..."
    ]
}}
```

주의사항:
1. 문단의 개수는 원본과 같아야 합니다
2. 수정이 불필요한 문단은 원본 그대로 유지해주세요
3. 완전히 새로운 내용으로 바꾸지 말고, 지시사항에 맞게만 수정해주세요
"""


def _parse_legacy_format(content: str, original_paragraphs: List[str]) -> List[str]:
    """기존 형식 파싱 (폴백용)"""
    revisions = {}
    
    for line in content.splitlines():
        line = line.strip()
        if line.startswith('[') and ']' in line:
            bracket_end = line.find(']')
            if bracket_end > 1:
                key = line[1:bracket_end].strip()
                content_part = line[bracket_end+1:].strip()
                
                if key.isdigit():
                    idx = int(key)
                    if 0 <= idx < len(original_paragraphs):
                        revisions[idx] = content_part
    
    # 수정된 내용 적용
    result = original_paragraphs.copy()
    for idx, new_content in revisions.items():
        result[idx] = new_content
    
    return result


def _apply_revisions_improved(root: ET.Element, para_nodes: List[ET.Element], revised_texts: List[str]):
    """수정 적용 개선"""
    min_length = min(len(para_nodes), len(revised_texts))
    
    for i in range(min_length):
        node = para_nodes[i]
        new_text = revised_texts[i]
        
        # 기존 텍스트 노드들 제거
        for t_elem in node.findall('.//w:t', NS):
            t_elem.getparent().remove(t_elem)
        
        # 새 텍스트 추가 (기존 run 구조 활용)
        run_elem = node.find('.//w:run', NS)
        if run_elem is None:
            # run이 없으면 새로 생성
            run_elem = _create_run(new_text)
            node.append(run_elem)
        else:
            # 기존 run에 새 텍스트 추가
            t_elem = ET.SubElement(run_elem, f"{{{NS['w']}}}t")
            t_elem.text = new_text


def _create_run(text: str) -> ET.Element:
    """텍스트 런 생성"""
    run = ET.Element(f"{{{NS['w']}}}run")
    t = ET.SubElement(run, f"{{{NS['w']}}}t")
    t.text = text
    return run


def _write_preview(preview_path: str, paragraphs: List[str]):
    """미리보기 텍스트 파일 업데이트"""
    try:
        os.makedirs(os.path.dirname(preview_path), exist_ok=True)
        full_text = '\n'.join(paragraphs)
        with open(preview_path, 'w', encoding='utf-8') as f:
            f.write(full_text)
    except Exception as e:
        print(f"미리보기 파일 쓰기 실패: {e}")


def _repack_hwpx_improved(extract_dir: str, original_path: str) -> str:
    """개선된 재압축 함수"""
    original_path = Path(original_path)
    output_dir = original_path.parent
    base_name = original_path.stem
    
    # 중복 파일명 처리
    counter = 1
    while True:
        output_name = f"{base_name}_modified_{counter}.hwpx"
        output_path = output_dir / output_name
        if not output_path.exists():
            break
        counter += 1
    
    # 압축
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arc_path = os.path.relpath(file_path, extract_dir)
                zipf.write(file_path, arc_path)
    
    return str(output_path.absolute())