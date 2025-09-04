/* 
  파일: src/components/ChatWindow/MessageBubble.jsx
  역할: 단일 메시지(사용자/AI) 말풍선 렌더링. 텍스트(Markdown 지원), 첨부 파일 칩, 이미지 썸네일/라이트박스를 제공.

  변경점:
    - 파일 칩 클릭 시: 브라우저 기본 다운로드 대신
      downloadPresignedToLocal()을 호출해 하드코딩 폴더(및 기본 다운로드 폴더)에 저장
      → 저장 성공/실패 시 ChatWindow가 수신하는 'app:toast' 이벤트를 발행

  LINKS:
    - 사용: ChatWindow.jsx → messages.map(...)으로 각 메시지를 MessageBubble로 렌더
    - 의존: react-markdown + remark-gfm, @heroicons/react, uploadPresigned.js
*/

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { PaperClipIcon, XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { downloadPresignedToLocal } from '../services/uploadPresigned.js'; // ✅ 추가

/* ------------------------- 출력 분류/세그먼트 유틸 ------------------------- */
const classifyAssistantOutput = (raw = '') => {
  const s = String(raw || '').trim();
  const startsWithFence = s.startsWith('```');
  const pureJson =
    (s.startsWith('{') && s.endsWith('}')) ||
    (s.startsWith('[') && s.endsWith(']'));
  if (startsWithFence || pureJson) return 'fenced';

  const hasToolLog = /AI Thinking:|Using tool|tool_call_id|artifact"|status"|"type":"tool"/m.test(s);
  const lines = s.split(/\r?\n/);
  const longLine = lines.some(l => l.length > 140);
  const braceDensity = ((s.match(/[{}]/g) || []).length) / Math.max(s.length, 1);
  if (hasToolLog || longLine || braceDensity > 0.02) return 'log';
  return 'plain';
};
const segmentAssistantContent = (raw = '') => {
  const text = String(raw || '');
  const segments = [];
  const fenceRe = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)\n```/g;
  let lastIndex = 0, m;
  while ((m = fenceRe.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index);
    if (before.trim().length > 0) {
      const cls = classifyAssistantOutput(before);
      segments.push({ type: cls === 'plain' ? 'plain' : 'bubble', mode: cls, content: before });
    }
    const fencedBlock = m[0];
    segments.push({ type: 'bubble', mode: 'fenced', content: fencedBlock });
    lastIndex = fenceRe.lastIndex;
  }
  const tail = text.slice(lastIndex);
  if (tail.trim().length > 0) {
    const cls = classifyAssistantOutput(tail);
    segments.push({ type: cls === 'plain' ? 'plain' : 'bubble', mode: cls, content: tail });
  }
  if (segments.length === 0) segments.push({ type: 'plain', mode: 'plain', content: text });
  return segments;
};
const mergeAdjacentBubbles = (segs = []) => {
  const out = [];
  for (const seg of segs) {
    const last = out[out.length - 1];
    if (last && last.type === 'bubble' && seg.type === 'bubble') {
      out[out.length - 1] = {
        type: 'bubble',
        mode: (last.mode === 'fenced' || seg.mode === 'fenced') ? 'fenced' : 'log',
        content: `${last.content}\n\n${seg.content}`
      };
    } else out.push(seg);
  }
  return out;
};
/* ------------------------------------------------------------------------- */

/* ⬇ 파일칩: onClick에서 기본 동작을 막고, 프리사인드 다운로드 → 토스트 이벤트 발행 */
const FileChip = ({ name, url, onClick }) => (
  <a
    href={url || '#'}
    download={name || 'file'}
    onClick={(e) => {
      // (옵션) Alt/Cmd/Ctrl/휠클릭은 브라우저 기본 동작 허용하려면 주석 해제
      // if (e.altKey || e.metaKey || e.ctrlKey || e.button === 1) return;
      e.preventDefault();
      onClick?.();
    }}
    className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-gray-100 text-sm text-gray-800 hover:bg-gray-200"
    title={name}
    rel="noreferrer"
  >
    <PaperClipIcon className="w-4 h-4 text-gray-700" />
    <span className="truncate max-w-[200px]">{name || 'attachment'}</span>
  </a>
);

export default function MessageBubble({ message }) {
  const role = message?.role || 'assistant';
  const isUser = role === 'user';

  // 첨부 표준화
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : (message?.file ? [message.file] : []);

  // 이미지/파일 분리
  const images = attachments.filter(a => (a?.type || '').startsWith('image/'));
  const files  = attachments.filter(a => !(a?.type || '').startsWith('image/'));
  const extra  = Math.max(0, images.length - 4);
  const hasText = !!(message?.content && message.content.trim().length > 0);

  /* 이미지 라이트박스 */
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

  // 텍스트 세그먼트
  const segments = useMemo(
    () => (isUser ? [] : mergeAdjacentBubbles(segmentAssistantContent(message?.content || ''))),
    [isUser, message?.content]
  );

  /* ✅ 파일 클릭 → 다운로드 → 토스트 이벤트 발행 */
  const handleFileClick = useCallback(async (file) => {
    try {
      if (!file?.url) return;
      const res = await downloadPresignedToLocal(file.url, file.name || file.filename || 'download.bin');
      const shownName = res?.nameInBase || file.name || file.filename || '파일';
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: {
          id: Date.now(),
          title: '다운로드 완료',
          message: `${shownName} 이(가) 저장되었습니다.`,
          timeoutMs: 4000
        }
      }));
    } catch (err) {
      console.error('프리사인드 다운로드 실패:', err);
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: {
          id: Date.now(),
          kind: 'error',
          title: '다운로드 실패',
          message: String(err?.message || err),
          timeoutMs: 5000
        }
      }));
    }
  }, []);

  return (
    <div className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`flex flex-col gap-2 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* 첨부: 파일칩 + 이미지 썸네일 */}
        {(files.length > 0 || images.length > 0) && (
          <div className={`w-full flex flex-wrap gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {files.map((f, i) => (
              <FileChip
                key={`chip-${i}`}
                name={f.name || f.filename || 'attachment'}
                url={f.url || f.previewUrl}
                onClick={() => handleFileClick(f)} // ✅ 클릭 시 다운로드+토스트
              />
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

        {/* 텍스트 */}
        {hasText && (
          isUser ? (
            <div className="bg-gray-100 border border-gray-200 rounded-2xl px-4 py-3 text-sm leading-6 text-gray-900 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a({ href, children }) {
                    const safeHref = /^javascript:/i.test(href || "") ? "#" : href;
                    return <a href={safeHref} target="_blank" rel="noopener noreferrer">{children}</a>;
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            (() => {
              const allBubble = segments.length > 0 && segments.every(s => s.type === 'bubble');
              const hasFenced = segments.some(s => s.mode === 'fenced');

              if (allBubble) {
                return hasFenced ? (
                  <div className="bg-gray-100 border border-gray-200 rounded-2xl overflow-hidden max-w-full">
                    <div className="max-w-full overflow-x-auto">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a({ href, children }) {
                            const safeHref = /^javascript:/i.test(href || "") ? "#" : href;
                            return <a href={safeHref} target="_blank" rel="noopener noreferrer">{children}</a>;
                          },
                          code({ inline, children }) {
                            if (inline) return <code className="px-1 py-0.5 rounded bg-gray-200">{children}</code>;
                            return (
                              <pre className="whitespace-pre px-4 py-3 text-sm leading-6 max-w-full">
                                <code>{children}</code>
                              </pre>
                            );
                          },
                          table({ children }) {
                            return <div className="block overflow-x-auto max-w-full px-4 py-3">{children}</div>;
                          }
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-100 border border-gray-200 rounded-2xl overflow-hidden max-w-full">
                    <div className="max-w-full overflow-x-auto">
                      <pre className="whitespace-pre px-4 py-3 text-sm leading-6 min-w-0">
                        {message.content}
                      </pre>
                    </div>
                  </div>
                );
              }

              return (
                <div className="w-full flex flex-col gap-2">
                  {segments.map((seg, idx) => {
                    if (seg.type === 'bubble') {
                      if (seg.mode === 'fenced') {
                        return (
                          <div key={idx} className="bg-gray-100 border border-gray-200 rounded-2xl overflow-hidden max-w-full">
                            <div className="max-w-full overflow-x-auto">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  a({ href, children }) {
                                    const safeHref = /^javascript:/i.test(href || "") ? "#" : href;
                                    return <a href={safeHref} target="_blank" rel="noopener noreferrer">{children}</a>;
                                  },
                                  code({ inline, children }) {
                                    if (inline) return <code className="px-1 py-0.5 rounded bg-gray-200">{children}</code>;
                                    return (
                                      <pre className="whitespace-pre px-4 py-3 text-sm leading-6 max-w-full">
                                        <code>{children}</code>
                                      </pre>
                                    );
                                  },
                                  table({ children }) {
                                    return <div className="block overflow-x-auto max-w-full px-4 py-3">{children}</div>;
                                  }
                                }}
                              >
                                {seg.content}
                              </ReactMarkdown>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="bg-gray-100 border border-gray-200 rounded-2xl overflow-hidden max-w-full">
                          <div className="max-w-full overflow-x-auto">
                            <pre className="whitespace-pre px-4 py-3 text-sm leading-6 min-w-0">
                              {seg.content}
                            </pre>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={idx} className="text-gray-900 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a({ href, children }) {
                              const safeHref = /^javascript:/i.test(href || "") ? "#" : href;
                              return <a href={safeHref} target="_blank" rel="noopener noreferrer">{children}</a>;
                            },
                            code({ inline, children }) {
                              if (inline) return <code className="px-1 py-0.5 rounded bg-gray-200">{children}</code>;
                              return (
                                <pre className="whitespace-pre overflow-x-auto max-w-full">
                                  <code>{children}</code>
                                </pre>
                              );
                            },
                            table({ children }) {
                              return <div className="block overflow-x-auto max-w-full">{children}</div>;
                            }
                          }}
                        >
                          {seg.content}
                        </ReactMarkdown>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )
        )}
      </div>

      {/* 라이트박스 Overlay */}
      {viewerOpen && images.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={closeViewer}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button className="absolute -top-10 right-0 p-2 rounded-full bg-white/20 hover:bg-white/30" onClick={closeViewer} title="닫기">
              <XMarkIcon className="w-7 h-7 text-white" />
            </button>

            {images.length > 1 && (
              <>
                <button className="absolute left-[-56px] top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/20 hover:bg-white/30" onClick={prevImg} title="이전">
                  <ChevronLeftIcon className="w-7 h-7 text-white" />
                </button>
                <button className="absolute right-[-56px] top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/20 hover:bg-white/30" onClick={nextImg} title="다음">
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
