/**
 * preload.js
 * ------------------------------------------------------------------
 * 목적:
 *  - Renderer(React) ↔ Main(Electron) 간 안전한 브릿지 제공.
 *  - [추가] 로그아웃 전용 브리지(window.auth.*)
 */

const { contextBridge, ipcRenderer } = require("electron");

/* 공용 electron API (원본 유지) */
const electronAPI = {
  ipcRenderer: {
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, cb) => {
      const handler = (_evt, ...a) => cb?.(...a);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    once: (channel, cb) => ipcRenderer.once(channel, (_evt, ...a) => cb?.(...a)),
    off: (channel, cb) =>
      cb ? ipcRenderer.removeListener(channel, cb) : ipcRenderer.removeAllListeners(channel),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  },

  isWindowMaximized: () => ipcRenderer.invoke("check-maximized"),

  onWindowResize: (cb) => {
    const handler = (_evt, ...a) => cb?.(...a);
    ipcRenderer.on("window-resized", handler);
    return () => ipcRenderer.removeListener("window-resized", handler);
  },
  offWindowResize: (cb) => ipcRenderer.removeListener("window-resized", cb),

  getS3UploadUrl: (arg) => ipcRenderer.invoke("get-s3-upload-url", arg),
  uploadFileToS3: (uploadData) => ipcRenderer.invoke("upload-file-to-s3", uploadData),
  onUploadProgress: (callback) => {
    const handler = (_evt, data) => callback(data);
    ipcRenderer.on('upload-progress', handler);
    return () => ipcRenderer.removeListener('upload-progress', handler);
  },

  openFeatureWindow: (role) => ipcRenderer.invoke("open-feature-window", role),

  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximizeToggle: () => ipcRenderer.invoke("window:maximize-toggle"),
    close: () => ipcRenderer.invoke("window:close"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    unmaximize: () => ipcRenderer.invoke("window:unmaximize"),
  },
};

/* ✅ (추가) 메인 로그인 창 다시 띄우기 */
electronAPI.showMain = () => ipcRenderer.send("app:show-main");

/* ✅ (추가) 챗봇 문서 열기 관련 */
electronAPI.onDocumentOpenFromChat = (cb) => {
  const handler = (_evt, ...args) => cb?.(...args);
  ipcRenderer.on("document:openFromChat", handler);
  return () => ipcRenderer.removeListener("document:openFromChat", handler);
};

/* ✅ 로그아웃 전용 브리지 — 기본 스코프 'all' */
const authAPI = {
  requestLogout: (scope = "all") => ipcRenderer.send("app:logout-request", scope),
  onLogout: (cb) => {
    const handler = (_evt, ...args) => cb?.(...args);
    ipcRenderer.on("logout", handler);
    return () => ipcRenderer.removeListener("logout", handler);
  },
  offLogout: (cb) => ipcRenderer.removeListener("logout", cb),
};

/* 파일시스템 Bridge (원본 유지) */
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
  // ✅ [수정] 파일 저장/열기 대화상자 및 파일 읽기/쓰기
  showSaveDialog: (options) => ipcRenderer.invoke("fs:showSaveDialog", options),
  showOpenDialog: (options) => ipcRenderer.invoke("fs:showOpenDialog", options),
  saveFile: (options) => ipcRenderer.invoke("fs:saveFile", options),
  readFileByPath: (options) => ipcRenderer.invoke("fs:readFileByPath", options),
  // ✅ [추가] DOCX 파일을 HTML로 변환
  convertDocxToHtml: (filePath) => ipcRenderer.invoke("convert-docx-to-html", filePath),

  listDocs: () => ipcRenderer.invoke("fs:listDocs"),
  listViewed: () => ipcRenderer.invoke("fs:listViewed"), // ✅ 추가

  readDoc: (arg) => ipcRenderer.invoke("fs:readDoc", { name: toName(arg) }),
  deleteDoc: (arg) => ipcRenderer.invoke("fs:deleteDoc", { name: toName(arg) }),
  open:     (arg) => ipcRenderer.invoke("fs:open",     { name: toName(arg) }),
  saveDoc: (nameOrObj, maybeContent) => {
    let name = "", content = "";
    if (typeof nameOrObj === "object") { name = toName(nameOrObj); content = nameOrObj?.content ?? ""; }
    else { name = toName(nameOrObj); content = maybeContent ?? ""; }
    return ipcRenderer.invoke("fs:saveDoc", { name, content });
  },
  openDoc: (arg) => ipcRenderer.invoke("fs:open", { name: toName(arg) }),

  // 문서 내용 공유 IPC
  getCurrentDocumentContent: () => ipcRenderer.invoke("document:getCurrentContent"),
  setCurrentDocumentContent: (content) => ipcRenderer.invoke("document:setCurrentContent", content),
  onDocumentUpdate: (callback) => {
    const handler = (_event, content) => callback(content);
    ipcRenderer.on("document:updated", handler);
    return () => ipcRenderer.removeListener("document:updated", handler);
  },
  sendDocumentUpdate: (content) => ipcRenderer.send("document:sendUpdate", content),
  
  // ✅ [NEW] 챗봇에서 문서 열기 요청 처리
  onDocumentOpenFromChat: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("document:openFromChat", handler);
    return () => ipcRenderer.removeListener("document:openFromChat", handler);
  },
  
  // ✅ [NEW] 로컬 문서 검색
  searchLocalDocuments: (query, maxResults = 3) => ipcRenderer.invoke('document:searchLocal', { query, maxResults }),
};

/* S3 공유 브리지 */
const s3SharedBridge = {
  list: (prefix = "") => ipcRenderer.invoke("s3shared:list", { prefix }),
  downloadAndOpen: (key, saveAs) => ipcRenderer.invoke("s3shared:downloadAndOpen", { key, saveAs }),
  upload: (filePath, key) => ipcRenderer.invoke("s3shared:upload", { filePath, key }),
  delete: (key) => ipcRenderer.invoke("s3shared:delete", { key }),
};

/* 전역 노출 */
contextBridge.exposeInMainWorld("electron", electronAPI);
contextBridge.exposeInMainWorld("auth", authAPI);
contextBridge.exposeInMainWorld("fsBridge", fsBridge);
contextBridge.exposeInMainWorld("s3Shared", s3SharedBridge);

/* ✅ 알림 전용 브리지 (별도 창 열기/닫기 + 명령 수신) */
const notifyAPI = {
  openUpcoming: (event) => ipcRenderer.invoke("notify:openUpcoming", event),
  closeUpcoming: () => ipcRenderer.invoke("notify:closeUpcoming"),
  onCommand: (cb) => {
    const handler = (_evt, payload) => cb?.(payload);
    ipcRenderer.on("notify:cmd", handler);
    return () => ipcRenderer.removeListener("notify:cmd", handler);
  },
};
contextBridge.exposeInMainWorld("notify", notifyAPI);

Object.freeze(electronAPI);
Object.freeze(electronAPI.ipcRenderer);
Object.freeze(authAPI);
Object.freeze(fsBridge);
Object.freeze(s3SharedBridge);
Object.freeze(notifyAPI);
