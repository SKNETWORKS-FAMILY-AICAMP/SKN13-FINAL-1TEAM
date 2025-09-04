/* 
  파일: src/components/Toast/ToastMessage.jsx (가정 경로)
  역할: 전역 토스트(알림) 시스템. Provider로 애플리케이션을 감싸면 어디서든 useToast()로 토스트를 띄울 수 있다.

  LINKS:
    - 이 파일을 사용하는 곳:
      * App 루트(또는 FeatureShell 등)에서 <ToastProvider>로 감싸기
      * 임의 컴포넌트: const { addToast } = useToast(); addToast({ type:'success', message:'저장 완료' })
    - 이 파일이 사용하는 것:
      * React Context/State/Effect 유틸

  구조/흐름:
    1) ToastContext: 전역 컨텍스트. addToast, remove를 노출한다.
    2) ToastProvider: toasts 상태 배열 관리. addToast 호출 시 id 생성 → 배열에 push → duration 후 자동 remove.
    3) ToastItem: 단일 토스트의 프레젠테이션 컴포넌트. type에 따라 스타일(성공/에러/정보) 분기.
*/

import React, { createContext, useContext, useMemo, useState } from "react";

/* 
  ToastContext
  목적: 전역에서 addToast/remove를 접근하기 위한 컨텍스트.
  비고: Provider 외부에서 useToast를 호출하면 예외를 던져 사용 실수를 조기에 발견하도록 한다.
*/
const ToastContext = createContext(null);

/* 
  useToast()
  목적: 어디서든 토스트를 올리기 위한 훅.
  사용:
    const { addToast } = useToast();
    addToast({ type:'success', message:'저장 완료', duration: 2000 });
  반환:
    - { addToast, remove }
*/
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* 
  ToastProvider({ children })
  목적: 전역 토스트 상태를 보유하고 렌더링하는 Provider.
  상태:
    - toasts: { id, message, type, duration }[]
  내부 함수:
    - remove(id): 해당 토스트를 배열에서 제거
    - addToast({ message, type='info', duration=2000 }): 토스트 추가 후 duration 경과 시 자동 제거
  렌더:
    - children을 감싸고, 오른쪽 하단 고정 컨테이너에 ToastItem 스택을 렌더
*/
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  /* remove: 특정 토스트를 닫는다 */
  const remove = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  /* 
    addToast({ message, type, duration })
    목적: 새 토스트를 생성/표시하고, duration 이후 자동으로 제거한다.
    세부:
      - id: crypto.randomUUID() 지원 시 UUID, 아니면 타임스탬프 기반 대체 키
      - type: 'success' | 'error' | 'info'
      - duration: 밀리초. 기본 2000ms
    반환:
      - 생성된 토스트 id (필요 시 외부에서 수동 remove 가능)
  */
  const addToast = ({ message, type = "info", duration = 2000 }) => {
    const id = crypto.randomUUID?.() || String(Date.now() + Math.random());
    const toast = { id, message, type, duration };
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => remove(id), duration);
    return id;
  };

  /* value 메모이제이션: 컨텍스트 객체의 참조가 불필요하게 바뀌지 않도록 */
  const value = useMemo(() => ({ addToast, remove }), []);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* 우하단 컨테이너: 세로 스택으로 토스트 나열 */}
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

/* 
  ToastItem({ toast, onClose })
  목적: 단일 토스트의 시각적 표현. 타입별 배경/색상 차등.
  인자:
    - toast: { message, type } 
    - onClose: 수동 닫기 콜백
  비고:
    - 접근성: 버튼에 aria-label="닫기" 지정
*/
function ToastItem({ toast, onClose }) {
  const { message, type } = toast;

  const base =
    "min-w-[280px] max-w-[360px] px-5 py-3 rounded-full shadow-lg " +
    "flex items-center justify-between";

  /* type별 스타일 테이블 */
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
        {/* × 아이콘 (벡터: 선 교차) */}
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
