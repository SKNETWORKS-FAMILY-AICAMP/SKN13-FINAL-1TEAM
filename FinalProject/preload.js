// ✅ 파일: preload.js
/* 
  목적(Purpose)
  - Renderer(React)와 Main(Electron) 사이에 안전한 브리지(Bridge) API를 노출한다.
  - window.electron: 공용 IPC 래퍼, 창 제어, 업로드 URL, 기능 창 오픈 등
  - window.auth: 전역 로그아웃 요청/수신 (requestLogout, onLogout, offLogout)
  - window.fsBridge: 문서 목록/읽기/저장/열기 등 파일시스템 래퍼
  - window.s3Bridge: 공유 S3 버킷 탐색/다운로드/열기

  사용처(Where Used)
  - 모든 렌더러(메인/기능/관리자) 창에서 window.electron/auth/fsBridge/s3Bridge 로 접근
  - App.jsx, Sidebar, DocumentEditor 등에서 직접 호출

  보안(Notes)
  - contextIsolation: true / nodeIntegration: false 구성에서만 전역 객체로 노출
  - exposeInMainWorld 로 필요한 최소 API만 공개

  추가(Added)
  - showMain(): 메인 로그인 창 다시 띄우기 신호
  - authAPI: 로그아웃 전용 브릿지 (기본 scope='all')
  - fsBridge: 이름/경로 정규화(toName) 포함
  - saveBytes: presigned 다운로드 저장
  - editor API: getEditorContent / onEditorUpdate / updateEditor
  - s3Bridge: 공유 S3 탐색/다운로드
*/

const { contextBridge, ipcRenderer } = require("electron");

// ─────────────────────────────────────────────────────────────
// 공용 electron API
// ─────────────────────────────────────────────────────────────
const electronAPI = {
  ipcRenderer: {
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, cb) => {
      const handler = (_evt, ...a) => cb?.(...a);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    once: (channel, cb) =>
      ipcRenderer.once(channel, (_evt, ...a) => cb?.(...a)),
    off: (channel, cb) =>
      cb
        ? ipcRenderer.removeListener(channel, cb)
        : ipcRenderer.removeAllListeners(channel),
    removeAllListeners: (channel) =>
      ipcRenderer.removeAllListeners(channel),
  },

  // 창 최대화 여부 질의
  isWindowMaximized: () => ipcRenderer.invoke("check-maximized"),

  // 창 리사이즈 이벤트
  onWindowResize: (cb) => {
    const handler = (_evt, ...a) => cb?.(...a);
    ipcRenderer.on("window-resized", handler);
    return () =>
      ipcRenderer.removeListener("window-resized", handler);
  },
  offWindowResize: (cb) =>
    ipcRenderer.removeListener("window-resized", cb),

  // 업로드 프리사인 URL 요청
  getS3UploadUrl: (payload) =>
    ipcRenderer.invoke("get-s3-upload-url", payload),

  // 기능 창 열기
  openFeatureWindow: (role) =>
    ipcRenderer.invoke("open-feature-window", role),

  // 창 제어
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximizeToggle: () =>
      ipcRenderer.invoke("window:maximize-toggle"),
    close: () => ipcRenderer.invoke("window:close"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    unmaximize: () => ipcRenderer.invoke("window:unmaximize"),
  },

  // ✨ 추가: 에디터 관련 API
  getEditorContent: () => ipcRenderer.invoke("editor:get-content"),
  onEditorUpdate: (callback) => {
    const handler = (_event, html) => callback(html);
    ipcRenderer.on("editor:apply-update", handler);
    return () =>
      ipcRenderer.removeListener("editor:apply-update", handler);
  },
  updateEditor: (htmlContent) =>
    ipcRenderer.send("editor:update-content", htmlContent),
};

// 메인 로그인 창 다시 띄우기
electronAPI.showMain = () => ipcRenderer.send("app:show-main");

// ─────────────────────────────────────────────────────────────
// 로그아웃 전용 브리지
// ─────────────────────────────────────────────────────────────
const authAPI = {
  requestLogout: (scope = "all") =>
    ipcRenderer.send("app:logout-request", scope),
  onLogout: (cb) => {
    const handler = (_evt, ...args) => cb?.(...args);
    ipcRenderer.on("logout", handler);
    return () => ipcRenderer.removeListener("logout", handler);
  },
  offLogout: (cb) => ipcRenderer.removeListener("logout", cb),
};

// ─────────────────────────────────────────────────────────────
// 파일시스템 Bridge
// ─────────────────────────────────────────────────────────────
function toName(arg) {
  if (!arg) return "";
  if (typeof arg === "string") {
    const parts = arg.split(/[\\/]/);
    return parts[parts.length - 1];
  }
  if (typeof arg === "object") {
    if (arg.name) return toName(arg.name);
    if (arg.path) return toName(arg.path);
  }
  return "";
}

const fsBridge = {
  listDocs: () => ipcRenderer.invoke("fs:listDocs"),
  readDoc: (arg) =>
    ipcRenderer.invoke("fs:readDoc", { name: toName(arg) }),
  deleteDoc: (arg) =>
    ipcRenderer.invoke("fs:deleteDoc", { name: toName(arg) }),
  open: (arg) =>
    ipcRenderer.invoke("fs:open", { name: toName(arg) }),
  saveDoc: (nameOrObj, maybeContent) => {
    let name = "",
      content = "";
    if (typeof nameOrObj === "object") {
      name = toName(nameOrObj);
      content = nameOrObj?.content ?? "";
    } else {
      name = toName(nameOrObj);
      content = maybeContent ?? "";
    }
    return ipcRenderer.invoke("fs:saveDoc", { name, content });
  },
  openDoc: (arg) =>
    ipcRenderer.invoke("fs:open", { name: toName(arg) }),

  // ✅ 프리사인드 다운로드 저장
  saveBytes: (filename, bytes) =>
    ipcRenderer.invoke("fs:saveBytes", { filename, bytes }),

  // 파일 대화상자
  showSaveDialog: (options) =>
    ipcRenderer.invoke("fs:showSaveDialog", options),
  showOpenDialog: (options) =>
    ipcRenderer.invoke("fs:showOpenDialog", options),
};

// ─────────────────────────────────────────────────────────────
// 공유 S3 브리지
// ─────────────────────────────────────────────────────────────
const s3Bridge = {
  list: (prefix = "") =>
    ipcRenderer.invoke("s3:list", { prefix }),
  downloadAndOpen: (key, saveAs) =>
    ipcRenderer.invoke("s3:downloadAndOpen", { key, saveAs }),
};

// ─────────────────────────────────────────────────────────────
// 전역 노출 & 방어적 동결
// ─────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld("electron", electronAPI);
contextBridge.exposeInMainWorld("auth", authAPI);
contextBridge.exposeInMainWorld("fsBridge", fsBridge);
contextBridge.exposeInMainWorld("s3Bridge", s3Bridge);

Object.freeze(electronAPI);
Object.freeze(electronAPI.ipcRenderer);
Object.freeze(authAPI);
Object.freeze(fsBridge);
Object.freeze(s3Bridge);

// (선택) 과거 호환 API
contextBridge.exposeInMainWorld("api", {
  invoke: (channel, payload) =>
    ipcRenderer.invoke(channel, payload),
});
