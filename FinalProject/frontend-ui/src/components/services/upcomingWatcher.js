// ✅ upcomingWatcher.js (디버그 로그 + 전역 싱글톤 가드 + HMR dispose 완전본)
import calendarApi from "./calendarApi.js";
import { colorToType } from "../FeatureWindow/panels/calendar/calendarConstants";

const STORAGE_DISMISSED = "upcoming:dismissed";
const STORAGE_SNOOZE    = "upcoming:snoozeUntil";
const STORAGE_LASTSHOW  = "upcoming:lastShownAt"; // 중복 방지(같은 이벤트 반복 노출 방지)

const load = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || "{}"); } catch { return {}; } };
const save = (k, v) => sessionStorage.setItem(k, JSON.stringify(v || {}));

// 모듈 로드 지점 로깅(어느 창/라우트에서 로드됐는지)
try { console.debug("[upcoming] module loaded at", typeof location !== "undefined" ? location.href : "(no location)"); } catch {}

// ── 전역 싱글톤(같은 창에서 HMR이 여러 번 로드돼도 1회만 실행) ───────────────
const GKEY = "__upcomingWatcherSingleton__";
const G = (typeof globalThis !== "undefined" ? globalThis : window);
if (!G[GKEY]) G[GKEY] = { started: false, stop: null, id: 0 };

// ── 후보 선택: “정확히 전”이 아니라 “≤10/30/60분 이내”에 진입하면 감지 ─────
function pickTarget(events) {
  const dismissed = load(STORAGE_DISMISSED);
  const snooze    = load(STORAGE_SNOOZE);
  const lastShown = load(STORAGE_LASTSHOW);
  const now = Date.now();
  const BUCKETS_ASC = [10, 30, 60]; // 작은 버킷 우선

  const candidates = [];
  for (const ev of (events || [])) {
    const dbg = {
      id: ev.id, title: ev.title, start: ev.start, end: ev.end,
      minutes: Number(ev.reminder_minutes_before ?? 0),
      enabled: ev.reminder_enabled
    };

    const minBefore = Number(ev.reminder_minutes_before ?? 0);
    if (minBefore <= 0) { console.debug("[upcoming][skip] off(min=0):", ev.title, ev.id); continue; }
    if (ev.reminder_enabled === false) { console.debug("[upcoming][skip] disabled:", ev.title, ev.id); continue; }

    // 기준 시각: deadline → end, 그 외 → start
    const evType  = ev.type || (typeof colorToType === "function" ? colorToType(ev.color) : null);
    const baseISO = evType === "deadline" ? (ev.end ?? ev.start) : (ev.start ?? ev.end);
    const baseTs  = new Date(baseISO).getTime();
    console.debug("[upcoming][calc]", dbg, "evType:", evType, "baseISO:", baseISO, "baseTs:", baseTs);
    if (Number.isNaN(baseTs)) { console.debug("[upcoming][skip] invalid date:", ev.title, baseISO); continue; }

    const msLeft = baseTs - now;
    if (msLeft <= 0) { console.debug("[upcoming][skip] past:", ev.title, "base:", baseISO); continue; }
    const minsLeft = Math.ceil(msLeft / 60000); // 9m50s → 10분으로 취급

    const bucket = BUCKETS_ASC.find((b) => minsLeft <= b);
    console.debug("[upcoming][left]", dbg.title, "minsLeft:", minsLeft, "bucket:", bucket);
    if (!bucket) { console.debug("[upcoming][skip] >60m left:", ev.title, "minsLeft:", minsLeft); continue; }

    // 이벤트별 버킷 단위로 1회만
    const trigId = `${ev.id || ev.title || baseTs}#<=${bucket}`;
    if (dismissed[trigId]) { console.debug("[upcoming][skip] dismissed:", trigId); continue; }
    if (snooze[trigId] && snooze[trigId] > now) { console.debug("[upcoming][skip] snoozed:", trigId); continue; }
    if (lastShown[trigId]) { console.debug("[upcoming][skip] lastShown:", trigId); continue; }

    candidates.push({
      ...ev,
      __trigId: trigId,
      __minsLeft: minsLeft,
      __bucket: bucket,
      __baseISO: baseISO,
      __baseTs: baseTs,
    });
    console.debug("[upcoming][cand]", ev.title, "minsLeft:", minsLeft, "bucket:", bucket, "type:", evType, "base:", baseISO);
  }

  // 더 임박한 것 우선, 동률이면 기준시각 빠른 순
  candidates.sort((a, b) => (a.__minsLeft - b.__minsLeft) || (a.__baseTs - b.__baseTs));
  return candidates;
}

/* ────────────────────────────────────────────────────────────────
 *  싱글톤 가드 / 디버그
 * ──────────────────────────────────────────────────────────────── */
let __watcherStarted = false;
let __watcherId = 0;
let __stopper = null;

