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
} from "./agendaUtils";
import calendarApi from "../../../services/calendarApi.js";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [start, end] = range;
        const data = await calendarApi.getEvents({ start, end });
        if (!alive) return;
        setList(
          (data ?? [])
            .map(normalizeEvent)
            .sort((a, b) => {
              const s = a.start - b.start;      // 시작일 오름차순
              return s !== 0 ? s : (a.end - b.end); // 같은 날이면 종료가 빠른 것 먼저
            })
        );
      } catch (err) {
        if (!alive) return;
        setError(err);
        setList([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [range]);

  return (
    <aside className="bg-white rounded-2xl shadow-sm border border-neutral-200 w-full h-[620px] overflow-hidden flex flex-col">
      {/* 헤더: 탭 */}
      <div className="border-b border-neutral-200 px-4 pt-3">
        <div className="text-sm font-semibold mb-2">일정 리스트</div>
        <TabBar tab={tab} onChange={setTab} />
      </div>

      {/* 리스트 영역 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 simple-scroll">
        {loading ? (
          <div className="text-sm text-neutral-500 px-1">불러오는 중…</div>
        ) : error ? (
          <div className="text-sm text-rose-600 px-1">일정 불러오기 실패</div>
        ) : list.length === 0 ? (
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
