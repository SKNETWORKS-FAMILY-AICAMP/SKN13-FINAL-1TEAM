// ✅ 파일: src/components/Sidebar/navconfig.js
// 목적: MainSidebar.jsx에 주입할 역할별 메뉴 세트 정의(하이브리드 구조 호환)
// 규칙: key 값은 화면 매핑(라우터/컴포넌트 스위치)에서 1:1로 사용되므로 안정적으로 유지
// - 관리자(Admin):  [사원 관리, 마이페이지]
// - 사원(User):     [문서 목록, 캘린더, 문서 작성, 마이페이지]
// - 마이페이지는 공용

// ──────────────────────────────────────────────────────────────
// 공용 하단(로그아웃 등)
// ──────────────────────────────────────────────────────────────
export const featureFooter = [
  { key: "logout", label: "로그아웃" },
];

// ──────────────────────────────────────────────────────────────
// 사원(User)용 사이드바
//  - 기존 기능부(UI 컴포넌트 스위치) 키와 호환 유지
//  - "문서 작성"은 기존 key(forms)를 유지하고 label만 변경
// ──────────────────────────────────────────────────────────────
export const employeeSections = [
  {
    title: null,
    items: [
      { key: "docs",     label: "문서 목록" },   // FeatureWindow: defaultTab="docs"
      { key: "calendar", label: "캘린더" },     // FeatureWindow: defaultTab="calendar"
      // { key: "forms",    label: "문서 작성" },  // FeatureWindow: defaultTab="forms" (label만 변경)
      { key: "mypage",   label: "마이페이지" }, // 공용
    ],
  },
];

// ──────────────────────────────────────────────────────────────
// 관리자(Admin)용 사이드바
//  - 관리자 라우팅 구조: 사원 관리(라우팅 대상), 마이페이지(공용)
// ──────────────────────────────────────────────────────────────
export const adminSections = [
  {
    title: "관리자",
    items: [
      { key: "employees", label: "사원 관리" },  // Admin 라우트: /admin/employee 등으로 매핑
      { key: "mypage",   label: "마이페이지" }, // 공용
    ],
  },
];

// ──────────────────────────────────────────────────────────────
// 헬퍼: 역할 문자열로 섹션 선택 (선택적 사용)
// ──────────────────────────────────────────────────────────────
export function getSectionsByRole(role) {
  return role === "admin" ? adminSections : employeeSections;
}

// (선택) 기본 내보내기: 헬퍼
export default { getSectionsByRole, adminSections, employeeSections, featureFooter };
