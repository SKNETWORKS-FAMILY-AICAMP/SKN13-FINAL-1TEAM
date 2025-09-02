// components/ChangePassword/useChangePassword.js
import { useMemo, useState } from "react";

// ✅ 안내문 문자열
const POLICY_TEXT = "8~20자, 영문 대/소문자/숫자/특수문자( . ! @ # $ % ) 포함";

// ✅ 실제 검증 정규식
const PASSWORD_REGEX =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[.!@#$%])[A-Za-z\d.!@#$%]{8,20}$/;

const sleep = (ms = 500) => new Promise((r) => setTimeout(r, ms));

export default function useChangePassword({
    beforeStep, // 'login' | 'mypage'
    role, // 'employee' | 'admin'
    isForceChange = false,
    routeTo,
    goLogin,
    goMyPage,
    api, // { changeMyPassword } (없으면 mock)
}) {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");

    const [pending, setPending] = useState(false);
    const [serverError, setServerError] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    // ✅ api 없으면 콘솔 목
    const mockApi = {
        changeMyPassword: async (payload) => {
            console.log("[MOCK] changeMyPassword()", payload);
            await sleep(600);
            return { ok: true };
        },
    };
    const svc =
        api && typeof api.changeMyPassword === "function" ? api : mockApi;

    // 항상 현재 비번 입력
    const needCurrent = true;

    // ✅ 새 비밀번호 에러: (1) 현재와 동일 금지 → (2) 정책 미준수면 POLICY_TEXT 표시
    const newPwError = useMemo(() => {
        if (!newPw) return null;
        if (currentPassword && newPw === currentPassword) {
            return "현재 비밀번호와 다른 비밀번호를 입력하세요.";
        }
        return PASSWORD_REGEX.test(newPw) ? null : POLICY_TEXT;
    }, [newPw, currentPassword]);

    const confirmError = useMemo(() => {
        if (!confirmPw) return null;
        return newPw === confirmPw ? null : "비밀번호가 일치하지 않습니다.";
    }, [newPw, confirmPw]);

    // 에러 있으면 제출 불가
    const canSubmit =
        !!currentPassword &&
        !!newPw &&
        !!confirmPw &&
        !newPwError &&
        !confirmError;

    async function onSubmit(e) {
        e?.preventDefault?.();
        if (!canSubmit || pending) return;
        try {
            setPending(true);
            setServerError(null);

            await svc.changeMyPassword({ currentPassword, newPassword: newPw });

            if (beforeStep === "login") {
                routeTo?.(role === "admin" ? "admin-main" : "employee-main");
            } else {
                goMyPage?.();
            }
        } catch (err) {
            const msg =
                err?.response?.data?.message ||
                err?.message ||
                "비밀번호 변경에 실패했습니다.";
            setServerError(msg);
            console.error("[ChangePassword] submit error:", err);
        } finally {
            setPending(false);
        }
    }

    function onCancel() {
        if (beforeStep === "login") setConfirmOpen(true);
        else goMyPage?.();
    }
    function confirmCancel() {
        setConfirmOpen(false);
        goLogin?.();
    }

    return {
        currentPassword,
        setCurrentPassword,
        newPw,
        setNewPw,
        confirmPw,
        setConfirmPw,
        pending,
        serverError,
        confirmOpen,
        setConfirmOpen,

        needCurrent,
        canSubmit,
        newPwError,
        confirmError,

        onSubmit,
        onCancel,
        confirmCancel,
    };
}
