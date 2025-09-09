// src/components/Modal/EventDetailModal.jsx
import React, { useMemo } from "react";
import Modal from "./Modal";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { LuTrash2, LuPencil } from "react-icons/lu";
import {
  EVENT_TYPE_COLORS,
  TYPE_LABELS,
  matchTypeByColor,
} from "../FeatureWindow/panels/calendar/calendarConstants";

function fmt(dt, withTime = true) {
  if (!dt) return "";
  const d = typeof dt === "string" || typeof dt === "number" ? new Date(dt) : dt;
  return format(d, withTime ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd", { locale: ko });
}

export default function EventDetailModal({
  open,
  event,
  onClose,
  onEdit,
  onDelete,
}) {
  const isAllDay = !!event?.allDay;

  // 1순위 event.type, 2순위 color→type, 실패 시 etc
  const typeKey = useMemo(
    () => (event ? event.type ?? matchTypeByColor(event.color) ?? "etc" : "etc"),
    [event]
  );

  const typeLabel = TYPE_LABELS[typeKey] ?? "기타";
  const dotColor = event?.color || EVENT_TYPE_COLORS[typeKey]?.bg;

  const periodText = useMemo(() => {
    if (!event) return "";
    const s = fmt(event.start, !isAllDay);
    const e = fmt(event.end, !isAllDay);
    return event.end ? `${s} ~ ${e}` : s;
  }, [event, isAllDay]);

  return (
    <Modal open={open} onClose={onClose} size="md">
      <h2 className="text-lg font-bold mb-4">{event?.title ?? "-"}</h2>

      <div className="mb-3">
        <div className="text-sm text-neutral-500 mb-1">설명</div>
        <div className="text-sm font-semibold">{event?.description || "-"}</div>
      </div>

      <div className="mb-3">
        <div className="text-sm text-neutral-500 mb-1">기간</div>
        <div className="text-sm font-semibold">{periodText}</div>
      </div>

      <div className="mb-6">
        <div className="text-sm text-neutral-500 mb-1">일정 타입</div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          <span className="text-sm font-medium">{typeLabel}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-300"
        >
          닫기
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          title="삭제"
        >
          <LuTrash2 className="h-4 w-4" />
          삭제
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-lg bg-neutral-700 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          title="수정"
        >
          <LuPencil className="h-4 w-4" />
          수정
        </button>
      </div>
    </Modal>
  );
}