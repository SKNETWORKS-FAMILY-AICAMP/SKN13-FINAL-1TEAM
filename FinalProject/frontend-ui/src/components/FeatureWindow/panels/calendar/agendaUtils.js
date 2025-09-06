// components/FeatureWindow/panels/calendar/agendaUtils.js
import {
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  isWithinInterval, compareAsc, format,
} from "date-fns";
import { ko } from "date-fns/locale";

/** 이벤트를 Date로 보정 */
export function normalizeEvent(ev) {
  const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
  const end   = ev.end   instanceof Date ? ev.end   : new Date(ev.end);
  return { ...ev, start, end };
}

/** 기간으로 필터 */
export function filterEventsByRange(events = [], from, to) {
  const range = { start: from, end: to };
  return events
    .map(normalizeEvent)
    .filter((ev) =>
      isWithinInterval(ev.start, range) || isWithinInterval(ev.end, range) ||
      (ev.start <= from && ev.end >= to) // 걸친 장기 이벤트
    )
    .sort((a, b) => compareAsc(a.start, b.start));
}

/** 오늘/이번주/이번달 기간 계산 */
export function getTodayRange(base = new Date()) {
  return [startOfDay(base), endOfDay(base)];
}
export function getWeekRange(base = new Date()) {
  // 한국 보통: 월요일 시작이면 weekStartsOn:1, 일요일 시작이면 0
  const start = startOfWeek(base, { weekStartsOn: 1 });
  const end = endOfWeek(base, { weekStartsOn: 1 });
  return [start, end];
}
export function getMonthRange(base = new Date()) {
  return [startOfMonth(base), endOfMonth(base)];
}

/** 월간 뷰에서 날짜 라벨 (예: "8월 4일 (월)" 또는 "19~22일") */
export function dayLabel(d) {
  return format(d, "M월 d일 (EEE)", { locale: ko });
}

/** 시간 범위 라벨 */
export function timeRangeLabel(start, end, allDay) {
  if (allDay) return "하루 종일";
  return `${format(start, "HH:mm")} ~ ${format(end, "HH:mm")}`;
}
