/**
 * main.js
 * ------------------------------------------------------------------
 * 목적:
 *  - Electron 메인 프로세스: 창 생성/제어, IPC 라우팅, FS/S3 유틸 등
 *  - 트레이 아이콘(열기/종료), 창 닫을 때 숨김, 종료 시 자동 로그아웃
 *  - '사원'의 경우 "열기" 시 챗봇 + 기능부 두 창 모두 복귀
 *  - PROD/DEV 모두 해시 라우트(#/feature, #/chat)로 통일
 *  - 챗봇 창은 최소 크기 그대로 시작(초기 width/height = minWidth/minHeight)
 */

/**
 * main.js
 * ------------------------------------------------------------------
 * 목적:
 *  - Electron 메인 프로세스: 창 생성/제어, IPC 라우팅, FS/S3 유틸 등
 *  - 트레이 아이콘(열기/종료), 창 닫을 때 숨김, 종료 시 자동 로그아웃
 *  - '사원'의 경우 "열기" 시 챗봇 + 기능부 두 창 모두 복귀
 *  - PROD/DEV 모두 해시 라우트(#/feature, #/chat)로 통일
 *  - 챗봇 창은 최소 크기 그대로 시작(초기 width/height = minWidth/minHeight)
 */

 //=================================문서 목록 S3연결=========================================
const fs = require("node:fs");
const path = require("node:path");

// Electron 환경에서 한글 출력을 위한 설정
if (process.platform === 'win32') {
  // Windows에서 콘솔 출력 인코딩 설정
  try {
    const { spawn } = require('child_process');
    // chcp 65001 (UTF-8) 설정 시도
    spawn('chcp', ['65001'], { shell: true, stdio: 'ignore' });
  } catch (error) {
    // 설정 실패해도 앱은 계속 실행
  }
}

const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { pipeline } = require("node:stream");
const { promisify } = require("node:util");
const pipe = promisify(pipeline);

// 환경변수 또는 기본값
const AWS_REGION = process.env.AWS_REGION || "ap-northeast-2";
const S3_BUCKET = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || "clickabbbucket";
const S3_ROOT = process.env.S3_ROOT || "documents/";

// (신규) 공유 버킷 전용 환경변수
const S3_SHARED_BUCKET = process.env.S3_SHARED_BUCKET || "clickabbbucket";
const S3_SHARED_ROOT = process.env.S3_SHARED_ROOT || "";

//===================  이 아래 함수를 바꿔주세요 ===============================
const s3 = new S3Client({ region: AWS_REGION });
//=====================이 위에 함수를 바꿔주세요 ===============================
const {
  app,
  ipcMain,
  shell,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  dialog,
  globalShortcut,
  screen,
} = require("electron");

// 윈도우 작업표시줄/트레이 아이콘 정상 표시용
app.setAppUserModelId("com.yourteam.clicka");


// 📂 고정 기본 문서 디렉토리: C:\ClickA Documents
const FIXED_DOCS_PATH = "C:\\ClickA Documents";

async function ensureDir(p) {
  await fs.promises.mkdir(p, { recursive: true }).catch(() => {});
}

function ensureDocumentsFolder() {
  if (!fs.existsSync(FIXED_DOCS_PATH)) {
    fs.mkdirSync(FIXED_DOCS_PATH, { recursive: true });
    console.log("[MAIN] Created folder:", FIXED_DOCS_PATH);
  } else {
    console.log("[MAIN] Folder exists:", FIXED_DOCS_PATH);
  }
}

// KST 시각을 ISO로 반환 + ms 타임스탬프도 함께 계산
function nowKST() {
  const now = new Date();
  const localOffsetMin = now.getTimezoneOffset(); // 분 단위 (UTC - Local)
  const kstOffsetMin = -9 * 60; // (UTC - KST) = -540
  const diffMs = (kstOffsetMin - localOffsetMin) * 60 * 1000;
  const kstDate = new Date(now.getTime() + diffMs);
  return { iso: kstDate.toISOString(), ms: kstDate.getTime() };
}

// [ADD] 창 정리 유틸
function destroyFeatureWindows() {
  try { featureWindow?.destroy?.(); } catch {}
  try { chatWindow?.destroy?.(); } catch {}
  try { adminWindow?.destroy?.(); } catch {}
  featureWindow = null;
  chatWindow = null;
  adminWindow = null;
}


