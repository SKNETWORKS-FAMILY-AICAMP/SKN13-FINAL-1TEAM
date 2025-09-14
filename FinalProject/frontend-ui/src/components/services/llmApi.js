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

            // Raw 데이터 디버깅 - 모든 데이터를 로깅
            console.log('🔍 [llmApi] SSE Raw 데이터:', data);

            try {
              const parsed = JSON.parse(data);

              // 디버깅을 위한 로그 추가 - 더 상세하게
              console.log('🔍 [llmApi] SSE 데이터 파싱 성공:', {
                keys: Object.keys(parsed),
                hasAction: !!parsed.action,
                hasDocument: !!parsed.document,
                actionType: parsed.action,
                data: parsed
              });

              // 문서 자동 열기 처리 (백엔드의 IPC 데이터) - 최우선 처리
              if (parsed.action === 'open_document_in_editor' && parsed.document) {
                console.log('📄 [llmApi] 문서 자동 열기 감지!', {
                  filename: parsed.document.filename,
                  action: parsed.action,
                  hasContent: !!parsed.document.content
                });

                // IPC 데이터 형식 맞추기 (main.js의 핸들러가 기대하는 형식)
                const ipc_data = {
                  ipc_data: parsed  // main.js가 기대하는 { ipc_data } 형식
                };

                console.log('📄 [llmApi] IPC 데이터 전송 시도:', ipc_data);

                // IPC를 통해 메인 프로세스에 전달
                if (window.electron?.openDocumentInEditor) {
                  window.electron.openDocumentInEditor(ipc_data)
                    .then(result => {
                      console.log('✅ [llmApi] 문서 자동 열기 성공:', result);
                    })
                    .catch(error => {
                      console.error('❌ [llmApi] 문서 자동 열기 실패:', error);
                    });
                } else {
                  console.error('❌ [llmApi] window.electron.openDocumentInEditor 함수를 찾을 수 없습니다');
                  console.log('🔍 [llmApi] 사용 가능한 window 객체:', Object.keys(window));
                  console.log('🔍 [llmApi] 사용 가능한 window.electron 객체:', window.electron ? Object.keys(window.electron) : 'undefined');
                }

                // 문서 열기 처리 후 continue 대신 return으로 다른 로직 건너뛰기
                return;
              } else if (parsed.action || parsed.document) {
                console.log('🔍 [llmApi] 다른 액션 또는 문서 데이터:', {
                  action: parsed.action,
                  hasDocument: !!parsed.document,
                  keys: Object.keys(parsed)
                });
              } else {
                // 일반적인 SSE payload 처리
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
              }

            } catch (parseError) {
              if (data.trim()) { // 빈 문자열이 아닌 경우만 로그
                console.error('❌ SSE parse error:', parseError, 'Raw data:', data);
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