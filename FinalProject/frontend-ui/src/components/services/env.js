/* 
  파일: src/components/services/env.js
  역할: 프론트엔드 전역에서 참조하는 API 엔드포인트/상수 정의.

  LINKS:
    - 이 파일을 사용하는 곳:
      * chatApi.js, documentsApi.js, searchApi.js, storageApi.js, llmApi.js 등 모든 서비스 계층
      * UI: ChatWindow.jsx(LLM/SSE), FeatureDocs.jsx(문서 API가 도입될 경우)
    - 이 파일이 사용하는 것: (없음)

  노트:
    - GOOGLE_CLIENT_ID를 사용하는 화면(GoogleLinkPage.jsx)이 있다면, 동일 파일에서 export 추가가 필요함.
      예) export const GOOGLE_CLIENT_ID = '...';  ← 실제 배포 시 안전한 주입 방식 권장(.env + 빌드타임)
    - 운영 환경에 따라 API_BASE만 바꿔도 나머지 경로가 자동으로 따라가도록 별칭(BASE_URL) 유지.
*/

// 단일서버 개발 중에도 API 버전 경로 고정(나중에 프록시만 바꿔도 됨)
export const API_BASE = 'http://13.125.105.129:8000/api/v1'; // AWS 서버 주소로 변경
export const BASE_URL = API_BASE;        // alias
export const FILE_UPLOAD_URL = `${BASE_URL}/files/presignd`; // 이 부분은 이제 Electron IPC로 처리되므로 직접 사용되지 않음
export const LLM_API_BASE = '/api/v1';   // 일관성을 위해 API_BASE로 변경
// TODO: 실제 배포 시 Nginx/프록시에서 /api/v1 -> FastAPI 로 연결
