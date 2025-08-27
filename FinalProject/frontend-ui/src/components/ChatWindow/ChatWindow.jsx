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

  문서 편집 연동(이번 추가):
    - isEditQuery(): 편집 의도 질의 감지(‘수정/추가/삭제/변경/제목/내용/문서/편집’ 키워드)
    - 편집 의도 시, window.electron.getEditorContent() 로 에디터 HTML을 받아 SSE 쿼리에 동봉
    - 스트림 중 data.document_update 가 오면, window.electron.ipcRenderer.send('update-editor-content', html) 로 기능창 에디터 반영
    - (옵션) 서버가 needs_document_content 를 요청하면 자동 툴 라운드트립로 재요청
*/

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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

  // ⛔ 중지(Abort): 진행 중 스트림 종료 + 즉시 새 질문 가능
  const handleAbort = useCallback(() => {
    closeEventSource();
    setIsStreaming(false);
  }, [closeEventSource]);

  /* ---------- 문서 편집 연동: 편집 의도 감지 + 에디터 콘텐츠 요청 ---------- */
  const isEditQuery = (prompt) => {
    const keywords = ['수정', '추가', '삭제', '변경', '제목', '내용', '문서', '편집'];
    return keywords.some(keyword => prompt.includes(keyword));
  };

  // (옵션) 서버가 문서 내용을 요구하는 툴 콜을 지시했을 때 자동 처리
  const handleToolRequest = useCallback(async (toolRequestData) => {
    appendMessage({ role: 'thinking', content: '문서 내용을 분석하고 있습니다...' });

    let documentContent = '';
    try {
      // 기능창(Tiptap 등) 에디터에서 HTML 수집
      documentContent = await window.electron.getEditorContent();
    } catch (e) {
      console.error('getEditorContent 실패(기능창 미활성 등):', e);
      if (typeof window.getTiptapEditorContent === 'function') {
        documentContent = window.getTiptapEditorContent();
      }
    }

    const toolResult = {
      tool_call_id: toolRequestData?.agent_context?.tool_call_id,
      result: documentContent,
    };

    // 툴 결과를 서버로 스트리밍 재요청
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession?.id, appendMessage, endStream]);

  /* -------------------- SSE 스트림 처리 루틴 -------------------- */
  const handleStream = useCallback(async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 마지막 partial 라인은 다음 루프에서

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const jsonStr = line.substring(6);
          if (jsonStr === '[DONE]') {
            endStream();
            return;
          }
          const data = JSON.parse(jsonStr);

          // ① 서버가 "문서 내용 필요" 지시
          if (data.needs_document_content) {
            await handleToolRequest(data);
            return; // 이 스트림은 종료하고, 위에서 재스트림
          }

          // ② 서버가 실시간 문서 업데이트(html) 지시
          if (data.document_update) {
            window.electron.ipcRenderer.send('update-editor-content', data.document_update);
          }

          // ③ 첨부 파일
          if (Array.isArray(data.attachments) && data.attachments.length > 0) {
            attachToLastAI(normalizeAttachments(data.attachments));
          }

          // ④ 일반 토큰/메시지
          if (data.done) {
            endStream();
            return;
          }
          if (data.content) updateLastMessage(data.content);
          else if (data.thinking_message) appendMessage({ role: 'thinking', content: data.thinking_message });
          else if (data.tool_message) appendMessage({ role: 'tool', content: data.tool_message });
        } catch (_e) {
          // JSON parse 실패는 일부 토큰 조각일 수 있으므로 무시
        }
      }
    }
  }, [endStream, attachToLastAI, updateLastMessage, appendMessage, normalizeAttachments, handleToolRequest]);

  /* 메시지 전송: 파일 업로드(프리사인드) + 메시지 저장 + SSE 스트림 수신
     - UX 원칙: 화면에는 즉시 미리보기(파일/이미지) → 업로드는 비동기로 진행
     - 에러는 콘솔 로깅(필요 시 토스트 등 UI 처리 확장 가능) */
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

    // 사용자 말풍선에 즉시 미리보기 첨부(이미지는 objectURL)
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

    // (신규) 프리사인드 업로드 비동기 병렬 수행(UX 방해 없음)
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

    // SSE 연결 URL 구성
    const url = new URL(`${BASE_URL}/llm/stream`, window.location.origin);
    url.searchParams.append('session_id', sessionId);
    url.searchParams.append('prompt', prompt);

    // ✨ 편집 의도면 에디터 콘텐츠 동봉
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

    // SSE 시작
    const es = new EventSource(url);
    eventSourceRef.current = es;

    // AI 말풍선 프레임 추가(토큰 누적용)
    appendMessage({ role: 'ai', content: '' });

    es.onmessage = (event) => {
      try {
        // 스트림 종료 신호
        if (event.data === '[DONE]') {
          endStream();
          return;
        }

        const data = JSON.parse(event.data);

        // 실시간 문서 업데이트 지시가 오면 기능창 에디터에 반영
        if (data.document_update) {
          window.electron.ipcRenderer.send('update-editor-content', data.document_update);
        }

        // 첨부 수신 시 마지막 AI 메시지에 결합
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
      } catch (_e) {
        // JSON 파싱 실패는 무시
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

  /* -------------------- 연속 assistant/tool/thinking 병합 -------------------- */
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

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 max-w-full">
        {displayMessages.length === 0 ? (
          <div className="text-center text-gray-400 mt-10 text-sm">무엇이든 물어보세요.</div>
        ) : (
          displayMessages.map((msg, idx) => <MessageBubble key={idx} message={msg} />)
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
