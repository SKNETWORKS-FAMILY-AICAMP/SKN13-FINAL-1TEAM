// src/components/FeatureWindow/panels/calendar/calendarConstants.js

/* ───────────────── 색 문자열 정규화 ─────────────────
   "#rrggbb", "#rgb", "rgb(...)", "rgba(...)" → 통일 키로 변환
*/
function normalizeColor(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();

  // hex
  if (s.startsWith("#")) {
    let hex = s;
    if (hex.length === 4) {
      const h = hex.slice(1);
      hex = "#" + h.split("").map((c) => c + c).join("");
    }
    return hex; // "#rrggbb"
  }

  // rgb/rgba
  const m = s.match(
    /rgba?\s*\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)/
  );
  if (m) {
    const r = Math.round(parseFloat(m[1]));
    const g = Math.round(parseFloat(m[2]));
    const b = Math.round(parseFloat(m[3]));
    const a = m[4] != null ? Math.round(parseFloat(m[4]) * 100) / 100 : 1;
    return `rgba(${r},${g},${b},${a})`;
  }

  return s.replace(/\s+/g, "");
}

function parseColorVec(n) {
  if (!n) return null;
  if (n.startsWith("#")) {
    const r = parseInt(n.slice(1, 3), 16);
    const g = parseInt(n.slice(3, 5), 16);
    const b = parseInt(n.slice(5, 7), 16);
    return [r, g, b, 1];
  }
  const m = n.match(/rgba?\((\d+),(\d+),(\d+)(?:,([0-9.]+))?\)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 1)];
}

/* ───────── 현재(표준) 팔레트 ───────── */
export const EVENT_TYPE_COLORS = {
  meeting:  { bg: "rgba(59, 130, 246, 0.50)",  text: "#1F2937" }, // 회의
  work:     { bg: "rgba(34, 197, 94, 0.50)",   text: "#1F2937" }, // 업무
  deadline: { bg: "rgba(239, 68, 68, 0.50)",   text: "#1F2937" }, // 마감
  etc:      { bg: "rgba(245, 158, 11, 0.50)",  text: "#1F2937" }, // 기타
};

/* ───────── 라벨 ───────── */
export const TYPE_LABELS = {
  meeting: "회의",
  work: "업무",
  deadline: "마감",
  etc: "기타",
};

/* ───────── 서버/과거 hex 색 별칭(정확 매칭 우선) ─────────
   실제 로그: #F6A5AE(핑크) → 마감, #F2C76E(노랑) → 기타
   과거 값:   #FFB6B6(핑크), #FFD77A(노랑), #9DB9FF(블루), #9BE7B0(그린)
*/
const COLOR_ALIASES = {
  meeting:  ["#9db9ff"],
  work:     ["#9be7b0"],
  deadline: ["#ffb6b6", "#f6a5ae"],
  etc:      ["#ffd77a", "#f2c76e"],
};

/* ───────── 역매핑 테이블 구성 ───────── */
const COLOR_TO_TYPE = {};
Object.entries(EVENT_TYPE_COLORS).forEach(([k, v]) => {
  COLOR_TO_TYPE[normalizeColor(v.bg)] = k;
});
Object.entries(COLOR_ALIASES).forEach(([k, arr]) => {
  arr.forEach((c) => (COLOR_TO_TYPE[normalizeColor(c)] = k));
});

/* ───────── 색 → 타입 ─────────
   1) 정확 매칭
   2) 실패 시 표준 팔레트와 RGB 최근접 추론
*/
export function matchTypeByColor(color) {
  const key = normalizeColor(color);
  if (!key) return null;
  if (COLOR_TO_TYPE[key]) return COLOR_TO_TYPE[key];

  const src = parseColorVec(key);
  if (!src) return null;
  let best = null;
  let dist = Infinity;

  Object.entries(EVENT_TYPE_COLORS).forEach(([k, v]) => {
    const tgt = parseColorVec(normalizeColor(v.bg));
    const d =
      (src[0] - tgt[0]) ** 2 +
      (src[1] - tgt[1]) ** 2 +
      (src[2] - tgt[2]) ** 2;
    if (d < dist) {
      dist = d;
      best = k;
    }
  });
  return best;
}

/* ───────── react-big-calendar 한국어 메시지 ───────── */
export const RBC_KO_MESSAGES = {
  date: "날짜",
  time: "시간",
  event: "일정",
  allDay: "하루 종일",
  week: "주",
  work_week: "업무 주",
  day: "일",
  month: "월",
  previous: "이전",
  next: "다음",
  yesterday: "어제",
  tomorrow: "내일",
  today: "오늘",
  agenda: "목록",
  noEventsInRange: "해당 기간에 일정이 없습니다.",
};