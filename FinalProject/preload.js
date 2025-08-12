// ✅ preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, callback) =>
      ipcRenderer.on(channel, (event, ...args) => callback(...args)),
    // ✅ off 추가 (리스너 정리)
    off: (channel, callback) =>
      ipcRenderer.removeListener(channel, callback),
    // 필요 시 invoke도 노출 가능 (지금은 isWindowMaximized로만 사용)
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  },

  // 최대화 여부 요청
  isWindowMaximized: () => ipcRenderer.invoke('check-maximized'),

  // 창 리사이즈 이벤트 리스너
  onWindowResize: (callback) => ipcRenderer.on('window-resized', callback),
  // ✅ 정리 함수 제공 (App.jsx cleanup용)
  offWindowResize: (callback) => ipcRenderer.removeListener('window-resized', callback),
});
