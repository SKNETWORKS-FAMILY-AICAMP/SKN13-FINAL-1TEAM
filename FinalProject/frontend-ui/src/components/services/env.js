// ✅ src/components/services/env.js
// 단일서버 개발 중에도 API 버전 경로 고정(나중에 프록시만 바꿔도 됨)
export const API_BASE = '/api/v1';
export const BASE_URL = API_BASE;        // alias
export const FILE_UPLOAD_URL = `${BASE_URL}/files/presign`;
export const LLM_API_BASE = '/api/v1';   // 필요 시 분리 라우팅
// TODO: 실제 배포 시 Nginx/프록시에서 /api/v1 -> FastAPI 로 연결
