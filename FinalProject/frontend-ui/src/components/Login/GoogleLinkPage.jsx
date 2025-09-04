// ✅ components/Login/GoogleLinkPage.jsx
import React, { useEffect, useState } from "react";
import jwt_decode from "jwt-decode";
import { GOOGLE_CLIENT_ID } from "../services/env.js";

export default function GoogleLinkPage({ onGoogleLinked }) {
  const [logoError, setLogoError] = useState(false);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('currentUserId');
    if (storedUser) {
      setUserId(storedUser);
    }

    // ✅ Google 로그인 버튼 렌더링
    if (window.google) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      });

      window.google.accounts.id.renderButton(
        document.getElementById("googleSignInBtn"),
        {
          theme: "outline",
          size: "large",
          shape: "pill",
          width: "100%",
        }
      );
    }
  }, []);

  // ✅ 로그인 성공 시 콜백
  const handleCredentialResponse = (response) => {
    const decoded = jwt_decode(response.credential);
    const googleEmail = decoded.email;

    // ✅ DB 저장: 추후 Supabase 등과 연동 가능
    localStorage.setItem("googleEmail", googleEmail);
    localStorage.setItem("googleLinked", "true");

    onGoogleLinked(); // 챗봇 화면으로 이동
  };

  return (
    <div className="flex items-center justify-center h-screen bg-white">
      <div className="w-[380px] p-10 rounded-2xl shadow-sm border border-gray-200 text-center">

        {/* 로고 */}
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

        <h2 className="text-xl font-semibold mb-2">어서오세요 {userId}님!</h2>
        <p className="text-sm text-gray-500 mb-6">구글 계정을 연동하세요</p>

        {/* ✅ 구글 로그인 버튼 자리 */}
        <div id="googleSignInBtn" className="flex justify-center" />
      </div>
    </div>
  );
}
