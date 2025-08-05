import fitz
import camelot
from pathlib import Path
from tqdm import tqdm
from PIL import Image
import pandas as pd
import logging

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def extract_text_from_page(page):
    """페이지에서 텍스트 추출"""
    text = page.get_text("text").strip()
    return ["### 텍스트 내용", text] if text else []

def crop_table_from_page_image(page_image: Image.Image, table_bbox: list, page_width: float, page_height: float, padding: int = 10) -> Image.Image:
    """페이지 이미지에서 표 영역만 크롭 (여백 추가)"""
    # camelot bbox: [x0, y0, x1, y1] (PDF 좌표계)
    x0, y0, x1, y1 = table_bbox
    
    # PDF 좌표계를 이미지 좌표계로 변환
    img_width, img_height = page_image.size
    scale_x = img_width / page_width
    scale_y = img_height / page_height
    
    left = int(x0 * scale_x) - padding
    top = int((page_height - y1) * scale_y) - padding  # PDF는 bottom-up, 이미지는 top-down
    right = int(x1 * scale_x) + padding
    bottom = int((page_height - y0) * scale_y) + padding
    
    # 경계값 체크
    left = max(0, left)
    top = max(0, top)
    right = min(img_width, right)
    bottom = min(img_height, bottom)
    
    return page_image.crop((left, top, right, bottom))

def is_valid_table(df: pd.DataFrame) -> bool:
    """실제 표인지 검증"""
    # 최소 2행 2열 이상
    if df.shape[0] < 2 or df.shape[1] < 2:
        return False
    
    # 너무 많은 빈 셀이 있으면 표가 아닐 가능성
    empty_cells = df.isnull().sum().sum() + (df == '').sum().sum()
    total_cells = df.shape[0] * df.shape[1]
    if empty_cells / total_cells > 0.7:  # 70% 이상이 빈 셀
        return False
    
    # 모든 셀이 한 줄짜리 텍스트만 있으면 표가 아닐 가능성
    long_text_cells = 0
    for col in df.columns:
        for val in df[col].astype(str):
            if len(val) > 50:  # 긴 텍스트가 있으면
                long_text_cells += 1
    
    if long_text_cells == 0 and df.shape[1] == 1:  # 1열이고 모두 짧은 텍스트
        return False
        
    return True

def extract_tables_from_page(pdf_path: Path, page, page_num: int, tables_dir: Path, page_image: Image.Image):
    """페이지에서 표 추출 및 별도 저장"""
    md_chunks = []
    
    try:
        # 먼저 lattice 방식 시도 (격자선이 있는 표)
        tables = camelot.read_pdf(str(pdf_path), pages=str(page_num + 1), flavor='lattice')      
        # 두 결과 합치기 (lattice 우선, 중복 제거)
        all_tables = []
        
        # lattice 결과 추가 (더 정확함)
        for table in tables:
            if is_valid_table(table.df):
                all_tables.append(table)
        
        if not all_tables:
            return md_chunks
            
        md_chunks.append("### 표")
        
        for i, table in enumerate(tables):
            table_name = f"{pdf_path.stem}_p{page_num + 1}_table{i + 1}"
            
            # 1. CSV로 저장 (인코딩 문제 해결)
            csv_path = tables_dir / f"{table_name}.csv"
            try:
                table.df.to_csv(csv_path, index=False, encoding='utf-8-sig')  # BOM 추가
            except UnicodeEncodeError:
                table.df.to_csv(csv_path, index=False, encoding='cp949')  # 한글 윈도우 기본
            
            # 2. 표 영역을 이미지로 크롭 저장 (전체 페이지 저장 방지)
            try:
                if hasattr(table, '_bbox') and table._bbox:
                    table_bbox = table._bbox
                    page_width = page.rect.width
                    page_height = page.rect.height
                    
                    # 함수 호출 시 매개변수 순서 확인
                    cropped_table = crop_table_from_page_image(
                        page_image=page_image, 
                        table_bbox=table_bbox, 
                        page_width=page_width, 
                        page_height=page_height, 
                        padding=15
                    )
                    img_path = tables_dir / f"{table_name}.png"
                    cropped_table.save(img_path, 'PNG')
                    
                    # 마크다운에 참조 추가
                    md_chunks.append(f"[표 {i + 1}]({img_path.as_posix()} - 페이지 {page_num + 1}에서 추출한 표)")
                    md_chunks.append(f"- CSV 파일: {csv_path.as_posix()}")
                else:
                    # bbox 정보가 없으면 CSV만 저장
                    md_chunks.append(f"[표 {i + 1}]({csv_path.as_posix()} - 페이지 {page_num + 1}에서 추출한 표, CSV만 가능)")
                    
            except Exception as e:
                logger.error(f"표 이미지 크롭 실패 {pdf_path.name} p{page_num + 1} table{i + 1}: {e}")
                md_chunks.append(f"[표 {i + 1}]({csv_path.as_posix()} - 페이지 {page_num + 1}에서 추출한 표, 이미지 저장 실패)")
                
    except Exception as e:
        logger.error(f"표 추출 실패 {pdf_path.name} p{page_num + 1}: {e}")
        
    return md_chunks

