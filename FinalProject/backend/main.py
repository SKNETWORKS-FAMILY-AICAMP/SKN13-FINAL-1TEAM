from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import create_db_and_tables
from pathlib import Path

# Import routers
from .routers import document_routes, chat_routes, auth_routes, calendar_routes, admin_routes

# FastAPI 인스턴스 생성
app = FastAPI()

# CORS 미들웨어 설정
origins = [
    "http://localhost",
    "http://localhost:5173",  # 프론트엔드 개발 서버
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 데이터베이스 테이블 생성 및 디렉토리 생성
@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    # UPLOAD_DIR and EDITABLE_MD_DIR are now handled in document_routes.py
    # but ensure the directories exist if they are used globally or by other parts
    # that don't go through document_routes.py
    Path("uploaded_files").mkdir(parents=True, exist_ok=True)
    Path("editable_markdown").mkdir(parents=True, exist_ok=True)


# API 라우터를 앱에 포함
app.include_router(document_routes.router, prefix="/api/v1")
app.include_router(chat_routes.router, prefix="/api/v1")
app.include_router(auth_routes.router, prefix="/api/v1")
app.include_router(calendar_routes.router, prefix="/api/v1")
app.include_router(admin_routes.router, prefix="/api/v1")
