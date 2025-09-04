import React, { useMemo } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { ko } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { EVENT_TYPE_COLORS, RBC_KO_MESSAGES } from "./calendarConstants";

const locales = { ko };
const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
    getDay,
    locales,
});

// 이벤트 셀: 제목만
function EventCell({ event }) {
    return (
        <div className="flex items-center">
            <span className="text-[12px] leading-4 font-medium truncate">
                {event.title}
            </span>
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
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-4">
            <div className="h-[560px]">
                <Calendar
                    localizer={localizer}
                    events={events}
                    date={date}
                    defaultView={Views.MONTH}
                    views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
                    popup
                    selectable
                    step={30}
                    timeslots={2}
                    startAccessor="start"
                    endAccessor="end"
                    messages={RBC_KO_MESSAGES}
                    components={{
                        event: EventCell,
                        toolbar: () => null, // ✅ 상단 툴바 제거
                    }}
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
                                borderRadius: 8,
                                padding: "2px 8px",
                            },
                        };
                    }}
                    dayPropGetter={(d) =>
                        new Date().toDateString() === d.toDateString()
                            ? { className: "bg-amber-50" }
                            : {}
                    }
                />
            </div>
        </div>
    );
}
