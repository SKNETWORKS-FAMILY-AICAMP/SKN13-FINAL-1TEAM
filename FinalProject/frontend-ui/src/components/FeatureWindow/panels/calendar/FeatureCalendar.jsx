// src/components/Calendar/FeatureCalendar.jsx
import React, { useMemo, useState, useCallback } from "react";
import CalendarView from "./CalendarView";
import AgendaPanel from "./AgendaPanel";
import CreateorEditEventModal from "../../../Modal/CreateorEditEventModal.jsx";
import GanttView from "./GanttView";
import EventDetailModal from "../../../Modal/EventDetailModal.jsx";
import ConfirmModal from "../../../Modal/ConfirmModal.jsx";
import { FiCalendar } from "react-icons/fi";
import {
    LuChartGantt,
    LuChevronLeft,
    LuChevronRight,
    LuPencil,
} from "react-icons/lu";

// ✅ 추가: 로컬 안전 파서
function toLocalDateSafe(input) {
    if (input instanceof Date) return input;
    if (typeof input === "number") return new Date(input);

    if (typeof input === "string") {
        // "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD HH:mm" → 로컬 생성
        const m = input.match(
            /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/
        );
        if (m) {
            const [, Y, M, D, h, mnt, s] = m;
            return new Date(
                Number(Y),
                Number(M) - 1,
                Number(D),
                Number(h),
                Number(mnt),
                s ? Number(s) : 0,
                0
            );
        }
        // 그 외 ISO(예: ...Z) 등은 브라우저 기본 파서에 위임
        return new Date(input);
    }

    // 혹시 모르는 타입 방어
    return new Date(input);
}

// ✅ 추가: 이벤트 정규화 (로컬 파싱 + 최소 지속시간 보정)
function normalizeEvent(raw) {
    const start = toLocalDateSafe(raw.start);
    let end = raw.end != null ? toLocalDateSafe(raw.end) : null;

    if (!(start instanceof Date) || isNaN(+start)) {
        throw new Error("[normalizeEvent] invalid start");
    }
    if (!(end instanceof Date) || isNaN(+end)) {
        // end가 비었거나 파싱 실패 → start + 30분
        end = new Date(+start + 30 * 60 * 1000);
    }
    if (+end <= +start) {
        end = new Date(+start + 30 * 60 * 1000);
    }

    return {
        ...raw,
        start,
        end,
        type: raw.type || "etc",
    };
}

/** 샘플 이벤트 (서버 연동 전) */
const seedEvents = [
    {
        id: 1,
        title: "신규 서비스 런칭 준비 주간",
        start: new Date(2025, 7, 4, 9),
        end: new Date(2025, 7, 9, 18),
        allDay: true,
        type: "project",
    },
    {
        id: 2,
        title: "팀 주간 회의",
        start: new Date(2025, 7, 13, 10),
        end: new Date(2025, 7, 13, 11),
        type: "meeting",
    },
    {
        id: 3,
        title: "신입사원 교육",
        start: new Date(2025, 7, 24, 9),
        end: new Date(2025, 7, 24, 12),
        type: "training",
    },
    {
        id: 4,
        title: "고객사 프리젠테이션",
        start: new Date(2025, 7, 13, 9),
        end: new Date(2025, 7, 13, 10),
        type: "project",
    },
    {
        id: 5,
        title: "팀 주간 회의",
        start: new Date(2025, 7, 28, 10),
        end: new Date(2025, 7, 28, 11),
        type: "meeting",
    },
    {
        id: 6,
        title: "외부 벤더 미팅",
        start: new Date(2025, 7, 20, 15),
        end: new Date(2025, 7, 20, 16),
        type: "etc",
    },
];

/** 내부: 일정 추가 버튼 → onClick을 부모에서 주입 */
function AddScheduleButton({ onClick }) {
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
                aria-pressed={view === "calendar"}
                title="캘린더"
            >
                <FiCalendar className="h-5 w-5" />
            </button>
            <button
                className={`${btn} ${view === "gantt" ? active : ""}`}
                onClick={() => onChange?.("gantt")}
                aria-pressed={view === "gantt"}
                title="간트"
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
    const goPrev = () =>
        onChange?.(new Date(yyyy, mm - 1, 1), { reason: "prev" });
    const goNext = () =>
        onChange?.(new Date(yyyy, mm + 1, 1), { reason: "next" });

    return (
        <div className="flex items-center gap-2 mt-3">
            <button
                className="rounded-lg border border-neutral-300 p-2 hover:bg-neutral-50"
                onClick={goPrev}
                title="이전 달"
            >
                <LuChevronLeft className="h-5 w-5" />
            </button>
            <div className="text-lg font-semibold min-w-[56px] text-center">
                {label}
            </div>
            <button
                className="rounded-lg border border-neutral-300 p-2 hover:bg-neutral-50"
                onClick={goNext}
                title="다음 달"
            >
                <LuChevronRight className="h-5 w-5" />
            </button>
        </div>
    );
}

