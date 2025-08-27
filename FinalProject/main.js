/**
 * main.js
 * ------------------------------------------------------------------
 * 목적:
 *  - Electron 메인 프로세스: 창 생성/제어, IPC 라우팅, FS/S3 유틸 등
 *  - [변경] 로그아웃 기능을 "명시 요청"으로만 브로드캐스트하도록 분리
 */

require("dotenv").config();

const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require("electron"); // ✅ dialog 추가
const path = require("path");
const fs = require("fs");
const express = require("express"); // ✅ 텍스트 코드에만 있던 express 추가

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

  // ❌ 텍스트 코드에는 있었지만, 기존 파일은 "명시로그아웃" 정책이라 유지: 자동 로그아웃 브로드캐스트는 생략
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

/* ────────────────────────────────────────────────────────────
 * ✅ 텍스트 코드 추가: HTTP 서버 (백엔드에서 프런트 content 요청)
 * ──────────────────────────────────────────────────────────── */
const expressApp = express();
const PORT = 8080;

expressApp.get("/get-document-content", async (_req, res) => {
  try {
    if (featureWindow && !featureWindow.webContents.isLoading()) {
      // ✅ 렌더러로 에디터 콘텐츠 요청 (아래 IPC 핸들러와 연동)
      const content = await featureWindow.webContents.invoke("get-editor-content");
      res.json({ content });
    } else {
      res.status(404).json({ error: "Feature window not active or ready." });
    }
  } catch (error) {
    console.error("Error getting document content from renderer:", error);
    res.status(500).json({ error: "Failed to get document content." });
  }
});

expressApp.listen(PORT, () => {
  console.log(`Electron HTTP server listening on port ${PORT}`);
});


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

/* ✅ 텍스트 코드 추가: 에디터 content 요청/브로드캐스트 */
ipcMain.handle("get-editor-content", async () => {
  try {
    if (featureWindow && !featureWindow.webContents.isLoading()) {
      // 렌더러의 window.getTiptapEditorContent()를 실행해서 HTML 가져오기
      const content = await featureWindow.webContents.executeJavaScript(`
        window.getTiptapEditorContent ? window.getTiptapEditorContent() : '';
      `);
      return content;
    }
    return "";
  } catch (error) {
    console.error("Error in get-editor-content IPC handler:", error);
    return "";
  }
});
// 렌더러(챗봇) → 기능창 편집기에 적용
ipcMain.on("update-editor-content", (_event, content) => {
  if (featureWindow) {
    featureWindow.webContents.send("apply-editor-update", content);
  }
});

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
async function upsertOpened(doc) {
  const path = require("path");
  const base = resolveBaseDir(); // 하드코딩 베이스 경로 (예: C:\testfiles)
  const norm = (p) => path.normalize(p).toLowerCase();

  const inBaseAndExists = async (p) => {
    try {
      const ap = norm(p);
      if (!ap.startsWith(norm(base))) return false;     // 베이스 폴더 밖이면 제외
      const st = await fs.promises.stat(p);
      return st.isFile();                               // 파일만 허용(폴더/링크 제외)
    } catch { return false; }
  };

  const cur = await readOpenedIndex();                 // [{path,name,opened_at}, ...]
  const now = new Date().toISOString();
  const incoming = {
    path: doc.path,
    name: doc.name,
    opened_at: doc.opened_at || now,                   // 열람 시각 기본값
  };

  // 새 항목이 실제로 존재하지 않으면 추가 자체를 하지 않음
  const canAdd = incoming.path && await inBaseAndExists(incoming.path);

  // 중복 제거 + 존재하지 않는 파일 기록 정리(컴팩션)
  const cleaned = [];
  for (const d of cur) {
    if (!d || !d.path) continue;
    if (norm(d.path) === norm(incoming.path)) continue; // 같은 파일의 예전 기록 제거
    if (await inBaseAndExists(d.path)) cleaned.push(d); // 삭제/이동된 파일 기록 제거
  }

  // 상한 없음: 모두 유지 (단, 파일당 1행 — 가장 최근만)
  const next = canAdd ? [incoming, ...cleaned] : cleaned;

  await fs.promises.writeFile(
    OPENED_INDEX_PATH,
    JSON.stringify(next, null, 2),
    "utf-8"
  );
}

/* 파일 리스트 */
ipcMain.handle("fs:listDocs", async () => {
  const base = resolveBaseDir();
  const names = await fs.promises.readdir(base);

  const norm = (p) => path.normalize(p).toLowerCase();
  const opened = await readOpenedIndex();
  const openedMap = new Map(opened.map(d => [norm(d.path), d.opened_at]));

  // ✅ 임시/숨김/시스템 파일 필터
  const skip = (name) => {
    const lower = name.toLowerCase();
    return (
      lower.startsWith('~$') ||        // Office lock (~$문서명.pptx / .docx)
      lower.endsWith('.tmp') ||        // 임시 확장자
      lower === 'thumbs.db' ||         // 윈도우 썸네일 DB
      lower.startsWith('.')            // 유닉스형 숨김파일(.git 등)
    );
  };

  const out = [];
  for (const name of names) {
    if (skip(name)) continue;          // 👈 필터 적용

    const full = safeJoin(base, name);
    const st = await fs.promises.stat(full).catch(() => null);
    if (!st || !st.isFile()) continue;

    const updatedAt = st.mtime.toISOString();
    const openedAt  = openedMap.get(norm(full)) || null;
    const last_seen = [openedAt, updatedAt].filter(Boolean)
      .sort((a,b)=>new Date(b)-new Date(a))[0] || null;

    out.push({ name, path: full, updated_at: updatedAt, opened_at: openedAt, last_seen });
  }

  out.sort((a,b)=>new Date(b.last_seen)-new Date(a.last_seen));
  return out;
});

