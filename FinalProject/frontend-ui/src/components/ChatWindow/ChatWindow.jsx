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

  const handleStream = useCallback(async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep the last partial line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const jsonStr = line.substring(6);
          if (jsonStr === '[DONE]') {
            endStream();
            return;
          }
          const data = JSON.parse(jsonStr);
          if (data.needs_document_content) {
            await handleToolRequest(data);
            return; // Stop processing this stream
          }
          if (Array.isArray(data.attachments) && data.attachments.length > 0) {
            attachToLastAI(normalizeAttachments(data.attachments));
          }
          if (data.content) updateLastMessage(data.content);
          else if (data.thinking_message) appendMessage({ role: 'thinking', content: data.thinking_message });
          else if (data.tool_message) appendMessage({ role: 'tool', content: data.tool_message });
        } catch (e) {
          console.error('Error processing stream chunk:', line, e);
        }
      }
    }
  }, [endStream, attachToLastAI, updateLastMessage, appendMessage, normalizeAttachments]);

    const handleToolRequest = useCallback(async (toolRequestData) => {
    appendMessage({ role: 'thinking', content: '문서 내용을 분석하고 있습니다...' });

    let documentContent = '';

    try {
      // Electron feature window에서 content 가져오기
      documentContent = await window.ipcRenderer.invoke('get-editor-content-from-feature-window');
    } catch (e) {
      console.error('Feature window에서 에디터 내용 가져오기 실패', e);
      // 기존 fallback
      if (typeof window.getTiptapEditorContent === 'function') {
        documentContent = window.getTiptapEditorContent();
      } else {
        console.warn('getTiptapEditorContent function not found on window object.');
      }
    }

    const toolResult = {
      tool_call_id: toolRequestData.agent_context.tool_call_id,
      result: documentContent,
    };

    try {
      const response = await fetch(`${BASE_URL}/llm/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSession.id,
          message: '',
          is_tool_response: true,
          tool_result: toolResult,
          agent_context: toolRequestData.agent_context,
        }),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      await handleStream(response);
    } catch (error) {
      console.error('Error handling tool request:', error);
      appendMessage({ role: 'error', content: '문서 처리 중 오류가 발생했습니다.' });
      endStream();
    }
  }, [currentSession?.id, appendMessage, endStream, handleStream]);


  const isEditQuery = (prompt) => {
    const keywords = ['수정', '추가', '삭제', '변경', '제목', '내용', '문서', '편집'];
    return keywords.some(keyword => prompt.includes(keyword));
  };

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
    const url = new URL(`${BASE_URL}/llm/stream`, window.location.origin);
    url.searchParams.append('session_id', sessionId);
    url.searchParams.append('prompt', prompt);

    if (isEditQuery(prompt)) {
      try {
        appendMessage({ role: 'thinking', content: '문서 내용을 가져오는 중...' });
        const documentContent = await window.electron.getEditorContent();
        if (documentContent) {
          url.searchParams.append('document_content', documentContent);
        }
      } catch (e) {
        console.error('Error getting editor content:', e);
        appendMessage({ role: 'error', content: '에디터 내용을 가져오는 데 실패했습니다.' });
        endStream();
        return;
      }
    }

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

        if (data.document_update) {
          window.electron.ipcRenderer.send('update-editor-content', data.document_update);
        }

        if (Array.isArray(data.attachments) && data.attachments.length > 0) {
          attachToLastAI(normalizeAttachments(data.attachments));
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