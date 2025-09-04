/* 
  파일: frontend-ui/src/components/FeatureWindow/panels/Docs/Toast.jsx
  역할: 우하단 토스트 알림. 성공/오류 메시지와 "되돌리기" 액션(옵션)을 지원.

  LINKS:
    - 이 파일을 사용하는 곳:
      * FeatureDocs.jsx (파일 삭제/이름변경 등 사용자 액션 피드백)
    - 이 파일이 사용하는 것: (없음)

  상호작용(부모 ↔ 자식):
    - props.toast: { type: "error" | (기타), msg, undo? }
    - props.onClose(): 토스트 닫기 콜백
    - toast.undo(): 제공 시 "되돌리기" 클릭으로 실행 후 onClose 호출
*/

export default function Toast({ toast, onClose }) {
  if (!toast) return null; // 토스트 없으면 렌더링 안함
  return (
    <div className="fixed bottom-4 right-4 rounded-xl shadow px-4 py-3 text-sm bg-white border">
      <div className="flex items-center gap-3">
        <span className={toast.type === "error" ? "text-red-600" : "text-green-600"}>{toast.msg}</span>
        {toast.undo && <button className="underline" onClick={() => { toast.undo?.(); onClose?.(); }}>되돌리기</button>}
        <button className="opacity-60" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
