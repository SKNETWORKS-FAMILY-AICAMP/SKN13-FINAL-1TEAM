/* 
  파일: src/components/ChatWindow/MessageBubble.jsx
  역할: 단일 메시지(사용자/AI) 말풍선 렌더링. 텍스트(Markdown 지원), 첨부 파일 칩, 이미지 썸네일/라이트박스를 제공.

  LINKS:
    - 이 파일을 사용하는 곳:
      * ChatWindow.jsx → messages.map(...)으로 각 메시지를 MessageBubble로 렌더
    - 이 파일이 사용하는 것:
      * react-markdown + remark-gfm → Markdown 렌더링(표/체크박스 등 GFM 확장)
      * @heroicons/react → 아이콘
      * 브라우저 이벤트/키보드(ESC/좌우)로 라이트박스 제어

  데이터 흐름(요약):
    1) message.attachments를 이미지/비이미지로 분리
    2) 비이미지 → 파일 칩(FileChip)로 다운로드 링크 표시
    3) 이미지 → 최대 4개 썸네일 + 초과 수량(+N) 표시, 클릭 시 라이트박스 열림
    4) 텍스트가 있으면 ReactMarkdown으로 렌더(사용자 말풍선은 회색 박스)

  주의사항:
    - 라이트박스가 열린 상태(viewerOpen=true)에서 ESC/←/→ 키로 닫기/이전/다음 구현
    - 첨부의 url/previewUrl/filename 등 다양한 필드 명을 수용(백엔드 다양성 방어)
*/

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { PaperClipIcon, XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* ------------------------- 추가 유틸: 출력 분류/세그먼트 ------------------------- */

/** 어시스턴트 출력 분류
 * - 'fenced': 코드펜스(```lang) 시작 또는 순수 JSON/배열 전체
 * - 'log'   : 툴 로그/혼합 JSON(긴 줄, tool_call_id 등 키워드, 중괄호 밀도)
 * - 'plain' : 일반 텍스트
 */
const classifyAssistantOutput = (raw = '') => {
  const s = String(raw || '').trim();
  const startsWithFence = s.startsWith('```');
  const pureJson =
    (s.startsWith('{') && s.endsWith('}')) ||
    (s.startsWith('[') && s.endsWith(']'));

  if (startsWithFence || pureJson) return 'fenced';

  const hasToolLog =
    /AI Thinking:|Using tool|tool_call_id|artifact"|status"|"type":"tool"/m.test(s);

  const lines = s.split(/\r?\n/);
  const longLine = lines.some(l => l.length > 140);
  const braceDensity = ((s.match(/[{}]/g) || []).length) / Math.max(s.length, 1);

  if (hasToolLog || longLine || braceDensity > 0.02) return 'log';
  return 'plain';
};

/** 한 메시지 문자열을 plain/bubble 세그먼트 배열로 분리 */
const segmentAssistantContent = (raw = '') => {
  const text = String(raw || '');
  const segments = [];
  const fenceRe = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)\n```/g;

  let lastIndex = 0;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index);
    if (before.trim().length > 0) {
      const cls = classifyAssistantOutput(before);
      segments.push({
        type: cls === 'plain' ? 'plain' : 'bubble',
        mode: cls,
        content: before
      });
    }
    const fencedBlock = m[0]; // 코드펜스 전체
    segments.push({ type: 'bubble', mode: 'fenced', content: fencedBlock });
    lastIndex = fenceRe.lastIndex;
  }
  const tail = text.slice(lastIndex);
  if (tail.trim().length > 0) {
    const cls = classifyAssistantOutput(tail);
    segments.push({
      type: cls === 'plain' ? 'plain' : 'bubble',
      mode: cls,
      content: tail
    });
  }
  if (segments.length === 0) {
    segments.push({ type: 'plain', mode: 'plain', content: text });
  }
  return segments;
};

/** 인접한 bubble 세그먼트를 하나로 합치기(전체를 한 박스로 보여주기 위함) */
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
    } else {
      out.push(seg);
    }
  }
  return out;
};
/* ------------------------------------------------------------------------------ */

// 비이미지 첨부 파일 칩
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

  // 첨부 표준화: message.attachments 또는 file 레거시 필드 대응
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : (message?.file ? [message.file] : []);

  // 이미지/파일 분리
  const images = attachments.filter(a => (a?.type || '').startsWith('image/'));
  const files  = attachments.filter(a => !(a?.type || '').startsWith('image/'));
  const extra  = Math.max(0, images.length - 4);
  const hasText = !!(message?.content && message.content.trim().length > 0);

  /* 이미지 라이트박스 상태/이동 로직 */
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const openViewer = useCallback((idx) => { setViewerIndex(idx); setViewerOpen(true); }, []);
  const closeViewer = useCallback(() => setViewerOpen(false), []);
  const prevImg = useCallback(() => { if (images.length) setViewerIndex(i => (i - 1 + images.length) % images.length); }, [images.length]);
  const nextImg = useCallback(() => { if (images.length) setViewerIndex(i => (i + 1) % images.length); }, [images.length]);

  // 키보드 핸들러: ESC, ArrowLeft, ArrowRight
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

  // 어시스턴트 텍스트를 세그먼트로 분리(+ 인접 버블 병합)
  const segments = useMemo(
    () => (isUser ? [] : mergeAdjacentBubbles(segmentAssistantContent(message?.content || ''))),
    [isUser, message?.content]
  );

  return (
    <div className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      {/* 세로 스택: [첨부] -> [텍스트] */}
      <div className={`flex flex-col gap-2 max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* ⬆ 첨부: 파일칩 + 이미지 썸네일(최대 4) + +N 표시 */}
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

        {/* ⬇ 텍스트: 사용자(회색 말풍선) / AI(세그먼트별 렌더) - Markdown 지원 */}
        {hasText && (
          isUser ? (
            <div className="bg-gray-100 border border-gray-200 rounded-2xl px-4 py-3 text-gray-900 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            (() => {
              // 전부 버블(=로그/코드/JSON)인 경우 → 단일 회색 박스
              const allBubble = segments.length > 0 && segments.every(s => s.type === 'bubble');
              const hasFenced = segments.some(s => s.mode === 'fenced');

              if (allBubble) {
                return hasFenced ? (
                  <div className="bg-gray-100 border border-gray-200 rounded-2xl overflow-hidden max-w-full">
                    <div className="max-w-full overflow-x-auto">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
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

              // plain이 섞여 있으면: plain은 말풍선 없이, bubble은 개별 회색 박스
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

                    // plain
                    return (
                      <div key={idx} className="text-gray-900 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
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

      {/* 라이트박스 Overlay: ESC/←/→ 제어 가능 */}
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
