/// 수정 완료한 파일 // ✅ components/Login/LoginPage.jsx
import React, { useState, useEffect } from "react";
import HeaderBar from "../shared/HeaderBar";
import { login } from "../services/authApi";
import { saveUser } from "../services/authStore";
// 로고 이미지
import logoImg from "../../assets/sample_logo.svg";
// 아이콘
import { LuEye, LuEyeClosed } from "react-icons/lu"; // 비밀번호 표시/숨김

const EMP_ID_KEY = "employee_saved_id";
const ADM_ID_KEY = "admin_saved_id";
const TOKEN_KEY = "userToken";

export default function LoginPage({ onLoginSuccess, onFindId, onFindPw }) {
    const [userId, setUserId] = useState(""); // 입력받은 아이디
    const [password, setPassword] = useState(""); // 입력받은 비밀번호
    const [errorMessage, setErrorMessage] = useState(""); // 로그인 실패 시 에러 메시지
    const [role, setRole] = useState("employee"); // 로그인 역할 (employee=사원 / admin=관리자)
    const [saveId, setSaveId] = useState(false); // 아이디 저장 여부 (체크박스 상태)
    const [showPassword, setShowPassword] = useState(false); // 비밀번호 표시 여부

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

            // ⬇️ 서버 권한과 현재 선택한 역할의 일치 여부 검증
            const serverIsManager = !!data?.user_info?.is_manager;
            const selectedIsManager = role === "admin";

            // (사원 선택)인데 관리자 계정이면 거부
            if (!selectedIsManager && serverIsManager) {
                setErrorMessage("선택한 역할(사원)과 계정 권한(관리자)이 일치하지 않습니다.");
                return;
            }
            // (관리자 선택)인데 사원 계정이면 거부
            if (selectedIsManager && !serverIsManager) {
                setErrorMessage("선택한 역할(관리자)과 계정 권한(사원)이 일치하지 않습니다.");
                return;
            }

            const userPayload = {
                ...data.user_info,
                role: serverIsManager ? "admin" : "employee",
                mustChangePassword: data.must_change_password,
            };

            console.log(data);

            // ⬇️ 검증 통과 후에만 토큰/유저 저장
            localStorage.setItem(TOKEN_KEY, data.access_token);
            saveUser(userPayload);

            // 아이디 저장 로직 (선택한 역할 기준으로 저장)
            const key = userPayload.role === "admin" ? ADM_ID_KEY : EMP_ID_KEY;
            if (saveId) {
                localStorage.setItem(key, userId);
                console.log("success: ", key);
            } else {
                localStorage.removeItem(key);
                console.log("error!!!:", key);
            }

            // App으로 로그인 성공 전달
            onLoginSuccess(userPayload);
        } catch (error) {
            console.error("로그인 실패:", error);
            setErrorMessage("아이디 또는 비밀번호가 올바르지 않습니다.");
        }
    };

    return (
        <div className="h-screen w-screen bg-white overflow-hidden">
            <HeaderBar />
            <div className="flex items-center justify-center h-[calc(100%-40px)]">
                <div className="w-[380px] p-10">
                    <div className="flex flex-row items-center justify-center">
                        <img
                            src={logoImg}
                            alt="앱 로고"
                            className="h-8 mb-6"
                            onError={() => setLogoError(true)}
                        />
                        <div className="h-20 flex items-center justify-center text-[26px] font-extrabold mb-6">
                            ClickA
                        </div>
                    </div>

                    <h2 className="text-[20px] ml-2 font-bold text-left mb-4">
                        Sign-in
                    </h2>

                    {/* 사원/관리자 선택 토글 */}
                    <div className="relative mb-4 h-12 rounded-2xl bg-gray-100 p-1 select-none">
                        {/* 트랙(패딩 안쪽 영역) */}
                        <div className="relative h-full w-full">
                            {/* 슬라이더(선택된 박스) */}
                            <span
                                className={[
                                    "absolute left-0 top-0 h-full w-1/2 bg-white rounded-xl shadow-sm",
                                    "transform-gpu transition-transform duration-300 ease-out",
                                    role === "admin" ? "translate-x-full" : "translate-x-0",
                                ].join(" ")}
                                aria-hidden="true"
                            />
                            {/* 탭 버튼 */}
                            <div className="grid grid-cols-2 h-full relative z-10">
                                <button
                                    type="button"
                                    onClick={() => setRole("employee")}
                                    role="tab"
                                    aria-selected={role === "employee"}
                                    className={[
                                        "w-full h-full text-sm font-medium",
                                        "transition-colors duration-200",
                                        role === "employee" ? "text-black font-semibold" : "text-gray-600 hover:text-gray-800",
                                    ].join(" ")}
                                >
                                    사원
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRole("admin")}
                                    role="tab"
                                    aria-selected={role === "admin"}
                                    className={[
                                        "w-full h-full text-sm font-medium",
                                        "transition-colors duration-200",
                                        role === "admin" ? "text-black font-semibold" : "text-gray-600 hover:text-gray-800",
                                    ].join(" ")}
                                >
                                    관리자
                                </button>
                            </div>
                        </div>
                    </div>

                    <input
                        type="text"
                        placeholder="아이디를 입력하세요"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full h-12 bg-gray-100 text-[14px] placeholder-gray-400 px-4 py-3 mb-3 rounded-lg focus:outline-none"
                    />
                    <div className="relative mb-2">
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="비밀번호를 입력하세요"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full h-12 bg-gray-100 text-[14px] placeholder-gray-400 px-4 py-3 rounded-lg focus:outline-none pr-10"
                        />
                        {password && 
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 mr-1 -translate-y-1/2 text-gray-500"
                            >
                                {showPassword ? <LuEye size={18} /> : <LuEyeClosed size={18} />}
                            </button>
                        }
                    </div>

                    <div className="flex mt-1 ml-2 items-center mb-3">
                        <input
                            type="checkbox"
                            id="saveId"
                            checked={saveId}
                            onChange={(e) => setSaveId(e.target.checked)}
                            className="mr-2 accent-black"
                        />
                        <label
                            htmlFor="saveId"
                            className="text-[12px] text-gray-600"
                        >
                            아이디 저장
                        </label>
                    </div>

                    {errorMessage && (
                        <p className="text-red-500 text-[12px] mb-1 text-center">
                            {errorMessage}
                        </p>
                    )}

                    <button
                        onClick={handleLogin}
                        disabled={!userId || !password}
                        className={`mt-[10px] w-full h-12 text-[14px] py-2 rounded-lg transition
                            ${!userId || !password
                                ? "bg-gray-200 cursor-not-allowed"
                                : "bg-black text-white hover:bg-gray-800"}`}
                    >
                        로그인
                    </button>
                </div>
            </div>
        </div>
    );
}