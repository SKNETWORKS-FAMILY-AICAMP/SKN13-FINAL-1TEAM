import fitz  # PyMuPDF
import camelot
from pathlib import Path
from tqdm import tqdm
from PIL import Image
import pandas as pd
import logging
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
import base64
import os
from io import BytesIO
import re
from typing import List, Optional, Tuple

# ======================== 로깅 ========================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ======================== tabula 옵션 ========================
try:
    import tabula
    TABULA_AVAILABLE = True
    logger.info("tabula-py 사용 가능")
except ImportError:
    TABULA_AVAILABLE = False
    logger.warning("tabula-py 미설치. pip install tabula-py 권장")

# ======================== OpenAI 설정 ========================
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    logger.warning("OPENAI_API_KEY 환경 변수가 없음")

# langchain-openai 최신 버전은 model 또는 model_name 모두 가능
llm = ChatOpenAI(api_key=api_key, model_name="gpt-4o", request_timeout=120)

# ======================== 상수/정규식 ========================
UNIT_HINT_RE = re.compile(r'단위\s*[:：]\s*([^\n\)\]]+)', re.IGNORECASE)
MD_TABLE_SEP_RE = re.compile(r'^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$', re.MULTILINE)
SERIES_GARBAGE_RE = re.compile(r'^Name:\s*\d+,\s*dtype:\s*object\.?$', re.IGNORECASE)

SKIP_TOKENS = {'', '-', 'na', 'nan', '<na>', '<NA>', 'n/a', '—'}
TOTAL_ROW_TOKENS = {'합계', '총계', '계', '소계', '누계'}
UNIT_TOKENS = ['원', '천원', '백만원', '억원', 'krw', 'usd', '%']

HEADING_RE = re.compile(r'^\s{0,3}#{1,6}\s+')
CAPTION_RE = re.compile(r'^\s*(표|그림|도표)\s*제목\s*[:：]', re.IGNORECASE)
PAGE_RE = re.compile(r'^\s*(페이지|page)\s*\d+', re.IGNORECASE)
BULLET_EMPTY_RE = re.compile(r'^\s*[-*]\s*$')

def _norm_ws(s: str) -> str:
    """문자열 내부의 연속 공백/개행/탭을 단일 공백으로 정규화한다.

    Parameters:
        s (str): 정규화할 원본 문자열

    Returns:
        str: 공백이 정리된 문자열
    """
    return re.sub(r'\s+', ' ', (s or '')).strip()

# ======================== 단위 탐지 ========================
def detect_unit_hint(text: str, headers: Optional[List[str]] = None, default_unit: Optional[str] = None) -> Optional[str]:
    """본문 텍스트 또는 헤더에서 수치 단위(예: 원, %, USD 등)를 추정한다.

    우선 정규식으로 "단위:" 패턴을 탐지하고, 없으면 사전 정의된 단위 토큰을
    본문/헤더에서 검색한다. 명시적 단서가 없고 기본 단위가 제공되면 기본 단위를 반환한다.

    Parameters:
        text (str): 페이지의 전체 텍스트 등 단위 단서를 포함할 수 있는 문자열
        headers (Optional[List[str]]): 표의 헤더 목록 (단위 단서 보조 입력)
        default_unit (Optional[str]): 단서를 찾지 못했을 때 사용할 기본 단위

    Returns:
        Optional[str]: 탐지된 단위 문자열 또는 None
    """
    m = UNIT_HINT_RE.search(text or "")
    if m:
        return m.group(1).strip()

    candidate_zone = (text or "")
    if headers:
        candidate_zone += "\n" + "\n".join([str(h) for h in headers])
    for tok in UNIT_TOKENS:
        if re.search(re.escape(tok), candidate_zone, flags=re.IGNORECASE):
            return tok

    if default_unit:
        return default_unit.strip()
    return None

