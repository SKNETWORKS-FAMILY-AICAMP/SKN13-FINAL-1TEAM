// ✅ src/components/services/realtime.js
// 지금은 폴링/더미. 나중에 SSE/WebSocket으로 교체
let timer = null;
export function connectRealtime({ sessionId, onData, intervalMs = 0 }) {
  if (intervalMs <= 0) return;
  timer = setInterval(async () => {
    try {
      // TODO: /events 폴링 등으로 onData 호출
    } catch { /* noop */ }
  }, intervalMs);
}
export function disconnectRealtime() {
  if (timer) clearInterval(timer);
  timer = null;
}