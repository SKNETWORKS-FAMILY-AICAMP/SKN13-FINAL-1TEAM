from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
from typing import Optional

from ..database import get_db, User
from pydantic import BaseModel # Pydantic BaseModel import

# APIRouter 인스턴스 생성
router = APIRouter()

# Pydantic 모델: 사용자 정보 업데이트 (자신 정보 수정용)
class UserUpdateMe(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None # 비밀번호 변경을 위한 필드

# 비밀번호 해싱을 위한 CryptContext 설정
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT(JSON Web Token) 설정을 위한 환경 변수 로드
SECRET_KEY = os.getenv("SECRET_KEY") # JWT 서명에 사용될 비밀 키
ALGORITHM = os.getenv("ALGORITHM", "HS256") # JWT 서명 알고리즘
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30)) # 액세스 토큰 만료 시간 (분)
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 7)) # 리프레시 토큰 만료 시간 (일)

# OAuth2PasswordBearer를 사용하여 토큰 URL 설정
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# 액세스 토큰 생성 함수
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire}) # 토큰 만료 시간 추가
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM) # JWT 인코딩
    return encoded_jwt

# 평문 비밀번호와 해시된 비밀번호를 비교하여 일치 여부 확인
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# 비밀번호를 해싱하는 함수
def get_password_hash(password):
    return pwd_context.hash(password)

# 사용자 인증 함수
async def authenticate_user(db: Session, username: str, password: str):
    user = db.query(User).filter(User.username == username).first() # 사용자 이름으로 사용자 조회
    if not user or not verify_password(password, user.hashed_password): # 사용자 없거나 비밀번호 불일치 시
        return None # 인증 실패
    return user # 인증 성공 시 사용자 반환

# 현재 사용자 가져오기 함수 (의존성 주입)
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException( # 인증 실패 시 발생할 예외
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM]) # 토큰 디코딩
        username: str = payload.get("sub") # 페이로드에서 사용자 이름 추출
        if username is None: # 사용자 이름이 없으면 예외 발생
            raise credentials_exception
    except JWTError: # JWT 오류 발생 시 예외 발생
        raise credentials_exception
    user = db.query(User).filter(User.username == username).first() # 사용자 이름으로 사용자 조회
    if user is None: # 사용자 없으면 예외 발생
        raise credentials_exception
    return user # 현재 사용자 반환

# 사용자 등록 엔드포인트
@router.post("/register")
async def register_user(username: str, email: str, password: str, db: Session = Depends(get_db)):
    hashed_password = get_password_hash(password) # 비밀번호 해싱
    db_user = User(username=username, email=email, hashed_password=hashed_password) # 새 사용자 객체 생성
    db.add(db_user) # DB 세션에 추가
    db.commit() # 변경사항 커밋
    db.refresh(db_user) # DB에서 사용자 정보 새로고침
    return {"message": "User registered successfully"} # 성공 메시지 반환

# 로그인 및 액세스 토큰 발급 엔드포인트
@router.post("/token")
async def login_for_access_token(response: Response, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = await authenticate_user(db, form_data.username, form_data.password) # 사용자 인증
    if not user: # 인증 실패 시
        raise HTTPException( # 401 Unauthorized 예외 발생
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES) # 액세스 토큰 만료 시간 설정
    access_token = create_access_token( # 액세스 토큰 생성
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    refresh_token_expires = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS) # 리프레시 토큰 만료 시간 설정
    refresh_token = create_access_token( # 리프레시 토큰 생성
        data={"sub": user.username, "type": "refresh"}, expires_delta=refresh_token_expires
    )

    response.set_cookie( # 리프레시 토큰을 HTTP-only 쿠키로 설정
        key="refresh_token",
        value=refresh_token,
        httponly=True, # JavaScript에서 접근 불가
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60, # 초 단위로 최대 수명 설정
        expires=refresh_token_expires, # 만료 시간 설정
        samesite="Lax", # CSRF 보호
        secure=True # HTTPS를 통해서만 전송 (운영 환경에서 True)
    )
    
    return {"access_token": access_token, "token_type": "bearer"} # 액세스 토큰 반환

# 로그아웃 엔드포인트
@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="refresh_token") # 리프레시 토큰 쿠키 삭제
    return {"message": "Logout successful"} # 성공 메시지 반환

# 현재 사용자 정보 조회 엔드포인트
@router.get("/me")
async def read_users_me(current_user: User = Depends(get_current_user)):
    return {"username": current_user.username, "email": current_user.email} # 현재 사용자 이름과 이메일 반환

# 현재 사용자 정보 수정 엔드포인트
@router.put("/me")
async def update_users_me(user_update: UserUpdateMe, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 업데이트할 데이터가 있는지 확인
    update_data = user_update.dict(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data provided for update")

    # 비밀번호가 포함되어 있으면 해싱하여 업데이트
    if "password" in update_data and update_data["password"]:
        current_user.hashed_password = get_password_hash(update_data["password"])
        del update_data["password"] # 해싱 후에는 원본 비밀번호 제거

    # 나머지 필드 업데이트
    for key, value in update_data.items():
        setattr(current_user, key, value)
    
    db.commit() # 변경사항 커밋
    db.refresh(current_user) # DB에서 사용자 정보 새로고침
    return {"message": "User information updated successfully", "username": current_user.username, "email": current_user.email} # 성공 메시지 및 업데이트된 정보 반환