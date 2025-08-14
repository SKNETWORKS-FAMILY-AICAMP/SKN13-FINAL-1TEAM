// ✅ 파일: frontend-ui/src/components/FeatureWindow/panels/Docs/DocumentRowList.jsx
// 리스트 전용 (표현)
import OverflowMenu from "./OverflowMenu.jsx";
import { formatDistanceToNow } from "./parts/time.js";

export default function DocumentRowList({ docs, onDelete }) {
  if (!docs.length) {
    return <div className="rounded-xl border border-dashed p-8 text-sm text-gray-400">표시할 문서가 없습니다.</div>;
  }
  return (
    <div className="flex flex-col divide-y rounded-xl border bg-white">
      {docs.map(d => (
        <div key={d.id} className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-10 rounded-lg border grid place-items-center text-[10px] font-bold">
              {d.mime?.includes("word") ? "DOC" : (d.mime?.includes("sheet") || d.mime?.includes("spreadsheet")) ? "XLS" : "FILE"}
            </div>
            <div className="min-w-0">
              <div className="truncate">{d.title || "제목 없음"}</div>
              <div className="text-xs text-gray-500">{formatDistanceToNow(d.updated_at)} 수정</div>
            </div>
          </div>
          <OverflowMenu onDelete={() => onDelete(d)} />
        </div>
      ))}
    </div>
  );
}