/* 파일 읽기 (기존 시그니처 유지: { name }) */
ipcMain.handle("fs:readDoc", async (_evt, payload = {}) => {
  try {
    const { name, filePath } = payload;
    let full = "";
    let fileName = "";

    if (filePath && typeof filePath === "string") {
      // 절대경로(filePath) 직접 사용
      full = filePath;
      fileName = path.basename(full);
    } else if (name && typeof name === "string") {
      // 기존 방식: 베이스 디렉터리 + 파일명
      const base = resolveBaseDir();
      full = safeJoin(base, name);
      fileName = name;
    } else {
      throw new Error("filePath or name is required");
    }

    if (!fs.existsSync(full)) {
      return { ok: false, reason: "not_found" };
    }

    const content = await fs.promises.readFile(full, "utf-8");

    await upsertOpened({
      path: full,
      name: fileName,
      opened_at: new Date().toISOString(),
    });

    const ext = path.extname(full).slice(1).toLowerCase();
    return { ok: true, name: fileName, content, mime: extToMime(ext) };
  } catch (err) {
    console.error("fs:readDoc error:", err);
    return { ok: false, error: err.message };
  }
});

/* 파일 저장 — ✅ 호환 확장: { name, content } 또는 { filePath, content } 모두 허용 */
ipcMain.handle("fs:saveDoc", async (_evt, payload) => {
  try {
    const { name, filePath, content } = payload || {};
    let full = "";

    if (filePath) {
      // 새 구조: 절대경로 직접 저장
      full = filePath;
    } else if (name) {
      // 기존 구조: 베이스 디렉터리 + 파일명
      const base = resolveBaseDir();
      full = safeJoin(base, name);
    } else {
      throw new Error("filename or filePath required");
    }

    await fs.promises.writeFile(full, content ?? "", "utf-8");

    await upsertOpened({
      path: full,
      name: path.basename(full),
      opened_at: new Date().toISOString(),
    });

    return { ok: true };
  } catch (err) {
    console.error("fs:saveDoc error:", err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("fs:deleteDoc", async (_evt, { name }) => {
  const base = resolveBaseDir();
  const full = safeJoin(base, name);

  try {
    await shell.trashItem(full);   // ✅ OS 휴지통으로 이동
    return { ok: true };
  } catch (err) {
    console.error("trashItem failed:", err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("fs:open", async (_evt, { name }) => {
  const base = resolveBaseDir();
  const full = safeJoin(base, name);

  await upsertOpened({
    path: full,
    name,
    opened_at: new Date().toISOString(),   // 지금 열람한 시간 기록
  });

  await shell.openPath(full);              // OS 기본 프로그램으로 열기
  return { ok: true };
});

/* ✅ 텍스트 코드 추가: 파일 대화상자 */
ipcMain.handle("fs:showSaveDialog", async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    const result = await dialog.showSaveDialog(win, options);
    return result;
  } catch (err) {
    console.error("Error occurred in handler for 'fs:showSaveDialog':", err);
    return { canceled: true, error: err.message };
  }
});
ipcMain.handle("fs:showOpenDialog", async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    const result = await dialog.showOpenDialog(win, options);
    return result;
  } catch (err) {
    console.error("Error occurred in handler for 'fs:showOpenDialog':", err);
    return { canceled: true, error: err.message };
  }
});

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

/* ✅ 분리된 ‘명시적’ 로그아웃 요청 처리  — 기본 스코프를 'all'로 */
ipcMain.on("app:logout-request", (event, scope = "all") => {
  // scope: 'current' | 'all'
  if (scope === "current") {
    const target = BrowserWindow.fromWebContents(event.sender);
    target?.webContents?.send("logout");
    return;
  }

  ipcMain.on("app:show-main", () => {   // (원본 위치 유지)
    const w = createMainWindow(); // 없으면 생성, 있으면 가져옴
    w.show();
    w.focus();
  });

  // 전체 창(필요 시 role 필터 가능)
  BrowserWindow.getAllWindows().forEach((w) => w.webContents?.send("logout"));
});

/* 수정하기(스마트 오픈) */
ipcMain.handle("fs:openSmart", async (_evt, { name }) => {
  const base = resolveBaseDir();
  const full = safeJoin(base, name);
  const ext = path.extname(name).toLowerCase();

  await upsertOpened({ path: full, name, opened_at: new Date().toISOString() });

  if (ext === ".doc") {
    return { mode: "notImplemented", reason: ".doc 내부 편집은 준비 중입니다." };
  } else {
    await shell.openPath(full);
    return { mode: "external" };
  }
});

/* ✅ 텍스트 코드 추가: 레거시 on 채널도 지원 (필요시 사용) */
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