def extract_images_from_page(doc, page, page_num: int, pdf_stem: str, images_dir: Path):
    """페이지에서 이미지 추출 및 별도 저장"""
    md_chunks = []
    images = page.get_images(full=True)
    
    if not images:
        return md_chunks
        
    md_chunks.append("### 이미지")
    
    for idx, img in enumerate(images):
        try:
            xref = img[0]
            base = doc.extract_image(xref)
            ext = base["ext"]
            img_bytes = base["image"]
            
            filename = f"{pdf_stem}_p{page_num + 1}_img{idx + 1}.{ext}"
            img_path = images_dir / filename
            
            with open(img_path, "wb") as f:
                f.write(img_bytes)
            
            # 마크다운에 참조 추가
            md_chunks.append(f"[이미지 {idx + 1}]({img_path.as_posix()} - 페이지 {page_num + 1}에서 추출한 이미지)")
            
        except Exception as e:
            logger.error(f"이미지 저장 실패 {pdf_stem} p{page_num + 1} img{idx + 1}: {e}")
            
    return md_chunks

def save_markdown_file(markdown_chunks, pdf_path: Path, output_dir: Path):
    """마크다운 파일 저장"""
    safe_name = "".join(c for c in pdf_path.stem if c.isalnum() or c in (' ', '_')).rstrip()
    md_path = output_dir / f"{safe_name}.md"
    
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(markdown_chunks))

def process_pdf_to_markdown(pdf_path: Path, output_dir: Path, images_dir: Path, tables_dir: Path):
    """PDF를 마크다운으로 변환하면서 이미지/표는 별도 저장"""
    try:
        doc = fitz.open(pdf_path)
        md_chunks = [f"# {pdf_path.stem}"]
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            
            md_chunks.extend([
                "\n---\n",
                f"## 페이지 {page_num + 1}"
            ])
            
            # 페이지를 고해상도 이미지로 렌더링 (표 크롭용)
            pix = page.get_pixmap(dpi=300)
            page_image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            
            # 텍스트 추출
            md_chunks.extend(extract_text_from_page(page))
            
            # 표 추출 (별도 저장 + 마크다운에 참조)
            md_chunks.extend(extract_tables_from_page(pdf_path, page, page_num, tables_dir, page_image))
            
            # 이미지 추출 (별도 저장 + 마크다운에 참조)
            md_chunks.extend(extract_images_from_page(doc, page, page_num, pdf_path.stem, images_dir))
        
        # 마크다운 파일 저장
        save_markdown_file(md_chunks, pdf_path, output_dir)
        doc.close()
        
    except Exception as e:
        logger.error(f"PDF 처리 실패 {pdf_path.name}: {e}")
        raise

def main():
    """메인 실행 함수"""
    pdf_root = Path(r"C:\Users\jhwoo\Desktop\SKN_ws\project\SKN13-FINAL-1TEAM\한국방송광고진흥공사\내부문서\재무성과")
    output_dir = pdf_root / "_markdown_output"
    images_dir = output_dir / "_images"
    tables_dir = output_dir / "_tables"
    
    # 디렉토리 생성
    output_dir.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(parents=True, exist_ok=True)
    tables_dir.mkdir(parents=True, exist_ok=True)
    
    # PDF 파일 찾기
    pdf_files = list(pdf_root.rglob("*.pdf"))
    
    if not pdf_files:
        logger.warning(f"PDF 파일을 찾을 수 없습니다: {pdf_root}")
        return
    
    logger.info(f"총 {len(pdf_files)}개의 PDF 파일을 처리합니다.")
    
    # 배치 처리
    success_count = 0
    for pdf_file in tqdm(pdf_files, desc="PDF 변환 중"):
        try:
            process_pdf_to_markdown(pdf_file, output_dir, images_dir, tables_dir)
            success_count += 1
        except Exception as e:
            logger.error(f"처리 실패 {pdf_file.name}: {e}")
    
    logger.info(f"처리 완료: {success_count}/{len(pdf_files)}개 성공")
    logger.info(f"결과 위치:")
    logger.info(f"  - 마크다운: {output_dir}")
    logger.info(f"  - 이미지: {images_dir}")
    logger.info(f"  - 표: {tables_dir}")

if __name__ == "__main__":
    main()