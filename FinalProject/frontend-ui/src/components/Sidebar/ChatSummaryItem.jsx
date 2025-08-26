/* 
  파일: src/components/Sidebar/ChatSummaryItem.jsx
  역할: 사이드바에서 채팅 요약(제목) 한 줄을 렌더하는 리스트 아이템 컴포넌트.
  메모: 아이콘 전부 제거 완료.
*/

/* ───────── 유틸: 이모지 제거 + 13자 말줄임 ───────── */
const stripEmoji = (s = "") =>
  s
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]/gu, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const cutByChars = (s = "", limit = 13) => {
  const arr = Array.from(s);
  return arr.length <= limit ? s : arr.slice(0, limit).join("") + "...";
};

const toSidebarTitle = (rawTitle = "", limit = 13) =>
  cutByChars(stripEmoji(rawTitle), limit);
/* ──────────────────────────────────────────────── */

export default function ChatSummaryItem({ title, onClick }) {
  const fullTitle = stripEmoji(title || "");
  const displayTitle = toSidebarTitle(title || "", 13);

  return (
    <div
      className="min-w-0 p-3 rounded-lg hover:bg-gray-100 cursor-pointer"
      onClick={onClick}
    >
      <div className="min-w-0 text-sm font-medium truncate" title={fullTitle}>
        {displayTitle || "새 대화"}
      </div>
    </div>
  );
}
