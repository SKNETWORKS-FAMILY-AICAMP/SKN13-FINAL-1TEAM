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

  // 새 메시지 도착 때 오토스크롤 (✅ 병합된 목록 기준으로 스크롤)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]); // displayMessages로 바꿔도 OK. (아래 useMemo에서 messages만 의존)

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

  // 스트림 종료 공통 처리: SSE 정리 + 상태 갱신 + 세션 목록 새로고침 신호
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

    // 입력/첨부 초기화: UX 상 즉시 비움
    setInput('');
    setFiles([]);

    // (신규) 프리사인드 업로드를 비동기 병렬 수행(UX 방해 없음)
    if (hasFiles) {
      (async () => {
        try {
          await Promise.all(
            (files || []).map(f => uploadChatbotFilePresigned(f, { sessionId }))
          );
          // 필요 시: 업로드 완료 후 attachments의 실제 URL로 UI 갱신 로직 추가 가능
        } catch (err) {
          console.error('[ERROR] 파일 업로드 실패:', err);
        }
      })();
    }

    // 사용자 메시지 저장(첨부 메타는 별도 업로드 경로에서 처리됨)
    try {
      await saveMessage({ sessionId, role: 'user', content: prompt });
    } catch (err) {
      console.error('[ERROR] 메시지 저장 실패:', err);
    }

    // SSE 연결 시작: /llm/stream
    const url = new URL(`${BASE_URL}/llm/stream`, window.location.origin);
    url.searchParams.append('session_id', sessionId);
    url.searchParams.append('prompt', prompt);

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

        // 첨부 수신 시 마지막 AI 메시지에 결합
        if (Array.isArray(data.attachments) && data.attachments.length > 0) {
          attachToLastAI(normalizeAttachments(data.attachments));
        }

        if (data.done) {
          endStream();
          return;
        }

        if (data.content) updateLastMessage(data.content);
        else if (data.thinking_message) appendMessage({ role: 'thinking', content: data.thinking_message }); // ✅ thinking
        else if (data.tool_message) appendMessage({ role: 'tool', content: data.tool_message });             // ✅ tool
      } catch (e) {
        // JSON 파싱 실패(일부 토큰이 생으로 오는 경우)는 무시
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

  /* -------------------- ✅ 연속 assistant/tool/thinking 병합 -------------------- */
  // 같은 턴에서 연속으로 오는 assistant 계열 메시지들을 하나로 합쳐
  // MessageBubble 하나가 그 턴 전체를 담당하도록 만든다.
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
