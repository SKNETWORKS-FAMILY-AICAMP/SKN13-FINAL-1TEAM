from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db, User
from pydantic import BaseModel
from passlib.context import CryptContext # Import CryptContext

# APIRouter 인스턴스 생성
router = APIRouter()

# 비밀번호 해싱을 위한 CryptContext 설정
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 비밀번호를 해싱하는 함수
def get_password_hash(password):
    return pwd_context.hash(password)

# Pydantic 모델: 사용자 생성 요청을 위한 데이터 모델
class UserCreate(BaseModel):
    username: str # 사용자 이름 (필수)
    email: str # 이메일 (필수)
    password: str # 비밀번호 (필수)
    is_active: Optional[bool] = True # 계정 활성화 여부 (기본값: True)
    is_admin: Optional[bool] = False # 관리자 권한 여부 (기본값: False)

# Pydantic 모델: 사용자 정보 업데이트 요청을 위한 데이터 모델
class UserUpdate(BaseModel):
    username: Optional[str] = None # 사용자 이름 (선택적)
    email: Optional[str] = None # 이메일 (선택적)
    is_active: Optional[bool] = None # 계정 활성화 여부 (선택적)
    is_admin: Optional[bool] = None # 관리자 권한 여부 (선택적)

# 새로운 사용자 생성 엔드포인트 (관리자용)
@router.post("/users", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    # 사용자 이름 중복 확인
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    # 이메일 중복 확인
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # 비밀번호 해싱
    hashed_password = get_password_hash(user.password)
    # 새 사용자 객체 생성
    new_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        is_active=user.is_active,
        is_admin=user.is_admin
    )
    db.add(new_user) # DB 세션에 추가
    db.commit() # 변경사항 커밋
    db.refresh(new_user) # DB에서 사용자 정보 새로고침
    return {"message": "User created successfully", "id": new_user.id, "username": new_user.username, "email": new_user.email} # 성공 메시지 및 생성된 사용자 정보 반환

# 모든 사용자 조회 엔드포인트 (관리자용)
@router.get("/users", response_model=List[dict])
def get_all_users(db: Session = Depends(get_db)):
    users = db.query(User).all() # 모든 사용자 조회
    # 사용자 목록 반환 (민감 정보 제외)
    return [{"id": user.id, "username": user.username, "email": user.email, "is_active": user.is_active, "is_admin": user.is_admin} for user in users]

# 특정 사용자 조회 엔드포인트 (관리자용)
@router.get("/users/{user_id}", response_model=dict)
def get_user_by_id(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first() # ID로 사용자 조회
    if not user: # 사용자 없으면 404 에러
        raise HTTPException(status_code=404, detail="User not found")
    # 사용자 정보 반환 (민감 정보 제외)
    return {"id": user.id, "username": user.username, "email": user.email, "is_active": user.is_active, "is_admin": user.is_admin}

# 사용자 삭제 엔드포인트 (관리자용)
@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT) # 204 No Content 반환
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first() # ID로 사용자 조회
    if not user: # 사용자 없으면 404 에러
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user) # 사용자 삭제
    db.commit() # 변경사항 커밋
    return # 204 응답 반환

# 사용자 정보 업데이트 엔드포인트 (관리자용)
@router.put("/users/{user_id}", response_model=dict)
def update_user(user_id: int, user_update: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first() # ID로 사용자 조회
    if not user: # 사용자 없으면 404 에러
        raise HTTPException(status_code=404, detail="User not found")

    # 업데이트할 데이터만 필터링
    update_data = user_update.dict(exclude_unset=True)
    # 사용자 객체 필드 업데이트
    for key, value in update_data.items():
        setattr(user, key, value)
    
    db.commit() # 변경사항 커밋
    db.refresh(user) # DB에서 사용자 정보 새로고침
    # 업데이트된 사용자 정보 반환 (민감 정보 제외)
    return {"id": user.id, "username": user.username, "email": user.email, "is_active": user.is_active, "is_admin": user.is_admin}
