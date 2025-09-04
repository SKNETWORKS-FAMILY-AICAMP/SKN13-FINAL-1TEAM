from __future__ import annotations
from typing import Optional, Sequence, Protocol

from .s3_utils import delete_objects  # S3 정리 사용 안하면 import 제거
DOCS_BUCKET = "YOUR_S3_BUCKET_NAME"   # ← 환경변수/설정으로 빼도 됩니다.

# DB 인터페이스(프로토콜) — 실제 구현은 database.py 또는 chat_history_manager 등에 맞춰주세요.
class DB(Protocol):
    def get_message(self, message_id: str, user_id: str) -> Optional[dict]: ...
    def list_session_messages(self, session_id: str, user_id: str, include_deleted: bool = False) -> Sequence[dict]: ...
    def soft_delete_message(self, message_id: str) -> None: ...
    def hard_delete_message(self, message_id: str) -> None: ...
    def soft_delete_session(self, session_id: str, user_id: str) -> None: ...
    def hard_delete_session(self, session_id: str, user_id: str) -> None: ...
    def bulk_soft_delete_before(self, session_id: str, user_id: str, before_iso: str) -> int: ...
    def bulk_soft_delete_keep_last(self, session_id: str, user_id: str, keep_last: int) -> int: ...

def _collect_attachment_keys(msgs: Sequence[dict]) -> list[str]:
    keys: list[str] = []
    for m in msgs:
        for a in (m.get("attachments") or []):
            k = a.get("key") or a.get("s3_key") or a.get("Key")
            if k:
                keys.append(k)
    return keys

def delete_message(db: DB, *, message_id: str, user_id: str, hard: bool = False) -> dict:
    msg = db.get_message(message_id, user_id=user_id)
    if not msg:
        return {"ok": False, "reason": "not_found"}
    if hard:
        keys = _collect_attachment_keys([msg])
        if keys:
            delete_objects(DOCS_BUCKET, keys)
        db.hard_delete_message(message_id)
    else:
        db.soft_delete_message(message_id)
    return {"ok": True}

def delete_session(db: DB, *, session_id: str, user_id: str, hard: bool = False) -> dict:
    if hard:
        msgs = db.list_session_messages(session_id, user_id=user_id, include_deleted=True)
        keys = _collect_attachment_keys(msgs)
        if keys:
            delete_objects(DOCS_BUCKET, keys)
        db.hard_delete_session(session_id, user_id=user_id)
    else:
        db.soft_delete_session(session_id, user_id=user_id)
    return {"ok": True}

def delete_older_in_session(db: DB, *, session_id: str, user_id: str, before: Optional[str], keep_last: Optional[int]) -> dict:
    if before:
        n = db.bulk_soft_delete_before(session_id, user_id=user_id, before_iso=before)
        return {"ok": True, "soft_deleted": n}
    if keep_last is not None:
        n = db.bulk_soft_delete_keep_last(session_id, user_id=user_id, keep_last=keep_last)
        return {"ok": True, "soft_deleted": n}
    return {"ok": False, "reason": "no_criteria"}
