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

import React, {
    useCallback,
    useRef,
    useEffect,
    useMemo,
    useState,
} from "react";
import Toolbar from "./Docs/Toolbar.jsx";
import Section from "./Docs/Section.jsx";
import DocumentGrid from "./Docs/DocumentGrid.jsx";
import DocumentRowList from "./Docs/DocumentRowList.jsx";
import Toast from "./Docs/Toast.jsx";
import S3Explorer from "./Docs/S3Explorer.jsx";
import UploadModal from "./Docs/UploadModal.jsx";
import useToast from "../../shared/toast/useToast.js";

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
        md: "text/markdown",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ppt: "application/vnd.ms-powerpoint",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        csv: "text/csv",
        json: "application/json",
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
        updated_at: f.updated_at, // 파일 mtime → 최신 수정 시각
        mime: f.mime || guessMime(f.name),
        source: "local",
        path: f.path,
    }));

    // 최신 수정순(내림차순).
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
  리스트 → 날짜 라벨별 그룹화
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
    const toast = useToast();
    // 모드: 'local' | 's3'
    const [mode, setMode] = useState("local");

    // 보기 전환: 'grid' | 'list'
    const [view, setView] = useState("grid");

    // 검색어
    const [query, setQuery] = useState("");

    // 로컬 문서 목록
    const [docs, setDocs] = useState([]);

    // 열람한 문서 목록
    const [viewed, setViewed] = useState([]);

    // 로딩 & 토스트
    const [loading, setLoading] = useState(true);
    // const [toast, setToast] = useState(null);

    // S3 업로드 모달
    const [showUpload, setShowUpload] = useState(false);
    const [s3CurrentPath, setS3CurrentPath] = useState("");

    const deletingRef = useRef(false);

    /* 
    로컬 문서 로드
  */
    const loadLocalOnly = useCallback(async () => {
        setLoading(true);
        try {
            // 전체 문서
            const local = await listLocalDocsDirect();
            setDocs(local);

            // 열람한 문서: IPC로 가져오기
            const recent = await window.fsBridge?.listViewed?.();
            const normalizedViewed = (recent || [])
                .map((r) => ({
                    id: `viewed:${r.path}`,
                    title: r.name,
                    path: r.path,
                    opened_at: r.lastOpenedKST,
                    _openedMs: r.msKST || 0,
                    mime: guessMime(r.name),
                    source: "local",
                }))
                .sort((a, b) => b._openedMs - a._openedMs);
            setViewed(normalizedViewed);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (mode === "local") loadLocalOnly();
    }, [mode, loadLocalOnly]);

    useEffect(() => {
        const onFocus = () => {
            if (mode === "local") loadLocalOnly();
        };
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [mode, loadLocalOnly]);

    /* 검색 필터 */
    const filtered = useMemo(() => {
        if (mode !== "local") return [];
        const q = query.trim().toLowerCase();
        return q
            ? docs.filter((d) => (d.title || "").toLowerCase().includes(q))
            : docs;
    }, [mode, docs, query]);

    /* 명령 핸들러 */
    const handleOpen = useCallback((doc) => {
        window.fsBridge?.openDoc?.(doc.path);
    }, []);

    const handleEdit = useCallback(
        async (doc) => {
            try {
                const res = await window.api?.invoke?.("fs:openSmart", {
                    name: doc.title,
                });
                if (!res) {
                    await window.fsBridge?.openDoc?.(doc.path);
                } else if (res?.mode === "notImplemented") {
                    alert(res?.reason || ".doc 내부 편집은 준비 중입니다.");
                }
                await loadLocalOnly();
            } catch (e) {
                console.error("openSmart failed:", e);
                alert("열기에 실패했습니다.");
            }
        },
        [loadLocalOnly]
    );

    const handleDelete = useCallback(
        async (doc) => {
            if (deletingRef.current) return;
            deletingRef.current = true;

            const prev = docs;
            setDocs((p) => p.filter((d) => d.id !== doc.id));
            try {
                const ok = await deleteLocalDocDirect(doc.path);
                if (!ok.ok) throw new Error("local delete failed");
                // setToast({ type: "success", msg: "로컬 문서가 삭제되었습니다." });
                toast.success("문서가 삭제되었습니다.");
            } catch {
                setDocs(prev);
                // setToast({ type: "error", msg: "삭제에 실패했습니다." });
                toast.error("문서 삭제에 실패했습니다. 다시 시도해주세요.");
            } finally {
                deletingRef.current = false;
            }
        },
        [docs]
    );

    /* 렌더 */
    // ⬇️ FeatureDocs 컴포넌트의 return(...) 전체를 아래 코드로 교체하세요.
    return (
        <section>
            <div className="mx-auto w-full max-w-[1200px] px-6">
                <div className="grid grid-cols-12 gap-6">
                    <div className="col-span-12">
                        {/* 제목 레이아웃 — FeatureCalendar와 동일 정렬 */}
                        <div className="flex items-center justify-between">
                            <h1 className="text-[22px] font-extrabold">
                                문서 목록
                            </h1>
                        </div>

                        {/* 모드 토글 — 상단에서 10px 마진으로 위치 매칭 */}
                        <div className="flex items-center gap-2 mt-10">
                            <button
                                className={`px-3 py-1.5 rounded-lg border ${
                                    mode === "local"
                                        ? "bg-gray-900 text-white"
                                        : "bg-white hover:bg-gray-50"
                                }`}
                                onClick={() => setMode("local")}
                            >
                                로컬 문서
                            </button>
                            <button
                                className={`px-3 py-1.5 rounded-lg border ${
                                    mode === "s3"
                                        ? "bg-gray-900 text-white"
                                        : "bg-white hover:bg-gray-50"
                                }`}
                                onClick={() => setMode("s3")}
                            >
                                공유 폴더(S3)
                            </button>
                            {mode === "s3" && (
                                <button
                                    className="ml-auto px-3 py-1.5 rounded-lg bg-black text-white"
                                    onClick={() => setShowUpload(true)}
                                >
                                    업로드
                                </button>
                            )}
                            {/* 로컬 전용 툴바 — Calendar의 MonthSwitcher/ViewToggle 섹션 높이 맞춰 바로 아래 배치 */}
                            {mode === "local" && (
                                <Toolbar
                                    query={query}
                                    onQueryChange={setQuery}
                                    view={view}
                                    onViewChange={setView}
                                />
                            )}
                        </div>
                        {/* 컨텐츠 컨테이너 — 좌우 패딩 제거, 위쪽만 mt-4로 Calendar와 동일 간격 */}
                        <div className="mt-4 pb-6 overflow-auto">
                            {mode === "s3" ? (
                                <S3Explorer onPrefixChange={setS3CurrentPath} />
                            ) : loading ? (
                                <div className="p-10 text-sm text-gray-500">
                                    불러오는 중…
                                </div>
                            ) : (
                                <>
                                    {/* 전체 문서 */}
                                    <Section title="전체 문서">
                                        {filtered.length > 0 ? (
                                            view === "grid" ? (
                                                <DocumentGrid
                                                    docs={filtered}
                                                    onOpen={handleOpen}
                                                    onEdit={handleEdit}
                                                    onDelete={handleDelete}
                                                />
                                            ) : (
                                                <DocumentRowList
                                                    docs={filtered}
                                                    onOpen={handleOpen}
                                                    onEdit={handleEdit}
                                                    onDelete={handleDelete}
                                                />
                                            )
                                        ) : (
                                            <div className="text-sm text-gray-400">
                                                표시할 문서가 없습니다.
                                            </div>
                                        )}
                                    </Section>

                                    {/* 열람한 문서 */}
                                    <Section title="열람한 문서">
                                        {groupByDay(
                                            viewed,
                                            (d) => d._openedMs
                                        ).map(([label, items]) => (
                                            <div key={label} className="mb-6">
                                                <div className="text-xs font-semibold text-gray-500 mb-2">
                                                    {label}
                                                </div>
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
                                            <div className="text-sm text-gray-400">
                                                열람한 문서가 없습니다.
                                            </div>
                                        )}
                                    </Section>
                                </>
                            )}
                        </div>

                        {/* 업로드 모달은 동일 위치 유지 (컨테이너 내부 하단) */}
                        <UploadModal
                            open={showUpload}
                            onClose={() => setShowUpload(false)}
                            pathHint={s3CurrentPath}
                            onUploaded={() =>
                                window.dispatchEvent(
                                    new CustomEvent("s3:refresh")
                                )
                            }
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