# ======================== 표 감지 휴리스틱 ========================
def is_likely_table(page: fitz.Page, text: str) -> bool:
    """해당 페이지가 표를 포함할 '가능성'이 높은지 간단한 휴리스틱으로 판단한다.

    - 줄 내 두 칸 이상의 공백이 일정 비율 이상이면 열 정렬 텍스트로 간주
    - 페이지 도형 중 수평/수직 선분 개수가 임계치 이상이면 표 그리드로 간주

    Parameters:
        page (fitz.Page): PDF 페이지 객체
        text (str): 페이지의 추출 텍스트

    Returns:
        bool: 표 가능성 여부
    """
    lines = text.strip().split('\n')
    if len(lines) > 3:
        space_separated = sum(1 for line in lines if len(re.findall(r'\s{2,}', line)) >= 2)
        if space_separated / len(lines) > 0.4:
            return True
    paths = page.get_drawings()
    h_lines, v_lines = 0, 0
    for path in paths:
        for item in path['items']:
            if item[0] == 'l':
                p1, p2 = item[1], item[2]
                if abs(p1.y - p2.y) < 2: h_lines += 1
                elif abs(p1.x - p2.x) < 2: v_lines += 1
    return h_lines > 5 and v_lines > 2

# ======================== 표 추출 도구 ========================
def extract_tables_with_multiple_tools(pdf_path: Path, page_num: int) -> List[Tuple[pd.DataFrame, str, Tuple]]:
    """여러 라이브러리(Camelot, Tabula)를 순차 시도하여 표를 추출한다.

    우선 Camelot Lattice, 실패 시 Tabula Lattice(설치 시), 마지막으로
    Camelot Stream을 시도한다. 성공 시 DataFrame, 사용 도구명, 경계 박스를 반환한다.

    Parameters:
        pdf_path (Path): 대상 PDF 파일 경로
        page_num (int): 0 기반 페이지 인덱스

    Returns:
        List[Tuple[pd.DataFrame, str, Tuple]]: (표 DF, 사용 방법 문자열, bbox) 목록
    """
    out = []
    try:
        # 1) Camelot Lattice: 격자형 표에 강함
        tables = camelot.read_pdf(str(pdf_path), pages=str(page_num + 1), flavor='lattice')
        if tables.n > 0:
            logger.info(f"p{page_num+1}: Camelot Lattice {tables.n}개")
            for t in tables:
                out.append((t.df, "Camelot-Lattice", t._bbox))
            return out
    except Exception as e:
        logger.debug(f"Camelot Lattice 오류: {e}")

    if TABULA_AVAILABLE:
        try:
            # 2) Tabula Lattice: Java 기반, 환경에 따라 더 안정적인 경우가 있음
            dfs = tabula.read_pdf(str(pdf_path), pages=page_num + 1, lattice=True, multiple_tables=True)
            if dfs:
                logger.info(f"p{page_num+1}: Tabula Lattice {len(dfs)}개")
                for df in dfs:
                    out.append((df, "Tabula-Lattice", (0, 0, 1, 1)))
                return out
        except Exception as e:
            logger.debug(f"Tabula Lattice 오류: {e}")

    try:
        # 3) Camelot Stream: 선이 없는 자유형 표에 유리
        tables = camelot.read_pdf(str(pdf_path), pages=str(page_num + 1), flavor='stream', edge_tol=500)
        if tables.n > 0:
            logger.info(f"p{page_num+1}: Camelot Stream {tables.n}개")
            for t in tables:
                out.append((t.df, "Camelot-Stream", t._bbox))
            return out
    except Exception as e:
        logger.debug(f"Camelot Stream 오류: {e}")

    return []

# ======================== DF 정리 및 단문화 ========================
def _basic_clean_df(df: pd.DataFrame) -> Optional[pd.DataFrame]:
    """표 DataFrame을 벡터화 전처리에 적합하도록 기본 정리한다.

    수행 내용:
        - 셀 내부 공백/개행 정규화
        - 공백/결측 전열/전행 제거 및 인덱스 리셋
        - 첫 행이 헤더로 보이는 경우 헤더 승격
        - 모든 값을 문자열로 통일

    Parameters:
        df (pd.DataFrame): 원본 표 데이터프레임

    Returns:
        Optional[pd.DataFrame]: 정리된 DF 또는 유효하지 않으면 None
    """
    if df is None or df.empty:
        return None
    df = df.copy()

    # 셀 내부 개행/탭 정규화. DataFrame.apply + Series.map 사용으로 경고 회피
    def _cell_norm(x):
        return _norm_ws(str(x)) if pd.notna(x) else x
    df = df.apply(lambda col: col.map(_cell_norm))

    df.replace(r'^\s*$', pd.NA, regex=True, inplace=True)
    df.dropna(how='all', axis=0, inplace=True)
    df.dropna(how='all', axis=1, inplace=True)
    df.reset_index(drop=True, inplace=True)
    if df.empty:
        return None

    # 숫자형 인덱스 컬럼이면 첫 행을 헤더로 승격
    if all(isinstance(c, int) for c in df.columns):
        header = df.iloc[0].fillna('')
        df = df.iloc[1:].copy()
        df.columns = header
        df.reset_index(drop=True, inplace=True)

    try:
        df = df.astype(str)
    except Exception:
        df = df.apply(lambda col: col.map(lambda x: '' if pd.isna(x) else str(x)))

    return df if df.shape[0] >= 1 and df.shape[1] >= 1 else None

