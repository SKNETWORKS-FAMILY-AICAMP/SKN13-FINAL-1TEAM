// ✅ 파일: main.js
/* 
  목적(Purpose)
  - Electron 메인 프로세스: 창 생성/제어(로그인/기능/관리자), IPC 라우팅, 파일/대화상자/간이 HTTP 서버 등 총괄.
  - '명시적' 로그아웃 요청(app:logout-request) 수신 시에만 각 창으로 'logout' 브로드캐스트를 보낸다.
  - 기능 창(FeatureWindow)와 관리자 창(AdminWindow)을 독립적으로 생성/표시한다.

  사용처(Where Used)
  - 앱 부팅(app.whenReady) 후 createMainWindow()로 로그인 창을 올린다.
  - 로그인 성공(auth:success) → role에 따라 기능/관리자 창 생성/표시.

  브리지/IPC(Bridges & IPC)
  - check-maximized / window:* : 프레임리스 창 제어
  - fs:* : 리스트/읽기/저장/삭제/열기 + 대화상자(showOpen/SaveDialog)
  - app:logout-request : 로그아웃 브로드캐스트 트리거
  - get-editor-content / update-editor-content : 기능 창의 에디터 내용 연동
  - open-feature-window : 임의로 기능/관리자 창 열기

  파일/경로(Notes)
  - resolveBaseDir(): DOCS_BASE 또는 C:\testfiles 경로 확보
  - safeJoin(): 베이스 경로 바깥 탈출(Path Traversal) 방지
  - OPENED_INDEX_PATH: 최근 열람 파일 인덱스(JSON) 관리

  추가(Added)
  - 간이 express 서버(8080): /get-document-content → 기능 창 렌더러에서 TipTap 내용 요청
  - dialog 핸들러: fs:showSaveDialog / fs:showOpenDialog
*/

require("dotenv").config();

const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require("electron"); // dialog 추가
const path = require("path");
const fs = require("fs");
const express = require("express"); // 간이 HTTP 서버

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

// 문서 베이스 경로 확보
function resolveBaseDir() {
  const fixed = process.env.DOCS_BASE || "C:\\testfiles";
  try {
    if (!fs.existsSync(fixed)) fs.mkdirSync(fixed, { recursive: true });
  } catch (e) {
    console.error("[FS] mkdir base failed:", e);
  }
  return fixed;
}
// 경로 탈출 방지 조인
function safeJoin(base, target) {
  const out = path.join(base, target);
  if (!out.startsWith(base)) throw new Error("Path traversal");
  return out;
}

// 창 디버그 이벤트 배선
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

// 메인(로그인) 창 생성
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

  // 창 리사이즈 브로드캐스트
  mainWindow.on("resize", () => {
    mainWindow?.webContents?.send("window-resized");
  });

  // 자동 로그아웃 브로드캐스트는 사용하지 않음(명시 요청 방식 정책 유지)
  // mainWindow.on("close", () => {
  //   mainWindow?.webContents?.send("logout");
  // });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

// 기능부(사원) 창 생성
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

  // 기능부 개발자 도구 나오는 기능
  if (isDev) featureWindow.webContents.openDevTools({ mode: "detach" });

  Menu.setApplicationMenu(null);

  featureWindow.on("closed", () => { featureWindow = null; });

  return featureWindow;
}

// 관리자 창 생성
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
 * 간이 HTTP 서버 (백엔드에서 프런트 content 요청)
 * ──────────────────────────────────────────────────────────── */
const expressApp = express();
const PORT = 8080;

