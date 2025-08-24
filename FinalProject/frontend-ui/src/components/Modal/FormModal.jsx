import Modal from "./Modal";

export default function FormModal({
    open,
    title, // 모달 제목
    onClose, // 취소 버튼 / 닫기 동작
    onSubmit, // 등록/수정 버튼 동작
    submitText = "등록하기",
    cancelText = "취소",
    children, // 폼 내용 (이름, 부서, 직급 필드 등)
    submitDisabled = false,
}) {
    return (
        <Modal open={open} onClose={onClose}>
            {/* 제목 */}
            <h2 className="text-2xl font-bold mb-4">{title}</h2>{" "}
            {/* 24px bold */}
            {/* 본문: 전달된 폼 필드 */}
            <div className="text-sm">{children}</div> {/* 14px */}
            {/* 버튼 영역 */}
            <div className="mt-6 flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="h-10 px-4 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
                >
                    {cancelText}
                </button>
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={submitDisabled}
                    className="h-10 px-4 rounded-md bg-gray-700 text-white text-sm hover:bg-gray-800 disabled:opacity-50"
                >
                    {submitText}
                </button>
            </div>
        </Modal>
    );
}