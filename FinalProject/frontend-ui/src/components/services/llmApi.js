import { LLM_API_BASE } from './env';

export async function getLLMResponse(prompt) {
  const res = await fetch(`${LLM_API_BASE}/chat/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error('LLM 응답 실패');
  const data = await res.json();
  return data.response;
}