def _should_skip_value(v: str) -> bool:
    """값이 벡터 인덱싱에 불필요한 토큰(빈값, na 등)인지 판별한다.

    Parameters:
        v (str): 검사할 텍스트 값

    Returns:
        bool: 스킵 여부
    """
    s = (v or '').strip().lower()
    return s in SKIP_TOKENS

def _is_total_row(key: str) -> bool:
    """행의 키가 합계/총계/소계 등 집계 행인지 확인한다.

    Parameters:
        key (str): 행 첫 열의 식별 문자열

    Returns:
        bool: 집계 행 여부
    """
    k = (key or '').strip()
    return any(tok in k for tok in TOTAL_ROW_TOKENS)

def df_to_sentences(df: pd.DataFrame, unit_hint_text: Optional[str] = None, row_header_idx: int = 0) -> List[str]:
    """표 DataFrame을 "주어(행 헤더), 열 헤더 값 [단위]." 형태의 단문들로 변환한다.

    Parameters:
        df (pd.DataFrame): 원본 표
        unit_hint_text (Optional[str]): 단위 힌트로 사용할 텍스트(페이지 본문 등)
        row_header_idx (int): 행 키로 사용할 열의 인덱스(기본 0)

    Returns:
        List[str]: 단문 리스트
    """
    df = _basic_clean_df(df)
    if df is None:
        return []
    headers = [str(h).strip() for h in df.columns]
    unit = detect_unit_hint(unit_hint_text or "", headers=headers, default_unit=None)

    out: List[str] = []
    for _, row in df.iterrows():
        row_vals = [str(row.get(h, '')).strip() for h in headers]
        if row_header_idx >= len(row_vals):
            continue
        row_key = row_vals[row_header_idx].strip()
        if not row_key or _is_total_row(row_key):
            continue
        for c_idx, h in enumerate(headers):
            if c_idx == row_header_idx:
                continue
            col = str(h).strip()
            val = row_vals[c_idx].strip()
            if _should_skip_value(val) or SERIES_GARBAGE_RE.match(val):
                continue
            unit_str = f' {unit}' if unit else ''
            out.append(f'{row_key}, {col} {val}{unit_str}.')
    return out

def md_table_to_sentences(md_block: str, unit_hint_text: Optional[str]) -> List[str]:
    """마크다운 표 블록을 행 기반 단문 리스트로 변환한다.

    헤더와 데이터 행의 열 길이를 맞춘 뒤, 합계/빈값 등을 제외하고
    "행키, 열헤더 값 [단위]." 포맷으로 변환한다.

    Parameters:
        md_block (str): 마크다운 표 텍스트 블록
        unit_hint_text (Optional[str]): 단위 힌트로 사용할 텍스트

    Returns:
        List[str]: 단문 리스트
    """
    lines = [ln for ln in md_block.splitlines() if ln.strip()]
    table_lines = [ln for ln in lines if ln.count('|') >= 2 and not ln.strip().startswith('```')]
    table_lines = [ln for ln in table_lines if not MD_TABLE_SEP_RE.match(ln)]
    if not table_lines:
        return []
    def split_row(line: str) -> List[str]:
        s = line.strip()
        if s.startswith('|'): s = s[1:]
        if s.endswith('|'): s = s[:-1]
        return [c.strip() for c in s.split('|')]
    rows = [split_row(ln) for ln in table_lines]
    rows = [r for r in rows if any(c.strip() for c in r)]
    if not rows:
        return []
    headers = rows[0]
    data = rows[1:] if len(rows) > 1 else []
    max_len = max(len(r) for r in rows)
    headers += [''] * (max_len - len(headers))
    data = [r + [''] * (max_len - len(r)) for r in data]

    unit = detect_unit_hint(unit_hint_text or "", headers=headers, default_unit=None)

    out: List[str] = []
    for r in data:
        row_key = r[0].strip()
        if not row_key or _is_total_row(row_key):
            continue
        for c_idx in range(1, len(headers)):
            val = r[c_idx].strip()
            if _should_skip_value(val) or SERIES_GARBAGE_RE.match(val):
                continue
            col = headers[c_idx].strip()
            unit_str = f' {unit}' if unit else ''
            out.append(f'{row_key}, {col} {val}{unit_str}.')
    return out

