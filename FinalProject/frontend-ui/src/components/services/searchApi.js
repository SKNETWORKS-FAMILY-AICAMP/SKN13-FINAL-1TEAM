/* 
  파일: src/components/services/searchApi.js
  역할: 검색(예: OpenSearch/벡터 검색) 백엔드 라우터를 호출하는 얇은 래퍼.

  LINKS:
    - 이 파일을 사용하는 곳:
      * 글로벌 검색 UI(미구현) 또는 문서검색 바에서 사용 예정
    - 이 파일이 사용하는 것:
      * env.js → BASE_URL

  노트:
    - filters 스키마는 백엔드 라우터와 합의 필요. 현재는 그대로 전달.
*/

import { BASE_URL } from './env.js';

/* 
  searchDocs({ query, topK, filters })
  목적: 검색 질의(query)를 백엔드로 보내 상위 topK 결과를 받는다.

  인자:
    - query: 검색어(문장/키워드)
    - topK: 상위 N개 반환(기본 5)
    - filters: 도메인별 필터(객체 그대로 전달)

  반환:
    - { hits: [...] } 형태의 JSON (백엔드 스키마에 따름)
*/
export async function searchDocs({ query, topK = 5, filters = {} }) {
  const res = await fetch(`${BASE_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, topK, filters }),
  });
  if (!res.ok) throw new Error('search failed');
  return res.json(); // { hits: [...] }
}