export function startUpcomingWatcher() {
  // 전역(창 단위) 싱글톤 우선 검사
  if (G[GKEY].started) {
    try { console.debug("[upcoming] watcher already running (global) id:", G[GKEY].id); } catch {}
    return G[GKEY].stop || (() => {});
  }

  // 모듈(파일) 단위 재진입 방지
  if (__watcherStarted) {
    try {
      console.debug("[upcoming] watcher already running id:", __watcherId, "at", typeof location !== "undefined" ? location.href : "(no location)");
    } catch {}
    return __stopper || (() => {});
  }
  __watcherStarted = true;
  __watcherId = Date.now();

  // 전역 상태 세팅
  G[GKEY].started = true;
  G[GKEY].id = __watcherId;

  // 호출 스택(어디서 시작했는지) 추적용 로그
  const stack = new Error().stack?.split("\n").slice(2, 8).join("\n");
  try {
    console.debug("[upcoming] START watcher id:", __watcherId, "at", typeof location !== "undefined" ? location.href : "(no location)", "\nfrom:\n", stack || "(no stack)");
  } catch {}

  let timer = null;
  let alignTimeout = null;
  let disposed = false;

  let inFlight = false; // ← 추가: 진행 중 여부
  const tick = async () => {
    if (disposed) return;
    if (inFlight) { console.debug("[upcoming] tick skipped (in-flight)"); return; }
    inFlight = true;
    try {
      // 현재 시각 기준 앞으로 1시간 범위만 조회
      const start = new Date();
      const end   = new Date(Date.now() + 60 * 60 * 1000);
      console.debug("[upcoming] tick(id:", __watcherId, ") range:", start.toISOString(), "→", end.toISOString());

      const events = await calendarApi.getEvents({ start, end });
      console.debug("[upcoming] fetched events:", Array.isArray(events) ? events.length : "(?)");

      const cand = pickTarget(events); // ≤10/30/60분 '이내' 감지
      console.debug("[upcoming] candidates:", cand?.length || 0, cand?.slice?.(0, 3) || []);

      if (cand && cand.length) {
        // ✅ 여러 이벤트를 묶어서 한 번에 표시 (최대 20개)
        const lines = cand.slice(0, 20).map(ev => {
          const title = ev.title || "(제목 없음)";
          const desc  = (ev.description || "").trim().split("\n")[0] || "";
          const d     = new Date(ev.__baseISO);
          const hh    = String(d.getHours()).padStart(2, "0");
          const mm    = String(d.getMinutes()).padStart(2, "0");
          const label = (ev.type || colorToType?.(ev.color)) === "deadline" ? "마감" : "시작";
          const until = `${label}까지 약 ${ev.__minsLeft}분 남음 (≤${ev.__bucket}분)`;
          return `• ${title}${desc ? ` — ${desc}` : ""}\n  ${until}`;
        }).join("\n\n");

        const shownAt = Date.now();
        const batchEvent = {
          id: `upcoming-batch-${shownAt}`,
          title: "",
          description: lines,   // ✅ 모달에서 그대로 멀티라인 출력
          start: new Date().toISOString(),
          end: new Date().toISOString(),
          location: "",
          reminder_minutes_before: 0,
        };

        // ✅ 알림창 오픈 성공일 때만 lastShown 기록
        let ok = false;
        const openFn = window.notify?.openUpcoming;
        if (typeof openFn === "function") {
          try {
            const ret = await Promise.resolve(openFn(batchEvent));
            ok = (ret === true); // 반드시 true 일 때만 성공으로 인식
          } catch (e) {
            console.warn("[upcoming] notify open failed:", e);
          }
        } else {
          console.warn("[upcoming] notify bridge missing – not marking lastShown");
        }

        if (ok) {
          const lastShown = load(STORAGE_LASTSHOW);
          for (const c of cand) lastShown[c.__trigId] = shownAt;
          save(STORAGE_LASTSHOW, lastShown);
          console.debug("[upcoming] marked lastShown for", cand.length, "triggers at", shownAt);
        } else {
          console.debug("[upcoming] notify NOT shown → lastShown NOT marked");
        }
      }
    } catch (err) {
      console.warn("[upcomingWatcher] tick error", err);
    } finally {
      inFlight = false; // ← 추가: 끝나면 해제
    }
  };

  // ✅ 로그인 직후 즉시 1회 실행
  tick();

  // ✅ 정각 기준 5분 단위로 실행되도록 동기화
  const schedule = () => {
    const now = new Date();
    const ms = (5 - (now.getMinutes() % 5)) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();
    console.debug("[upcoming] align next tick in", ms, "ms");
    alignTimeout = setTimeout(async () => {
      await tick(); // ← 첫 aligned tick 완료를 기다림
      timer = setInterval(tick, 5 * 60 * 1000)
      console.debug("[upcoming] interval set: every 5m");
    }, Math.max(ms, 0));
  };
  schedule();

  __stopper = () => {
    disposed = true;
    if (timer) { clearInterval(timer); timer = null; }
    if (alignTimeout) { clearTimeout(alignTimeout); alignTimeout = null; }
    try { console.debug("[upcoming] STOP watcher id:", __watcherId, "at", typeof location !== "undefined" ? location.href : "(no location)"); } catch {}
    __watcherStarted = false;
    __watcherId = 0;
    __stopper = null;

    // 전역 상태 해제
    G[GKEY].started = false;
    G[GKEY].id = 0;
    G[GKEY].stop = null;
  };

  // 전역 stop 핸들러 저장
  G[GKEY].stop = __stopper;
  return G[GKEY].stop;
}

// HMR에서 이 모듈이 dispose 될 때 중복 워처 남지 않도록 정리
if (import.meta && import.meta.hot) {
  import.meta.hot.dispose(() => {
    try { G[GKEY].stop?.(); } catch {}
  });
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
