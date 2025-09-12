// src/components/FeatureWindow/panels/calendar/FeatureCalendar.jsx
import React, { useMemo, useState, useCallback, useEffect } from "react";
import CalendarView from "./CalendarView";
import AgendaPanel from "./AgendaPanel";
import CreateorEditEventModal from "../../../Modal/CreateorEditEventModal.jsx";
import GanttView from "./GanttView";
import EventDetailModal from "../../../Modal/EventDetailModal.jsx";
import ConfirmModal from "../../../Modal/ConfirmModal.jsx";
import calendarApi from "../../../services/calendarApi.js";
import useToast from "../../../shared/toast/useToast.js";

import { startOfMonth, endOfMonth } from "date-fns";
import { EVENT_TYPES } from "./calendarConstants";

import { FiCalendar } from "react-icons/fi";
import { LuChartGantt, LuChevronLeft, LuChevronRight, LuPencil } from "react-icons/lu";

function toLocalDateSafe(input) { if (input instanceof Date) return input; return new Date(input); }
function normalizeEvent(raw) {
  const start = toLocalDateSafe(raw.start);
  let end = raw.end != null ? toLocalDateSafe(raw.end) : new Date(+start + 30 * 60 * 1000);
  if (+end <= +start) end = new Date(+start + 30 * 60 * 1000);
  return { ...raw, start, end, type: raw.type || "etc" };
}
function getMonthRange(currentDate) {
  const base = currentDate ? new Date(currentDate) : new Date();
  const mStart = startOfMonth(base);
  return { start: mStart, end: endOfMonth(base) };
}

function AddScheduleButton({ onClick }) {
  return (
    <button className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90" onClick={onClick}>
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
      <button className={`${btn} ${view === "calendar" ? active : ""}`} onClick={() => onChange?.("calendar")}><FiCalendar className="h-5 w-5" /></button>
      <button className={`${btn} ${view === "gantt" ? active : ""}`} onClick={() => onChange?.("gantt")}><LuChartGantt className="h-5 w-5" /></button>
    </div>
  );
}
function MonthSwitcher({ currentDate, onChange }) {
  const yyyy = currentDate.getFullYear();
  const mm = currentDate.getMonth();
  const label = `${mm + 1}월`;
  return (
    <div className="flex items-center gap-2">
      <button className="rounded-lg p-2 hover:bg-neutral-50" onClick={() => onChange?.(new Date(yyyy, mm - 1, 1))}><LuChevronLeft className="h-5 w-5" /></button>
      <div className="text-lg font-semibold min-w-[56px] text-center">{label}</div>
      <button className="rounded-lg p-2 hover:bg-neutral-50" onClick={() => onChange?.(new Date(yyyy, mm + 1, 1))}><LuChevronRight className="h-5 w-5" /></button>
    </div>
  );
}

