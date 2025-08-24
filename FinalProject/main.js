/**
 * main.js
 * ------------------------------------------------------------------
 * 목적:
 *  - Electron 메인 프로세스: 창 생성/제어, IPC 라우팅, FS/S3 유틸 등
 *  - [변경] 로그아웃 기능을 "명시 요청"으로만 브로드캐스트하도록 분리
 */
///

require("dotenv").config();

const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");

process.on("uncaughtException", (err) => {
  console.error("[MAIN] uncaughtException:", err?.name, err?.message, err?.stack);
});
process.on("unhandledRejection", (reason) => {
  console.error("[MAIN] unhandledRejection:", reason);
});

let mainWindow = null;
let featureWindow = null;
let adminWindow = null;

const isDev = !!process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
const PROD_INDEX = path.join(__dirname, "frontend-ui", "dist", "index.html");

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

function wireWindowDebugEvents(win, label) {
  win.on("focus", () => console.log(`[WIN:${label}] focus (id=${win.id})`));
  win.on("blur", () => console.log(`[WIN:${label}] blur (id=${win.id})`));
  win.webContents.on("did-start-loading", () => console.log(`[WIN:${label}] did-start-loading`));
  win.webContents.on("did-finish-load", () => console.log(`[WIN:${label}] did-finish-load URL=${win.webContents.getURL?.()}`));
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[WIN:${label}] did-fail-load`, { code, desc, url });
  });
  win.on("closed", () => console.log(`[WIN:${label}] closed (id=${win.id})`));
}

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
  wireWindowDebugEvents(mainWindow, "main");

  if (isDev) mainWindow.loadURL(DEV_URL);
  else mainWindow.loadFile(PROD_INDEX);

  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });

  Menu.setApplicationMenu(null);

  mainWindow.on("resize", () => {
    mainWindow?.webContents?.send("window-resized");
  });

  // ❌ 창 닫힘 → 로그아웃 신호는 제거(원치 않는 로그아웃 방지)
  // mainWindow.on("close", () => {
  //   mainWindow?.webContents?.send("logout");
  // });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

/** 기능부(사원) 창 */
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
  wireWindowDebugEvents(featureWindow, "feature");

  if (isDev) featureWindow.loadURL(`${DEV_URL}?feature=1&role=${encodeURIComponent(role)}`);
  else featureWindow.loadFile(PROD_INDEX, { query: { feature: "1", role } });

  Menu.setApplicationMenu(null);

  featureWindow.on("closed", () => { featureWindow = null; });

  return featureWindow;
}

/** 관리자 창 */
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
  wireWindowDebugEvents(adminWindow, "admin");

  if (isDev) adminWindow.loadURL(`${DEV_URL}?feature=1&role=admin`);
  else adminWindow.loadFile(PROD_INDEX, { query: { feature: "1", role: "admin" } });

  Menu.setApplicationMenu(null);

  adminWindow.on("closed", () => { adminWindow = null; });

  return adminWindow;
}

app.whenReady().then(() => {
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* 윈도우 상태 IPC */
ipcMain.handle("check-maximized", () => {
  const win = BrowserWindow.getFocusedWindow();
  return !!win?.isMaximized?.();
});
function broadcastResize() {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents?.send?.("window-resized"));
}
app.on("browser-window-created", (_e, win) => {
  win.on("resize", broadcastResize);
  win.on("maximize", broadcastResize);
  win.on("unmaximize", broadcastResize);
});

/* 프레임리스 윈도우 제어 IPC */
const getSenderWindow = (event) => BrowserWindow.fromWebContents(event.sender);
ipcMain.handle("window:minimize", (event) => { getSenderWindow(event)?.minimize(); return true; });
ipcMain.handle("window:maximize", (event) => { const w = getSenderWindow(event); if (!w) return false; w.maximize(); w.webContents?.send?.("window-resized"); return true; });
ipcMain.handle("window:unmaximize", (event) => { const w = getSenderWindow(event); if (!w) return false; w.unmaximize(); w.webContents?.send?.("window-resized"); return true; });
ipcMain.handle("window:maximize-toggle", (event) => { const w = getSenderWindow(event); if (!w) return false; w.isMaximized() ? w.unmaximize() : w.maximize(); w.webContents?.send?.("window-resized"); return true; });
ipcMain.handle("window:close", (event) => { getSenderWindow(event)?.close(); return true; });

/* S3 및 FS Bridge (원본 유지) */
ipcMain.handle("get-s3-upload-url", async (_evt, fileName) => {
  return { url: "https://example-presigned-url", fields: {}, fileName };
});
function extToMime(ext) {
  const map = { txt:"text/plain", md:"text/markdown", json:"application/json", pdf:"application/pdf",
    doc:"application/msword", docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls:"application/vnd.ms-excel", xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt:"application/vnd.ms-powerpoint", pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
    jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", gif:"image/gif", webp:"image/webp", svg:"image/svg+xml",
    csv:"text/csv", ts:"video/mp2t", mp4:"video/mp4", mp3:"audio/mpeg", wav:"audio/wav", ogg:"audio/ogg",
    zip:"application/zip", rar:"application/vnd.rar", "7z":"application/x-7z-compressed", tar:"application/x-tar",
    gz:"application/gzip", xml:"application/xml", html:"text/html", css:"text/css", js:"application/javascript",
    mjs:"application/javascript", odt:"application/vnd.oasis.opendocument.text", ods:"application/vnd.oasis.opendocument.spreadsheet",
    odp:"application/vnd.oasis.opendocument.presentation" };
  return map[ext] || "application/octet-stream";
}
const OPENED_INDEX_PATH = path.join(app.getPath("userData"), "opened-index.json");
async function readOpenedIndex() { try { const raw = await fs.promises.readFile(OPENED_INDEX_PATH,"utf-8"); return JSON.parse(raw||"[]"); } catch { return []; } }
async function upsertOpened(doc) { const cur = await readOpenedIndex(); const next = [doc, ...cur.filter((d)=>d.path!==doc.path)].slice(0,50); await fs.promises.writeFile(OPENED_INDEX_PATH, JSON.stringify(next,null,2),"utf-8"); }
ipcMain.handle("fs:listDocs", async () => { const base=resolveBaseDir(); const all=await fs.promises.readdir(base); return all.map((name)=>({name})).filter(Boolean); });
ipcMain.handle("fs:readDoc", async (_evt,{name}) => { if(!name) throw new Error("filename required"); const base=resolveBaseDir(); const full=safeJoin(base,name); if(!fs.existsSync(full)) return {ok:false,reason:"not_found"}; const content=await fs.promises.readFile(full,"utf-8"); await upsertOpened({path:full,name}); return {ok:true,content,mime:extToMime(path.extname(name).slice(1))}; });
ipcMain.handle("fs:saveDoc", async (_evt,{name,content}) => { if(!name) throw new Error("filename required"); const base=resolveBaseDir(); const full=safeJoin(base,name); await fs.promises.writeFile(full,content ?? "","utf-8"); await upsertOpened({path:full,name}); return {ok:true}; });
ipcMain.handle("fs:deleteDoc", async (_evt,{name}) => { if(!name) throw new Error("filename required"); const base=resolveBaseDir(); const full=safeJoin(base,name); if(fs.existsSync(full)) await fs.promises.unlink(full); return {ok:true}; });
ipcMain.handle("fs:open", async (_evt,{name}) => { if(!name) throw new Error("filename required"); const base=resolveBaseDir(); const full=safeJoin(base,name); if(!fs.existsSync(full)) return {ok:false,reason:"not_found"}; await upsertOpened({path:full,name}); const r=await shell.openPath(full); return {ok:!r,reason:r||undefined}; });

/* 역할별 창 오픈 */
ipcMain.on("auth:success", (_evt, payload) => {
  const role = payload?.role;
  if (!role) return;
  if (role === "admin") { createAdminWindow(); featureWindow?.hide?.(); mainWindow?.hide?.(); return; }
  const mw = createMainWindow(); mw.show(); mw.focus(); createFeatureWindow("employee");
});
ipcMain.handle("open-feature-window", (_evt, role = "employee") => {
  if (role === "admin") createAdminWindow();
  else createFeatureWindow(role);
  return true;
});

// 전역 로그아웃 요청
ipcMain.on("app:logout-request", (event, scope = "all") => {
  console.log("[MAIN] app:logout-request scope=", scope);

  // 1) 모든 창에 logout 브로드캐스트
  if (scope === "current") {
    const w = BrowserWindow.fromWebContents(event.sender);
    w?.webContents?.send("logout");
  } else {
    BrowserWindow.getAllWindows().forEach((w) => w?.webContents?.send("logout"));
  }

  // 2) ✅ 전역 로그아웃이면 '항상' 메인(로그인) 창을 화면에 띄움
  //    (관리자/기능부 어디서 눌러도 동일)
  if (scope !== "current") {
    const mw = createMainWindow();          // 없으면 만들고, 있으면 재사용
    try { if (mw.isMinimized?.()) mw.restore(); } catch {}
    if (!mw.isVisible?.()) mw.show();
    mw.focus();
    // 포커스가 간혹 안 잡히는 환경 대비 트릭
    mw.setAlwaysOnTop?.(true, "screen-saver");
    setTimeout(() => mw.setAlwaysOnTop?.(false), 0);
    console.log("[MAIN] show+focus mainWindow id=", mw?.id);
  }
});

