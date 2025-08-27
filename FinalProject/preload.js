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

  getS3UploadUrl: (fileName) => ipcRenderer.invoke("get-s3-upload-url", fileName),

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
  listDocs: () => ipcRenderer.invoke("fs:listDocs"),
  readDoc: (arg) => ipcRenderer.invoke("fs:readDoc", { name: toName(arg) }),
  deleteDoc: (arg) => ipcRenderer.invoke("fs:deleteDoc", { name: toName(arg) }),
  open: (arg) => ipcRenderer.invoke("fs:open", { name: toName(arg) }),
  saveDoc: (nameOrObj, maybeContent) => {
    let name = "", content = "";
    if (typeof nameOrObj === "object") { name = toName(nameOrObj); content = nameOrObj?.content ?? ""; }
    else { name = toName(nameOrObj); content = maybeContent ?? ""; }
    return ipcRenderer.invoke("fs:saveDoc", { name, content });
  },
  openDoc: (arg) => ipcRenderer.invoke("fs:open", { name: toName(arg) }),
};

/* 전역 노출 */
contextBridge.exposeInMainWorld("electron", electronAPI);
contextBridge.exposeInMainWorld("auth", authAPI);
contextBridge.exposeInMainWorld("fsBridge", fsBridge);

Object.freeze(electronAPI);
Object.freeze(electronAPI.ipcRenderer);
Object.freeze(authAPI);
Object.freeze(fsBridge);

contextBridge.exposeInMainWorld("api", {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
});