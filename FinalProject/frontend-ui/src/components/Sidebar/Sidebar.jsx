// ✅ Sidebar.jsx (UI 변경 없음 / HA·LB 안정화 보강)
import React, { useCallback, useMemo, useRef } from "react";
import ChatSummaryItem from "./ChatSummaryItem.jsx";
import IconButton from "../shared/IconButton.jsx";

export default React.memo(function Sidebar({
  onClose,
  sessions = [],              // 🔒 null 안전
  onNewChat,
  onSelectChat,
  isMaximized,
  onLogout,
}) {
  // 🔒 중복 클릭 방지(로드밸런서 재시도/지연 중 연타 대비)
  const busyRef = useRef(false);

  const handleNewChat = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    try { onNewChat?.(); } finally { busyRef.current = false; }
  }, [onNewChat]);

  const handleLogout = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    try { onLogout?.(); } finally { busyRef.current = false; }
  }, [onLogout]);

  const makeSelectHandler = useCallback(
    (sid) => () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try { onSelectChat?.(sid); } finally { busyRef.current = false; }
    },
    [onSelectChat]
  );

  // 🔒 안정적인 키(fallback): session_id > id > messageId > title 해시
  const safeSessions = useMemo(() => {
    return (Array.isArray(sessions) ? sessions : []).map((chat) => {
      const key =
        chat?.session_id ??
        chat?.id ??
        chat?.messageId ??
        `${chat?.title ?? "untitled"}-${(chat?.updated_at ?? "").toString()}`;
      const sid = chat?.session_id ?? chat?.id ?? key;
      return { chat, key, sid };
    });
  }, [sessions]);

  return (
    <div className="w-full h-full bg-white shadow-lg z-50 flex flex-col">
      {/* ✅ 상단 영역 */}
      <div className="flex flex-col flex-grow h-0">
        {/* 오버레이일 경우 닫기 버튼 */}
        {!isMaximized && (
          <div className="flex justify-end items-center h-10 px-3 drag-region">
            <div className="no-drag">
              <IconButton icon="close" onClick={onClose} />
            </div>
          </div>
        )}

        {/* ✅ 새 채팅 버튼 */}
        <div className="p-4 pb-0">
          <div className="mb-2">
            <button
              className="text-sm px-3 py-2 rounded bg-blue-600 text-white w-full"
              onClick={handleNewChat}               // ⚙️ 내부 핸들러 적용
            >
              ＋ 새 채팅
            </button>
          </div>

          <hr className="my-2" />
        </div>
        
        {/* ✅ 채팅 목록 (스크롤) */}
        <div className="flex-grow overflow-y-auto px-4 no-scrollbar">
          {safeSessions.length === 0 ? (
            <div className="text-sm text-gray-400">채팅 기록 없음</div>
          ) : (
            safeSessions.map(({ chat, key, sid }) => (
              <ChatSummaryItem
                key={key}                          // ⚙️ 안정 키
                title={chat.title}
                onClick={makeSelectHandler(sid)}   // ⚙️ 안전 선택 핸들러
              />
            ))
          )}
        </div>
      </div>

      {/* ✅ 하단 로그아웃 버튼 */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleLogout}                   // ⚙️ 내부 핸들러 적용
          className="w-full text-sm py-2 rounded bg-red-500 text-white hover:bg-red-600"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
});
