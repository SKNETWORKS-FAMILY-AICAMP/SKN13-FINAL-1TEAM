/* 
  파일: src/components/Sidebar/ChatSummaryItem.jsx
  목적: 제목 hover 시 ⋯ → "삭제" 단일 메뉴. 클릭 시 해당 세션 하드 삭제(hard=true).
*/

import React, { useEffect, useRef, useState } from "react";
import { deleteSession } from "../services/chatApi.js";

// (보조) 제목 정리
const stripEmoji = (s = "") =>
  s.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]/gu, "")
   .replace(/[\u200B-\u200D\uFEFF]/g, "")
   .replace(/\s+/g, " ")
   .trim();
const cutByChars = (s = "", limit = 13) => {
  const arr = Array.from(s);
  return arr.length <= limit ? s : arr.slice(0, limit).join("") + "...";
};
const toSidebarTitle = (rawTitle = "", limit = 13) =>
  cutByChars(stripEmoji(rawTitle), limit);

export default function ChatSummaryItem({
  title,
  sessionId,
  onClick,
  onRemoved,    // 부모: 삭제 후 목록에서 제거
  isActive,
}) {
  const fullTitle = stripEmoji(title || "");
  const displayTitle = toSidebarTitle(title || "", 13);

  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef(null);
  const btnRef = useRef(null);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setMenuOpen(false);
    };
    window.addEventListener("click", onDocClick);
    return () => window.removeEventListener("click", onDocClick);
  }, [menuOpen]);

  const handleHardDelete = async () => {
    if (!sessionId || busy) return;
    // 확인창을 원치 않으면 아래 3줄을 삭제하세요.
    const ok = window.confirm("이 세션의 대화 기록을 모두 삭제합니다. (복구 불가)");
    if (!ok) return;

    try {
      setBusy(true);
      await deleteSession(sessionId, { hard: true }); // ← 하드 삭제
      setMenuOpen(false);
      onRemoved?.(sessionId); // 부모에서 목록 제거
    } catch (e) {
      alert("세션 삭제 실패: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={
        "group relative min-w-0 p-3 rounded-lg cursor-pointer " +
        (isActive ? "bg-gray-200" : "hover:bg-gray-100")
      }
      onClick={onClick}
    >
      <div className="min-w-0 text-sm font-medium truncate pr-6" title={fullTitle}>
        {displayTitle || "새 대화"}
      </div>

      {/* ⋯ 버튼 (hover 시 표시) */}
      <button
        ref={btnRef}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity
                   text-gray-500 hover:text-gray-800 px-1"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        aria-label="세션 옵션"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        ⋯
      </button>

      {/* 단일 메뉴: 삭제 */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-2 top-9 z-20 w-36 rounded-md border border-gray-200 bg-white shadow-lg py-1"
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            disabled={busy}
            onClick={handleHardDelete}
            role="menuitem"
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}
