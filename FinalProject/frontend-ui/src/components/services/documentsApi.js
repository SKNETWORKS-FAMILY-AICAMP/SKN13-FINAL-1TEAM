// src/components/services/documentsApi.js
import { BASE_URL } from "./env.js";

function withTimeout(ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

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

// --- DOCX EXPORT FUNCTION ---
export async function exportToDocx(htmlContent, filename = "document.docx") {
  const url = `${BASE_URL}/documents/export/docx`;
  const label = `[API] POST /documents/export/docx`;
  console.time(label);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html_content: htmlContent, filename }),
    });

    console.log(`${label} → ${response.status}`, url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    console.debug(`${label} ✓ BLOB (${blob.size} bytes)`);
    return blob;
  } catch (e) {
    console.error(`${label} ✖`, e);
    throw e;
  } finally {
    console.timeEnd(label);
  }
}

// ─────────────────────────────────────────────────────────────
// 기존 API들 (그대로 유지)
// ─────────────────────────────────────────────────────────────
export async function listDocuments({ limit = 200, page = 1, sort = "-updated_at", q = "" } = {}) {
  const sp = new URLSearchParams({ limit, page, sort });
  if (q) sp.set("q", q);
  const data = await request(`/documents?${sp.toString()}`);
  return data?.items ?? data ?? [];
}

export async function createDocumentMeta({ title, url, mime }) {
  return request(`/documents`, { method: "POST", body: JSON.stringify({ title, url, mime }) });
}

export async function removeDocument(id) {
  await request(`/documents/${id}`, { method: "DELETE" });
  return true;
}

export async function restoreDocument(id) {
  await request(`/documents/${id}/restore`, { method: "POST" });
  return true;
}

// ✅ 최근 열람(DB, presigned_url 포함)
export async function listRecentDocs({ limit = 50, page = 1, sort = "-updated_at" } = {}) {
  const sp = new URLSearchParams({ limit, page, sort });
  const data = await request(`/documents/recent?${sp.toString()}`);
  return data?.items ?? data ?? [];
}
