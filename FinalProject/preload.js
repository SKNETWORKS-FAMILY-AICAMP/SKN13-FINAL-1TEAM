// ✅ 파일: preload.js
/* 
  목적(Purpose)
  - Renderer(React)와 Main(Electron) 사이에 안전한 브리지(Bridge) API를 노출한다.
  - window.electron: 공용 IPC 래퍼, 창 제어, 업로드 URL, 기능 창 오픈 등
  - window.auth: 전역 로그아웃 요청/수신 (requestLogout, onLogout, offLogout)
  - window.fsBridge: 문서 목록/읽기/저장/열기 등 파일시스템 래퍼

  사용처(Where Used)
  - 모든 렌더러(메인/기능/관리자) 창에서 window.electron/auth/fsBridge 로 접근
  - App.jsx, Sidebar, DocumentEditor 등에서 직접 호출

  보안(Notes)
  - contextIsolation: true / nodeIntegration: false 구성에서만 전역 객체로 노출
  - exposeInMainWorld 로 필요한 최소 API만 공개

  추가(Added)
  - showMain(): 메인 로그인 창 다시 띄우기 신호
  - authAPI: 로그아웃 전용 브릿지 (기본 scope='all')
  - fsBridge: 이름/경로 정규화(toName) 포함
*/

const { contextBridge, ipcRenderer } = require("electron");

// 공용 electron API (원본 유지)
const electronAPI = {
  // IPC 메서드 래퍼
  ipcRenderer: {
    // 메시지 전송 (fire-and-forget)
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    // invoke/handle 패턴
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    // 채널 수신(on)
    on: (channel, cb) => {
      const handler = (_evt, ...a) => cb?.(...a);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    // 1회성 수신(once)
    once: (channel, cb) => ipcRenderer.once(channel, (_evt, ...a) => cb?.(...a)),
    // 수신 해제(off)
    off: (channel, cb) =>
      cb ? ipcRenderer.removeListener(channel, cb) : ipcRenderer.removeAllListeners(channel),
    // 모든 리스너 제거
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  },

  // 창 최대화 여부 질의
  isWindowMaximized: () => ipcRenderer.invoke("check-maximized"),

  // 창 리사이즈 이벤트 구독/해제
  onWindowResize: (cb) => {
    const handler = (_evt, ...a) => cb?.(...a);
    ipcRenderer.on("window-resized", handler);
    return () => ipcRenderer.removeListener("window-resized", handler);
  },
  offWindowResize: (cb) => ipcRenderer.removeListener("window-resized", cb),

  // 업로드 프리사인 URL 요청
  getS3UploadUrl: (fileName) => ipcRenderer.invoke("get-s3-upload-url", fileName),

  // 기능 창 열기
  openFeatureWindow: (role) => ipcRenderer.invoke("open-feature-window", role),

  // 창 제어
  window: {
    // 최소화
    minimize: () => ipcRenderer.invoke("window:minimize"),
    // 최대화 토글
    maximizeToggle: () => ipcRenderer.invoke("window:maximize-toggle"),
    // 창 닫기
    close: () => ipcRenderer.invoke("window:close"),
    // 최대화
    maximize: () => ipcRenderer.invoke("window:maximize"),
    // 최대화 해제
    unmaximize: () => ipcRenderer.invoke("window:unmaximize"),
  },
};

// (추가) 메인 로그인 창 다시 띄우기
electronAPI.showMain = () => ipcRenderer.send("app:show-main");

// 로그아웃 전용 브리지 — 기본 스코프 'all'
const authAPI = {
  // 로그아웃 요청 (current | all)
  requestLogout: (scope = "all") => ipcRenderer.send("app:logout-request", scope),
  // 로그아웃 브로드캐스트 수신
  onLogout: (cb) => {
    const handler = (_evt, ...args) => cb?.(...args);
    ipcRenderer.on("logout", handler);
    return () => ipcRenderer.removeListener("logout", handler);
  },
  // 수신 해제
  offLogout: (cb) => ipcRenderer.removeListener("logout", cb),
};

// 파일시스템 Bridge (원본 유지)
// 파일명/경로에서 파일명 추출
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
  // 문서 목록
  listDocs: () => ipcRenderer.invoke("fs:listDocs"),
  // 문서 읽기
  readDoc: (arg) => ipcRenderer.invoke("fs:readDoc", { name: toName(arg) }),
  // 문서 삭제
  deleteDoc: (arg) => ipcRenderer.invoke("fs:deleteDoc", { name: toName(arg) }),
  // OS 기본 열기
  open: (arg) => ipcRenderer.invoke("fs:open", { name: toName(arg) }),
  // 저장 (name or {name, content})
  saveDoc: (nameOrObj, maybeContent) => {
    let name = "", content = "";
    if (typeof nameOrObj === "object") { name = toName(nameOrObj); content = nameOrObj?.content ?? ""; }
    else { name = toName(nameOrObj); content = maybeContent ?? ""; }
    return ipcRenderer.invoke("fs:saveDoc", { name, content });
  },
  // 문서 열기(별칭)
  openDoc: (arg) => ipcRenderer.invoke("fs:open", { name: toName(arg) }),
};

// 전역 노출
contextBridge.exposeInMainWorld("electron", electronAPI);
contextBridge.exposeInMainWorld("auth", authAPI);
contextBridge.exposeInMainWorld("fsBridge", fsBridge);

// 방어적 동결
Object.freeze(electronAPI);
Object.freeze(electronAPI.ipcRenderer);
Object.freeze(authAPI);
Object.freeze(fsBridge);

// (선택) 간단한 invoke API (과거 호환)
contextBridge.exposeInMainWorld("api", {
  // 임의 invoke
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
});
