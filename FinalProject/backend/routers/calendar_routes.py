from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime
from ..database import get_db, Calendar, Event, User # Import User model
from .auth_routes import get_current_user # Import get_current_user

# APIRouter 인스턴스 생성
router = APIRouter()

# --- Pydantic 모델 ---
# 이벤트의 기본 속성을 정의하는 Pydantic 모델
class EventBase(BaseModel):
    title: str # 이벤트 제목 (필수)
    description: Optional[str] = None # 이벤트 설명 (선택적)
    start: datetime # 이벤트 시작 시간 (필수)
    end: Optional[datetime] = None # 이벤트 종료 시간 (선택적)
    all_day: bool = False # 종일 이벤트 여부 (기본값: False)
    color: Optional[str] = None # 이벤트 색상 (선택적)

# 이벤트 생성 요청을 위한 Pydantic 모델 (EventBase 상속)
class EventCreate(EventBase):
    pass

# 이벤트 업데이트 요청을 위한 Pydantic 모델 (EventBase 상속)
class EventUpdate(EventBase):
    pass

# 데이터베이스에 저장된 이벤트의 Pydantic 모델
class EventInDB(EventBase):
    id: int # 이벤트 ID
    calendar_id: int # 이벤트가 속한 캘린더 ID

    class Config:
        orm_mode = True # ORM 모델과의 호환성을 위한 설정

# 클라이언트에 반환될 이벤트 정보의 Pydantic 모델
class EventOut(BaseModel):
    id: int # 이벤트 ID
    title: str # 이벤트 제목
    description: Optional[str] = None # 이벤트 설명
    start: str # 이벤트 시작 시간 (ISO 형식 문자열)
    end: Optional[str] = None # 이벤트 종료 시간 (ISO 형식 문자열, 선택적)
    allDay: bool # 종일 이벤트 여부
    color: Optional[str] = None # 이벤트 색상

# 사용자의 기본 캘린더를 가져오거나 생성하는 헬퍼 함수
def get_or_create_default_calendar(db: Session, user_id: int) -> Calendar:
    calendar = db.query(Calendar).filter(Calendar.user_id == user_id).first() # 사용자 ID로 캘린더 조회
    if not calendar: # 캘린더가 없으면 새로 생성
        calendar = Calendar(user_id=user_id, name="My Calendar")
        db.add(calendar) # DB 세션에 추가
        db.commit() # 변경사항 커밋
        db.refresh(calendar) # DB에서 캘린더 정보 새로고침
    return calendar # 캘린더 반환

# --- 캘린더 API 엔드포인트 ---
# 새로운 캘린더 이벤트 생성 엔드포인트
@router.post("/events", response_model=EventOut)
def create_event(event: EventCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)): # current_user 추가
    calendar = get_or_create_default_calendar(db, current_user.id) # current_user.id 사용
    
    db_event = Event( # 새 이벤트 객체 생성
        **event.dict(), # EventCreate 모델의 데이터를 딕셔너리로 변환하여 사용
        calendar_id=calendar.id # 캘린더 ID 설정
    )
    db.add(db_event) # DB 세션에 추가
    db.commit() # 변경사항 커밋
    db.refresh(db_event) # DB에서 이벤트 정보 새로고침
    
    return EventOut( # 생성된 이벤트 정보 반환
        id=db_event.id,
        title=db_event.title,
        description=db_event.description,
        start=db_event.start.isoformat(), # datetime 객체를 ISO 형식 문자열로 변환
        end=db_event.end.isoformat() if db_event.end else None, # 종료 시간도 ISO 형식으로 변환
        allDay=db_event.all_day,
        color=db_event.color
    )

# 특정 기간의 캘린더 이벤트 조회 엔드포인트
@router.get("/events", response_model=List[EventOut])
def list_events(start: datetime, end: datetime, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)): # current_user 추가
    calendar = get_or_create_default_calendar(db, current_user.id) # current_user.id 사용
    
    events = db.query(Event).filter( # 캘린더 ID와 기간으로 이벤트 필터링
        Event.calendar_id == calendar.id,
        Event.start < end,
        Event.end > start
    ).all() # 모든 일치하는 이벤트 가져오기
    
    return [ # 조회된 이벤트 목록 반환
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

# 캘린더 이벤트 업데이트 엔드포인트
@router.put("/events/{event_id}", response_model=EventOut)
def update_event(event_id: int, event: EventUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)): # current_user 추가
    db_event = db.query(Event).filter(Event.id == event_id).first() # 이벤트 ID로 이벤트 조회
    if not db_event: # 이벤트가 없으면 404 에러
        raise HTTPException(status_code=404, detail="Event not found")

    # 이벤트 소유권 확인 (current_user.id와 비교)
    if db_event.calendar.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this event")

    # EventUpdate 모델의 데이터를 사용하여 이벤트 필드 업데이트
    for key, value in event.dict().items():
        setattr(db_event, key, value)
    
    db.commit() # 변경사항 커밋
    db.refresh(db_event) # DB에서 이벤트 정보 새로고침

    return EventOut( # 업데이트된 이벤트 정보 반환
        id=db_event.id,
        title=db_event.title,
        description=db_event.description,
        start=db_event.start.isoformat(),
        end=db_event.end.isoformat() if db_event.end else None,
        allDay=db_event.all_day,
        color=db_event.color
    )

# 캘린더 이벤트 삭제 엔드포인트
@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT) # 204 No Content 반환
def delete_event(event_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)): # current_user 추가
    db_event = db.query(Event).filter(Event.id == event_id).first() # 이벤트 ID로 이벤트 조회
    if not db_event: # 이벤트가 없으면 404 에러
        raise HTTPException(status_code=404, detail="Event not found")

    # 이벤트 소유권 확인
    if db_event.calendar.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this event")

    db.delete(db_event) # 이벤트 삭제
    db.commit() # 변경사항 커밋
    return # 204 응답 반환
