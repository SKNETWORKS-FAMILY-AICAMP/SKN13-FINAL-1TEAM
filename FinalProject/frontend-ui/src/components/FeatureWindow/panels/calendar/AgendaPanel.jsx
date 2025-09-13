// components/FeatureWindow/panels/calendar/AgendaPanel.jsx
import React, { useMemo, useState, useEffect } from "react";
import {
  normalizeEvent,
  getTodayRange,
  getWeekRange,
  getMonthRange,
  timeRangeLabel,
  dateRangeLabelShort, 
  buildLeftLines,  
  ellipsis,
  filterEventsByRange, 
} from "./agendaUtils";
// import calendarApi from "../../../services/calendarApi.js";
import { EVENT_TYPES } from "./calendarConstants";
// import { format } from "date-fns";
// import { ko } from "date-fns/locale";

/**
 * props:
 * - events: Array<{id,title,start,end,allDay?,type?,color?,textColor?, description?}>
 * - currentDate?: Date           // 기준 날짜(없으면 오늘)
 * - onSelectEvent?: (event) => void
 * - onJumpToDate?: (date: Date) => void
 */
export default function AgendaPanel({
  events = [],
  currentDate = new Date(),
  onSelectEvent,
  onJumpToDate,
}) {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timeout = nextMidnight.getTime() - now.getTime();
    const id = setTimeout(() => setToday(new Date()), timeout); // 자정 + 1s에 오늘 갱신
    return () => clearTimeout(id);
  }, []);

  const [tab, setTab] = useState("today"); // 'today' | 'week' | 'month'

  // 기간 계산
  const { range, title } = useMemo(() => {
    if (tab === "today") {
      const [s, e] = getTodayRange(today);
      return { range: [s, e], title: "오늘" };
    }
    if (tab === "week") {
      const [s, e] = getWeekRange(today);
      return { range: [s, e], title: "주간" };
    }
    const [s, e] = getMonthRange(today);
    return { range: [s, e], title: "월간" };
  }, [tab, today]);


  const [list, setList] = useState([]);

  // ✅ 상위에서 내려준 events가 바뀌거나 탭/날짜 범위가 바뀌면 즉시 필터링
  useEffect(() => {
    const [start, end] = range;
    const filtered = filterEventsByRange(events, start, end)
      .map(normalizeEvent)
      .sort((a, b) => (a.start - b.start) || (a.end - b.end));
    setList(filtered);
  }, [events, range]);

  return (
    <aside className="bg-white rounded-2xl shadow-sm border border-neutral-200 w-full h-[100%] overflow-hidden flex flex-col">
      {/* 헤더: 탭 */}
      <div className="mt-3 mb-3">
        <TabBar tab={tab} onChange={setTab} />
      </div>

       {/* 리스트 영역 */}
       <div className="flex-1 overflow-y-auto px-3 py-3 simple-scroll">
         {list.length === 0 ? (
           <div className="text-sm text-neutral-500 px-1">일정이 없습니다.</div>
         ) : (
           <ul className="space-y-4">
            {list.map((ev) => (
              <MonthlyRow
                key={ev.id}
                ev={ev}
                onClick={() => onSelectEvent?.(ev)}
                onJumpToDate={onJumpToDate}
              />
            ))}
           </ul>
         )}
       </div>
    </aside>
  );
}

/* ------------------- UI Partials ------------------- */

function TabBar({ tab, onChange }) {
  const TABS = [
    { key: "today", label: "오늘" },
    { key: "week", label: "주간" },
    { key: "month", label: "월간" },
  ];
  const activeIdx = Math.max(0, TABS.findIndex((t) => t.key === tab));

  return (
    <div className="w-full flex justify-center">
      <div className="relative grid grid-cols-3 w-[100%]">
        {/* 하단 인디케이터 (부드럽게 이동) */}
        <span
          className="pointer-events-none absolute bottom-0 left-0 h-[3px] bg-neutral-900 rounded-lg transition-transform duration-300 ease-out"
          style={{ width: "33.3333%", transform: `translateX(${activeIdx * 100}%)` }}
        />
        {TABS.map((t) => {
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={[
                "relative pt-2 pb-4 text-sm text-center",
                "transition-colors duration-200 ease-out",
                isActive ? "text-neutral-900 font-semibold" : "text-neutral-400 hover:text-neutral-700",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-block transition-all duration-200",
                  isActive ? "opacity-100 translate-y-0" : "opacity-80 translate-y-[2px]",
                ].join(" ")}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}



function MonthlyRow({ ev, onClick, onJumpToDate }) {
  const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
  const end   = ev.end   instanceof Date ? ev.end   : new Date(ev.end);
  const base = EVENT_TYPES[ev.type ?? "etc"] ?? EVENT_TYPES.etc;
  const barColor = ev.color ?? base.bg;

  // 왼쪽(컬러바 기준 좌측) 두 줄 라벨
  const [l1, l2] = buildLeftLines(start, end, !!ev.allDay);

  return (
    <li>
      <div className="grid grid-cols-[90px_6px_1fr] gap-2 items-start">
        {/* 왼쪽: 날짜/시간(오른쪽 정렬) */}
        <button
          type="button"
          onClick={() => onJumpToDate?.(start)}
          title="이 날짜로 이동"
          className="text-right"
        >
          <div className="text-[12px] text-neutral-500 leading-tight">{l1}</div>
          <div className="text-[12px] text-neutral-500 leading-tight">{l2}</div>
        </button>

        {/* 가운데 컬러바 */}
        <div
          className="h-14 rounded-full"
          style={{ backgroundColor: barColor }}
          aria-hidden
        />

        {/* 오른쪽: 제목 + 설명(20자 …) */}
        <button
          type="button"
          onClick={onClick}
          className="w-full text-left rounded-md hover:bg-neutral-50"
          title={ev.title}
        >
          <div className="text-[14px] text-neutral-900 font-medium truncate">
            {ev.title}
          </div>
          {ev.description ? (
            <div className="text-[11px] text-neutral-500">
              {ellipsis(ev.description, 20)}
            </div>
          ) : null}
        </button>
      </div>
    </li>
  );
}