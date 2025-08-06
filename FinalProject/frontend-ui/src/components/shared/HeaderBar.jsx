const { ipcRenderer } = window.electron;

export default function HeaderBar({ onMenuClick, showMenuButton }) {
  return (
    <div className="flex items-center justify-between px-2 h-10 bg-white border-b border-gray-200 drag">
      {/* 왼쪽 햄버거 버튼 (조건부) */}
      {showMenuButton && (
        <div className="no-drag">
          <button
            onClick={onMenuClick}
            className="text-xl px-3 py-1 hover:bg-gray-100 rounded"
          >
            ☰
          </button>
        </div>
      )}

      {/* 오른쪽 창 제어 */}
      <div className="flex space-x-1 no-drag ml-auto">
        <button
          onClick={() => ipcRenderer.send('minimize')}
          className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded"
        >
          <span className="text-sm">−</span>
        </button>
        <button
          onClick={() => ipcRenderer.send('maximize')}
          className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded"
        >
          <span className="text-sm">☐</span>
        </button>
        <button
          onClick={() => ipcRenderer.send('close')}
          className="w-8 h-8 flex items-center justify-center hover:bg-red-200 rounded"
        >
          <span className="text-sm">×</span>
        </button>
      </div>
    </div>
  );
}
