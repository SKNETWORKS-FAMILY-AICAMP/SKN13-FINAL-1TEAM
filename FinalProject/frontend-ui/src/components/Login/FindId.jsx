/* 
  파일: src/components/Login/FindId.jsx
  역할: 이메일 인증 코드를 통해 사용자 아이디(또는 표시명)를 확인/변경하는 화면.

  LINKS:
    - 이 파일을 사용하는 곳:
      * LoginPage.jsx에서 “아이디 찾기” 클릭 시 이 컴포넌트로 전환(상위 라우팅에서 처리)
    - 이 파일이 사용하는 것:
      * ../services/authApi → requestEmailCode, verifyEmailCode, updateUsername

  데이터 흐름(요약):
    1) handleSendCode: 이메일 입력값을 사용해 인증 코드 발송 요청
    2) handleVerify: 사용자가 입력한 코드 검증 → ok면 isVerified=true
    3) handleSubmit: 새 아이디(newUsername)로 업데이트 후 상위 onBack 호출로 로그인 화면 복귀

  주의:
    - 이메일/코드/새아이디 입력 유효성은 기본 버튼 disabled로 1차 방어
    - 오류 메시지는 msg state로 사용자에게 안내
*/

// ✅ src/components/Login/FindId.jsx
import React, { useState } from "react";
import { requestEmailCode, verifyEmailCode, updateUsername } from "../services/authApi";

export default function FindId({ onBack }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [newUsername, setNewUsername] = useState("");
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
    try {
      await updateUsername(email, newUsername);
      setMsg("아이디가 변경되었습니다. 새로운 아이디로 로그인하세요.");
      onBack?.();
    } catch (e) {
      setMsg(e.message || "아이디 변경에 실패했습니다.");
    }
  };

  return (
    <div className="w-screen h-screen bg-gray-100 flex items-center justify-center">
      <div className="w-[380px] rounded-xl border border-gray-200 p-6 shadow-md bg-white">
        <h2 className="text-2xl font-semibold text-center mb-6">아이디 찾기</h2>

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

          {/* 새 아이디 입력 */}
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300"
            placeholder="바꿀 아이디를 입력하세요"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            disabled={!isVerified}
          />

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
              disabled={!isVerified || !newUsername}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
