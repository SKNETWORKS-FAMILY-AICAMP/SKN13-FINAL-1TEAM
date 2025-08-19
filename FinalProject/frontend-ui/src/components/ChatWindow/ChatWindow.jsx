// src/components/ChatWindow/ChatWindow.jsx
/**
 * 채팅창 전체 컴포넌트
 *
 * 주요 기능:
 * - 현재 세션에 속한 메시지 불러오기 및 표시
 * - 사용자 입력을 받아 SSE(EventSource)로 모델 응답 스트리밍
 * - 파일 첨부 시 프리사인드 업로드 지원
 * - 메시지 리스트 자동 스크롤 처리
 * - 전송 중지(Abort) 기능 제공
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble.jsx';
import ChatInput from './ChatInput.jsx';
import { getMessages, saveMessage } from '../services/chatApi.js';
import { BASE_URL } from '../services/env.js';
import { uploadChatbotFilePresigned } from '../services/uploadPresigned.js';

export default function ChatWindow({ currentSession, onSessionUpdated, isMaximized }) {
  const [messages, setMessages] = useState([]);   // 대화 메시지 배열
  const [input, setInput] = useState('');         // 입력창 텍스트 상태
  const [files, setFiles] = useState([]);         // 첨부 파일 배열
  const [isStreaming, setIsStreaming] = useState(false); // 모델 응답 진행 여부

  const messagesEndRef = useRef(null);            // 자동 스크롤 위치 참조
  const eventSourceRef = useRef(null);            // SSE 연결 객체 참조

  // SSE 연결 닫기
  const closeEventSource = useCallback(() => {
    eventSourceRef.current?.close?.();
    eventSourceRef.current = null;
  }, []);

  // 첨부파일 객체 정규화 (백엔드 응답 형식 정리)
  const normalizeAttachments = useCallback((arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map((a) => ({
      name: a.name || a.filename || 'attachment',
      type: a.type || a.mimetype || '',
      url: a.url || a.previewUrl || a.href || null,
    }));
  }, []);

  /**
   * 세션이 변경되면 해당 세션의 메시지를 불러옴
   */
  useEffect(() => {
    if (!currentSession?.id) { 
      setMessages([]); 
      return; 
    }
    (async () => {
      try {
        const loaded = await getMessages(currentSession.id);
        setMessages(loaded || []);
      } catch (err) {
        console.error('[ERROR] 메시지 불러오기 실패:', err);
      }
    })();
  }, [currentSession]);

  /**
   * 메시지가 변경될 때마다 스크롤을 최신 메시지로 이동
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * 언마운트 시 SSE 정리
   */
  useEffect(() => () => closeEventSource(), [closeEventSource]);

  // 메시지 추가
  const appendMessage = useCallback((msg) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  // 마지막 AI 메시지 업데이트 (스트리밍 델타 추가)
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

  // 마지막 AI 메시지에 첨부 추가
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

  // 스트림 종료 처리
  const endStream = useCallback(() => {
    closeEventSource();
    setIsStreaming(false);
    onSessionUpdated?.();
  }, [closeEventSource, onSessionUpdated]);

  // 중지 버튼 처리: 스트림 종료 후 즉시 입력 가능 상태로
  const handleAbort = useCallback(() => {
    closeEventSource();
    setIsStreaming(false);
  }, [closeEventSource]);

  /**
   * 메시지 전송 핸들러
   * - 입력된 텍스트와 첨부 파일을 기반으로 사용자 메시지 추가
   * - 첨부 파일은 프리사인드 업로드를 통해 백엔드에 저장
   * - SSE를 통해 모델 응답 스트리밍 처리
   */
  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    const sessionId = currentSession?.id;
    const hasFiles = (files?.length || 0) > 0;

    if (!prompt && !hasFiles) return;
    if (!sessionId) return;
    if (isStreaming) return;

    // 이전 SSE 연결 정리
    closeEventSource();
    setIsStreaming(true);

    // 사용자 메시지에 즉시 미리보기 첨부 표시
    const attachmentsForPreview = (files || []).map(f => ({
      name: f.name,
      type: f.type || 'application/octet-stream',
      url: f.type?.startsWith('image/') ? URL.createObjectURL(f) : null,
    }));

    appendMessage(attachmentsForPreview.length > 0
      ? { role: 'user', content: prompt, attachments: attachmentsForPreview }
      : { role: 'user', content: prompt });

    // 입력창과 첨부 초기화
    setInput('');
    setFiles([]);

    // 프리사인드 업로드는 백그라운드 처리
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

    // 사용자 메시지 DB 저장
    try {
      await saveMessage({ sessionId, role: 'user', content: prompt });
    } catch (err) {
      console.error('[ERROR] 메시지 저장 실패:', err);
    }

    // SSE 연결 시작
    const url = new URL(`${BASE_URL}/llm/stream`, window.location.origin);
    url.searchParams.append('session_id', sessionId);
    url.searchParams.append('prompt', prompt);

    const es = new EventSource(url);
    eventSourceRef.current = es;

    appendMessage({ role: 'ai', content: '' });

    es.onmessage = (event) => {
      try {
        // 스트림 종료 신호
        if (event.data === '[DONE]') {
          endStream();
          return;
        }

        const data = JSON.parse(event.data);

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
        // JSON 파싱 불가한 경우는 토큰 단위일 수 있으므로 무시
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
      {/* 메시지 출력 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-10 text-sm">무엇이든 물어보세요.</div>
        ) : (
          messages.map((msg, idx) => <MessageBubble key={idx} message={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 입력창 */}
      <ChatInput
        input={input}
        setInput={setInput}
        onSend={handleSend}
        files={files}
        setFiles={setFiles}
        isMaximized={isMaximized}
        isStreaming={isStreaming} // 전송/중지 버튼 제어
        onAbort={handleAbort}
      />
    </div>
  );
}
