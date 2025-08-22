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
      sessionId, prompt,
      onDelta: (chunk, full) => ...,
      onToolMessage: (msg) => ...,
      onDone: (full) => ...,
      onError: (err) => ...
    });
    // 중단: stop();
*/

import { LLM_API_BASE } from './env';

/* 
  streamLLM({ sessionId, prompt, onDelta, onToolMessage, onDone, onError })
  목적: SSE로 토큰 스트리밍을 수신하고 적절한 콜백을 호출한다.

  인자:
    - sessionId: 세션 ID (쿼리스트링로 전달)
    - prompt: 사용자 입력 프롬프트
    - onDelta(token, full): 토큰 단위 증분이 오면 호출 (full은 누적 텍스트)
    - onToolMessage(msg): 도구 메시지 수신 시 호출
    - onDone(full): 스트림 종료 시 호출
    - onError(err): 에러 발생 시 호출

  반환:
    - stop(): 현재 SSE 연결을 종료하는 함수
*/
export function streamLLM({ sessionId, prompt, onDelta, onToolMessage, onDone, onError }) {
  const url = `${LLM_API_BASE}/llm/stream?session_id=${encodeURIComponent(sessionId)}&prompt=${encodeURIComponent(prompt)}`;
  const es = new EventSource(url);
  let full = '';

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.done) {
        es.close();
        onDone?.(full);
      } else if (data.tool_message) {
        onToolMessage?.(data.tool_message);
      } else if (data.content) {
        full += data.content;
        onDelta?.(data.content, full);
      }
    } catch (err) {
      console.error('SSE parse error', err);
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
