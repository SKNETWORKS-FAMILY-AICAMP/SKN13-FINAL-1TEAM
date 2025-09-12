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
