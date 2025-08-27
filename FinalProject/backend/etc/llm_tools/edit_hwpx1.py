import os
import zipfile
import tempfile
import xml.etree.ElementTree as ET
import base64
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage
from dotenv import load_dotenv

load_dotenv()

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

@tool
def edit_hwpx(file_path: str, instruction: str) -> str:
    """
    주어진 HWPX 파일의 본문 내용을 instruction에 따라 수정합니다.
    
    Args:
        file_path (str): 수정할 HWPX 파일 경로
        instruction (str): 자연어 명령어 (예: "두 번째 문단을 삭제해줘")
    
    Returns:
        str: 수정된 HWPX 파일의 base64 인코딩 문자열
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        # 1. 압축 해제
        with zipfile.ZipFile(file_path, 'r') as zip_ref:
            zip_ref.extractall(tmpdir)
        
        # 2. content.xml 본문 로드
        content_path = os.path.join(tmpdir, 'Contents', 'content.xml')
        tree = ET.parse(content_path)
        root = tree.getroot()
        namespace = {'w': 'http://www.hancom.co.kr/hwpml/2010/contents'}

        body = root.find('.//w:body', namespace)
        if body is None:
            raise ValueError("본문(body)을 찾을 수 없습니다.")

        # 3. LLM에게 내용 수정 요청
        body_xml_str = ET.tostring(body, encoding='unicode')
        messages = [
            {"role": "system", "content": "너는 XML 전문 수정기야. 본문 XML을 instruction에 따라 고쳐줘."},
            {"role": "user", "content": f"다음은 수정 지시야:\n{instruction}"},
            {"role": "user", "content": f"수정할 원본 XML은 다음과 같아:\n{body_xml_str}"},
        ]
        response: AIMessage = llm.invoke(messages)

        # 4. 수정된 XML 적용
        new_body = ET.fromstring(response.content)
        parent = root.find('.//w:body/..', namespace)
        if parent is None:
            raise ValueError("본문의 부모 노드를 찾을 수 없습니다.")
        for i, elem in enumerate(parent):
            if elem.tag.endswith('body'):
                parent[i] = new_body
                break

        # 5. 수정된 content.xml 저장
        tree.write(content_path, encoding='utf-8', xml_declaration=True)

        # 6. 재압축 → HWPX
        result_hwpx = os.path.join(tmpdir, 'edited.hwpx')
        with zipfile.ZipFile(result_hwpx, 'w', zipfile.ZIP_DEFLATED) as new_zip:
            for foldername, _, filenames in os.walk(tmpdir):
                for filename in filenames:
                    file_path = os.path.join(foldername, filename)
                    arcname = os.path.relpath(file_path, tmpdir)
                    new_zip.write(file_path, arcname)

        # 7. base64로 인코딩 후 반환
        with open(result_hwpx, 'rb') as f:
            encoded = base64.b64encode(f.read()).decode('utf-8')

        return encoded
