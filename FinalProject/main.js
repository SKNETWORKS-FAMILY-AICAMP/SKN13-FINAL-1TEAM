const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

let mainWindow = null;

// ✅ 먼저 handler를 전역에서 등록한다
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

  // ✅ resize 이벤트는 여기에 남겨도 OK
  mainWindow.on('resize', () => {
    mainWindow.webContents.send('window-resized');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 앱 준비되면 창 생성
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

// 창 제어용 이벤트
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