function isTempOrSystemFile(name) {
  const lower = String(name || "").toLowerCase().trim();
  if (lower.startsWith("~$")) return true;                 // Office 잠금 파일(~$...)
  if (lower.startsWith("._")) return true;                 // macOS resource fork
  if (lower === "thumbs.db" || lower === "desktop.ini") return true;
  if (lower === ".ds_store" || lower === ".dsstore") return true;
  if (lower.endsWith(".tmp") || lower.endsWith(".temp")) return true;
  if (lower.endsWith(".crdownload") || lower.endsWith(".part")) return true;
  return false;
}

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

/* ============================================================================
 *   (기존) S3/공유버킷 IPC — 원본 유지
 * ==========================================================================*/
ipcMain.handle("s3:list", async (_evt, { prefix }) => {
  const Prefix = normPrefix(prefix);
  const out = await s3.send(
    new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix,
      Delimiter: "/",
      MaxKeys: 500,
    })
  );

  const folders = (out.CommonPrefixes || []).map((cp) => {
    const pfx = cp.Prefix;
    const name = pfx.slice(Prefix.length).replace(/\/$/, "");
    return { id: pfx, name, prefix: pfx };
  });

  const files = (out.Contents || [])
    .filter((obj) => obj.Key !== Prefix && !obj.Key.endsWith("/"))
    .map((obj) => ({
      id: obj.Key,
      key: obj.Key,
      name: obj.Key.slice(Prefix.length),
      size: obj.Size,
      lastModified: obj.LastModified?.toISOString?.() || null,
    }));

  return { prefix: Prefix, folders, files };
});

/* [ADD] S3에 로컬 경로의 파일을 업로드하는 IPC */
ipcMain.handle("s3shared:uploadFromPath", async (_evt, { localPath, destPrefix = "" }) => {
  if (!S3_SHARED_BUCKET) throw new Error("S3_SHARED_BUCKET not set");
  if (!localPath) throw new Error("localPath required");

  const keyPrefix = buildPrefix(S3_SHARED_ROOT, destPrefix);
  const key = keyPrefix + path.basename(localPath);

  const Body = fs.createReadStream(localPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_SHARED_BUCKET,
      Key: key,
      Body,
    })
  );

  return { ok: true, key };
});

ipcMain.handle("fs:openSmart", async (_evt, { name }) => {
  try {
    const base = resolveBaseDir();
    const full = safeJoin(base, name);
    if (!fs.existsSync(full)) return null; // 프런트에서 외부열기 폴백

    await upsertOpened({ path: full, name });
    const r = await shell.openPath(full); // OS 기본 앱으로 열기
    return { mode: "external", ok: !r, reason: r || undefined };
  } catch (e) {
    return null; // 프런트 폴백 경로로
  }
});


/* ============================================================================
 *  공유 버킷 전용 IPC — 문서 목록(S3)
 * ========================================================================== */
ipcMain.handle("s3shared:list", async (_evt, { prefix = "", continuationToken = null }) => {
  if (!S3_SHARED_BUCKET) throw new Error("S3_SHARED_BUCKET not set");

  const Prefix = buildPrefix(S3_SHARED_ROOT, prefix);
  const out = await s3.send(
    new ListObjectsV2Command({
      Bucket: S3_SHARED_BUCKET,
      Prefix,
      Delimiter: "/",
      MaxKeys: 500,
      ContinuationToken: continuationToken || undefined,
    })
  );

  const folders = (out.CommonPrefixes || []).map((cp) => {
    const pfx = cp.Prefix;
    const name = Prefix ? pfx.slice(Prefix.length) : pfx;
    return { id: pfx, name: name.replace(/\/$/, ""), prefix: pfx };
  });

  const files = (out.Contents || [])
    .filter((obj) => obj.Key !== Prefix && !obj.Key.endsWith("/"))
    .map((obj) => ({
      id: obj.Key,
      key: obj.Key,
      name: obj.Key.slice(Prefix.length),
      size: obj.Size,
      lastModified: obj.LastModified?.toISOString?.() || null,
    }));

  return {
    prefix: Prefix,
    folders,
    files,
    isTruncated: !!out.IsTruncated,
    nextContinuationToken: out.NextContinuationToken || null,
  };
});

ipcMain.handle("s3shared:downloadAndOpen", async (_evt, { key, saveAs }) => {
  if (!S3_SHARED_BUCKET) throw new Error("S3_SHARED_BUCKET not set");

  const base = resolveBaseDir();       // => C:\ClickA Documents
  await ensureDir(base);
  const filename = saveAs || path.basename(key);
  const target = path.join(base, filename);

  const res = await s3.send(new GetObjectCommand({ Bucket: S3_SHARED_BUCKET, Key: key }));
  await pipe(res.Body, fs.createWriteStream(target));

  await shell.openPath(target);
  return { localPath: target };
});

