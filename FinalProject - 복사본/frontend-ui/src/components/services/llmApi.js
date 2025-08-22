import { LLM_API_BASE } from './env';

// SSE 스트리밍
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
