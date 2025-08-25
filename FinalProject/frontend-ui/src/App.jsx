import React, { useEffect, useMemo, useState, useLayoutEffect, useRef } from 'react';

import ChatWindow from './components/ChatWindow/ChatWindow.jsx';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import HeaderBar from './components/shared/HeaderBar.jsx';
import { getChatSessions } from './components/services/chatApi';

import LoginPage from './components/Login/LoginPage.jsx';
import FindId from './components/Login/FindId.jsx';
import ResetPassword from './components/Login/ResetPassword.jsx';

/** 기능부 전용 창에서만 사용하는 하이브리드 셸 */
import FeatureShell from './components/FeatureWindow/FeatureShell.jsx';

const USER_KEY  = 'user';
const TOKEN_KEY = 'userToken';

export default function App() {
  // ----- 기존 상태/로직 유지 -----
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionList, setSessionList] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [currentPage, setCurrentPage] = useState('login');

  const initedRef = useRef(false);
  const mountIdRef = useRef(Math.random().toString(36).slice(2));

  const isFeatureWindow = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('feature') === '1';
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    console.groupCollapsed(`[App boot ${mountIdRef.current}]`);
    console.log("href:", window.location.href);
    console.log("query:", Object.fromEntries(q.entries()));
    console.log("versions:", (window?.process?.versions) || "(browser)");
    console.groupEnd();
  }, []);

  if (isFeatureWindow) {
    let role = 'user';
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) {
        const user = JSON.parse(raw);
        console.log("[App] feature-window detected. localStorage.user =", user);
        role = user?.role || role; // 'admin' | 'user'
      }
    } catch (e) {
      console.warn("[App] failed to parse localStorage user:", e);
    }
    return <FeatureShell userType={role} />;
  }

  const loadSessions = async () => {
    const t0 = performance.now();
    console.group(`[App ${mountIdRef.current}] loadSessions start`);
    try {
      const sessions = await getChatSessions();
      console.log("getChatSessions ->", Array.isArray(sessions) ? `length=${sessions.length}` : sessions);
      setSessionList(sessions || []);
      if (!currentSession && sessions?.length) {
        setCurrentSession({ id: sessions[0].session_id || sessions[0].id });
      }
    } catch (e) {
      console.error('loadSessions error', e?.name, e?.message, e);
    } finally {
      const dt = (performance.now() - t0).toFixed(1);
      console.groupEnd();
      console.log(`[App ${mountIdRef.current}] loadSessions finished in ${dt}ms`);
    }
  };

  const handleNewChat = () => {
    const newId = `session-${Date.now()}`;
    console.log("[App] new chat ->", newId);
    setCurrentSession({ id: newId, title: '새로운 대화' });
  };

  const handleSelectChat = (target) => {
    const id = typeof target === 'string' ? target : (target?.session_id || target?.id);
    console.log("[App] select chat ->", id);
    if (!id) return;
    setCurrentSession({ id });
    if (!isMaximized) setSidebarOpen(false);
  };

  const chatKey = useMemo(() => currentSession?.id || 'no-session', [currentSession?.id]);

  /** ✅ 변경: 사이드바에서 눌러도 "전역" 로그아웃을 트리거 */
  const handleLogout = () => {
    window.auth?.requestLogout?.('all'); // ← 브로드캐스트
  };

  useEffect(() => {
    const checkMax = async () => {
      try {
        const isMax = await window.electron?.isWindowMaximized?.();
        console.log("[App] check-maximized ->", isMax);
        setIsMaximized(!!isMax);
        setSidebarOpen(!!isMax);
      } catch (e) {
        console.warn("[App] check-maximized error", e);
      }
    };
    checkMax?.();
    window.electron?.onWindowResize?.(checkMax);
    return () => window.electron?.offWindowResize?.(checkMax);
  }, []);

  useEffect(() => {
    const userRaw = localStorage.getItem(USER_KEY);
    console.log("[App] auto-login check ->", !!userRaw);
    setCurrentPage(userRaw ? 'chat' : 'login');
  }, []);

  const handleLoginSuccess = (userData) => {
    console.log("[App] login success", userData);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setSidebarOpen(false);
    setCurrentPage('chat');
  };

  useEffect(() => {
    console.log("[App] currentPage =", currentPage);
    if (currentPage === 'chat') loadSessions();
  }, [currentPage]);

  useLayoutEffect(() => {
    const kickComposite = () => {
      document.body.classList.add('no-corner-flicker');
      requestAnimationFrame(() => {
        document.body.classList.remove('no-corner-flicker');
      });
    };
    window.addEventListener('resize', kickComposite);
    window.electron?.onWindowState?.(kickComposite);
    return () => {
      window.removeEventListener('resize', kickComposite);
      window.electron?.offWindowState?.(kickComposite);
    };
  }, []);

  /** ✅ 추가: 전역 logout 브로드캐스트 "수신" → 토큰 정리 + 로그인 화면 */
  useEffect(() => {
    const off = window.auth?.onLogout?.(() => {
      try {
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(TOKEN_KEY);
      } catch {}
      setCurrentPage('login');
    });
    return () => off?.();
  }, []);

  if (currentPage === 'login') {
    return (
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
        onFindId={() => setCurrentPage('find-id')}
        onFindPw={() => setCurrentPage('find-pw')}
      />
    );
  }
  if (currentPage === 'find-id') {
    return <FindId onBack={() => setCurrentPage('login')} />;
  }
  if (currentPage === 'find-pw') {
    return <ResetPassword onBack={() => setCurrentPage('login')} />;
  }

  return (
    <div className="app-shell h-screen flex flex-col bg-white">
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
              onLogout={handleLogout}   // 전역 로그아웃 
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
