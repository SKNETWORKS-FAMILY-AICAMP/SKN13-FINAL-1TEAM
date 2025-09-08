
/**
 * main.js
 * ------------------------------------------------------------------
 * 목적:
 *  - Electron 메인 프로세스: 창 생성/제어, IPC 라우팅, FS/S3 유틸 등
 *  - [변경] 로그아웃 기능을 "명시 요청"으로만 브로드캐스트하도록 분리
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

process.on("uncaughtException", (err) => {
    console.error(
        "[MAIN] uncaughtException:",
        err?.name,
        err?.message,
        err?.stack
    );
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
    win.webContents.on("did-start-loading", () =>
        console.log(`[WIN:${label}] did-start-loading`)
    );
    win.webContents.on("did-finish-load", () =>
        console.log(
            `[WIN:${label}] did-finish-load URL=${win.webContents.getURL?.()}`
        )
    );
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

    if (isDev)
        featureWindow.loadURL(
            `${DEV_URL}?feature=1&role=${encodeURIComponent(role)}`
        );
    // else featureWindow.loadFile(PROD_INDEX, { query: { feature: "1", role } });
    else
        featureWindow.loadFile(PROD_INDEX, {
            query: { search: `feature=1&role=${encodeURIComponent(role)}` },
        });

    if (isDev) featureWindow.webContents.openDevTools({ mode: "detach" });

    Menu.setApplicationMenu(null);

    featureWindow.on("closed", () => {
        featureWindow = null;
    });

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
    // else
    //     adminWindow.loadFile(PROD_INDEX, {
    //         query: { feature: "1", role: "admin" },
    //     });
    else adminWindow.loadFile(PROD_INDEX, { search: "feature=1&role=admin" });

    if (isDev) adminWindow.webContents.openDevTools({ mode: "detach" });

    Menu.setApplicationMenu(null);

    adminWindow.on("closed", () => {
        adminWindow = null;
    });

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
    BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents?.send?.("window-resized")
    );
}
app.on("browser-window-created", (_e, win) => {
    win.on("resize", broadcastResize);
    win.on("maximize", broadcastResize);
    win.on("unmaximize", broadcastResize);
});

/* 프레임리스 윈도우 제어 IPC */
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

/* S3 및 FS Bridge (원본 유지) */
ipcMain.handle("get-s3-upload-url", async (_evt, fileName) => {
    try {
        // 백엔드 API에서 presigned URL 가져오기
        const fetch = require('node-fetch');
        
        const response = await fetch('http://13.125.105.129:8000/api/v1/files/presigned', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // TODO: JWT 토큰 처리 필요
            },
            body: JSON.stringify({
                filename: fileName,
                contentType: 'application/octet-stream'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return { 
            uploadUrl: result.uploadUrl, 
            fileKey: result.fileKey, 
            fileName 
        };
    } catch (error) {
        console.error("Error generating presigned URL:", error);
        return { uploadUrl: "https://example-presigned-url", fields: {}, fileName };
    }
});

// 파일 업로드 처리 (CORS 우회)
ipcMain.handle("upload-file-to-s3", async (_evt, { uploadUrl, file, fileName }) => {
    try {
        const fetch = require('node-fetch');
        
        // URL에서 Content-Type이 이미 지정되어 있는지 확인
        const url = new URL(uploadUrl);
        const contentType = url.searchParams.get('content-type') || file.type || 'application/octet-stream';
        
        console.log(`Uploading ${fileName} to S3...`);
        console.log(`Content-Type: ${contentType}`);
        
        const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': contentType
            },
            body: Buffer.from(file.buffer)
        });

        console.log(`Upload response status: ${response.status}`);

        if (!response.ok) {
            const responseText = await response.text().catch(() => '');
            console.error(`Upload failed: ${response.status} ${response.statusText}`, responseText);
            throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${responseText}`);
        }

        console.log(`Upload successful for ${fileName}`);
        return { success: true, fileName };
    } catch (error) {
        console.error("Upload error:", error);
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
const OPENED_INDEX_PATH = path.join(
    app.getPath("userData"),
    "opened-index.json"
);
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
    await fs.promises.writeFile(
        OPENED_INDEX_PATH,
        JSON.stringify(next, null, 2),
        "utf-8"
    );
}
ipcMain.handle("fs:listDocs", async () => {
    const base = resolveBaseDir();
    const all = await fs.promises.readdir(base);
    return all.map((name) => ({ name })).filter(Boolean);
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
ipcMain.handle("fs:open", async (_evt, { name }) => {
    if (!name) throw new Error("filename required");
    const base = resolveBaseDir();
    const full = safeJoin(base, name);
    if (!fs.existsSync(full)) return { ok: false, reason: "not_found" };
    await upsertOpened({ path: full, name });
    const r = await shell.openPath(full);
    return { ok: !r, reason: r || undefined };
});

// 문서 내용 공유를 위한 변수
let currentDocumentContent = "<p>문서 작성을 시작하세요...</p>";

// 문서 내용 공유 IPC 핸들러들
ipcMain.handle("document:getCurrentContent", () => {
    console.log("[MAIN] 문서 내용 요청됨:", currentDocumentContent ? currentDocumentContent.substring(0, 100) + '...' : 'null');
    return currentDocumentContent;
});

ipcMain.handle("document:setCurrentContent", (_evt, content) => {
    console.log("[MAIN] 문서 내용 업데이트됨:", content ? content.substring(0, 100) + '...' : 'null');
    currentDocumentContent = content;
    return true;
});

ipcMain.on("document:sendUpdate", (_evt, content) => {
    console.log("[MAIN] 문서 업데이트 신호 받음, 기능창으로 전달");
    console.log("[MAIN] featureWindow 상태:", {
        exists: !!featureWindow,
        destroyed: featureWindow?.isDestroyed?.(),
        id: featureWindow?.id
    });
    
    if (featureWindow && !featureWindow.isDestroyed()) {
        console.log("[MAIN] 기능창으로 document:updated 이벤트 전송 중...");
        featureWindow.webContents.send("document:updated", content);
        console.log("[MAIN] 이벤트 전송 완료");
    } else {
        console.warn("[MAIN] 기능창이 없거나 파괴됨, 이벤트 전송 실패");
    }
});

/* 역할별 창 오픈 */
ipcMain.on("auth:success", (_evt, payload) => {
    const role = payload?.role;
    if (!role) return;
    if (role === "admin") {
        createAdminWindow();
        featureWindow?.hide?.();
        mainWindow?.hide?.();
        return;
    }
    const mw = createMainWindow();
    mw.show();
    mw.focus();
    createFeatureWindow("employee");
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
        BrowserWindow.getAllWindows().forEach((w) =>
            w?.webContents?.send("logout")
        );
    }

    // 2) ✅ 전역 로그아웃이면 '항상' 메인(로그인) 창을 화면에 띄움
    //    (관리자/기능부 어디서 눌러도 동일)
    if (scope !== "current") {
        const mw = createMainWindow(); // 없으면 만들고, 있으면 재사용
        try {
            if (mw.isMinimized?.()) mw.restore();
        } catch {}
        if (!mw.isVisible?.()) mw.show();
        mw.focus();
        // 포커스가 간혹 안 잡히는 환경 대비 트릭
        mw.setAlwaysOnTop?.(true, "screen-saver");
        setTimeout(() => mw.setAlwaysOnTop?.(false), 0);
        console.log("[MAIN] show+focus mainWindow id=", mw?.id);
    }
});
