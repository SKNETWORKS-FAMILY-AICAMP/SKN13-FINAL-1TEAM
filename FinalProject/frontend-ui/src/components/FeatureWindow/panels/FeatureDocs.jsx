// ✅ FeatureDocs.jsx
/* 
  파일: frontend-ui/src/components/FeatureWindow/panels/FeatureDocs.jsx
  역할: 문서 관리 핵심 패널. 로컬 브릿지(fsBridge)를 통해 문서 목록을 조회/삭제하고,
       검색/보기 전환(그리드/리스트), "최근 파일"과 "열람한 문서" 섹션을 렌더링한다.

  LINKS:
    - 이 파일을 사용하는 곳:
      * FeatureShell.jsx (역할/라우팅에 따라 이 패널로 진입)
    - 이 파일이 사용하는 것:
      * ./Docs/Toolbar.jsx           → 상단 툴바(제목/검색/보기 전환)
      * ./Docs/Section.jsx           → 구역 래퍼(섹션 타이틀 + 내용)
      * ./Docs/DocumentGrid.jsx      → 카드형 목록 렌더
      * ./Docs/DocumentRowList.jsx   → 행형 목록 렌더
      * ./Docs/Toast.jsx             → 우하단 토스트(성공/오류/되돌리기)
      * window.fsBridge.listDocs     → 로컬 문서 목록 조회 (Electron preload에서 주입)
      * window.fsBridge.deleteDoc    → 로컬 문서 삭제
      * window.fsBridge.openDoc      → 로컬 문서 열기

  데이터 흐름(상위→하위):
    - 이 컴포넌트가 로컬 문서를 불러와(docs state) → 검색/정렬/그룹화 후
      DocumentGrid/DocumentRowList에 props로 내려 렌더링한다.
    - 삭제/열기 등 액션 핸들러(handleDelete/handleOpen)도 여기서 정의되어 자식에 전달.

  렌더 섹션:
    1) "최근 파일": 24시간 내 열람(opened_at) 또는 수정(updated_at) 기준으로 필터
    2) "열람한 문서": opened_at이 존재하는 문서를 열람 시간 순으로 정렬 후 요일/날짜별 그룹화

  주의:
    - fsBridge는 Electron 환경에서 preload로 주입되는 브릿지 객체이므로 웹 단독 실행 시 undefined일 수 있음
    - 삭제 실패 시 낙관적 업데이트 롤백(원복) 처리 포함
    - 포커스 복귀 시 자동 재로딩(윈도우 전환 후 최신 상태 유지)
*/

import React, { useEffect, useMemo, useState } from "react";
import Toolbar from "./Docs/Toolbar.jsx";
import Section from "./Docs/Section.jsx";
import DocumentGrid from "./Docs/DocumentGrid.jsx";
import DocumentRowList from "./Docs/DocumentRowList.jsx";
import Toast from "./Docs/Toast.jsx";

/* 
  로컬파일 확장자 기반으로 MIME 추정:
  - 일부 파일은 fsBridge에서 mime이 제공될 수 있으나, 미제공 시 추정값을 사용한다.
  - 추정값은 미리보기/아이콘 분기 등에서 사용될 수 있다.
*/
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

/* 
  로컬 문서 목록 조회:
  - window.fsBridge.listDocs(subdir?) 호출 → 표준화된 shape으로 매핑
  - 최신 업데이트(updated_at) 기준으로 내림차순 정렬
  - 실패/미지원 시 빈 배열 반환
*/
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

/* 
  로컬 문서 삭제:
  - window.fsBridge.deleteDoc(path) 호출
  - 성공/실패 여부를 { ok:boolean } 형태로 반환
*/
async function deleteLocalDocDirect(path) {
  if (!window.fsBridge?.deleteDoc) return { ok:false };
  try { await window.fsBridge.deleteDoc(path); return { ok:true }; }
  catch { return { ok:false }; }
}

export default function FeatureDocs() {
  // 보기 모드(grid|list), 검색어, 문서 목록, 로딩, 토스트
  const [view, setView] = useState("grid");
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  /* 문서 목록 로딩(로컬 전용):
     - 최초 마운트/재시도/포커스 복귀 시 호출 */
  const loadLocalOnly = async () => {
    setLoading(true);
    try {
      const local = await listLocalDocsDirect();
      setDocs(local);
    } finally {
      setLoading(false);
    }
  };

  // 최초 마운트 시 목록 로딩
  useEffect(() => { loadLocalOnly(); }, []);

  // 창 포커스 복귀 시 자동 재로딩(다른 창에서 파일 조작 후 최신 상태 반영)
  useEffect(() => {
    const onFocus = () => loadLocalOnly();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  /* 검색 필터:
     - query를 소문자 트림 후 title에 포함되는 문서만 필터링 */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? docs.filter(d => (d.title || "").toLowerCase().includes(q)) : docs;
  }, [docs, query]);

  /* "최근 파일" 산출:
     - 기준: opened_at과 updated_at 중 더 최근(_pivot)
     - 24시간 내(RECENT_MS) 변경/열람된 문서만 포함 */
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

  /* "열람한 문서" 산출:
     - opened_at 존재 문서만, 최근 열람 순으로 정렬 */
  const viewed = withPivot
    .filter(d => d._opened > 0)
    .sort((a,b) => b._opened - a._opened);

  /* 날짜 라벨링:
     - 오늘/어제/요일명/ISO 날짜(YYYY-MM-DD) */
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

  /* 열람 문서 그룹핑:
     - dayLabel 기준으로 Map 그룹핑 후 entries 배열 변환 */
  function groupByDay(list) {
    const map = new Map();
    for (const d of list) {
      const label = dayLabel(d._opened);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(d);
    }
    return Array.from(map.entries());
  }

  /* 문서 열기:
     - fsBridge.openDoc(path) 호출 (외부 앱/뷰어 연결)
     - 실패 처리는 fsBridge 내부에서, 여기서는 호출만 담당 */
  const handleOpen = (doc) => window.fsBridge.openDoc(doc.path);

  /* 문서 삭제:
     - 1) 낙관적 업데이트: 우선 목록에서 제거
     - 2) 실제 삭제 호출 실패 시: 원복 후 에러 토스트
     - 3) 성공 시: 성공 토스트 */
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

        {/* ⛔️ '다시 불러오기' 영역 완전 제거 */}

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
