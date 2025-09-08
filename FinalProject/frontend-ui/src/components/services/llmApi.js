import { CHAT_URL } from './env';

// SSE 스트리밍 - FastAPI /stream 엔드포인트와 호환
export function streamLLM({
  sessionId,
  prompt,
  documentContent,
  onDelta,
  onToolMessage,
  onThinking,
  onDocumentUpdate,
  onNeedsDocument,
  onDone,
  onError,
}) {
  const params = new URLSearchParams({
    session_id: sessionId,
    prompt: prompt,
  });

  if (documentContent) {
    params.append('document_content', documentContent);
  }

  const url = `${CHAT_URL}/stream?${params.toString()}`;
  const es = new EventSource(url);
  let full = '';
  let closed = false;

  function safeClose() {
    if (!closed) {
      closed = true;
      es.close();
    }
  }

  es.onmessage = (e) => {
    try {
      // [DONE] 종료 신호
      if (e.data === '[DONE]') {
        safeClose();
        onDone?.(full);
        return;
      }

      const data = JSON.parse(e.data);

      // --- 백엔드에서 오는 SSE payload 처리 ---
      if (data.content) {
        // 일반 LLM 응답 스트림
        full += data.content;
        onDelta?.(data.content, full);
      }

      if (data.tool_message) {
        onToolMessage?.(data.tool_message);
      }

      if (data.thinking_message) {
        onThinking?.(data.thinking_message);
      }

      if (data.document_update) {
        onDocumentUpdate?.(data.document_update);
      }

      if (data.needs_document_content) {
        onNeedsDocument?.(data.agent_context);
      }

    } catch (err) {
      console.error('SSE parse error:', err, 'Raw data:', e.data);
      onError?.(err);
    }
  };

  es.onerror = (err) => {
    console.error('SSE connection error:', err);
    safeClose();
    onError?.(err);
  };

  // cleanup 함수 반환
  return () => safeClose();
}
