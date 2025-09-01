from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime
from ..database import get_db, Calendar, Event

router = APIRouter()

# --- Pydantic Models ---
class EventBase(BaseModel):
    title: str
    description: Optional[str] = None
    start: datetime
    end: Optional[datetime] = None
    all_day: bool = False
    color: Optional[str] = None

class EventCreate(EventBase):
    pass

class EventUpdate(EventBase):
    pass

class EventInDB(EventBase):
    id: int
    calendar_id: int

    class Config:
        orm_mode = True

class EventOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    start: str
    end: Optional[str] = None
    allDay: bool
    color: Optional[str] = None

# Helper function to get or create a default calendar for a user
def get_or_create_default_calendar(db: Session, user_id: int) -> Calendar:
    calendar = db.query(Calendar).filter(Calendar.user_id == user_id).first()
    if not calendar:
        calendar = Calendar(user_id=user_id, name="My Calendar")
        db.add(calendar)
        db.commit()
        db.refresh(calendar)
    return calendar

# --- Calendar API Endpoints ---
@router.post("/events", response_model=EventOut)
def create_event(event: EventCreate, db: Session = Depends(get_db)):
    default_user_id = 1  # 임시 사용자
    calendar = get_or_create_default_calendar(db, default_user_id)
    
    db_event = Event(
        **event.dict(),
        calendar_id=calendar.id
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
        color=db_event.color
    )

@router.get("/events", response_model=List[EventOut])
def get_events(start: datetime, end: datetime, db: Session = Depends(get_db)):
    default_user_id = 1 # 임시 사용자
    
    calendar = get_or_create_default_calendar(db, default_user_id)
    
    events = db.query(Event).filter(
        Event.calendar_id == calendar.id,
        Event.start < end,
        Event.end > start
    ).all()
    
    return [
        EventOut(
            id=e.id,
            title=e.title,
            description=e.description,
            start=e.start.isoformat(),
            end=e.end.isoformat() if e.end else None,
            allDay=e.all_day,
            color=e.color
        ) for e in events
    ]

@router.put("/events/{event_id}", response_model=EventOut)
def update_event(event_id: int, event: EventUpdate, db: Session = Depends(get_db)):
    db_event = db.query(Event).filter(Event.id == event_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")

    default_user_id = 1
    if db_event.calendar.user_id != default_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this event")

    for key, value in event.dict().items():
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
        color=db_event.color
    )

@router.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: int, db: Session = Depends(get_db)):
    db_event = db.query(Event).filter(Event.id == event_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")

    default_user_id = 1
    if db_event.calendar.user_id != default_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this event")

    db.delete(db_event)
    db.commit()
    return
