/* 
  파일: src/components/services/documentsApi.js
  역할: 서버의 문서 메타데이터(목록/생성/삭제/복구/최근) 관리 API.

  LINKS:
    - 이 파일을 사용하는 곳:
      * FeatureDocs.jsx (현재는 로컬 fsBridge 기반이지만, 서버 연동 시 여기 함수로 대체)
      * DocumentGrid/DocumentRowList 상위에서 이 API의 결과를 props로 전달
    - 이 파일이 사용하는 것:
      * env.js → BASE_URL
      * window.fetch + AbortController 타임아웃

  특기:
    - request()에 요청 ID/소요시간 console.time/로그가 포함되어 있어 디버깅에 유리.
    - listDocuments(), listRecentDocs()는 items 배열을 반환(백엔드 스키마 차이에 대응).
*/

import { BASE_URL } from "./env.js";

/* 
  withTimeout(ms)
  목적: fetch에 사용할 AbortController와 타이머를 한 번에 생성해 주는 유틸.

  동작:
    - ms 밀리초 뒤 AbortController.abort()를 호출해 fetch를 중단한다.
    - 호출 측은 반환된 done()을 반드시 실행해 타이머를 정리해야 한다(메모리 누수 방지).

  반환:
    - { signal, done } 형태의 객체
      * signal: fetch 옵션에 그대로 전달
      * done(): 타이머 해제(cleanup)
*/
function withTimeout(ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

/* 
  request(path, options)
  목적: 공통 HTTP 요청 래퍼. 요청 ID 부여/콘솔 타이밍/콘텐츠 타입 분기/타임아웃/에러 처리까지 일관 제공.

  인자:
    - path: BASE_URL 뒤에 붙는 경로(e.g., "/documents?...")
    - options:
      * method: "GET" | "POST" | "DELETE" | ...
      * headers: 추가 헤더(기본으로 JSON 헤더 + X-Request-ID 포함)
      * body: JSON.stringify(...) 또는 텍스트 등
      * timeout: 밀리초 단위 타임아웃 (기본 8000ms)

  동작:
    1) withTimeout으로 AbortController 준비 후 fetch 수행
    2) 요청/응답에 고유 라벨(label)을 부여하여 console.time/console.timeEnd로 소요시간 측정
    3) 상태코드 확인(res.ok 아닌 경우 Error throw)
    4) Content-Type에 따라 JSON/텍스트로 반환
    5) AbortError/기타 에러를 구분 로깅 후 throw

  반환:
    - 서버가 JSON을 돌려주면 파싱된 객체/배열
    - 텍스트면 string
    - 에러 발생 시 throw
*/
async function request(path, { method = "GET", headers = {}, body, timeout = 8000 } = {}) {
  const { signal, done } = withTimeout(timeout);
  const reqId = crypto.randomUUID();

  const url = `${BASE_URL}${path}`;
  const label = `[API ${reqId.slice(0, 8)}] ${method} ${path}`;

  console.time(label); // ⏱ 요청~응답 전체 시간
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "X-Request-ID": reqId, ...headers }, // ⛏️ 스프레드 유지
      body,
      signal,
    });

    // 상태/URL 로그
    console.log(`${label} → ${res.status}`, url);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = await res.json();
      // (선택) 결과 규모 힌트
      const sizeHint =
        Array.isArray(data) ? `array:${data.length}` :
        data && typeof data === "object" ? "object" : typeof data;
      console.debug(`${label} ✓ JSON (${sizeHint})`);
      return data;
    } else {
      const text = await res.text();
      console.debug(`${label} ✓ TEXT (${text.length} chars)`);
      return text;
    }
  } catch (e) {
    if (e?.name === "AbortError") {
      console.warn(`${label} ✖ aborted after ${timeout}ms`, url);
    } else {
      console.error(`${label} ✖`, e);
    }
    throw e;
  } finally {
    console.timeEnd(label); // ⏱ 총 소요시간 출력
    done();
  }
}

// ─────────────────────────────────────────────────────────────
// 기존 API들 (그대로 유지)
// ─────────────────────────────────────────────────────────────

/* 
  listDocuments({ limit, page, sort, q })
  목적: 문서 메타 목록 조회.

  인자:
    - limit: 페이지당 개수(기본 200)
    - page: 페이지 번호(1부터, 기본 1)
    - sort: 정렬 키(예: "-updated_at" 내림차순)
    - q: 검색어(있을 때만 쿼리스트링에 추가)

  동작:
    - /documents?limit=..&page=..&sort=..&q=.. 형태로 요청
    - 백엔드가 { items: [...] } 형태를 줄 수도 있고, 배열만 줄 수도 있어 양쪽 모두 대응

  반환:
    - 문서 배열
*/
export async function listDocuments({ limit = 200, page = 1, sort = "-updated_at", q = "" } = {}) {
  const sp = new URLSearchParams({ limit, page, sort });
  if (q) sp.set("q", q);
  const data = await request(`/documents?${sp.toString()}`);
  return data?.items ?? data ?? [];
}

