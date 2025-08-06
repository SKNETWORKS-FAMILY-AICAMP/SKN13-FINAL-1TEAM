// ✅ App.jsx
import React, { useState, useEffect } from 'react';
import ChatWindow from './components/ChatWindow/ChatWindow.jsx';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import HeaderBar from './components/shared/HeaderBar.jsx';
import { getChatSessions } from './components/services/chatApi';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionList, setSessionList] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [isMaximized, setIsMaximized] = useState(false);

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

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    const checkMax = async () => {
      const isMax = await window.electron.isWindowMaximized();
      setIsMaximized(isMax);
      setSidebarOpen(isMax); // 최대화면 사이드바 항상 표시
    };

    checkMax();
    window.electron.onWindowResize(checkMax);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-white">
      <HeaderBar
        onMenuClick={() => setSidebarOpen(true)}
        showMenuButton={!isMaximized && !sidebarOpen}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* 배경 흐림 (오버레이 시) */}
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
              ${isMaximized ? 'basis-1/6 relative' : 'w-64 fixed h-full left-0 top-0'}
            `}
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

        {/* 채팅창 */}
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
