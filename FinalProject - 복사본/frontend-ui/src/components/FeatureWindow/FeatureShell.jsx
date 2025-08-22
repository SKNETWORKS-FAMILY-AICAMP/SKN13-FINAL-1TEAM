import React from "react";
import HeaderBar from "../shared/HeaderBar";

/**
 * 레이아웃 쉘: HeaderBar + Sidebar + 본문
 * - 2025 느낌: 여백 넉넉, 라운드 적당, 얇은 경계, 연한 그림자 최소화
 */
export default function FeatureShell({
  SidebarComponent,
  sections,
  footer,
  activeKey,
  onSelect,
  collapsed = false,
  headerNode = <span className="text-sm text-gray-600"></span>,
  children,
}) {
  return (
    <div className="w-screen h-screen bg-white">
      <HeaderBar showSidebarToggle={false} />
      <div className="flex h-[calc(100vh-40px)]">
        <SidebarComponent
          sections={sections}
          footer={footer}
          activeKey={activeKey}
          onSelect={onSelect}
          collapsed={collapsed}
          header={headerNode}
        />
        <main className="flex-1 overflow-auto p-8">
          <div className="max-w-[1200px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
