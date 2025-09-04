import { useEffect, useMemo } from "react";

const SIZE_CLASS = {
    sm: "max-w-[360px]",
    md: "max-w-[440px]", // ✅ 기본값: 제출용 카드에 적당
    lg: "max-w-[640px]",
    xl: "max-w-[720px]",
};

export default function Modal({
    open,
    onClose,
    children,
    closeOnEsc = true,
    disableBackdropClick = true,
    /** ✅ 추가 옵션 */
    size = "md", // 'sm' | 'md' | 'lg' | 'xl'
    contentClassName = "", // 모달 카드에 붙일 추가 클래스
}) {
    // 🔒 모달 열릴 때 body 스크롤 잠금 + ESC 닫기
    useEffect(() => {
        if (!open) return;

        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const handleKey = (e) => {
            if (closeOnEsc && e.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", handleKey);

        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", handleKey);
        };
    }, [open, closeOnEsc, onClose]);

    if (!open) return null;

    const sizeClass = SIZE_CLASS[size] ?? SIZE_CLASS.md;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
        >
            {/* 배경 오버레이 */}
            <div
                className="absolute inset-0 bg-black/30"
                onClick={disableBackdropClick ? undefined : onClose}
            />
            {/* 모달 카드 */}
            <div
                className={[
                    "relative z-10 w-full", // 가로 꽉 채우되…
                    sizeClass, // ✅ …최대 너비를 size로 제한
                    "rounded-2xl bg-white shadow-xl p-6",
                    "mx-4", // ✅ 모바일에서 좌우 여백
                    contentClassName, // ✅ 추가 커스텀 스타일 훅
                ].join(" ")}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}
