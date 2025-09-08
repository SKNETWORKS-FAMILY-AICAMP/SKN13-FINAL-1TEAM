/* 
================================================================================
📄 파일: src/components/services/s3Api.js
================================================================================
역할
- Renderer(React)에서 Electron Preload가 노출한 브리지(API)를 호출하는 얇은 래퍼.
- 기존 export 형태(s3List / s3DownloadAndOpen)를 유지하되,
  내부적으로는 "공유 버킷 전용" 채널(s3shared:*)을 우선 사용한다.

연결
- preload.js: window.s3Shared (새로 추가), window.s3Bridge(레거시)
- main.js: ipcMain.handle("s3shared:list", "s3shared:downloadAndOpen") ← 공유 버킷
           (레거시) "s3:list", "s3:downloadAndOpen" ← AWS_S3_BUCKET

주의
- 프론트 코드(S3Explorer.jsx 등)는 변경 없이 s3Api의 함수만 호출하면 된다.
================================================================================
*/

// 내부 공용 invoke (공유 → 레거시 → 최후 폴백 순)
const _invoke = (channel, payload) => {
  // 1) 공유 버킷 전용 브리지 우선
  if (channel.startsWith("s3shared:") && window.s3Shared) {
    const { prefix, key, saveAs } = payload || {};
    if (channel === "s3shared:list") return window.s3Shared.list(prefix || "");
    if (channel === "s3shared:downloadAndOpen") return window.s3Shared.downloadAndOpen(key, saveAs);
  }
  // 2) (레거시) 단일 버킷 브리지
  if (channel.startsWith("s3:") && window.s3Bridge) {
    const { prefix, key, saveAs } = payload || {};
    if (channel === "s3:list") return window.s3Bridge.list(prefix || "");
    if (channel === "s3:downloadAndOpen") return window.s3Bridge.downloadAndOpen(key, saveAs);
  }
  // 3) 과거 호환(최후 폴백)
  if (window.electron?.ipcRenderer?.invoke) return window.electron.ipcRenderer.invoke(channel, payload);
  if (window.api?.invoke) return window.api.invoke(channel, payload);
  throw new Error("No IPC bridge available");
};

// -----------------------------------------------------------------------------
// 🔹 공개 API — 프런트에서는 이 두 함수만 사용하면 됨
// -----------------------------------------------------------------------------

// 문서 공유 버킷의 현재 prefix 목록(폴더/파일) 조회
export function s3List(prefix = "") {
  return _invoke("s3shared:list", { prefix });
}

// 파일을 로컬 고정 폴더에 다운로드한 뒤 OS 기본앱으로 열기
export function s3DownloadAndOpen(key, saveAs) {
  return _invoke("s3shared:downloadAndOpen", { key, saveAs });
}



// [ADD] 파일 열기 대화상자 (하드코딩된 베이스 경로에서 선택)
export async function pickLocalFilesFromBase(defaultPath = "C:\\ClickA Document") {
  // preload에서 노출된 fsBridge 사용 (이미 프로젝트에 있음)
  const result = await window.fsBridge.showOpenDialog({
    title: "업로드할 문서 선택",
    defaultPath,                    // 하드코딩 베이스 폴더
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Documents", extensions: ["txt","md","doc","docx","pdf","xlsx","pptx","json"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (result?.canceled) return [];
  return result.filePaths || [];
}