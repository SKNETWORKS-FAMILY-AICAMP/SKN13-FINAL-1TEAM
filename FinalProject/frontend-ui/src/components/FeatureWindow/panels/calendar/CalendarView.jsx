// CalendarView.jsx
import React, { useMemo } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { ko } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./calendarView.css";

import { EVENT_TYPE_COLORS, RBC_KO_MESSAGES } from "./calendarConstants";

const locales = { ko };
const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
    getDay,
    locales,
});

const FORMATS = {
    // 내부 요일 헤더는 숨김 (우리는 외부 요일 바 사용)
    weekdayFormat: () => "",

    // 월 그리드 날짜
    dayFormat: (d, c, l) => l.format(d, "d", c),
    dateFormat: (d, c, l) => l.format(d, "d", c),

    // ⬇️ 팝업 헤더 (버전별 호환: 둘 다 지정)
    popupHeaderFormat: (d, c, l) => l.format(d, "M월 d일", c),
    dayHeaderFormat: (d, c, l) => l.format(d, "M월 d일", c),
};

// 이벤트 칩 내부 렌더(텍스트만)
function EventCell({ event }) {
    return (
        <div className="rbc-chip-inner">
            <span className="rbc-chip-text">{event.title}</span>
        </div>
    );
}

const MESSAGES = {
    ...RBC_KO_MESSAGES,
    showMore: (total) => `+${total}개의 일정`, // ⬅️ 변경
};

const K_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
function WeekdayBar() {
    return (
        <div className="weekday-bar">
            {K_WEEKDAYS.map((w) => (
                <div key={w} className="weekday-cell">
                    {w}
                </div>
            ))}
        </div>
    );
}

export default function CalendarView({
    currentDate,
    events,
    onEventClick,
    onRangeChange,
    height = 560,
}) {
    const date = useMemo(() => currentDate ?? new Date(), [currentDate]);

    return (
        <div className="calendar-shell">
            {/* ⬇️ 요일 바를 달력 위에 */}
            <WeekdayBar />
            <div className="calendar-card">
                <Calendar
                    className="custom-rbc"
                    localizer={localizer}
                    events={events}
                    date={date}
                    defaultView={Views.MONTH}
                    views={[Views.MONTH]}
                    popup
                    selectable
                    startAccessor="start"
                    endAccessor="end"
                    messages={MESSAGES}
                    components={{
                        event: EventCell,
                        toolbar: () => null, // 상단 툴바 제거
                    }}
                    /* ⬇️ 내부 헤더 텍스트는 비워서 공간 자체를 없앰 */
                    formats={FORMATS}
                    onSelectEvent={onEventClick}
                    onRangeChange={(range) => onRangeChange?.(range)}
                    eventPropGetter={(event) => {
                        const base =
                            EVENT_TYPE_COLORS[event.type ?? "etc"] ??
                            EVENT_TYPE_COLORS.etc;
                        const bg = event.color ?? base.bg;
                        const fg = event.textColor ?? base.text;
                        return {
                            style: {
                                backgroundColor: bg,
                                color: fg,
                                border: "none",
                                borderRadius: 9999,
                                padding: "0 8px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center", // ⬅️ 중앙 정렬
                                fontWeight: 600,
                                boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
                            },
                        };
                    }}
                    dayPropGetter={(d) =>
                        new Date().toDateString() === d.toDateString()
                            ? { className: "is-today" }
                            : {}
                    }
                    style={{ height }}
                />
            </div>
        </div>
    );
}
