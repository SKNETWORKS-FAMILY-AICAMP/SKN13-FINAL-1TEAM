// ✅ 파일: frontend-ui/src/components/FeatureWindow/panels/Docs/ViewToggle.jsx
export default function ViewToggle({ value, onChange }) {
  return (
    <div className="flex items-center rounded-xl border overflow-hidden">
      <button
        className={`px-3 py-2 text-sm ${value === "grid" ? "bg-gray-100" : ""}`}
        onClick={() => onChange("grid")}
        aria-label="그리드 보기"
      >▦</button>
      <button
        className={`px-3 py-2 text-sm ${value === "list" ? "bg-gray-100" : ""}`}
        onClick={() => onChange("list")}
        aria-label="리스트 보기"
      >☰</button>
    </div>
  );
}
