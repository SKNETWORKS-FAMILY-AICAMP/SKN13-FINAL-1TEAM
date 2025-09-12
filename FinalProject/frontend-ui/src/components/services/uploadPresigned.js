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
import { BASE_URL } from "./env.js";

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

  try {
    // ✅ 직접 백엔드 API 호출 (Bearer 토큰 부착)
    const token = localStorage.getItem("userToken");
    if (!token) {
      throw new Error("JWT 토큰이 없습니다. 로그인이 필요합니다.");
    }

    console.log("[upload] presign request →", { filename, contentType, dir, space });
    const response = await fetch(`${BASE_URL}/files/presigned`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        filename,
        contentType,
        pathHint: dir || "",
        path_hint: dir || "",
        path: dir || "",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("[upload] presign FAILED:", response.status, errorText);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const result = await response.json();
    const finalUrl = result.uploadUrl || result.url || result.presigned_url;
    const finalKey = result.fileKey || result.key || result.object_key;

    console.log("[upload] presign OK:", { status: response.status, url: finalUrl, key: finalKey });
    return {
      url: finalUrl,
      uploadUrl: finalUrl,
      fileKey: finalKey,
      displayName: result.displayName || result.filename || result.name,
    };
  } catch (apiError) {
    console.warn("Direct API call failed, trying Electron bridge:", apiError?.message);

    // getPresignedUrlViaBridge 내부 (폴백 경로)
    // API 실패 시 Electron bridge 폴백
    if (!window?.electron?.getS3UploadUrl) {
      throw new Error("Electron bridge도 없습니다: window.electron.getS3UploadUrl 미정의");
    }

    // ✅ 토큰을 함께 전달하고, 키 이름을 메인과 일치(`fileName`)시킴
    const token = localStorage.getItem("userToken") || "";
    let resp = await window.electron
      .getS3UploadUrl({ fileName: filename, token, contentType }) // space/dir은 서버쪽 pathHint로 처리
      .catch(() => null);

    // 구버전(문자열만 받는)까지 폴백
    if (!resp || (!resp.url && !resp.uploadUrl)) {
      resp = await window.electron.getS3UploadUrl(filename);
    }

    const url = resp?.uploadUrl || resp?.url;
    if (!url) throw new Error(`Presigned URL 요청 실패: ${resp?.error || "url 없음"}`);

    // 파일키/표시명 등 백엔드가 준 부가 정보도 보존
    console.log("[upload] presign via bridge OK:", resp);
    return { ...resp, url };
  }
}

// ✅ 콘텐츠 타입 선택(서명/PUT 완전 일치 보장용)
function pickContentType(filename, fallbackType) {
  // .exe는 환경에 따라 x-msdownload가 문제를 일으킬 수 있어 octet-stream으로 강제
  if (/\.exe$/i.test(filename)) return "application/octet-stream";
  return fallbackType || "application/octet-stream";
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
  // ✅ 콘텐츠 타입 선택(서명↔PUT 일치 보장)
  const contentType = pickContentType(filename, file.type);
  const size = file.size ?? 0;

  const space = meta.space || "shared";
  const dir = meta.dir || meta.pathHint || "";

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

    // 어떤 경로로 PUT하는지 찍기
    const usingMain = !!window?.electron?.uploadFileToS3;
    console.log("[upload] route:", usingMain ? "main(ipc)" : "browser(fetch)");

    // 4-2) Electron main process를 통해 S3 업로드 (CORS 우회)
    if (usingMain) {
       const fileBuffer = await file.arrayBuffer();
       let uploadResult;
       try {
         uploadResult = await window.electron.uploadFileToS3({
           uploadUrl,
           file: { buffer: fileBuffer, type: contentType },
           fileName: filename,
           contentType, // ✅ presign과 동일
         });
         console.log("[upload] main PUT result:", uploadResult);
       } catch (e) {
         console.error("[upload] main PUT threw:", e?.message || e, e);
         throw e;
       }

      // success=true 이거나, status 2xx 이면 성공으로 인정
      const ok =
        uploadResult &&
        (uploadResult.success === true ||
          uploadResult.ok === true ||
          (typeof uploadResult.status === "number" &&
            uploadResult.status >= 200 &&
            uploadResult.status < 300));
      if (!ok) {
        const detail = uploadResult?.error || JSON.stringify(uploadResult);
        throw new Error(`S3 업로드 실패: ${detail}`);
      }
    } else {
      // 브라우저 환경 폴백 (CORS 문제 발생 가능)
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType }, // ✅ presign과 동일
        body: file,
        signal: meta.signal,
      });
      const text = await putRes.text().catch(() => "");
      console.log("[upload] browser PUT result:", putRes.status, text?.slice?.(0, 400) || "");
      if (!putRes.ok) {
        throw new Error(`S3 업로드 실패: ${putRes.status} ${text}`);
      }
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
