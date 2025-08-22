// ✅ main.js — 로컬 문서 전용(C:\testfiles) + 문서 확장자 필터 + Presign lazy require + 열람기록
require('dotenv').config();

const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;     // 로그인/챗봇 창
let featureWindow = null;  // 기능부 전용 창
let adminWindow = null;    // 관리자페이지 창

// ── 실행 환경 분기
const isDev   = !!process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const PROD_INDEX = path.join(__dirname, 'frontend-ui', 'dist', 'index.html');

/* ─────────────────────────────
 *  공용: 보내온 창 기준 윈도우 상태/제어
 * ───────────────────────────── */
ipcMain.handle('check-maximized', (evt) => {
  const { BrowserWindow } = require('electron');
  const win = BrowserWindow.fromWebContents(evt.sender);
  return win?.isMaximized() || false;
});
ipcMain.on('minimize', (evt) => {
  const { BrowserWindow } = require('electron');
  const win = BrowserWindow.fromWebContents(evt.sender);
  win?.minimize();
});
ipcMain.on('maximize', (evt) => {
  const { BrowserWindow } = require('electron');
  const win = BrowserWindow.fromWebContents(evt.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('close', (evt) => {
  const { BrowserWindow } = require('electron');
  const win = BrowserWindow.fromWebContents(evt.sender);
  win?.close();
});

/* ─────────────────────────────
 *  창 생성
 * ───────────────────────────── */
function createMainWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 400,
    height: 580,
    minWidth: 400,
    minHeight: 580,
    frame: false,
    backgroundColor: '#ffffff',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    // 개발 모드에서만 DevTools 열기
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(PROD_INDEX);
  }

  Menu.setApplicationMenu(null);

  mainWindow.on('resize', () => {
    mainWindow?.webContents?.send('window-resized');
  });

  mainWindow.on('close', () => {
    mainWindow?.webContents?.send('logout');
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createFeatureWindow() {
  if (featureWindow) return;

  featureWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    backgroundColor: '#ffffff',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) featureWindow.loadURL(`${DEV_URL}?feature=1`);
  else featureWindow.loadFile(PROD_INDEX, { query: { feature: '1' } });

  Menu.setApplicationMenu(null);
  featureWindow.on('closed', () => { featureWindow = null; });
}

// 관리자 창 생성 함수
function createAdminWindow() {
  if (adminWindow) {
    if (adminWindow.isMinimized()) adminWindow.restore();
    adminWindow.focus();
    return;
  }

  adminWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    backgroundColor: '#ffffff',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    featureWindow.loadURL(`${DEV_URL}?feature=1`);
  } else {
    featureWindow.loadFile(PROD_INDEX, { query: { feature: '1' } });
  }

  // (앱 전체 메뉴 숨김을 유지하려면 그대로 둠)
  Menu.setApplicationMenu(null);

  // (선택) 기능부 창 리사이즈 이벤트도 필요하면 브로드캐스트 가능
  // featureWindow.on('resize', () => {
  //   featureWindow.webContents.send('window-resized');
  // });

  featureWindow.on('closed', () => {
    featureWindow = null;
  });
}

// 관리자 창 생성 함수
function createAdminWindow() {
  if (adminWindow) {
    if (adminWindow.isMinimized()) adminWindow.restore();
    adminWindow.focus();
    return;
  }

  adminWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    backgroundColor: '#ffffff',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    // 예: http://localhost:5173/?admin=1
    adminWindow.loadURL(`${DEV_URL}?admin=1`);
  } else {
    // 예: dist/index.html?admin=1
    adminWindow.loadFile(PROD_INDEX, { query: { admin: '1' } });
  }

  // (앱 전체 메뉴 숨김을 유지하려면 그대로 둠)
  Menu.setApplicationMenu(null);

  // (선택) 필요 시 리사이즈 브로드캐스트
  // adminWindow.on('resize', () => {
  //   adminWindow.webContents.send('window-resized');
  // });

  adminWindow.on('closed', () => {
    adminWindow = null;
  });
}

/* ─────────────────────────────
 *  로그인 성공 → 역할에 따라 기능부 창 오픈
 * ───────────────────────────── */
ipcMain.on('auth:success', (_evt, payload) => {
  const role = payload?.role;
  if (!mainWindow) createMainWindow();
  if (role === 'employee' && !featureWindow) createFeatureWindow();
});

/* ─────────────────────────────
 *  📄 S3 Presigned URL (lazy require; 업로드 필요 시에만 로드)
 * ───────────────────────────── */
ipcMain.handle('get-s3-upload-url', async (_evt, fileName) => {
  if (!fileName || typeof fileName !== 'string') {
    return { error: '올바른 파일 이름이 필요합니다.' };
  }
  try {
    const { getUploadUrl } = require('./backend/s3-handler.js'); // ← 호출 시점 로딩
    const url = await getUploadUrl(fileName);
    return { url };
  } catch (error) {
    console.error('[presign] 실패:', error);
    return { error: error.message || 'presigned URL 발급 실패' };
  }
});

/* ─────────────────────────────
 *  📁 로컬 문서 저장 폴더 (하드코딩: C:\testfiles)
 * ───────────────────────────── */
const HARDCODED_DOCS_DIR = process.platform === "win32"
  ? "C:\\testfiles"           // ← 백슬래시 2개로 이스케이프!
  : "/mnt/c/testfiles";       // (윈도우만 쓰면 위 줄만 실사용)

function resolveBaseDir() {
  const dir = HARDCODED_DOCS_DIR;   // 오직 이 경로만 사용
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.resolve(dir);
  } catch (e) {
    throw new Error(`[docs] 접근 불가: ${dir} (${e.message})`);
  }
}

