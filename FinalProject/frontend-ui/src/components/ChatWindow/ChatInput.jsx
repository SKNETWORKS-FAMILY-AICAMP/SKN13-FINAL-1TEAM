/* 
  파일: src/components/ChatWindow/ChatInput.jsx
  역할: 채팅 입력 바 + 파일 첨부/미리보기 + 전송/중지 컨트롤을 담당하는 입력 컴포넌트.

  LINKS:
    - 이 파일을 사용하는 곳:
      * ChatWindow.jsx → 화면 하단 입력 영역으로 포함되어 onSend, onAbort 등 콜백 제공
    - 이 파일이 사용하는 것:
      * (아이콘) @heroicons/react
      * 브라우저 URL.createObjectURL / revokeObjectURL → 이미지 미리보기 관리

  데이터 흐름(요약):
    1) 사용자가 텍스트 입력 또는 파일 첨부(다중) → 내부 state(files)로 관리
    2) 이미지 파일은 objectURL로 동적 썸네일 미리보기 생성/정리(urlMapRef)
    3) Enter(Shift 미사용) 또는 전송 버튼 클릭 시 onSend() 호출
    4) 스트리밍 중(isStreaming=true)이면 "중지" 버튼 표시 → onAbort() 호출

  주의사항:
    - 레거시 단일 파일 props(file) → 배열(files)로 흡수하는 useEffect 포함
    - 컴포넌트 언마운트 시 모든 objectURL revoke로 메모리 누수 방지
    - 전송 가능 조건(canSend): 텍스트 존재 또는 파일이 1개 이상
*/

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
  /* 레거시 단일 파일(file)을 새 구조(files 배열)로 흡수:
     - file이 존재하면 files에 병합 후, setFile(null)로 원천 상태 초기화 */
  useEffect(() => {
    if (file && setFiles) {
      setFiles(prev => (prev?.some(f => f === file) ? prev : [...(prev || []), file]));
      setFile && setFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const filesArr = Array.isArray(files) ? files : [];

  /* 이미지 미리보기 objectURL 캐시:
     - key: index, val: objectURL
     - filesArr 변경 시 생성/정리, 언마운트 시 일괄 revoke */
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
    // 제거된 항목들에 대한 URL 정리
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

  // 텍스트 또는 파일이 있을 때만 전송 가능
  const canSend = (input?.trim()?.length || 0) > 0 || filesArr.length > 0;

  // 파일 추가 핸들러: multiple 선택 허용
  const addFiles = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length) {
      setFiles(prev => ([...(prev || []), ...selected]));
    }
    e.target.value = '';
  };

  // files 배열에서 idx에 해당하는 파일 제거(+ objectURL revoke)
  const removeAt = (idx) => {
    const url = urlMapRef.current.get(idx);
    if (url) {
      URL.revokeObjectURL(url);
      urlMapRef.current.delete(idx);
    }
    setFiles(prev => (prev || []).filter((_, i) => i !== idx));
  };

  const extraCount = Math.max(0, imagePreviewItems.length - 4);

  // 전송 버튼 클릭(또는 Enter) → 상위 onSend 호출
  const handleSendClick = () => { if (canSend && !isStreaming) onSend(); };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend && !isStreaming) onSend();
    }
  };

  // 첨부 중 비이미지 파일(칩 형태로 표시) 분리
  const nonImageFiles = filesArr
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => !f?.type?.startsWith('image/'));

  return (
    <div className="w-full flex justify-center px-4 py-3 border-t bg-white/70 backdrop-blur">
      <div className={`flex-1 min-w-0 ${isMaximized ? 'max-w-[60%]' : 'max-w-4xl'}`}>
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

            {/* 이미지 2x2 프리뷰 + 초과 수량 표시 */}
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
            className="flex-1 min-w-0 w-full box-border text-sm resize-none outline-none bg-transparent placeholder:text-gray-400"
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
