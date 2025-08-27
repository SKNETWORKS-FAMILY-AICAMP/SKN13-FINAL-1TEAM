/* 
  파일: src/components/Modal/Modal.jsx
  역할: 가장 기본적인 모달 컴포넌트(오버레이/센터 카드). ESC로 닫기, body 스크롤 잠금, 배경 클릭 동작 제어.

  LINKS:
    - 이 파일을 사용하는 곳:
      * FormModal.jsx → 공통 폼 모달
      * (그 외) 단독으로도 간단한 안내 모달로 사용 가능
  동작 요약:
    - open=true일 때만 렌더
    - useEffect로 body.style.overflow='hidden' 설정(열릴 때) 및 복구(닫힐 때)
    - closeOnEsc=true면 ESC키로 onClose 호출
    - disableBackdropClick=true면 오버레이 클릭으로는 닫히지 않음(관리자 요구사항 반영)
*/

import { useEffect } from "react";

export default function Modal({
    open,
    onClose,
    children,
    closeOnEsc = true, // ESC 키로 닫기 허용 여부
    disableBackdropClick = true, // 배경 클릭 시 닫히지 않게 (관리자 페이지 팝업 요구사항)
}) {
    // 🔒 모달 열릴 때 body 스크롤 잠금 + ESC 키 핸들러 등록
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
