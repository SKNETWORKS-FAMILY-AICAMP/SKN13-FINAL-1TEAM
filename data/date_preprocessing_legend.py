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
import boto3
from botocore.exceptions import NoCredentialsError

# ======================== 로깅 설정 ========================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ======================== 환경 변수 로드 ========================
load_dotenv()

# OpenAI 설정
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    logger.warning("OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.")
llm = ChatOpenAI(api_key=OPENAI_API_KEY, model_name="gpt-4o", request_timeout=120)

# AWS S3 설정
AWS_S3_BUCKET = os.getenv('AWS_S3_BUCKET')
S3_DESTINATION_PREFIX = 'kobaco_data_md/' # MD 파일을 저장할 S3 경로

# ======================== tabula-py 가용성 체크 ========================
try:
    import tabula
    TABULA_AVAILABLE = True
    logger.info("tabula-py를 사용할 수 있습니다.")
except ImportError:
    TABULA_AVAILABLE = False
    logger.warning("tabula-py가 설치되지 않았습니다. 'pip install tabula-py'로 설치하는 것을 권장합니다.")

# ======================== 상수 및 정규식 ========================
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
    return re.sub(r'\s+', ' ', (s or '')).strip()

# ======================== 단위 탐지 ========================
def detect_unit_hint(text: str, headers: Optional[List[str]] = None, default_unit: Optional[str] = None) -> Optional[str]:
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
    out = []
    try:
        tables = camelot.read_pdf(str(pdf_path), pages=str(page_num + 1), flavor='lattice')
        if tables.n > 0:
            logger.info(f"p{page_num+1}: Camelot Lattice {tables.n}개 발견")
            for t in tables:
                out.append((t.df, "Camelot-Lattice", t._bbox))
            return out
    except Exception as e:
        logger.debug(f"Camelot Lattice 오류: {e}")

    if TABULA_AVAILABLE:
        try:
            dfs = tabula.read_pdf(str(pdf_path), pages=page_num + 1, lattice=True, multiple_tables=True)
            if dfs:
                logger.info(f"p{page_num+1}: Tabula Lattice {len(dfs)}개 발견")
                for df in dfs:
                    out.append((df, "Tabula-Lattice", (0, 0, 1, 1)))
                return out
        except Exception as e:
            logger.debug(f"Tabula Lattice 오류: {e}")

    try:
        tables = camelot.read_pdf(str(pdf_path), pages=str(page_num + 1), flavor='stream', edge_tol=500)
        if tables.n > 0:
            logger.info(f"p{page_num+1}: Camelot Stream {tables.n}개 발견")
            for t in tables:
                out.append((t.df, "Camelot-Stream", t._bbox))
            return out
    except Exception as e:
        logger.debug(f"Camelot Stream 오류: {e}")

    return []

# ======================== 데이터프레임 정리 및 문장 변환 ========================
def _basic_clean_df(df: pd.DataFrame) -> Optional[pd.DataFrame]:
    if df is None or df.empty:
        return None
    df = df.copy()

    def _cell_norm(x):
        return _norm_ws(str(x)) if pd.notna(x) else x
    df = df.apply(lambda col: col.map(_cell_norm))

    df.replace(r'^\s*$', pd.NA, regex=True, inplace=True)
    df.dropna(how='all', axis=0, inplace=True)
    df.dropna(how='all', axis=1, inplace=True)
    df.reset_index(drop=True, inplace=True)
    if df.empty:
        return None

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
    s = (v or '').strip().lower()
    return s in SKIP_TOKENS

def _is_total_row(key: str) -> bool:
    k = (key or '').strip()
    return any(tok in k for tok in TOTAL_ROW_TOKENS)

def df_to_sentences(df: pd.DataFrame, unit_hint_text: Optional[str] = None, row_header_idx: int = 0) -> List[str]:
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

