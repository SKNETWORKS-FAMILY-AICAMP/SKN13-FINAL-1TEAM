// ✅ 파일: frontend-ui/src/components/FeatureWindow/panels/Docs/DocumentGrid.jsx
// 카드 그리드 전용 (표현)
import OverflowMenu from "./OverflowMenu.jsx";
import { formatDistanceToNow } from "./parts/time.js";

export default function DocumentGrid({ docs, onDelete }) {
  if (!docs.length) {
    return <Empty />;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {docs.map(d => (
        <div key={d.id} className="group relative rounded-2xl border p-3 hover:shadow-sm bg-white">
          <div className="flex items-start gap-3">
            <FileIcon mime={d.mime} />
            <div className="min-w-0">
              <div className="truncate font-medium">{d.title || "제목 없음"}</div>
              <div className="text-xs text-gray-500 truncate">{formatDistanceToNow(d.updated_at)} 수정</div>
            </div>
          </div>
          <div className="absolute top-2 right-2">
            <OverflowMenu onDelete={() => onDelete(d)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return <div className="rounded-xl border border-dashed p-8 text-sm text-gray-400">표시할 문서가 없습니다.</div>;
}

function FileIcon({ mime }) {
  const label = mime?.includes("word") ? "DOC" : (mime?.includes("sheet") || mime?.includes("spreadsheet")) ? "XLS" : "FILE";
  return <div className="w-10 h-12 rounded-xl border grid place-items-center text-xs font-bold">{label}</div>;
}
