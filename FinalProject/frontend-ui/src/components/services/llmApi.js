import { CHAT_URL, BASE_URL } from './env';

// Fetch를 사용한 SSE 스트리밍 - createAxios 토큰 로직 활용
export function streamLLM({
  sessionId,
  prompt,
  documentContent,
  onDelta,
  onToolMessage,
  onThinking,
  onDocumentUpdate,
  onNeedsDocument,
  onLocalDocuments,
  onDocumentButtons,
  onDone,
  onError,
}) {
  console.log('🚀 streamLLM 함수 호출됨 - Fetch 버전!', { sessionId, prompt });
  
  const params = new URLSearchParams({
    session_id: sessionId,
    prompt: prompt,
  });

  if (documentContent) {
    params.append('document_content', documentContent);
  }

  const url = `${CHAT_URL}/stream?${params.toString()}`;
  console.log('🔗 요청 URL:', url);

  let full = '';
  let controller = new AbortController();
  let closed = false;

  function safeClose() {
    if (!closed) {
      closed = true;
      controller.abort();
    }
  }

  // 토큰 갱신 함수 (createAxios 로직 참고)
  const refreshToken = async () => {
    try {
      const refreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        localStorage.setItem("userToken", data.access_token);
        return data.access_token;
      }
      throw new Error('토큰 갱신 실패');
    } catch (error) {
      localStorage.removeItem("userToken");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      throw error;
    }
  };

  // 스트리밍 요청 함수
  const makeRequest = async (useRefreshToken = false) => {
    let token = localStorage.getItem("userToken");
    
    if (useRefreshToken) {
      token = await refreshToken();
    }
    
    if (!token) {
      console.warn('⚠️ 토큰이 없습니다. 로그인이 필요할 수 있습니다.');
      onError?.(new Error('인증 토큰이 없습니다'));
      return;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
        },
        credentials: 'include',
        signal: controller.signal,
      });

      // 401 에러 시 토큰 갱신 후 재시도
      if (response.status === 401 && !useRefreshToken) {
        console.log('🔄 401 에러 - 토큰 갱신 후 재시도');
        return makeRequest(true);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          onDone?.(full);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            // [DONE] 종료 신호
            if (data === '[DONE]') {
              safeClose();
              onDone?.(full);
              return;
            }

            try {
              const parsed = JSON.parse(data);
              
              // 디버깅을 위한 로그 추가
              console.log('🔍 SSE 데이터 파싱:', Object.keys(parsed));

              // --- 백엔드에서 오는 SSE payload 처리 ---
              if (parsed.content) {
                full += parsed.content;
                onDelta?.(parsed.content, full);
              }

              if (parsed.tool_message) {
                onToolMessage?.(parsed.tool_message);
              }

              if (parsed.thinking_message) {
                onThinking?.(parsed.thinking_message);
              }

              if (parsed.document_update) {
                console.log('🎯 document_update 감지!', parsed.document_update);
                onDocumentUpdate?.(parsed.document_update);
              }

              if (parsed.needs_document_content) {
                onNeedsDocument?.(parsed.agent_context);
              }

              if (parsed.local_documents) {
                console.log('🎯 local_documents 감지!', parsed.local_documents);
                onLocalDocuments?.(parsed.local_documents);
              }

              // 문서 버튼 처리
              if (parsed.type === 'document_buttons' && parsed.document_selection) {
                console.log('📄 document_buttons 감지!', parsed.document_selection);
                onDocumentButtons?.(parsed.document_selection, parsed.content);
              }

            } catch (parseError) {
              if (data.trim()) { // 빈 문자열이 아닌 경우만 로그
                console.error('SSE parse error:', parseError, 'Raw data:', data);
              }
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('🛑 요청이 중단되었습니다');
      } else {
        console.error('❌ Fetch 스트리밍 에러:', error);
        onError?.(error);
      }
    }
  };

  // 요청 시작
  makeRequest();

  // cleanup 함수 반환
  return () => safeClose();
}