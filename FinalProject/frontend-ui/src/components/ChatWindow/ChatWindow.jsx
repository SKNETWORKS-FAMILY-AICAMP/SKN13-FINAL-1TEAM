import React, { useEffect, useState, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble.jsx';
import ChatInput from './ChatInput.jsx';
import { getMessages, saveMessage } from '../services/chatApi.js';
import { API_BASE } from '../services/env.js';

export default function ChatWindow({ currentSession, onSessionUpdated, isMaximized }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  // ✅ EventSource 안전 종료
  const closeEventSource = useCallback(() => {
    console.log('[DEBUG] Closing EventSource');
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  // ✅ 세션 변경 시 메시지 불러오기
  useEffect(() => {
    console.log('[DEBUG] currentSession 변경됨:', currentSession);

    if (!currentSession?.id) {
      console.log('[DEBUG] 세션 ID 없음 → 메시지 초기화');
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      try {
        console.log(`[DEBUG] 세션(${currentSession.id}) 메시지 불러오기 시도`);
        const loaded = await getMessages(currentSession.id);
        console.log('[DEBUG] 불러온 메시지:', loaded);
        setMessages(loaded);
      } catch (err) {
        console.error('[ERROR] 메시지 불러오기 실패:', err);
      }
    };

    loadMessages();
  }, [currentSession]);

  // ✅ 스크롤 항상 아래로
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ✅ 언마운트 시 cleanup
  useEffect(() => {
    return () => closeEventSource();
  }, [closeEventSource]);

  const appendMessage = useCallback((msg) => {
    console.log('[DEBUG] 메시지 추가:', msg);
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastMessage = useCallback((delta) => {
    console.log('[DEBUG] 마지막 메시지 업데이트:', delta);
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];

      if (last?.role === 'ai' && (!last.type || last.type === 'regular')) {
        updated[updated.length - 1] = { ...last, content: last.content + delta };
      } else {
        updated.push({ role: 'ai', content: delta, type: 'regular' });
      }
      return updated;
    });
  }, []);

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    const sessionId = currentSession?.id;
    console.log('[DEBUG] handleSend 호출됨:', { prompt, sessionId, isStreaming });

    if (!prompt) {
      console.warn('[WARN] 입력값 없음 → 전송 취소');
      return;
    }
    if (!sessionId) {
      console.warn('[WARN] 세션 ID 없음 → 전송 취소');
      return;
    }
    if (isStreaming) {
      console.warn('[WARN] 현재 스트리밍 중 → 전송 취소');
      return;
    }

    setIsStreaming(true);
    setInput('');
    setFile(null);

    const userMsg = { role: 'user', content: prompt };
    appendMessage(userMsg);

    try {
      console.log('[DEBUG] saveMessage 호출');
      await saveMessage({ sessionId, ...userMsg });
    } catch (err) {
      console.error('[ERROR] 메시지 저장 실패:', err);
    }

    closeEventSource();

    const url = new URL(`${API_BASE}/llm/stream`);
    url.searchParams.append('session_id', sessionId);
    url.searchParams.append('prompt', prompt);
    console.log('[DEBUG] EventSource URL:', url.toString());

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    appendMessage({ role: 'ai', content: '' });

    eventSource.onmessage = (event) => {
      console.log('[DEBUG] SSE 수신:', event.data);
      try {
        const data = JSON.parse(event.data);
        if (data.content) {
          updateLastMessage(data.content);
        } else if (data.thinking_message) {
          appendMessage({ role: 'thinking', content: data.thinking_message });
        } else if (data.tool_message) {
          appendMessage({ role: 'tool', content: data.tool_message });
        }
      } catch (err) {
        console.error('[ERROR] SSE 데이터 파싱 실패:', event.data, err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[ERROR] EventSource 실패:', err);
      closeEventSource();
      setIsStreaming(false);
      onSessionUpdated?.();
    };
  }, [input, currentSession, isStreaming, appendMessage, updateLastMessage, onSessionUpdated, closeEventSource]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-10 text-sm">
            무엇이든 물어보세요.
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble key={idx} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        input={input}
        setInput={setInput}
        onSend={handleSend}
        file={file}
        setFile={setFile}
        isMaximized={isMaximized}
      />
    </div>
  );
}
