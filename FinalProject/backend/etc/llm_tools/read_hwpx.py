import zipfile
import xml.etree.ElementTree as ET
from langchain_core.tools import tool
import os

@tool
def read_hwpx(file_path: str) -> str:
    """
    .hwpx 파일을 읽어 정보를 추출하는 LangChain 도구입니다.
    
    Args:
        file_path (str): 로컬 파일 경로 (.hwpx)

    Returns:
        str: 추출된 텍스트 또는 오류 메시지
    """

    try:
        # 경로 정규화
        file_path = os.path.normpath(file_path)
        print(f"read_hwpx called: {file_path}")

        if not os.path.exists(file_path):
            return f"Error: 파일이 존재하지 않습니다: {os.path.basename(file_path)}"

        with zipfile.ZipFile(file_path, 'r') as z:
            # 섹션 XML 파일들 수집 (보통 section0.xml, section1.xml ...)
            section_files = sorted([
                name for name in z.namelist()
                if name.startswith("Contents/section") and name.endswith(".xml")
            ])

            if not section_files:
                return f"Error: .hwpx 파일 내부에 본문 XML(section*.xml)이 없습니다."

            texts = []
            namespace = {"hp": "http://www.hancom.co.kr/hwpml/2011/paragraph"}

            for section in section_files:
                print(f"[read_hwpx] parsing section: {section}")
                with z.open(section) as xml_file:
                    try:
                        tree = ET.parse(xml_file)
                        root = tree.getroot()
                        for elem in root.findall('.//hp:t', namespaces=namespace):
                            if elem.text:
                                texts.append(elem.text)
                    except ET.ParseError as e:
                        print(f"[read_hwpx] XML 파싱 실패: {section}, error: {e}")
                        continue

            if not texts:
                return f"Error: 텍스트를 추출하지 못했습니다. 문서에 본문이 없거나 구조가 예상과 다릅니다."

            return '\n'.join(texts)

    except zipfile.BadZipFile:
        return f"Error: 유효하지 않은 .hwpx 파일입니다 (ZIP 형식 오류)."

    except Exception as e:
        return f"Error: 알 수 없는 오류 발생: {e}"