/* 
  createDocumentMeta({ title, url, mime })
  목적: 문서 메타데이터 생성(서버에 등록). 파일 업로드가 별도로 되어 있다면, 업로드 URL/경로를 함께 저장.

  인자:
    - title: 표시할 문서 제목
    - url: 파일 접근 URL(혹은 스토리지 경로)
    - mime: MIME 타입(렌더링/아이콘 결정에 유용)

  반환:
    - 생성된 문서 메타(JSON 객체). 서버 스키마에 따름.
*/
export async function createDocumentMeta({ title, url, mime }) {
  return request(`/documents`, { method: "POST", body: JSON.stringify({ title, url, mime }) });
}

/* 
  removeDocument(id)
  목적: 문서를 삭제(일반적으로 소프트 삭제)한다.

  인자:
    - id: 대상 문서의 식별자

  반환:
    - true (요청이 성공적으로 완료되면)
  주의:
    - 실제로는 소프트 삭제라면 서버가 복구 가능 상태로 전환할 수 있음(restoreDocument 사용).
*/
export async function removeDocument(id) {
  await request(`/documents/${id}`, { method: "DELETE" });
  return true;
}

/* 
  restoreDocument(id)
  목적: 삭제(또는 보관)된 문서를 복구한다.

  인자:
    - id: 대상 문서의 식별자

  반환:
    - true (요청이 성공적으로 완료되면)
  비고:
    - 서버가 소프트 삭제 정책을 가정.
*/
export async function restoreDocument(id) {
  await request(`/documents/${id}/restore`, { method: "POST" });
  return true;
}

/* 
  listRecentDocs({ limit, page, sort })
  목적: 최근 열람/업데이트된 문서 목록을 조회한다(서버가 최근성 기준을 계산).

  인자:
    - limit: 페이지당 개수(기본 50)
    - page: 페이지 번호(기본 1)
    - sort: 정렬(기본 "-updated_at")

  반환:
    - 최근 문서 배열 (백엔드가 { items: [...] } 또는 배열 반환)
  활용:
    - FeatureDocs의 "최근 파일" 섹션을 서버 기반으로 전환할 때 사용.
*/
export async function listRecentDocs({ limit = 50, page = 1, sort = "-updated_at" } = {}) {
  const sp = new URLSearchParams({ limit, page, sort });
  const data = await request(`/documents/recent?${sp.toString()}`);
  return data?.items ?? data ?? [];
}

/* ─────────────────────────────────────────────────────────────
 * (추가) exportToDocx(html, filename)
 * - 우선 서버 변환 API를 시도하고, 실패 시 클라이언트 폴백(HTML을 Word에서 열 수 있는 Blob) 반환
 * - 반환값: Blob (saveAs(blob, "파일명.docx") 로 저장)  나중에 이 아래에 위치한 임시코드는 삭제하거나 해야함
 * ───────────────────────────────────────────────────────────── */
export async function exportToDocx(html, filename = "document.docx") {
  // 1) 서버에 DOCX 변환 API가 있을 경우: 사용
  try {
    const url = `${BASE_URL}/documents/export-docx`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, filename }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    // 서버가 진짜 docx 바이너리를 보내주는 경우
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")) {
      return await res.blob();
    }

    // 혹시 다른 타입(예: base64/text)로 올 경우에도 blob으로 변환 시도
    const buf = await res.arrayBuffer();
    return new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  } catch (e) {
    console.warn("[documentsApi] exportToDocx: 서버 변환 실패, 클라이언트 폴백 사용", e);
  }

  // 2) 폴백: HTML을 Word에서 열 수 있는 형식으로 저장
  //    * 진짜 .docx 변환은 아님 (정확한 변환은 서버/전용 라이브러리 필요)
  //    * 그래도 Word는 HTML 파일을 잘 열 수 있음
  const htmlDoc =
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${(filename || "document").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</title>
</head>
<body>
${html || ""}
</body>
</html>`;

  // Word가 열 수 있도록 MIME을 Word 계열로 지정 (완벽한 docx는 아님)
  return new Blob([htmlDoc], { type: "application/msword" });
}
//