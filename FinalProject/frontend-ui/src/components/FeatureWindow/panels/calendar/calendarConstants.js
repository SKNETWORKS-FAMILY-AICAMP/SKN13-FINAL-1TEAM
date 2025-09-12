// src/components/FeatureWindow/panels/calendar/calendarConstants.js

// 하나로 묶은 타입 정의 (라벨+색상)
export const EVENT_TYPES = {
  meeting:  { label: "회의",  bg: "#8FBAFF", text: "#1F2937" },
  work:     { label: "업무",  bg: "#9CE8B8",  text: "#1F2937" },
  deadline: { label: "마감",  bg: "#FF9595",  text: "#1F2937" },
  etc:      { label: "기타",  bg: "#FFD387", text: "#1F2937" },
};

// 회의 -  #8FBAFF
// 업무 - #9CE8B8
// 마감 - #FF9595
// 기타 - #FFD387

// 선택적으로 라벨 맵이 필요할 경우를 대비한 편의 export
export const TYPE_LABELS = Object.fromEntries(
  Object.entries(EVENT_TYPES).map(([k, v]) => [k, v.label])
);

// color → type 초간단 매핑 (백엔드가 동일 문자열을 되돌려 준다는 전제)
export function colorToType(color) {
  const key = String(color ?? "").trim();
  if (!key) return null;
  for (const [t, v] of Object.entries(EVENT_TYPES)) {
    if (String(v.bg).trim() === key) return t;
  }
  return null;
}

// 과거 코드 호환용 별칭
export const matchTypeByColor = colorToType;

// (그대로 유지) react-big-calendar 한국어 메시지
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