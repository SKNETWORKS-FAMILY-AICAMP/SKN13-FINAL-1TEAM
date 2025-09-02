import React from "react";
import Modal from "./Modal.jsx";

/**
 * ConfirmModal
 * - 제목은 18px bold (요구사항)
 * - 내용은 회색 작은 글씨
 * - 버튼 2개: 취소/확인
 */
export default function ConfirmModal({
    open,
    onClose,
    title,
    content,
    confirmText = "확인",
    cancelText = "취소",
    onConfirm,
    onCancel,
    confirmVariant = "danger",
    align = "right",
    closeOnEsc = true,
    disableBackdropClick = true,
    /** ✅ 추가: Modal 크기 전달 */
    size = "md", // 'sm' | 'md' | 'lg' | 'xl'
    contentClassName = "", // 필요 시 카드 커스텀
}) {
    const confirmClass =
        confirmVariant === "danger"
            ? "bg-red-600 hover:bg-red-700 text-white"
            : confirmVariant === "primary"
            ? "bg-black hover:bg-gray-900 text-white"
            : "bg-gray-800 hover:bg-gray-900 text-white";

    const justify =
        align === "center"
            ? "justify-center"
            : align === "between"
            ? "justify-between"
            : "justify-end";

    return (
        <Modal
            open={open}
            onClose={onClose}
            closeOnEsc={closeOnEsc}
            disableBackdropClick={disableBackdropClick}
            size={size} // ✅ 전달
            contentClassName={contentClassName} // ✅ 필요 시 사용
        >
            <h3 className="mb-2" style={{ fontSize: 18, fontWeight: 700 }}>
                {title}
            </h3>

            {content && (
                <div className="mb-5 text-sm text-gray-600">
                    {typeof content === "string" ? <p>{content}</p> : content}
                </div>
            )}

            <div className={`flex gap-2 ${justify}`}>
                <button
                    type="button"
                    onClick={onCancel || onClose}
                    className="h-10 rounded-xl border px-4 text-gray-700 bg-white hover:bg-gray-50"
                >
                    {cancelText}
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    className={`h-10 rounded-xl px-4 ${confirmClass}`}
                >
                    {confirmText}
                </button>
            </div>
        </Modal>
    );
}
