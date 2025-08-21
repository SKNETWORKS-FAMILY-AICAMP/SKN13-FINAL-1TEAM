import React, { useEffect, useMemo, useState, useLayoutEffect } from 'react';

import ChatWindow from './components/ChatWindow/ChatWindow.jsx';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import HeaderBar from './components/shared/HeaderBar.jsx';
import { getChatSessions } from './components/services/chatApi';

import LoginPage from './components/Login/LoginPage.jsx';
import FindId from './components/Login/FindId.jsx';
import ResetPassword from './components/Login/ResetPassword.jsx';

/** 기능부 전용 창에서만 사용하는 하이브리드 셸
 *  - 좌: MainSidebar(역할별 섹션 주입)
 *  - 우: RoleRouter(역할+메뉴키 → 실제 화면)
 */
import FeatureShell from './components/FeatureWindow/FeatureShell.jsx';

const USER_KEY  = 'user';
const TOKEN_KEY = 'userToken';

export default function App() {
  /** 기존 상태 (원본 보존) */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionList, setSessionList] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [currentPage, setCurrentPage] = useState('login'); // 'login' | 'chat' | 'find-id' | 'find-pw'

  /** 기능부 전용 창 모드 여부 (?feature=1) */
  const isFeatureWindow = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('feature') === '1';
    } catch {
      return false;
    }
  }, []);

  /** 기능부 전용 창: 하이브리드 Shell 렌더
   *  - role은 로그인 정보에서 가져오고, 없으면 'user'를 기본값으로 사용.
   */
  if (isFeatureWindow) {
    let role = 'user';
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) {
        const user = JSON.parse(raw);
        console.log("user값: ", user)
        role = user?.role || role; // ex) 'admin' | 'user'
      }
    } catch {}
    return <FeatureShell userType={role} />;
  }

  /** 이하: 기존 "챗봇 메인 창" 흐름 완전 보존 */

  /** 채팅 세션 목록 불러오기 */
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

  /** 새 채팅 생성 */
  const handleNewChat = () => {
    const newId = `session-${Date.now()}`;
    setCurrentSession({ id: newId, title: '새로운 대화' });
  };

  /** 채팅 선택 */
  const handleSelectChat = (target) => {
    const id = typeof target === 'string' ? target : (target?.session_id || target?.id);
    if (!id) return;
    setCurrentSession({ id });
    if (!isMaximized) setSidebarOpen(false);
  };

  /** ChatWindow key (세션 체인지 시 리렌더 보장) */
  const chatKey = useMemo(() => currentSession?.id || 'no-session', [currentSession?.id]);

  /** 로그아웃 */
  const handleLogout = () => {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setCurrentPage('login');
  };

  /** 창 최대화 여부에 따른 사이드바 오토 토글 (원본 유지) */
  useEffect(() => {
    const checkMax = async () => {
      try {
        const isMax = await window.electron?.isWindowMaximized?.();
        setIsMaximized(!!isMax);
        setSidebarOpen(!!isMax); // 전체화면이면 사이드바 고정
      } catch {}
    };
    checkMax?.();
    window.electron?.onWindowResize?.(checkMax);
    return () => window.electron?.offWindowResize?.(checkMax);
  }, []);

  /** 자동 로그인 여부 → 현재 페이지 결정 (원본 유지) */
  useEffect(() => {
    const userRaw = localStorage.getItem(USER_KEY);
    setCurrentPage(userRaw ? 'chat' : 'login');
  }, []);

  /** 로그인 성공 처리 (원본 유지) */
  const handleLoginSuccess = (userData) => {
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    // [유지] 로그인 직후 사이드바 오토오픈 방지
    setSidebarOpen(false);
    setCurrentPage('chat');
  };

  /** 채팅 화면 진입 시 세션 로드 (원본 유지) */
  useEffect(() => {
    if (currentPage === 'chat') loadSessions();
  }, [currentPage]);

  // ---------------------------------------------------------------------
  // [추가] 모서리 깜박임 방지 (최대화/복원/리사이즈 시 1프레임 합성 유도)
  //  - useLayoutEffect로 등록하여 페인트 타이밍에 가깝게 처리
  //  - preload에서 window.electron?.onWindowState?(handler) 같은 포워딩이 있으면 자동 연동
  //  - 없더라도 resize 이벤트만으로도 대부분의 케이스에서 깜박임 완화
  // ---------------------------------------------------------------------
  useLayoutEffect(() => {
    const kickComposite = () => {
      // body에 임시 클래스 부착 → 하위 노드 합성층 생성 → 1프레임 후 제거
      document.body.classList.add('no-corner-flicker');
      requestAnimationFrame(() => {
        document.body.classList.remove('no-corner-flicker');
      });
    };

    // 일반 리사이즈(윈도우 드래그, 최대화/복원 포함) 대응
    window.addEventListener('resize', kickComposite);
    // Electron 쪽에서 최대화/복원 이벤트를 포워딩하고 있다면 연결 (옵셔널)
    window.electron?.onWindowState?.(kickComposite);

    return () => {
      window.removeEventListener('resize', kickComposite);
      window.electron?.offWindowState?.(kickComposite);
    };
  }, []);
  // ---------------------------------------------------------------------

  /** 로그인/찾기 화면 (원형 유지) */
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

  /** 채팅 메인 화면 (기존 UI 100% 유지) */
  return (
    // [추가] app-shell 클래스: 라운딩/마스킹(overflow hidden) 적용 컨테이너
    <div className="app-shell h-screen flex flex-col bg-white">
      <HeaderBar
        onMenuClick={() => setSidebarOpen(true)}
        showMenuButton={!isMaximized && !sidebarOpen}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* 모바일/창축소 시 사이드바 오버레이 */}
        {!isMaximized && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-30 z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* 좌측: 챗봇 사이드바 */}
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

        {/* 우측: 대화 영역 */}
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
