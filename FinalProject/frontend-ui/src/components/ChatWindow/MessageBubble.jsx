import React, { useEffect, useState, useCallback } from 'react';
import { PaperClipIcon, XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';

const FileChip = ({ name, url }) => (
  <a
    href={url || '#'}
    download={name || 'file'}
    className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-gray-100 text-sm text-gray-800 hover:bg-gray-200"
    title={name}
    rel="noreferrer"
  >
    <PaperClipIcon className="w-4 h-4 text-gray-700" />
    <span className="truncate max-w-[160px]">{name}</span>
  </a>
);

export default function MessageBubble({ message }) {
  const role = message?.role || 'assistant';
  const isUser = role === 'user';

  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : (message?.file ? [message.file] : []);

  const images = attachments.filter(a => (a?.type || '').startsWith('image/'));
  const files  = attachments.filter(a => !(a?.type || '').startsWith('image/'));
  const extra  = Math.max(0, images.length - 4);
  const hasText = !!(message?.content && message.content.trim().length > 0);

  // Lightbox
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const openViewer = useCallback((idx) => { setViewerIndex(idx); setViewerOpen(true); }, []);
  const closeViewer = useCallback(() => setViewerOpen(false), []);
  const prevImg = useCallback(() => { if (images.length) setViewerIndex(i => (i - 1 + images.length) % images.length); }, [images.length]);
  const nextImg = useCallback(() => { if (images.length) setViewerIndex(i => (i + 1) % images.length); }, [images.length]);

  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeViewer();
      if (e.key === 'ArrowLeft') prevImg();
      if (e.key === 'ArrowRight') nextImg();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerOpen, closeViewer, prevImg, nextImg]);

  return (
    <div className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      {/* 세로 스택: [첨부] -> [텍스트] */}
      <div className={`flex flex-col gap-2 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* ⬆ 첨부: 말풍선과 같은 라인으로 끝 정렬 */}
        {(files.length > 0 || images.length > 0) && (
          <div className={`w-full flex flex-wrap gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {files.map((f, i) => (
              <FileChip key={`chip-${i}`} name={f.name || f.filename || 'attachment'} url={f.url || f.previewUrl} />
            ))}

            {images.slice(0, 4).map((img, i) => (
              <img
                key={`img-${i}`}
                src={img.url || img.previewUrl || ''}
                alt={img.name || 'image'}
                className="w-24 h-24 rounded-xl object-cover cursor-zoom-in"
                onClick={() => openViewer(i)}
              />
            ))}

            {extra > 0 && images[3] && (
              <div
                className="relative w-24 h-24 rounded-xl overflow-hidden cursor-zoom-in"
                onClick={() => openViewer(3)}
                title={`외 ${extra}장 더 보기`}
              >
                <img
                  src={images[3].url || images[3].previewUrl || ''}
                  alt="more"
                  className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="px-2 py-1 rounded-full bg-black/70 text-white text-xs">+{extra}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ⬇ 텍스트: 사용자 회색 말풍선 / 봇은 기본 텍스트 */}
        {hasText && (
          isUser ? (
            <div className="bg-gray-100 border border-gray-200 rounded-2xl px-4 py-3 text-gray-900 whitespace-pre-wrap">
              {message.content}
            </div>
          ) : (
            <div className="text-gray-900 whitespace-pre-wrap">{message.content}</div>
          )
        )}
      </div>

      {/* Lightbox Overlay */}
      {viewerOpen && images.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={closeViewer}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button className="absolute -top-10 right-0 p-2 rounded-full bg-white/20 hover:bg-white/30" onClick={closeViewer} title="닫기">
              <XMarkIcon className="w-7 h-7 text-white" />
            </button>

            {images.length > 1 && (
              <>
                <button className="absolute left-[-56px] top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/20 hover:bg-white/30" onClick={prevImg} title="이전">
                  <ChevronLeftIcon className="w-7 h-7 text-white" />
                </button>
                <button className="absolute right-[-56px] top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/20 hover:bg-white/30" onClick={nextImg} title="다음">
                  <ChevronRightIcon className="w-7 h-7 text-white" />
                </button>
              </>
            )}

            <img
              src={images[viewerIndex].url || images[viewerIndex].previewUrl || ''}
              alt={images[viewerIndex].name || `image-${viewerIndex}`}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            />
            {images.length > 1 && (
              <div className="absolute bottom-[-36px] left-1/2 -translate-x-1/2 text-white/80 text-sm">
                {viewerIndex + 1} / {images.length}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
