// frontend-ui/src/components/FeatureWindow/panels/FeatureDocs.jsx
import React, { useEffect, useMemo, useState } from "react";
import Toolbar from "./Docs/Toolbar.jsx";
import Section from "./Docs/Section.jsx";
import DocumentGrid from "./Docs/DocumentGrid.jsx";
import DocumentRowList from "./Docs/DocumentRowList.jsx";
import Toast from "./Docs/Toast.jsx";

// ───────── 로컬(fsBridge) 전용 유틸 ─────────
function guessMime(filename = "") {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map = {
    pdf:"application/pdf", doc:"application/msword",
    docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    hwp:"application/x-hwp", hwpx:"application/hanwha-hwpx",
    txt:"text/plain", md:"text/markdown",
    xls:"application/vnd.ms-excel",
    xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt:"application/vnd.ms-powerpoint",
    pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv:"text/csv", json:"application/json",
  };
  return map[ext] || "application/octet-stream";
}

async function listLocalDocsDirect(subdir = "") {
  if (!window.fsBridge?.listDocs) return [];
  const items = await window.fsBridge.listDocs(subdir);
  const normalized = (items || []).map((f) => ({
    id: `local:${f.path}`,
    title: f.name,
    updated_at: f.updated_at,
    opened_at: f.opened_at || null,
    mime: f.mime || guessMime(f.name),
    source: "local",
    path: f.path,
  }));
  normalized.sort((a,b)=> (a.updated_at < b.updated_at ? 1 : -1));
  return normalized;
}

async function deleteLocalDocDirect(path) {
  if (!window.fsBridge?.deleteDoc) return { ok:false };
  try { await window.fsBridge.deleteDoc(path); return { ok:true }; }
  catch { return { ok:false }; }
}

export default function FeatureDocs() {
  const [view, setView] = useState("grid");
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const loadLocalOnly = async () => {
    setLoading(true);
    try {
      const local = await listLocalDocsDirect();
      setDocs(local);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLocalOnly(); }, []);

  // 포커스 복귀 시 자동 재로딩
  useEffect(() => {
    const onFocus = () => loadLocalOnly();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // 검색 필터
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? docs.filter(d => (d.title || "").toLowerCase().includes(q)) : docs;
  }, [docs, query]);

  // 최근 파일(24h 내 '열람' 또는 '수정')
  const now = Date.now();
  const RECENT_MS = 24 * 60 * 60 * 1000;
  const withPivot = filtered.map(d => {
    const opened = d.opened_at ? new Date(d.opened_at).getTime() : 0;
    const updated = d.updated_at ? new Date(d.updated_at).getTime() : 0;
    return { ...d, _pivot: Math.max(opened, updated), _opened: opened };
  });
  const recentFiles = withPivot
    .filter(d => (now - d._pivot) <= RECENT_MS)
    .sort((a,b) => b._pivot - a._pivot);

  // 열람한 문서: 열람 순 + 요일 그룹
  const viewed = withPivot
    .filter(d => d._opened > 0)
    .sort((a,b) => b._opened - a._opened);

  function dayLabel(ts) {
    const dt = new Date(ts);
    const today = new Date(); today.setHours(0,0,0,0);
    const that = new Date(dt); that.setHours(0,0,0,0);
    const diffDays = Math.round((today - that) / 86400000);
    if (diffDays === 0) return '오늘';
    if (diffDays === 1) return '어제';
    const w = ['일','월','화','수','목','금','토'][dt.getDay()];
    if (diffDays <= 6) return `${w}요일`;
    return dt.toISOString().slice(0,10);
  }
  function groupByDay(list) {
    const map = new Map();
    for (const d of list) {
      const label = dayLabel(d._opened);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(d);
    }
    return Array.from(map.entries());
  }

  const handleOpen = (doc) => window.fsBridge.openDoc(doc.path);
  const handleDelete = async (doc) => {
    const prev = docs;
    setDocs(docs.filter(d => d.id !== doc.id));
    try {
      const ok = await deleteLocalDocDirect(doc.path);
      if (!ok.ok) throw new Error("local delete failed");
      setToast({ type: "success", msg: "로컬 문서가 삭제되었습니다." });
    } catch {
      setDocs(prev);
      setToast({ type: "error", msg: "삭제에 실패했습니다." });
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 bg-gray-50 flex flex-col">
        <Toolbar
          title="문서 목록"
          query={query}
          onQueryChange={setQuery}
          view={view}
          onViewChange={setView}
        />

        <div className="px-4 pb-6 overflow-auto">
          {loading ? (
            <div className="p-10 text-sm text-gray-500">불러오는 중…</div>
          ) : (
            <>
              {/* 최근 파일 (24h 내 열람/수정) */}
              <Section title="최근 파일">
                {view === "grid"
                  ? <DocumentGrid docs={recentFiles} onOpen={handleOpen} onDelete={handleDelete} />
                  : <DocumentRowList docs={recentFiles} onOpen={handleOpen} onDelete={handleDelete} />}
              </Section>

              {/* 열람한 문서 (열람 순 + 요일 그룹) */}
              <Section title="열람한 문서">
                {groupByDay(viewed).map(([label, items]) => (
                  <div key={label} className="mb-6">
                    <div className="text-xs font-semibold text-gray-500 mb-2">{label}</div>
                    {view === "grid"
                      ? <DocumentGrid docs={items} onOpen={handleOpen} onDelete={handleDelete} />
                      : <DocumentRowList docs={items} onOpen={handleOpen} onDelete={handleDelete} />}
                  </div>
                ))}
                {viewed.length === 0 && <div className="text-sm text-gray-400">열람한 문서가 없습니다.</div>}
              </Section>
            </>
          )}
        </div>

        <Toast toast={toast} onClose={() => setToast(null)} />
      </div>
    </div>
  );
}