ipcMain.handle("s3shared:upload", async (_evt, { filePath, key }) => {
  if (!S3_SHARED_BUCKET) throw new Error("S3_SHARED_BUCKET not set");
  if (!filePath) throw new Error("filePath required");
  const Body = fs.createReadStream(filePath);
  await s3.send(new PutObjectCommand({ Bucket: S3_SHARED_BUCKET, Key: key, Body }));
  return { ok: true, key };
});

ipcMain.handle("s3shared:delete", async (_evt, { key }) => {
  if (!S3_SHARED_BUCKET) throw new Error("S3_SHARED_BUCKET not set");
  await s3.send(new DeleteObjectCommand({ Bucket: S3_SHARED_BUCKET, Key: key }));
  return { ok: true };
});

/* ============================================================================
 *   예외/경고 로그
 * ==========================================================================*/
process.on("uncaughtException", (err) => {
  console.error("[MAIN] uncaughtException:", err?.name, err?.message, err?.stack);
});
process.on("unhandledRejection", (reason) => {
  console.error("[MAIN] unhandledRejection:", reason);
});

/* ============================================================================
 *   전역 창/상태
 * ==========================================================================*/
let mainWindow = null;     // 로그인
let featureWindow = null;  // 기능부(사원)
let adminWindow = null;    // 관리자
let chatWindow = null;     // 챗봇(사원)
let notifyWindow = null;   // 알림 전용 창

let tray = null;
let currentRole = null;    // "employee" | "admin" | null
let isLoggingOut = false;  // 중복 로그아웃 방지

const isDev = !!process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
const PROD_INDEX = path.join(__dirname, "frontend-ui", "dist", "index.html");
const INDEX_URL = isDev ? DEV_URL : `file://${PROD_INDEX.replace(/\\/g, "/")}`;

/* ============================================================================
 *   공용 유틸
 * ==========================================================================*/
function resolveBaseDir() {
  try {
    ensureDocumentsFolder(); // 실행 시 보장
  } catch (e) {
    console.error("[FS] mkdir base failed:", e);
  }
  return FIXED_DOCS_PATH;
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
  win.webContents.on("did-finish-load", () =>
    console.log(`[WIN:${label}] did-finish-load URL=${win.webContents.getURL?.()}`)
  );
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[WIN:${label}] did-fail-load`, { code, desc, url });
  });
  win.on("closed", () => console.log(`[WIN:${label}] closed (id=${win.id})`));
}

/* ✅ 알림 전용 창 (우하단, 프레임리스, 반투명) */
function createNotifyWindow() {
  if (notifyWindow && !notifyWindow.isDestroyed()) return notifyWindow;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const W = 420, H = 360, M = 16;

  notifyWindow = new BrowserWindow({
    width: W, height: H,
    x: Math.max(0, width - W - M),
    y: Math.max(0, height - H - M),
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  notifyWindow.loadURL(`${INDEX_URL}#/notify`);
  notifyWindow.once("ready-to-show", () => notifyWindow.showInactive());
  notifyWindow.on("closed", () => { notifyWindow = null; });
  return notifyWindow;
}

// DevTools 토글 헬퍼
function toggleDevtools(win) {
  if (!win) return;
  const wc = win.webContents;
  if (wc.isDevToolsOpened()) wc.closeDevTools();
  else wc.openDevTools({ mode: "detach" }); // 붙여 열고 싶으면 'right' / 'bottom'
}

/* ============================================================================
 *   창 생성기
 * ==========================================================================*/
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

  mainWindow.loadURL(INDEX_URL); // 로그인 진입(DEV/PROD 공통)
  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });

  Menu.setApplicationMenu(null);

  mainWindow.on("resize", () => {
    mainWindow?.webContents?.send("window-resized");
  });

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
    featureWindow.setSkipTaskbar?.(false);
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

  // 해시 라우트로 고정
  featureWindow.loadURL(`${INDEX_URL}?feature=1&role=${encodeURIComponent(role)}#/feature`);
  if (isDev) featureWindow.webContents.openDevTools({ mode: "detach" });

  Menu.setApplicationMenu(null);

  // 닫기 → 숨김(트레이 상주)
  featureWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      featureWindow.hide();
      featureWindow.setSkipTaskbar?.(true);
    }
  });

  featureWindow.on("closed", () => {
    featureWindow = null;
  });

  featureWindow.setSkipTaskbar?.(false);
  return featureWindow;
}

