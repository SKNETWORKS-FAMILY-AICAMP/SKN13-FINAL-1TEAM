// ✅ 파일: src/components/FeatureWindow/FeatureFrame.jsx

/**
 * FeatureFrame (콘텐츠 전용)
 * ----------------------------------------------------------------------
 * 목적:
 *  - 기능부(사원) 화면의 "콘텐츠만" 렌더링하는 컴포넌트.
 *  - 사이드바/레이아웃은 바깥의 FeatureShell이 담당하므로, 여기서는 탭 키(defaultTab)에
 *    맞는 패널을 선택해 렌더링만 한다.
 *
 * props:
 *  - defaultTab: "docs" | "calendar" | "forms" | "mypage"
 *
 * 주의:
 *  - 기존의 FeatureFrame처럼 내부에서 FeatureShell/Sidebar를 다시 감싸지 않는다.
 *  - RoleRouter가 키를 결정하고, 이 컴포넌트는 그 키에 해당하는 패널만 보여준다.
 */

import React, { useState } from "react";

// 기존 패널들 (네 프로젝트 구조에 맞춰 경로 유지)
import FeatureHome from "./panels/FeatureHome";
import FeatureDocs from "./panels/FeatureDocs";
import FeatureCalendar from "./panels/calendar/FeatureCalendar";
import FeatureMypage from "./panels/mypage/FeatureMypage";
import FeatureEmployees from "./panels/admin/FeatureEmployees";

export default function FeatureFrame({ defaultTab }) {
    const [empDefaultTab, setEmpDefaultTab] = useState("docs");
    const [adminDefaultTab, setAdminDefaultTab] = useState("employees");

    /** 탭 키에 따른 패널 선택 */
    // 관리자용
    if (defaultTab === "employees") return <FeatureEmployees />; // 사원 관리 페이지
    // 사원용
    if (defaultTab === "docs") return <FeatureDocs />; // 문서 관리 페이지
    if (defaultTab === "calendar") return <FeatureCalendar />; // 일정 관리 페이지

    // 공통
    if (defaultTab === "mypage") return <FeatureMypage />; // 마이페이지

    // if (defaultTab === "forms") {
    //   return (
    //     <div className="rounded-xl border border-gray-200 bg-white p-6">
    //       <p className="text-gray-600">양식 관리 패널(미구현)</p>
    //     </div>
    //   );
    // }

    // 필요하면 home 처리 (선택)
    if (defaultTab === "home") return <FeatureHome />;

    // 안전망
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
            <p className="text-gray-600">선택된 탭이 없어요.</p>
        </div>
    );
}
