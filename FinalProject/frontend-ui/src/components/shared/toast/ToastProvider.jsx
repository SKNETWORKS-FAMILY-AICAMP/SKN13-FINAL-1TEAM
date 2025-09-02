// src/components/shared/toast/ToastProvider.jsx
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";

const ToastCtx = createContext(null);

let idSeq = 0;
const genId = () => `toast_${Date.now()}_${++idSeq}`;

const TYPE_STYLES = {
    success: { base: "bg-[#3d9130]/70 text-white" },
    danger: { base: "bg-[#d75b5b]/70 text-white" },
    info: { base: "bg-gray-800/90 text-white" },
};

function ToastProvider({
    children,
    position = "right",
    max = 5,
    defaultDuration = 3000,
}) {
    const [toasts, setToasts] = useState([]);
    const timers = useRef(new Map());

    // 🔐 포털 타깃: 마운트 이후에만 document.body 사용
    const [portalTarget, setPortalTarget] = useState(null);
    useEffect(() => {
        if (typeof document !== "undefined") {
            setPortalTarget(document.body);
        }
    }, []);

    const remove = useCallback((id) => {
        setToasts((list) => list.filter((t) => t.id !== id));
        const tm = timers.current.get(id);
        if (tm) {
            clearTimeout(tm);
            timers.current.delete(id);
        }
    }, []);

    const push = useCallback(
        (t) => {
            const id = t.id ?? genId();
            setToasts((list) => {
                const next = [...list, { ...t, id }];
                return next.slice(-max);
            });
            const duration = t.duration ?? defaultDuration;
            if (duration > 0) {
                const tm = setTimeout(() => remove(id), duration);
                timers.current.set(id, tm);
            }
        },
        [defaultDuration, max, remove]
    );

    const api = useMemo(
        () => ({
            success: (message, opts = {}) =>
                push({ type: "success", message, ...opts }),
            error: (message, opts = {}) =>
                push({ type: "danger", message, ...opts }),
            info: (message, opts = {}) =>
                push({ type: "info", message, ...opts }),
            remove,
        }),
        [push, remove]
    );

    // 타이머 정리
    useEffect(
        () => () => {
            timers.current.forEach((tm) => clearTimeout(tm));
            timers.current.clear();
        },
        []
    );

    const containerPos =
        position === "center"
            ? "inset-0 flex items-center justify-center"
            : position === "bottom"
            ? "inset-0 pointer-events-none flex items-end justify-end pr-6 pb-6"
            : "inset-0 pointer-events-none flex items-start justify-end pt-16 pr-5 md:pr-8";

    return (
        <ToastCtx.Provider value={api}>
            {children}
            {/* document 준비되기 전에는 포털 렌더 안 함 */}
            {portalTarget &&
                createPortal(
                    <div className={`fixed z-[9999] ${containerPos}`}>
                        <ul className="flex w-full max-w-sm flex-col gap-3 pointer-events-auto">
                            {toasts.map((t) => {
                                const styles =
                                    TYPE_STYLES[t.type] ?? TYPE_STYLES.info;
                                return (
                                    <li
                                        key={t.id}
                                        className={[
                                            "relative rounded-2xl px-4 py-3 shadow-xl ring-1 ring-black/10",
                                            "flex items-center gap-3 backdrop-blur-sm",
                                            styles.base,
                                            "transition-all duration-200 will-change-transform",
                                        ].join(" ")}
                                        role="status"
                                    >
                                        <span className="text-sm font-medium">
                                            {t.message}
                                        </span>
                                        <button
                                            aria-label="닫기"
                                            onClick={() => remove(t.id)}
                                            className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/20 focus:outline-none"
                                        >
                                            <LuX className="h-5 w-5" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>,
                    portalTarget
                )}
        </ToastCtx.Provider>
    );
}

export default ToastProvider;

const NOOP = {
    success: () => {},
    error: () => {},
    info: () => {},
    remove: () => {},
};

export const useToastContext = () => {
    const ctx = useContext(ToastCtx);
    return ctx ?? NOOP;
};
