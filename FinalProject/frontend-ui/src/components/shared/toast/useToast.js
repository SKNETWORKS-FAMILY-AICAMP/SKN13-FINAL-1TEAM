// src/components/shared/toast/useToast.js
import { useToastContext } from "./ToastProvider";

export default function useToast() {
    const ctx = useToastContext();
    return {
        success: (msg, opts) => ctx.success(msg, opts),
        error: (msg, opts) => ctx.error(msg, opts),
        info: (msg, opts) => ctx.info(msg, opts),
        // 원하면 remove도 노출
        remove: ctx.remove,
    };
}
