import React, { useEffect, useState, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble.jsx';
import ChatInput from './ChatInput.jsx';
import { getMessages, saveMessage } from '../services/chatApi.js';
import { API_BASE } from '../services/env.js';

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

    // 첨부 -> objectURL(이미지만)로 미리보기
    const attachments = (files || []).map(f => ({
      name: f.name,
      type: f.type || 'application/octet-stream',
      url: f.type?.startsWith('image/') ? URL.createObjectURL(f) : null,
    }));

    appendMessage(attachments.length > 0
      ? { role: 'user', content: prompt, attachments }
      : { role: 'user', content: prompt });

    // 입력/첨부 초기화
    setInput('');
    setFiles([]);

    try {
      await saveMessage({ sessionId, role: 'user', content: prompt });
    } catch (err) {
      console.error('[ERROR] 메시지 저장 실패:', err);
    }

    // SSE 시작
    const url = new URL(`${API_BASE}/llm/stream`, window.location.origin);
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

        if (data.done) { // 서버가 done 플래그로 보낼 수도 있음
          endStream();
          return;
        }

        if (data.content) updateLastMessage(data.content);
        else if (data.thinking_message) appendMessage({ role: 'thinking', content: data.thinking_message });
        else if (data.tool_message) appendMessage({ role: 'tool', content: data.tool_message });
      } catch (e) {
        // JSON이 아니면 토큰일 수도 있으니 그냥 무시하거나 로그만
        // console.log('raw event', event.data);
      }
    };

    es.onerror = () => {
      // 에러로 끝난 경우도 깔끔히 풀어줌
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
      />
    </div>
  );
}
