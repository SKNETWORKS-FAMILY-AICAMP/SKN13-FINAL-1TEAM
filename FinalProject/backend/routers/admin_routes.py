from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db, User
from pydantic import BaseModel

router = APIRouter()

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None

@router.get("/users", response_model=List[dict])
def get_all_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{"id": user.id, "username": user.username, "email": user.email, "is_active": user.is_active, "is_admin": user.is_admin} for user in users]

@router.get("/users/{user_id}", response_model=dict)
def get_user_by_id(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user.id, "username": user.username, "email": user.email, "is_active": user.is_active, "is_admin": user.is_admin}

@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return

@router.put("/users/{user_id}", response_model=dict)
def update_user(user_id: int, user_update: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)
    
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "email": user.email, "is_active": user.is_active, "is_admin": user.is_admin}
