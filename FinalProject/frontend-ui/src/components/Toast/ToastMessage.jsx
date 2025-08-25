import React, { createContext, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

/** 사용 예: const { addToast } = useToast(); addToast({ type:'success', message:'저장 완료' }); */
export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
    return ctx;
}

/** 앱 최상단을 ToastProvider로 감싸면 전역 어디서든 토스트 사용 가능 */
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const remove = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));
    const addToast = ({ message, type = "info", duration = 2000 }) => {
        const id = crypto.randomUUID?.() || String(Date.now() + Math.random());
        const toast = { id, message, type, duration };
        setToasts((prev) => [...prev, toast]);
        setTimeout(() => remove(id), duration);
        return id;
    };

    const value = useMemo(() => ({ addToast, remove }), []);

    return (
        <ToastContext.Provider value={value}>
            {children}

            {/* 컨테이너: 우하단, 세로 스택 */}
            <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3">
                {toasts.map((t) => (
                    <ToastItem
                        key={t.id}
                        toast={t}
                        onClose={() => remove(t.id)}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

/** 내부 개별 토스트 UI (스타일만 타입으로 분기) */
function ToastItem({ toast, onClose }) {
    const { message, type } = toast;

    const base =
        "min-w-[280px] max-w-[360px] px-5 py-3 rounded-full shadow-lg " +
        "flex items-center justify-between";

    const styles = {
        success: "bg-green-500 text-white",
        error: "bg-red-400 text-white",
        info: "bg-[#A8A8A8]/[0.72] text-white", // 요구한 회색 + 72% 투명
    };

    return (
        <div className={`${base} ${styles[type]}`}>
            <span className="text-sm">{message}</span>
            <button
                aria-label="닫기"
                onClick={onClose}
                className="ml-4 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10"
            >
                {/* × 아이콘 */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                        d="M6 6l12 12M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />
                </svg>
            </button>
        </div>
    );
}