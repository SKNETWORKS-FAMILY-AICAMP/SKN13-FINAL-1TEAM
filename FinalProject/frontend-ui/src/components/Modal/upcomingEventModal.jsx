// 우상단 ✕ 버튼으로 닫기 + 회색 반투명 스타일 + "마감시간 HH시 mm분까지" 표기
import React, { useMemo } from "react";

function fmtUntil(endISO, startISO) {
  // end가 있으면 마감시간, 없으면 start 시각 사용
  const t = new Date(endISO || startISO);
  if (Number.isNaN(t.getTime())) return "";
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  return `${hh}시 ${mm}분까지`;
}

export default function UpcomingEventModal({ event, onClose, onSnooze }) {
  if (!event) return null;

  const untilText = useMemo(
    () => fmtUntil(event.end, event.start),
    [event.end, event.start]
  );

  return (
    <div
      className="
        w-[420px] max-w-[92vw]
        rounded-2xl overflow-hidden
        border border-white/15
        shadow-none
        bg-gray-800/60 text-white
        backdrop-blur-md
        ring-1 ring-white/10
        animate-[slideUp_220ms_ease-out]
      "
    >
      {/* 헤더 */}
      <div className="px-4 pt-4 flex items-start justify-between">
        <div className="min-w-0">
          {/* ▶ 상단 라벨만: '오늘 일정' */}
          <div className="text-[11px] font-semibold text-gray-200/80">오늘 일정</div>
          {/* ▶ 제목 영역 제거(“오늘 해야 할 일정” 같은 타이틀은 노출하지 않음) */}
        </div>

        {/* X 버튼 */}
        <button
          onClick={onClose}
          className="
            ml-3 shrink-0 inline-flex items-center justify-center
            h-8 w-8 rounded-full
            text-gray-200/80 hover:text-white
            hover:bg-white/10 transition
          "
          aria-label="닫기"
          title="닫기"
        >
          ✕
        </button>
      </div>

      {/* 본문: 스크롤 가능한 영역 */}
      <div className="px-4 pt-3 pb-2">
        <div
          className="max-h-[260px] overflow-y-auto pr-1 space-y-2"  /* ▶ 내부 스크롤 높이(필요 시 조절) */
        >
          {event.description ? (
            <div className="text-sm text-gray-100/90 whitespace-pre-wrap break-words">
              {event.description /* JSX 배열/문자열 모두 OK */}
            </div>
          ) : (
            <p className="text-sm text-gray-300/80">설명 없음</p>
          )}
        </div>
      </div>

      {/* 푸터 */}
      <div className="px-4 pb-4 pt-2 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="
            text-xs px-3 py-1.5 rounded-lg
            bg-white/90 text-gray-900
            hover:bg-white
            transition
          "
        >
          확인
        </button>
      </div>

      {/* 애니메이션 키프레임 */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        /* ▶ 스크롤바 미니멀 스타일 (WebKit/Chromium) */
        div.max-h-[260px]::-webkit-scrollbar { width: 6px; }
        div.max-h-[260px]::-webkit-scrollbar-track { background: transparent; }
        div.max-h-[260px]::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.3);
          border-radius: 9999px;
        }
      `}</style>
    </div>
  );
}
