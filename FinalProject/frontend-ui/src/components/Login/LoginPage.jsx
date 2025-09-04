// ✅ components/Login/LoginPage.jsx
import React, { useState, useEffect } from "react";
import HeaderBar from "../shared/HeaderBar";
import { login } from "../services/authApi";
import { saveUser } from "../services/authStore";

const EMP_ID_KEY = "employee_saved_id";
const ADM_ID_KEY = "admin_saved_id";
const TOKEN_KEY = "userToken";

export default function LoginPage({ onLoginSuccess, onFindId, onFindPw }) {
    const [userId, setUserId] = useState(""); // 입력받은 아이디
    const [password, setPassword] = useState(""); // 입력받은 비밀번호
    const [errorMessage, setErrorMessage] = useState(""); // 로그인 실패 시 에러 메시지
    const [role, setRole] = useState("employee"); // 로그인 역할 (employee=사원 / admin=관리자)
    const [saveId, setSaveId] = useState(false); // 아이디 저장 여부 (체크박스 상태)
    const [logoError, setLogoError] = useState(false); // 로고 이미지 불러오기 실패 시 true

    // localStorage에 저장된 ID 불러오기(role 상태 변화 시)
    useEffect(() => {
        const key = role === "employee" ? EMP_ID_KEY : ADM_ID_KEY;
        const saved = localStorage.getItem(key);
        if (saved) {
            // 저장된 아이디 있는 경우
            setUserId(saved); // 아이디 textfield에 저장된 아이디
            setSaveId(true); // 아이디 저장 체크
        } else {
            setUserId("");
            setSaveId(false);
        }
    }, [role]);

    // 키보드 엔터 감지 및 login 실행
    const handleKeyDown = (e) => {
        if (e.key === "Enter") handleLogin();
    };

    const handleLogin = async () => {
        setErrorMessage("");

        try {
            const data = await login(userId, password);
            console.log("로그인 성공:", data);

            const userPayload = {
                ...data.user_info,
                role: data.user_info.is_manager ? "admin" : "employee",
                mustChangePassword: data.must_change_password,
            };

            // 토큰과 사용자 정보 저장
            localStorage.setItem(TOKEN_KEY, data.access_token);
            saveUser(userPayload);

            // 아이디 저장 로직
            const key = userPayload.role === "admin" ? ADM_ID_KEY : EMP_ID_KEY;
            if (saveId) {
                localStorage.setItem(key, userId);
            } else {
                localStorage.removeItem(key);
            }

            // App으로 로그인 성공 전달
            onLoginSuccess(userPayload);
        } catch (error) {
            console.error("로그인 실패:", error);
            setErrorMessage(
                // error.response?.data?.detail ||
                "아이디 또는 비밀번호가 올바르지 않습니다."
            );
        }
    };

    return (
        <div className="h-screen w-screen bg-white overflow-hidden">
            <HeaderBar />
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

                    <h2 className="text-md font-semibold text-left mb-4">
                        Sign-in
                    </h2>

                    {/* 사원/관리자 선택 */}
                    <div className="flex mb-4 rounded-full overflow-hidden border border-gray-200">
                        <button
                            onClick={() => setRole("employee")}
                            className={`w-1/2 py-2 ${
                                role === "employee"
                                    ? "bg-black text-white font-bold"
                                    : "bg-gray-100 text-gray-600"
                            }`}
                        >
                            사원
                        </button>
                        <button
                            onClick={() => setRole("admin")}
                            className={`w-1/2 py-2 ${
                                role === "admin"
                                    ? "bg-black text-white font-bold"
                                    : "bg-gray-100 text-gray-600"
                            }`}
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

                    <div className="flex items-center mb-3">
                        <input
                            type="checkbox"
                            id="saveId"
                            checked={saveId}
                            onChange={(e) => setSaveId(e.target.checked)}
                            className="mr-2"
                        />
                        <label
                            htmlFor="saveId"
                            className="text-sm text-gray-600"
                        >
                            아이디 저장
                        </label>
                    </div>

                    {errorMessage && (
                        <p className="text-red-500 text-sm mb-3 text-center">
                            {errorMessage}
                        </p>
                    )}

                    <button
                        onClick={handleLogin}
                        className="w-full bg-black text-white py-2 rounded-lg hover:bg-gray-800 transition"
                    >
                        로그인
                    </button>

                    {/* <div className="text-sm text-center text-gray-500 mt-4 space-x-2">
                        <button className="underline" onClick={onFindId}>
                            아이디 찾기
                        </button>
                        <span>/</span>
                        <button className="underline" onClick={onFindPw}>
                            비밀번호 찾기
                        </button>
                    </div> */}
                </div>
            </div>
        </div>
    );
}
