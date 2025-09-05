// src/components/Calendar/FeatureCalendar.jsx
import React, { useMemo, useState, useCallback, useEffect } from "react";
import CalendarView from "./CalendarView";
import AgendaPanel from "./AgendaPanel";
import CreateorEditEventModal from "../../../Modal/CreateorEditEventModal.jsx";
import GanttView from "./GanttView";
import EventDetailModal from "../../../Modal/EventDetailModal.jsx";
import ConfirmModal from "../../../Modal/ConfirmModal.jsx";
import { FiCalendar } from "react-icons/fi";
import { LuChartGantt, LuChevronLeft, LuChevronRight, LuPencil } from "react-icons/lu";
import calendarApi from "../../../services/calendarApi.js";
import { startOfMonth, endOfMonth, addMonths } from "date-fns";
import { EVENT_TYPE_COLORS } from "./calendarConstants";

// 안전 파서
function toLocalDateSafe(input) {
  if (input instanceof Date) return input;
  return new Date(input);
}

// 이벤트 정규화
function normalizeEvent(raw) {
  const start = toLocalDateSafe(raw.start);
  let end = raw.end != null ? toLocalDateSafe(raw.end) : new Date(+start + 30 * 60 * 1000);
  if (+end <= +start) end = new Date(+start + 30 * 60 * 1000);
  return { ...raw, start, end, type: raw.type || "etc" };
}

// 월 범위 계산
function getMonthRange(currentDate) {
  const base = currentDate ? new Date(currentDate) : new Date();
  const mStart = startOfMonth(base);
  // end는 달의 말일 23:59:59.999에 해당하는 Date 객체
  return { start: mStart, end: endOfMonth(base) };
}

// 내부 버튼
function AddScheduleButton({ onClick }) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      onClick={onClick}
    >
      <LuPencil className="h-4 w-4" />
      일정 추가하기
    </button>
  );
}

function ViewToggle({ view, onChange }) {
  const btn = "rounded-lg border border-neutral-300 p-2 hover:bg-neutral-50";
  const active = "bg-neutral-900 text-white hover:bg-neutral-900";
  return (
    <div className="flex items-center gap-2">
      <button
        className={`${btn} ${view === "calendar" ? active : ""}`}
        onClick={() => onChange?.("calendar")}
      >
        <FiCalendar className="h-5 w-5" />
      </button>
      <button
        className={`${btn} ${view === "gantt" ? active : ""}`}
        onClick={() => onChange?.("gantt")}
      >
        <LuChartGantt className="h-5 w-5" />
      </button>
    </div>
  );
}

