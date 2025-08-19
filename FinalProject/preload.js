// ✅ preload.js (원래 구조 유지 + fsBridge.openDoc 추가)
const { contextBridge, ipcRenderer } = require("electron");

// 내부 헬퍼: 리스너 래핑(이벤트 객체 제거)
const wrap = (cb) =>
  typeof cb === "function" ? (_e, ...args) => cb(...args) : () => {};

// ────────────────────────────────────────────
// electron API 래퍼 (기존 그대로)
// ────────────────────────────────────────────
const electronAPI = {
  ipcRenderer: {
    // 기존 그대로 사용 가능
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    // 기존: invoke(channel, data) → 호환 유지 + 가변 인자 지원
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

    // on: 등록 후 해제 함수 반환(선택 사용)
    on: (channel, callback) => {
      const fn = wrap(callback);
      ipcRenderer.on(channel, fn);
      return () => ipcRenderer.removeListener(channel, fn);
    },
    // 한번만
    once: (channel, callback) => {
      ipcRenderer.once(channel, wrap(callback));
    },
    // off: 특정 콜백만 제거(없으면 전부 제거)
    off: (channel, callback) => {
      if (callback) ipcRenderer.removeListener(channel, wrap(callback));
      else ipcRenderer.removeAllListeners(channel);
    },
    // 필요시 전체 제거용
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  },

  // ✅ 기존 노출 유지
  isWindowMaximized: () => ipcRenderer.invoke("check-maximized"),

  // 창 리사이즈 이벤트 (등록 시 언레지스터 함수 반환)
  onWindowResize: (callback) => {
    const fn = wrap(callback);
    ipcRenderer.on("window-resized", fn);
    return () => ipcRenderer.removeListener("window-resized", fn);
  },
  offWindowResize: (callback) =>
    ipcRenderer.removeListener("window-resized", callback),

  // 📄 S3 업로드 URL 요청(기존 유지)
  getS3UploadUrl: (fileName) => ipcRenderer.invoke("get-s3-upload-url", fileName),
};

// ────────────────────────────────────────────
/** fsBridge: 로컬 파일 브릿지 (기존 그대로 + openDoc 추가) */
// ────────────────────────────────────────────
const fsBridge = {
  listDocs: (subdir = "") => ipcRenderer.invoke("fs:listDocs", subdir),
  readDoc: (path) => ipcRenderer.invoke("fs:readDoc", path),
  saveDoc: (payload) => ipcRenderer.invoke("fs:saveDoc", payload), // { name, content, subdir? }
  deleteDoc: (path) => ipcRenderer.invoke("fs:deleteDoc", path),
  // 👇 새로 추가: OS 기본앱으로 열기
  openDoc: (path) => ipcRenderer.invoke("fs:open", path),
};

// 노출
contextBridge.exposeInMainWorld("electron", electronAPI);
contextBridge.exposeInMainWorld("fsBridge", fsBridge);

// (선택) 변조 방지
Object.freeze(electronAPI);
Object.freeze(electronAPI.ipcRenderer);
Object.freeze(fsBridge);
