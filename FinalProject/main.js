/**
 * main.js
 * ------------------------------------------------------------------
 * 목적:
 *  - Electron 메인 프로세스: 창 생성/제어, IPC 라우팅, FS/S3 유틸 등
 *
 * 유지점:
 *  - check-maximized / window-resized 브로드캐스트
 *  - get-s3-upload-url (presigned URL, lazy require)
 *  - fsBridge: listDocs / readDoc / saveDoc / deleteDoc / open
 *    (문서 루트 디렉터리: 환경변수 DOCS_BASE 또는 C:\testfiles)
 *
 * 변경점(핵심):
 *  - 변경  auth:success (renderer → main)
 *     → role에 따라 관리자/기능부 창 오픈
 *  - 변경 open-feature-window (preload → main)
 *     → 역할별 기능창을 직접 오픈(브라우저 테스트/수동 호출 대비)
 *  - 추가  window:* 창 제어 IPC(handle + legacy on)
 *     → 프레임리스 상단바 버튼이 모든 창에서 동작
 */

require("dotenv").config();

const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow = null;     // 로그인/챗봇 창
let featureWindow = null;  // 기능부 전용 창(사원)
let adminWindow = null;    // 관리자 전용 창

/* ────────────────────────────────────────────────────────────
 * 실행 환경 / URL
 * ──────────────────────────────────────────────────────────── */
const isDev = !!process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
const PROD_INDEX = path.join(__dirname, "frontend-ui", "dist", "index.html");

/* ────────────────────────────────────────────────────────────
 * 유틸: 문서 저장 루트 (환경변수 DOCS_BASE → 기본 C:\testfiles)
 * ──────────────────────────────────────────────────────────── */
function resolveBaseDir() {
  const fixed = process.env.DOCS_BASE || "C:\\testfiles";
  try {
    if (!fs.existsSync(fixed)) fs.mkdirSync(fixed, { recursive: true });
  } catch (e) {
    console.error("[FS] mkdir base failed:", e);
  }
  return fixed;
}
function safeJoin(base, target) {
  const out = path.join(base, target);
  if (!out.startsWith(base)) throw new Error("Path traversal");
  return out;
}

/* ────────────────────────────────────────────────────────────
 * 창 생성 함수들
 * ──────────────────────────────────────────────────────────── */
function createMainWindow() {
  if (mainWindow) return mainWindow;

  mainWindow = new BrowserWindow({
    width: 400,
    height: 580,
    minWidth: 400,
    minHeight: 580,
    frame: false,
    backgroundColor: "#ffffff",
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) mainWindow.loadURL(DEV_URL);
  else mainWindow.loadFile(PROD_INDEX);

  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });

  Menu.setApplicationMenu(null);

  mainWindow.on("resize", () => {
    mainWindow?.webContents?.send("window-resized");
  });
  mainWindow.on("close", () => {
    mainWindow?.webContents?.send("logout");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * 기능부 전용 창(사원). URL: ?feature=1&role=employee (또는 user)
 *  - App.jsx에서 이 쿼리를 읽어 FeatureShell(role) 렌더
 */
function createFeatureWindow(role = "employee") {
  if (featureWindow) {
    if (featureWindow.isMinimized()) featureWindow.restore();
    featureWindow.show();
    featureWindow.focus();
    return featureWindow;
  }

  featureWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    backgroundColor: "#ffffff",
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) featureWindow.loadURL(`${DEV_URL}?feature=1&role=${encodeURIComponent(role)}`);
  else featureWindow.loadFile(PROD_INDEX, { query: { feature: "1", role } });

  Menu.setApplicationMenu(null);

  featureWindow.on("closed", () => {
    featureWindow = null;
  });

  return featureWindow;
}

/**
 * 관리자 전용 창. URL: ?feature=1&role=admin
 */
function createAdminWindow() {
  if (adminWindow) {
    if (adminWindow.isMinimized()) adminWindow.restore();
    adminWindow.show();
    adminWindow.focus();
    return adminWindow;
  }

  adminWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    backgroundColor: "#ffffff",
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) adminWindow.loadURL(`${DEV_URL}?feature=1&role=admin`);
  else adminWindow.loadFile(PROD_INDEX, { query: { feature: "1", role: "admin" } });

  Menu.setApplicationMenu(null);

  adminWindow.on("closed", () => {
    adminWindow = null;
  });

  return adminWindow;
}

