import React, { useEffect, useState, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble.jsx';
import ChatInput from './ChatInput.jsx';
import { getMessages, saveMessage } from '../services/chatApi.js';
import { BASE_URL } from '../services/env.js';
import { uploadChatbotFilePresigned } from '../services/uploadPresigned.js';

export default function ChatWindow({ currentSession, onSessionUpdated, isMaximized }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  const closeEventSource = useCallback(() => {
    eventSourceRef.current?.close?.();
    eventSourceRef.current = null;
  }, []);

  const normalizeAttachments = useCallback((arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map((a) => ({
      name: a.name || a.filename || 'attachment',
      type: a.type || a.mimetype || '',
      url: a.url || a.previewUrl || a.href || null,
    }));
  }, []);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => closeEventSource(), [closeEventSource]);

  const appendMessage = useCallback((msg) => {
    setMessages(prev => [...prev, msg]);
  }, []);

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

  const endStream = useCallback(() => {
    closeEventSource();
    setIsStreaming(false);
    onSessionUpdated?.();
  }, [closeEventSource, onSessionUpdated]);

  // ⛔ 중지(Abort): 진행 중 스트림 종료 + 즉시 새 질문 가능
  const handleAbort = useCallback(() => {
    closeEventSource();
    setIsStreaming(false);
  }, [closeEventSource]);

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

    // ✅ 기존과 동일: 사용자에게는 즉시 미리보기(이미지면 objectURL)로 보임
    const attachmentsForPreview = (files || []).map(f => ({
      name: f.name,
      type: f.type || 'application/octet-stream',
      url: f.type?.startsWith('image/') ? URL.createObjectURL(f) : null,
    }));

    appendMessage(attachmentsForPreview.length > 0
      ? { role: 'user', content: prompt, attachments: attachmentsForPreview }
      : { role: 'user', content: prompt });

    // 입력/첨부 초기화 (기존과 동일 타이밍)
    setInput('');
    setFiles([]);

    // ✅ (신규) 프리사인드 업로드는 "백그라운드"로 진행 → UX 동일
    if (hasFiles) {
      (async () => {
        try {
          await Promise.all(
            (files || []).map(f => uploadChatbotFilePresigned(f, { sessionId }))
          );
          // 백엔드 DB(attachments 테이블 등)에 메타 저장 완료.
          // 필요하면 여기서 사용자 메시지의 첨부 URL을 실제 fileUrl로 업데이트하는 로직을 추가할 수 있으나,
          // "기능/흐름 유지" 요구에 따라 화면상 즉시 미리보기만 유지하고 갱신은 생략합니다.
        } catch (err) {
          console.error('[ERROR] 파일 업로드 실패:', err);
        }
      })();
    }

    // 기존과 동일: 사용자 메시지 저장(첨부는 별도 /attachments 로 이미 저장됨)
    try {
      await saveMessage({ sessionId, role: 'user', content: prompt });
    } catch (err) {
      console.error('[ERROR] 메시지 저장 실패:', err);
    }

    // 기존과 동일: SSE 시작
    const url = new URL(`${BASE_URL}/chat/stream`, window.location.origin);
    url.searchParams.append('session_id', sessionId);
    url.searchParams.append('prompt', prompt);

    const es = new EventSource(url);
    eventSourceRef.current = es;

    appendMessage({ role: 'ai', content: '' });

    es.onmessage = (event) => {
      try {
        // ✅ 스트림 종료 신호 처리
        if (event.data === '[DONE]') {
          endStream();
          return;
        }

        const data = JSON.parse(event.data);

        if (Array.isArray(data.attachments) && data.attachments.length > 0) {
          attachToLastAI(normalizeAttachments(data.attachments));
        }

        // 문서 업데이트 처리: 기능창의 DocumentEditor로 전달
        if (data.document_update) {
          console.log('📝 document_update 필드 감지됨:', data.document_update.substring(0, 100) + '...');
          try {
            console.log('🔍 fsBridge 상태 확인:', {
              fsBridge존재: !!window.fsBridge,
              sendDocumentUpdate존재: !!window.fsBridge?.sendDocumentUpdate
            });
            
            // Electron IPC를 통해 기능창에 문서 업데이트 전달
            if (window.fsBridge?.sendDocumentUpdate) {
              console.log('📤 sendDocumentUpdate 호출 중...');
              window.fsBridge.sendDocumentUpdate(data.document_update);
              console.log('✅ 문서 업데이트를 기능창으로 전달했습니다.');
            } else {
              console.warn('❌ fsBridge.sendDocumentUpdate가 없습니다. 문서 업데이트를 전달할 수 없습니다.');
              console.log('🔍 사용 가능한 fsBridge 메서드들:', Object.keys(window.fsBridge || {}));
            }
          } catch (error) {
            console.error('❌ 문서 업데이트 전달 중 오류:', error);
          }
        }

        // 문서 내용 요청 처리: 백엔드가 현재 문서 내용을 요청하는 경우
        if (data.needs_document_content) {
          try {
            console.log('🔍 백엔드에서 문서 내용을 요청했습니다.');
            
            // 기능창에서 현재 문서 내용 가져오기 (IPC 사용)
            if (window.fsBridge?.getCurrentDocumentContent) {
              window.fsBridge.getCurrentDocumentContent().then(documentContent => {
                console.log('📄 IPC로 가져온 문서 내용:', documentContent ? documentContent.substring(0, 100) + '...' : 'null');
                console.log('📄 문서 내용 타입:', typeof documentContent);
                console.log('📄 문서 내용 길이:', documentContent?.length);
                
                if (documentContent && documentContent !== "<p>문서 작성을 시작하세요...</p>") {
                  console.log('✅ 현재 문서 내용을 가져왔습니다. 백엔드에 전송합니다.');
                  
                  // 새로운 SSE 연결로 문서 내용과 함께 재요청
                  const newUrl = new URL(`${BASE_URL}/chat/stream`, window.location.origin);
                  newUrl.searchParams.append('session_id', currentSession?.id);
                  newUrl.searchParams.append('prompt', input.trim());
                  newUrl.searchParams.append('document_content', documentContent);
                  
                  console.log('🔄 새로운 URL로 재요청:', newUrl.toString());
                  
                  // 기존 연결 종료
                  closeEventSource();
                  
                  // 새 연결 시작
                  const newEs = new EventSource(newUrl);
                  eventSourceRef.current = newEs;
                  
                  // 동일한 이벤트 핸들러 설정
                  newEs.onmessage = es.onmessage;
                  newEs.onerror = es.onerror;
                  
                } else {
                  console.warn('❌ 기능창에서 문서 내용을 가져올 수 없습니다.');
                  appendMessage({ role: 'ai', content: '죄송합니다. 현재 편집 중인 문서를 찾을 수 없습니다. 기능창에서 문서를 먼저 작성해주세요.' });
                  endStream();
                }
              }).catch(error => {
                console.error('문서 내용 가져오기 실패:', error);
                appendMessage({ role: 'ai', content: '문서 내용을 가져오는 중 오류가 발생했습니다.' });
                endStream();
              });
            } else {
              console.warn('❌ fsBridge.getCurrentDocumentContent가 없습니다.');
              appendMessage({ role: 'ai', content: '문서 내용 가져오기 기능이 지원되지 않습니다.' });
              endStream();
            }
          } catch (error) {
            console.error('문서 내용 요청 처리 중 오류:', error);
            endStream();
          }
          return; // 추가 처리 중단
        }

        if (data.done) {
          endStream();
          return;
        }

        if (data.content) updateLastMessage(data.content);
        else if (data.thinking_message) appendMessage({ role: 'thinking', content: data.thinking_message });
        else if (data.tool_message) appendMessage({ role: 'tool', content: data.tool_message });
      } catch (e) {
        // JSON이 아니면 토큰일 수도 있으니 무시
        // console.log('raw event', event.data);
      }
    };

    es.onerror = () => {
      endStream();
    };
  }, [
    input, files, currentSession, isStreaming,
    appendMessage, updateLastMessage, attachToLastAI,
    normalizeAttachments, closeEventSource, endStream
  ]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-10 text-sm">무엇이든 물어보세요.</div>
        ) : (
          messages.map((msg, idx) => <MessageBubble key={idx} message={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        input={input}
        setInput={setInput}
        onSend={handleSend}
        files={files}
        setFiles={setFiles}
        isMaximized={isMaximized}
        // ⬇ 전송/중지 토글 제어
        isStreaming={isStreaming}
        onAbort={handleAbort}
      />
    </div>
  );
}