/* ─────────────────────────────
 *  문서 확장자 화이트리스트 & 숨김/시스템 파일 필터
 * ───────────────────────────── */
const ALLOW_DOC_EXTS = new Set([
  // 오피스류
  "pdf", "doc", "docx", "rtf",
  "xls", "xlsx", "csv",
  "ppt", "pptx",
  // 텍스트/마크다운
  "txt", "md",
  // 한글
  "hwp", "hwpx",
  // 오픈문서
  "odt", "ods", "odp"
]);

function isHiddenOrSystem(name) {
  const lower = name.toLowerCase();
  // dotfile / 임시(~, ~$) / 오피스 임시(~WR*.tmp, .~lock) / 윈도우 시스템 파일
  if (name.startsWith(".") || name.startsWith("~") || name.startsWith("~$")) return true;
  if (lower === "thumbs.db" || lower === "desktop.ini") return true;
  if (lower.endsWith(".tmp") || lower.startsWith("~wr") || lower.startsWith(".~lock")) return true;
  return false;
}
function isAllowedDoc(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return ALLOW_DOC_EXTS.has(ext);
}

/* ─────────────────────────────
 *  경로 안전 조합 & mime 추정
 * ───────────────────────────── */
function safeJoin(base, target) {
  const absBase = path.resolve(base);
  const absTarget = path.resolve(base, target || '');
  if (!absTarget.startsWith(absBase)) throw new Error('Invalid path traversal');
  return absTarget;
}
function guessMime(filename = '') {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map = {
    pdf:'application/pdf', doc:'application/msword',
    docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    rtf:'application/rtf',
    hwp:'application/x-hwp', hwpx:'application/hanwha-hwpx',
    txt:'text/plain', md:'text/markdown',
    xls:'application/vnd.ms-excel',
    xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv:'text/csv',
    ppt:'application/vnd.ms-powerpoint',
    pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    odt:'application/vnd.oasis.opendocument.text',
    ods:'application/vnd.oasis.opendocument.spreadsheet',
    odp:'application/vnd.oasis.opendocument.presentation',
  };
  return map[ext] || 'application/octet-stream';
}

/* ─────────────────────────────
 *  열람 기록 인덱스 (userData/opened-index.json)
 * ───────────────────────────── */
const OPENED_INDEX_PATH = path.join(app.getPath('userData'), 'opened-index.json');

async function readOpenedIndex() {
  try {
    const raw = await fs.promises.readFile(OPENED_INDEX_PATH, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch { return []; }
}
async function writeOpenedIndex(list) {
  await fs.promises.writeFile(OPENED_INDEX_PATH, JSON.stringify(list || []), 'utf-8');
}
async function upsertOpened({ path: p, name }) {
  const list = await readOpenedIndex();
  const filtered = list.filter(x => x.path !== p);
  filtered.unshift({ path: p, name, opened_at: new Date().toISOString() });
  await writeOpenedIndex(filtered.slice(0, 500)); // 최대 500개 보관
}

/* ─────────────────────────────
 *  fsBridge IPC — preload.js의 fsBridge와 1:1 매칭
 * ───────────────────────────── */
// ipcMain.on('auth:success', (_evt, payload) => {
//   const role = payload?.role;
//   const userId = payload?.userId;

//   if (!mainWindow) {
//     createMainWindow();
//   }
//   if (typeof role !== 'string') return;

//   if (role === 'employee' && !featureWindow) {
//     console.log('[auth:success] role =', role);
//     createFeatureWindow();
//   } else if (role === 'admin' && !adminWindow) {
//     console.log('[auth:success] role =', role);
//     createAdminWindow();
//   }

// });
// 🔐 로그인 성공 이벤트 - 교체
ipcMain.on('auth:success', (_evt, payload) => {
  const role = payload?.role;
  if (!role) return;

  // 관리자
  if (role === 'admin') {
    if (!adminWindow) createAdminWindow();
    // 기존 창들 정리
    featureWindow?.close();   // 혹시 떠 있었다면 닫기
    // 메인(챗봇)창 노출 방지
    // 닫고 싶으면 .close(), 일시 숨김이면 .hide()
    mainWindow?.hide();
    return;
  }

  // 사원
  if (role === 'employee') {
    if (!featureWindow) createFeatureWindow();
    adminWindow?.close();     // 혹시 떠 있었다면 닫기
    mainWindow?.hide();       // 메인(챗봇)창 숨김
    return;
  }
});

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});