export default function FeatureCalendar() {
  const toast = useToast();

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
  const [createDefaultDate, setCreateDefaultDate] = useState(new Date());

  const fetchEvents = useCallback(async (start, end) => {
    try {
      console.log("[FeatureCalendar.fetchEvents] range:", { start, end });
      const data = await calendarApi.getEvents({ start, end });
      console.log("[FeatureCalendar.fetchEvents] events(raw):", data);
      const normalized = data.map(normalizeEvent);
      console.log("[FeatureCalendar.fetchEvents] events(normalized):", normalized);
      setEvents(normalized);
    } catch (err) {
      console.error("[이벤트 조회 실패]", err);
    }
  }, []);

  useEffect(() => { if (view === "calendar" && !range) setRange(getMonthRange(currentDate)); }, [view, currentDate, range]);
  useEffect(() => { if (view === "gantt") setRange(getMonthRange(currentDate)); }, [view, currentDate]);
  useEffect(() => { if (range) fetchEvents(range.start, range.end); }, [range, fetchEvents]);

  const handleRangeChange = useCallback((rangeObj) => {
    if (Array.isArray(rangeObj)) setRange({ start: rangeObj[0], end: rangeObj[rangeObj.length - 1] });
    else if (rangeObj && rangeObj.start && rangeObj.end) setRange({ start: rangeObj.start, end: rangeObj.end });
  }, []);

  const handleMonthSwitch = useCallback((nextDate) => {
    setCurrentDate(nextDate);
    if (view === "calendar") setRange(getMonthRange(nextDate));
  }, [view]);

  const handleJumpToDate = useCallback((date) => {
    const next = date instanceof Date ? date : new Date(date);
    setCurrentDate(next);
    // 달력 보든 간트 보든, 바로 해당 달 범위로 갱신해서 이벤트 재조회 트리거
    setRange(getMonthRange(next));
  }, []);

  const handleEventClick = useCallback((ev) => {
    setSelected(ev);
    setDetailOpen(true);
  }, []);

  const handleCreateSubmit = useCallback(async (payload) => {
    try {
      const base = EVENT_TYPES[payload.type || "etc"] ?? EVENT_TYPES.etc;
      const withColor = { ...payload, color: base.bg || "#9BE7B0", allDay: payload.allDay ?? false };
      const res = await calendarApi.createEvent(withColor);
      const clean = normalizeEvent(res);
      setEvents((prev) => [...prev, clean]);
      setOpenCreate(false);
      toast.success("일정이 등록되었습니다.");
    } catch (err) {
      console.error("[등록 실패]", err);
      toast.error("일정 등록에 실패했습니다. 다시 시도해주세요.");
    }
  }, []);

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
      setDetailOpen(false);
      setSelected(null);
      toast.success("일정이 삭제되었습니다.");
    } catch {
      toast.error("일정 삭제에 실패했습니다. 다시 시도해주세요.");
    }
  }, [selected]);

  const handleEditSubmit = useCallback(async (payload) => {
    try {
      const base = EVENT_TYPES[payload.type || "etc"] ?? EVENT_TYPES.etc;
      const withColor = { ...payload, color: base.bg || "#9BE7B0" };
      const res = await calendarApi.updateEvent(payload.id, withColor);
      const clean = normalizeEvent(res);
      setEvents((prev) => prev.map((ev) => (ev.id === payload.id ? clean : ev)));
      setOpenEdit(false);
      setEditTarget(null);
      setSelected(null);
      toast.success("일정이 수정되었습니다.");
    } catch {
      toast.error("일정 수정에 실패했습니다. 다시 시도해주세요.");
    }
  }, []);

  // 날짜(칸) 클릭 → 해당 칸의 날짜로 모달 오픈 (시간 00:00으로 정규화)
  const handleSelectSlot = useCallback((slotInfo) => {
    const base = slotInfo?.start ? new Date(slotInfo.start) : new Date();
    base.setHours(0, 0, 0, 0);
    setCreateDefaultDate(base);
    setOpenCreate(true);
  }, []);

  const leftPane = useMemo(() => {
    if (view === "gantt") {
      return <GanttView currentDate={currentDate} events={events} onEventClick={handleEventClick} height={560} />;
    }
    return (
      <CalendarView
        currentDate={currentDate}
        events={events}
        onEventClick={handleEventClick}
        onSelectSlot={handleSelectSlot}
        onRangeChange={handleRangeChange}
        height={560}
      />
    );
  }, [view, currentDate, events, handleEventClick, handleRangeChange]);

  return (
    <section>
      <div className="mx-auto w-full max-w-[1200px] px-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <div className="flex items-center justify-between">
              <h1 className="text-[22px] font-extrabold">일정 관리</h1>
              <div className="flex items-center gap-2">
                <AddScheduleButton onClick={() => {
                  setCreateDefaultDate(new Date());
                  setOpenCreate(true)
                  }} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-10">
              <MonthSwitcher currentDate={currentDate} onChange={handleMonthSwitch} />
              <ViewToggle view={view} onChange={setView} />
            </div>
            <div className="mt-4">{leftPane}</div>
          </div>
          <div className="col-span-12 lg:col-span-4">
            <AgendaPanel events={events} onSelectEvent={handleEventClick} onJumpToDate={handleJumpToDate} />
          </div>
        </div>
      </div>

      {/* 등록: 오늘 날짜 + 현재 시간 전달 */}
      <CreateorEditEventModal
        key={openCreate ? createDefaultDate.toISOString() : "closed"}
        open={openCreate}
        defaultDate={createDefaultDate}
        onClose={() => setOpenCreate(false)}
        onSubmit={handleCreateSubmit}
      />
      {/* 수정: 선택된 이벤트 기준으로 프리셋 */}
      <CreateorEditEventModal
        open={openEdit}
        defaultDate={editTarget?.start || new Date()}
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
        onClose={() => {
          setDetailOpen(false);
          setSelected(null);
        }}
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
        contentClassName="rounded-xl"
      />
    </section>
  );
}