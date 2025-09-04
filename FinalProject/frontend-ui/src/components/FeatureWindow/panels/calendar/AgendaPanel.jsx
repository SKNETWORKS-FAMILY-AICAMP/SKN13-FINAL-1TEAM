import React, { useMemo } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { groupEventsByDate } from "./agendaUtils";
import { EVENT_TYPE_COLORS } from "./calendarConstants";

/**
 * props:
 * - events: Array<{id,title,start,end,allDay?,type?,color?,textColor?}>
 * - onSelectEvent?: (event) => void
 * - onJumpToDate?: (date: Date) => void
 */
export default function AgendaPanel({
    events = [],
    onSelectEvent,
    onJumpToDate,
}) {
    const sections = useMemo(() => groupEventsByDate(events), [events]);

    return (
        <aside className="bg-white rounded-2xl shadow-sm border border-neutral-200 w-full h-[620px] overflow-hidden">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                <h2 className="text-sm font-semibold">일정 리스트</h2>
            </div>

            <div className="h-[calc(620px-48px)] overflow-y-auto px-4 py-3 space-y-6">
                {sections.length === 0 ? (
                    <div className="text-sm text-neutral-500">
                        표시할 일정이 없습니다.
                    </div>
                ) : (
                    sections.map(({ date, items }) => (
                        <section key={date.getTime()}>
                            {/* 날짜 헤더 (sticky) */}
                            <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-white/95 backdrop-blur border-l border-r">
                                <button
                                    type="button"
                                    className="text-xs font-semibold text-neutral-700 hover:underline"
                                    onClick={() => onJumpToDate?.(date)}
                                    title="이 날짜로 이동"
                                >
                                    {format(date, "M월 d일 (EEE)", {
                                        locale: ko,
                                    })}
                                </button>
                            </div>

                            <ul className="mt-2 space-y-2">
                                {items.map((ev) => {
                                    const start =
                                        ev.start instanceof Date
                                            ? ev.start
                                            : new Date(ev.start);
                                    const end =
                                        ev.end instanceof Date
                                            ? ev.end
                                            : new Date(ev.end);
                                    const isAll = ev.allDay === true;
                                    const base =
                                        EVENT_TYPE_COLORS[ev.type ?? "etc"] ??
                                        EVENT_TYPE_COLORS.etc;
                                    const bg = ev.color ?? base.bg;
                                    const fg = ev.textColor ?? base.text;

                                    return (
                                        <li key={ev.id}>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onSelectEvent?.(ev)
                                                }
                                                className="w-full text-left group rounded-lg border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 p-3"
                                                title={ev.title}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="inline-block h-2.5 w-2.5 rounded-full"
                                                        style={{
                                                            backgroundColor: bg,
                                                        }}
                                                        aria-hidden
                                                    />
                                                    <span className="text-sm font-medium text-neutral-900 truncate">
                                                        {ev.title}
                                                    </span>
                                                </div>
                                                <div
                                                    className="mt-1 pl-4 text-xs text-neutral-500"
                                                    style={{ color: fg }}
                                                >
                                                    {isAll
                                                        ? "하루 종일"
                                                        : `${format(
                                                              start,
                                                              "HH:mm"
                                                          )} ~ ${format(
                                                              end,
                                                              "HH:mm"
                                                          )}`}
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))
                )}
            </div>
        </aside>
    );
}
