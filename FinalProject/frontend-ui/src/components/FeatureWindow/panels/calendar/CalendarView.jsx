import React, { useMemo } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { ko } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./calendarView.exact.css"; // ⬅️ 추가: 정확 스킨

import { EVENT_TYPE_COLORS, RBC_KO_MESSAGES } from "./calendarConstants";

const locales = { ko };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales,
});

// 이벤트 칩 내부 렌더(텍스트만)
function EventCell({ event }) {
  return (
    <div className="rbc-chip-inner">
      <span className="rbc-chip-text">{event.title}</span>
    </div>
  );
}

export default function CalendarView({
  currentDate,
  events,
  onEventClick,
  onRangeChange,
}) {
  const date = useMemo(() => currentDate ?? new Date(), [currentDate]);

  return (
    <div className="calendar-shell">
      <div className="calendar-card">
        <Calendar
          className="custom-rbc"
          localizer={localizer}
          events={events}
          date={date}
          defaultView={Views.MONTH}
          views={[Views.MONTH]}              // 월만
          popup
          selectable
          startAccessor="start"
          endAccessor="end"
          messages={RBC_KO_MESSAGES}
          components={{
            event: EventCell,
            toolbar: () => null,             // 상단 툴바 제거
          }}
          // 요일/날짜 표기: 한글 1글자 요일, 날짜 숫자만
          formats={{
            weekdayFormat: (d, c, l) => l.format(d, "EEEEE", c), // 일 월 화 수 목 금 토
            dayFormat: (d, c, l) => l.format(d, "d", c),
            dateFormat: (d, c, l) => l.format(d, "d", c),
          }}
          onSelectEvent={onEventClick}
          onRangeChange={(range) => onRangeChange?.(range)}
          eventPropGetter={(event) => {
            const base =
              EVENT_TYPE_COLORS[event.type ?? "etc"] ?? EVENT_TYPE_COLORS.etc;
            const bg = event.color ?? base.bg;
            const fg = event.textColor ?? base.text;
            return {
              style: {
                backgroundColor: bg,
                color: fg,
                border: "none",
                borderRadius: 9999,           // 완전 알약
                padding: "0 10px",
                height: 24,
                lineHeight: "24px",
                boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
              },
            };
          }}
          dayPropGetter={(d) =>
            new Date().toDateString() === d.toDateString()
              ? { className: "is-today" }
              : {}
          }
        />
      </div>
    </div>
  );
}
