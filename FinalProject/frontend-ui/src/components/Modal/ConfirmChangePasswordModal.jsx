// components/Modal/ConfirmChangePasswordModal.jsx
import React from "react";
import Modal from "./Modal";

/**
 * 비밀번호 변경 확인 모달
 * - open: 열림 여부
 * - onConfirm: "변경하기" 클릭
 * - onCancel: 취소/배경클릭/ESC
 */
export default function ConfirmChangePasswordModal({ open, onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      closeOnEsc={true}
      disableBackdropClick={false} // 배경 클릭 시 닫힘
    >
      <div className="space-y-6">
        <h2 className="text-[18px] font-bold">비밀번호를 변경하시겠습니까?</h2>

        {/* 필요하면 부가 안내문구 추가 가능
        <p className="text-sm text-neutral-600">
          변경한 비밀번호는 즉시 적용됩니다.
        </p>
        */}

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 min-w-[112px] rounded-lg bg-neutral-200 text-neutral-700 px-6 hover:bg-neutral-300"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-10 min-w-[112px] rounded-lg bg-[#CD2317] text-white px-6 hover:bg-[#b51e14]"
          >
            변경하기
          </button>
        </div>
      </div>
    </Modal>
  );
}
