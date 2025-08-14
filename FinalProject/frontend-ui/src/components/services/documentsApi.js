// ✅ 파일: frontend-ui/src/components/services/documentsApi.js
// 규칙: env는 ../components/services/env.js 를 사용 (프로젝트 규약 유지)
import { BASE_URL } from "./env.js";

function withTimeout(ms = 8000) {
  const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}
async function request(path, { method='GET', headers={}, body, timeout=8000 }={}) {
  const { signal, done } = withTimeout(timeout);
  const reqId = crypto.randomUUID();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type":"application/json", "X-Request-ID": reqId, ...headers },
      body, signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  } finally { done(); }
}

export async function listDocuments({ limit=200, page=1, sort="-updated_at", q="" } = {}) {
  const sp = new URLSearchParams({ limit, page, sort }); if (q) sp.set("q", q);
  const data = await request(`/documents?${sp.toString()}`);
  return data?.items ?? data ?? [];
}
export async function createDocumentMeta({ title, url, mime }) {
  return request(`/documents`, { method:"POST", body: JSON.stringify({ title, url, mime }) });
}
export async function removeDocument(id) {
  await request(`/documents/${id}`, { method:"DELETE" }); return true;
}
export async function restoreDocument(id) {
  await request(`/documents/${id}/restore`, { method:"POST" }); return true;
}
