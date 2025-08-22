import { LLM_API_BASE } from './env';

// SSE 스트리밍
export function streamLLM({ sessionId, prompt, documentContent, onDelta, onToolMessage, onDone, onError }) {
  const url = new URL(`${LLM_API_BASE}/llm/stream`);
  url.searchParams.append('session_id', sessionId);
  url.searchParams.append('prompt', prompt);
  if (documentContent) {
    url.searchParams.append('document_content', documentContent);
  }
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
