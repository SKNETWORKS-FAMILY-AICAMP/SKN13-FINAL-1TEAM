import React, { useState } from "react";
import FeatureShell from "./FeatureShell";
import FallbackSidebar from "../Sidebar/FallbackSidebar.jsx";
// import AdminSidebar from "../Sidebar/AdminSidebar"; // (미래 교체)

import { featureSections, featureFooter } from "../Sidebar/featureNavConfig";
import FeatureHome from "./panels/FeatureHome";
import FeatureDocs from "./panels/FeatureDocs";
import FeatureCalendar from "./panels/FeatureCalendar";     // ✅ 추가

// const SidebarComponent = AdminSidebar;
const SidebarComponent = FallbackSidebar;

export default function FeatureApp() {
  const [active, setActive] = useState("docs");
  const [collapsed, setCollapsed] = useState(false);

  const handleSelect = (key) => {
    if (key === "logout") return;
    setActive(key);
  };

  return (
    <FeatureShell
      SidebarComponent={SidebarComponent}
      sections={featureSections}
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
    </FeatureShell>
  );
}
