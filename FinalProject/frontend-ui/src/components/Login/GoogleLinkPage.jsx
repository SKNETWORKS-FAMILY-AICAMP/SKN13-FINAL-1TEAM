/* 
  파일: src/components/Login/GoogleLinkPage.jsx
  역할: Google 계정 연동 화면. GSI(Identity Services) 버튼을 렌더하고, 성공 시 토큰을 디코드하여
       이메일을 localStorage에 저장한 뒤 onGoogleLinked 콜백으로 다음 화면(챗봇 등)으로 전환.

  LINKS:
    - 이 파일을 사용하는 곳:
      * 로그인 성공 후, DB에 Google 계정 미연동이면 이 화면으로 진입(App.jsx 또는 상위 라우팅)
    - 이 파일이 사용하는 것:
      * jwt-decode → 구글 응답 크레덴셜(JWT) 파싱
      * GOOGLE_CLIENT_ID (env.js에서 export) → GSI 초기화에 사용
      * window.google.accounts.id → 구글 버튼 렌더/콜백 연결

  데이터 흐름(요약):
    1) useEffect:
       - currentUserId(localStorage)로 환영 문구 표시
       - window.google.accounts.id.initialize({ client_id, callback }) 호출
       - renderButton(...)으로 #googleSignInBtn 위치에 버튼 삽입
    2) handleCredentialResponse:
       - credential JWT 디코드 → email 추출 → localStorage 저장
       - onGoogleLinked() 호출로 다음 화면으로 이동

  주의:
    - GSI 스크립트가 index.html에 로드되어 window.google이 존재해야 동작
    - GOOGLE_CLIENT_ID는 민감정보이므로 빌드 시 안전하게 주입(env/백엔드 경유)
*/

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
