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
  - editor:get-content / editor:update-content / editor:apply-update : 기능 창의 에디터 내용 연동
  - open-feature-window : 임의로 기능/관리자 창 열기

  파일/경로(Notes)
  - resolveBaseDir(): DOCS_BASE 또는 C:\ClickA Document 경로 확보
  - safeJoin(): 베이스 경로 바깥 탈출(Path Traversal) 방지
  - OPENED_INDEX_PATH: 최근 열람 파일 인덱스(JSON) 관리

  추가(Added)
  - 간이 express 서버(8080): /get-document-content → 기능 창 렌더러에서 TipTap 내용 요청
  - dialog 핸들러: fs:showSaveDialog / fs:showOpenDialog
*/

//=================================문서 목록 S3연결=========================================
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { pipeline } = require("node:stream");
const { promisify } = require("node:util");
const pipe = promisify(pipeline);

// 환경변수 또는 기본값
const AWS_REGION = process.env.AWS_REGION || "ap-northeast-2";
const S3_BUCKET  = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || "your-bucket-name";
const S3_ROOT    = process.env.S3_ROOT    || "documents/";   // 공유 루트 prefix

// ─────────────────────────────────────────────────────────────
// (신규) 공유 버킷 전용 환경변수
//   - 기존 AWS_S3_BUCKET(=S3_BUCKET)은 건드리지 않음(레거시/다른 기능용)
//   - 문서목록의 공유폴더(S3)만 S3_SHARED_BUCKET/S3_SHARED_ROOT 사용
// ─────────────────────────────────────────────────────────────
const S3_SHARED_BUCKET = process.env.S3_SHARED_BUCKET || "";
const S3_SHARED_ROOT = (process.env.S3_SHARED_ROOT || "")
  .replace(/^\/+/, "")
  .replace(/\/\/+/g, "/");   // "documents/" 등 허용(빈 값이면 루트)

const s3 = new S3Client({ region: AWS_REGION });

// 로컬 하드코딩 다운로드 경로 (열기 시 여기에 저장 후 OS로 열기)
const { app, ipcMain, shell, BrowserWindow, Menu, dialog } = require("electron");
const LOCAL_DOWNLOAD_DIR = path.join(app.getPath("documents"), "S3-Shared-Downloads");
async function ensureDir(p) { await fs.promises.mkdir(p, { recursive: true }).catch(() => {}); }
function normPrefix(p) {
  if (!p) return S3_ROOT;
  if (!p.startsWith(S3_ROOT)) return (S3_ROOT + p).replaceAll("//", "/");
  return p.endsWith("/") ? p : `${p}/`;
}

// 공유 버킷용 prefix 조립 (root("") + 사용자 prefix → 끝은 "/"로 통일)
function buildPrefix(root, userPrefix) {
  const p = (userPrefix || "").replace(/^\/+/, "");
  let out = (root + p).replace(/\/\/+/g, "/"); // root가 ""일 수도 있음
  if (out && !out.endsWith("/")) out += "/";
  return out;
}

// [ADD-2] IPC 핸들러 추가 (기존 fs:* 핸들러는 수정 없이 그대로)
ipcMain.handle("s3:list", async (_evt, { prefix }) => {
  const Prefix = normPrefix(prefix);
  const out = await s3.send(new ListObjectsV2Command({
    Bucket: S3_BUCKET,
    Prefix,
    Delimiter: "/",         // 손자 이하 차단(직계만 노출)
    MaxKeys: 500,           // 과도 로드 방지
  }));

  const folders = (out.CommonPrefixes || []).map(cp => {
    const pfx = cp.Prefix; // 예: documents/a/b/
    const name = pfx.slice(Prefix.length).replace(/\/$/, "");
    return { id: pfx, name, prefix: pfx };
  });

  const files = (out.Contents || [])
    .filter(obj => obj.Key !== Prefix && !obj.Key.endsWith("/"))
    .map(obj => ({
      id: obj.Key,
      key: obj.Key,
      name: obj.Key.slice(Prefix.length),
      size: obj.Size,
      lastModified: obj.LastModified?.toISOString?.() || null,
    }));

  return { prefix: Prefix, folders, files };
});