/* ────────────────────────────────────────────────────────────
 * 앱 라이프사이클
 * ──────────────────────────────────────────────────────────── */
app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* ────────────────────────────────────────────────────────────
 * IPC: 윈도우 상태 / 리사이즈 브로드캐스트
 * ──────────────────────────────────────────────────────────── */
ipcMain.handle("check-maximized", () => {
  const win = BrowserWindow.getFocusedWindow();
  return !!win?.isMaximized?.();
});

function broadcastResize() {
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents?.send?.("window-resized");
  });
}

app.on("browser-window-created", (_e, win) => {
  win.on("resize", broadcastResize);
  win.on("maximize", broadcastResize);
  win.on("unmaximize", broadcastResize);
});

/* ────────────────────────────────────────────────────────────
 * ✅ 추가: 창 제어 IPC (프레임리스 타이틀바 버튼용)
 *  - preload의 electron.window.* 가 여기로 invoke
 *  - 또한 레거시 send/on 채널(win:*, window-*)도 호환
 * ──────────────────────────────────────────────────────────── */
const getSenderWindow = (event) => BrowserWindow.fromWebContents(event.sender);

// invoke 기반(권장)
ipcMain.handle("window:minimize", (event) => {
  const win = getSenderWindow(event);
  win?.minimize();
  return true;
});
ipcMain.handle("window:maximize", (event) => {
  const win = getSenderWindow(event);
  if (!win) return false;
  win.maximize();
  win.webContents?.send?.("window-resized");
  return true;
});
ipcMain.handle("window:unmaximize", (event) => {
  const win = getSenderWindow(event);
  if (!win) return false;
  win.unmaximize();
  win.webContents?.send?.("window-resized");
  return true;
});
ipcMain.handle("window:maximize-toggle", (event) => {
  const win = getSenderWindow(event);
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  win.webContents?.send?.("window-resized");
  return true;
});
ipcMain.handle("window:close", (event) => {
  const win = getSenderWindow(event);
  win?.close();
  return true;
});

// 🔁 Legacy aliases (send/on) — 옛 채널 호환
ipcMain.on("win:minimize", (event) => getSenderWindow(event)?.minimize());
ipcMain.on("win:maximize", (event) => {
  const w = getSenderWindow(event);
  if (!w) return;
  if (w.isMaximized()) w.unmaximize();
  else w.maximize();
  w.webContents?.send?.("window-resized");
});
ipcMain.on("win:close", (event) => getSenderWindow(event)?.close());
ipcMain.on("window-minimize", (e) => getSenderWindow(e)?.minimize());
ipcMain.on("window-maximize", (e) => {
  const w = getSenderWindow(e);
  if (!w) return;
  if (w.isMaximized()) w.unmaximize();
  else w.maximize();
  w.webContents?.send?.("window-resized");
});
ipcMain.on("window-close", (e) => getSenderWindow(e)?.close());

/* ────────────────────────────────────────────────────────────
 * IPC: S3 presigned URL (lazy require)
 * ──────────────────────────────────────────────────────────── */
ipcMain.handle("get-s3-upload-url", async (_evt, fileName) => {
  try {
    // (유지) 실제 presign 유틸로 교체 가능
    // const { getPresignedUrl } = require("./server/presign");
    // return await getPresignedUrl(fileName);
    return { url: "https://example-presigned-url", fields: {}, fileName };
  } catch (e) {
    console.error("[S3] get-s3-upload-url error:", e);
    throw e;
  }
});

/* ────────────────────────────────────────────────────────────
 * 확장자 → MIME 타입 매핑 (유지)
 * ──────────────────────────────────────────────────────────── */
function extToMime(ext) {
  const map = {
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    csv: "text/csv",
    ts: "video/mp2t",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    zip: "application/zip",
    rar: "application/vnd.rar",
    "7z": "application/x-7z-compressed",
    tar: "application/x-tar",
    gz: "application/gzip",
    xml: "application/xml",
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    mjs: "application/javascript",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation",
  };
  return map[ext] || "application/octet-stream";
}

