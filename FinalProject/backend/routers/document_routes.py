from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Request
from fastapi.responses import JSONResponse, FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel
from typing import Optional, List # Added List
import json, uuid, shutil, tempfile, os
from pathlib import Path
from sqlalchemy.orm import Session
from datetime import datetime
import fitz # PyMuPDF
from docx import Document as DocxDocument # python-docx
from ..database import get_db, Document

# APIRouter 인스턴스 생성
router = APIRouter()

# --- 문서 저장 경로 ---
UPLOAD_DIR = Path("uploaded_files") # 원본 파일 업로드 디렉토리
EDITABLE_MD_DIR = Path("editable_markdown") # 편집 가능한 마크다운 파일 저장 디렉토리

# --- Pydantic 모델 ---
# DOCX 내보내기 요청을 위한 데이터 모델
class ExportDocxRequest(BaseModel):
    html: str # HTML 내용 (필수)
    filename: str = "exported_document.docx" # 내보낼 파일 이름 (기본값: exported_document.docx)

# --- 문서 변환 헬퍼 함수 ---
# 다양한 파일 형식을 마크다운으로 변환하는 함수
def _convert_to_markdown(file_path: Path, file_type: str) -> str:
    content = ""
    try:
        if file_type == "pdf": # PDF 파일인 경우
            doc = fitz.open(file_path)
            for page in doc:
                content += page.get_text() # 페이지 텍스트 추출
            doc.close()
        elif file_type == "docx": # DOCX 파일인 경우
            doc = DocxDocument(file_path)
            for para in doc.paragraphs:
                content += para.text + "\n" # 단락 텍스트 추출
        elif file_type in ["hwp", "hwpx"]:
            # Assuming read_hwpx_file_content returns text content
            content = None#read_hwpx_file_content(str(file_path))
        elif file_type in ["md", "txt"]:
            content = file_path.read_text(encoding="utf-8") # 파일 내용 읽기
        else:
            raise ValueError(f"Unsupported file type for conversion: {file_type}")
    except Exception as e: # 변환 중 오류 발생 시
        raise HTTPException(status_code=500, detail=f"File conversion failed: {e}")
    return content # 변환된 마크다운 내용 반환

# --- 문서 관리 API 엔드포인트 ---

# 모든 문서 목록 조회 엔드포인트
@router.get("/documents", response_model=List[dict])
async def list_documents(db: Session = Depends(get_db)):
    documents = db.query(Document).all() # 모든 문서 조회
    return [ # 문서 목록 반환 (필요한 정보만 포함)
        {
            "id": doc.id,
            "original_filename": doc.original_filename,
            "file_type": doc.file_type,
            "uploaded_at": doc.uploaded_at.isoformat(),
            "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
        }
        for doc in documents
    ]

