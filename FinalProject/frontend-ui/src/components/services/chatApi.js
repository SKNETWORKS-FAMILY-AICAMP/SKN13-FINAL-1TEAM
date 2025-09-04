/* 
  파일: src/components/services/chatApi.js
  역할: 채팅 세션/메시지 CRUD를 백엔드와 통신하는 래퍼.

  LINKS:
    - 이 파일을 사용하는 곳:
      * ChatWindow.jsx → getMessages(), saveMessage() 사용
    - 이 파일이 사용하는 것:
      * env.js → BASE_URL (API 루트)
      * window.fetch (AbortController로 타임아웃 제어)

  흐름:
    - request()는 공통 fetch 유틸(요청 ID/X-Request-ID 헤더, 컨텐츠 타입 자동 분기, 타임아웃).
    - getChatSessions(), getMessages()는 페이지네이션 대응.
    - saveMessage()는 멱등성 키(Idempotency-Key)로 재시도/중복 전송을 방지.
*/

import { BASE_URL } from './env.js';

/* 
  withTimeout(ms)
  목적: fetch에 사용할 AbortController와 타임아웃 타이머를 생성한다.

  반환:
    - { signal, done }
      * signal: fetch 옵션에 그대로 전달
      * done(): 타이머 해제(메모리 누수 방지)
*/
function withTimeout(ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

/* 
  request(path, options)
  목적: 공통 HTTP 요청 래퍼 (타임아웃/콘텐츠 타입 분기/요청 ID/에러 처리).

  인자:
    - path: "/chat/..." 형태 경로
    - options: { method, headers, body, timeout }

  반환:
    - JSON이면 파싱된 객체, 아니면 텍스트
    - 실패 시 Error throw
*/
async function request(path, { method = 'GET', headers = {}, body, timeout = 8000 } = {}) {
  const { signal, done } = withTimeout(timeout);
  const reqId = crypto.randomUUID();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': reqId, ...headers },
      body,
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  } finally { done(); }
}

/* 
  getChatSessions({ page, size })
  목적: 채팅 세션 목록을 페이지 단위로 가져온다.

  인자:
    - page: 페이지 번호(기본 1)
    - size: 페이지당 개수(기본 30)

  반환:
    - 세션 배열
*/
export async function getChatSessions({ page = 1, size = 30 } = {}) {
  const data = await request(`/chat/sessions?page=${page}&size=${size}`);
  return data?.sessions ?? [];
}

/* 
  getMessages(sessionId, { page, size })
  목적: 특정 세션의 메시지 목록을 가져온다.

  인자:
    - sessionId: 세션 식별자
    - page: 페이지 번호(기본 1)
    - size: 페이지당 개수(기본 50)

  반환:
    - 메시지 배열
*/
export async function getMessages(sessionId, { page = 1, size = 50 } = {}) {
  const data = await request(`/chat/messages/${sessionId}?page=${page}&size=${size}`);
  return data?.messages ?? [];
}

/* 
  saveMessage({ sessionId, role, content, messageId, userId })
  목적: 메시지를 서버에 저장한다(멱등성 키로 중복 방지).

  인자:
    - sessionId: 세션 ID
    - role: 'user' | 'assistant' | ...
    - content: 본문 텍스트
    - messageId: 클라이언트 생성 멱등성 키(중복 전송 방지)
    - userId: 사용자 ID(선택)

  반환:
    - 응답 본문 사용하지 않음 (성공 시 2xx 가정)
*/
export async function saveMessage({ sessionId, role, content, messageId, userId }) {
  await request(`/chat/save`, {
    method: 'POST',
    headers: { 'Idempotency-Key': messageId },
    body: JSON.stringify({ session_id: sessionId, role, content, message_id: messageId, user_id: userId }),
  });
}
