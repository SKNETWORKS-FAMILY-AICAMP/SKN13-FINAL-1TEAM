// ✅ 파일: frontend-ui/src/components/FeatureWindow/panels/Docs/Toolbar.jsx
// 순수 UI: 제목, 검색, 보기 전환, 업로드 버튼
import ViewToggle from "./ViewToggle.jsx";

export default function Toolbar({
    title,
    query,
    onQueryChange,
    view,
    onViewChange,
    onUpload,
}) {
    return (
        <div className="flex items-center justify-between gap-3 ml-auto">
            <div className="flex items-center gap-3">
                <input
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder="문서를 검색하세요"
                    className="w-72 rounded-xl border px-3 py-2 text-[14px] outline-none focus:outline-none"
                />
                <ViewToggle value={view} onChange={onViewChange} />
            </div>
        </div>
    );
}
