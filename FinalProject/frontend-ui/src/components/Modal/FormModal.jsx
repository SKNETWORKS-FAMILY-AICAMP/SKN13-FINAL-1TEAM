/* 
  파일: src/components/Modal/FormModal.jsx
  역할: 공통 폼 모달 래퍼. 제목/본문(children)/하단 버튼(취소/등록 또는 수정)을 표준화하고,
       내부적으로 Modal(오버레이/키보드/스크롤락)을 사용한다.

  LINKS:
    - 이 파일을 사용하는 곳:
      * EmployeeCreateModal.jsx, EmployeeEditModal.jsx 등 모든 폼성 모달
    - 이 파일이 사용하는 것:
      * Modal → 오버레이 + ESC 처리 + body 스크롤 잠금

  데이터 흐름(요약):
    - open/title/children으로 레이아웃 렌더
    - onClose() → 취소 버튼/닫기 동작 연결
    - onSubmit() → 등록/수정 버튼 동작 연결
    - submitDisabled → 유효성 미충족 시 버튼 비활성
*/

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
