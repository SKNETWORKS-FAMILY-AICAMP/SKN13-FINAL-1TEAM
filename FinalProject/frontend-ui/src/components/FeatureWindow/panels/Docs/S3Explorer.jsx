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
   - ✅ (신규) ContinuationToken 기반 "더 보기" 페이지네이션 지원
       · main.js 의 s3shared:list 가 { isTruncated, nextContinuationToken }를 반환해야 함
       · 한 페이지 500개 기준(aws-sdk ListObjectsV2 MaxKeys=500)
       · "더 보기" 클릭 시 다음 토큰을 넣어 같은 prefix로 추가 조회 → 기존 목록 뒤에 append
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
  const [loading, setLoading] = useState(false);     // 첫 페이지 로딩 스피너
  const [error, setError] = useState("");

  // ✅ 페이지네이션 상태 (신규)
  const [nextToken, setNextToken] = useState(null);  // 다음 페이지 호출용 ContinuationToken
  const [hasMore, setHasMore] = useState(false);     // 서버가 더 있다고 알려줬는지 (IsTruncated)
  const [appending, setAppending] = useState(false); // "더 보기" 클릭 중 여부(버튼 비활성/라벨 변경)

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

  // 🔧 (내부) 응답 페이로드 후처리: 필터/정렬/표시명 생성
  function normalizePayload(out) {
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

    return { folders, files };
  }

  // 🔧 특정 prefix 로드
  //   - append=false : 첫 페이지 로딩(기존 캐시 쓰고 전체 교체)
  //   - append=true  : 다음 페이지(ContinuationToken)로 추가분 받아 기존 목록 뒤에 붙임
  //   - continuationToken: main.js → s3shared:list 의 ContinuationToken 인자로 그대로 전달
  async function load(pfx, continuationToken = null, append = false) {
    if (!append) setLoading(true);
    else setAppending(true);
    setError("");

    // 브릿지 존재 확인 (preload에서 window.s3Shared.list/ downloadAndOpen 노출 필수)
    if (!window.s3Shared?.list || !window.s3Shared?.downloadAndOpen) {
      setLoading(false);
      setAppending(false);
      setError("S3 브릿지가 감지되지 않았습니다. (preload 연결 확인)");
      return;
    }

    try {
      // 첫 페이지 로딩 시: 캐시에 있으면 먼저 화면에 띄워 UX 개선
      if (!append) {
        const cached = cache.get(pfx);
        if (cached) setData(cached);
      }

      // ✅ 메인 프로세스 IPC → 실제 버킷 호출
      //    · main.js 의 ipcMain.handle("s3shared:list", async(_evt, { prefix, continuationToken }) => { ... })
      //    · preload 에서 ipcRenderer.invoke("s3shared:list", { prefix, continuationToken }) 로 연결
      const out = await window.s3Shared.list(pfx, continuationToken);

      // 결과 정규화(필터/정렬/표시명)
      const { folders, files } = normalizePayload(out);

      // payload 구성: append 여부에 따라 "교체" or "추가"
      let payload;
      if (append) {
        // ✅ 기존 목록 뒤에 이어붙이기 (중복 키가 들어오지 않게 id를 기준으로 한번 더 중복 제거해도 됨)
        const mergedFolders = [...data.folders, ...folders];
        const mergedFiles = [...data.files, ...files];
        payload = { folders: mergedFolders, files: mergedFiles };
      } else {
        payload = { folders, files };
      }

      // 캐시 갱신
      setCache(prev => {
        const m = new Map(prev);
        m.set(out.prefix ?? pfx, payload);
        return m;
      });

      // 화면 상태 갱신
      setData(payload);

      // prefix/브레드크럼/캐시 경로 정리
      const newPrefix = out.prefix ?? pfx;
      setPrefix(newPrefix);
      if (!append) pruneCacheToPath(newPrefix);

      // 부모에게 prefix 변경 알림
      onPrefixChange?.(newPrefix);

      // ✅ 페이지네이션 상태 갱신 (main.js 가 내려주는 isTruncated / nextContinuationToken 사용)
      setHasMore(!!out.isTruncated);
      setNextToken(out.nextContinuationToken || null);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
      setAppending(false);
    }
  }

  // 최초 로딩: 루트
  useEffect(() => { load(""); /* eslint-disable-next-line */ }, []);

  // 업로드 완료 시 새로고침 이벤트 수신 (항상 첫 페이지부터 리로드)
  useEffect(() => {
    const onRefresh = () => load(prefix || "", null, false);
    window.addEventListener("s3:refresh", onRefresh);
    return () => window.removeEventListener("s3:refresh", onRefresh);
  }, [prefix]);

  // 브레드크럼 데이터
  const crumbs = useMemo(() => splitBreadcrumb(prefix), [prefix]);

  const goCrumb = (idx) => {
    if (idx < 0) return load("");
    const path = crumbs.slice(0, idx + 1).join("/") + "/";
    // ✅ 새 경로로 이동하면 첫 페이지부터
    load(path, null, false);
  };

  const enterFolder = (p) => {
    // ✅ 폴더 클릭도 첫 페이지부터
    load(p, null, false);
  };

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

          {/* ✅ “더 보기” 버튼: hasMore=true 에서만 노출. 마지막 페이지를 불러오면 hasMore=false 되어 자동으로 사라짐 */}
          {hasMore && (
            <div className="mt-3 text-center">
              <button
                className="px-4 py-2 text-sm rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
                onClick={() => load(prefix, nextToken, true)}
                disabled={appending}
                aria-disabled={appending}
              >
                {appending ? "불러오는 중…" : "더 보기"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
