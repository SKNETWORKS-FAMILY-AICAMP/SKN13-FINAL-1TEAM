/* 
  파일: src/components/ChatWindow/ChatWindow.jsx
  역할: 채팅창 본체. 메시지 목록 렌더링, 입력/전송, 파일 업로드(프리사인드), LLM 스트리밍(SSE) 수신,
       오토스크롤 및 스트림 중지/정리까지 전체 채팅 플로우를 관리한다.

  LINKS:
    - 이 파일을 사용하는 곳:
      * App.jsx (현재 세션/창 크기 상태를 props로 내려 렌더)
    - 이 파일이 사용하는 것:
      * MessageBubble.jsx → 개별 메시지(텍스트/첨부/이미지 라이트박스) 렌더
      * ChatInput.jsx → 하단 입력/첨부/전송/중지 UI
      * services/chatApi.js → getMessages(sessionId), saveMessage(payload)
      * services/uploadPresigned.js → uploadChatbotFilePresigned(file, { sessionId })
      * services/env.js(BASE_URL) → SSE /llm/stream 엔드포인트 구성

  전체 플로우(요약):
    1) 세션 변경 시 getMessages로 과거 대화 불러오기 → messages state 세팅
    2) 사용자가 입력/첨부 → ChatInput에서 onSend() 호출 → 여기 handleSend 실행
    3) (첨부가 있으면) 백그라운드로 presigned 업로드 진행(화면은 즉시 미리보기 유지)
    4) 사용자 메시지 DB 저장(saveMessage)
    5) SSE 연결(/llm/stream) → 토큰 수신시 updateLastMessage로 AI 답변 누적
       - data.attachments가 오면 normalizeAttachments 후 attachToLastAI로 말풍선에 첨부 연결
       - data.done 또는 [DONE] 수신 시 endStream()으로 정리
    6) 중지 버튼 클릭 시 handleAbort() → SSE 종료 + 재입력 가능
    7) 언마운트/재스트림 시작 전에는 항상 closeEventSource()로 기존 SSE 정리

  주의사항:
    - 이벤트 소스(eventSourceRef) 누수 방지: endStream/Abort/언마운트에서 모두 close 처리
    - 메시지 배열 조작(setMessages)은 항상 불변성 유지하여 렌더링 일관성 보장
*/

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'; // ✅ useMemo 추가
import MessageBubble from './MessageBubble.jsx';
import ChatInput from './ChatInput.jsx';
import { getMessages, saveMessage } from '../services/chatApi.js';
import { BASE_URL } from '../services/env.js';
import { uploadChatbotFilePresigned } from '../services/uploadPresigned.js';
import { streamLLM } from '../services/llmApi.js'; // ✅ streamLLM import 추가

