# services/greeting_service.py
"""
개인화된 챗봇 인사말 생성 서비스
"""
from datetime import datetime, date
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..database.models.user import User
from ..database.models.calendar import Event, Calendar


class GreetingService:
    """사용자 개인화된 인사말 생성 서비스"""
    
    @staticmethod
    def generate_personalized_greeting(user: User, db: Session) -> str:
        """
        사용자의 이름과 오늘의 일정을 기반으로 개인화된 인사말 생성
        
        Args:
            user: 로그인한 사용자 객체
            db: 데이터베이스 세션
            
        Returns:
            str: 개인화된 인사말
        """
        try:
            # 사용자 이름 가져오기
            username = user.username or "사용자"
            
            # 오늘의 일정 가져오기
            today_events = GreetingService._get_today_events(user.id, db)
            
            # 인사말 생성
            greeting = GreetingService._build_greeting_message(username, today_events)
            
            return greeting
            
        except Exception as e:
            # 에러 발생 시 기본 인사말 반환
            print(f"[GreetingService] Error generating greeting: {e}")
            return f"안녕하세요 {user.username or '사용자'}님.\n오늘도 좋은 하루 되세요!"
    
    @staticmethod
    def _get_today_events(user_id: int, db: Session) -> List[Dict[str, Any]]:
        """
        사용자의 오늘 일정 조회
        
        Args:
            user_id: 사용자 ID
            db: 데이터베이스 세션
            
        Returns:
            List[Dict]: 오늘의 일정 목록
        """
        try:
            # 한국 시간대 기준으로 오늘 날짜 범위 설정 (KST)
            from datetime import timezone, timedelta
            
            # KST = UTC+9
            kst = timezone(timedelta(hours=9))
            
            # 한국 시간 기준 오늘 날짜
            today_kst = datetime.now(kst).date()
            
            # 한국 시간 기준 오늘 00:00:00 ~ 23:59:59 (UTC로 변환)
            today_start_kst = datetime.combine(today_kst, datetime.min.time()).replace(tzinfo=kst)
            today_end_kst = datetime.combine(today_kst, datetime.max.time()).replace(tzinfo=kst)
            
            # UTC로 변환
            today_start_utc = today_start_kst.astimezone(timezone.utc).replace(tzinfo=None)
            today_end_utc = today_end_kst.astimezone(timezone.utc).replace(tzinfo=None)
            
            print(f"[GreetingService] 한국 시간 오늘: {today_kst}")
            print(f"[GreetingService] UTC 범위: {today_start_utc} ~ {today_end_utc}")
            
            # 사용자의 오늘 일정 조회
            events = db.query(Event).join(Calendar).filter(
                and_(
                    Calendar.user_id == user_id,
                    Event.start >= today_start_utc,
                    Event.start <= today_end_utc,
                    Event.status == "confirmed"  # 확정된 일정만
                )
            ).order_by(Event.start).all()
            
            print(f"[GreetingService] 조회된 일정 수: {len(events)}")
            
            # 일정 정보를 딕셔너리로 변환
            event_list = []
            for event in events:
                event_info = {
                    "title": event.title,
                    "start": event.start,
                    "end": event.end,
                    "all_day": event.all_day,
                    "description": event.description
                }
                event_list.append(event_info)
                print(f"[GreetingService] 일정: {event.title}, 시작: {event.start}, 종일: {event.all_day}")
            
            return event_list
            
        except Exception as e:
            print(f"[GreetingService] Error fetching today's events: {e}")
            return []
    
    @staticmethod
    def _build_greeting_message(username: str, events: List[Dict[str, Any]]) -> str:
        """
        사용자 이름과 일정 목록으로 인사말 메시지 구성
        
        Args:
            username: 사용자 이름
            events: 오늘의 일정 목록
            
        Returns:
            str: 완성된 인사말 메시지
        """
        greeting = f"안녕하세요 {username}님.\n"
        
        if not events:
            greeting += "오늘의 일정은 없습니다."
        else:
            greeting += "오늘의 일정은,\n"
            
            for i, event in enumerate(events, 1):
                title = event["title"]
                start_time = event["start"]
                
                if event["all_day"]:
                    time_str = "종일"
                else:
                    # UTC 시간을 한국 시간으로 변환하여 표시
                    from datetime import timezone, timedelta
                    kst = timezone(timedelta(hours=9))
                    if start_time.tzinfo is None:
                        # timezone naive datetime을 UTC로 간주
                        start_time_utc = start_time.replace(tzinfo=timezone.utc)
                    else:
                        start_time_utc = start_time
                    
                    start_time_kst = start_time_utc.astimezone(kst)
                    time_str = start_time_kst.strftime("%H:%M")
                
                greeting += f"{i}) {title} ({time_str})\n"
            
            # 마지막 줄바꿈 제거하고 마무리 문구 추가
            greeting = greeting.rstrip("\n")
            greeting += f"\n\n위 {len(events)}개의 일정이 있습니다."
        
        return greeting
    
    @staticmethod
    def create_initial_chat_message(user: User, db: Session) -> Dict[str, Any]:
        """
        새 세션을 위한 초기 챗봇 메시지 생성
        
        Args:
            user: 로그인한 사용자
            db: 데이터베이스 세션
            
        Returns:
            Dict: 초기 메시지 데이터
        """
        greeting = GreetingService.generate_personalized_greeting(user, db)
        
        return {
            "role": "assistant",
            "content": greeting,
            "timestamp": datetime.now(),
            "is_greeting": True  # 인사말임을 표시하는 플래그
        }
