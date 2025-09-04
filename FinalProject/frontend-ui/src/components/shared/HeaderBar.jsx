/* 
  파일: src/components/shared/HeaderBar.jsx
  역할: 프레임리스(타이틀바 없는) 윈도우 상단바. 최소화/최대화/닫기 버튼과(선택) 햄버거 버튼을 제공.

  LINKS:
    - 이 파일을 사용하는 곳:
      * LoginPage.jsx, Feature 계열 화면의 최상단 공통 바(UI 헤더)
    - 이 파일이 사용하는 것:
      * window.electron.window.{ minimize, maximizeToggle, close }  ← preload에서 노출된 안전한 브릿지
    - 상하위 연결:
      * 상위에서 showMenuButton=true면 햄버거 버튼 노출
      * onMenuClick() 콜백으로 사이드바 토글 등 트리거

  동작 개요:
    - 프레임리스 창에서 드래그 영역과 클릭 영역을 분리하기 위해
      .drag / .no-drag 클래스를 사용(웹킷: -webkit-app-region).
    - 우측 3버튼은 Electron 윈도우 제어 브릿지를 통해 동작.
    - 햄버거 버튼은 선택적 노출(showMenuButton) + onMenuClick 전달.

  주의:
    - window.electron.window가 없는 순수 웹환경에서도 안전하게 동작하도록 옵셔널 체이닝을 사용.
    - 드래그 영역 위에 버튼을 배치할 때는 .no-drag로 감싸 클릭이 먹히도록 해야 함.
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
          – {/* 윈도우 최소화 기호 */}
        </button>

        {/* 최대화/복원 */}
        <button
          onClick={() => win?.maximizeToggle()}
          className="w-8 h-8 rounded hover:bg-gray-100"
        >
          ☐ {/* 토글: 최대화 ↔ 복원 */}
        </button>

        {/* 닫기 */}
        <button
          onClick={() => win?.close()}
          className="w-8 h-8 rounded hover:bg-red-100"
        >
          ✕ {/* 창 닫기 */}
        </button>
      </div>
    </div>
  );
}
