// ✅ src/components/services/searchApi.js
// OpenSearch 호출 추상화(백엔드 라우터와만 통신)
import { BASE_URL } from './env.js';

export async function searchDocs({ query, topK = 5, filters = {} }) {
  const res = await fetch(`${BASE_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, topK, filters }),
  });
  if (!res.ok) throw new Error('search failed');
  return res.json(); // { hits: [...] }
}