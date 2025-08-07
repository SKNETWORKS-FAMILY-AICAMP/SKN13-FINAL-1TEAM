// ✅ GigaChad Refactored ChatWindow.jsx
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

  // 기존 EventSource 안전 종료
  const closeEventSource = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  // 세션 변경 시 메시지 불러오기
  useEffect(() => {
    if (!currentSession?.id) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      try {
        const loaded = await getMessages(currentSession.id);
        setMessages(loaded);
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    };

    loadMessages();
  }, [currentSession]);

  // 스크롤 항상 아래로
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 언마운트 시 cleanup
  useEffect(() => {
    return () => closeEventSource();
  }, [closeEventSource]);

  const appendMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastMessage = useCallback((delta) => {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];

      // If the last message is a regular AI message (no 'type' or type is 'regular'), append to it
      if (last?.role === 'ai' && (!last.type || last.type === 'regular')) {
        updated[updated.length - 1] = { ...last, content: last.content + delta };
      } else {
        // Otherwise, append a new regular AI message
        updated.push({ role: 'ai', content: delta, type: 'regular' }); // Explicitly set type to 'regular'
      }
      return updated;
    });
  }, []);

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    const sessionId = currentSession?.id;
    if (!prompt || !sessionId || isStreaming) return;

    setIsStreaming(true);
    setInput('');
    setFile(null);

    const userMsg = { role: 'user', content: prompt };
    appendMessage(userMsg);
    await saveMessage({ sessionId, ...userMsg });

    closeEventSource();

    const url = new URL(`${API_BASE}/llm/stream`);
    url.searchParams.append('session_id', sessionId);
    url.searchParams.append('prompt', prompt);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // 빈 AI 메시지 추가
    appendMessage({ role: 'ai', content: '' });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.content) {
          updateLastMessage(data.content);
        } else if (data.thinking_message) {
          appendMessage({ role: 'ai', content: data.thinking_message, type: 'thinking' });
        } else if (data.tool_message) {
          appendMessage({ role: 'ai', content: data.tool_message, type: 'tool' });
        }
      } catch (err) {
        console.error('Invalid event data:', event.data);
      }
    };

    eventSource.onerror = (err) => {
      console.error('EventSource failed:', err);
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
