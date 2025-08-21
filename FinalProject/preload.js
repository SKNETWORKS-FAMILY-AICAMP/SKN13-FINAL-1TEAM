/**
 * preload.js
 * ------------------------------------------------------------------
 * 목적:
 *  - Renderer(React) ↔ Main(Electron) 간 안전한 브릿지 제공.
 *  - ipcRenderer를 직접 노출하지 않고 필요한 API만 노출.
 *
 * 유지점:
 *  - ipcRenderer 래퍼
 *  - 윈도우 상태 질의/구독
 *  - S3 presigned URL
 *  - fsBridge (문서 CRUD)
 *
 * 변경점(핵심):
 *  - 변경  electron.openFeatureWindow(role) 추가
 *    → 로그인 성공 시 역할별 기능창(사원/관리자) 오픈.
 *  - 추가  electron.window.{minimize,maximizeToggle,close,...} 추가
 *    → 상단바(프레임리스)에서 창 제어 버튼이 작동하도록 IPC 노출.
 */

const { contextBridge, ipcRenderer } = require("electron");

/* ────────────────────────────────────────────────────────────
 * 공용 electron API
 * ──────────────────────────────────────────────────────────── */
const electronAPI = {
  /** 안전 래퍼: ipcRenderer 일부 기능만 노출 */
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

  /** 윈도우 상태 질의 */
  isWindowMaximized: () => ipcRenderer.invoke("check-maximized"),

  /** 윈도우 리사이즈 이벤트 구독/해제 */
  onWindowResize: (cb) => {
    const handler = (_evt, ...a) => cb?.(...a);
    ipcRenderer.on("window-resized", handler);
    return () => ipcRenderer.removeListener("window-resized", handler);
  },
  offWindowResize: (cb) => ipcRenderer.removeListener("window-resized", cb),

  /** S3 presigned URL 요청 */
  getS3UploadUrl: (fileName) => ipcRenderer.invoke("get-s3-upload-url", fileName),

  /** ✅ 변경: 역할별 기능 창 오픈 (사원/관리자) */
  openFeatureWindow: (role /* 'employee' | 'admin' */) =>
    ipcRenderer.invoke("open-feature-window", role),

  /** ✅ 추가: 창 제어 API (프레임리스 타이틀바 버튼용) */
  window: {
    /** 현재 창 최소화 */
    minimize: () => ipcRenderer.invoke("window:minimize"),
    /** 현재 창 최대화 토글 (최대화 ↔ 원복) */
    maximizeToggle: () => ipcRenderer.invoke("window:maximize-toggle"),
    /** 현재 창 닫기 */
    close: () => ipcRenderer.invoke("window:close"),

    // (선택) 개별 최대화/원복이 필요하면 사용
    maximize: () => ipcRenderer.invoke("window:maximize"),
    unmaximize: () => ipcRenderer.invoke("window:unmaximize"),
  },
};

/* ────────────────────────────────────────────────────────────
 * 파일시스템 Bridge (문서 CRUD)
 * - 모든 함수는 메인에 정의된 동일 채널로 invoke
 * - 인자 표준화(파일명만 넘김)
 * ──────────────────────────────────────────────────────────── */
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
  readDoc: (arg) => ipcRenderer.invoke("fs:readDoc", { filePath: arg }), // name 대신 filePath 사용
  deleteDoc: (arg) => ipcRenderer.invoke("fs:deleteDoc", { name: toName(arg) }),
  open: (arg) => ipcRenderer.invoke("fs:open", { name: toName(arg) }),
  saveDoc: (nameOrObj, maybeContent) => {
    let filePath = ""; // name 대신 filePath 사용
    let content = "";
    if (typeof nameOrObj === "object") {
      filePath = nameOrObj?.filePath ?? ""; // filePath 속성 사용
      content = nameOrObj?.content ?? "";
    } else {
      // 이 경우는 사용하지 않을 것이므로 그대로 둠
      filePath = toName(nameOrObj); // 기존 name 처리 로직
      content = maybeContent ?? "";
    }
    return ipcRenderer.invoke("fs:saveDoc", { filePath, content }); // name 대신 filePath 전달
  },
  /** 하위호환: 예전 코드에서 openDoc을 호출하는 경우 지원 */
  openDoc: (arg) => ipcRenderer.invoke("fs:open", { name: toName(arg) }),
  showSaveDialog: (options) => ipcRenderer.invoke("fs:showSaveDialog", options),
  showOpenDialog: (options) => ipcRenderer.invoke("fs:showOpenDialog", options), // 추가
};

/* ────────────────────────────────────────────────────────────
 * 전역 노출 (window.electron / window.fsBridge)
 * ──────────────────────────────────────────────────────────── */
contextBridge.exposeInMainWorld("electron", electronAPI);
contextBridge.exposeInMainWorld("fsBridge", fsBridge);

Object.freeze(electronAPI);
Object.freeze(electronAPI.ipcRenderer);
Object.freeze(fsBridge);