/** 관리자 창 */
function createAdminWindow() {
  if (adminWindow) {
    if (adminWindow.isMinimized()) adminWindow.restore();
    adminWindow.show();
    adminWindow.focus();
    adminWindow.setSkipTaskbar?.(false);
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

  // 해시 라우트 + 관리자 role
  adminWindow.loadURL(`${INDEX_URL}?feature=1&role=admin#/feature`);
  if (isDev) adminWindow.webContents.openDevTools({ mode: "detach" });

  Menu.setApplicationMenu(null);

  // 닫기 → 숨김(트레이 상주)
  adminWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      adminWindow.hide();
      adminWindow.setSkipTaskbar?.(true);
    }
  });

  adminWindow.on("closed", () => {
    adminWindow = null;
  });
  
  adminWindow.setSkipTaskbar?.(false);
  return adminWindow;
}

/** ✅ 챗봇 창(사원) — 최소 크기 그대로 시작 */
function createChatWindow() {
  if (chatWindow) {
    if (chatWindow.isMinimized()) chatWindow.restore();
    chatWindow.show();
    chatWindow.focus();
    chatWindow.setSkipTaskbar?.(false);
    return chatWindow;
  }

  // 줄일 수 있는 최소 크기 & 시작 크기 통일
  const MIN_W = 400;
  const MIN_H = 580;

  chatWindow = new BrowserWindow({
    width: MIN_W,       // 최소 크기로 시작
    height: MIN_H,      // 최소 크기로 시작
    minWidth: MIN_W,    // 줄일 수 있는 최소 폭
    minHeight: MIN_H,   // 줄일 수 있는 최소 높이
    frame: false,
    backgroundColor: "#ffffff",
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  wireWindowDebugEvents(chatWindow, "chat");

  // 해시 라우트로 고정
  chatWindow.loadURL(`${INDEX_URL}?chat=1&role=employee#/chat`);
  if (isDev) chatWindow.webContents.openDevTools({ mode: "detach" });

  Menu.setApplicationMenu(null);

  // 닫기 → 숨김(트레이 상주)
  chatWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      chatWindow.hide();
      chatWindow.setSkipTaskbar?.(true);
    }
  });

  chatWindow.on("closed", () => {
    chatWindow = null;
  });
  
  chatWindow.setSkipTaskbar?.(false);
  return chatWindow;
}

/* ============================================================================
 *   트레이 (아이콘 확실히 보이게 처리)
 * ==========================================================================*/
function getTrayIconPath() {
  if (app.isPackaged) {
    // 설치 버전: resources/icons/*
    const ico = path.join(process.resourcesPath, "icons", "icon.ico");
    const png = path.join(process.resourcesPath, "icons", "icon.png");
    if (fs.existsSync(ico)) return ico;
    if (fs.existsSync(png)) return png;
  } else {
    // 개발 버전: src/assets/*
    const ico = path.join(__dirname, "frontend-ui", "src", "assets", "icon.ico");
    const png = path.join(__dirname, "frontend-ui", "src", "assets", "icon.png");
    if (fs.existsSync(ico)) return ico;
    if (fs.existsSync(png)) return png;
  }
  return null;
}


function createTray() {
  if (tray) return tray;

  const iconPath = getTrayIconPath();
  if (!iconPath) {
    console.error("[TRAY] icon file not found. Check assets/** packaging.");
  }
  let image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

  // Windows에서 숨김 아이콘 영역 표시 안정화를 위해 16px로 보정
  if (process.platform === "win32" && !image.isEmpty()) {
    image = image.resize({ width: 16, height: 16 });
  }

  tray = new Tray(image);
  tray.setToolTip("ClickA");

  const contextMenu = Menu.buildFromTemplate([
    { label: "열기", click: () => showByRole() },
    { label: "종료", click: () => logoutAndQuit() }, // 항상 로그아웃 후 종료
  ]);
  tray.setContextMenu(contextMenu);

  // 좌클릭으로도 열기
  tray.on("click", () => showByRole());

  return tray;
}

