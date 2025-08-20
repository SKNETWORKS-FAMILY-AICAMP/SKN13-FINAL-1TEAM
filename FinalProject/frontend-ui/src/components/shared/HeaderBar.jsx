/**
 * HeaderBar.jsx
 * ------------------------------------------------------------------
 * 목적:
 *  - 프레임리스 창 상단바에 최소화 / 최대화 / 닫기 버튼 제공
 *
 * 변경점:
 *  - 기존: ipcRenderer.send("minimize" | "maximize" | "close")
 *  - 변경: preload.js에 정의된 electron.window.{minimize,maximizeToggle,close}
 *    안전하게 invoke 기반 IPC를 사용
 */

import React from "react";

export default function HeaderBar({ onMenuClick, showMenuButton }) {
  const win = window?.electron?.window; // ✅ 새 브릿지 API

  return (
    <div className="flex items-center justify-between px-2 h-10 bg-white border-b border-gray-200 drag">
      {showMenuButton && (
        <div className="no-drag">
          <button
            onClick={onMenuClick}
            className="no-drag inline-flex items-center justify-center w-8 h-8 rounded hover:bg-gray-100"
            aria-label="사이드바 열기"
            title="사이드바 열기"
          >
            {/* 24x24 벡터 햄버거 아이콘: 선 두께/끝모양을 고정해 렌더링 흔들림 방지 */}
            <svg
              width="20" height="20" viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M3 6h18M3 12h18M3 18h18"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex space-x-1 no-drag ml-auto">
        {/* 최소화 */}
        <button
          onClick={() => win?.minimize()}
          className="w-8 h-8 rounded hover:bg-gray-100"
        >
          –
        </button>

        {/* 최대화/복원 */}
        <button
          onClick={() => win?.maximizeToggle()}
          className="w-8 h-8 rounded hover:bg-gray-100"
        >
          ☐
        </button>

        {/* 닫기 */}
        <button
          onClick={() => win?.close()}
          className="w-8 h-8 rounded hover:bg-red-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
