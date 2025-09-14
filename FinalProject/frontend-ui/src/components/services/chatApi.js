// ✅ src/components/services/chatApi.js
import { CHAT_URL } from './env.js';

function withTimeout(ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

async function request(path, { method = 'GET', headers = {}, body, timeout = 8000 } = {}) {
  const { signal, done } = withTimeout(timeout);
  const reqId = crypto.randomUUID();
  try {
    const token = localStorage.getItem('userToken');
    const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

    const res = await fetch(`${CHAT_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': reqId,
        ...headers,
        ...authHeaders,
      },
      body,
      signal,
    });

    const ct = res.headers.get('content-type') || '';
    
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      if (ct.includes('application/json')) {
        try {
          const errData = await res.json();
          msg += `: ${errData.detail || JSON.stringify(errData)}`;
        } catch (_) {}
      }
      throw new Error(msg);
    }
    return ct.includes('application/json') ? res.json() : res.text();
  } finally {
    done();
  }
}

// --- API 함수들 ---

// 세션 목록 불러오기
export async function getChatSessions({ page = 1, size = 30 } = {}) {
  const data = await request(`/sessions?page=${page}&size=${size}`);
  return data?.sessions ?? [];
}

// 특정 세션의 메시지 가져오기
export async function getMessages(sessionId, { page = 1, size = 50 } = {}) {
  const data = await request(`/${sessionId}/messages?page=${page}&size=${size}`);
  return data?.messages ?? [];
}

// 메시지 저장
export async function saveMessage({ sessionId, role, content, messageId, userId }) {
  return request(`/save`, {
    method: 'POST',
    headers: { 'Idempotency-Key': messageId },
    body: JSON.stringify({ session_id: sessionId, role, content, message_id: messageId, user_id: userId }),
  });
}

// 새 세션 생성 및 개인화된 인사말 받기
export async function createNewSessionWithGreeting() {
  return request(`/session/new-with-greeting`, {
    method: 'POST'
  });
}