# ======================== 이미지 프롬프트 ========================
IMAGE_PROMPT_KO = """당신은 시각 자료를 객관적인 문장(줄글)으로 상세하게 묘사하는 AI 어시스턴트입니다. 당신의 임무는 아래 이미지의 모든 시각적 정보를 빠짐없이 사람이 설명해주듯이 서술하는 것입니다.
이 결과는 벡터 데이터베이스에 사용되므로, 당신의 주관적인 해석이나 평가는 절대 포함되어서는 안 됩니다.

당신의 작업 지침:
1. 이미지 종류 판단: 이미지가 의미 있는 정보(그래프, 차트, 사진 등)인지, 의미 없는 장식용(로고, 배경 등)인지 먼저 판단해주세요. 의미 없는 이미지라면, 다른 설명 없이 오직 "배경 이미지" 라고만 응답해주세요.
2. 자연스러운 묘사(의미 있는 이미지일 경우):
   - 그래프/차트의 경우, 다음 정보를 포함하여 줄글로 설명해주세요: 그래프의 제목과 종류, 각 축의 정보와 단위, 각 데이터 포인트, 범례(Legend) 등
   - 일반 사진/다이어그램: 보이는 그대로의 상황, 객체, 인물, 배경, 그리고 이미지 내 텍스트를 자연스러운 문장으로 설명해주세요.
3. 엄격한 제한사항: 절대 이미지의 의미를 해석하거나, 경향을 분석하거나, 결론을 도출하지 마세요.

위 지침을 엄격히 따라서 자연스러운 한국어 줄글로 결과를 생성해주세요.
"""

def analyze_page_image_caption(page_image: Image.Image, page_num: int) -> Optional[str]:
    """페이지 전체 이미지를 입력으로 받아 LLM을 통해 캡션(객관 묘사)을 생성한다.

    의미 없는 장식 이미지는 "배경 이미지"로 간주되며, 해당 결과는 None으로 처리한다.

    Parameters:
        page_image (PIL.Image.Image): 페이지 렌더링 이미지
        page_num (int): 0 기반 페이지 번호 (로깅용)

    Returns:
        Optional[str]: 유의미한 이미지 설명 문단 또는 None
    """
    try:
        buffer = BytesIO()
        page_image.save(buffer, format="PNG")
        img_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        messages = [HumanMessage(content=[
            {"type": "text", "text": IMAGE_PROMPT_KO},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}}
        ])]
        result = llm.invoke(messages).content.strip()
        if result and "배경 이미지" not in result:
            return result
        return None
    except Exception as e:
        logger.error(f"이미지 캡션 생성 오류: {e}")
        return None

# ======================== 텍스트 추출 보조 ========================
def extract_text_outside_bboxes(page: fitz.Page, bboxes: List[Tuple]) -> str:
    """지정된 박스 영역을 제외한 페이지 텍스트만 모아서 반환한다.

    표가 검출된 영역(bboxes)을 제외하고 본문 텍스트만 추출할 때 사용한다.

    Parameters:
        page (fitz.Page): PDF 페이지 객체
        bboxes (List[Tuple]): 제외할 사각형 영역 리스트 (x1, y1, x2, y2)

    Returns:
        str: 제외 영역 밖의 텍스트
    """
    full_text = ""
    blocks = page.get_text("blocks")
    for x1, y1, x2, y2, text, _, _ in blocks:
        rect = fitz.Rect(x1, y1, x2, y2)
        inside = any(fitz.Rect(bx1, by1, bx2, by2).intersects(rect) for bx1, by1, bx2, by2 in bboxes)
        if not inside:
            full_text += text + "\n"
    return full_text.strip()

def is_cover_page(text: str) -> bool:
    """해당 텍스트가 표지 페이지로 보이는지 간단한 규칙으로 판정한다.

    - 길이가 매우 짧고 "보고서", "report", "제출" 등의 키워드 포함

    Parameters:
        text (str): 페이지 텍스트

    Returns:
        bool: 표지 페이지로 추정되면 True
    """
    return len(text) < 300 and any(k in text.lower() for k in ['보고서', 'report', '제출'])

