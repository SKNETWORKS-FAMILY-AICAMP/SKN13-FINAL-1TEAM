/* 
  파일: src/components/FeatureWindow/panels/Docs/S3Explorer.jsx
  역할:
   - 공유 폴더(S3) 탐색기 UI
   - 브레드크럼(경로 표시) + 현재 폴더의 직계 자식만 표시(손자 이하 차단)
   - 캐싱: 현재 경로 체인(조상~현재)만 유지, 다른 경로 캐시는 제거 (메모리 과부하 방지)
   - 파일 열기: S3 → 로컬 고정 폴더에 다운로드 후 OS 기본 프로그램으로 실행
  사용처:
   - FeatureDocs.jsx 에서 mode === 's3' 일 때 렌더링

  변경점:
   - services/s3Api.js import 제거
   - preload 브릿지 window.s3Shared(list / downloadAndOpen) 직접 사용
   - 업로드 완료 이벤트(s3:refresh) 수신해 현재 prefix 재로딩
*/

import React, { useEffect, useMemo, useState } from "react";

// 브레드크럼 유틸: prefix → ["documents","sub","folder"]
function splitBreadcrumb(prefix) {
  return (prefix || "").split("/").filter(Boolean);
}

// (선택) 임시/시스템 파일 숨김용 유틸
function isTempOrSystemName(name) {
  const lower = String(name || "").toLowerCase().trim();
  if (!lower) return false;
  if (lower.startsWith("~$")) return true;                 // Office 잠금
  if (lower.startsWith("._")) return true;                 // macOS resource fork
  if (lower === "thumbs.db" || lower === "desktop.ini") return true;
  if (lower === ".ds_store" || lower === ".dsstore") return true;
  if (lower.endsWith(".tmp") || lower.endsWith(".temp")) return true;
  if (lower.endsWith(".crdownload") || lower.endsWith(".part")) return true;
  return false;
}

// ✅ KEY에 포함된 타임스탬프 접두사(예: 1757575714855-파일명.ext) 제거 → 표시/저장용 "문서 제목" 생성
function prettyName(raw) {
  const base = String(raw || "").split("/").pop();     // 키에서 파일명만 추출
  // 10자리 이상 숫자 + 구분자(- 또는 _) 접두사 제거
  const cleaned = base.replace(/^\d{10,}[-_]+/, "");
  return cleaned || base;
}

