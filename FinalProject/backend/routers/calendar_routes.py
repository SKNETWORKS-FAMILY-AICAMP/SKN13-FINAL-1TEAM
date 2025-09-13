from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime
from ..database import get_db, Calendar, Event, User
from .auth_routes import get_current_user

router = APIRouter()

# --- Pydantic 모델 ---
class EventBase(BaseModel):
    title: str
    description: Optional[str] = None
    start: datetime
    end: Optional[datetime] = None
    all_day: bool = False
    color: Optional[str] = None

    # ✅ 추가: 알림 분 (프론트에서 보내주는 값 그대로 저장/반환)
    #   - 프론트가 안 보내면(None) DB 기본값을 사용
    reminder_minutes_before: Optional[int] = None


class EventCreate(EventBase):
    pass


# 업데이트는 현재 전체 필드를 보내고 있으므로 그대로 둬도 되지만,
# 부분 업데이트도 안전하게 받으려면 Optional + exclude_unset 사용
class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    all_day: Optional[bool] = None
    color: Optional[str] = None
    reminder_minutes_before: Optional[int] = None


class EventOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    start: str
    end: Optional[str] = None
    allDay: bool
    color: Optional[str] = None
    # ✅ 응답에도 포함
    reminder_minutes_before: int


def get_or_create_default_calendar(db: Session, user_id: int) -> Calendar:
    calendar = db.query(Calendar).filter(Calendar.user_id == user_id).first()
    if not calendar:
        calendar = Calendar(user_id=user_id, name="My Calendar")
        db.add(calendar)
        db.commit()
        db.refresh(calendar)
    return calendar


@router.post("/events", response_model=EventOut)
def create_event(
    event: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    calendar = get_or_create_default_calendar(db, current_user.id)

    db_event = Event(
        title=event.title,
        description=event.description,
        start=event.start,
        end=event.end,
        all_day=event.all_day,
        color=event.color,
        # ✅ 프론트에서 보낸 값을 그대로 저장 (None이면 DB 기본값 사용)
        reminder_minutes_before=event.reminder_minutes_before,
        calendar_id=calendar.id,
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)

    return EventOut(
        id=db_event.id,
        title=db_event.title,
        description=db_event.description,
        start=db_event.start.isoformat(),
        end=db_event.end.isoformat() if db_event.end else None,
        allDay=db_event.all_day,
        color=db_event.color,
        # ✅ 응답에 항상 정수로 내려주기 위해 None이면 -1로 대체
        reminder_minutes_before=db_event.reminder_minutes_before if db_event.reminder_minutes_before is not None else -1,
    )


@router.get("/events", response_model=List[EventOut])
def list_events(
    start: datetime,
    end: datetime,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    calendar = get_or_create_default_calendar(db, current_user.id)

    events = (
        db.query(Event)
        .filter(
            Event.calendar_id == calendar.id,
            Event.start < end,
            Event.end > start,
        )
        .all()
    )

    return [
        EventOut(
            id=e.id,
            title=e.title,
            description=e.description,
            start=e.start.isoformat(),
            end=e.end.isoformat() if e.end else None,
            allDay=e.all_day,
            color=e.color,
            # ✅ 폴링 응답에 포함
            reminder_minutes_before=e.reminder_minutes_before if e.reminder_minutes_before is not None else -1,
        )
        for e in events
    ]


@router.put("/events/{event_id}", response_model=EventOut)
def update_event(
    event_id: int,
    event: EventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_event = db.query(Event).filter(Event.id == event_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")

    if db_event.calendar.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this event")

    # ✅ 부분 업데이트 안전 처리
    data = event.dict(exclude_unset=True)
    for key, value in data.items():
        setattr(db_event, key, value)

    db.commit()
    db.refresh(db_event)

    return EventOut(
        id=db_event.id,
        title=db_event.title,
        description=db_event.description,
        start=db_event.start.isoformat(),
        end=db_event.end.isoformat() if db_event.end else None,
        allDay=db_event.all_day,
        color=db_event.color,
        # ✅ 반환 포함
        reminder_minutes_before=db_event.reminder_minutes_before if db_event.reminder_minutes_before is not None else -1,
    )


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_event = db.query(Event).filter(Event.id == event_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")

    if db_event.calendar.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this event")

    db.delete(db_event)
    db.commit()
    return
