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

     임시 방어로직:
    - 문제 상황: 엔터키 연타, 버튼 더블클릭 등으로 한 번에 두 개 이상의 질문 전송이 발생할 수 있음
    - 1차 방어: isStreaming 상태값으로 전송/중지 버튼을 토글하여, 답변이 끝날 때까지 추가 전송을 막음
    - 보강 방어: inFlightSendRef (useRef 기반 동기 락)을 handleSend() 맨 앞에서 true로 세팅
      → 같은 렌더 프레임 내에서 여러 이벤트가 동시에 들어와도 중복 진입 차단
    - 비상 해제: try/catch/finally 블록을 추가하여 EventSource가 열리지 못한 경우
      (예: URL 오류, 에디터 콘텐츠 수집 실패 등) 자동으로 inFlightSendRef / isStreaming을 false로 복구
    - 효과: 최소한의 수정으로 중복 전송을 예방하고, 예외 상황에서도 입력창이 영구 잠기지 않도록 보장
*/

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import MessageBubble from './MessageBubble.jsx';
import ChatInput from './ChatInput.jsx';
import { getMessages, saveMessage } from '../services/chatApi.js';
import { BASE_URL } from '../services/env.js';
import { uploadChatbotFilePresigned } from '../services/uploadPresigned.js';
import { SPACES } from '../services/s3Spaces.js'; // ← 추가: 업로드 대상 공간 상수

export default function ChatWindow({ currentSession, onSessionUpdated, isMaximized }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);           // SSE 핸들
  const fetchControllersRef = useRef(new Set()); // fetch AbortControllers
  // 동기 락(중복 전송 방지용)
  const inFlightSendRef = useRef(false);
  const [toasts, setToasts] = useState([]);
  
  // SSE 핸들 정리(이미 열려있으면 종료)
  const closeEventSource = useCallback(() => {
    eventSourceRef.current?.close?.();
    eventSourceRef.current = null;
  }, []);

  // ✅ 진행 중 스트림/상태를 한 번에 정리(세션 전환/중지 버튼에서 공통 사용)
  const stopAllStreams = useCallback(() => {
    try { closeEventSource(); } catch {}
    // 필요 시 여기에서 fetchControllersRef의 Abort도 함께 처리 가능
    // for (const c of fetchControllersRef.current) { try { c.abort(); } catch {} }
    // fetchControllersRef.current.clear();
    inFlightSendRef.current = false; // 전송 중 락 해제
    setIsStreaming(false);           // 중지 버튼 비활성화 등 UI 복구
  }, [closeEventSource]);

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

  // ✅ 세션이 바뀌면 즉시 중단 + UI 초기화
  useEffect(() => {
    // ★ 변경: 세션 ID 유무와 무관하게 "항상" 진행 중 스트림/전송을 중단(Abort)
    stopAllStreams();                     // 기존 응답 스트림 즉시 종료

    // ★ 변경: 세션이 삭제되어 null이면, 화면(UI)만 초기화
    if (!currentSession?.id) {
      setMessages([]);                    // 이전 대화 비우기
      setInput('');                       // 입력창 초기화
      setFiles([]);                       // 첨부 초기화
    }
    // (선택) 스크롤 초기화가 필요하면 아래 라인 사용
    // messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [currentSession?.id, stopAllStreams]);

  // 새 메시지 도착 때 오토스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 언마운트 시 SSE 정리
  useEffect(() => () => closeEventSource(), [closeEventSource]);

  // ✅ MessageBubble이 dispatch하는 'app:toast' 수신 → 토스트 큐에 push
  useEffect(() => {
    const timers = new Set(); // ★ 변경: 타이머 정리 누락 방지
    const onToast = (e) => {
      const t = e.detail || {};
      const id = t.id || Date.now();
      const timeout = typeof t.timeoutMs === 'number' ? t.timeoutMs : 4000;
      setToasts((prev) => [...prev, { ...t, id }]);
      if (timeout > 0) {
        const timer = setTimeout(() => {
          setToasts((prev) => prev.filter((x) => x.id !== id));
          timers.delete(timer);
        }, timeout);
        timers.add(timer);
      }
    };
    window.addEventListener('app:toast', onToast);
    return () => {
      window.removeEventListener('app:toast', onToast);
      // ★ 변경: effect 종료 시 걸려 있던 타이머 전부 해제
      for (const tm of timers) clearTimeout(tm);
      timers.clear();
    };
  }, []);

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
    inFlightSendRef.current = false;
  }, [closeEventSource, onSessionUpdated]);

  // ⛔ 중지(Abort): 진행 중 스트림 종료 + 즉시 새 질문 가능
  const handleAbort = useCallback(() => {
    closeEventSource();
    setIsStreaming(false);
    inFlightSendRef.current = false;
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
            window.electron.ipcRenderer.send('editor:update-content', data.document_update);
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
    
    if (inFlightSendRef.current) return;
    inFlightSendRef.current = true;

    if (!prompt && !hasFiles){
      inFlightSendRef.current = false;
      return;}
    
    if (!sessionId){ 
      inFlightSendRef.current = false;
      return;}

    if (isStreaming) {
      inFlightSendRef.current = false;
      return;}

    try {
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
              (files || []).map(f =>
                uploadChatbotFilePresigned(f, {
                  sessionId,
                  space: SPACES?.RAW ?? "raw", // 챗봇 "원본" 버킷
                  dir: ""                      // 특정 하위 폴더가 있으면 여기서 "projectA/2025/"처럼 전달
                })
              )
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
        } catch (_e) {
          // JSON 파싱 실패는 무시
        }
      };

      es.onerror = () => {
        endStream();
      };

    } catch (err) {
      // ⬇⬇⬇ [ADD] 스트림 열리기 전에 난 예외는 여기로 옴(로그만)
      console.error('[handleSend] unexpected error before stream open:', err);

    } finally {
      // ⬇⬇⬇ [ADD] 비상 해제: 스트림이 열리지 못했다면 락/상태 자동 복구
      if (!eventSourceRef.current) {
        inFlightSendRef.current = false;  // ref 락 해제
        setIsStreaming(false);            // UI 상태 복구
      }
    }
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
        key={currentSession?.id}      // ✅ 세션 바뀌면 컴포넌트 리마운트 → input/files 초기화
        input={input}
        setInput={setInput}
        files={files}
        setFiles={setFiles}
        isMaximized={isMaximized}
        isStreaming={isStreaming}     // 전송 버튼 disabled / 중지 버튼 enabled 제어
        onSend={handleSend}
        onAbort={stopAllStreams}      // ✅ 중지 클릭 시 즉시 스트림 종료 + UI 상태 복구
      />
      {/* ✅ 우측 하단 토스트 컨테이너 */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              "min-w-[260px] max-w-[360px] rounded-xl shadow-lg px-4 py-3 text-sm " +
              (t.kind === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white")
            }
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="font-medium">{t.title || (t.kind === "error" ? "오류" : "알림")}</div>
                {t.message && <div className="mt-0.5 text-white/90">{t.message}</div>}
              </div>
              <button
                className="ml-1 text-white/70 hover:text-white"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                aria-label="닫기"
                title="닫기"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
