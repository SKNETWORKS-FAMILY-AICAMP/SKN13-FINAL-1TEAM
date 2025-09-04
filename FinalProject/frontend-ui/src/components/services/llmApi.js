/* 
  파일: src/components/services/llmApi.js
  역할: LLM의 SSE 스트리밍을 단순화한 유틸. onDelta/온툴메시지/문서업데이트/완료/에러 콜백을 받아 관리.

  LINKS:
    - 이 파일을 사용하는 곳:
      * ChatWindow.jsx (현재는 직접 EventSource를 사용하지만, 본 유틸로 대체 가능)
    - 이 파일이 사용하는 것:
      * env.js → LLM_API_BASE
      * window.EventSource

  사용 예:
    const stop = streamLLM({
      sessionId, prompt, documentContent,
      onDelta: (chunk, full) => ...,
      onToolMessage: (msg) => ...,
      onDocumentUpdate: (html) => ...,
      onDone: (full) => ...,
      onError: (err) => ...
    });
    // 중단: stop();
*/

import { LLM_API_BASE } from './env';

/* 
  streamLLM({ sessionId, prompt, documentContent, onDelta, onToolMessage, onDocumentUpdate, onDone, onError })
  목적: SSE로 토큰 스트리밍을 수신하고 적절한 콜백을 호출한다.

  인자:
    - sessionId: 세션 ID
    - prompt: 사용자 입력
    - documentContent (옵션): 편집 중 문서 HTML
    - onDelta(token, full): 토큰 단위 콜백
    - onToolMessage(msg): 도구 메시지 콜백
    - onDocumentUpdate(html): 문서 업데이트 수신 시 콜백
    - onDone(full): 종료 시 전체 텍스트
    - onError(err): 에러 콜백

  반환:
    - stop(): 현재 SSE 연결 종료
*/
export function streamLLM({
  sessionId,
  prompt,
  documentContent,
  onDelta,
  onToolMessage,
  onDocumentUpdate,
  onDone,
  onError,
}) {
  const base = `${LLM_API_BASE}/llm/stream`;
  const qs = [
    `session_id=${encodeURIComponent(sessionId)}`,
    `prompt=${encodeURIComponent(prompt)}`,
  ];
  if (documentContent) {
    qs.push(`document_content=${encodeURIComponent(documentContent)}`);
  }
  const url = `${base}?${qs.join('&')}`;

  const es = new EventSource(url);
  let full = '';

  es.onmessage = (e) => {
    try {
      // 문자열 종료 신호
      if (e.data === '[DONE]') {
        es.close();
        onDone?.(full);
        return;
      }

      const data = JSON.parse(e.data);

      // 객체 종료 신호
      if (data.done) {
        es.close();
        onDone?.(full);
        return;
      }

      // 문서 업데이트
      if (data.document_update) {
        onDocumentUpdate?.(data.document_update);
        return;
      }

      // 툴 메시지
      if (data.tool_message) {
        onToolMessage?.(data.tool_message);
        return;
      }

      // 일반 토큰
      if (data.content) {
        full += data.content;
        onDelta?.(data.content, full);
      }
    } catch (err) {
      console.error('SSE parse error', err, 'raw:', e?.data);
      // 파싱 실패는 일부 토큰 조각일 수 있으니 무시
    }
  };

  es.onerror = (err) => {
    console.error('SSE error', err);
    try { es.close(); } catch {}
    onError?.(err);
  };

  // 호출한 쪽에서 중단할 수 있게 반환
  return () => {
    try { es.close(); } catch {}
  };
}
