# database/connection.py
"""
데이터베이스 연결 설정
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

# 환경변수 로드
load_dotenv(dotenv_path="/home/ubuntu/SKN13-FINAL-1TEAM/FinalProject/backend/.env")

# DB 연결 설정
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS")
DB = os.getenv("DB", "FINAL")

# 데이터베이스 엔진 생성
engine = create_engine(
    f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB}?charset=utf8mb4",
    pool_pre_ping=True,
    pool_recycle=3600,
    future=True,
)

# 세션 팩토리
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# DB 세션 의존성 함수
def get_db():
    """FastAPI 의존성을 위한 DB 세션 생성"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()