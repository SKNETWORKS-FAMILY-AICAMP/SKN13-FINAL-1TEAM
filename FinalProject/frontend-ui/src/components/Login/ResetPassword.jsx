/* 
  파일: src/components/Login/ResetPassword.jsx
  역할: 이메일 인증을 통해 비밀번호를 재설정하는 화면.

  LINKS:
    - 이 파일을 사용하는 곳:
      * LoginPage.jsx에서 “비밀번호 찾기” 클릭 시 이 컴포넌트로 전환(상위 라우팅에서 처리)
    - 이 파일이 사용하는 것:
      * ../services/authApi → requestEmailCode, verifyEmailCode, updatePassword

  데이터 흐름(요약):
    1) handleSendCode: 인증 코드 발송 요청
    2) handleVerify: 코드 검증 성공 시 isVerified=true
    3) handleSubmit: 비밀번호 유효성(길이/일치) 검사 후 updatePassword → onBack()

  주의:
    - 버튼 disabled로 기본 유효성(입력 여부/코드 전송 여부/일치 여부) 방어
    - 비밀번호 보안 가이드 문구(길이/조합) 안내
*/

// ✅ src/components/Login/ResetPassword.jsx
import React, { useState } from "react";
import { requestEmailCode, verifyEmailCode, updatePassword } from "../services/authApi";

export default function ResetPassword({ onBack }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");

  const handleSendCode = async () => {
    setMsg("");
    try {
      await requestEmailCode(email);
      setIsCodeSent(true);
      setMsg("인증 코드가 전송되었습니다.");
    } catch (e) {
      setMsg(e.message || "코드 전송에 실패했습니다.");
    }
  };

  const handleVerify = async () => {
    setMsg("");
    try {
      await verifyEmailCode(email, code);
      setIsVerified(true);
      setMsg("코드가 일치합니다.");
    } catch (e) {
      setMsg(e.message || "코드가 올바르지 않습니다.");
    }
  };

  const handleSubmit = async () => {
    setMsg("");
    if (pw1.length < 8) {
      setMsg("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (pw1 !== pw2) {
      setMsg("비밀번호가 일치하지 않습니다.");
      return;
    }
    try {
      await updatePassword(email, pw1);
      setMsg("비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.");
      onBack?.();
    } catch (e) {
      setMsg(e.message || "비밀번호 변경에 실패했습니다.");
    }
  };

  const isPwMatch = pw1 && pw2 && pw1 === pw2;

  return (
    <div className="w-screen h-screen bg-gray-100 flex items-center justify-center">
      <div className="w-[380px] rounded-xl border border-gray-200 p-6 shadow-md bg-white">
        <h2 className="text-2xl font-semibold text-center mb-6">비밀번호 찾기</h2>

        <div className="space-y-4">
          {/* 이메일 입력 */}
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300"
              placeholder="이메일을 입력하세요"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition disabled:opacity-50"
              onClick={handleSendCode}
              disabled={!email}
            >
              코드 요청
            </button>
          </div>

          {/* 코드 입력 */}
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300"
              placeholder="인증 코드를 입력하세요"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!isCodeSent}
            />
            <button
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition disabled:opacity-50"
              onClick={handleVerify}
              disabled={!isCodeSent || !code}
            >
              코드 확인
            </button>
          </div>

          {/* 메시지 */}
          {msg && <p className="text-sm text-gray-600">{msg}</p>}

          {/* 새 비밀번호 입력 */}
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300"
            placeholder="새 비밀번호"
            type="password"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            disabled={!isVerified}
          />
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300"
            placeholder="새 비밀번호 확인"
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            disabled={!isVerified}
          />

          {isPwMatch && (
            <p className="text-[11px] text-green-600">
              PW가 일치합니다 (8자 이상 권장, 대소문자/숫자/특수문자 조합 권장)
            </p>
          )}

          {/* 버튼 */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition"
              onClick={onBack}
            >
              취소
            </button>
            <button
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition disabled:opacity-50"
              onClick={handleSubmit}
              disabled={!isVerified || !pw1 || !pw2}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
