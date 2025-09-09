// ✅ 파일: frontend-ui/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 배포(exe)에서 file://로 로드될 때 정적 리소스 경로 깨짐 방지
  base: './',
  plugins: [react()],

  // 이 프록시는 "개발 서버"에서만 동작합니다.
  // 배포(exe)에서는 효과가 없으므로, 실제 호출은 절대주소(BASE_URL)를 쓰세요.
  server: {
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
