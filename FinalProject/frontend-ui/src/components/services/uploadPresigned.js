/* 
===============================================================================
📦 파일: src/components/services/uploadPresigned.js
역할: (Electron 권장 경로) preload → main 백엔드를 통해 S3 Presigned URL을 받아와
     브라우저에서 직접 PUT 업로드까지 수행하는 고수준 유틸리티.
     + ✅ 프리사인드 GET URL에서 내려받은 바이트를 로컬 기본 폴더에 저장하는 헬퍼 포함
     + ✅ C 방어로직 포함: 파일 내용 SHA-256 해시 + 단일비행(single-flight) + 완료 캐시

LINKS:
  - 이 파일을 사용하는 곳:
    * ChatWindow.jsx → uploadChatbotFilePresigned(file, { sessionId }) 로 호출
  - 이 파일이 사용하는 것:
    * window.electron.getS3UploadUrl(...) → preload가 노출한 안전한 브릿지
    * fetch PUT → S3로 바로 업로드
    * ✅ window.fsBridge.saveBytes(name, bytes) → 로컬 저장 (C:\ClickA Document 보장)

주의:
  - 동일 파일(내용 기준)이 동시에/연달아 업로드 요청되더라도 실제 네트워크 업로드는 1회만 수행.
  - 업로드 중 모달 닫힘/세션 전환 시, 호출부에서 AbortSignal을 넘기면 PUT이 즉시 중단됨.
===============================================================================
*/

import { SPACES } from "./s3Spaces.js";

/* ============================================================================
   🔒 내부 상태: 단일비행(inflight) & 완료(done) 캐시 (sha256 → Promise/Result)
   - inflightByHash: 동일 해시 파일이 "진행 중"이면 동일 Promise를 공유하여 중복 PUT 방지
   - doneByHash   : 직전에 성공한 동일 파일은 즉시 성공 결과 반환(네트워크 요청 생략)
============================================================================ */
const inflightByHash = new Map(); // sha256 -> Promise<Result>
const doneByHash = new Map();     // sha256 -> Result

/* ============================================================================
   🧮 파일 내용 SHA-256 (hex) 계산
   - 파일 "이름"이 아니라 "내용" 기준으로 동일성 판단
   - 대용량 파일은 메모리 사용량 증가 가능 → 운영상 업로드 최대 크기 제한 권장
============================================================================ */
async function sha256Hex(fileOrBlob) {
  const buf = await fileOrBlob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ============================================================================
   🔗 Presigned URL 요청 (Electron preload 브릿지 경유)
   1) 신규: 객체 시그니처 { filename, space, dir, contentType } 지원
   2) 구버전 폴백: 문자열(filename)만 받던 브릿지도 자동 지원
============================================================================ */
async function getPresignedUrlViaBridge(params) {
  const {
    filename,
    space = "shared",
    dir = "",
    contentType = "application/octet-stream",
  } = typeof params === "string" ? { filename: params } : (params || {});
  if (!filename) throw new Error("filename is required");

  if (!window?.electron?.getS3UploadUrl) {
    throw new Error("Electron bridge가 없습니다: window.electron.getS3UploadUrl 미정의");
  }

  // 우선 신규 시그니처(object)로 시도
  let resp = await window.electron.getS3UploadUrl({ filename, space, dir, contentType }).catch(() => null);

  // 구버전 브릿지(문자열만 받는) 폴백
  if (!resp || (!resp.url && !resp.uploadUrl)) {
    resp = await window.electron.getS3UploadUrl(filename);
  }

  const url = resp?.uploadUrl || resp?.url;
  if (!url) throw new Error(`Presigned URL 요청 실패: ${resp?.error || "url 없음"}`);

  // 파일키/표시명 등 백엔드가 준 부가 정보도 보존
  return { ...resp, url };
}

/* ============================================================================
   🚀 업로드(서비스 레벨 중복 방어 포함) — 고수준 엔트리
   - 동일 sha256 파일 업로드 동시/연속 호출 → 네트워크 PUT 1회만 수행
   - 성공 직후 동일 파일 → done 캐시 히트로 즉시 성공 반환
   - AbortSignal 지원(모달 닫힘/세션 전환 시 업로드 중단)
============================================================================ */
/**
 * uploadFileWithDedup(file, { sessionId, signal, space, dir })
 * @param {File|Blob} file
 * @param {{ sessionId?: string, signal?: AbortSignal, space?: string, dir?: string }} meta
 * @returns {Promise<{ fileUrl: string, sha256: string, filename: string, size: number, contentType: string }>}
 */