/* ────────────────────────────────────────────────────────────
 * 열람 기록 인덱스 (userData/opened-index.json) — 필요 시 유지/확장
 * ──────────────────────────────────────────────────────────── */
const OPENED_INDEX_PATH = path.join(app.getPath("userData"), "opened-index.json");
async function readOpenedIndex() {
  try {
    const raw = await fs.promises.readFile(OPENED_INDEX_PATH, "utf-8");
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}
async function upsertOpened(doc) {
  const cur = await readOpenedIndex();
  const next = [doc, ...cur.filter((d) => d.path !== doc.path)].slice(0, 50);
  await fs.promises.writeFile(OPENED_INDEX_PATH, JSON.stringify(next, null, 2), "utf-8");
}

/* ────────────────────────────────────────────────────────────
 * 파일 시스템 브릿지 (유지)
 *  - 리스트, 읽기, 저장, 삭제, OS로 열기
 *  - 베이스 디렉터리: DOCS_BASE 또는 C:\testfiles
 * ──────────────────────────────────────────────────────────── */
ipcMain.handle("fs:listDocs", async () => {
  const base = resolveBaseDir();
  const all = await fs.promises.readdir(base);
  const list = all.map((name) => ({ name })).filter(Boolean);
  return list;
});

ipcMain.handle("fs:readDoc", async (_evt, { name }) => {
  if (!name) throw new Error("filename required");
  const base = resolveBaseDir();
  const full = safeJoin(base, name);
  if (!fs.existsSync(full)) return { ok: false, reason: "not_found" };
  const content = await fs.promises.readFile(full, "utf-8");
  await upsertOpened({ path: full, name });
  return { ok: true, content, mime: extToMime(path.extname(name).slice(1)) };
});

ipcMain.handle("fs:saveDoc", async (_evt, { name, content }) => {
  if (!name) throw new Error("filename required");
  const base = resolveBaseDir();
  const full = safeJoin(base, name);
  await fs.promises.writeFile(full, content ?? "", "utf-8");
  await upsertOpened({ path: full, name });
  return { ok: true };
});

ipcMain.handle("fs:deleteDoc", async (_evt, { name }) => {
  if (!name) throw new Error("filename required");
  const base = resolveBaseDir();
  const full = safeJoin(base, name);
  if (fs.existsSync(full)) await fs.promises.unlink(full);
  return { ok: true };
});

// OS 기본앱으로 열기
ipcMain.handle("fs:open", async (_evt, { name }) => {
  if (!name) throw new Error("filename required");
  const base = resolveBaseDir();
  const full = safeJoin(base, name);
  if (!fs.existsSync(full)) return { ok: false, reason: "not_found" };
  await upsertOpened({ path: full, name });
  const r = await shell.openPath(full);
  return { ok: !r, reason: r || undefined };
});

/* ────────────────────────────────────────────────────────────
 * ✅ 변경: 로그인 성공 → 역할별 창 오픈
 *   - renderer(LoginPage.jsx)에서 auth:success 전송
 *   - role: 'employee' | 'admin'
 *   - 정책:
 *      * admin: 관리자 창을 전면 표시, 필요 시 mainWindow/featureWindow 숨김
 *      * employee: 기능부(사원) 창 추가, 메인(챗봇) 창은 유지
 * ──────────────────────────────────────────────────────────── */
ipcMain.on("auth:success", (_evt, payload) => {
  const role = payload?.role;
  if (!role) return;

  if (role === "admin") {
    createAdminWindow();
    featureWindow?.hide?.();
    mainWindow?.hide?.();
    return;
  }

  // 기본: 사원
  const mw = createMainWindow();
  mw.show();
  mw.focus();
  createFeatureWindow("employee");
});

/* ────────────────────────────────────────────────────────────
 * ✅ 변경: preload에서 역할별 기능 창 직접 열기
 *    - 브라우저 환경 등에서 테스트할 때도 사용 가능
 * ──────────────────────────────────────────────────────────── */
ipcMain.handle("open-feature-window", (_evt, role = "employee") => {
  if (role === "admin") return createAdminWindow();
  return createFeatureWindow(role);
});
