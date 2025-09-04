/* 
  파일: src/components/services/realtime.js
  역할: 실시간 업데이트 더미 커넥터(폴링). 추후 SSE/WebSocket으로 교체하기 위한 인터페이스 자리.

  LINKS:
    - 이 파일을 사용하는 곳:
      * (예정) 대시보드/알림 등에서 필요한 실시간 이벤트 수신
    - 이 파일이 사용하는 것: (없음)

  노트:
    - connectRealtime({ sessionId, onData, intervalMs })로 주기적 폴링.
    - disconnectRealtime()로 정리. 나중에 같은 API로 WebSocket 교체 가능.
*/

// 지금은 폴링/더미. 나중에 SSE/WebSocket으로 교체
let timer = null;

/* 
  connectRealtime({ sessionId, onData, intervalMs })
  목적: intervalMs 간격으로 폴링하여 onData 콜백을 호출하는 더미 구현.

  인자:
    - sessionId: 세션/채널 식별자(필요 시 사용)
    - onData: 폴링 결과를 전달받을 콜백
    - intervalMs: 폴링 주기(ms). 0 이하이면 동작하지 않음.

  반환:
    - 없음
*/
export function connectRealtime({ sessionId, onData, intervalMs = 0 }) {
  if (intervalMs <= 0) return;
  timer = setInterval(async () => {
    try {
      // TODO: /events 폴링 등으로 onData 호출
    } catch { /* noop */ }
  }, intervalMs);
}

/* 
  disconnectRealtime()
  목적: 진행 중인 폴링 타이머를 정리한다.

  인자:
    - 없음

  반환:
    - 없음
*/
export function disconnectRealtime() {
  if (timer) clearInterval(timer);
  timer = null;
}
