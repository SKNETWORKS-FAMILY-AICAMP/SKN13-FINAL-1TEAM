/* 
  파일: src/components/FeatureWindow/panels/Docs/S3Explorer.jsx
  역할:
   - 공유 폴더(S3) 탐색기 UI
   - 브레드크럼(경로 표시) + 현재 폴더의 직계 자식만 표시(손자 이하 차단)
   - 캐싱: 현재 경로 체인(조상~현재)만 유지, 다른 경로 캐시는 제거 (메모리 과부하 방지)
   - 파일 열기: S3 → 로컬 고정 폴더에 다운로드 후 OS 기본 프로그램으로 실행
  사용처:
   - FeatureDocs.jsx 에서 mode === 's3' 일 때 렌더링
*/

import React, { useEffect, useMemo, useState } from "react";
import { s3List, s3DownloadAndOpen } from "../../../services/s3Api.js";

// 브레드크럼 유틸: prefix → ["documents","sub","folder"]
function splitBreadcrumb(prefix) {
  return (prefix || "").split("/").filter(Boolean);
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

  // 🔧 특정 prefix 로드
  async function load(pfx) {
    setLoading(true);
    setError("");
    try {
      // 캐시에 있으면 먼저 표시
      const cached = cache.get(pfx);
      if (cached) setData(cached);

      const out = await s3List(pfx);
      const payload = { folders: out.folders, files: out.files };

      setCache(prev => {
        const m = new Map(prev);
        m.set(out.prefix || pfx, payload);
        return m;
      });
      setData(payload);
      const newPrefix = out.prefix || pfx;
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
  useEffect(() => { load(""); }, []);

  // [ADD] 업로드 완료 시 새로고침 이벤트 수신
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
  const openFile = async (f) => { await s3DownloadAndOpen(f.key, f.name); };

  return (
    <div className="h-full flex flex-col">
      {/* 브레드크럼 */}
      <div className="px-3 py-2 border-b bg-gray-50 text-sm">
        <button className="text-blue-600 hover:underline" onClick={() => goCrumb(-1)}>루트</button>
        {crumbs.map((c, i) => (
          <span key={i}>
            <span className="mx-1 text-gray-400">/</span>
            <button className="text-blue-600 hover:underline" onClick={() => goCrumb(i)}>{c}</button>
          </span>
        ))}
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-auto p-3">
        {loading && <div className="text-sm text-gray-500">불러오는 중…</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}

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
                <div className="text-xs text-gray-500 truncate">{f.prefix}</div>
              </button>
            ))}
            {data.folders.length === 0 && <div className="text-sm text-gray-400">폴더 없음</div>}
          </div>
        </div>

        {/* 파일 목록 */}
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1">파일</div>
          <div className="border rounded-xl divide-y">
            {data.files.map(f => (
              <div key={f.id} className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.name}</div>
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
            {data.files.length === 0 && <div className="p-3 text-sm text-gray-400">파일 없음</div>}
          </div>
        </div>
      </div>
    </div>
  );
}