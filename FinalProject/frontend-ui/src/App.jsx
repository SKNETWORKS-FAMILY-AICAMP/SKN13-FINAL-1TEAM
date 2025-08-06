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

  // 세션 로딩
  useEffect(() => {
    loadSessions();
  }, []);

  // 창 최대화 여부 확인
  useEffect(() => {
    const checkMax = async () => {
      const isMax = await window.electron.isWindowMaximized();
      setIsMaximized(isMax);
      setSidebarOpen(isMax);
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

      <div className="flex flex-1 overflow-hidden">
        {(isMaximized || sidebarOpen) && (
          <div
            className={`h-full bg-white shadow-lg z-40 relative ${
              isMaximized ? 'basis-1/6' : 'w-64'
            }`}
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

        <div
          className={`flex flex-col ${
            isMaximized ? 'basis-5/6' : 'flex-1'
          }`}
        >
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