function showByRole() {
  if (currentRole === "admin") {
    const aw = createAdminWindow();                 // ★ 추가: 반환값 변수에 담기
    try { aw.setSkipTaskbar?.(false); } catch {}    // ★ 추가: 작업표시줄에 아이콘 보이기
  } else if (currentRole === "employee") {
    // 사원은 두 창 모두 복귀
    const fw = createFeatureWindow("employee");     // ★ 추가
    const cw = createChatWindow();                  // ★ 추가
    try { fw.setSkipTaskbar?.(false); } catch {}    // ★ 추가
    try { cw.setSkipTaskbar?.(false); } catch {}    // ★ 추가
  } else {
    // 로그인 상태 모름 → 로그인 창
    const mw = createMainWindow();
    mw.show();
    mw.focus();
    try { mw.setSkipTaskbar?.(false); } catch {}    // ★ 추가
  }
}


/* ============================================================================
 *   로그아웃 & 종료 처리
 * ==========================================================================*/
function broadcastLogout() {
  // 모든 창에 logout 브로드캐스트 (preload.js에서 auth.onLogout으로 수신)
  BrowserWindow.getAllWindows().forEach((w) => w?.webContents?.send("logout"));
}

function logoutAndQuit() {
  if (isLoggingOut) return;
  isLoggingOut = true;
  app.isQuitting = true;

  try {
    broadcastLogout();
  } catch (_) {}

  // 렌더러 토큰/상태 정리 시간을 약간 보장
  setTimeout(() => {
    app.quit();
  }, 250);
}

/* ============================================================================
 *   앱 라이프사이클
 * ==========================================================================*/

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // 기존 인스턴스를 앞으로
    try { showByRole(); } catch {}
  });
}

app.whenReady().then(() => {
  // 전역 F12 보강
  globalShortcut.register("F12", () => {
    const w = BrowserWindow.getFocusedWindow();
    if (w) toggleDevtools(w);
  });
  ensureDocumentsFolder();     // ✅ 실행 시 문서 폴더 보장
  createMainWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

// 종료 시 단축키 해제
app.on("will-quit", () => {
  globalShortcut.unregister("F12");
  globalShortcut.unregisterAll();
});

// 모든 창이 닫혀도 종료하지 않음(트레이 상주)
app.on("window-all-closed", () => {
  // no-op
});

// OS 세션 종료(로그오프/샷다운) 시 자동 로그아웃
app.on("session-end", () => {
  logoutAndQuit();
});

// 사용자가 앱을 종료하려 할 때(메뉴/Alt+F4 등) — 자동 로그아웃
app.on("before-quit", () => {
  if (!isLoggingOut) {
    logoutAndQuit();
  }
});

/* ============================================================================
 *   프레임리스/윈도우/크기 이벤트 (원본 유지)
 * ==========================================================================*/
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

  // ⬇ F12 / Ctrl+Shift+I (macOS는 Cmd+Alt+I) 로 DevTools 토글
  win.webContents.on("before-input-event", (event, input) => {
    // F12
    if (input.type === "keyDown" && input.key === "F12") {
      event.preventDefault();
      toggleDevtools(win);
    }
    // Ctrl+Shift+I / Cmd+Alt+I
    if (
      input.type === "keyDown" &&
      input.code === "KeyI" &&
      (input.control || input.meta) &&
      input.shift
    ) {
      event.preventDefault();
      toggleDevtools(win);
    }
  });
});
const getSenderWindow = (event) => BrowserWindow.fromWebContents(event.sender);
ipcMain.handle("window:minimize", (event) => {
  getSenderWindow(event)?.minimize();
  return true;
});
ipcMain.handle("window:maximize", (event) => {
  const w = getSenderWindow(event);
  if (!w) return false;
  w.maximize();
  w.webContents?.send?.("window-resized");
  return true;
});
ipcMain.handle("window:unmaximize", (event) => {
  const w = getSenderWindow(event);
  if (!w) return false;
  w.unmaximize();
  w.webContents?.send?.("window-resized");
  return true;
});
ipcMain.handle("window:maximize-toggle", (event) => {
  const w = getSenderWindow(event);
  if (!w) return false;
  w.isMaximized() ? w.unmaximize() : w.maximize();
  w.webContents?.send?.("window-resized");
  return true;
});
ipcMain.handle("window:close", (event) => {
  getSenderWindow(event)?.close();
  return true;
});

/* ✅ IPC: 알림 열기/닫기 */
ipcMain.handle("notify:openUpcoming", async (_evt, eventPayload) => {
  const win = createNotifyWindow();
  win.webContents.send("notify:cmd", { type: "show", event: eventPayload });
  return true;
});
ipcMain.handle("notify:closeUpcoming", async () => {
  if (notifyWindow && !notifyWindow.isDestroyed()) {
    notifyWindow.close();
  }
  return true;
});

