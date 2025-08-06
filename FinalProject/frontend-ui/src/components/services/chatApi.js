import { API_BASE } from './env';

export async function saveMessage({ sessionId, role, content }) {
  const res = await fetch(`${API_BASE}/chat/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, role, content }),
  });
  if (!res.ok) throw new Error('메시지 저장 실패');
}

export async function getChatSessions() {
  const res = await fetch(`${API_BASE}/chat/sessions`);
  if (!res.ok) throw new Error('세션 목록 실패');
  const data = await res.json();
  return data.sessions;
}

export async function getMessages(sessionId) {
  const res = await fetch(`${API_BASE}/chat/messages/${sessionId}`);
  if (!res.ok) throw new Error('메시지 조회 실패');
  const data = await res.json();
  return data.messages;
}
