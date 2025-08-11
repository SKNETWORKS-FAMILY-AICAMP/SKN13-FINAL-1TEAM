// ✅ src/components/ChatWindow/ChatInput.jsx
import React, { useEffect, useMemo, useRef } from 'react';
import { PlusIcon, PaperAirplaneIcon, XMarkIcon, PaperClipIcon, StopIcon } from '@heroicons/react/24/solid';

export default function ChatInput({
  input, setInput, onSend,
  files, setFiles,          // 배열 상태
  file, setFile,            // (레거시) 단일 파일 — 배열로 흡수
  isMaximized,
  isStreaming = false,      // 전송 중 여부
  onAbort,                  // 중지 핸들러
}) {
  // 레거시 단일 파일 → 배열 병합
  useEffect(() => {
    if (file && setFiles) {
      setFiles(prev => (prev?.some(f => f === file) ? prev : [...(prev || []), file]));
      setFile && setFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const filesArr = Array.isArray(files) ? files : [];

  // 이미지 미리보기 URL 관리
  const urlMapRef = useRef(new Map()); // key: index, val: url
  const imagePreviewItems = useMemo(() => {
    const map = urlMapRef.current;
    const items = [];
    filesArr.forEach((f, idx) => {
      if (f?.type?.startsWith('image/')) {
        let url = map.get(idx);
        if (!url) {
          url = URL.createObjectURL(f);
          map.set(idx, url);
        }
        items.push({ index: idx, name: f.name, url });
      }
    });
    // 제거된 항목들의 URL revoke
    for (const key of Array.from(map.keys())) {
      if (!filesArr[key] || !filesArr[key].type?.startsWith('image/')) {
        const u = map.get(key);
        if (u) URL.revokeObjectURL(u);
        map.delete(key);
      }
    }
    return items;
  }, [filesArr]);

  useEffect(() => {
    return () => {
      for (const [, u] of urlMapRef.current) URL.revokeObjectURL(u);
      urlMapRef.current.clear();
    };
  }, []);

  // 전송 가능 조건: 텍스트 있거나 파일이 1개 이상
  const canSend = (input?.trim()?.length || 0) > 0 || filesArr.length > 0;

  // 파일 추가/삭제
  const addFiles = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length) {
      setFiles(prev => ([...(prev || []), ...selected]));
    }
    e.target.value = '';
  };

  const removeAt = (idx) => {
    const url = urlMapRef.current.get(idx);
    if (url) {
      URL.revokeObjectURL(url);
      urlMapRef.current.delete(idx);
    }
    setFiles(prev => (prev || []).filter((_, i) => i !== idx));
  };

  const extraCount = Math.max(0, imagePreviewItems.length - 4);

  const handleSendClick = () => { if (canSend && !isStreaming) onSend(); };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend && !isStreaming) onSend();
    }
  };

  const nonImageFiles = filesArr
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => !f?.type?.startsWith('image/'));

  return (
    <div className="w-full flex justify-center px-4 py-3 border-t bg-white/70 backdrop-blur">
      <div className={`flex-1 ${isMaximized ? 'max-w-[60%]' : 'max-w-4xl'}`}>
        {(filesArr.length > 0) && (
          <div className="mb-2 inline-flex items-start gap-3">
            {/* 파일 칩(비이미지) */}
            {nonImageFiles.length > 0 && (
              <div className="flex flex-col gap-2">
                {nonImageFiles.map(({ f, idx }) => (
                  <div key={`${f.name}-${idx}`} className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-gray-100">
                    <PaperClipIcon className="w-4 h-4 text-gray-700" />
                    <span className="text-xs text-gray-800 truncate max-w-[160px]">{f.name}</span>
                    <button onClick={() => removeAt(idx)} className="hover:bg-gray-200 rounded-full p-0.5" title="제거">
                      <XMarkIcon className="w-4 h-4 text-gray-700" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 이미지 2x2 */}
            {imagePreviewItems.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {imagePreviewItems.slice(0, 4).map(({ index, name, url }) => (
                  <div key={`${name}-${index}`} className="relative w-24 h-24 rounded-xl overflow-hidden">
                    <img src={url} alt={name} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeAt(index)}
                      className="absolute -top-2 -right-2 bg-white/90 rounded-full p-0.5"
                      title="제거"
                    >
                      <XMarkIcon className="w-4 h-4 text-gray-800" />
                    </button>
                  </div>
                ))}
                {extraCount > 0 && imagePreviewItems[3] && (
                  <div className="relative w-24 h-24 rounded-xl overflow-hidden">
                    <img src={imagePreviewItems[3].url} alt="more" className="w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="px-2 py-1 rounded-full bg-black/70 text-white text-xs">+{extraCount}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 입력 바 */}
        <div className="flex items-center border rounded-full px-3 py-2 shadow-md gap-2 bg-white">
          <label className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 cursor-pointer shrink-0" title="파일 첨부">
            <PlusIcon className="w-5 h-5 text-gray-600" />
            <input type="file" className="hidden" multiple onChange={addFiles} />
          </label>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요"
            rows={1}
            className="flex-1 text-sm resize-none outline-none bg-transparent placeholder:text-gray-400"
          />

          {/* ▶ 전송 / ■ 중지 토글 */}
          {isStreaming ? (
            <button
              onClick={onAbort}
              className="p-1 rounded hover:bg-gray-100"
              title="중지"
            >
              <StopIcon className="w-5 h-5 text-red-500" />
            </button>
          ) : (
            <button
              onClick={handleSendClick}
              disabled={!canSend}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              title="전송"
              aria-disabled={!canSend}
            >
              <PaperAirplaneIcon className="w-5 h-5 text-blue-500" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
