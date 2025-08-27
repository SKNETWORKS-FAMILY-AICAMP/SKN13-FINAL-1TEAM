// ✅ 파일: src/components/FeatureWindow/RoleRouter.jsx

/**
 * RoleRouter
 * ----------------------------------------------------------------------
 * 목적:
 *  - 사이드바에서 선택된 메뉴 key(activeKey)와 현재 사용자 역할(role)에 따라
 *    어떤 화면(컴포넌트)을 렌더링할지 "단 한 곳"에서 결정하는 스위치 컴포넌트.
 *
 * 특징:
 *  - React Router가 없어도 먼저 동작 가능. 나중에 경로 동기화가 필요하면
 *    이 파일의 분기 로직을 Routing 테이블로 이식하면 됨.
 *  - 관리자(Admin)와 사원(User)이 **같은 사이드바(MainSidebar)** 를 공유하되,
 *    역할에 따라 "상속 받은 메뉴 세트"만 다르게 보여주고, 여기서 화면을 결정.
 *
 * props:
 *  - role: "admin" | "employee"
 *  - activeKey: 사이드바에서 선택된 key 값 (navconfig.js의 key와 1:1로 맞아야 함)
 *
 * 확장법:
 *  - 새로운 메뉴를 navconfig.js에 추가 → 동일 key로 아래 분기에 화면을 추가.
 *  - 관리자 전용 화면을 늘리려면 admin 분기에만 케이스를 추가.
 *
 * 주의:
 *  - key 오탈자/불일치가 있으면 빈 안내 화면(EmptyHint)이 보임.
 *  - "문서 작성"은 label만 문구이고 key는 forms(기존 기능부 호환)로 유지.
 */

import React from "react";

/** [사원 공용] 기능부 컨테이너
 *  - 내부에서 defaultTab에 따라 "문서 목록 / 캘린더 / 문서 작성(forms) / 마이페이지"를 출력.
 *  - 즉, 사원 쪽은 라우팅 없이도 탭 전환으로 UI를 구성하는 컴포넌트 구조.
 */
import FeatureFrame from "../FeatureWindow/FeatureFrame.jsx";

/** [관리자 전용] 사원관리 페이지
 *  - 팀원 구현 파일 위치에 맞춰 경로 조정 필요.
 *  - 예: ../../components/Admin/AdminEmployeePage.jsx 라면 아래 import 경로 수정.
 */
import AdminPage from "./panels/admin/FeatureEmployees.jsx";

export default function RoleRouter({ userType, activeKey }) {
  /** 관리자(Admin) 분기
   *  - 현재 요구사항: "사원 관리(employees)"와 "마이페이지(mypage)" 두 개만 노출.
   *  - employees → AdminEmployeePage (라우팅 대상)
   *  - mypage   → 공용 FeatureWindow의 mypage 탭 재사용
   */
  if (userType === "admin") {
    if (activeKey === "employees") return <AdminPage />;
    if (activeKey === "mypage")   return <FeatureFrame defaultTab="mypage" />;
    return <EmptyHint />;
  } else if (userType === "employee") {
    if (activeKey === "docs")     return <FeatureFrame defaultTab="docs" />;
    if (activeKey === "docseditor")     return <FeatureFrame defaultTab="docseditor" />;
    if (activeKey === "calendar") return <FeatureFrame defaultTab="calendar" />;
    if (activeKey === "mypage")   return <FeatureFrame defaultTab="mypage" />;
  }

  /** 사원(User) 분기
   *  - 요구사항: "문서 목록(docs) / 캘린더(calendar) / 문서 작성(forms) / 마이페이지(mypage)"
   *  - key 값은 navconfig.js의 userSections와 1:1 매칭 필수.
   */
  
  
  /** 안전망: 연결되지 않은 메뉴 키 */
  return <EmptyHint />;
}

/** 빈 화면 안내 (UX 보조용) */
function EmptyHint() {
  return (
    <div className="h-full flex items-center justify-center text-gray-500">
      메뉴를 선택하세요
    </div>
  );
}