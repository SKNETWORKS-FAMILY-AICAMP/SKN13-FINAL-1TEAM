from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from .delete_service import delete_message, delete_session, delete_older_in_session, DB

router = APIRouter(prefix="/chat", tags=["chat-delete"])

# ===== 프로젝트에 맞게 바꿔주세요 =====
def get_db() -> DB:
    """
    TODO: database.py 등 실제 DB 래퍼를 반환.
      예)
        from backend.ChatBot.database import MyDB
        return MyDB()
    """
    raise NotImplementedError("get_db()를 실제 DB로 연결하세요.")

def get_current_user_id():
    """
    TODO: 인증 미들웨어에서 user_id 추출해 반환.
    """
    return "user-123"  # 임시
# ====================================

@router.delete("/messages/{message_id}")
def api_delete_message(
    message_id: str,
    hard: bool = Query(False),
    db: DB = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    result = delete_message(db, message_id=message_id, user_id=user_id, hard=hard)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail="message not found")
    return result

@router.delete("/sessions/{session_id}")
def api_delete_session(
    session_id: str,
    hard: bool = Query(False),
    db: DB = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    result = delete_session(db, session_id=session_id, user_id=user_id, hard=hard)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail="session not found")
    return result

@router.delete("/sessions/{session_id}/messages")
def api_delete_older_in_session(
    session_id: str,
    before: Optional[str] = Query(None, description="ISO8601 e.g. 2025-08-01T00:00:00Z"),
    keep_last: Optional[int] = Query(None, ge=0),
    db: DB = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    result = delete_older_in_session(db, session_id=session_id, user_id=user_id, before=before, keep_last=keep_last)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("reason", "bad_request"))
    return result
