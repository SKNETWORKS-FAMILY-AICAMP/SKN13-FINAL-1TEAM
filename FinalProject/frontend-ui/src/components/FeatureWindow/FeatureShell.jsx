// ✅ 파일: src/components/FeatureWindow/FeatureShell.jsx

import React, { useMemo, useState, useEffect } from "react";
import HeaderBar from "../shared/HeaderBar.jsx";
import MainSidebar from "../Sidebar/MainSidebar.jsx";
import Logo from "../../assets/sample_logo.svg";

import {
    adminSections,
    employeeSections,
    featureFooter,
} from "../Sidebar/featureNavConfig.jsx";
import RoleRouter from "./RoleRouter.jsx";
import ConfirmModal from "../Modal/ConfirmModal.jsx"; // 🆕 추가: 확인 모달 임포트

export default function FeatureShell({ userType = "user" }) {
    // 🚩 1) 역할 정규화
    const role = userType === "admin" ? "admin" : "employee";

    // 역할별 섹션
    const sections = useMemo(
        () => (role === "admin" ? adminSections : employeeSections),
        [role]
    );

    // 🚩 2) 초기 활성 탭
    const [activeKey, setActiveKey] = useState(() =>
        role === "admin" ? "employees" : "docs"
    );

    // 🚩 3) role 바뀌면 기본 탭 리셋
    useEffect(() => {
        setActiveKey(role === "admin" ? "employees" : "docs");
    }, [role]);

    // 사이드바 메뉴 선택
    const handleSelect = (key) => {
        if (key === "logout") {
            // (보조 트리거로 남겨두되 실제로는 onLogoutClick에서 모달 띄움)
            window.auth?.requestLogout?.("all");
            return;
        }
        setActiveKey(key);
    };

    // 사이드바 접힘/펼침
    const [collapsed, setCollapsed] = useState(true);

    /** ✅ 전역 로그아웃 수신 */
    useEffect(() => {
        const off = window.auth?.onLogout?.(() => {
            try {
                localStorage.removeItem("user");
                localStorage.removeItem("userToken");
            } catch {}

            if (role === "admin") {
                window.electron?.showMain?.();
            }
            window.electron?.window?.close?.();
        });
        return () => off?.();
    }, [role]);

    /** 🆕 추가: 로그아웃 확인 모달 상태 */
    const [showLogoutModal, setShowLogoutModal] = useState(false); // 🆕

    /** 🆕 추가: 실제 로그아웃 실행 함수(모달 '확인'에서 호출) */
    const executeLogout = () => {
        // 🆕
        window.auth?.requestLogout?.("all");
        setShowLogoutModal(false);
    };

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
                    /** 🆕 추가: 사이드바 '로그아웃' 클릭 시 모달 띄우기 */
                    onLogoutClick={() => setShowLogoutModal(true)} // 🆕
                />

                {/* 컨텐츠 영역 */}
                <main className="flex-1 overflow-auto p-6">
                    <div className="max-w-[1200px] mx-auto">
                        <RoleRouter userType={userType} activeKey={activeKey} />
                    </div>
                </main>
            </div>

            {/* 🆕 추가: 로그아웃 확인 모달 */}
            <ConfirmModal
                open={showLogoutModal}
                onClose={() => setShowLogoutModal(false)}
                title="로그아웃 하시겠습니까?" // 18px bold는 컴포넌트 내부 스타일로 충족
                content=""
                cancelText="취소"
                confirmText="로그아웃"
                confirmVariant="danger"
                onCancel={() => setShowLogoutModal(false)}
                onConfirm={executeLogout} // 실제 로그아웃 트리거
                align="right"
                size="sm"
            />
        </div>
    );
}