# ======================== 이미지 프롬프트 및 분석 ========================
IMAGE_PROMPT_KO = """당신은 시각 자료를 객관적인 문장(줄글)으로 상세하게 묘사하는 AI 어시스턴트입니다. 당신의 임무는 아래 이미지의 모든 시각적 정보를 빠짐없이 사람이 설명해주듯이 서술하는 것입니다.\n이 결과는 벡터 데이터베이스에 사용되므로, 당신의 주관적인 해석이나 평가는 절대 포함되어서는 안 됩니다.\n\n당신의 작업 지침:\n1. 이미지 종류 판단: 이미지가 의미 있는 정보(그래프, 차트, 사진 등)인지, 의미 없는 장식용(로고, 배경 등)인지 먼저 판단해주세요. 의미 없는 이미지라면, 다른 설명 없이 오직 "배경 이미지" 라고만 응답해주세요.\n2. 자연스러운 묘사(의미 있는 이미지일 경우):\n   - 그래프/차트의 경우, 다음 정보를 포함하여 줄글로 설명해주세요: 그래프의 제목과 종류, 각 축의 정보와 단위, 각 데이터 포인트, 범례(Legend) 등\n   - 일반 사진/다이어그램: 보이는 그대로의 상황, 객체, 인물, 배경, 그리고 이미지 내 텍스트를 자연스러운 문장으로 설명해주세요.\n3. 엄격한 제한사항: 절대 이미지의 의미를 해석하거나, 경향을 분석하거나, 결론을 도출하지 마세요.\n\n위 지침을 엄격히 따라서 자연스러운 한국어 줄글로 결과를 생성해주세요.\n"""

def analyze_page_image_caption(page_image: Image.Image, page_num: int) -> Optional[str]:
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
        logger.error(f"페이지 {page_num+1} 이미지 캡션 생성 오류: {e}")
        return None

# ======================== 텍스트 추출 및 교정 ========================
def extract_text_outside_bboxes(page: fitz.Page, bboxes: List[Tuple]) -> str:
    full_text = ""
    blocks = page.get_text("blocks")
    for x1, y1, x2, y2, text, _, _ in blocks:
        rect = fitz.Rect(x1, y1, x2, y2)
        inside = any(fitz.Rect(bx1, by1, bx2, by2).intersects(rect) for bx1, by1, bx2, by2 in bboxes)
        if not inside:
            full_text += text + "\n"
    return full_text.strip()

def is_cover_page(text: str) -> bool:
    return len(text) < 300 and any(k in text.lower() for k in ['보고서', 'report', '제출'])

def is_toc_page(text: str) -> bool:
    return '목차' in text or 'contents' in text.lower() or len(re.findall(r'\.{5,}\s*\d+', text)) > 3

def correct_text_with_llm(text_to_correct: str) -> str:
    if not text_to_correct.strip():
        return ""
    prompt = (
        "다음은 PDF에서 추출된 텍스트입니다. OCR 및 줄바꿈 오류를 수정하되, 의미와 내용은 변경하지 마세요.\n\n"
        "[원문]\n" + text_to_correct + "\n\n[교정]"
    )
    try:
        return llm.invoke([HumanMessage(content=prompt)]).content.strip()
    except Exception as e:
        logger.error(f"LLM 텍스트 교정 실패: {e}")
        return text_to_correct

# ======================== 벡터화를 위한 마크다운 선형화 ========================
def _keep_text_line_for_vector(line: str) -> bool:
    if not line.strip(): return False
    if HEADING_RE.match(line): return False
    if CAPTION_RE.match(line): return False
    if PAGE_RE.match(line): return False
    if BULLET_EMPTY_RE.match(line): return False
    if line.startswith('---'): return False
    if line.startswith('### 이미지 설명'): return False
    return True

