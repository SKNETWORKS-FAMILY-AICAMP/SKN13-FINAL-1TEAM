// ✅ components/Login/LoginPage.jsx
import React, { useState } from "react";
import HeaderBar from "../shared/HeaderBar"; 

export default function LoginPage({ onLoginSuccess }) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [logoError, setLogoError] = useState(false);

  const handleLogin = async () => {
    if (userId === "test" && password === "1234") {
      localStorage.setItem("userToken", "dummy-token");
      localStorage.setItem("currentUserId", userId);
      onLoginSuccess();
    } else {
      setError("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
  };

// ✅ Enter 키 누르면 로그인 실행
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="h-screen w-screen bg-white overflow-hidden">
      {/* ✅ 상단바 */}
      <HeaderBar showSidebarToggle={false} />

      {/* ✅ 로그인 폼 */}
      <div className="flex items-center justify-center h-[calc(100%-40px)]">
        <div className="w-[380px] p-10 ">
          {logoError ? (
            <div className="h-20 flex items-center justify-center text-xl font-bold text-gray-400 mb-6">
              로고 이미지
            </div>
          ) : (
            <img
              src="/logo.png"
              alt="앱 로고"
              className="h-20 mx-auto mb-6"
              onError={() => setLogoError(true)}
            />
          )}

          <h2 className="text-md font-semibold text-left mb-4">Sign-in</h2>

          <input
            type="text"
            placeholder="아이디를 입력하세요"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-gray-100 placeholder-gray-400 px-4 py-3 mb-3 rounded-lg focus:outline-none"
          />

          <input
            type="password"
            placeholder="비밀번호를 입력하세요"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-gray-100 placeholder-gray-400 px-4 py-3 mb-3 rounded-lg focus:outline-none"
          />

          {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}

          <button
            onClick={handleLogin}
            className="w-full bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition"
          >
            로그인
          </button>

          <div className="text-sm text-center text-gray-500 mt-4 space-x-2">
            <button className="underline">회원가입</button>
            <span>/</span>
            <button className="underline">아이디 찾기</button>
            <span>/</span>
            <button className="underline">비밀번호 찾기</button>
          </div>
        </div>
      </div>
    </div>
  );
}