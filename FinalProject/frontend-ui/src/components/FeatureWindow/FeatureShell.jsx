// ✅ 파일: src/components/FeatureWindow/FeatureShell.jsx

/**
 * FeatureShell
 * ----------------------------------------------------------------------
 * 목적:
 *  - 공용 레이아웃 컨테이너.
 *  - 좌측: MainSidebar(역할별 섹션 주입)
 *  - 우측: RoleRouter(역할 + activeKey에 따른 실제 화면 스위치)
 */

import React, { useMemo, useState, useEffect } from "react";
import HeaderBar from "../shared/HeaderBar.jsx";
import MainSidebar from "../Sidebar/MainSidebar.jsx";
import Logo from "../../assets/sample_logo.svg";  // 회사 로고(임시)

import { adminSections, employeeSections, featureFooter } from "../Sidebar/featureNavConfig.jsx";
import RoleRouter from "./RoleRouter.jsx";

export default function FeatureShell({ userType = "user" }) {
  // 역할별 섹션
  const sections = useMemo(
    () => (userType === "admin" ? adminSections : employeeSections),
    [userType]
  );

  // 초기 활성 탭
  const [activeKey, setActiveKey] = useState(userType === "admin" ? "employees" : "docs");

  // 사이드바 메뉴 선택
  const handleSelect = (key) => {
    if (key === "logout") {
      // 보조 트리거: 혹시 사이드바 버튼이 직접 전역 요청을 안 쏘는 경우 대비
      window.auth?.requestLogout?.("all");
      return;
    }
    setActiveKey(key);
  };

  // 사이드바 접힘/펼침
  const [collapsed, setCollapsed] = useState(true);

  /** ✅ 전역 로그아웃 수신
   * - main.js가 모든 창에 'logout' 브로드캐스트
   * - 관리자라면 메인 로그인 창을 다시 띄우고, 이 창은 닫는다.
   */
  useEffect(() => {
    const off = window.auth?.onLogout?.(() => {
      try {
        localStorage.removeItem("user");
        localStorage.removeItem("userToken");
      } catch {}

      if (userType === "admin") {
        // 관리자 로그아웃 시: 기본(챗봇) 로그인 창 노출
        window.electron?.showMain?.();
      }
      // 기능부/관리자 창 닫기
      window.electron?.window?.close?.();
    });
    return () => off?.();
  }, [userType]);

  return (
    <div className="w-screen h-screen bg-white">
      {/* 상단 바 */}
      <HeaderBar showSidebarToggle={false} />

      {/* 좌/우 분할 */}
      <div className="flex h-[calc(100vh-40px)]">
        {/* 사이드바 */}
        <MainSidebar
          collapsed={collapsed}
          onCollapse={() => setCollapsed(!collapsed)}
          logoSrc={Logo}
          sections={sections}
          footer={featureFooter}
          activeKey={activeKey}
          onSelect={handleSelect}
        />

        {/* 컨텐츠 영역 */}
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-[1200px] mx-auto">
            <RoleRouter userType={userType} activeKey={activeKey} />
          </div>
        </main>
      </div>
    </div>
  );
}
