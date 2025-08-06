// ✅ main.js
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

let mainWindow = null;

ipcMain.handle('check-maximized', () => {
  return mainWindow?.isMaximized() || false;
});

function createMainWindow() {
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
    },
  });

  mainWindow.loadURL('http://localhost:5173/');
  Menu.setApplicationMenu(null);

  // ✅ 리사이즈 이벤트
  mainWindow.on('resize', () => {
    mainWindow.webContents.send('window-resized');
  });

  // ✅ 창 닫기 전에 로그아웃 신호 전송
  mainWindow.on('close', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('logout');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('close', () => {
  if (mainWindow) mainWindow.close();
});