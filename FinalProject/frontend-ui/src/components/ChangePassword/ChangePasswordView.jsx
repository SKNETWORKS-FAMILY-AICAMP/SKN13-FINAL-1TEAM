import React from "react";
import useChangePassword from "./useChangePassword.js";
import PasswordTextField from "../common/PasswordTextField.jsx";
import ConfirmModal from "../Modal/ConfirmModal.jsx";
import HeaderBar from "../shared/HeaderBar.jsx";
import userApi from "../services/userApi.js";

const PASSWORD_HINT =
    "8~20자, 영문 대/소문자/숫자/특수문자( . ! @ # $ % ) 포함";

function PageContainer({ children, showHeader }) {
    return (
        <div className="w-screen h-screen bg-white flex flex-col">
            {showHeader && <HeaderBar showMenuButton={false} />}
            <main className="flex-1 overflow-auto">
                <div className="max-w-[456px] mx-auto px-6 pt-12 pb-16">
                    {children}
                </div>
            </main>
        </div>
    );
}

export default function ChangePasswordView({
    beforeStep = "login",
    role = "employee",
    isForceChange = false,
    routeTo = () => {},
    goLogin = () => {},
    goMyPage = () => {},
    asPanel = false, // ✅ 추가: 임베드/패널 모드
}) {
    const h = useChangePassword({
        beforeStep,
        role,
        isForceChange,
        routeTo,
        goLogin,
        goMyPage,
        api: {
            changeMyPassword: userApi.updatePassword.bind(userApi),
        },
    });

    // 패널 모드 또는 마이페이지 경유면 화면 래퍼 없이 본문만 렌더
    const embed = asPanel || beforeStep === "mypage";

    const Content = (
        <form onSubmit={h.onSubmit} className="space-y-5">
            <PasswordTextField
                id="current-password"
                label="현재 비밀번호"
                value={h.currentPassword}
                onChange={h.setCurrentPassword}
                placeholder="현재 비밀번호"
                autoComplete="current-password"
                size="lg"
            />
            <PasswordTextField
                id="new-password"
                label="새 비밀번호"
                value={h.newPw}
                onChange={h.setNewPw}
                placeholder="새 비밀번호"
                autoComplete="new-password"
                hint={PASSWORD_HINT}
                error={h.newPwError}
                size="lg"
            />
            <PasswordTextField
                id="confirm-password"
                label="새 비밀번호 확인"
                value={h.confirmPw}
                onChange={h.setConfirmPw}
                placeholder="새 비밀번호 확인"
                autoComplete="new-password"
                error={h.confirmError}
                size="lg"
            />
            {h.serverError && (
                <p className="text-sm text-red-600">{h.serverError}</p>
            )}
            <div className="grid grid-cols-2 gap-3 mt-2">
                <button
                    type="button"
                    onClick={h.onCancel}
                    className="h-12 rounded-xl border bg-white text-gray-700"
                    disabled={h.pending}
                >
                    취소
                </button>
                <button
                    type="submit"
                    className="h-12 rounded-xl bg-gray-500 text-white disabled:opacity-50"
                    disabled={!h.canSubmit || h.pending}
                >
                    {h.pending ? "변경 중..." : "변경하기"}
                </button>
            </div>
        </form>
    );

    if (embed) {
        // ✅ 마이페이지 내 임베드: 래퍼/헤더 없이 본문만
        return <div className="max-w-[456px]">{Content}</div>;
    }

    // ✅ 로그인 경유(강제변경) 전체 화면
    const showHeader = beforeStep === "login";
    return (
        <PageContainer showHeader={showHeader}>
            <h1 className="text-2xl font-bold text-center mb-8">
                비밀번호 변경
            </h1>
            {Content}
            {beforeStep === "login" && isForceChange && (
                <ConfirmModal
                    open={h.confirmOpen}
                    onClose={() => h.setConfirmOpen(false)}
                    title="비밀번호 변경을 취소할까요?"
                    content="초기 비밀번호 사용자는 반드시 비밀번호를 변경해야 합니다. 취소하면 로그아웃됩니다."
                    cancelText="계속 변경"
                    confirmText="로그아웃"
                    confirmVariant="primary"
                    onCancel={() => h.setConfirmOpen(false)}
                    onConfirm={h.confirmCancel}
                />
            )}
        </PageContainer>
    );
}