# 문서 업로드 엔드포인트
@router.post("/documents/upload")
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename: # 파일 이름이 없으면 에러
        raise HTTPException(status_code=400, detail="No file provided")

    file_extension = Path(file.filename).suffix.lower().lstrip('.') # 파일 확장자 추출
    if file_extension not in ["pdf", "docx", "hwp", "hwpx", "md", "txt"]:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_extension}")

    doc_id = str(uuid.uuid4()) # 고유한 문서 ID 생성
    original_file_path = UPLOAD_DIR / f"{doc_id}_{file.filename}" # 원본 파일 저장 경로
    markdown_file_path = EDITABLE_MD_DIR / f"{doc_id}.md" # 마크다운 파일 저장 경로

    # 원본 파일 저장
    try:
        with open(original_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save original file: {e}")

    # 마크다운으로 변환
    try:
        markdown_content = _convert_to_markdown(original_file_path, file_extension)
        with open(markdown_file_path, "w", encoding="utf-8") as f:
            f.write(markdown_content) # 마크다운 내용 파일에 쓰기
    except Exception as e:
        # Clean up if conversion fails
        original_file_path.unlink(missing_ok=True) # 변환 실패 시 원본 파일 삭제
        raise HTTPException(status_code=500, detail=f"File conversion to Markdown failed: {e}")

    # DB에 메타데이터 저장
    db_document = Document(
        id=doc_id,
        original_filename=file.filename,
        file_type=file_extension,
        original_file_path=str(original_file_path),
        markdown_file_path=str(markdown_file_path)
    )
    db.add(db_document) # DB 세션에 추가
    db.commit() # 변경사항 커밋
    db.refresh(db_document) # DB에서 문서 정보 새로고침

    return JSONResponse(content={"doc_id": doc_id, "markdown_content": markdown_content, "message": "Document uploaded and converted successfully"}) # 성공 응답 반환

# 문서를 DOCX 형식으로 내보내기 엔드포인트
@router.post("/documents/export/docx")
async def export_document_as_docx(req: ExportDocxRequest, request: Request):
    print("--- Raw body ---")
    raw_body = await request.body()
    print(raw_body.decode())

    print(f"--- Parsed html_content length: {len(req.html)} ---")
    print(f"--- Parsed filename: {req.filename} ---")

    safe_filename = req.filename.strip() # 파일 이름 공백 제거
    if not safe_filename.endswith(".docx"):
        safe_filename += ".docx" # .docx 확장자 없으면 추가
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as temp_file:
        temp_filepath = temp_file.name # 임시 DOCX 파일 경로 생성

    doc_title = os.path.splitext(safe_filename)[0] # 파일 이름에서 제목 추출
    success = convert_html_to_docx(req.html, temp_filepath, title=doc_title) # HTML을 DOCX로 변환

    if not success: # 변환 실패 시 에러
        raise HTTPException(status_code=500, detail="Failed to convert HTML to DOCX.")
    
    return FileResponse( # DOCX 파일 응답
        path=temp_filepath,
        filename=safe_filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingprocessingml.document",
        background=BackgroundTask(os.unlink, temp_filepath) # 파일 전송 후 임시 파일 삭제
    )

# 특정 문서의 내용 조회 엔드포인트
@router.get("/documents/{doc_id}/content")
async def get_document_content(doc_id: str, db: Session = Depends(get_db)):
    db_document = db.query(Document).filter(Document.id == doc_id).first() # 문서 ID로 문서 조회
    if not db_document: # 문서 없으면 404 에러
        raise HTTPException(status_code=404, detail="Document not found")
    
    markdown_file_path = Path(db_document.markdown_file_path) # 마크다운 파일 경로
    if not markdown_file_path.exists(): # 마크다운 파일 없으면 404 에러
        raise HTTPException(status_code=404, detail="Markdown content not found for this document")
    
    content = markdown_file_path.read_text(encoding="utf-8") # 마크다운 내용 읽기
    return JSONResponse(content={"doc_id": doc_id, "markdown_content": content}) # 문서 ID와 마크다운 내용 반환

# 특정 문서의 내용 저장 엔드포인트
@router.put("/documents/{doc_id}/save_content")
async def save_document_content(doc_id: str, content: str, db: Session = Depends(get_db)):
    db_document = db.query(Document).filter(Document.id == doc_id).first() # 문서 ID로 문서 조회
    if not db_document: # 문서 없으면 404 에러
        raise HTTPException(status_code=404, detail="Document not found")
    
    markdown_file_path = Path(db_document.markdown_file_path) # 마크다운 파일 경로
    
    try:
        markdown_file_path.write_text(content, encoding="utf-8") # 마크다운 내용 파일에 쓰기
        db_document.updated_at = datetime.now() # 업데이트 시간 기록
        db.commit() # 변경사항 커밋
        db.refresh(db_document) # DB에서 문서 정보 새로고침
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save markdown content: {e}")
    
    return JSONResponse(content={"doc_id": doc_id, "message": "Markdown content saved successfully"}) # 성공 응답 반환

# 특정 문서 삭제 엔드포인트
@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, db: Session = Depends(get_db)):
    db_document = db.query(Document).filter(Document.id == doc_id).first() # 문서 ID로 문서 조회
    if not db_document: # 문서 없으면 404 에러
        raise HTTPException(status_code=404, detail="Document not found")
    
    original_file_path = Path(db_document.original_file_path) # 원본 파일 경로
    markdown_file_path = Path(db_document.markdown_file_path) # 마크다운 파일 경로

    try:
        if original_file_path.exists(): # 원본 파일 존재하면 삭제
            original_file_path.unlink()
        if markdown_file_path.exists(): # 마크다운 파일 존재하면 삭제
            markdown_file_path.unlink()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete files: {e}")
    
    db.delete(db_document) # DB에서 문서 정보 삭제
    db.commit() # 변경사항 커밋
    
    return JSONResponse(content={"message": "Document and associated files deleted successfully"}) # 성공 응답 반환

# (주석: 이 엔드포인트는 현재 사용되지 않거나 더 이상 필요하지 않을 수 있습니다. 필요에 따라 제거하거나 기능을 구현하세요.)
@router.get("/open")
async def open_document(url):
    pass