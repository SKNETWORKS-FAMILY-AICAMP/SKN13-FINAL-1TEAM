from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import create_db_and_tables
from pathlib import Path
import logging
import uvicorn

# 로깅 설정 개선
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # 콘솔 출력
        logging.FileHandler('backend_debug.log', encoding='utf-8')  # 파일 출력
    ]
)

# 각 모듈별 로거 레벨 설정
logging.getLogger("backend.routers.chat_routes").setLevel(logging.DEBUG)
logging.getLogger("backend.ChatBot").setLevel(logging.DEBUG)
logging.getLogger("uvicorn.access").setLevel(logging.INFO)

# Import routers
from .routers import document_routes, chat_routes, auth_routes, calendar_routes, users_routes

# FastAPI 인스턴스 생성
app = FastAPI()

# CORS 미들웨어 설정
origins = [
    "http://localhost",
    "http://localhost:5173",  # 프론트엔드 개발 서버
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # origins 배열을 직접 사용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 데이터베이스 테이블 생성 및 디렉토리 생성
@app.on_event("startup")
def on_startup():
    logger = logging.getLogger(__name__)
    logger.info("🚀 FastAPI 애플리케이션 시작")

    create_db_and_tables()
    logger.info("📊 데이터베이스 테이블 생성 완료")

    # UPLOAD_DIR and EDITABLE_MD_DIR are now handled in document_routes.py
    # but ensure the directories exist if they are used globally or by other parts
    # that don't go through document_routes.py
    Path("uploaded_files").mkdir(parents=True, exist_ok=True)
    Path("editable_markdown").mkdir(parents=True, exist_ok=True)
    logger.info("📁 디렉토리 생성 완료")

    logger.info("✅ 애플리케이션 초기화 완료")


# API 라우터를 앱에 포함 - 5가지 깔끔한 구조
app.include_router(auth_routes.router, prefix="/api/v1/auth", tags=["인증"])
app.include_router(users_routes.router, prefix="/api/v1/users", tags=["사용자 관리"])  
app.include_router(document_routes.router, prefix="/api/v1/files", tags=["파일/문서"])
app.include_router(chat_routes.router, prefix="/api/v1/chat", tags=["채팅/AI"])
app.include_router(calendar_routes.router, prefix="/api/v1/calendar", tags=["캘린더"])
