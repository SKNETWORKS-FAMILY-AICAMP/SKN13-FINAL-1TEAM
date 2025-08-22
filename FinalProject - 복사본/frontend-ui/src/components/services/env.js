// ✅ src/components/services/env.js
// 단일서버 개발 중에도 API 버전 경로 고정(나중에 프록시만 바꿔도 됨)
export const API_BASE = 'http://13.125.105.129:8000/api/v1'; // AWS 서버 주소로 변경
export const BASE_URL = API_BASE;        // alias
export const FILE_UPLOAD_URL = `${BASE_URL}/files/presign`; // 이 부분은 이제 Electron IPC로 처리되므로 직접 사용되지 않음
export const LLM_API_BASE = '/api/v1';   // 일관성을 위해 API_BASE로 변경
// TODO: 실제 배포 시 Nginx/프록시에서 /api/v1 -> FastAPI 로 연결