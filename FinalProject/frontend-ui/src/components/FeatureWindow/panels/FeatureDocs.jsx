// ✅ 파일: frontend-ui/src/components/FeatureWindow/panels/FeatureDocs.jsx
// 역할: 문서 목록 페이지의 "컨테이너" (상태/이벤트/데이터패칭 모두 여기서 처리)
// Docs/* 는 모두 "표현용" 컴포넌트만 가지고, 로직은 갖지 않음.
import React, { useEffect, useMemo, useState } from "react";

// 표현 컴포넌트
import Toolbar from "./Docs/Toolbar.jsx";
import Section from "./Docs/Section.jsx";
import DocumentGrid from "./Docs/DocumentGrid.jsx";
import DocumentRowList from "./Docs/DocumentRowList.jsx";
import Toast from "./Docs/Toast.jsx";

// 서비스
import { listDocuments, createDocumentMeta, removeDocument, restoreDocument } from "../../services/documentsApi.js";
import { uploadChatbotFilePresigned } from "../../services/uploadPresigned.js";

export default function FeatureDocs() {
  const [view, setView] = useState("grid"); // 'grid' | 'list'
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null); // {type, msg, undo?}

  // 초기 로드
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await listDocuments({ limit: 200, sort: "-updated_at" });
        setDocs(res);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 검색 필터
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? docs.filter(d => (d.title || "").toLowerCase().includes(q)) : docs;
  }, [docs, query]);

  // 섹션 분리: 오늘 편집 / 최근
  const now = new Date();
  const todayEdited = filtered.filter(d => (now - new Date(d.updated_at)) <= 24*60*60*1000);
  const recent = filtered.filter(d => (now - new Date(d.updated_at)) > 24*60*60*1000);

  // 삭제(낙관적) + 되돌리기
  const handleDelete = async (doc) => {
    const prev = docs;
    setDocs(docs.filter(d => d.id !== doc.id));
    try {
      await removeDocument(doc.id);
      setToast({ type: "success", msg: "문서가 삭제되었습니다.", undo: async () => {
        await restoreDocument(doc.id); setDocs(prev);
      }});
    } catch {
      setDocs(prev);
      setToast({ type: "error", msg: "삭제에 실패했습니다." });
    }
  };

  // 프리사인드 업로드 → 메타등록 → 목록 갱신
  const handleUpload = async () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "*/*";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const { fileUrl } = await uploadChatbotFilePresigned(file, { sessionId: "doc-upload" });
        await createDocumentMeta({ title: file.name, url: fileUrl, mime: file.type || "application/octet-stream" });
        const fresh = await listDocuments({ limit: 200, sort: "-updated_at" });
        setDocs(fresh);
        setToast({ type: "success", msg: "업로드 완료" });
      } catch (e) {
        setToast({ type: "error", msg: `업로드 실패: ${e.message}` });
      }
    };
    input.click();
  };

  return (
    <div className="flex h-full">
      {/* 사이드바는 외부 컴포넌트 사용 예정, 여기서는 본문만 */}
      <div className="flex-1 bg-gray-50 flex flex-col">
        <Toolbar
          title="문서 목록"
          query={query}
          onQueryChange={setQuery}
          view={view}
          onViewChange={setView}
          onUpload={handleUpload}
        />

        <div className="px-4 pb-6 overflow-auto">
          {loading ? (
            <div className="p-10 text-sm text-gray-500">불러오는 중…</div>
          ) : (
            <>
              <Section title="오늘 편집">
                {view === "grid"
                  ? <DocumentGrid docs={todayEdited} onDelete={handleDelete} />
                  : <DocumentRowList docs={todayEdited} onDelete={handleDelete} />}
              </Section>

              <Section title="최근">
                {view === "grid"
                  ? <DocumentGrid docs={recent} onDelete={handleDelete} />
                  : <DocumentRowList docs={recent} onDelete={handleDelete} />}
              </Section>
            </>
          )}
        </div>

        <Toast toast={toast} onClose={() => setToast(null)} />
      </div>
    </div>
  );
}
