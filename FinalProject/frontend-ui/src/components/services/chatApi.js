// ✅ src/components/services/chatApi.js
import { BASE_URL } from './env.js';

function withTimeout(ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

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

export async function getChatSessions({ page = 1, size = 30 } = {}) {
  const data = await request(`/chat/sessions?page=${page}&size=${size}`);
  return data?.sessions ?? [];
}

export async function getMessages(sessionId, { page = 1, size = 50 } = {}) {
  const data = await request(`/chat/messages/${sessionId}?page=${page}&size=${size}`);
  return data?.messages ?? [];
}

export async function saveMessage({ sessionId, role, content, messageId, userId }) {
  await request(`/chat/save`, {
    method: 'POST',
    headers: { 'Idempotency-Key': messageId },
    body: JSON.stringify({ session_id: sessionId, role, content, message_id: messageId, user_id: userId }),
  });
}