/* ============================================================================
 *   S3 및 FS Bridge (원본 유지 + 기본 경로만 고정)
 * ==========================================================================*/
// 렌더러에서 invoke 시 { fileName, token } 형태로 넘겨주세요.
ipcMain.handle("get-s3-upload-url", async (_evt, { fileName, token, contentType, pathHint }) => {
  const fetch = require("node-fetch");

  // contentType이 없으면 기본값으로 octet-stream
  const ct = (typeof contentType === "string" && contentType.trim())
    ? contentType.trim()
    : "application/octet-stream";

  const res = await fetch("http://13.125.105.129:8000/api/v1/files/presigned", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      filename: fileName,
      contentType: ct, // ★ renderer가 넘긴 실제 MIME 타입 사용
      path_hint: pathHint || "" //  현재 폴더 prefix 전달
    }),
  });


  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`presign failed: ${res.status} ${res.statusText} ${txt}`);
  }

  const result = await res.json();
  if (!result.uploadUrl) {
    throw new Error("presign payload missing uploadUrl");
  }

  // ★ 업로드 때 그대로 쓰도록 contentType도 함께 반환
  return {
    uploadUrl: result.uploadUrl,
    fileKey: result.fileKey || null,
    fileName,
    contentType: "application/octet-stream",
  };
});

