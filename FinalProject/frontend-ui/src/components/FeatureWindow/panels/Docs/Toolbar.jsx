// ✅ 파일: frontend-ui/src/components/FeatureWindow/panels/Docs/Toolbar.jsx
// 순수 UI: 제목, 검색, 보기 전환, 업로드 버튼
import ViewToggle from "./ViewToggle.jsx";

export default function Toolbar({ title, query, onQueryChange, view, onViewChange, onUpload }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="문서를 검색하세요"
          className="w-72 rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
        />
        <ViewToggle value={view} onChange={onViewChange} />
        <button className="rounded-xl border px-3 py-2 text-sm" onClick={onUpload}>
          + 업로드 또는 새로 작성
        </button>
      </div>
    </div>
  );
}
