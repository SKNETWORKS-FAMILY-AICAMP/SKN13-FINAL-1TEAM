/* 
  파일: frontend-ui/src/components/FeatureWindow/panels/FeatureDocs.jsx
  역할: 문서 관리 핵심 패널. 로컬 브릿지(fsBridge) 기반 "로컬 문서"와
       공유 폴더(S3) 탐색을 하나의 화면에서 제공한다.

  렌더 섹션(로컬):
    1) "최근 파일"    : 24시간 내 (opened_at vs updated_at) 중 더 최근이 존재하는 항목
    2) "전체 문서"    : updated_at 기준 (앱에서 열지 않아도 보임)
    3) "열람한 문서"  : opened_at 기준 (최근 열람 순 정렬, 날짜 그룹화)

  주의:
    - fsBridge는 Electron preload에서 주입. 웹 단독 실행에서는 undefined일 수 있음.
    - 삭제는 낙관적 업데이트 적용, 실패 시 롤백.
    - 창 포커스 복귀 시 자동 새로고침으로 외부 변경 반영.
    - S3 모드의 업로드 버튼은 UploadModal을 통해 동작.
*/

import React, { useCallback, useRef, useEffect, useMemo, useState } from "react";
import Toolbar from "./Docs/Toolbar.jsx";
import Section from "./Docs/Section.jsx";
import DocumentGrid from "./Docs/DocumentGrid.jsx";
import DocumentRowList from "./Docs/DocumentRowList.jsx";
import Toast from "./Docs/Toast.jsx";
import S3Explorer from "./Docs/S3Explorer.jsx";
import UploadModal from "./Docs/UploadModal.jsx";

/* 
  확장자 → MIME 추정 (fsBridge가 mime을 주지 않는 경우 대비)
*/
function guessMime(filename = "") {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    hwp: "application/x-hwp",
    hwpx: "application/hanwha-hwpx",
    txt: "text/plain",
    md:  "text/markdown",
    xls: "application/vnd.ms-excel",
    xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv",
    json:"application/json",
  };
  return map[ext] || "application/octet-stream";
}

/* 
  로컬 문서 목록 조회:
   - window.fsBridge.listDocs(subdir?)을 호출해 전체 파일을 받아온다.
   - 표준화(normalized) 후 updated_at 기준 내림차순 정렬.
   - 앱을 통하지 않은 외부 변경(복사/다운로드/수정)도 updated_at으로 즉시 반영.
*/
async function listLocalDocsDirect(subdir = "") {
  if (!window.fsBridge?.listDocs) return [];
  const items = await window.fsBridge.listDocs(subdir);

  const normalized = (items || []).map((f) => ({
    id: `local:${f.path}`,
    title: f.name,
    updated_at: f.updated_at,           // 파일 mtime → 최신 수정 시각
    opened_at: f.opened_at || null,     // 앱 열람 기록(있을 수도, 없을 수도)
    mime: f.mime || guessMime(f.name),
    source: "local",
    path: f.path,
  }));

  // 최신 수정순(내림차순). opened_at 유무와 무관하게 "전체 파일"을 보장함.
  normalized.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return normalized;
}

