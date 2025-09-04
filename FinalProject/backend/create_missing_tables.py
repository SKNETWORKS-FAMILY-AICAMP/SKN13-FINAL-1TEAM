#!/usr/bin/env python3
"""
데이터베이스 테이블 생성/업데이트 스크립트
MySQL 실제 스키마에 맞춰 누락된 테이블과 컬럼을 생성합니다.
"""
from database import create_db_and_tables, engine
from database.models import *
import sqlalchemy as sa
from sqlalchemy import text

def create_missing_tables_and_columns():
    """누락된 테이블과 컬럼을 생성합니다."""
    
    print("🚀 데이터베이스 테이블 생성 시작...")
    
    try:
        # 1. 모든 테이블 생성 (존재하지 않는 것만)
        create_db_and_tables()
        print("✅ 모든 테이블 생성 완료!")
        
        # 2. 추가 컬럼 생성 (기존 테이블에 누락된 컬럼들)
        with engine.connect() as conn:
            # refresh_tokens 테이블에 created_at 컬럼 추가 (없으면)
            try:
                conn.execute(text("""
                    ALTER TABLE refresh_tokens 
                    ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP 
                    COMMENT '토큰 생성시간'
                """))
                print("✅ refresh_tokens.created_at 컬럼 추가됨")
            except Exception as e:
                if "Duplicate column name" in str(e):
                    print("ℹ️  refresh_tokens.created_at 컬럼은 이미 존재함")
                else:
                    print(f"⚠️  refresh_tokens.created_at 컬럼 추가 실패: {e}")
            
            # users 테이블 누락 컬럼들 확인 및 추가
            missing_user_columns = [
                ("is_active", "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '계정 활성화 상태'"),
                ("must_change_password", "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '초기 비밀번호 변경 필요'"),
            ]
            
            for col_name, col_def in missing_user_columns:
                try:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}"))
                    print(f"✅ users.{col_name} 컬럼 추가됨")
                except Exception as e:
                    if "Duplicate column name" in str(e):
                        print(f"ℹ️  users.{col_name} 컬럼은 이미 존재함")
                    else:
                        print(f"⚠️  users.{col_name} 컬럼 추가 실패: {e}")
            
            # 커밋
            conn.commit()
            
        print("🎉 데이터베이스 스키마 업데이트 완료!")
        
    except Exception as e:
        print(f"❌ 데이터베이스 생성 중 오류 발생: {e}")
        raise

if __name__ == "__main__":
    create_missing_tables_and_columns()