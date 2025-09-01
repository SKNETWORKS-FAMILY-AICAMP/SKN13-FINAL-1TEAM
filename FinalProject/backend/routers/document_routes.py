from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Request
from fastapi.responses import JSONResponse, FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel
from typing import Optional
import json, uuid, shutil, tempfile, os
from pathlib import Path
from sqlalchemy.orm import Session
from datetime import datetime
import fitz # PyMuPDF
from docx import Document as DocxDocument # python-docx
from ..database import get_db, Document
from ..ChatBot.tools.html_to_docx import convert_html_to_docx

router = APIRouter()

# --- Document Storage Paths ---
UPLOAD_DIR = Path("uploaded_files")
EDITABLE_MD_DIR = Path("editable_markdown")

# --- Pydantic Models ---
class ExportDocxRequest(BaseModel):
    html: str
    filename: str = "exported_document.docx"

# --- Helper for Document Conversion ---
def _convert_to_markdown(file_path: Path, file_type: str) -> str:
    content = ""
    try:
        if file_type == "pdf":
            doc = fitz.open(file_path)
            for page in doc:
                content += page.get_text()
            doc.close()
        elif file_type == "docx":
            doc = DocxDocument(file_path)
            for para in doc.paragraphs:
                content += para.text + "\n"
        elif file_type in ["hwp", "hwpx"]:
            # Assuming read_hwpx_file_content returns text content
            content = None#read_hwpx_file_content(str(file_path))
        elif file_type in ["md", "txt"]:
            content = file_path.read_text(encoding="utf-8")
        else:
            raise ValueError(f"Unsupported file type for conversion: {file_type}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File conversion failed: {e}")
    return content

# --- Document Management API Endpoints ---

@router.post("/documents/upload")
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    file_extension = Path(file.filename).suffix.lower().lstrip('.')
    if file_extension not in ["pdf", "docx", "hwp", "hwpx", "md", "txt"]:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_extension}")

    doc_id = str(uuid.uuid4())
    original_file_path = UPLOAD_DIR / f"{doc_id}_{file.filename}"
    markdown_file_path = EDITABLE_MD_DIR / f"{doc_id}.md"

    # Save original file
    try:
        with open(original_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save original file: {e}")

    # Convert to Markdown
    try:
        markdown_content = _convert_to_markdown(original_file_path, file_extension)
        with open(markdown_file_path, "w", encoding="utf-8") as f:
            f.write(markdown_content)
    except Exception as e:
        # Clean up if conversion fails
        original_file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"File conversion to Markdown failed: {e}")

    # Save metadata to DB
    db_document = Document(
        id=doc_id,
        original_filename=file.filename,
        file_type=file_extension,
        original_file_path=str(original_file_path),
        markdown_file_path=str(markdown_file_path)
    )
    db.add(db_document)
    db.commit()
    db.refresh(db_document)

    return JSONResponse(content={"doc_id": doc_id, "markdown_content": markdown_content, "message": "Document uploaded and converted successfully"})

@router.post("/documents/export/docx")
async def export_document_as_docx(req: ExportDocxRequest, request: Request):
    print("--- Raw body ---")
    raw_body = await request.body()
    print(raw_body.decode())

    print(f"--- Parsed html_content length: {len(req.html)} ---")
    print(f"--- Parsed filename: {req.filename} ---")

    safe_filename = req.filename.strip()
    if not safe_filename.endswith(".docx"):
        safe_filename += ".docx"
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as temp_file:
        temp_filepath = temp_file.name

    doc_title = os.path.splitext(safe_filename)[0]
    success = convert_html_to_docx(req.html, temp_filepath, title=doc_title)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to convert HTML to DOCX.")
    
    return FileResponse(
        path=temp_filepath,
        filename=safe_filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        background=BackgroundTask(os.unlink, temp_filepath)
    )

@router.get("/documents/{doc_id}/content")
async def get_document_content(doc_id: str, db: Session = Depends(get_db)):
    db_document = db.query(Document).filter(Document.id == doc_id).first()
    if not db_document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    markdown_file_path = Path(db_document.markdown_file_path)
    if not markdown_file_path.exists():
        raise HTTPException(status_code=404, detail="Markdown content not found for this document")
    
    content = markdown_file_path.read_text(encoding="utf-8")
    return JSONResponse(content={"doc_id": doc_id, "markdown_content": content})

@router.put("/documents/{doc_id}/save_content")
async def save_document_content(doc_id: str, content: str, db: Session = Depends(get_db)):
    db_document = db.query(Document).filter(Document.id == doc_id).first()
    if not db_document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    markdown_file_path = Path(db_document.markdown_file_path)
    
    try:
        markdown_file_path.write_text(content, encoding="utf-8")
        db_document.updated_at = datetime.now()
        db.commit()
        db.refresh(db_document)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save markdown content: {e}")
    
    return JSONResponse(content={"doc_id": doc_id, "message": "Markdown content saved successfully"})

@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, db: Session = Depends(get_db)):
    db_document = db.query(Document).filter(Document.id == doc_id).first()
    if not db_document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    original_file_path = Path(db_document.original_file_path)
    markdown_file_path = Path(db_document.markdown_file_path)

    try:
        if original_file_path.exists():
            original_file_path.unlink()
        if markdown_file_path.exists():
            markdown_file_path.unlink()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete files: {e}")
    
    db.delete(db_document)
    db.commit()
    
    return JSONResponse(content={"message": "Document and associated files deleted successfully"})

@router.get("/open")
async def open_document(url):
    pass
