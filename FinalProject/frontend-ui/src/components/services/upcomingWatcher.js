// frontend-ui/src/components/services/upcomingWatcher.js
import calendarApi from "./calendarApi.js";

const STORAGE_DISMISSED = "upcoming:dismissed";
const STORAGE_SNOOZE    = "upcoming:snoozeUntil";
const STORAGE_LASTSHOW  = "upcoming:lastShownAt"; // 중복 방지(같은 이벤트 반복 노출 방지)

const load = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || "{}"); } catch { return {}; } };
const save = (k, v) => sessionStorage.setItem(k, JSON.stringify(v || {}));

function pickTarget(events) {
  const dismissed = load(STORAGE_DISMISSED);
  const snooze    = load(STORAGE_SNOOZE);
  const lastShown = load(STORAGE_LASTSHOW);
  const now = Date.now();

  // 조건:
  // - reminder_minutes_before > 0
  // - now ∈ [start - reminder*60s*1000, start)
  // - dismiss/스누즈/최근 표시(60초 내) 제외
  const candidates = (events || []).filter(ev => {

  // DB 컬럼 기반 알림 여부 체크 (필드명: reminder_enabled / notify / is_alarm 등으로 맞춰주세요)
    if (ev.reminder_enabled === false) return false;
    const startTs = new Date(ev.start).getTime();
    if (Number.isNaN(startTs)) return false;
    const r = Number(ev.reminder_minutes_before || 0);
    if (!(r > 0)) return false;

    const remindTs = startTs - r * 60 * 1000;
    const inWindow = now >= remindTs && now < startTs;
    if (!inWindow) return false;

    if (dismissed[ev.id]) return false;
    if (snooze[ev.id] && snooze[ev.id] > now) return false;
    if (lastShown[ev.id] && (now - lastShown[ev.id] < 60 * 1000)) return false; // 60초 내 재노출 방지
    return true;
  });


  // 마감(끝) 시간 빠른 순으로 우선, end가 없으면 start로 대체
  candidates.sort((a, b) => {
    const aKey = new Date(a.end ?? a.start).getTime();
    const bKey = new Date(b.end ?? b.start).getTime();
    // 1) 마감(또는 시작) 시간 비교
    if (aKey !== bKey) return aKey - bKey;
    // 2) 동률이면 시작 시간이 더 이른 것 우선
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });
  return candidates[0] || null;
}

export function startUpcomingWatcher({ refreshSec = 20 } = {}) {
  let timer = null;

  const tick = async () => {
    try {
      // 트래픽 절약: 지금~+90분 범위만
      const start = new Date();
      const end   = new Date(Date.now() + 90 * 60 * 1000);
      const events = await calendarApi.getEvents({ start, end }); // 기존 API 시그니처 사용
      const target = pickTarget(events);
      if (target) {
        const lastShown = load(STORAGE_LASTSHOW);
        lastShown[target.id] = Date.now(); // 표시 시각 기록
        save(STORAGE_LASTSHOW, lastShown);

        window.notify?.openUpcoming?.(serializeEvent(target));
      }
    } catch {}
  };

  tick();
  timer = setInterval(
    tick,
    Math.max(5, document.hidden ? Math.max(refreshSec, 60) : refreshSec) * 1000
  );
  return () => clearInterval(timer);
}

export function dismissEvent(id) {
  const m = load(STORAGE_DISMISSED); m[id] = true; save(STORAGE_DISMISSED, m);
}
export function snoozeEvent5m(id) {
  const m = load(STORAGE_SNOOZE); m[id] = Date.now() + 5 * 60 * 1000; save(STORAGE_SNOOZE, m);
}

function serializeEvent(ev) {
  return {
    id: ev.id,
    title: ev.title || "",
    description: ev.description || "",
    start: ev.start instanceof Date ? ev.start.toISOString() : ev.start,
    end: ev.end ? (ev.end instanceof Date ? ev.end.toISOString() : ev.end) : null,
    location: ev.location || "",
    reminder_minutes_before: Number(ev.reminder_minutes_before || 0),
  };
}