function MonthSwitcher({ currentDate, onChange }) {
  const yyyy = currentDate.getFullYear();
  const mm = currentDate.getMonth();
  const label = `${mm + 1}월`;
  return (
    <div className="flex items-center gap-2 mt-3">
      <button
        className="rounded-lg border border-neutral-300 p-2 hover:bg-neutral-50"
        onClick={() => onChange?.(new Date(yyyy, mm - 1, 1))}
      >
        <LuChevronLeft className="h-5 w-5" />
      </button>
      <div className="text-lg font-semibold min-w-[56px] text-center">{label}</div>
      <button
        className="rounded-lg border border-neutral-300 p-2 hover:bg-neutral-50"
        onClick={() => onChange?.(new Date(yyyy, mm + 1, 1))}
      >
        <LuChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

export default function FeatureCalendar() {
  const [view, setView] = useState("calendar");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [range, setRange] = useState(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [openCreate, setOpenCreate] = useState(false);

  // 서버에서 일정 불러오기
  const fetchEvents = useCallback(async (start, end) => {
    try {
      const data = await calendarApi.getEvents({ start, end });
      setEvents(data.map(normalizeEvent));
    } catch (err) {
      console.error("[이벤트 조회 실패]", err);
    }
  }, []);

  // ✅ 초기 진입/달력 모드에서 range가 비어있으면 부트스트랩 (초기 로딩 문제 해결)
  useEffect(() => {
    if (view === "calendar" && !range) {
      setRange(getMonthRange(currentDate));
    }
  }, [view, currentDate, range]);

  // ✅ 간트 뷰일 때는 월 범위로 강제 조회
  useEffect(() => {
    if (view === "gantt") {
      setRange(getMonthRange(currentDate));
    }
  }, [view, currentDate]);

  // 범위 변경될 때마다 조회
  useEffect(() => {
    if (range) {
      fetchEvents(range.start, range.end);
    }
  }, [range, fetchEvents]);

  // calendar range → setRange
  const handleRangeChange = useCallback((rangeObj) => {
    if (Array.isArray(rangeObj)) {
      setRange({ start: rangeObj[0], end: rangeObj[rangeObj.length - 1] });
    } else if (rangeObj && rangeObj.start && rangeObj.end) {
      setRange({ start: rangeObj.start, end: rangeObj.end });
    }
  }, []);

  // 월 전환 시 달력 모드에서는 즉시 range 갱신 (RBC가 onRangeChange를 안 쏘는 초기 케이스 대비)
  const handleMonthSwitch = useCallback(
    (nextDate) => {
      setCurrentDate(nextDate);
      if (view === "calendar") {
        setRange(getMonthRange(nextDate));
      }
    },
    [view]
  );

  const handleEventClick = useCallback((ev) => {
    setSelected(ev);
    setDetailOpen(true);
  }, []);

  // 등록
  const handleCreateSubmit = useCallback(async (payload) => {
    try {
      const base = EVENT_TYPE_COLORS[payload.type || "etc"] ?? EVENT_TYPE_COLORS.etc;
      const withColor = {
        ...payload,
        color: base.bg || "#9BE7B0",
        allDay: payload.allDay ?? false,
      };
      const res = await calendarApi.createEvent(withColor);
      const clean = normalizeEvent(res);
      setEvents((prev) => [...prev, clean]);
      setOpenCreate(false);
    } catch (err) {
      console.error("[등록 실패]", err);
      alert("일정 등록 실패");
    }
  }, []);

  // 수정
  const handleEdit = useCallback(() => {
    if (!selected) return;
    setDetailOpen(false);
    setEditTarget(selected);
    setOpenEdit(true);
  }, [selected]);

  const confirmDelete = useCallback(async () => {
    if (!selected) return;
    try {
      await calendarApi.deleteEvent(selected.id);
      setEvents((prev) => prev.filter((e) => e.id !== selected.id));
      setConfirmOpen(false);
      setSelected(null);
    } catch {
      alert("삭제 실패");
    }
  }, [selected]);

  const handleEditSubmit = useCallback(async (payload) => {
    try {
      const base = EVENT_TYPE_COLORS[payload.type || "etc"] ?? EVENT_TYPE_COLORS.etc;
      const withColor = { ...payload, color: base.bg || "#9BE7B0" };
      const res = await calendarApi.updateEvent(payload.id, withColor);
      const clean = normalizeEvent(res);
      setEvents((prev) => prev.map((ev) => (ev.id === payload.id ? clean : ev)));
      setOpenEdit(false);
      setEditTarget(null);
      setSelected(null);
    } catch {
      alert("수정 실패");
    }
  }, []);

  const leftPane = useMemo(() => {
    if (view === "gantt") {
      return (
        <GanttView
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
        onRangeChange={handleRangeChange}
        height={560}
      />
    );
  }, [view, currentDate, events, handleEventClick, handleRangeChange]);

  return (
    <section>
      <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">일정 관리</h1>
              <div className="flex items-center gap-3">
                <AddScheduleButton onClick={() => setOpenCreate(true)} />
                <ViewToggle view={view} onChange={setView} />
              </div>
            </div>
            <MonthSwitcher currentDate={currentDate} onChange={handleMonthSwitch} />
            <div className="mt-4">{leftPane}</div>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <AgendaPanel
              events={events}
              onSelectEvent={handleEventClick}
              onJumpToDate={setCurrentDate}
            />
          </div>
        </div>
      </div>

      {/* 등록 */}
      <CreateorEditEventModal
        open={openCreate}
        defaultDate={currentDate}
        onClose={() => setOpenCreate(false)}
        onSubmit={handleCreateSubmit}
      />
      {/* 수정 */}
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
      {/* 상세 */}
      <EventDetailModal
        open={detailOpen}
        event={selected}
        onClose={() => setDetailOpen(false)}
        onEdit={handleEdit}
        onDelete={() => setConfirmOpen(true)}
      />
      {/* 삭제 확인 */}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="이 일정을 삭제하시겠습니까?"
        content="삭제한 일정은 복구할 수 없습니다. 정말로 삭제하시겠습니까?"
        confirmText="삭제하기"
        cancelText="취소"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
        confirmVariant="danger"
        align="center"
        contentClassName="rounded-2xl"
      />
    </section>
  );
}
