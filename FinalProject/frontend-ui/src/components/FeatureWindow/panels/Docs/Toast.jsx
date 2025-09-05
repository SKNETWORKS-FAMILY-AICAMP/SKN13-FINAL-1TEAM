// ✅ 파일: frontend-ui/src/components/FeatureWindow/panels/Docs/Toast.jsx
export default function Toast({ toast, onClose }) {
  if (!toast) return null;
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