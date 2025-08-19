import React, { useState } from "react";
import FeatureShell from "./FeatureShell";
import FallbackSidebar from "../Sidebar/FallbackSidebar.jsx";
// import AdminSidebar from "../Sidebar/AdminSidebar"; // (미래 교체)

import { adminSections, userSections, featureFooter } from "../Sidebar/featureNavConfig";
import MainSidebar from "../Sidebar/MainSidebar.jsx";
import FeatureHome from "./panels/FeatureHome";
import FeatureDocs from "./panels/FeatureDocs";
import FeatureCalendar from "./panels/FeatureCalendar";

const SidebarComponent = MainSidebar;
// const SidebarComponent = FallbackSidebar;

export default function FeatureApp() {
  const [active, setActive] = useState("docs");
  const [collapsed, setCollapsed] = useState(false);

  const sections = pageType === "admin" ? adminSections : userSections;

  const handleSelect = (key) => {
    if (key === "logout") return;
    setActive(key);
  };

  return (
    <MainSidebar
      SidebarComponent={SidebarComponent}
      sections={sections}
      footer={featureFooter}
      activeKey={active}
      onSelect={handleSelect}
      collapsed={collapsed}
    >
      {active === "home" && <FeatureHome />}
      {active === "docs" && <FeatureDocs />}
      {active === "forms" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-gray-600">양식 관리 패널(미구현)</p>
        </div>
      )}
      {active === "mypage" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-gray-600">마이페이지 패널(미구현)</p>
        </div>
      )}
      {active === "calendar" && <FeatureCalendar />}{/* ✅ reports → calendar */}
    </MainSidebar>
  );
}
