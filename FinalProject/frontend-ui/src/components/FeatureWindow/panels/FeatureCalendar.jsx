// ✅ FeatureCalendar.jsx
/* 
  파일: frontend-ui/src/components/FeatureWindow/panels/FeatureCalendar.jsx
  역할: 기능부의 "캘린더" 패널. 현재는 안내 문구와 기본 섹션 레이아웃만 제공하며,
       추후 Google Calendar API(또는 사내 캘린더 서비스)와 연동될 확장 포인트를 가진다.

  LINKS:
    - 이 파일을 사용하는 곳:
      * FeatureShell.jsx (역할/라우팅에 따라 이 패널로 진입)
    - 이 파일이 사용하는 것:
      * 외부 컴포넌트/서비스 사용 없음 (순수 UI 섹션)

  확장 포인트(예시):
    - Google Calendar 연동 시:
      1) services/calendarApi.js 생성 → 인증/토큰/이벤트 조회 함수 정의
      2) FeatureCalendar 내부 useEffect에서 일정 fetch → 로딩/실패/성공 상태 관리
      3) 일정 리스트/월간 캘린더 UI 컴포넌트(예: CalendarGrid.jsx) 분리 및 연결

  데이터 흐름(현재):
    - 정적 텍스트만 렌더 → 추후 API 연동시 상태/이펙트 추가 예정

  주의:
    - 후속 개발에서 API 키/토큰은 env.js 또는 안전한 백엔드 경유로 관리
*/

import React from "react";

export default function FeatureMypage() {
    return (
        <section>
            <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
                {/* 제목 */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">일정 관리</h1>
                </div>
            </div>
        </section>
    );
}