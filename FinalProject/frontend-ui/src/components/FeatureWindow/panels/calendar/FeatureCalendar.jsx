import React, { useMemo, useState, useCallback } from "react";
import CalendarView from "./CalendarView";
import AgendaPanel from "./AgendaPanel";
import { FiCalendar } from "react-icons/fi";
import { LuChartGantt, LuChevronLeft, LuChevronRight, LuPencil } from "react-icons/lu";

/** 샘플 이벤트 (서버 연동 전) */
const seedEvents = [
  { id: 1, title: "신규 서비스 런칭 준비 주간", start: new Date(2025, 7, 4, 9), end: new Date(2025, 7, 9, 18), allDay: true, type: "project" },
  { id: 2, title: "팀 주간 회의", start: new Date(2025, 7, 13, 10), end: new Date(2025, 7, 13, 11), type: "meeting" },
  { id: 3, title: "신입사원 교육", start: new Date(2025, 7, 24, 9), end: new Date(2025, 7, 24, 12), type: "training" },
  { id: 4, title: "고객사 프리젠테이션", start: new Date(2025, 7, 13, 9), end: new Date(2025, 7, 13, 10), type: "project" },
  { id: 5, title: "팀 주간 회의", start: new Date(2025, 7, 28, 10), end: new Date(2025, 7, 28, 11), type: "meeting" },
  { id: 6, title: "외부 벤더 미팅", start: new Date(2025, 7, 20, 15), end: new Date(2025, 7, 20, 16), type: "etc" },
];

/** 내부: 일정 추가 버튼(콘솔만) */
function AddScheduleButton() {
  const onClick = useCallback(() => console.log("[일정 추가] 버튼 클릭"), []);
  return (
    <button
      className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      onClick={onClick}
      title="일정 추가하기"
    >
      <LuPencil className="h-4 w-4" />
      일정 추가하기
    </button>
  );
}

/** 내부: 뷰 토글(간트 비활성화) */
function ViewToggle({ view, onChange }) {
  const btn = "rounded-lg border border-neutral-300 p-2 hover:bg-neutral-50";
  const active = "bg-neutral-900 text-white hover:bg-neutral-900";
  return (
    <div className="flex items-center gap-2">
      <button
        className={`${btn} ${view === "calendar" ? active : ""}`}
        onClick={() => onChange?.("calendar")}
        title="캘린더"
      >
        <FiCalendar className="h-5 w-5" />
      </button>
      <button
        className={`${btn} opacity-50 cursor-not-allowed`}
        onClick={() => console.log("[간트] 추후 활성화")}
        title="간트(추후)"
      >
        <LuChartGantt className="h-5 w-5" />
      </button>
    </div>
  );
}

/** 내부: 월 전환 */
function MonthSwitcher({ currentDate, onChange }) {
  const yyyy = currentDate.getFullYear();
  const mm = currentDate.getMonth(); // 0-based
  const label = `${mm + 1}월`;
  const goPrev = () => onChange?.(new Date(yyyy, mm - 1, 1), { reason: "prev" });
  const goNext = () => onChange?.(new Date(yyyy, mm + 1, 1), { reason: "next" });

  return (
    <div className="flex items-center gap-2 mt-3">
      <button className="rounded-lg border border-neutral-300 p-2 hover:bg-neutral-50" onClick={goPrev} title="이전 달">
        <LuChevronLeft className="h-5 w-5" />
      </button>
      <div className="text-lg font-semibold min-w-[56px] text-center">{label}</div>
      <button className="rounded-lg border border-neutral-300 p-2 hover:bg-neutral-50" onClick={goNext} title="다음 달">
        <LuChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

export default function FeatureCalendar() {
  const [view, setView] = useState("calendar");
  const [currentDate, setCurrentDate] = useState(new Date(2025, 7, 1));
  const [events] = useState(seedEvents);

  const handleMonthChange = useCallback((nextDate, meta) => {
    setCurrentDate(nextDate);
    console.log("[월 전환]", nextDate, meta?.reason);
  }, []);

  const handleEventClick = useCallback((ev) => console.log("[이벤트 클릭]", ev), []);
  const handleJumpToDate = useCallback((date) => setCurrentDate(date), []);

  const leftPane = useMemo(
    () => (
      <CalendarView
        currentDate={currentDate}
        events={events}
        onEventClick={handleEventClick}
        onRangeChange={(r) => console.log("[표시 범위 변경]", r)}
      />
    ),
    [currentDate, events, handleEventClick]
  );

  return (
    <section>
      <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
        {/* 본문 2컬럼: 좌(타이틀/월전환/캘린더), 우(아젠다) */}
        <div className="grid grid-cols-12 gap-6">
          {/* ===== LEFT COLUMN ===== */}
          <div className="col-span-12 lg:col-span-8">
            {/* 1행: 타이틀 ←→ (일정추가/뷰토글) */}
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">일정 관리</h1>
              <div className="flex items-center gap-3">
                <AddScheduleButton />
                <ViewToggle view={view} onChange={setView} />
              </div>
            </div>

            {/* 2행: 월 전환 */}
            <MonthSwitcher currentDate={currentDate} onChange={handleMonthChange} />

            {/* 3행: 캘린더 */}
            <div className="mt-4">{leftPane}</div>
          </div>

          {/* ===== RIGHT COLUMN ===== */}
          <div className="col-span-12 lg:col-span-4">
            <AgendaPanel
              events={events}
              onSelectEvent={handleEventClick}
              onJumpToDate={handleJumpToDate}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
