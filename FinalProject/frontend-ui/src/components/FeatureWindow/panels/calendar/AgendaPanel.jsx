// components/FeatureWindow/panels/calendar/AgendaPanel.jsx
import React, { useMemo, useState } from "react";
import {
  filterEventsByRange,
  getTodayRange,
  getWeekRange,
  getMonthRange,
  timeRangeLabel,
} from "./agendaUtils";
import { EVENT_TYPE_COLORS } from "./calendarConstants";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

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
  const [tab, setTab] = useState("month"); // 'today' | 'week' | 'month'

  // 기간 계산
  const { range, title } = useMemo(() => {
    if (tab === "today") {
      const [s, e] = getTodayRange(currentDate);
      return { range: [s, e], title: "오늘" };
    }
    if (tab === "week") {
      const [s, e] = getWeekRange(currentDate);
      return { range: [s, e], title: "주간" };
    }
    const [s, e] = getMonthRange(currentDate);
    return {
      range: [s, e],
      title: "월간",
    };
  }, [tab, currentDate]);

  const list = useMemo(
    () => filterEventsByRange(events, range[0], range[1]),
    [events, range]
  );

  return (
    <aside className="bg-white rounded-2xl shadow-sm border border-neutral-200 w-full h-[620px] overflow-hidden flex flex-col">
      {/* 헤더: 탭 */}
      <div className="border-b border-neutral-200 px-4 pt-3">
        <div className="text-sm font-semibold mb-2">일정 리스트</div>
        <TabBar tab={tab} onChange={setTab} />
      </div>

      {/* 리스트 영역 */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {list.length === 0 ? (
          <div className="text-sm text-neutral-500 px-1">표시할 일정이 없습니다.</div>
        ) : (
          <ul className="space-y-2">
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
  const base = "text-sm px-2 pb-2 cursor-pointer";
  const active =
    "font-semibold text-neutral-900 border-b-2 border-neutral-900";
  const inactive = "text-neutral-400 hover:text-neutral-700";

  return (
    <div className="flex gap-6">
      <button
        className={`${base} ${tab === "today" ? active : inactive}`}
        onClick={() => onChange("today")}
      >
        오늘
      </button>
      <button
        className={`${base} ${tab === "week" ? active : inactive}`}
        onClick={() => onChange("week")}
      >
        주간
      </button>
      <button
        className={`${base} ${tab === "month" ? active : inactive}`}
        onClick={() => onChange("month")}
      >
        월간
      </button>
    </div>
  );
}

/** 월간/주간/오늘 – 공통 아이템 렌더링 (스크린샷 느낌) */
function MonthlyRow({ ev, onClick, onJumpToDate }) {
  const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
  const end   = ev.end   instanceof Date ? ev.end   : new Date(ev.end);
  const base = EVENT_TYPE_COLORS[ev.type ?? "etc"] ?? EVENT_TYPE_COLORS.etc;
  const barColor = ev.color ?? base.bg;

  return (
    <li>
      <div className="grid grid-cols-[52px_10px_1fr] gap-2 items-start">
        {/* 왼쪽 날짜/시간 */}
        <button
          type="button"
          onClick={() => onJumpToDate?.(start)}
          title="이 날짜로 이동"
          className="text-left"
        >
          <div className="text-[11px] text-neutral-500 leading-none">
            {format(start, "d일", { locale: ko })}
          </div>
          <div className="text-[11px] text-neutral-500 leading-none mt-1">
            {format(start, "HH:mm", { locale: ko })}
          </div>
        </button>

        {/* 가운데 색 막대 */}
        <div
          className="h-10 rounded-sm"
          style={{ backgroundColor: barColor }}
          aria-hidden
        />

        {/* 우측 내용 */}
        <button
          type="button"
          onClick={onClick}
          className="w-full text-left"
          title={ev.title}
        >
          <div className="text-sm font-medium text-neutral-900 truncate">
            {ev.title}
          </div>
          <div className="text-[11px] text-neutral-500">
            {timeRangeLabel(start, end, ev.allDay)}
            {ev.description ? (
              <>
                {"  "}
                <span className="mx-2 text-neutral-300">•</span>
                <span className="line-clamp-1">{ev.description}</span>
              </>
            ) : null}
          </div>
        </button>
      </div>
    </li>
  );
}