ipcMain.handle("s3:downloadAndOpen", async (_evt, { key, saveAs }) => {
  await ensureDir(LOCAL_DOWNLOAD_DIR);
  const filename = saveAs || path.basename(key);
  const target = path.join(LOCAL_DOWNLOAD_DIR, filename);

  const res = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  await pipe(res.Body, fs.createWriteStream(target));

  await shell.openPath(target);   // 로컬 파일로 열기
  return { localPath: target };
});

/* [ADD] S3에 로컬 경로의 파일을 업로드하는 IPC
  - localPath: 로컬 파일 절대경로
  - destPrefix: 업로드할 S3 prefix (예: "documents/" 또는 "")
  - Key = buildPrefix(S3_SHARED_ROOT, destPrefix) + path.basename(localPath)
*/
ipcMain.handle("s3shared:uploadFromPath", async (_evt, { localPath, destPrefix = "" }) => {
  if (!S3_SHARED_BUCKET) throw new Error("S3_SHARED_BUCKET not set");
  if (!localPath) throw new Error("localPath required");

  // Key 계산: 루트/사용자 prefix + 파일명
  const keyPrefix = buildPrefix(S3_SHARED_ROOT, destPrefix); // "" 또는 "documents/" 등
  const key = keyPrefix + path.basename(localPath);

  // 스트림으로 업로드
  const Body = fs.createReadStream(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: S3_SHARED_BUCKET,
    Key: key,
    Body,
  }));

  return { ok: true, key };
});


/* ============================================================================
 *  🔹 공유 버킷 전용 IPC — 문서 목록(S3)에서만 사용
 *     • s3shared:list               : 현재 prefix의 '직계 자식'만 조회(손자 차단)
 *     • s3shared:downloadAndOpen    : 다운로드 후 OS 기본앱으로 열기
 * ============================================================================ */

// 목록: 루트("")이면 CommonPrefixes로 "documents/ logs/ temp/" 같은 폴더들이 온다
ipcMain.handle("s3shared:list", async (_evt, { prefix = "" }) => {
  if (!S3_SHARED_BUCKET) throw new Error("S3_SHARED_BUCKET not set");

  const Prefix = buildPrefix(S3_SHARED_ROOT, prefix);  // "" 가능(루트)
  const out = await s3.send(new ListObjectsV2Command({
    Bucket: S3_SHARED_BUCKET,
    Prefix,
    Delimiter: "/",             // 직계(child)만, 손자 이상 차단
    MaxKeys: 500,               // 과도 로드 방지
  }));

  // 폴더
  const folders = (out.CommonPrefixes || []).map(cp => {
    const pfx = cp.Prefix;                                  // 예: "documents/"
    const name = Prefix ? pfx.slice(Prefix.length) : pfx;   // 예: "documents/"
    return { id: pfx, name: name.replace(/\/$/, ""), prefix: pfx };
  });

  // 파일
  const files = (out.Contents || [])
    .filter(obj => obj.Key !== Prefix && !obj.Key.endsWith("/"))
    .map(obj => ({
      id: obj.Key,
      key: obj.Key,
      name: Prefix ? obj.Key.slice(Prefix.length) : obj.Key,  // 상대 경로명
      size: obj.Size,
      lastModified: obj.LastModified?.toISOString?.() || null,
    }));

  return { prefix: Prefix, folders, files };
});

// 다운로드 후 OS로 열기
ipcMain.handle("s3shared:downloadAndOpen", async (_evt, { key, saveAs }) => {
  if (!S3_SHARED_BUCKET) throw new Error("S3_SHARED_BUCKET not set");
  if (!key) throw new Error("key required");

  await ensureDir(LOCAL_DOWNLOAD_DIR);
  const filename = saveAs || path.basename(key);
  const target = path.join(LOCAL_DOWNLOAD_DIR, filename);

  const res = await s3.send(new GetObjectCommand({ Bucket: S3_SHARED_BUCKET, Key: key }));
  await pipe(res.Body, fs.createWriteStream(target));

  await shell.openPath(target);   // 로컬 파일로 열기
  return { localPath: target };
});