export default function S3Explorer({ onPrefixChange }) {
  // 현재 prefix (빈 문자열이면 루트)
  const [prefix, setPrefix] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 캐시: Map<prefix, {folders, files}>
  const [cache, setCache] = useState(new Map());
  const [data, setData] = useState({ folders: [], files: [] });

  // 🔧 캐시 정리: 새 prefix로 이동하면 조상~현재 경로만 유지
  function pruneCacheToPath(nextPrefix) {
    const keep = new Set([""]);
    let acc = "";
    for (const c of splitBreadcrumb(nextPrefix)) {
      acc += `${c}/`;
      keep.add(acc);
    }
    setCache(prev => {
      const m = new Map();
      for (const [k, v] of prev.entries()) {
        if (keep.has(k)) m.set(k, v);
      }
      return m;
    });
  }

  // 🔧 특정 prefix 로드 (window.s3Shared 브릿지 사용)
  async function load(pfx) {
    setLoading(true);
    setError("");

    // 브릿지 존재 확인
    if (!window.s3Shared?.list || !window.s3Shared?.downloadAndOpen) {
      setLoading(false);
      setError("S3 브릿지가 감지되지 않았습니다. (preload 연결 확인)");
      return;
    }

    try {
      // 캐시에 있으면 먼저 표시(UX용)
      const cached = cache.get(pfx);
      if (cached) setData(cached);

      // 메인 프로세스 IPC → 실제 버킷 호출
      const out = await window.s3Shared.list(pfx);

      // 폴더/파일 (임시/시스템 파일은 UI에서 숨김)
      const folders = (out?.folders || []).filter(f => !!f);
      const filesRaw = (out?.files || []).filter(f => !!f);
      // ✅ 목록 표시/저장용 displayName 생성(키/접두사 숨김)
      const files = filesRaw
        .filter(f => !isTempOrSystemName(f.name))
        .map(f => ({ ...f, displayName: prettyName(f.name) }));

      // (선택) 정렬: 폴더는 이름 오름차순, 파일은 최근 수정 내림차순
      folders.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      files.sort((a, b) => {
        const ta = a.lastModified ? new Date(a.lastModified).getTime() : 0;
        const tb = b.lastModified ? new Date(b.lastModified).getTime() : 0;
        return tb - ta;
      });

      const payload = { folders, files };

      setCache(prev => {
        const m = new Map(prev);
        m.set(out.prefix ?? pfx, payload);
        return m;
      });
      setData(payload);

      const newPrefix = out.prefix ?? pfx;
      setPrefix(newPrefix);
      pruneCacheToPath(newPrefix);

      // 부모에게 prefix 변경 알림
      onPrefixChange?.(newPrefix);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  // 최초 로딩: 루트
  useEffect(() => { load(""); /* eslint-disable-next-line */ }, []);

  // 업로드 완료 시 새로고침 이벤트 수신
  useEffect(() => {
    const onRefresh = () => load(prefix || "");
    window.addEventListener("s3:refresh", onRefresh);
    return () => window.removeEventListener("s3:refresh", onRefresh);
  }, [prefix]);

  // 브레드크럼 데이터
  const crumbs = useMemo(() => splitBreadcrumb(prefix), [prefix]);

  const goCrumb = (idx) => {
    if (idx < 0) return load("");
    const path = crumbs.slice(0, idx + 1).join("/") + "/";
    load(path);
  };

  const enterFolder = (p) => load(p);

  const openFile = async (f) => {
    try {
      await window.s3Shared.downloadAndOpen(f.key, f.displayName || f.name);
    } catch (e) {
      setError(`다운로드/열기 실패: ${String(e?.message || e)}`);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* 브레드크럼 */}
      <div className="px-3 py-2 border-b bg-gray-50 text-sm">
        <button
          className="text-blue-600 hover:underline"
          onClick={() => goCrumb(-1)}
        >
          루트
        </button>
        {crumbs.map((c, i) => (
          <span key={i}>
            <span className="mx-1 text-gray-400">/</span>
            <button
              className="text-blue-600 hover:underline"
              onClick={() => goCrumb(i)}
            >
              {c}
            </button>
          </span>
        ))}
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-auto p-3">
        {loading && <div className="text-sm text-gray-500">불러오는 중…</div>}
        {error && !loading && (
          <div className="text-sm text-red-600 whitespace-pre-wrap">{error}</div>
        )}

        {/* 폴더 목록 */}
        <div className="mb-3">
          <div className="text-xs font-semibold text-gray-500 mb-1">폴더</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {data.folders.map(f => (
              <button
                key={f.id}
                className="border rounded-xl p-3 text-left hover:bg-gray-50"
                onClick={() => enterFolder(f.prefix)}
              >
                <div className="font-medium">{f.name || "(이름없음)"}</div>
              </button>
            ))}
            {(!loading && data.folders.length === 0) && (
              <div className="text-sm text-gray-400">폴더 없음</div>
            )}
          </div>
        </div>

        {/* 파일 목록 */}
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1">파일</div>
          <div className="border rounded-xl divide-y">
            {data.files.map(f => (
              <div key={f.id} className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.displayName || f.name}</div>
                  <div className="text-xs text-gray-500">
                    {f.size?.toLocaleString?.()} byte · {f.lastModified || ""}
                  </div>
                </div>
                <div className="shrink-0">
                  <button
                    className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50"
                    onClick={() => openFile(f)}
                  >
                    열기(로컬 저장 후)
                  </button>
                </div>
              </div>
            ))}
            {(!loading && data.files.length === 0) && (
              <div className="p-3 text-sm text-gray-400">파일 없음</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
