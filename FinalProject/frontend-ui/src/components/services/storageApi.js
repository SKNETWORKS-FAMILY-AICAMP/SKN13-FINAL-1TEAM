// ✅ src/components/services/storageApi.js
import { FILE_UPLOAD_URL } from './env.js';

// 지금: 단일서버 direct 업로드
export async function uploadDirect({ file }) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${FILE_UPLOAD_URL}/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('upload failed');
  return res.json(); // { url }
}

// 나중: 프리사인 URL 발급 → 클라이언트가 스토리지로 직접 업로드
export async function getPresignedUrl({ filename, contentType }) {
  const res = await fetch(`${FILE_UPLOAD_URL}/uploads/presign?filename=${encodeURIComponent(filename)}&contentType=${encodeURIComponent(contentType)}`);
  if (!res.ok) throw new Error('presign failed');
  return res.json(); // { url, fields } or { url }
}