def is_toc_page(text: str) -> bool:
    """해당 텍스트가 목차 페이지인지 간단한 규칙으로 판정한다.

    - "목차" 또는 "contents" 키워드 포함
    - 점선 + 페이지 번호 패턴이 다수 존재

    Parameters:
        text (str): 페이지 텍스트

    Returns:
        bool: 목차 페이지로 추정되면 True
    """
    return '목차' in text or 'contents' in text.lower() or len(re.findall(r'\.{5,}\s*\d+', text)) > 3

def correct_text_with_llm(text_to_correct: str) -> str:
    """OCR/줄바꿈 오류가 포함된 텍스트를 LLM으로 자연스럽게 교정한다.

    의미는 바꾸지 않고 띄어쓰기/줄바꿈/경미한 OCR 오류만 수정하도록 프롬프트한다.

    Parameters:
        text_to_correct (str): 교정 대상 텍스트

    Returns:
        str: 교정된 텍스트 (실패 시 원문)
    """
    if not text_to_correct.strip():
        return ""
    prompt = (
        "다음은 PDF에서 추출된 텍스트입니다. OCR 및 줄바꿈 오류를 수정하되, 의미와 내용은 변경하지 마세요.\n\n"
        "[원문]\n" + text_to_correct + "\n\n[교정]"
    )
    try:
        return llm.invoke([HumanMessage(content=prompt)]).content.strip()
    except Exception as e:
        logger.error(f"텍스트 교정 실패: {e}")
        return text_to_correct

# ======================== 벡터용 선형화 ========================
def _keep_text_line_for_vector(line: str) -> bool:
    """벡터 DB 인덱싱에 포함할 가치가 있는 단일 텍스트 라인인지 판단한다.

    머리글, 캡션, 페이지 번호, 구분선 등 검색 성능을 저해하는 요소는 제외한다.

    Parameters:
        line (str): 한 줄 텍스트

    Returns:
        bool: 포함 여부
    """
    if not line.strip(): return False
    if HEADING_RE.match(line): return False
    if CAPTION_RE.match(line): return False
    if PAGE_RE.match(line): return False
    if BULLET_EMPTY_RE.match(line): return False
    if line.startswith('---'): return False
    if line.startswith('### 이미지 설명'): return False
    return True

