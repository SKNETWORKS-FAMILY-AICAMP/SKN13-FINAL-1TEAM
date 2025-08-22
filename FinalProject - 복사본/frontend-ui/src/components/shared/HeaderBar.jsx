// ✅ src/components/shared/HeaderBar.jsx
import React from "react";

export default function HeaderBar({ onMenuClick, showMenuButton }) {
  const ipc = window?.electron?.ipcRenderer; // Electron 안전 가드

  return (
    <div className="flex items-center justify-between px-2 h-10 bg-white border-b border-gray-200 drag">
      {showMenuButton && (
        <div className="no-drag">
          <button onClick={onMenuClick} className="text-xl px-3 py-1 hover:bg-gray-100 rounded">☰</button>
        </div>
      )}
      <div className="flex space-x-1 no-drag ml-auto">
        <button onClick={() => ipc?.send('minimize')} className="w-8 h-8 rounded hover:bg-gray-100">—</button>
        <button onClick={() => ipc?.send('maximize')} className="w-8 h-8 rounded hover:bg-gray-100">□</button>
        <button onClick={() => ipc?.send('close')} className="w-8 h-8 rounded hover:bg-red-100">✕</button>
      </div>
    </div>
  );
}