/* 
  로컬 문서 삭제 (낙관적 업데이트 사용)
*/
async function deleteLocalDocDirect(path) {
  if (!window.fsBridge?.deleteDoc) return { ok: false };
  try {
    await window.fsBridge.deleteDoc(path);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/* 
  날짜 라벨 (오늘/어제/한국식 YYYY-MM-DD)
  - 리스트 날짜 그룹화에서 공통 사용
*/
function dayLabel(ts) {
  const dt = new Date(ts || 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const base = new Date(dt);
  base.setHours(0, 0, 0, 0);

  const diffDays = Math.round((today - base) / 86400000);
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";

  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* 
  리스트 → 날짜 라벨별 그룹화 (라벨: 문자열, items: 문서 배열)
*/
function groupByDay(list, getTs) {
  const map = new Map();
  for (const d of list) {
    const ts = getTs(d);
    const label = dayLabel(ts);
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(d);
  }
  return Array.from(map.entries());
}

/* 
  메인 컴포넌트
*/
export default function FeatureDocs() {
  // 모드: 'local' | 's3'
  const [mode, setMode] = useState("local");

  // 보기 전환(로컬만): 'grid' | 'list'
  const [view, setView] = useState("grid");

  // 검색어(로컬만)
  const [query, setQuery] = useState("");

  // 로컬 문서 목록
  const [docs, setDocs] = useState([]);

  // 로딩 & 토스트
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // S3 업로드 모달
  const [showUpload, setShowUpload] = useState(false);
  
  // S3 현재 경로 상태
  const [s3CurrentPath, setS3CurrentPath] = useState("");

  // 삭제 중 여부(연속 실행 방지)
  const deletingRef = useRef(false);

  /* 
    로컬 문서 로드(최초/포커스 복귀/수동 리로드)
  */
  const loadLocalOnly = useCallback(async () => {
    setLoading(true);
    try {
      const local = await listLocalDocsDirect();
      setDocs(local);
    } finally {
      setLoading(false);
    }
  }, []);

  // 모드 진입 시 로드
  useEffect(() => {
    if (mode === "local") loadLocalOnly();
  }, [mode, loadLocalOnly]);

  // 창 포커스 복귀 시 자동 재로딩(외부 변경 반영)
  useEffect(() => {
    const onFocus = () => { if (mode === "local") loadLocalOnly(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [mode, loadLocalOnly]);

  /* 
    검색 필터 (로컬):
     - 제목에 query 포함 여부로 필터링
  */
  const filtered = useMemo(() => {
    if (mode !== "local") return [];
    const q = query.trim().toLowerCase();
    return q
      ? docs.filter((d) => (d.title || "").toLowerCase().includes(q))
      : docs;
  }, [mode, docs, query]);

  /*
    최근 파일 섹션 (24시간)
     - opened_at vs updated_at 중 더 최근 값을 _pivot으로 둬서 판단
     - 24시간 내의 것만 최근 파일로 노출
  */
  const now = Date.now();
  const RECENT_MS = 24 * 60 * 60 * 1000;

  const withPivot = useMemo(() => {
    return filtered.map((d) => {
      const opened = d.opened_at ? new Date(d.opened_at).getTime() : 0;
      const updated = d.updated_at ? new Date(d.updated_at).getTime() : 0;
      return { ...d, _pivot: Math.max(opened, updated), _opened: opened, _updated: updated };
    });
  }, [filtered]);

  const recentFiles = useMemo(() => {
    return withPivot
      .filter((d) => (now - d._pivot) <= RECENT_MS)
      .sort((a, b) => b._pivot - a._pivot);
  }, [withPivot, now]);

  /*
    전체 문서 섹션
     - 앱 열람 여부와 무관하게 updated_at 기준으로 그룹/정렬
  */
  const allDocs = useMemo(() => {
    // 이미 listLocalDocsDirect에서 updated_at 내림차순 정렬됨.
    // 여기서는 _updated 타임스탬프 보조 필드만 추가.
    return filtered.map((d) => ({ ...d, _updated: d.updated_at ? new Date(d.updated_at).getTime() : 0 }));
  }, [filtered]);

  /*
    열람한 문서 섹션
     - opened_at 존재하는 문서만 대상으로 최근 열람순 정렬 후 그룹화
  */
  const viewed = useMemo(() => {
    return withPivot
      .filter((d) => d._opened > 0)
      .sort((a, b) => b._opened - a._opened);
  }, [withPivot]);

  /* 
    명령 핸들러: 열기/수정/삭제
  */

  // 문서 열기(외부 프로그램으로 열기)
  const handleOpen = useCallback((doc) => {
    window.fsBridge?.openDoc?.(doc.path);
  }, []);

  // 수정하기(스마트 열기 → 없으면 외부 열기)
  const handleEdit = useCallback(async (doc) => {
    try {
      const res = await window.api?.invoke?.("fs:openSmart", { name: doc.title });
      if (!res) {
        // preload에서 window.api.invoke 없거나, 핸들링 실패 → 외부 열기 폴백
        await window.fsBridge?.openDoc?.(doc.path);
      } else if (res?.mode === "notImplemented") {
        alert(res?.reason || ".doc 내부 편집은 준비 중입니다.");
      }
      // 열람기록/수정시각 반영 재로딩
      await loadLocalOnly();
    } catch (e) {
      console.error("openSmart failed:", e);
      alert("열기에 실패했습니다.");
    }
  }, [loadLocalOnly]);

  // 삭제(낙관적 업데이트 + 실패 시 롤백)
  const handleDelete = useCallback(async (doc) => {
    // 더블클릭/연속 클릭 방어
    if (deletingRef.current) return;
    deletingRef.current = true;

    const prev = docs;
    setDocs((p) => p.filter((d) => d.id !== doc.id));
    try {
      const ok = await deleteLocalDocDirect(doc.path);
      if (!ok.ok) throw new Error("local delete failed");
      setToast({ type: "success", msg: "로컬 문서가 삭제되었습니다." });
    } catch (e) {
      // 롤백 + 에러 토스트
      setDocs(prev);
      setToast({ type: "error", msg: "삭제에 실패했습니다." });
    } finally {
      // 🔓 락 해제 (성공/실패 모두)
      deletingRef.current = false;
    }
  }, [docs]);

  /* 
    렌더
  */
  return (
    <div className="flex h-full">
      <div className="flex-1 bg-gray-50 flex flex-col">

        {/* 모드 토글 (좌측 상단) */}
        <div className="flex items-center gap-2 px-4 pt-4">
          <button
            className={`px-3 py-1.5 rounded-lg border ${mode === "local" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-50"}`}
            onClick={() => setMode("local")}
            aria-pressed={mode === "local"}
            title="로컬 문서 보기"
          >
            로컬 문서
          </button>

          <button
            className={`px-3 py-1.5 rounded-lg border ${mode === "s3" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-50"}`}
            onClick={() => setMode("s3")}
            aria-pressed={mode === "s3"}
            title="공유 폴더(S3) 보기"
          >
            공유 폴더(S3)
          </button>

          {/* S3 업로드 버튼 (우측 정렬) */}
          {mode === "s3" && (
            <button
              className="ml-auto px-3 py-1.5 rounded-lg bg-black text-white"
              onClick={() => setShowUpload(true)}
              title="S3 업로드"
            >
              업로드
            </button>
          )}
        </div>

        {/* 로컬 모드 상단 툴바 */}
        {mode === "local" && (
          <Toolbar
            title="문서 목록"
            query={query}
            onQueryChange={setQuery}
            view={view}
            onViewChange={setView}
          />
        )}

        {/* 본문 */}
        <div className="px-4 pb-6 overflow-auto">
          {mode === "s3" ? (
            <S3Explorer onPrefixChange={setS3CurrentPath} />
          ) : loading ? (
            <div className="p-10 text-sm text-gray-500">불러오는 중…</div>
          ) : (
            <>
              {/* 전체 문서 (앱 열람 여부와 무관) */}
              <Section title="전체 문서">
                {groupByDay(allDocs, (d) => d._updated).map(([label, items]) => (
                  <div key={label} className="mb-6">
                    <div className="text-xs font-semibold text-gray-500 mb-2">{label}</div>
                    {view === "grid" ? (
                      <DocumentGrid
                        docs={items}
                        onOpen={handleOpen}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ) : (
                      <DocumentRowList
                        docs={items}
                        onOpen={handleOpen}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    )}
                  </div>
                ))}
                {allDocs.length === 0 && (
                  <div className="text-sm text-gray-400">표시할 문서가 없습니다.</div>
                )}
              </Section>

              {/* 열람한 문서 (최근 열람 순) */}
              <Section title="열람한 문서">
                {groupByDay(viewed, (d) => d._opened).map(([label, items]) => (
                  <div key={label} className="mb-6">
                    <div className="text-xs font-semibold text-gray-500 mb-2">{label}</div>
                    {view === "grid" ? (
                      <DocumentGrid
                        docs={items}
                        onOpen={handleOpen}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ) : (
                      <DocumentRowList
                        docs={items}
                        onOpen={handleOpen}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    )}
                  </div>
                ))}
                {viewed.length === 0 && (
                  <div className="text-sm text-gray-400">열람한 문서가 없습니다.</div>
                )}
              </Section>
            </>
          )}
        </div>

        {/* 업로드 모달 (S3 전용) */}
        <UploadModal
          open={showUpload}
          onClose={() => setShowUpload(false)}
          pathHint={s3CurrentPath}  
          onUploaded={() => {
            // 업로드 완료 후 S3 목록 새로고침 이벤트 (S3Explorer에서 수신)
            window.dispatchEvent(new CustomEvent("s3:refresh"));
          }}
        />

        {/* 우측 하단 토스트 */}
        <Toast toast={toast} onClose={() => setToast(null)} />
      </div>
    </div>
  );
}