export default function ChatWindow({ currentSession, onSessionUpdated, isMaximized }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  // SSE 핸들 정리(이미 열려있으면 종료)
  const closeEventSource = useCallback(() => {
    eventSourceRef.current?.close?.();
    eventSourceRef.current = null;
  }, []);

  // 서버에서 온 첨부 배열을 화면용 형태로 표준화
  const normalizeAttachments = useCallback((arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map((a) => ({
      name: a.name || a.filename || 'attachment',
      type: a.type || a.mimetype || '',
      url: a.url || a.previewUrl || a.href || null,
    }));
  }, []);

  // 세션 변경 시 과거 메시지 로드
  useEffect(() => {
    if (!currentSession?.id) { setMessages([]); return; }
    (async () => {
      try {
        const loaded = await getMessages(currentSession.id);
        setMessages(loaded || []);
      } catch (err) {
        console.error('[ERROR] 메시지 불러오기 실패:', err);
      }
    })();
  }, [currentSession]);

  // 새 메시지 도착 때 오토스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 언마운트 시 SSE 정리
  useEffect(() => () => closeEventSource(), [closeEventSource]);

  // 말풍선 끝에 메시지 추가
  const appendMessage = useCallback((msg) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  // 마지막 AI 메시지에 토큰 덧붙이기(없으면 새로 추가)
  const updateLastMessage = useCallback((delta) => {
    setMessages(prev => {
      const arr = [...prev];
      const last = arr[arr.length - 1];
      if (last?.role === 'ai' && (!last.type || last.type === 'regular')) {
        arr[arr.length - 1] = { ...last, content: (last.content || '') + delta };
      } else {
        arr.push({ role: 'ai', content: delta, type: 'regular' });
      }
      return arr;
    });
  }, []);

  // 마지막 AI 메시지에 첨부 결합(없으면 AI 메시지 생성)
  const attachToLastAI = useCallback((atts) => {
    setMessages(prev => {
      const arr = [...prev];
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].role === 'ai' || arr[i].role === 'assistant') {
          const prevAtt = Array.isArray(arr[i].attachments) ? arr[i].attachments : [];
          arr[i] = { ...arr[i], attachments: [...prevAtt, ...atts] };
          return arr;
        }
      }
      arr.push({ role: 'ai', content: '', attachments: atts });
      return arr;
    });
  }, []);

  // 스트림 종료 공통 처리
  const endStream = useCallback(() => {
    closeEventSource();
    setIsStreaming(false);
    onSessionUpdated?.();
  }, [closeEventSource, onSessionUpdated]);

  // ⛔ 중지(Abort)
  const handleAbort = useCallback(() => {
    closeEventSource();
    setIsStreaming(false);
  }, [closeEventSource]);

  // 문서 선택 처리 (DocumentButtons 컴포넌트에서 전달되는 메시지 처리)
  const handleDocumentSelect = useCallback((message) => {
    console.log('[ChatWindow] 문서 선택 결과 메시지:', message);
    
    // DocumentButtons에서 전달하는 메시지를 화면에 표시
    if (message) {
      appendMessage({
        role: 'assistant',
        content: message
      });
    }
  }, [appendMessage]);

  // 메시지 전송
  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    const sessionId = currentSession?.id;
    const hasFiles = (files?.length || 0) > 0;

    if (!prompt && !hasFiles) return;
    if (!sessionId) return;
    if (isStreaming) return;

    // 🔐 이전 SSE 정리 후 시작
    closeEventSource();

    setIsStreaming(true);

    // 사용자 말풍선에 즉시 미리보기 첨부
    const attachmentsForPreview = (files || []).map(f => ({
      name: f.name,
      type: f.type || 'application/octet-stream',
      url: f.type?.startsWith('image/') ? URL.createObjectURL(f) : null,
    }));

    appendMessage(attachmentsForPreview.length > 0
      ? { role: 'user', content: prompt, attachments: attachmentsForPreview }
      : { role: 'user', content: prompt });

    // 입력/첨부 초기화
    setInput('');
    setFiles([]);

    // 프리사인드 업로드 비동기
    if (hasFiles) {
      (async () => {
        try {
          await Promise.all(
            (files || []).map(f => uploadChatbotFilePresigned(f, { sessionId }))
          );
        } catch (err) {
          console.error('[ERROR] 파일 업로드 실패:', err);
        }
      })();
    }

    // 사용자 메시지 저장
    try {
      await saveMessage({ sessionId, role: 'user', content: prompt });
    } catch (err) {
      console.error('[ERROR] 메시지 저장 실패:', err);
    }

    // 현재 문서 내용 가져오기 (옵션)
    let documentContent = null;
    if (window.fsBridge?.getCurrentDocumentContent) {
      try {
        documentContent = await window.fsBridge.getCurrentDocumentContent();
        if (documentContent === "<p>문서 작성을 시작하세요...</p>") {
          documentContent = null;
        }
      } catch (err) {
        console.warn('문서 내용 가져오기 실패:', err);
      }
    }

    // SSE 연결 시작
    console.log('🚀 [ChatWindow] streamLLM 호출 시작', {
      sessionId,
      prompt: prompt.substring(0, 50) + '...',
      hasDocumentContent: !!documentContent,
      documentContentLength: documentContent ? documentContent.length : 0
    });

    const cleanupFn = streamLLM({
      sessionId,
      prompt,
      documentContent,
      onDelta: (content, full) => {
        try {
          const parsed = JSON.parse(content);
          if (parsed.action?.type === 'open_document') {
            // Special action to open document
            console.log('[ChatWindow] 문서 열기 액션 감지됨:', parsed.action.filename);
            if (window.electron?.onDocumentOpenFromChat) {
              window.electron.onDocumentOpenFromChat({
                content: parsed.action.content,
                filename: parsed.action.filename
              });
              appendMessage({ role: 'assistant', content: parsed.response_text });
            } else {
              console.error('[ChatWindow] window.electron.onDocumentOpenFromChat 함수를 찾을 수 없습니다.');
              appendMessage({ role: 'assistant', content: '문서 열기 기능을 사용할 수 없습니다.' });
            }
            return; // Stop further processing of this delta
          }
        } catch (e) {
          // Not a JSON action, continue with normal delta processing
        }
        updateLastMessage(content);
      },
      onDocumentButtons: (documentSelection, content) => {
        console.log('📄 [ChatWindow] 문서 버튼 데이터 수신:', documentSelection);

        // auto_open_success가 true이면 첫 번째 문서를 자동으로 열기
        if (documentSelection.auto_open_success && documentSelection.selected_document) {
          console.log('📄 [ChatWindow] 자동 문서 열기 감지, IPC 전송 시도');

          const ipc_data = {
            action: "open_document_in_editor",
            document: documentSelection.selected_document
          };

          // IPC를 통해 문서편집창에 문서 전송
          if (window.electron?.openDocumentInEditor) {
            window.electron.openDocumentInEditor({ ipc_data })
              .then(result => {
                console.log('✅ [ChatWindow] 자동 문서 열기 성공:', result);
              })
              .catch(error => {
                console.error('❌ [ChatWindow] 자동 문서 열기 실패:', error);
              });
          } else {
            console.error('❌ [ChatWindow] IPC 통신 함수를 찾을 수 없습니다');
          }
        }

        // 문서 선택 데이터를 포함한 메시지 추가
        appendMessage({
          role: 'assistant',
          content: content || '문서를 찾았습니다!',
          documents: documentSelection.documents,
          query: documentSelection.query
        });
      },
      onToolMessage: (msg) => {
        appendMessage({ role: 'tool', content: msg });
      },
      onThinking: (msg) => {
        appendMessage({ role: 'thinking', content: msg });
      },
      onLocalDocuments: async (s3Documents) => {
        console.log('📄 S3 문서 검색 결과:', s3Documents);
        
        // 로컬 문서 검색 병행 실행
        let localDocuments = [];
        try {
          const localResult = await window.electron?.searchLocalDocuments?.(prompt, 3);
          if (localResult?.success && localResult.documents) {
            localDocuments = localResult.documents;
            console.log('📁 로컬 문서 검색 결과:', localDocuments.length, '개');
          }
        } catch (error) {
          console.error('❌ 로컬 문서 검색 실패:', error);
        }
        
        // 로컬 + S3 결과 통합 (로컬 우선)
        const allDocuments = [...localDocuments, ...s3Documents];
        
        // 중복 제거 (같은 파일명인 경우 로컬 우선)
        const uniqueDocuments = [];
        const seenFilenames = new Set();
        
        for (const doc of allDocuments) {
          const baseName = doc.filename.toLowerCase().replace(/\.[^/.]+$/, ""); // 확장자 제거
          if (!seenFilenames.has(baseName)) {
            seenFilenames.add(baseName);
            uniqueDocuments.push(doc);
          }
        }
        
        // 최대 3개로 제한
        const finalDocuments = uniqueDocuments.slice(0, 3);
        
        console.log('🔄 통합 검색 결과:', {
          local: localDocuments.length,
          s3: s3Documents.length,
          unique: uniqueDocuments.length,
          final: finalDocuments.length
        });
        
        // 마지막 AI 메시지에 문서 정보 추가
        setMessages(prev => {
          const newMessages = [...prev];
          const lastIdx = newMessages.length - 1;
          if (lastIdx >= 0 && newMessages[lastIdx].role === 'assistant') {
            newMessages[lastIdx] = {
              ...newMessages[lastIdx],
              documents: finalDocuments
            };
          }
          return newMessages;
        });
      },
      onDocumentUpdate: (docUpdate) => {
        console.log('📝 document_update 감지됨:', docUpdate.substring(0, 100) + '...');
        if (window.fsBridge?.sendDocumentUpdate) {
          window.fsBridge.sendDocumentUpdate(docUpdate);
          console.log('✅ 문서 업데이트를 기능창으로 전달');
        }
      },
      onDone: (full) => {
        console.log('✅ [ChatWindow] StreamLLM 완료:', {
          fullLength: full ? full.length : 0,
          preview: full ? full.substring(0, 100) + '...' : 'null'
        });
        endStream();
      },
      onError: (error) => {
        console.error('❌ [ChatWindow] StreamLLM 에러:', error);
        endStream();
        alert('채팅 중 오류가 발생했습니다: ' + error.message);
      }
    });

    // cleanup 저장
    eventSourceRef.current = { close: cleanupFn };

    // AI 말풍선 프레임 추가(토큰 누적용)
    appendMessage({ role: 'ai', content: '' });
  }, [
    input, files, currentSession, isStreaming,
    appendMessage, updateLastMessage, attachToLastAI,
    normalizeAttachments, closeEventSource, endStream
  ]);

  /* -------------------- ✅ 연속 assistant/tool/thinking 병합 -------------------- */
  const displayMessages = useMemo(() => {
    const out = [];
    const normalizeRoleForMerge = (r) => {
      if (r === 'ai' || r === 'assistant' || r === 'tool' || r === 'thinking') return 'assistant';
      if (r === 'user') return 'user';
      return r || 'assistant';
    };

    for (const m of (messages || [])) {
      const roleGroup = normalizeRoleForMerge(m?.role);

      if (
        out.length > 0 &&
        roleGroup === 'assistant' &&
        normalizeRoleForMerge(out[out.length - 1].role) === 'assistant'
      ) {
        // 이전 assistant와 병합
        const prev = out[out.length - 1];
        prev.content = [prev.content, m.content].filter(Boolean).join('\n\n');

        // 첨부도 합치기
        const prevAtt = Array.isArray(prev.attachments) ? prev.attachments : [];
        const curAtt  = Array.isArray(m.attachments) ? m.attachments : [];
        if (prevAtt.length || curAtt.length) {
          prev.attachments = [...prevAtt, ...curAtt];
        }
      } else {
        out.push({ ...m, role: roleGroup });
      }
    }
    return out;
  }, [messages]);
  /* --------------------------------------------------------------------------- */

  // 🔒 방어 로직 반영: 루트 overflow-hidden + 메시지 리스트 overflow-x-hidden + 하단 인풋 고정(flex-none)
  return (
    <div className="flex flex-col h-full w-full overflow-hidden min-w-0">
      <div
        className="flex-1 min_h-0 overflow-y-auto overflow-x-hidden px-4 py-6 max-w-full"
        style={{ scrollbarGutter: 'stable both-edges', overscrollBehavior: 'contain' }}
      >
        {displayMessages.length === 0 ? (
          <div className="text-center text-gray-400 mt-10 text-sm">무엇이든 물어보세요.</div>
        ) : (
          displayMessages.map((msg, idx) => (
            <MessageBubble 
              key={idx} 
              message={msg} 
              onDocumentSelect={handleDocumentSelect}
              sessionId={currentSession?.id}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 하단 고정 래퍼 */}
      <div className="flex-none bg-white">
        <ChatInput
          input={input}
          setInput={setInput}
          onSend={handleSend}
          files={files}
          setFiles={setFiles}
          isMaximized={isMaximized}
          isStreaming={isStreaming}
          onAbort={handleAbort}
        />
      </div>
    </div>
  );
}