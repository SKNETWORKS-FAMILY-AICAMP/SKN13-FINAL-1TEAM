// presign → storage 직접 업로드 → 첨부 메타 저장
// 백엔드 요구 API:
// 1) POST /files/presign        body: { filename, contentType, size }
//    -> { uploadUrl, fields, fileUrl, key, expiresIn }
// 2) POST /attachments          body: { sessionId, fileUrl, name, size, type, storageKey? }
//    headers: { "Idempotency-Key": crypto.randomUUID() }

import { BASE_URL, FILE_UPLOAD_URL } from "./env.js";

async function http(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return null;
}

export async function uploadChatbotFilePresigned(file, { sessionId }) {
  // 1) presign 발급
  const presign = await http(FILE_UPLOAD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });

  // 2) 스토리지로 직접 업로드 (S3 POST 방식 예시)
  const form = new FormData();
  Object.entries(presign.fields || {}).forEach(([k, v]) => form.append(k, v));
  form.append("file", file);

  const upRes = await fetch(presign.uploadUrl, { method: "POST", body: form });
  if (!upRes.ok) throw new Error("Storage upload failed");

  // 3) 첨부 메타 저장 (백엔드)
  const meta = await http(`${BASE_URL}/attachments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
    },
    body: JSON.stringify({
      sessionId,
      fileUrl: presign.fileUrl, // 최종 접근 URL
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      storageKey: presign.key,  // (선택) 서버 내부용 오브젝트 키
    }),
  });

  return meta; // { id, fileUrl, name, size, mime, ... }
}