def stitch_markdown_flow_for_vector(md_text: str) -> List[str]:
    lines = md_text.splitlines()
    out_txt: List[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
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

# ======================== PDF 처리 및 마크다운 생성 ========================
def process_pdf_to_markdown(pdf_path: Path, output_dir: Path, default_unit: Optional[str] = None) -> Optional[Path]:
    logger.info(f"'{pdf_path.name}' 처리 시작.")
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        logger.error(f"'{pdf_path.name}' 파일을 열 수 없습니다: {e}")
        return None
        
    all_md_chunks = [f"# {pdf_path.stem}"]

    for page_num in tqdm(range(len(doc)), desc=f"{pdf_path.stem} 페이지 처리 중"):
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
                sentences = df_to_sentences(df, unit_hint_text=unit_hint_page, row_header_idx=0)
                if sentences:
                    table_chunks.append("\n".join(sentences))
                    page_h = page.rect.height
                    fitz_bbox = (bbox[0], page_h - bbox[3], bbox[2], page_h - bbox[1])
                    table_bboxes.append(fitz_bbox)

        text_chunks = []
        remaining_text = extract_text_outside_bboxes(page, table_bboxes) if table_bboxes else page_text_full
        if remaining_text:
            corrected_text = correct_text_with_llm(remaining_text)
            text_chunks.append(f"### 텍스트 내용 (페이지 {page_num + 1})\n\n{corrected_text}")

        image_chunks = []
        caption = analyze_page_image_caption(page_image, page_num)
        if caption:
            image_chunks.append(f"---\n### 이미지 설명 (페이지 {page_num + 1})\n\n{caption}")

        page_content = []
        if table_chunks: page_content.extend(table_chunks)
        if text_chunks: page_content.extend(text_chunks)
        if image_chunks: page_content.extend(image_chunks)

        if page_content:
            all_md_chunks.append(f"\n---\n## 페이지 {page_num + 1}\n---")
            all_md_chunks.extend(page_content)

    safe_name = "".join(c for c in pdf_path.stem if c.isalnum() or c in (' ', '_')).rstrip()
    md_path = output_dir / f"{safe_name}.md"
    md_path.parent.mkdir(parents=True, exist_ok=True)

    md_raw = "\n\n".join(all_md_chunks)
    vector_lines = stitch_markdown_flow_for_vector(md_raw)
    md_path.write_text("\n".join(vector_lines), encoding="utf-8")

    logger.info(f"마크다운 파일 생성 완료: {md_path}")
    return md_path

# ======================== S3 업로드 ========================
def upload_file_to_s3(s3_client, local_path: Path, bucket: str, s3_key: str):
    """지정된 파일을 S3 버킷에 업로드한다."""
    try:
        logger.info(f"'{local_path.name}' -> 's3://{bucket}/{s3_key}' 업로드 중...")
        s3_client.upload_file(str(local_path), bucket, s3_key)
        logger.info(f"업로드 성공.")
        return True
    except NoCredentialsError:
        logger.error("Damn. AWS 자격 증명을 찾을 수 없습니다. .env 파일을 확인하세요.")
        return False
    except Exception as e:
        logger.error(f"Hell no. '{local_path.name}' 업로드 실패. 오류: {e}")
        return False

# ======================== 메인 실행 로직 ========================
def main():
    # === 설정 ===
    pdf_root = Path(r"C:\skn13\final\DB2\내부문서\test")
    output_dir = pdf_root / "_markdown_output_legend"
    output_dir.mkdir(parents=True, exist_ok=True)

    # S3 클라이언트 초기화
    s3_client = None
    if AWS_S3_BUCKET:
        try:
            s3_client = boto3.client('s3')
            logger.info(f"S3 클라이언트 초기화 완료. 타겟 버킷: '{AWS_S3_BUCKET}'")
        except Exception as e:
            logger.error(f"S3 클라이언트 초기화 실패: {e}")
            return
    else:
        logger.warning("Asshole! AWS_S3_BUCKET이 .env 파일에 설정되지 않았습니다. S3 업로드를 건너뜁니다.")

    # PDF 파일 검색
    pdf_files = [p for p in pdf_root.rglob("*.pdf") if not any(part.startswith("_markdown") for part in p.parts)]
    if not pdf_files:
        logger.warning(f"처리할 PDF 파일이 없습니다: {pdf_root}")
        return

    logger.info(f"총 {len(pdf_files)}개의 PDF 파일을 처리합니다.")
    processed_count, uploaded_count, failed_count = 0, 0, 0

    for pdf_file in tqdm(pdf_files, desc="전체 진행률"):
        try:
            # 1. PDF를 마크다운으로 변환
            generated_md_path = process_pdf_to_markdown(pdf_file, output_dir, default_unit=None)
            
            if generated_md_path:
                processed_count += 1
                # 2. 생성된 마크다운 파일을 S3에 업로드
                if s3_client:
                    s3_key = f"{S3_DESTINATION_PREFIX}{generated_md_path.name}"
                    if upload_file_to_s3(s3_client, generated_md_path, AWS_S3_BUCKET, s3_key):
                        uploaded_count += 1
                    else:
                        failed_count += 1
            else:
                failed_count += 1
                
        except Exception as e:
            logger.error(f"'{pdf_file.name}' 처리 중 심각한 오류 발생: {e}", exc_info=True)
            failed_count += 1

    logger.info(f"작업 완료. 성공: {processed_count}, 업로드: {uploaded_count}, 실패: {failed_count}.")
    logger.info(f"결과물은 다음 디렉토리에 저장되었습니다: {output_dir.resolve()}")

if __name__ == "__main__":
    main()
