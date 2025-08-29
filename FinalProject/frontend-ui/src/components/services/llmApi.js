/* 
  파일: src/components/services/llmApi.js
  역할: LLM의 SSE 스트리밍을 단순화한 유틸. onDelta/온툴메시지/완료/에러 콜백을 받아 관리.

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
    - ... (기존 인자 생략)
    - onDocumentUpdate(html): 문서 업데이트 이벤트 수신 시 호출
    - ...
*/
export function streamLLM({ sessionId, prompt, documentContent, onDelta, onToolMessage, onDocumentUpdate, onDone, onError }) {
  const base = `${LLM_API_BASE}/llm/stream`;
  const qs = [
    `session_id=${encodeURIComponent(sessionId)}`,
    `prompt=${encodeURIComponent(prompt)}`
  ];
  if (documentContent) {
    qs.push(`document_content=${encodeURIComponent(documentContent)}`);
  }
  const url = `${base}?${qs.join('&')}`;

  const es = new EventSource(url);
  let full = '';

  es.onmessage = (e) => {
    try {
      if (e.data === '[DONE]') {
        es.close();
        onDone?.(full);
        return;
      }
      const data = JSON.parse(e.data);
      
      if (data.document_update) {
        onDocumentUpdate?.(data.document_update);
      } else if (data.tool_message) {
        onToolMessage?.(data.tool_message);
      } else if (data.content) {
        full += data.content;
        onDelta?.(data.content, full);
      }
    } catch (err) {
      console.error('SSE parse error', err, 'raw data:', e.data);
    }
  };

  es.onerror = (err) => {
    console.error('SSE error', err);
    es.close();
    onError?.(err);
  };

  // 호출한 쪽에서 중단할 수 있게 반환
  return () => es.close();
}