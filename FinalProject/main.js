require('dotenv').config();

// ✅ main.js (루트)
// - dev: Vite 5173 URL 로드 (기존 진입 경로 유지)
// - prod: frontend-ui/dist/index.html 로드
// - 사원 로그인 성공 시 기능부 창을 별도 창으로 오픈 (?feature=1)

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { getUploadUrl } = require('./backend/s3-handler.js');

let mainWindow = null;     // 로그인/챗봇 창
let featureWindow = null;  // 기능부 전용 창

// ── 실행 환경 분기
const isDev   = !!process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const PROD_INDEX = path.join(__dirname, 'frontend-ui', 'dist', 'index.html');

// ✅ (변경) 최대화 상태 질의: "보낸 창" 기준
ipcMain.handle('check-maximized', (evt) => {
  const { BrowserWindow } = require('electron');
  const win = BrowserWindow.fromWebContents(evt.sender);
  return win?.isMaximized() || false;
});

function createMainWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    // 기존 크기/스타일 유지
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
  }
 else {
    mainWindow.loadFile(PROD_INDEX);
  }

  Menu.setApplicationMenu(null);

  mainWindow.on('resize', () => {
    mainWindow.webContents.send('window-resized');
  });

  mainWindow.on('close', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('logout');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 기능부 창 생성 (?feature=1 로 분기 렌더)
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

  if (isDev) {
    featureWindow.loadURL(`${DEV_URL}?feature=1`);
  }
 else {
    featureWindow.loadFile(PROD_INDEX, { query: { feature: '1' } });
  }

  Menu.setApplicationMenu(null);

  // (선택) 기능부 창 리사이즈 이벤트도 필요하면 브로드캐스트 가능
  // featureWindow.on('resize', () => {
  //   featureWindow.webContents.send('window-resized');
  // });

  featureWindow.on('closed', () => {
    featureWindow = null;
  });
}

/* ─────────────────────────────
 *  ✅ 윈도우 컨트롤 IPC (변경)
 *  - "보낸 창"만 제어 → HeaderBar 공용 사용 가능
 * ───────────────────────────── */
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
 *  🔐 로그인 성공 이벤트
 *  - role === 'employee' → 기능부 창 오픈
 * ───────────────────────────── */
ipcMain.on('auth:success', (_evt, payload) => {
  const role = payload?.role;
  const userId = payload?.userId;

  if (!mainWindow) createMainWindow();
  if (typeof role !== 'string') return;

  if (role === 'employee' && !featureWindow) {
    createFeatureWindow();
  }
  // 관리자 전용 분기 필요 시 여기서 추가
});

/* ─────────────────────────────
 *  📄 S3 Presigned URL 생성
 * ───────────────────────────── */
ipcMain.handle('get-s3-upload-url', async (event, fileName) => {
  if (!fileName || typeof fileName !== 'string') {
    return { error: '이봐, 아들. 올바른 파일 이름이 필요하다.' };
  }
  try {
    const uploadUrl = await getUploadUrl(fileName);
    return { url: uploadUrl };
  } catch (error) {
    console.error('S3 업로드 URL을 가져오는데 실패했다:', error);
    return { error: error.message || '알 수 없는 오류가 발생했다.' };
  }
});

app.whenReady().then(() => {
  // 앱 시작 시 메인 창 생성 (기존 흐름 유지)
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});