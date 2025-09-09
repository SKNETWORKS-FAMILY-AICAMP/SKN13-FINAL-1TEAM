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
  // 이번 주: 일요일 시작, 토요일 끝
  const start = startOfWeek(base, { weekStartsOn: 0 }); // Sun
  const end   = endOfWeek(base,   { weekStartsOn: 0 }); // Sat
  return [startOfDay(start), endOfDay(end)];
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

// ✅ 같은 날 여부
export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ✅ 좌측 날짜(또는 날짜 범위) 레이블
export function dateRangeLabelShort(start, end) {
  const s = start instanceof Date ? start : new Date(start);
  const e = end   instanceof Date ? end   : new Date(end);
  if (isSameDay(s, e)) {
    return format(s, "M월 d일", { locale: ko });        // 예: "8월 9일"
  }
  return `${format(s, "M월 d일", { locale: ko })} ~ ${format(e, "M월 d일", { locale: ko })}`;
}

// ✅ 설명 말줄임
export function ellipsis(text, max = 40) {
  if (!text) return "";
  const s = String(text);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}


// 왼쪽(컬러바 왼쪽) 표시용 2줄 라벨 구성
// 반환: [line1, line2]
export function buildLeftLines(start, end, allDay) {
  const s = start instanceof Date ? start : new Date(start);
  const e = end   instanceof Date ? end   : new Date(end);

  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();

  const sameMonth =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth();

  if (sameDay) {
    // ① 하루짜리
    const line1 = format(s, "M월 d일", { locale: ko });
    const line2 = allDay
      ? "하루종일"
      : `${format(s, "HH:mm")} ~ ${format(e, "HH:mm")}`;
    return [line1, line2];
  }

  if (allDay) {
    // ② 2일 이상 & 하루종일
    //    - 같은 달: "9월 18일 ~ 19일"
    //    - 다른 달: "8월 30일 ~ 9월 1일"
    const left = format(s, "M월 d일", { locale: ko });
    const right = sameMonth
      ? format(e, "d일", { locale: ko })
      : format(e, "M월 d일", { locale: ko });
    return [`${left} ~ ${right}`, "하루종일"];
  }

  // ③ 2일 이상 & 시간 있음
  //    - 같은 달:  "9월 18일 14:30 ~" / "19일 15:30"
  //    - 다른 달:  "8월 30일 14:30 ~" / "9월 1일 14:30"
  const first  = `${format(s, "M월 d일 HH:mm", { locale: ko })} ~`;
  const second = sameMonth
    ? format(e, "d일 HH:mm", { locale: ko })
    : format(e, "M월 d일 HH:mm", { locale: ko });
  return [first, second];
}
