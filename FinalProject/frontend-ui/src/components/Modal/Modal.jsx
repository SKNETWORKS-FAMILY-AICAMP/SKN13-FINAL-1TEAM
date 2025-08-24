import { useEffect } from "react";

export default function Modal({
    open,
    onClose,
    children,
    closeOnEsc = true, // ESC 키로 닫기 허용 여부
    disableBackdropClick = true, // 배경 클릭 시 닫히지 않게 (관리자 페이지 팝업 요구사항)
}) {
    // 🔒 모달 열릴 때 body 스크롤 잠금
    useEffect(() => {
        if (!open) return;

        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        // ESC 키 이벤트 핸들러
        const handleKey = (e) => {
            if (closeOnEsc && e.key === "Escape") {
                onClose?.();
            }
        };
        window.addEventListener("keydown", handleKey);

        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", handleKey);
        };
    }, [open, closeOnEsc, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* 배경 오버레이 */}
            <div
                className="absolute inset-0 bg-black/30"
                onClick={disableBackdropClick ? undefined : onClose}
            />
            {/* 모달 카드 */}
            <div
                className="relative z-10 w-full max-w-[720px] rounded-2xl bg-white shadow-xl p-6"
                onClick={(e) => e.stopPropagation()} // 내부 클릭 시 이벤트 전파 차단
            >
                {children}
            </div>
        </div>
    );
}