def stitch_markdown_flow_for_vector(md_text: str) -> List[str]:
    """마크다운 문서를 벡터 인덱싱 친화적인 문장 리스트로 선형화한다.

    - 마크다운 표는 구조를 읽어 단문으로 변환
    - 제목/캡션/페이지 번호 등 불필요한 줄은 제거

    Parameters:
        md_text (str): 마크다운 전체 텍스트

    Returns:
        List[str]: 인덱싱에 적합한 문장 목록
    """
    lines = md_text.splitlines()
    out_txt: List[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # 마크다운 표가 남아 있다면 단문으로 변환
        if line.count('|') >= 2 and not line.strip().startswith('```'):
            j = i + 1
            block = [line]
            while j < len(lines) and lines[j].count('|') >= 2 and not lines[j].strip().startswith('```'):
                block.append(lines[j]); j += 1
            sents = md_table_to_sentences("\n".join(block), unit_hint_text=None)
            out_txt.extend(sents)
            i = j
            continue

        if _keep_text_line_for_vector(line):
            text = _norm_ws(line)
            if text:
                out_txt.append(text)
        i += 1
    return out_txt

# ======================== PDF → MD (md를 인덱싱용으로 저장) ========================
def process_pdf_to_markdown(pdf_path: Path, output_dir: Path, default_unit: Optional[str] = None):
    """PDF 한 파일을 처리하여 인덱싱용 마크다운(.md)을 생성한다.

    처리 파이프라인:
        1) 페이지 별 표 추출 및 표→단문 변환
        2) 표 영역 외 본문 텍스트 추출 후 LLM 교정
        3) 페이지 전체 이미지에 대한 객관 캡션 생성(선택적)
        4) 페이지 단위로 모은 후, 최종적으로 인덱싱 규칙에 맞게 선형화

    Parameters:
        pdf_path (Path): 입력 PDF 경로
        output_dir (Path): 결과 md 저장 디렉터리
        default_unit (Optional[str]): 단위 힌트 기본값

    Returns:
        Path: 생성된 md 파일 경로
    """
    logger.info(f"{pdf_path.name} 처리 시작")
    doc = fitz.open(pdf_path)
    all_md_chunks = [f"# {pdf_path.stem}"]

    for page_num in tqdm(range(len(doc)), desc=f"{pdf_path.stem} 페이지"):
        page = doc.load_page(page_num)
        page_text_full = page.get_text("text").strip()
        if is_cover_page(page_text_full) or is_toc_page(page_text_full):
            continue

        pix = page.get_pixmap(dpi=150)
        page_image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

        table_data = extract_tables_with_multiple_tools(pdf_path, page_num)
        table_chunks = []
        table_bboxes = []
        unit_hint_page = detect_unit_hint(page_text_full, default_unit=default_unit)

        if table_data:
            for i, (df, method, bbox) in enumerate(table_data):
                # 추출 표를 단문으로 변환하고, 추후 본문 추출 시 제외할 bbox를 수집
                sentences = df_to_sentences(df, unit_hint_text=unit_hint_page, row_header_idx=0)
                if sentences:
                    table_chunks.append("\n".join(sentences))
                    page_h = page.rect.height
                    fitz_bbox = (bbox[0], page_h - bbox[3], bbox[2], page_h - bbox[1])
                    table_bboxes.append(fitz_bbox)

        if not table_chunks and is_likely_table(page, page_text_full):
            # 필요 시 AI 기반 표→md→단문 변환 경로 추가 가능
            pass

        # 본문 텍스트
        text_chunks = []
        remaining_text = extract_text_outside_bboxes(page, table_bboxes) if table_bboxes else page_text_full
        if remaining_text:
             # LLM을 사용해 OCR/줄바꿈 오류를 교정
            corrected_text = correct_text_with_llm(remaining_text)
            text_chunks.append(f"### 텍스트 내용 (페이지 {page_num + 1})\n\n{corrected_text}")

        # 이미지 캡션은 원본 md에만 의미. 인덱싱 md에서는 제거될 것이라 선택적으로 유지
        image_chunks = []
        caption = analyze_page_image_caption(page_image, page_num)
        if caption:
            image_chunks.append(f"---\n### 이미지 설명 (페이지 {page_num + 1})\n\n{caption}")

        page_content = []
        if table_chunks:
            page_content.extend(table_chunks)
        if text_chunks:
            page_content.extend(text_chunks)
        if image_chunks:
            page_content.extend(image_chunks)

        if page_content:
            all_md_chunks.append(f"\n---\n## 페이지 {page_num + 1}\n---")
            all_md_chunks.extend(page_content)

    # 최종 저장: md를 인덱싱 규칙으로 선형화해서 저장
    safe_name = "".join(c for c in pdf_path.stem if c.isalnum() or c in (' ', '_')).rstrip()
    md_path = output_dir / f"{safe_name}.md"
    md_path.parent.mkdir(parents=True, exist_ok=True)

    md_raw = "\n\n".join(all_md_chunks)
    vector_lines = stitch_markdown_flow_for_vector(md_raw)
    md_path.write_text("\n".join(vector_lines), encoding="utf-8")

    logger.info(f"완료: {md_path}")
    return md_path

# ======================== 메인 루틴 ========================
def main():
    """로컬 설정에 맞춰 PDF 루트를 순회하며 일괄 처리한다.

    환경에 맞게 `pdf_root`를 수정한 뒤 실행하면, 하위 모든 PDF를 처리하여
    `output_dir`에 인덱싱용 md 파일을 생성한다.
    """
    pdf_root = Path(r"C:\skn13\final\DB2\내부문서\test")
    output_dir = pdf_root / "_markdown_output_v9_index_md"
    output_dir.mkdir(parents=True, exist_ok=True)

    pdf_files = [p for p in pdf_root.rglob("*.pdf") if not any(part.startswith("_markdown") for part in p.parts)]
    if not pdf_files:
        logger.warning(f"PDF 없음: {pdf_root}")
        return

    logger.info(f"총 {len(pdf_files)}개 파일 처리")
    ok, fail = 0, 0
    for pdf_file in tqdm(pdf_files, desc="전체 처리"):
        try:
            _ = process_pdf_to_markdown(pdf_file, output_dir, default_unit=None)
            logger.info(f"md only: {pdf_file.stem}.md")
            ok += 1
        except Exception as e:
            logger.error(f"{pdf_file.name} 처리 실패: {e}", exc_info=True)
            fail += 1

    logger.info(f"완료. 성공 {ok}, 실패 {fail}. 결과: {output_dir.resolve()}")

if __name__ == "__main__":
    main()
