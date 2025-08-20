// ✅ 파일: src/components/FeatureWindow/FeatureShell.jsx

/**
 * FeatureShell
 * ----------------------------------------------------------------------
 * 목적:
 *  - 공용 레이아웃 컨테이너.
 *  - 좌측: MainSidebar(역할별 섹션 주입)
 *  - 우측: RoleRouter(역할 + activeKey에 따른 실제 화면 스위치)
 *
 * 특징:
 *  - 관리자/사원이 같은 사이드바를 공유하되, navconfig.js에서 역할별 섹션을 주입.
 *  - 기존 기능부(UI 컴포넌트 스위치 구조)는 그대로 재사용(FeatureWindow).
 *  - 관리자 전용 화면은 라우팅 구조로 분리되어도, 여기선 단순 스위치로 연결만 담당.
 *
 * props:
 *  - role: "admin" | "user" (로그인 결과에서 전달)
 *
 * 데이터 흐름(단방향):
 *  MainSidebar.onSelect(key) → setActiveKey(key) → RoleRouter(role, activeKey) → 화면 출력
 *
 * 교체/확장 포인트:
 *  - 로그아웃 등 footer 액션은 handleSelect에서 처리.
 *  - 새로운 메뉴를 추가하려면 navconfig.js + RoleRouter 분기를 함께 업데이트.
 */

import React, { useMemo, useState } from "react";
import HeaderBar from "../shared/HeaderBar.jsx";
import MainSidebar from "../Sidebar/MainSidebar.jsx";

/** navconfig.js
 *  - adminSections: 관리자용 섹션(사원 관리, 마이페이지)
 *  - userSections : 사원용 섹션(문서 목록, 캘린더, 문서 작성, 마이페이지)
 *  - featureFooter: 공용 하단(로그아웃)
 */
import { adminSections, userSections, featureFooter } from "../Sidebar/featureNavConfig.jsx";

import RoleRouter from "./RoleRouter.jsx";

export default function FeatureShell({ role = "user" }) {
  /** 역할별 사이드바 섹션 선택
   *  - 같은 MainSidebar 컴포넌트를 공유하되, 주입 데이터만 차이.
   */
  const sections = useMemo(
    () => (role === "admin" ? adminSections : userSections),
    [role]
  );

  /** 초기 활성 메뉴
   *  - 관리자: "사원 관리"부터 시작하는 것이 자연스러움
   *  - 사원  : "문서 목록"부터
   */
  const [activeKey, setActiveKey] = useState(role === "admin" ? "employee" : "docs");

  /** 사이드바 선택 핸들러
   *  - 로그아웃 등 footer 액션은 여기에서 처리.
   *  - 일반 메뉴는 activeKey만 바꾸면 RoleRouter가 알아서 화면 전환.
   */
  const handleSelect = (key) => {
    if (key === "logout") {
      /** TODO:
       *  - 토큰/프로필 클린업
       *  - 로그인 화면 전환(필요 시 부모로 콜백 제공)
       */
      return;
    }
    setActiveKey(key);
  };

  return (
    <div className="w-screen h-screen bg-white">
      {/* 상단 바: 필요 시 사이드바 토글, 타이틀, 사용자 정보 등 배치 */}
      <HeaderBar showSidebarToggle={false} />

      {/* 좌/우 분할 레이아웃: 사이드바 + 컨텐츠 */}
      <div className="flex h-[calc(100vh-40px)]">
        {/* 공용 사이드바(역할별 섹션만 주입) */}
        <MainSidebar
          sections={sections}
          footer={featureFooter}
          activeKey={activeKey}
          onSelect={handleSelect}
          collapsed={false}
          header={null}
        />

        {/* 컨텐츠 스테이지: 역할/키 조합으로 하나의 스위치(RoleRouter)에서 화면 결정 */}
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-[1200px] mx-auto">
            <RoleRouter role={role} activeKey={activeKey} />
          </div>
        </main>
      </div>
    </div>
  );
}
