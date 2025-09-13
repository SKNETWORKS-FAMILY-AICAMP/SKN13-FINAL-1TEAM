import calendarApi from "./calendarApi.js";

const STORAGE_DISMISSED = "upcoming:dismissed";
const STORAGE_SNOOZE    = "upcoming:snoozeUntil";
const STORAGE_LASTSHOW  = "upcoming:lastShownAt"; // 중복 방지(같은 이벤트 반복 노출 방지)

const load = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || "{}"); } catch { return {}; } };
const save = (k, v) => sessionStorage.setItem(k, JSON.stringify(v || {}));

function pickTarget(events, { windowMs = 5 * 60 * 1000 } = {}) {
  const dismissed = load(STORAGE_DISMISSED);
  const snooze    = load(STORAGE_SNOOZE);
  const lastShown = load(STORAGE_LASTSHOW);
  const now = Date.now();

  // ✅ 마감(없으면 시작)을 기준으로 60/30/10분 전 트리거 생성
  const OFFSETS = [60, 30, 10]; // 분
  const candidates = [];
  for (const ev of (events || [])) {
    // 알림 사용 여부: reminder_minutes_before > 0 인 이벤트만
    const enabled = Number(ev.reminder_minutes_before || 0) > 0;
    if (!enabled) continue;
    if (ev.reminder_enabled === false) continue; // 필드가 있다면 함께 체크

    const baseTs = new Date(ev.end ?? ev.start).getTime();
    if (Number.isNaN(baseTs)) continue;
    if (now >= baseTs) continue; // 이미 마감된 일정 제외

    for (const m of OFFSETS) {
      const fireTs = baseTs - m * 60 * 1000;
      // 5분 단위 조회 윈도우 안에 들어오면 후보
      const inWindow = now >= fireTs && now < (fireTs + windowMs);
      if (!inWindow) continue;

      // 트리거별 중복 방지 키(id#offset)
      const trigId = `${ev.id || ev.title || baseTs}#${m}`;
      if (dismissed[trigId]) continue;
      if (snooze[trigId] && snooze[trigId] > now) continue;
      if (lastShown[trigId] && (now - lastShown[trigId] < 60 * 1000)) continue;

      candidates.push({ ...ev, __trigId: trigId, __fireTs: fireTs, __offset: m });
    }
  }

  // 가장 먼저 울려야 하는 트리거 우선 + 마감 임박 우선
  candidates.sort((a, b) => {
    if (a.__fireTs !== b.__fireTs) return a.__fireTs - b.__fireTs;
    const aBase = new Date(a.end ?? a.start).getTime();
    const bBase = new Date(b.end ?? b.start).getTime();
    return aBase - bBase;
  });
  return candidates; // ✅ 여러 개 반환
}
export function startUpcomingWatcher({ refreshSec = 300 } = {}) {
  let timer = null;

  const tick = async () => {
    try {
      // 트래픽 절약: 지금~+60분 범위만
      const start = new Date();
      const end   = new Date(Date.now() + 60 * 60 * 1000);
      const events = await calendarApi.getEvents({ start, end }); // 기존 API 시그니처 사용
      const cand = pickTarget(events, { windowMs: refreshSec * 1000 });
      if (cand && cand.length) {
        // ✅ 트리거별 중복 방지 키 기록
        const lastShown = load(STORAGE_LASTSHOW);
        const shownAt = Date.now();
        for (const c of cand) {
          const key = c.__trigId || c.id;
          lastShown[key] = shownAt;
        }
        save(STORAGE_LASTSHOW, lastShown);

        // ✅ 로그인 요약창처럼 한 번에 묶어서 보여주기 (최대 20개)
        const lines = cand.slice(0, 20).map(ev => {
          const title = ev.title || "(제목 없음)";
          const desc  = (ev.description || "").trim().split("\n")[0] || "";
          const base  = ev.end ?? ev.start;
          const d     = new Date(base);
          const hh    = String(d.getHours()).padStart(2, "0");
          const mm    = String(d.getMinutes()).padStart(2, "0");
          const until = `마감 ${hh}시 ${mm}분`;
          // 제목 — 내용 (한 줄), 다음 줄에 마감 시각
          return `• ${title}${desc ? ` — ${desc}` : ""}\n  ${until}`;
        }).join("\n\n");

        const batchEvent = {
          id: `upcoming-batch-${shownAt}`,
          title: "",
          description: lines,   // ✅ 모달에서 그대로 멀티라인 출력
          start: new Date().toISOString(),
          end: new Date().toISOString(),
          location: "",
          reminder_minutes_before: 0,
        };
        window.notify?.openUpcoming?.(batchEvent);
      }
    } catch {}
  };

  timer = setInterval(tick, Math.max(60, refreshSec) * 1000);
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
