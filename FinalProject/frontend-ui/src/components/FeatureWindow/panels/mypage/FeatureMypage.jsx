import React, { useState } from "react";
// ✅ 공용 비번 변경 컴포넌트 재사용 (경로 주의)
import ChangePasswordView from "../../../ChangePassword/ChangePasswordView.jsx";

/** 공용 Row */
function Row({
    label,
    value,
    actionLabel,
    onAction,
    actionDisabled = false,
    secondaryActionLabel,
    onSecondaryAction,
    secondaryDisabled = false,
}) {
    const hasAnyAction = Boolean(actionLabel || secondaryActionLabel);
    return (
        <div className="flex items-center justify-between py-6 border-b bg-transparent border-zinc-300">
            <div className="flex flex-col w-full mr-6">
                <span className="text-base font-medium text-zinc-400">
                    {label}
                </span>
                <div className="text-base text-black">{value}</div>
            </div>

            {hasAnyAction ? (
                <div className="flex items-center justify-end gap-2 w-[296px]">
                    {secondaryActionLabel && (
                        <button
                            type="button"
                            onClick={onSecondaryAction}
                            disabled={secondaryDisabled}
                            className="h-12 min-w-[120px] rounded-lg border-2 border-neutral-200 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {secondaryActionLabel}
                        </button>
                    )}
                    {actionLabel && (
                        <button
                            type="button"
                            onClick={onAction}
                            disabled={actionDisabled}
                            className="h-12 min-w-[120px] rounded-lg border-2 border-neutral-200 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {actionLabel}
                        </button>
                    )}
                </div>
            ) : (
                <div className="h-12 w-[296px]" />
            )}
        </div>
    );
}

/** 메인 프로필 화면 */
function FeatureMypage({ onChangePage }) {
    const emp = {
        name: "홍길동",
        dept: "인사부",
        rank: "팀장",
        email: "hgd1234@clicka.co.kr",
        accountId: "230519875",
    };

    const maskedPassword = "•".repeat(10);

    const maskEmail = (email) => {
        if (!email) return "";
        const [local, domain] = email.split("@");
        if (!domain) return email;
        const visible = local.slice(0, 2) || local;
        const dots = "•".repeat(Math.max(local.length - 2, 6));
        return `${visible} ${dots} @ ${domain}`;
    };

    const [currentEmail, setCurrentEmail] = useState(emp.email);
    const [isEmailEditing, setIsEmailEditing] = useState(false);
    const [emailInput, setEmailInput] = useState(emp.email);

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    const isEmailValid = emailRegex.test(emailInput);
    const isEmailChanged = emailInput !== currentEmail;
    const canApplyEmail = isEmailEditing && isEmailValid && isEmailChanged;

    const emailValueNode = isEmailEditing ? (
        <div className="w-full max-w-[520px]">
            <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="example@clicka.co.kr"
                className={`h-12 w-full rounded-lg border px-4 text-base outline-none ${
                    emailInput.length > 0 && !isEmailValid
                        ? "border-red-400 focus:border-red-500"
                        : "border-zinc-300 focus:border-zinc-400"
                }`}
            />
            {emailInput.length > 0 && !isEmailValid && (
                <p className="mt-1 text-xs text-red-500">
                    올바른 이메일 형식이 아닙니다.
                </p>
            )}
        </div>
    ) : (
        maskEmail(currentEmail)
    );

    const handleEmailApply = () => {
        if (!isEmailEditing) {
            setIsEmailEditing(true);
            setEmailInput(currentEmail);
            return;
        }
        if (!canApplyEmail) return;
        console.log("[이메일 변경 요청]", { newEmail: emailInput }); // TODO: API 연동
        setCurrentEmail(emailInput);
        setIsEmailEditing(false);
    };

    const handleEmailCancel = () => {
        setEmailInput(currentEmail);
        setIsEmailEditing(false);
    };

    return (
        <section>
            <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">마이페이지</h1>
                </div>

                <div className="mt-6 max-w-[937px]">
                    <h2 className="text-lg font-semibold text-black mb-4">
                        사원 정보
                    </h2>
                    <Row label="이름" value={emp.name} />
                    <Row label="부서" value={emp.dept} />
                    <Row label="직급" value={emp.rank} />

                    <h2 className="text-lg font-semibold text-black mt-10 mb-4">
                        계정
                    </h2>
                    <Row label="아이디" value={emp.accountId} />
                    <Row
                        label="비밀번호"
                        value={maskedPassword}
                        actionLabel="비밀번호 변경"
                        onAction={() => onChangePage("changepassword")}
                    />
                    <Row
                        label="이메일"
                        value={emailValueNode}
                        actionLabel={
                            isEmailEditing ? "변경하기" : "이메일 변경"
                        }
                        onAction={handleEmailApply}
                        actionDisabled={isEmailEditing && !canApplyEmail}
                        secondaryActionLabel={
                            isEmailEditing ? "취소" : undefined
                        }
                        onSecondaryAction={
                            isEmailEditing ? handleEmailCancel : undefined
                        }
                    />
                </div>
            </div>
        </section>
    );
}

/** 컨테이너: 여기서만 page 전환 관리 */
export default function MypageContainer() {
    const [page, setPage] = useState("mypage"); // 'mypage' | 'changepassword'

    if (page === "changepassword") {
        // ✅ 패널(임베드) 모드로 비번 변경 폼 표시
        return (
            <div className="mx-auto w-full max-w-[937px] px-6 py-6">
                <h1 className="text-2xl font-bold mb-6">비밀번호 변경</h1>

                <ChangePasswordView
                    beforeStep="mypage"
                    role="employee"
                    isForceChange={false}
                    asPanel // ← 패널(임베드) 모드로 렌더
                    routeTo={() => setPage("mypage")} // 성공 후 마이페이지 복귀
                    goLogin={() => setPage("mypage")} // (로그인 모달 안 씀)
                    goMyPage={() => setPage("mypage")}
                />
            </div>
        );
    }

    return <FeatureMypage onChangePage={setPage} />;
}
