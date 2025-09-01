
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
import uuid
from typing import Optional

from ..database import get_db, User, RefreshToken
from pydantic import BaseModel

# --- 라우터 및 보안 설정 ---
router = APIRouter(tags=["Authentication"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- 환경 변수 및 상수 ---
SECRET_KEY = os.getenv("SECRET_KEY", "a_very_secret_key")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 7))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")

# --- Pydantic 스키마 ---
class TokenData(BaseModel):
    username: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# --- 비밀번호 및 토큰 유틸리티 ---
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def create_refresh_token(user_id: int, db: Session) -> str:
    jti = str(uuid.uuid4())
    expires_delta = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    expire_at = datetime.now(timezone.utc) + expires_delta
    
    to_encode = {
        "sub": str(user_id),
        "exp": expire_at,
        "jti": jti,
        "type": "refresh"
    }
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    # DB에 리프레시 토큰 정보 저장
    db_refresh_token = RefreshToken(
        id=jti,
        user_id=user_id,
        expires_at=expire_at
    )
    db.add(db_refresh_token)
    db.commit()
    
    return encoded_jwt

# --- 핵심 의존성 ---
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.username == token_data.username).first()
    if user is None:
        raise credentials_exception
    return user

# --- 엔드포인트 ---
@router.post("/token", summary="로그인 및 토큰 발급")
async def login_for_access_token(response: Response, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": user.username})
    refresh_token = await create_refresh_token(user_id=user.id, db=db)

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        samesite="Lax",
        secure=True, # 운영 환경에서는 True
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "must_change_password": user.must_change_password
    }

@router.post("/refresh", summary="액세스 토큰 재발급 (토큰 회전 및 재사용 탐지)")
async def refresh_access_token(request: Request, response: Response, db: Session = Depends(get_db)):
    token_from_cookie = request.cookies.get("refresh_token")
    if not token_from_cookie:
        raise HTTPException(status_code=401, detail="Refresh token not found")

    credentials_exception = HTTPException(status_code=401, detail="Invalid refresh token")
    
    try:
        payload = jwt.decode(token_from_cookie, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise credentials_exception
        
        user_id = int(payload.get("sub"))
        jti = payload.get("jti")
        if not user_id or not jti:
            raise credentials_exception

    except (JWTError, ValueError):
        raise credentials_exception

    # DB에서 토큰 조회
    db_token = db.query(RefreshToken).filter(RefreshToken.id == jti).first()

    # 1. 토큰이 DB에 없는 경우
    if not db_token:
        raise credentials_exception

    # 2. 토큰이 이미 폐기된 경우 (재사용 탐지)
    if db_token.revoked_at:
        # 보안 이벤트: 모든 활성 리프레시 토큰을 폐기하고 강제 로그아웃
        db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id, 
            RefreshToken.revoked_at == None
        ).update({"revoked_at": datetime.now(timezone.utc)})
        db.commit()
        response.delete_cookie(key="refresh_token")
        raise HTTPException(status_code=401, detail="Attempted reuse of a revoked refresh token. All sessions terminated.")

    # 3. 토큰이 만료된 경우
    if db_token.expires_at < datetime.now(timezone.utc):
        raise credentials_exception

    # --- 토큰 회전 (Rotation) ---
    # 1. 현재 사용된 토큰을 DB에서 폐기
    db_token.revoked_at = datetime.now(timezone.utc)
    db.commit()

    # 2. 새로운 액세스 토큰과 리프레시 토큰 발급
    user = db.query(User).filter(User.id == user_id).first()
    new_access_token = create_access_token(data={"sub": user.username})
    new_refresh_token = await create_refresh_token(user_id=user.id, db=db)

    # 3. 새로운 리프레시 토큰을 쿠키에 설정
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        samesite="Lax",
        secure=True,
    )

    return {"access_token": new_access_token, "token_type": "bearer"}

@router.post("/logout", summary="로그아웃")
async def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token_from_cookie = request.cookies.get("refresh_token")
    if token_from_cookie:
        try:
            payload = jwt.decode(token_from_cookie, SECRET_KEY, algorithms=[ALGORITHM])
            jti = payload.get("jti")
            if jti:
                # DB에서 해당 리프레시 토큰 폐기
                db.query(RefreshToken).filter(RefreshToken.id == jti).update({"revoked_at": datetime.now(timezone.utc)})
                db.commit()
        except JWTError:
            # 토큰이 유효하지 않더라도 쿠키는 삭제
            pass
    
    response.delete_cookie(key="refresh_token")
    return {"message": "Logout successful"}

@router.put("/auth/change-password", summary="사용자 비밀번호 변경")
async def change_password(request: ChangePasswordRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect current password")

    current_user.hashed_password = get_password_hash(request.new_password)
    current_user.must_change_password = False
    db.commit()
    
    return {"message": "Password updated successfully"}

@router.get("/me", summary="현재 사용자 정보 조회")
async def read_users_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "is_manager": current_user.is_manager,
        "must_change_password": current_user.must_change_password
    }