// 렌더러에서 invoke 시 presign 응답의 contentType을 함께 넘겨주세요.
// ipcRenderer.invoke("upload-file-to-s3", { uploadUrl, file, fileName, contentType })
ipcMain.handle("upload-file-to-s3", async (evt, { uploadUrl, file, fileName, contentType }) => {
  try {
    const fetch = require("node-fetch");

    // ★ presign과 동일한 Content-Type을 강제 (특히 .exe 등)
    let ct = (typeof contentType === "string" && contentType.trim())
      ? contentType.trim()
      : "application/octet-stream";

    // presign 실패로 더미 URL이 들어오는 상황 방지
    if (!uploadUrl || uploadUrl.includes("example-presigned-url")) {
      throw new Error("invalid presigned URL");
    }

    evt.sender.send("upload-progress", { fileName, progress: 0 });

    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": ct }, // ★ 서명과 완전히 동일해야 함
      body: Buffer.from(file.buffer),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      evt.sender.send("upload-progress", { fileName, progress: 0, error: true });
      throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${responseText}`);
    }

    evt.sender.send("upload-progress", { fileName, progress: 100, completed: true });
    return { success: true, fileName };
  } catch (error) {
    console.error("Upload error:", error);
    evt.sender.send("upload-progress", { fileName, progress: 0, error: true });
    return { success: false, error: error.message };
  }
});


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

// 📄 열람 목록 저장 파일
const OPENED_INDEX_PATH = path.join(app.getPath("userData"), "opened-index.json");

async function readOpenedIndex() {
  try {
    const raw = await fs.promises.readFile(OPENED_INDEX_PATH, "utf-8");
    const arr = JSON.parse(raw || "[]");
    // 정렬 보정: ms가 있으면 그걸로, 없으면 최신 우선
    return Array.isArray(arr)
      ? arr.sort((a, b) => (b.msKST || 0) - (a.msKST || 0))
      : [];
  } catch {
    return [];
  }
}

async function upsertOpened(doc) {
  const cur = await readOpenedIndex();
  const { iso, ms } = nowKST();
  const nextDoc = { ...doc, lastOpenedKST: iso, msKST: ms };
  const next = [nextDoc, ...cur.filter((d) => d.path !== doc.path)].slice(0, 50);
  await fs.promises.writeFile(OPENED_INDEX_PATH, JSON.stringify(next, null, 2), "utf-8");
}

// ===== FS Bridge: 기본 경로를 C:\ClickA Documents 로 고정 =====
ipcMain.handle("fs:listDocs", async () => {
  const base = resolveBaseDir();
  const all = await fs.promises.readdir(base, { withFileTypes: true });

  // 파일만 + 임시/시스템 파일 제외
  const files = all
    .filter((ent) => ent.isFile() && !isTempOrSystemFile(ent.name))
    .map((ent) => ent.name);

  return files.map((name) => ({
    name,
    path: safeJoin(base, name), // 열기용 절대경로
    // 날짜는 보내지 않음(전체 문서엔 날짜가 나오면 안 됨)
  }));
});
ipcMain.handle("fs:listViewed", async () => {
  const items = await readOpenedIndex(); // [{ path, name, lastOpenedKST, msKST }, ...]

  // 존재하는 파일만 + 임시/시스템 파일 제거
  const existing = await Promise.all(
    items.map(async (it) => {
      try {
        if (isTempOrSystemFile(it.name || path.basename(it.path))) return null;
        await fs.promises.access(it.path, fs.constants.F_OK);
        return it;
      } catch {
        return null;
      }
    })
  );

  return existing
    .filter(Boolean)
    .sort((a, b) => (b.msKST || 0) - (a.msKST || 0));
});



ipcMain.handle("fs:readDoc", async (_evt, { name }) => {
  if (!name) throw new Error("filename required");
  const base = resolveBaseDir();
  const full = resolveNameOrPathToFull(base, name);
  if (!fs.existsSync(full)) return { ok: false, reason: "not_found" };
  const content = await fs.promises.readFile(full, "utf-8");
  await upsertOpened({ path: full, name });
  return { ok: true, content, mime: extToMime(path.extname(name).slice(1)) };
});

ipcMain.handle("fs:saveDoc", async (_evt, { name, content }) => {
  if (!name) throw new Error("filename required");
  const base = resolveBaseDir();
  const full = resolveNameOrPathToFull(base, name);
  await fs.promises.writeFile(full, content ?? "", "utf-8");
  await upsertOpened({ path: full, name });
  return { ok: true };
});

function resolveNameOrPathToFull(base, nameOrPath) {
  // 절대경로면 그대로 검증 후 사용
  if (path.isAbsolute(nameOrPath)) return nameOrPath;
  // 파일명만 왔다면 base와 조합
  return safeJoin(base, nameOrPath);
}

ipcMain.handle("fs:deleteDoc", async (_evt, { name }) => {
  if (!name) throw new Error("filename required");
  const base = resolveBaseDir();
  const full = resolveNameOrPathToFull(base, name);
  if (fs.existsSync(full)) await fs.promises.unlink(full);
  return { ok: true };
});

ipcMain.handle("fs:open", async (_evt, { name }) => {
  if (!name) throw new Error("filename required");
  const base = resolveBaseDir();
  const full = resolveNameOrPathToFull(base, name);
  if (!fs.existsSync(full)) return { ok: false, reason: "not_found" };
  await upsertOpened({ path: full, name: path.basename(full) });
  const r = await shell.openPath(full);
  return { ok: !r, reason: r || undefined };
});

// ✅ [추가] 파일 저장 대화상자 핸들러
ipcMain.handle("fs:showSaveDialog", async (evt, options) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  return dialog.showSaveDialog(win, options);
});

// ✅ [추가] 절대 경로 파일 저장 핸들러
ipcMain.handle("fs:saveFile", async (_evt, { filePath, content, encoding = "utf-8" }) => {
  if (!filePath) throw new Error("filePath is required");
  try {
    // writeFile은 base64 인코딩을 네이티브로 지원합니다.
    await fs.promises.writeFile(filePath, content || "", encoding);
    return { ok: true };
  } catch (e) {
    console.error(`Failed to save file ${filePath}:`, e);
    return { ok: false, error: e.message };
  }
});

// ✅ [추가] 파일 열기 대화상자 핸들러
ipcMain.handle("fs:showOpenDialog", async (evt, options) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  return dialog.showOpenDialog(win, options);
});

// ✅ [추가] 절대 경로 파일 읽기 핸들러
ipcMain.handle("fs:readFileByPath", async (_evt, { filePath }) => {
  if (!filePath) throw new Error("filePath is required for fs:readFileByPath");
  if (!fs.existsSync(filePath)) return { ok: false, reason: "not_found" };
  const content = await fs.promises.readFile(filePath, "utf-8");
  await upsertOpened({ path: filePath, name: path.basename(filePath) });
  return { ok: true, content, mime: extToMime(path.extname(filePath).slice(1)) };
});

/* ============================================================================
 *   문서 내용 공유 IPC (원본 유지)
 * ==========================================================================*/
let currentDocumentContent = "<p>문서 작성을 시작하세요...</p>";

ipcMain.handle("document:getCurrentContent", () => {
  console.log(
    "[MAIN] 문서 내용 요청됨:",
    currentDocumentContent ? currentDocumentContent.substring(0, 100) + "..." : "null"
  );
  return currentDocumentContent;
});

ipcMain.handle("document:setCurrentContent", (_evt, content) => {
  console.log(
    "[MAIN] 문서 내용 업데이트됨:",
    content ? content.substring(0, 100) + "..." : "null"
  );
  currentDocumentContent = content;
  return true;
});

ipcMain.on("document:sendUpdate", (_evt, content) => {
  console.log("[MAIN] 문서 업데이트 신호 받음, 기능창으로 전달");
  console.log("[MAIN] featureWindow 상태:", {
    exists: !!featureWindow,
    destroyed: featureWindow?.isDestroyed?.(),
    id: featureWindow?.id,
  });

  if (featureWindow && !featureWindow.isDestroyed()) {
    console.log("[MAIN] 기능창으로 document:updated 이벤트 전송 중...");
    featureWindow.webContents.send("document:updated", content);
    console.log("[MAIN] 이벤트 전송 완료");
  } else {
    console.warn("[MAIN] 기능창이 없거나 파괴됨, 이벤트 전송 실패");
  }
});

/* ============================================================================
 *   역할/로그인 관련 IPC
 * ==========================================================================*/
ipcMain.on("auth:success", (_evt, payload) => {
  const role = payload?.role || null;
  currentRole = role;

  // 로그인창은 '항상위'가 남아있을 수 있으니 확실히 해제 + 숨김
  if (mainWindow) {
    try {
      mainWindow.setAlwaysOnTop?.(false);
      mainWindow.setSkipTaskbar?.(true);
      mainWindow.hide();
      mainWindow.blur();
    } catch {}
  }

  if (currentRole === "admin") {
    // 관리자는 관리자 창만
    destroyFeatureWindows(); // 혹시 남아있던 기능/챗봇 제거
    const aw = createAdminWindow();                 // ★ 추가: 변수에 담아서
    try { aw.setSkipTaskbar?.(false); } catch {}    // ★ 추가: 작업표시줄 아이콘 보장
    return;
  }

  // employee: 기능부와 챗봇을 '항상' 새로 보장 (이전 세션 잔재 제거)
  try { featureWindow?.destroy?.(); } catch {}
  try { chatWindow?.destroy?.(); } catch {}
  featureWindow = null;
  chatWindow = null;

  const fw = createFeatureWindow("employee");
  const cw = createChatWindow();
  try { fw.setSkipTaskbar?.(false); } catch {}      // ★ 추가
  try { cw.setSkipTaskbar?.(false); } catch {}      // ★ 추가
  try { fw.focus(); } catch {}
  try { cw.show(); cw.focus(); } catch {}
});


ipcMain.handle("open-feature-window", (_evt, role = "employee") => {
  if (role === "admin") createAdminWindow();
  else createFeatureWindow(role);
  return true;
});

// 전역 로그아웃 요청(버튼/메뉴에서 호출 가능)
ipcMain.on("app:logout-request", (event, scope = "all") => {
  console.log("[MAIN] app:logout-request scope=", scope);

  // 1) 로그아웃 브로드캐스트
  if (scope === "current") {
    const w = BrowserWindow.fromWebContents(event.sender);
    w?.webContents?.send("logout");
  } else {
    broadcastLogout();
  }

  // 2) 창 상태를 '완전히' 초기화 (hide 말고 destroy)
  destroyFeatureWindows();
  currentRole = null;

  // 3) 로그인 창만 복귀 (항상위/포커스 보장 후 즉시 해제)
  const mw = createMainWindow();
  try { if (mw.isMinimized?.()) mw.restore(); } catch {}
  if (!mw.isVisible?.()) mw.show();
  mw.focus();
  mw.setSkipTaskbar?.(false);
  mw.setAlwaysOnTop?.(true, "screen-saver");
  setTimeout(() => mw.setAlwaysOnTop?.(false), 50); // 약간의 지연으로 확실히 해제
  console.log("[MAIN] show+focus mainWindow id=", mw?.id);
});

// ===== DOCX 파일 처리 =====
const mammoth = require('mammoth');

// DOCX 파일을 HTML로 변환하는 함수
async function convertDocxToHtml(filePath) {
  try {
    const result = await mammoth.convertToHtml({ path: filePath });
    return {
      success: true,
      html: result.value,
      messages: result.messages // 변환 중 발생한 메시지들
    };
  } catch (error) {
    console.error('DOCX 변환 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// IPC 핸들러: DOCX 파일 변환
ipcMain.handle("convert-docx-to-html", async (event, filePath) => {
  console.log("[MAIN] DOCX 변환 요청:", filePath);
  return await convertDocxToHtml(filePath);
});
