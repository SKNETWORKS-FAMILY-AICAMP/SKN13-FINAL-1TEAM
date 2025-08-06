// ✅ App.jsx
import React, { useState, useEffect } from 'react';
import ChatWindow from './components/ChatWindow/ChatWindow.jsx';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import HeaderBar from './components/shared/HeaderBar.jsx';
import { getChatSessions } from './components/services/chatApi';
import LoginPage from './components/Login/LoginPage.jsx';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionList, setSessionList] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [currentPage, setCurrentPage] = useState('login'); // 'login' 또는 'chat'

  const loadSessions = async () => {
    const sessions = await getChatSessions();
    setSessionList(sessions);
  };

  const handleNewChat = () => {
    const newSession = {
      id: `session-${Date.now()}`,
      title: '새로운 대화',
    };
    setCurrentSession(newSession);
  };

  const handleSelectChat = (sessionId) => {
    setCurrentSession({ id: sessionId });
    if (!isMaximized) setSidebarOpen(false);
  };

  // 최대화 여부 감지
  useEffect(() => {
    const checkMax = async () => {
      const isMax = await window.electron.isWindowMaximized();
      setIsMaximized(isMax);
      setSidebarOpen(isMax);
    };

    checkMax();
    window.electron.onWindowResize(checkMax);
  }, []);

  // ✅ Electron에서 logout 신호 수신 시 localStorage 초기화
  useEffect(() => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on('logout', () => {
        localStorage.removeItem('user');
      });
    }
  }, []);

  // 로그인 여부 감지
  useEffect(() => {
    const userRaw = localStorage.getItem('user');
    if (userRaw) {
      setCurrentPage('chat');
    } else {
      setCurrentPage('login');
    }
  }, []);

  // 로그인 성공 처리
  const handleLoginSuccess = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setCurrentPage('chat');
  };

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
            />
          </div>
        )}

        <div className={`flex flex-col transition-all duration-300 ${isMaximized ? 'basis-5/6' : 'flex-1'}`}>
          <ChatWindow
            currentSession={currentSession}
            onSessionUpdated={loadSessions}
            isMaximized={isMaximized}
          />
        </div>
      </div>
    </div>
  );
}