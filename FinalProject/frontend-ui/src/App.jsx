// ✅ App.jsx — 기존 UI/흐름 유지 + 스트리밍 연동에 필요한 세션 관리 보강
import React, { useEffect, useMemo, useState } from 'react';
import ChatWindow from './components/ChatWindow/ChatWindow.jsx';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import HeaderBar from './components/shared/HeaderBar.jsx';
import { getChatSessions } from './components/services/chatApi';
import LoginPage from './components/Login/LoginPage.jsx';

const USER_KEY  = 'user';
const TOKEN_KEY = 'userToken';
// role별 저장된 ID는 유지 (삭제 금지)
const EMP_ID_KEY = 'employee_saved_id';
const ADM_ID_KEY = 'admin_saved_id';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionList, setSessionList] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [currentPage, setCurrentPage] = useState('login'); // 'login' | 'chat'

  // ─────────────────────────────────────────────
  // 세션 로드 & 선택
  const loadSessions = async () => {
    try {
      const sessions = await getChatSessions();
      setSessionList(sessions || []);
      // 로그인 직후나 새로고침 시 현재 세션 없으면 가장 최근 세션 선택
      if (!currentSession && sessions?.length) {
        setCurrentSession({ id: sessions[0].session_id || sessions[0].id });
      }
    } catch (e) {
      console.error('loadSessions error', e);
    }
  };

  // 새 채팅 → 로컬에서 새 세션 id 부여 (메시지 저장 시 서버에 실체가 생김)
  const handleNewChat = () => {
    const newId = `session-${Date.now()}`;
    setCurrentSession({ id: newId, title: '새로운 대화' });
  };

  // 사이드바에서 기존 세션 선택
  const handleSelectChat = (target) => {
    const id = typeof target === 'string' ? target : (target?.session_id || target?.id);
    if (!id) return;
    setCurrentSession({ id });
    if (!isMaximized) setSidebarOpen(false);
  };

  // ChatWindow가 세션 변경 시 완전 초기화되도록 key 사용
  const chatKey = useMemo(() => currentSession?.id || 'no-session', [currentSession?.id]);

  // ─────────────────────────────────────────────
  // 로그아웃 (저장된 로그인 ID는 유지)
  const handleLogout = () => {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setCurrentPage('login');
  };

  // 창 최대화 상태에 따라 사이드바 표시
  useEffect(() => {
    const checkMax = async () => {
      try {
        const isMax = await window.electron?.isWindowMaximized?.();
        setIsMaximized(!!isMax);
        setSidebarOpen(!!isMax);
      } catch {
        // 브라우저 모드에서도 동작하도록 무시
      }
    };
    checkMax?.();
    window.electron?.onWindowResize?.(checkMax);
    return () => window.electron?.offWindowResize?.(checkMax);
  }, []);

  // IPC 로그아웃 신호 수신 (선택)
  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    if (!ipc) return;
    const onLogout = () => handleLogout();
    ipc.on('logout', onLogout);
    return () => ipc.removeListener?.('logout', onLogout);
  }, []);

  // 앱 시작 시 로그인 상태 결정
  useEffect(() => {
    const userRaw = localStorage.getItem(USER_KEY);
    setCurrentPage(userRaw ? 'chat' : 'login');
  }, []);

  // 로그인 성공 → 채팅 페이지로 전환 + 세션 목록 로드
  const handleLoginSuccess = (userData) => {
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setCurrentPage('chat');
  };

  // 채팅 페이지로 넘어오면 세션 목록 로드
  useEffect(() => {
    if (currentPage === 'chat') loadSessions();
  }, [currentPage]);

  if (currentPage === 'login') {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      <HeaderBar
        onMenuClick={() => setSidebarOpen(true)}
        showMenuButton={!isMaximized && !sidebarOpen}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* 오버레이 (창이 최대화가 아닐 때만) */}
        {!isMaximized && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-30 z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* 사이드바 */}
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

        {/* 채팅창 */}
        <div className={`flex flex-col transition-all duration-300 ${isMaximized ? 'basis-5/6' : 'flex-1'}`}>
          <ChatWindow
            key={chatKey}                      // ✅ 세션 바뀌면 완전 초기화
            currentSession={currentSession}    // ✅ ChatWindow에서 sessionId로 저장/스트리밍
            onSessionUpdated={loadSessions}    // ✅ 새 대화/메시지 후 목록 동기화
            isMaximized={isMaximized}
          />
        </div>
      </div>
    </div>
  );
}
