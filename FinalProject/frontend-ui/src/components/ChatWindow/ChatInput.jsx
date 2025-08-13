// ✅ ChatInput.jsx
import React from 'react';
import { PlusIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';

export default function ChatInput({ input, setInput, onSend, files, setFiles, isMaximized }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="w-full flex justify-center px-4 py-3 border-t">
      <div
        className={`flex items-center border rounded-full px-3 py-2 shadow-md gap-2 ${
          isMaximized ? 'w-1/2' : 'w-full'
        }`}
      >
        {/* 파일 업로드 */}
        <label className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 cursor-pointer">
          <PlusIcon className="w-5 h-5 text-gray-600" />
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
        </label>

        {/* 입력창 */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요"
          rows={1}
          className="flex-1 text-sm resize-none outline-none bg-transparent"
        />

        {/* 전송 버튼 */}
        <button onClick={onSend}>
          <PaperAirplaneIcon className="w-5 h-5 text-blue-500" />
        </button>
      </div>
    </div>
  );
}
