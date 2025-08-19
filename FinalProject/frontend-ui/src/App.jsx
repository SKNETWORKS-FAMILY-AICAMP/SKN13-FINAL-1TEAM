// ✅ src/App.jsx
import React, { useEffect, useMemo, useState } from 'react';
import ChatWindow from './components/ChatWindow/ChatWindow.jsx';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import HeaderBar from './components/shared/HeaderBar.jsx';
import { getChatSessions } from './components/services/chatApi';
import LoginPage from './pages/LoginPage.jsx';
import FindId from './components/Login/FindId.jsx';
import ResetPassword from './components/Login/ResetPassword.jsx';
import FeatureMain from './components/FeatureWindow/FeatureApp.jsx';
import AdminPage from './pages/AdminPage.jsx';

const USER_KEY  = 'user';
const TOKEN_KEY = 'userToken';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionList, setSessionList] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [currentPage, setCurrentPage] = useState('login'); // 'login' | 'chat' | 'find-id' | 'find-pw'

  // ✅ 기능부 전용 창 여부 (Electron이 ?feature=1로 띄움)
  const isFeatureWindow = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('feature') === '1';
    } catch {
      return false;
    }
  }, []);

  // ✅ 관리자 전용 창 여부
  const isAdminWindow = useMemo(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get('admin') === '1' || window.location.hash.startsWith('#/admin');
    } catch { return false; }
  }, []);

  // 🔀 기능부 전용 창이면, 로그인/챗봇 분기 없이 기능부 UI만 렌더
  if (isFeatureWindow) {
    return <FeatureMain />;
  }

  // 🔀 관리자 전용 창이면, 바로 관리자 UI만 렌더 (채팅/로그인 로직 실행 안 함)
  if (isAdminWindow) {
    return <AdminPage />;
  }

  // ─────────── 세션 로드 & 선택 ───────────
  const loadSessions = async () => {
    try {
      const sessions = await getChatSessions();
      setSessionList(sessions || []);
      if (!currentSession && sessions?.length) {
        setCurrentSession({ id: sessions[0].session_id || sessions[0].id });
      }
    } catch (e) {
      console.error('loadSessions error', e);
    }
  };

  const handleNewChat = () => {
    const newId = `session-${Date.now()}`;
    setCurrentSession({ id: newId, title: '새로운 대화' });
  };

  const handleSelectChat = (target) => {
    const id = typeof target === 'string' ? target : (target?.session_id || target?.id);
    if (!id) return;
    setCurrentSession({ id });
    if (!isMaximized) setSidebarOpen(false);
  };

  const chatKey = useMemo(() => currentSession?.id || 'no-session', [currentSession?.id]);

  // ─────────── 로그아웃 ───────────
  const handleLogout = () => {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setCurrentPage('login');
  };

  // 창 최대화 여부에 따라 사이드바 동작
  useEffect(() => {
    const checkMax = async () => {
      try {
        const isMax = await window.electron?.isWindowMaximized?.();
        setIsMaximized(!!isMax);
        setSidebarOpen(!!isMax);
      } catch {}
    };
    checkMax?.();
    window.electron?.onWindowResize?.(checkMax);
    return () => window.electron?.offWindowResize?.(checkMax);
  }, []);

  // 시작 시 로그인 상태 결정
  useEffect(() => {
    const userRaw = localStorage.getItem(USER_KEY);
    setCurrentPage(userRaw ? 'chat' : 'login');
  }, []);

  // 로그인 성공
  const handleLoginSuccess = (userData) => {
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    console.log(JSON.stringify(userData));
    console.log("관리자 여부", userData['is_superuser']);
    setSidebarOpen(false);
    if (userData?.is_superuser == true) {
      setCurrentPage('admin');
    } else {
      setCurrentPage('chat');
    }
  };

  // 채팅 페이지로 넘어오면 세션 목록 로드
  useEffect(() => {
    if (currentPage === 'chat') loadSessions();
  }, [currentPage]);

  // ─────────── 라우팅 ───────────
  if (currentPage === 'login') {
    return (
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
        onFindId={() => setCurrentPage('find-id')}
        onFindPw={() => setCurrentPage('find-pw')}
        // onAdminPage=
      />
    );
  }
  if (currentPage === 'find-id') {
    return <FindId onBack={() => setCurrentPage('login')} />;
  }
  if (currentPage === 'find-pw') {
    return <ResetPassword onBack={() => setCurrentPage('login')} />;
  }
  if (currentPage === 'admin') {
    return <AdminPage />
  }

  // ─────────── 채팅 화면 ───────────
  return (
    <div className="h-screen flex flex-col bg-white">
      <HeaderBar
        onMenuClick={() => setSidebarOpen(true)}
        showMenuButton={!isMaximized && !sidebarOpen}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {!isMaximized && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-30 z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {(isMaximized || sidebarOpen) && (
          <div
            className={`bg-white shadow-lg z-40 transition-all duration-300
              ${isMaximized ? 'basis-1/6 relative' : 'w-64 fixed h-full left-0 top-0'}`}
          >
            <Sidebar
              onClose={() => setSidebarOpen(false)}
              sessions={sessionList}
              onNewChat={handleNewChat}
              onSelectChat={handleSelectChat}
              isMaximized={isMaximized}
              onLogout={handleLogout}
            />
          </div>
        )}

        <div className={`flex flex-col transition-all duration-300 ${isMaximized ? 'basis-5/6' : 'flex-1'}`}>
          <ChatWindow
            key={chatKey}
            currentSession={currentSession}
            onSessionUpdated={loadSessions}
            isMaximized={isMaximized}
          />
        </div>
      </div>
    </div>
  );
}
