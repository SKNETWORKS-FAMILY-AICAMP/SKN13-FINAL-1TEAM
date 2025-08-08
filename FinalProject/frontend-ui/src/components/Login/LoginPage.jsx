// ✅ src/components/Login/LoginPage.jsx
// 기존 기능 유지 + '아이디 찾기/비밀번호 찾기' 네비게이션 props만 추가
import React, { useState, useEffect } from "react";
import HeaderBar from "../shared/HeaderBar";

const EMP_ID_KEY = "employee_saved_id";
const ADM_ID_KEY = "admin_saved_id";

export default function LoginPage({ onLoginSuccess, onFindId, onFindPw }) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [role, setRole] = useState("employee"); // 기본값: 사원
  const [saveId, setSaveId] = useState(false);  // ✅ 아이디 저장 체크박스
  const [logoError, setLogoError] = useState(false);

  // ✅ 역할 변경 시 저장된 ID 불러오기 (있으면 체크 on)
  useEffect(() => {
    const key = role === "employee" ? EMP_ID_KEY : ADM_ID_KEY;
    const saved = localStorage.getItem(key);
    if (saved) {
      setUserId(saved);
      setSaveId(true);
    } else {
      setUserId("");
      setSaveId(false);
    }
  }, [role]);

  // ✅ 로그인 처리 (기존 데모 인증 로직 그대로)
  const handleLogin = async () => {
    const isEmployee = role === "employee";

    if (
      (isEmployee && userId === "test" && password === "1234") ||
      (!isEmployee && userId === "admin" && password === "admin123")
    ) {
      // ✅ 아이디 저장/삭제
      const key = isEmployee ? EMP_ID_KEY : ADM_ID_KEY;
      if (saveId) {
        localStorage.setItem(key, userId);
      } else {
        localStorage.removeItem(key);
      }

      // ✅ 로그인 정보 저장 및 이동(기존 그대로)
      localStorage.setItem("userToken", isEmployee ? "employee-token" : "admin-token");
      localStorage.setItem("currentUserId", userId);
      onLoginSuccess({
        id: userId,
        is_superuser: !isEmployee,
      });
    } else {
      setError("아이디, 비밀번호 또는 역할이 올바르지 않습니다.");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="h-screen w-screen bg-white overflow-hidden">
      <HeaderBar showSidebarToggle={false} />
      <div className="flex items-center justify-center h-[calc(100%-40px)]">
        <div className="w-[380px] p-10">
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

          {/* 사원/관리자 선택 탭 (그대로) */}
          <div className="flex mb-4 rounded-full overflow-hidden border border-gray-200">
            <button
              onClick={() => setRole("employee")}
              className={`w-1/2 py-2 ${role === "employee" ? "bg-black text-white font-bold" : "bg-gray-100 text-gray-600"}`}
            >
              사원
            </button>
            <button
              onClick={() => setRole("admin")}
              className={`w-1/2 py-2 ${role === "admin" ? "bg-black text-white font-bold" : "bg-gray-100 text-gray-600"}`}
            >
              관리자
            </button>
          </div>

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
            className="w-full bg-gray-100 placeholder-gray-400 px-4 py-3 mb-2 rounded-lg focus:outline-none"
          />

          {/* 아이디 저장 체크박스 (그대로) */}
          <div className="flex items-center mb-3">
            <input
              type="checkbox"
              id="saveId"
              checked={saveId}
              onChange={(e) => setSaveId(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="saveId" className="text-sm text-gray-600">
              아이디 저장
            </label>
          </div>

          {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}

          <button
            onClick={handleLogin}
            className="w-full bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition"
          >
            로그인
          </button>

          <div className="text-sm text-center text-gray-500 mt-4 space-x-2">
            <button className="underline" onClick={onFindId}>아이디 찾기</button>
            <span>/</span>
            <button className="underline" onClick={onFindPw}>비밀번호 찾기</button>
          </div>
        </div>
      </div>
    </div>
  );
}
