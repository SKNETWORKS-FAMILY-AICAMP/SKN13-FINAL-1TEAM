// src/components/Calendar/CreateEventModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import FormModal from "./FormModal";
import { LuChevronUp, LuChevronDown } from "react-icons/lu";

// 타입 칩
const EVENT_TYPES = [
    { key: "meeting", label: "회의", dot: "#9DB9FF" },
    { key: "work", label: "업무", dot: "#9BE7B0" },
    { key: "deadline", label: "마감", dot: "#FFB6B6" },
    { key: "etc", label: "기타", dot: "#FFD77A" },
];

// 10분 단위 시간 목록
const timeOptions10m = Array.from({ length: 24 * 6 }, (_, i) => {
    const h = String(Math.floor(i / 6)).padStart(2, "0");
    const m = String((i % 6) * 10).padStart(2, "0");
    return `${h}:${m}`;
});

const APP_START = new Date();

const years = Array.from({ length: 20 }, (_, i) => String(2020 + i));
const months = Array.from({ length: 12 }, (_, i) =>
    String(i + 1).padStart(2, "0")
);

const getDaysInMonth = (year, month) => {
    const y = Number(year);
    const m = Number(month);
    if (!y || !m) return 31;
    return new Date(y, m, 0).getDate();
};

function SelectMenu({
    id,
    value,
    onChange,
    options = [],
    className = "",
    disabled = false,
    placeholder = "",
    align = "left",
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const selectedRef = useRef(null);

    useEffect(() => {
        const onDoc = (e) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    useEffect(() => {
        if (open && selectedRef.current) {
            selectedRef.current.scrollIntoView({ block: "nearest" });
        }
    }, [open, value]);

    const chevron = open ? (
        <LuChevronUp className="h-4 w-4" />
    ) : (
        <LuChevronDown className="h-4 w-4" />
    );

    return (
        <div
            ref={rootRef}
            className={`relative ${disabled ? "opacity-50" : ""}`}
            aria-disabled={disabled}
        >
            <button
                id={id}
                type="button"
                onClick={() => {
                    if (!disabled) setOpen((v) => !v);
                }}
                className={`h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-700
                    flex items-center justify-between ${
                        disabled ? "" : "hover:bg-gray-50"
                    } ${className}
                    ${disabled ? "pointer-events-none" : ""}`}
                aria-haspopup="listbox"
                aria-expanded={open}
                tabIndex={disabled ? -1 : 0}
            >
                <span className="truncate">
                    {value || (
                        <span className="text-gray-400">{placeholder}</span>
                    )}
                </span>
                {chevron}
            </button>

            {open && !disabled && (
                <div
                    className={`absolute z-[60] mt-2 min-w-full rounded-2xl bg-white p-2 shadow-lg ring-1 ring-black/5
                      ${align === "right" ? "right-0" : "left-0"}`}
                    role="listbox"
                    aria-labelledby={id}
                >
                    <div className="max-h-64 w-full overflow-y-auto overscroll-contain simple-scroll">
                        {options.map((opt) => {
                            const active = String(opt) === String(value);
                            return (
                                <div
                                    key={opt}
                                    ref={active ? selectedRef : null}
                                    onClick={() => {
                                        onChange(String(opt));
                                        setOpen(false);
                                    }}
                                    role="option"
                                    aria-selected={active}
                                    className={`cursor-pointer select-none rounded-lg px-3 py-2 text-center text-sm
                              ${
                                  active
                                      ? "bg-gray-100 font-medium"
                                      : "hover:bg-gray-100"
                              }`}
                                >
                                    {opt}
                                </div>
                            );
                        })}
                        {!options?.length && (
                            <div className="px-3 py-2 text-center text-sm text-gray-400">
                                옵션 없음
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function toDate({ year, month, day, time }) {
    const [hh = "00", mm = "00"] = String(time || "00:00").split(":");
    return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hh),
        Number(mm),
        0,
        0
    );
}

function buildEventPayload({ title, desc, startDate, endDate, type, allDay }) {
    return {
        title: title.trim(),
        description: desc.trim(),
        start: startDate,
        end: endDate,
        type,
        allDay,
    };
}

export default function CreateorEditEventModal({
    open,
    defaultDate,
    onClose,
    onSubmit,
    mode = "create",
    editEvent = null,
}) {
    const isEdit = mode === "edit" && !!editEvent;
    const base = useMemo(() => defaultDate ?? APP_START, [defaultDate]);

    const roundTo10 = (d) => {
        const m = d.getMinutes();
        const rounded = Math.ceil(m / 10) * 10;
        const mm = rounded === 60 ? 0 : rounded;
        const hh = rounded === 60 ? d.getHours() + 1 : d.getHours();
        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    };

    const hhmm = (d) =>
        `${String(d.getHours()).padStart(2, "0")}:${String(
            d.getMinutes()
        ).padStart(2, "0")}`;

    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    const [type, setType] = useState("meeting");
    const [allDay, setAllDay] = useState(false);

    const [start, setStart] = useState({
        year: String(base.getFullYear()),
        month: String(base.getMonth() + 1).padStart(2, "0"),
        day: String(base.getDate()).padStart(2, "0"),
        time: roundTo10(base),
    });
    const [end, setEnd] = useState(() => {
        const endBase = new Date(base.getTime() + 30 * 60 * 1000);
        return {
            year: String(endBase.getFullYear()),
            month: String(endBase.getMonth() + 1).padStart(2, "0"),
            day: String(endBase.getDate()).padStart(2, "0"),
            time: roundTo10(endBase),
        };
    });

    // 🔁 열릴 때 초기화: create ↔ edit 분기
    useEffect(() => {
        if (!open) return;
        if (isEdit && editEvent) {
            const s = new Date(editEvent.start);
            const e = new Date(editEvent.end ?? editEvent.start);
            const alld = !!editEvent.allDay;
            setTitle(editEvent.title ?? "");
            setDesc(editEvent.description ?? "");
            setType(editEvent.type ?? "etc");
            setAllDay(alld);
            setStart({
                year: String(s.getFullYear()),
                month: String(s.getMonth() + 1).padStart(2, "0"),
                day: String(s.getDate()).padStart(2, "0"),
                time: alld ? "00:00" : hhmm(s), // ⬅️ 원래 시간 유지
            });
            setEnd({
                year: String(e.getFullYear()),
                month: String(e.getMonth() + 1).padStart(2, "0"),
                day: String(e.getDate()).padStart(2, "0"),
                time: alld ? "23:59" : hhmm(e),
            });
        } else {
            // 기존 생성 초기화
            setTitle("");
            setDesc("");
            setType("meeting");
            setAllDay(false);
            const b = defaultDate ?? APP_START;
            const endBase = new Date(b.getTime() + 30 * 60 * 1000);
            setStart({
                year: String(b.getFullYear()),
                month: String(b.getMonth() + 1).padStart(2, "0"),
                day: String(b.getDate()).padStart(2, "0"),
                time: roundTo10(b),
            });
            setEnd({
                year: String(endBase.getFullYear()),
                month: String(endBase.getMonth() + 1).padStart(2, "0"),
                day: String(endBase.getDate()).padStart(2, "0"),
                time: roundTo10(endBase),
            });
        }
    }, [open, defaultDate, isEdit, editEvent]);

    const [daysStart, setDaysStart] = useState([]);
    const [daysEnd, setDaysEnd] = useState([]);

    useEffect(() => {
        const maxS = getDaysInMonth(start.year, start.month);
        setDaysStart(
            Array.from({ length: maxS }, (_, i) =>
                String(i + 1).padStart(2, "0")
            )
        );
        if (Number(start.day) > maxS)
            setStart((s) => ({ ...s, day: String(maxS).padStart(2, "0") }));
    }, [start.year, start.month]);

    useEffect(() => {
        const maxE = getDaysInMonth(end.year, end.month);
        setDaysEnd(
            Array.from({ length: maxE }, (_, i) =>
                String(i + 1).padStart(2, "0")
            )
        );
        if (Number(end.day) > maxE)
            setEnd((s) => ({ ...s, day: String(maxE).padStart(2, "0") }));
    }, [end.year, end.month]);

    useEffect(() => {
        if (allDay) {
            setStart((s) => ({ ...s, time: "00:00" }));
            setEnd((s) => ({ ...s, time: "23:59" }));
        }
    }, [allDay]);

    const startDate = toDate(start);
    const endDate = toDate(end);

    useEffect(() => {
        if (
            Number.isNaN(startDate.getTime()) ||
            Number.isNaN(endDate.getTime())
        )
            return;
        if (endDate < startDate) {
            setEnd((e) => ({
                ...e,
                year: start.year,
                month: start.month,
                day: start.day,
                time: start.time,
            }));
        }
    }, [
        start.year,
        start.month,
        start.day,
        start.time,
        end.year,
        end.month,
        end.day,
        end.time,
    ]); // eslint-disable-line

    const hasDateParts = (d) =>
        String(d.year).trim() && String(d.month).trim() && String(d.day).trim();

    const submitDisabled =
        !title.trim() ||
        !desc.trim() ||
        !hasDateParts(start) ||
        !hasDateParts(end) ||
        !type ||
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime()) ||
        endDate < startDate;

    const label = "text-sm font-medium text-gray-800";
    const numberBox = "w-[80px]";
    const monthBox = "w-[68px]";
    const dayBox = "w-[68px]";
    const timeBox = "w-[104px]";

    const getEventPayload = () =>
        buildEventPayload({ title, desc, startDate, endDate, type, allDay });

    function handleSubmit() {
        const payload = getEventPayload();
        if (isEdit && editEvent?.id != null) payload.id = editEvent.id;
        console.log(
            isEdit ? "[EditEvent] payload:" : "[CreateEvent] payload:",
            payload
        );
        onSubmit?.(payload);
    }

    return (
        <FormModal
            open={open}
            title={isEdit ? "일정 수정" : "일정 등록"}
            onClose={onClose}
            onSubmit={handleSubmit}
            submitText={isEdit ? "수정하기" : "등록하기"}
            submitDisabled={submitDisabled}
        >
            <div className="space-y-5">
                {/* 제목 */}
                <div>
                    <div className={label}>일정 제목</div>
                    <input
                        className="mt-2 w-full h-11 rounded-xl border border-gray-300 px-3 text-sm"
                        placeholder="일정 제목을 입력하세요"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </div>

                {/* 설명 */}
                <div>
                    <div className={label}>일정 설명</div>
                    <input
                        className="mt-2 w-full h-11 rounded-xl border border-gray-300 px-3 text-sm"
                        placeholder="일정 설명을 입력하세요"
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                    />
                </div>

                {/* 시작 */}
                <div>
                    <div className={label}>일정 시작</div>
                    <div className="mt-2 flex items-center gap-3">
                        <SelectMenu
                            id="sy"
                            value={start.year}
                            onChange={(v) =>
                                setStart((s) => ({ ...s, year: v }))
                            }
                            options={years}
                            className={numberBox}
                            placeholder="YYYY"
                        />
                        <SelectMenu
                            id="sm"
                            value={start.month}
                            onChange={(v) =>
                                setStart((s) => ({
                                    ...s,
                                    month: v.padStart(2, "0"),
                                }))
                            }
                            options={months}
                            className={monthBox}
                            placeholder="MM"
                        />
                        <SelectMenu
                            id="sd"
                            value={start.day}
                            onChange={(v) =>
                                setStart((s) => ({
                                    ...s,
                                    day: v.padStart(2, "0"),
                                }))
                            }
                            options={Array.from(
                                {
                                    length: getDaysInMonth(
                                        start.year,
                                        start.month
                                    ),
                                },
                                (_, i) => String(i + 1).padStart(2, "0")
                            )}
                            className={dayBox}
                            placeholder="DD"
                        />
                        <SelectMenu
                            id="st"
                            value={start.time}
                            onChange={(v) =>
                                setStart((s) => ({ ...s, time: v }))
                            }
                            options={timeOptions10m}
                            className={timeBox}
                            placeholder="HH:MM"
                            disabled={allDay}
                        />
                    </div>
                </div>

                {/* 종료 */}
                <div>
                    <div className={label}>일정 종료</div>
                    <div className="mt-2 flex items-center gap-3">
                        <SelectMenu
                            id="ey"
                            value={end.year}
                            onChange={(v) => setEnd((s) => ({ ...s, year: v }))}
                            options={years}
                            className={numberBox}
                            placeholder="년도 선택"
                        />
                        <SelectMenu
                            id="em"
                            value={end.month}
                            onChange={(v) =>
                                setEnd((s) => ({
                                    ...s,
                                    month: v.padStart(2, "0"),
                                }))
                            }
                            options={months}
                            className={monthBox}
                            placeholder="월 선택"
                        />
                        <SelectMenu
                            id="ed"
                            value={end.day}
                            onChange={(v) =>
                                setEnd((s) => ({
                                    ...s,
                                    day: v.padStart(2, "0"),
                                }))
                            }
                            options={Array.from(
                                { length: getDaysInMonth(end.year, end.month) },
                                (_, i) => String(i + 1).padStart(2, "0")
                            )}
                            className={dayBox}
                            placeholder="일 선택"
                        />
                        <SelectMenu
                            id="et"
                            value={end.time}
                            onChange={(v) => setEnd((s) => ({ ...s, time: v }))}
                            options={timeOptions10m}
                            className={timeBox}
                            placeholder="시간 선택"
                            disabled={allDay}
                        />
                    </div>
                </div>

                {/* 하루종일 */}
                <div className="flex items-center gap-2">
                    <input
                        id="toggle-allDay"
                        type="checkbox"
                        checked={allDay}
                        onChange={(e) => setAllDay(e.target.checked)}
                        className="h-4 w-4"
                    />
                    <label
                        htmlFor="toggle-allDay"
                        className="text-sm text-gray-800"
                    >
                        하루종일
                    </label>
                </div>

                {/* 타입 */}
                <div>
                    <div className={label}>일정 타입</div>
                    <div className="mt-3 flex flex-wrap gap-3">
                        {EVENT_TYPES.map((t) => {
                            const active = type === t.key;
                            return (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => setType(t.key)}
                                    className={`h-10 px-4 rounded-xl border text-sm flex items-center gap-2 ${
                                        active
                                            ? "border-gray-400 bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)]"
                                            : "border-gray-300 bg-white hover:bg-gray-50"
                                    }`}
                                    aria-pressed={active}
                                >
                                    <span
                                        className="inline-block h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: t.dot }}
                                        aria-hidden
                                    />
                                    <span>{t.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </FormModal>
    );
}