export async function uploadFileWithDedup(file, meta = {}) {
  if (!file) throw new Error("file is required");
  const filename = file.name || "unnamed";
  const contentType = file.type || "application/octet-stream";
  const size = file.size ?? 0;

  const space = meta.space || "shared";
  const dir = meta.dir || "";

  // 1) sha256 계산
  const sha256 = await sha256Hex(file);

  // 2) 완료 캐시(hit) → 즉시 반환
  const done = doneByHash.get(sha256);
  if (done) {
    console.log(`[DEDUP][done] '${filename}' (sha256=${sha256.slice(0, 8)}...) 즉시 반환`);
    return done;
  }

  // 3) 진행 중(hit) → 동일 Promise 재사용
  const inflight = inflightByHash.get(sha256);
  if (inflight) {
    console.log(`[DEDUP][inflight] '${filename}' (sha256=${sha256.slice(0, 8)}...) 진행 중 공유`);
    return inflight;
  }

  // 4) 새 업로드 파이프라인 생성
  const flight = (async () => {
    console.log(`'${filename}' 업로드 시작 (sha256=${sha256.slice(0, 8)}..., size=${size})`);

    // 4-1) presigned URL 요청 (space/dir/contentType 전달)
    const presigned = await getPresignedUrlViaBridge({ filename, space, dir, contentType });
    const uploadUrl = presigned.url;

    // 4-2) S3로 PUT 업로드 (AbortSignal 연동)
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
      signal: meta.signal,
    });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => "");
      throw new Error(`S3 업로드 실패: ${putRes.status} ${text}`);
    }

    // 4-3) 결과 구성 + 완료 캐시 저장
    const finalFileUrl = uploadUrl.split("?")[0];
    const result = { fileUrl: finalFileUrl, sha256, filename, size, contentType };
    doneByHash.set(sha256, result);
    console.log(`'${filename}' 업로드 성공 → ${finalFileUrl}`);
    return result;
  })().finally(() => {
    inflightByHash.delete(sha256);
  });

  inflightByHash.set(sha256, flight);
  return flight;
}

/* ============================================================================
   📤 기존 엔트리(호환 유지): uploadChatbotFilePresigned
   - 내부적으로 중복 방어 래퍼(uploadFileWithDedup)를 호출하도록 변경
   - 이제 space/dir도 인자로 받을 수 있음 (기본: RAW/루트)
============================================================================ */
/**
 * uploadChatbotFilePresigned(file, { sessionId, signal, space, dir })
 * 목적: Electron 백엔드에서 presigned URL을 받아와 S3에 직접 PUT 업로드한다.
 *      (내부적으로 SHA-256 단일비행/완료 캐시 적용)
 *
 * 인자:
 *  - file: 업로드할 File 객체
 *  - { sessionId, signal, space, dir }:
 *      * 예) 챗봇 원본: space=SPACES.RAW, dir=""
 *      * 예) 공유폴더: space=SPACES.SHARED, dir="documents/projectA/"
 *
 * 반환:
 *  - Promise<{ fileUrl: string }> — 업로드 완료 후 파일 접근 URL
 */
export async function uploadChatbotFilePresigned(
  file,
  { sessionId, signal, space = SPACES.RAW, dir = "" } = {}
) {
  const out = await uploadFileWithDedup(file, { sessionId, signal, space, dir });
  // 기존 반환 형태 유지(필요 시 out 확장 사용 가능)
  return { fileUrl: out.fileUrl };
}

/* ============================================================================
   🧹 유틸(디버그/초기화): 캐시 관리
   - clearUploadDedupCaches(): inflight/done 캐시 전체 비우기
   - __debugGetUploadDedupState(): 현재 캐시 크기 조회
============================================================================ */
export function clearUploadDedupCaches() {
  inflightByHash.clear();
  doneByHash.clear();
}
export function __debugGetUploadDedupState() {
  return { inflight: inflightByHash.size, done: doneByHash.size };
}

/* ============================================================================
   📥 downloadPresignedToLocal
   목적:
   - 프리사인드 GET URL에서 바이트를 받아 로컬 기본 폴더(C:\ClickA Document)에 저장.
   - 파일명 충돌은 main의 fs:saveBytes에서 자동 해결.
   사용 예:
   - const { path, name } = await downloadPresignedToLocal(url, "보고서.pdf");
============================================================================ */
export async function downloadPresignedToLocal(presignedGetUrl, suggestedFilename = "download.bin") {
  if (!presignedGetUrl) throw new Error("presignedGetUrl is required");

  const res = await fetch(presignedGetUrl, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`다운로드 실패: ${res.status} ${res.statusText} ${text || ""}`.trim());
  }

  const arrayBuf = await res.arrayBuffer();

  // ✅ 경로는 메인에서 관리 — C:\ClickA Document (resolveBaseDir)로 저장
  if (!window?.fsBridge?.saveBytes) {
    throw new Error("fsBridge가 없습니다: window.fsBridge.saveBytes 미정의");
  }
  const out = await window.fsBridge.saveBytes(suggestedFilename, arrayBuf);
  if (!out?.ok) throw new Error("로컬 저장 실패");
  return out; // { ok:true, path, name }
}
