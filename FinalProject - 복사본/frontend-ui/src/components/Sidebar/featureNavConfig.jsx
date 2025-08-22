// // 사이드바 "내용"만 정의 (아이콘 없음)
// export const featureSections = [
//   {
//     title: null,
//     items: [
//       { key: "docs",    label: "문서 목록" },
//       { key: "forms",   label: "양식 관리" },
//       { key: "calendar", label: "캘린더" },
//       { key: "mypage",  label: "마이페이지" },
//     ],
//   },
// ];

// ✅ 관리자용 사이드바 메뉴
export const adminSections = [
  {
    title: null,
    items: [
      { key: "employee", label: "사원 관리" },
      { key: "mypage",   label: "마이페이지" },
    ],
  },
];

// ✅ 사원용 사이드바 메뉴
export const userSections = [
  {
    title: null,
    items: [
      { key: "docs",     label: "문서 관리" },
      // { key: "forms",     label: "문서 작성" },  
      { key: "calendar", label: "캘린더" },
      { key: "mypage",   label: "마이페이지" },
    ],
  },
];

export const featureFooter = [
  { key: "logout", label: "로그아웃" },
];
