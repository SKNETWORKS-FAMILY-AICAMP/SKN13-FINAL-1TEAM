// src/components/ChatWindow/ChatInput.jsx
/**
 * 채팅 입력창 컴포넌트
 *
 * 주요 기능:
 * - 텍스트 입력, 파일 첨부, 이미지 미리보기, 전송/중지 버튼 제공
 * - "Enter" 키 전송 / Shift+Enter 줄바꿈 처리
 * - 이미지 첨부 시 썸네일 미리보기 제공 및 삭제 가능
 * - 일반 파일 첨부 시 칩 형태로 표시 및 삭제 가능
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { PlusIcon, PaperAirplaneIcon, XMarkIcon, PaperClipIcon, StopIcon } from '@heroicons/react/24/solid';

export default function ChatInput({
  input, setInput, onSend,        // 텍스트 입력 상태와 전송 함수
  files, setFiles,                // 첨부 파일 배열 상태
  file, setFile,                  // 과거 단일 파일 방식, 현재는 배열로 병합
  isMaximized,                    // 창 최대화 여부
  isStreaming = false,            // 챗봇 응답이 진행 중인지 여부
  onAbort,                        // 응답 중지 함수
}) {
  /**
   * 레거시 단일 파일 상태를 배열에 병합
   * - file 값이 존재하면 files 배열에 추가
   * - 추가 후 file 상태 초기화
   */
  useEffect(() => {
    if (file && setFiles) {
      setFiles(prev => (prev?.some(f => f === file) ? prev : [...(prev || []), file]));
      setFile && setFile(null);
    }
  }, [file]);

  const filesArr = Array.isArray(files) ? files : [];

  /**
   * 이미지 파일 미리보기를 위한 Blob URL 관리
   * - URL.createObjectURL 로 미리보기용 Blob URL 생성
   * - 파일 삭제 시 revokeObjectURL 로 메모리 해제
   */
  const urlMapRef = useRef(new Map());

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

    // 삭제된 항목의 URL 메모리 해제
    for (const key of Array.from(map.keys())) {
      if (!filesArr[key] || !filesArr[key].type?.startsWith('image/')) {
        const u = map.get(key);
        if (u) URL.revokeObjectURL(u);
        map.delete(key);
      }
    }
    return items;
  }, [filesArr]);

  // 언마운트 시 Blob URL 전체 해제
  useEffect(() => {
    return () => {
      for (const [, u] of urlMapRef.current) URL.revokeObjectURL(u);
      urlMapRef.current.clear();
    };
  }, []);

  // 전송 가능 조건: 텍스트 입력 또는 파일 첨부가 있을 때
  const canSend = (input?.trim()?.length || 0) > 0 || filesArr.length > 0;

  // 파일 추가
  const addFiles = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length) {
      setFiles(prev => ([...(prev || []), ...selected]));
    }
    e.target.value = ''; // 같은 파일 다시 선택 가능하게 초기화
  };

  // 파일 삭제
  const removeAt = (idx) => {
    const url = urlMapRef.current.get(idx);
    if (url) {
      URL.revokeObjectURL(url);
      urlMapRef.current.delete(idx);
    }
    setFiles(prev => (prev || []).filter((_, i) => i !== idx));
  };

  // 이미지가 5개 이상일 경우 추가 개수 표시
  const extraCount = Math.max(0, imagePreviewItems.length - 4);

  // 전송 버튼 클릭
  const handleSendClick = () => { if (canSend && !isStreaming) onSend(); };

  // Enter 키 전송, Shift+Enter 줄바꿈
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend && !isStreaming) onSend();
    }
  };

  // 이미지가 아닌 일반 파일 목록
  const nonImageFiles = filesArr
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => !f?.type?.startsWith('image/'));

  return (
    <div className="w-full flex justify-center px-4 py-3 border-t bg-white/70 backdrop-blur">
      <div className={`flex-1 ${isMaximized ? 'max-w-[60%]' : 'max-w-4xl'}`}>
        
        {/* 첨부된 파일 미리보기 영역 */}
        {(filesArr.length > 0) && (
          <div className="mb-2 inline-flex items-start gap-3">
            
            {/* 일반 파일 미리보기 */}
            {nonImageFiles.length > 0 && (
              <div className="flex flex-col gap-2">
                {nonImageFiles.map(({ f, idx }) => (
                  <div key={`${f.name}-${idx}`} className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-gray-100">
                    <PaperClipIcon className="w-4 h-4 text-gray-700" />
                    <span className="text-xs text-gray-800 truncate max-w-[160px]">{f.name}</span>
                    {/* 파일 삭제 버튼 */}
                    <button onClick={() => removeAt(idx)} className="hover:bg-gray-200 rounded-full p-0.5" title="제거">
                      <XMarkIcon className="w-4 h-4 text-gray-700" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 이미지 파일 미리보기 */}
            {imagePreviewItems.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {imagePreviewItems.slice(0, 4).map(({ index, name, url }) => (
                  <div key={`${name}-${index}`} className="relative w-24 h-24 rounded-xl overflow-hidden">
                    <img src={url} alt={name} className="w-full h-full object-cover" />
                    {/* 이미지 삭제 버튼 */}
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

        {/* 입력창 영역 */}
        <div className="flex items-center border rounded-full px-3 py-2 shadow-md gap-2 bg-white">
          
          {/* 파일 첨부 버튼 */}
          <label className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 cursor-pointer shrink-0" title="파일 첨부">
            <PlusIcon className="w-5 h-5 text-gray-600" />
            <input type="file" className="hidden" multiple onChange={addFiles} />
          </label>

          {/* 텍스트 입력창 */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요"
            rows={1}
            className="flex-1 text-sm resize-none outline-none bg-transparent placeholder:text-gray-400"
          />

          {/* 전송 버튼 또는 중지 버튼 */}
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