// TipTap 에디터 콘텐츠 요청 엔드포인트
expressApp.get("/get-document-content", async (_req, res) => {
  try {
    if (featureWindow && !featureWindow.webContents.isLoading()) {
      // 렌더러로 에디터 콘텐츠 요청 (아래 IPC 핸들러와 연동)
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

// 서버 시작 로그
expressApp.listen(PORT, () => {
  console.log(`Electron HTTP server listening on port ${PORT}`);
});

// 앱 준비 시 메인 창 띄우기
app.whenReady().then(() => {
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
// 모든 창 닫힘 시 종료 (mac 제외)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// 윈도우 상태 IPC
ipcMain.handle("check-maximized", () => {
  const win = BrowserWindow.getFocusedWindow();
  return !!win?.isMaximized?.();
});
// 리사이즈 브로드캐스트
function broadcastResize() {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents?.send?.("window-resized"));
}
// 새 창 생성 시 상태 이벤트 와이어링
app.on("browser-window-created", (_e, win) => {
  win.on("resize", broadcastResize);
  win.on("maximize", broadcastResize);
  win.on("unmaximize", broadcastResize);
});

// 프레임리스 윈도우 제어 IPC
const getSenderWindow = (event) => BrowserWindow.fromWebContents(event.sender);
ipcMain.handle("window:minimize", (event) => { getSenderWindow(event)?.minimize(); return true; });
ipcMain.handle("window:maximize", (event) => { const w = getSenderWindow(event); if (!w) return false; w.maximize(); w.webContents?.send?.("window-resized"); return true; });
ipcMain.handle("window:unmaximize", (event) => { const w = getSenderWindow(event); if (!w) return false; w.unmaximize(); w.webContents?.send?.("window-resized"); return true; });
ipcMain.handle("window:maximize-toggle", (event) => { const w = getSenderWindow(event); if (!w) return false; w.isMaximized() ? w.unmaximize() : w.maximize(); w.webContents?.send?.("window-resized"); return true; });
ipcMain.handle("window:close", (event) => { getSenderWindow(event)?.close(); return true; });

/* 에디터 content IPC */
// 기능 창 → TipTap 내용 조회
ipcMain.handle("editor:get-content", async () => {
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
// 렌더러(챗봇) → 기능창 편집기에 업데이트 적용
ipcMain.on("editor:update-content", (_event, content) => {
  if (featureWindow) {
    featureWindow.webContents.send("editor:apply-update", content);
  }
});

/* S3 및 FS Bridge (원본 유지) */
// 프리사인 URL
ipcMain.handle("get-s3-upload-url", async (_evt, fileName) => {
  return { url: "https://example-presigned-url", fields: {}, fileName };
});
// 확장자 → MIME 매핑
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
// 최근 열람 인덱스 경로
const OPENED_INDEX_PATH = path.join(app.getPath("userData"), "opened-index.json");
// 인덱스 읽기
async function readOpenedIndex() { try { const raw = await fs.promises.readFile(OPENED_INDEX_PATH,"utf-8"); return JSON.parse(raw||"[]"); } catch { return []; } }
// 인덱스 upsert
async function upsertOpened(doc) {
  const path = require("path");
  const base = resolveBaseDir(); // 하드코딩 베이스 경로 (예: C:\testfiles)
  const norm = (p) => path.normalize(p).toLowerCase();

  // 베이스 내부 파일만 허용 + 실재하는 파일만 true
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

  // 실존하지 않으면 추가하지 않음
  const canAdd = incoming.path && await inBaseAndExists(incoming.path);

  // 동일 파일의 이전 기록 제거 + 소멸 파일 정리
  const cleaned = [];
  for (const d of cur) {
    if (!d || !d.path) continue;
    if (norm(d.path) === norm(incoming.path)) continue; // 같은 파일의 예전 기록 제거
    if (await inBaseAndExists(d.path)) cleaned.push(d); // 삭제/이동된 파일 기록 제거
  }

  // 최신 1행만 유지(파일당)
  const next = canAdd ? [incoming, ...cleaned] : cleaned;

  await fs.promises.writeFile(
    OPENED_INDEX_PATH,
    JSON.stringify(next, null, 2),
    "utf-8"
  );
}

// 파일 리스트
ipcMain.handle("fs:listDocs", async () => {
  const base = resolveBaseDir();
  const names = await fs.promises.readdir(base);

  const norm = (p) => path.normalize(p).toLowerCase();
  const opened = await readOpenedIndex();
  const openedMap = new Map(opened.map(d => [norm(d.path), d.opened_at]));

  // 임시/숨김/시스템 파일 필터
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
    if (skip(name)) continue;          // 필터 적용

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

// 파일 읽기 ({ name } 또는 { filePath })
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

// 파일 저장 ({ name, content } 또는 { filePath, content })
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

// 파일 삭제(휴지통 이동)
ipcMain.handle("fs:deleteDoc", async (_evt, { name }) => {
  const base = resolveBaseDir();
  const full = safeJoin(base, name);

  try {
    await shell.trashItem(full);   // OS 휴지통으로 이동
    return { ok: true };
  } catch (err) {
    console.error("trashItem failed:", err);
    return { ok: false, error: err.message };
  }
});

// OS 기본 프로그램으로 열기
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

// 파일 대화상자 (저장)
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
// 파일 대화상자 (열기)
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

// 역할별 창 오픈 (로그인 성공 후)
ipcMain.on("auth:success", (_evt, payload) => {
  const role = payload?.role;
  if (!role) return;
  if (role === "admin") { createAdminWindow(); featureWindow?.hide?.(); mainWindow?.hide?.(); return; }
  const mw = createMainWindow(); mw.show(); mw.focus(); createFeatureWindow("employee");
});

// 기능/관리자 창 열기 API
ipcMain.handle("open-feature-window", (_evt, role = "employee") => {
  if (role === "admin") createAdminWindow();
  else createFeatureWindow(role);
  return true;
});

// 분리된 ‘명시적’ 로그아웃 요청 처리  — 기본 스코프 'all'
ipcMain.on("app:logout-request", (event, scope = "all") => {
  // scope: 'current' | 'all'
  if (scope === "current") {
    const target = BrowserWindow.fromWebContents(event.sender);
    target?.webContents?.send("logout");
    return;
  }

  // 메인 로그인 창 표시 트리거(레거시 위치 유지)
  ipcMain.on("app:show-main", () => {
    const w = createMainWindow(); // 없으면 생성, 있으면 가져옴
    w.show();
    w.focus();
  });

  // 전체 창으로 브로드캐스트
  BrowserWindow.getAllWindows().forEach((w) => w.webContents?.send("logout"));
});

// 스마트 열기 (미지원/외부열기 분기)
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

// 레거시 on 채널(하위 호환)
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