// =================================================================================

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
  const fixed = process.env.DOCS_BASE || "C:\\ClickA Document";
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
      const content = await featureWindow.webContents.executeJavaScript(`
        window.getTiptapEditorContent ? window.getTiptapEditorContent() : ''
      `);
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
  // ✅ 시작 직후 베이스 폴더 보장 (없으면 생성)
  resolveBaseDir();

  // 그 다음 로그인 창 생성
  createMainWindow();

  app.on("activate", () => {
    // (선택) 맥 재활성화 시에도 한 번 더 보장 — 중복 호출 무해
    resolveBaseDir();
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
      const content = await featureWindow.webContents.executeJavaScript(`
        window.getTiptapEditorContent ? window.getTiptapEditorContent() : ''
      `);
      return content;
    }
    return "";
  } catch (error) {
    console.error("Error in editor:get-content IPC handler:", error);
    return "";
  }
});

// 챗창 → 기능창 편집기 업데이트 적용
ipcMain.on("editor:update-content", (_event, content) => {
  if (featureWindow) {
    featureWindow.webContents.send("editor:apply-update", content);
  }
});

/* S3 및 FS Bridge (원본 유지) */
// 프리사인드 업로드 URL 발급 (문자열/객체 모두 호환)
ipcMain.handle("get-s3-upload-url", async (_evt, payload) => {
  try {
    const isString = typeof payload === "string";
    const {
      filename = isString ? payload : "",
      space = "shared",
      dir = "",
      contentType = "application/octet-stream",
    } = isString ? {} : (payload || {});

    if (!filename) {
      return { error: "filename is required" };
    }

    // 백엔드 presigned API 주소 (환경변수로 주입 권장)
    // 예: PRESIGNED_UPLOAD_URL=http://localhost:8000/presigned/upload-url
    const ENDPOINT =
      process.env.PRESIGNED_UPLOAD_URL ||
      "http://localhost:8000/presigned/upload-url"; // 필요에 맞게

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        space,
        file_name: filename,
        content_type: contentType,
        dir, // ← 현재 폴더 prefix를 프론트에서 넘길 수 있음
      }),
    });

    if (!res.ok) {
      throw new Error(`presigned api error: HTTP ${res.status}`);
    }

    const json = await res.json();

    // 프론트 호환을 위해 url/uploadUrl 둘 다 채워줌
    const uploadUrl = json.uploadUrl || json.url;
    return {
      uploadUrl,
      url: uploadUrl, // 기존 코드 호환
      fileKey: json.fileKey,
      displayName: json.displayName || json.resolvedName || filename,
    };
  } catch (e) {
    console.error("get-s3-upload-url error:", e);
    return { error: String(e?.message || e) };
  }
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
  const base = resolveBaseDir(); // 하드코딩 베이스 경로 (예: C:\ClickA Document)
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

// ✅✅ (중요) fs:pickFiles / fs:readFile 은 “최상위에서 한 번만” 등록
ipcMain.removeHandler("fs:pickFiles");
ipcMain.handle("fs:pickFiles", async (event, { defaultSubdir } = {}) => {
  const base = resolveBaseDir();
  await fs.promises.mkdir(base, { recursive: true }).catch(() => {});
  const defaultPath = defaultSubdir ? path.join(base, defaultSubdir) : base;

  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: "파일 선택",
    defaultPath,                                                 // ← 시작 폴더 강제
    properties: ["openFile", "multiSelections"]
    // filters: [{ name: "문서", extensions: ["pdf","docx","pptx","txt"] }]
  });
  return result; // { canceled, filePaths: [...] }
});

ipcMain.removeHandler("fs:readFile");
ipcMain.handle("fs:readFile", async (_evt, filePath) => {
  const buf = await fs.promises.readFile(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

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

// 바이너리 바이트를 C:\ClickA Document에 저장 (파일명 충돌 시 자동 번호 증가)
ipcMain.handle("fs:saveBytes", async (_evt, { filename, bytes }) => {
  const base = resolveBaseDir();
  const safeName = (filename || "download.bin").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();

  // 이름 충돌 회피
  const ext = path.extname(safeName);
  const stem = path.basename(safeName, ext);
  let candidate = safeName, i = 1;
  while (fs.existsSync(path.join(base, candidate))) {
    candidate = `${stem}_(${i})${ext}`;
    i++;
  }

  const full = path.join(base, candidate);
  await fs.promises.writeFile(full, Buffer.from(bytes));
  await upsertOpened({ path: full, name: candidate, opened_at: new Date().toISOString() });
  return { ok: true, path: full, name: candidate };
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
