/* 
  파일: src/components/services/authApi.js
  역할: 인증/계정 복구 관련 API 래퍼(아이디 찾기/비번 재설정). 현재는 더미 구현.

  LINKS:
    - 이 파일을 사용하는 곳:
      * Login/FindId.jsx, Login/ResetPassword.jsx
    - 이 파일이 사용하는 것:
      * window.fetch (향후 실제 API 연동 시)

  노트:
    - TODO 주석에 실제 백엔드 엔드포인트 예시가 포함되어 있으니, 배포 전 반드시 교체 필요.
*/

// ✅ src/components/services/authApi.js
// 실제 API는 여기에 연동. (우리 원칙대로 UI/통신 분리)

/* 
  requestEmailCode(email)
  목적: 이메일 주소로 인증 코드를 발송한다.

  인자:
    - email: 수신자 이메일

  반환:
    - 성공 시 resolve(void), 실패 시 throw
*/
export async function requestEmailCode(email) {
  if (!email) throw new Error("이메일을 입력하세요.");
  // TODO: await fetch( .../auth/email/code )
  return Promise.resolve();
}

/* 
  verifyEmailCode(email, code)
  목적: 사용자가 입력한 인증 코드를 검증한다.

  인자:
    - email: 인증 요청했던 이메일
    - code: 사용자 입력 인증 코드

  반환:
    - 성공 시 resolve(void), 실패 시 throw
*/
export async function verifyEmailCode(email, code) {
  if (!email || !code) throw new Error("이메일과 코드를 입력하세요.");
  // TODO: await fetch( .../auth/email/verify )
  return Promise.resolve();
}

/* 
  updateUsername(email, newUsername)
  목적: 이메일 소유자의 아이디(표시명)를 변경한다.

  인자:
    - email: 계정 이메일
    - newUsername: 새 아이디

  반환:
    - 성공 시 resolve(void), 실패 시 throw
*/
export async function updateUsername(email, newUsername) {
  if (!newUsername) throw new Error("변경할 아이디를 입력하세요.");
  // TODO: await fetch( .../auth/username, { method: 'PATCH' } )
  return Promise.resolve();
}

/* 
  updatePassword(email, newPassword)
  목적: 이메일 인증을 통과한 계정의 비밀번호를 재설정한다.

  인자:
    - email: 계정 이메일
    - newPassword: 새 비밀번호(보안 정책 충족)

  반환:
    - 성공 시 resolve(void), 실패 시 throw
*/
export async function updatePassword(email, newPassword) {
  if (!newPassword) throw new Error("변경할 비밀번호를 입력하세요.");
  // TODO: await fetch( .../auth/password, { method: 'PATCH' } )
  return Promise.resolve();
}
