// ✅ 파일 위치: src/components/common/LogoutButton.jsx
//
// ────────────────────────────────────────────────────────────────
// 역할(Role)
//  - 공통적으로 사용할 수 있는 "로그아웃 버튼" UI 컴포넌트.
//  - 클릭 시 전역 인증 모듈(window.auth)에 로그아웃 요청을 전달.
//  - scope(범위)에 따라 현재 세션만 로그아웃하거나 전체 로그아웃 처리 가능.
//  - 어떤 페이지(관리자/기능부/챗봇창 등)에서도 동일하게 사용 가능하도록 설계됨.
//
// 사용처(Expected Usage)
//  - 관리자 페이지 상단/사이드바 "로그아웃" 버튼
//  - 일반 사용자(사원) 기능부/챗봇창의 "로그아웃" 버튼
//  - 전역 로그아웃: 모든 세션에서 강제 로그아웃 처리
//  - 현재 세션 로그아웃: 현재 창/사용자만 로그아웃 처리
//
// props 설명
//  - scope: string → 기본값 "current"
//           * "current" : 현재 세션만 로그아웃
//           * "global"  : 전역 로그아웃 (모든 창 종료 후 로그인 화면으로)
//  - className: string → Tailwind 또는 커스텀 CSS 클래스 전달 가능
//  - children : ReactNode → 버튼 안에 표시할 텍스트나 아이콘
//                미지정 시 기본으로 "로그아웃" 글자 출력
//
// 함수 설명
//  - onClick():
//      * 버튼 클릭 이벤트 핸들러.
//      * window.auth?.requestLogout(scope) 호출
//      * 즉, 전역적으로 선언된 인증 모듈(window.auth)에 로그아웃 요청을 위임.
//      * "?.": 옵셔널 체이닝 → auth 또는 requestLogout이 없을 경우 에러 없이 무시됨
//
// 외부 연결(Dependency)
//  - window.auth 객체:
//      * Electron preload.js 또는 authStore.js 등에서 전역 등록.
//      * requestLogout(scope): 백엔드 또는 IPC로 로그아웃 신호를 보내는 함수.
//      * 실제 세션 종료, 토큰 삭제, 로그인창 표시 로직은 여기서 처리.
//
// 주의 사항
//  - window.auth가 정의되지 않았다면 버튼 클릭 시 아무 동작도 안 함.
//  - 따라서 반드시 preload.js에서 auth API가 주입되어 있어야 정상 작동.
//  - "전역 로그아웃" 시에는 모든 창이 닫히고 로그인창만 남도록 main.js와 연결 필요.
//
import React from "react";

// 공통 로그아웃 버튼 컴포넌트
export default function LogoutButton({ scope = "current", className, children }) {
  // 버튼 클릭 시 실행되는 함수
  const onClick = () => window.auth?.requestLogout?.(scope);

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      title="로그아웃"
    >
      {children || "로그아웃"}
    </button>
  );
}