export default function FeatureCalendar() {
    const [view, setView] = useState("calendar");
    const [currentDate, setCurrentDate] = useState(new Date()); // ✅ 오늘 기준으로 시작
    const [detailOpen, setDetailOpen] = useState(false);
    const [selected, setSelected] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [openEdit, setOpenEdit] = useState(false);
    const [editTarget, setEditTarget] = useState(null);

    // ✅ events setState로 변경 (새 일정 추가 위해)
    const [events, setEvents] = useState(seedEvents);

    // ✅ 모달 상태
    const [openCreate, setOpenCreate] = useState(false);

    const handleMonthChange = useCallback((nextDate, meta) => {
        setCurrentDate(nextDate);
        console.log("[월 전환]", nextDate, meta?.reason);
    }, []);

    const handleEventClick = useCallback((ev) => {
        setSelected(ev);
        setDetailOpen(true);
    }, []);

    const handleJumpToDate = useCallback((date) => setCurrentDate(date), []);

    // ✅ “일정 추가하기” 눌렀을 때 모달 오픈
    const openCreateModal = useCallback(() => setOpenCreate(true), []);
    const closeCreateModal = useCallback(() => setOpenCreate(false), []);

    // // ✅ 모달에서 등록 클릭 시: 새 이벤트 추가
    // const handleCreateSubmit = useCallback((payload) => {
    //     const { title, description, start, end, type } = payload;
    //     setEvents((prev) => [
    //         ...prev,
    //         {
    //             id: Date.now(), // 임시 id
    //             title,
    //             description,
    //             start: new Date(start),
    //             end: new Date(end),
    //             type: type || "etc",
    //         },
    //     ]);
    //     // 현재 월로 이동(선택)
    //     setCurrentDate(new Date(start));
    //     setOpenCreate(false);
    //     console.log("[일정 등록]", payload);
    // }, []);

    // ✅ 등록
    const handleCreateSubmit = useCallback((payload) => {
        try {
            const clean = normalizeEvent(payload);
            setEvents((prev) => [
                ...prev,
                {
                    id: Date.now(), // 임시 id
                    ...clean,
                },
            ]);
            setCurrentDate(new Date(clean.start));
            setOpenCreate(false);
            console.log("[일정 등록 - normalized]", {
                start: clean.start.toString(),
                end: clean.end.toString(),
            });
        } catch (e) {
            console.error(e);
            alert("시작/종료 시간이 올바르지 않습니다.");
        }
    }, []);

    // 일정 수정
    const handleEdit = useCallback(() => {
        if (!selected) return;
        setDetailOpen(false);
        setEditTarget(selected);
        setOpenEdit(true);
    }, [selected]);

    // 일정 삭제
    const askDelete = useCallback(() => {
        if (!selected) return;
        setDetailOpen(false); // 상세 모달은 잠시 닫음
        setConfirmOpen(true); // 확인 모달 열기
    }, [selected]);

    const confirmDelete = useCallback(() => {
        if (!selected) return;
        setEvents((prev) => prev.filter((e) => e.id !== selected.id));
        console.log("[삭제 완료]", selected);
        setConfirmOpen(false);
        setSelected(null);
    }, [selected]);

    const cancelDelete = useCallback(() => {
        setConfirmOpen(false);
        setDetailOpen(true);
    }, []);

    // ✅ 수정
    const handleEditSubmit = useCallback((payload) => {
        try {
            const clean = normalizeEvent(payload);
            setEvents((prev) =>
                prev.map((ev) =>
                    ev.id === payload.id ? { ...ev, ...clean } : ev
                )
            );
            console.log("[일정 수정 - normalized]", {
                start: clean.start.toString(),
                end: clean.end.toString(),
            });
            setOpenEdit(false);
            setEditTarget(null);
            setSelected(null);
            setCurrentDate(new Date(clean.start));
        } catch (e) {
            console.error(e);
            alert("시작/종료 시간이 올바르지 않습니다.");
        }
    }, []);

    const leftPane = useMemo(() => {
        if (view === "gantt") {
            const k = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${
                events.length
            }`;
            return (
                <GanttView
                    key={k} // ✅ 리마운트 트리거
                    currentDate={currentDate}
                    events={events}
                    onEventClick={handleEventClick}
                    height={560}
                />
            );
        }
        return (
            <CalendarView
                currentDate={currentDate}
                events={events}
                onEventClick={handleEventClick}
                onRangeChange={(r) => console.log("[표시 범위 변경]", r)}
                height={560}
            />
        );
    }, [view, currentDate, events, handleEventClick]);

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
                                {/* ✅ 버튼 누르면 생성 모달 오픈 */}
                                <AddScheduleButton onClick={openCreateModal} />
                                <ViewToggle view={view} onChange={setView} />
                            </div>
                        </div>

                        {/* 2행: 월 전환 */}
                        <MonthSwitcher
                            currentDate={currentDate}
                            onChange={handleMonthChange}
                        />

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

            {/* 등록 모달 */}
            <CreateorEditEventModal
                open={openCreate}
                defaultDate={currentDate}
                onClose={() => setOpenCreate(false)}
                onSubmit={handleCreateSubmit}
            />

            {/* ✅ 일정 수정 모달 */}
            <CreateorEditEventModal
                open={openEdit}
                defaultDate={currentDate}
                onClose={() => {
                    setOpenEdit(false);
                    setEditTarget(null);
                }}
                onSubmit={handleEditSubmit}
                mode="edit"
                editEvent={editTarget}
            />

            <EventDetailModal
                open={detailOpen}
                event={selected}
                onClose={() => setDetailOpen(false)}
                onEdit={handleEdit}
                onDelete={askDelete}
            />

            <ConfirmModal
                open={confirmOpen}
                onClose={cancelDelete}
                title="이 일정을 삭제하시겠습니까?"
                content="삭제한 일정은 복구할 수 없습니다. 정말로 삭제하시겠습니까?"
                confirmText="삭제하기"
                cancelText="취소"
                onConfirm={confirmDelete}
                onCancel={cancelDelete}
                confirmVariant="danger"
                align="center"
                contentClassName="rounded-2xl" // 둥근 모서리 (Modal 기본과 일치)
            />
        </section>
    );
}
