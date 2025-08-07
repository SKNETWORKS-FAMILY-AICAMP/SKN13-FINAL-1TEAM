// ✅ preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),
  },

  // ✅ 최대화 여부 요청
  isWindowMaximized: () => ipcRenderer.invoke('check-maximized'),

  // ✅ 창 리사이즈 이벤트 리스너
  onWindowResize: (callback) => ipcRenderer.on('window-resized', callback),
});