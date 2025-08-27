/* 
  파일: src/components/Sidebar/Sidebar.jsx
  역할: (기능부 좌측 슬라이드 패널) 채팅 목록/새 채팅/로그아웃을 포함한 간단 사이드바.

  LINKS:
    - 이 파일을 사용하는 곳:
      * Feature 창(챗 윈도우)의 좌측 오버레이/고정 패널
    - 이 파일이 사용하는 것:
      * ChatSummaryItem.jsx (행 컴포넌트), shared/IconButton.jsx (닫기 버튼)

  상하위 연결(데이터/이벤트 흐름):
    - props.sessions: [{ session_id|id|messageId|title, updated_at }…] — 채팅 요약 목록
    - props.onSelectChat(sessionId): 항목 클릭 시 채팅 열기
    - props.onNewChat(): 새 세션 생성
    - props.onLogout(): 로그아웃
    - props.onClose(): 오버레이 닫기(최대화가 아닌 경우)
    - props.isMaximized: true면 닫기 버튼 숨김

  안정성/운영 팁:
    - busyRef로 중복 클릭 방지(연속 클릭/네트워크 지연 시 동일 요청 중복 억제)
    - safeSessions로 누락 필드에 대해 안전한 fallback 키 보장
*/

import React, { useCallback, useMemo, useRef } from "react";
import ChatSummaryItem from "./ChatSummaryItem.jsx";
import IconButton from "../shared/IconButton.jsx";

/* 
  Sidebar(props)
  목적: 채팅 목록/새 채팅/로그아웃 인터랙션을 제공하는 경량 사이드바.
  인자(props):
    - onClose: () => void
    - sessions: any[]                     // 채팅 세션 요약 목록
    - onNewChat: () => void
    - onSelectChat: (sessionId: string) => void
    - isMaximized: boolean                // 최대화면 오버레이 닫기 버튼 숨김
    - onLogout: () => void

  동작:
    - 상단 닫기(오버레이일 때만), 새 채팅 버튼, 세션 목록, 하단 로그아웃 버튼
    - 내부 busyRef로 중복 클릭 방지
  반환:
    - <div> 루트 컨테이너
*/
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

  /* 
    handleNewChat
    목적: "새 채팅" 클릭을 안전하게 처리(중복 요청 방지).
    동작:
      - busyRef로 가드 → onNewChat 호출 → finally에서 가드 해제
    반환: void
  */
  const handleNewChat = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    try { onNewChat?.(); } finally { busyRef.current = false; }
  }, [onNewChat]);

  /* 
    handleLogout
    목적: "로그아웃" 클릭을 안전하게 처리(중복 요청 방지).
    동작:
      - busyRef 가드 → onLogout 호출 → finally 해제
    반환: void
  */
  const handleLogout = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    try { onLogout?.(); } finally { busyRef.current = false; }
  }, [onLogout]);

  /* 
    makeSelectHandler(sid)
    목적: 특정 세션을 선택하는 클릭 핸들러를 클로저로 생성.
    인자:
      - sid: session_id (없으면 fallback 키)
    동작:
      - busyRef 가드 → onSelectChat(sid) 호출 → finally 해제
    반환:
      - () => void 형태의 클릭 핸들러
  */
  const makeSelectHandler = useCallback(
    (sid) => () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try { onSelectChat?.(sid); } finally { busyRef.current = false; }
    },
    [onSelectChat]
  );

  /* 
    safeSessions
    목적: 세션 목록에서 각 행에 사용할 "안정적인 key와 sid"를 만든다.
    동작:
      - key 우선순위: session_id > id > messageId > "title-updated_at"
      - sid 우선순위: session_id > id > key
    반환:
      - [{ chat, key, sid }] 배열
  */
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
      {/* 상단 영역(오버레이면 닫기 버튼 노출) */}
      <div className="flex flex-col flex-grow h-0">
        {!isMaximized && (
          <div className="flex justify-end items-center h-10 px-3 drag-region">
            <div className="no-drag">
              <IconButton icon="close" onClick={onClose} />
            </div>
          </div>
        )}

        {/* 새 채팅 버튼 */}
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
        
        {/* 채팅 목록 (스크롤) */}
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

      {/* 하단 로그아웃 버튼 */}
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
