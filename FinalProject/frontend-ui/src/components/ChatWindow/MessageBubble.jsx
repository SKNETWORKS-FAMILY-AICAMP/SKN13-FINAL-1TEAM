// ✅ 파일: MessageBubble.jsx
// 역할: 
// - 대화창에 표시되는 메시지 버블 컴포넌트
// - 텍스트, 파일, 이미지 첨부 처리
// - 이미지 Lightbox(확대 뷰어) 기능 포함
// - 사용자/챗봇 메시지를 구분하여 다른 스타일 적용

import React, { useEffect, useState, useCallback } from 'react';
import { PaperClipIcon, XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import ReactMarkdown from 'react-markdown';     // ✅ 마크다운 텍스트 지원
import remarkGfm from 'remark-gfm';             // ✅ GitHub Flavored Markdown 지원 (테이블, 체크박스 등)

// ✅ 파일(첨부) UI 컴포넌트
// - 파일명을 칩(chip) 형태로 보여주고, 클릭 시 다운로드 가능
const FileChip = ({ name, url }) => (
  <a
    href={url || '#'}                   // 다운로드 링크 (없으면 # 처리)
    download={name || 'file'}           // 다운로드 시 파일명 지정
    className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-gray-100 text-sm text-gray-800 hover:bg-gray-200"
    title={name}                        // hover 시 파일명 툴팁
    rel="noreferrer"
  >
    <PaperClipIcon className="w-4 h-4 text-gray-700" />  {/* 파일 아이콘 */}
    <span className="truncate max-w-[160px]">{name}</span> {/* 긴 파일명은 잘라서 표시 */}
  </a>
);

export default function MessageBubble({ message }) {
  const role = message?.role || 'assistant';      // 역할 (user or assistant)
  const isUser = role === 'user';                 // 사용자 여부 판별

  // ✅ 첨부 파일 처리
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : (message?.file ? [message.file] : []);

  // ✅ 이미지/일반파일 분리
  const images = attachments.filter(a => (a?.type || '').startsWith('image/'));
  const files  = attachments.filter(a => !(a?.type || '').startsWith('image/'));

  const extra  = Math.max(0, images.length - 4);  // 이미지 4개 이상일 경우 +n 표시
  const hasText = !!(message?.content && message.content.trim().length > 0); // 텍스트 존재 여부

  // ✅ Lightbox (이미지 확대 뷰어) 상태 관리
  const [viewerOpen, setViewerOpen] = useState(false);   // 뷰어 열림 여부
  const [viewerIndex, setViewerIndex] = useState(0);     // 현재 보고 있는 이미지 index

  // ✅ Lightbox 열기/닫기 및 이전/다음 이동
  const openViewer = useCallback((idx) => { setViewerIndex(idx); setViewerOpen(true); }, []);
  const closeViewer = useCallback(() => setViewerOpen(false), []);
  const prevImg = useCallback(() => { if (images.length) setViewerIndex(i => (i - 1 + images.length) % images.length); }, [images.length]);
  const nextImg = useCallback(() => { if (images.length) setViewerIndex(i => (i + 1) % images.length); }, [images.length]);

  // ✅ 키보드 단축키 등록 (ESC: 닫기, ←: 이전, →: 다음)
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
      {/* ✅ 세로 스택: [첨부파일/이미지] -> [텍스트 메시지] */}
      <div className={`flex flex-col gap-2 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        
        {/* 첨부파일/이미지 영역 */}
        {(files.length > 0 || images.length > 0) && (
          <div className={`w-full flex flex-wrap gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
            
            {/* 일반 파일 첨부 */}
            {files.map((f, i) => (
              <FileChip key={`chip-${i}`} name={f.name || f.filename || 'attachment'} url={f.url || f.previewUrl} />
            ))}

            {/* 이미지 첨부 (최대 4개만 표시) */}
            {images.slice(0, 4).map((img, i) => (
              <img
                key={`img-${i}`}
                src={img.url || img.previewUrl || ''}
                alt={img.name || 'image'}
                className="w-24 h-24 rounded-xl object-cover cursor-zoom-in"
                onClick={() => openViewer(i)} // 클릭 시 Lightbox 열기
              />
            ))}

            {/* 이미지 5개 이상일 경우, 마지막에 +n 표시 */}
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

        {/* 텍스트 메시지 영역 */}
        {hasText && (
          isUser ? (
            // ✅ 사용자 메시지 (회색 말풍선 스타일)
            <div className="bg-gray-100 border border-gray-200 rounded-2xl px-4 py-3 text-gray-900 whitespace-pre-wrap">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            // ✅ 챗봇 메시지 (기본 텍스트 스타일)
            <div className="text-gray-900 whitespace-pre-wrap">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )
        )}
      </div>

      {/* ✅ Lightbox Overlay (이미지 확대 보기) */}
      {viewerOpen && images.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={closeViewer}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            
            {/* 닫기 버튼 */}
            <button className="absolute -top-10 right-0 p-2 rounded-full bg-white/20 hover:bg-white/30" onClick={closeViewer} title="닫기">
              <XMarkIcon className="w-7 h-7 text-white" />
            </button>

            {/* 이전/다음 버튼 (이미지가 2개 이상일 경우만 표시) */}
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

            {/* 현재 이미지 표시 */}
            <img
              src={images[viewerIndex].url || images[viewerIndex].previewUrl || ''}
              alt={images[viewerIndex].name || `image-${viewerIndex}`}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            />

            {/* 이미지 순서 표시 */}
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
