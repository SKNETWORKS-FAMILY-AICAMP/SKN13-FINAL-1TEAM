/* 
  파일: src/components/services/storageApi.js
  역할: 파일 업로드 관련 API 추상화(직접 업로드 / 프리사인 URL 발급).

  LINKS:
    - 이 파일을 사용하는 곳:
      * 현재 채팅 파일 업로드는 uploadPresigned.js(Electron 경유)를 권장.
      * 이 모듈은 서버 direct 업로드 경로가 필요한 경우에 사용(관리 도구 등).
    - 이 파일이 사용하는 것:
      * env.js → FILE_UPLOAD_URL

  주의:
    - 실제 운영에서는 업로드 권한/용량 제한/바이러스 검사 등 정책 고려 필요.
*/

import { FILE_UPLOAD_URL } from './env.js';

/* 
  uploadDirect({ file })
  목적: 서버 엔드포인트로 멀티파트 업로드(서버가 스토리지로 중계).

  인자:
    - file: 브라우저 File 객체

  반환:
    - { url } 형태(JSON) — 업로드된 파일 접근 URL
*/
export async function uploadDirect({ file }) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${FILE_UPLOAD_URL}/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('upload failed');
  return res.json(); // { url }
}

/* 
  getPresignedUrl({ filename, contentType })
  목적: 클라이언트가 스토리지(S3 등)에 직접 업로드할 수 있도록 Presigned URL 발급.

  인자:
    - filename: 업로드할 파일명
    - contentType: MIME 타입

  반환:
    - { url, fields? } 혹은 { url } (서버 스키마에 따라 다름)
*/
export async function getPresignedUrl({ filename, contentType }) {
  const res = await fetch(`${FILE_UPLOAD_URL}/uploads/presign?filename=${encodeURIComponent(filename)}&contentType=${encodeURIComponent(contentType)}`);
  if (!res.ok) throw new Error('presign failed');
  return res.json(); // { url, fields } or { url }
}
