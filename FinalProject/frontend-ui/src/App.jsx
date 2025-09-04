// ✅ 파일: src/App.jsx
/* 
  목적(Purpose)
  - 데스크톱(전자정부/Electron) 앱의 React 루트 컴포넌트.
  - 로그인/아이디찾기/비밀번호찾기 → 채팅 화면 전환을 관리한다.
  - 좌측 사이드바(세션 목록/새 대화/로그아웃)와 우측 ChatWindow를 배치한다.
  - '기능부 전용 창(FeatureShell)' 진입 시 URL ?feature=1 파라미터를 해석해 별도 셸을 띄운다.
  - 전역 로그아웃 브로드캐스트(window.auth.onLogout)를 수신해 로컬 세션을 정리하고 로그인 화면으로 복귀한다.

  사용처(Where Used)
  - 렌더러 프로세스의 엔트리 컴포넌트로, 메인/기능부/관리자 창에서 공통으로 사용된다.
  - Sidebar/ChatWindow/HeaderBar 등 UI 컴포넌트를 포함한다.

  외부 연동(Bridges & APIs)
  - window.electron: 창 상태(최대화/리사이즈) 질의 및 이벤트(onWindowResize 등)
  - window.auth: 전역 로그아웃 요청(requestLogout) 및 로그아웃 이벤트(onLogout)
  - chatApi.getChatSessions(): 저장된 채팅 세션 목록 로드
  - localStorage: USER_KEY/TOKEN_KEY 저장 및 자동 로그인 판단

  주요 상태(State)
  - sidebarOpen: 사이드바 오버레이 열림/닫힘
  - sessionList: 세션 목록
  - currentSession: 현재 선택된 세션
  - isMaximized: 메인 창 최대화 여부
  - currentPage: 'login' | 'find-id' | 'find-pw' | 'chat' (화면 분기)
  - isFeatureWindow: ?feature=1 여부로 기능부 셸인지 판단

  설계 포인트(Notes)
  - 전역 로그아웃: Sidebar에서 onLogout → window.auth.requestLogout('all')
  - 수신 측(App): window.auth.onLogout(...)에서 USER_KEY/TOKEN_KEY 제거 후 로그인 화면으로 전환
  - 최대화/리사이즈: 창 상태 변화 시 사이드바 표시 전략 변경(고정 vs 오버레이)
*/

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
  // 사이드바 오픈 상태
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 세션 목록
  const [sessionList, setSessionList] = useState([]);
  // 현재 세션
  const [currentSession, setCurrentSession] = useState(null);
  // 창 최대화 여부
  const [isMaximized, setIsMaximized] = useState(false);
  // 현재 페이지 분기
  const [currentPage, setCurrentPage] = useState('login');

  const initedRef = useRef(false);
  const mountIdRef = useRef(Math.random().toString(36).slice(2));

  // 기능부 전용 셸 여부 계산
  const isFeatureWindow = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('feature') === '1';
    } catch {
      return false;
    }
  }, []);

  // 부팅 로깅
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    console.groupCollapsed(`[App boot ${mountIdRef.current}]`);
    console.log("href:", window.location.href);
    console.log("query:", Object.fromEntries(q.entries()));
    console.log("versions:", (window?.process?.versions) || "(browser)");
    console.groupEnd();
  }, []);

  // 기능부 전용 셸 분기 즉시 반환
  if (isFeatureWindow) {
    // 기능부 셸 사용자 역할 추출
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

  // 세션 목록 로드
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

  // 새 대화 시작
  const handleNewChat = () => {
    const newId = `session-${Date.now()}`;
    console.log("[App] new chat ->", newId);
    setCurrentSession({ id: newId, title: '새로운 대화' });
  };


  // 세션 선택
  const handleSelectChat = (target) => {
    const id = typeof target === 'string' ? target : (target?.session_id || target?.id);
    console.log("[App] select chat ->", id);
    if (!id) return;
    setCurrentSession({ id });
    if (!isMaximized) setSidebarOpen(false);
  };

  // ChatWindow key (세션 전환 시 리렌더 키)
  const chatKey = useMemo(() => currentSession?.id || 'no-session', [currentSession?.id]);

  // 로그아웃 핸들러(전역 브로드캐스트)
  const handleLogout = () => {
    window.auth?.requestLogout?.('all'); // ← 브로드캐스트
  };

  // 창 최대화 여부/리사이즈 훅
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

  // 자동 로그인 판단
  useEffect(() => {
    const userRaw = localStorage.getItem(USER_KEY);
    console.log("[App] auto-login check ->", !!userRaw);
    setCurrentPage(userRaw ? 'chat' : 'login');
  }, []);

  // 로그인 성공 처리
  const handleLoginSuccess = (userData) => {
    console.log("[App] login success", userData);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setSidebarOpen(false);
    setCurrentPage('chat');
  };

  // 채팅 페이지 진입 시 세션 로드
  useEffect(() => {
    console.log("[App] currentPage =", currentPage);
    if (currentPage === 'chat') loadSessions();
  }, [currentPage]);

  // 프레임리스 모서리 플리커 방지 (컴포지팅 킥)
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

  // 전역 로그아웃 수신(브로드캐스트) → 로컬 정리 + 로그인 화면
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

  // 페이지 분기: 로그인
  if (currentPage === 'login') {
    return (
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
        onFindId={() => setCurrentPage('find-id')}
        onFindPw={() => setCurrentPage('find-pw')}
      />
    );
  }
  // 페이지 분기: 아이디 찾기
  if (currentPage === 'find-id') {
    return <FindId onBack={() => setCurrentPage('login')} />;
  }
  // 페이지 분기: 비밀번호 찾기
  if (currentPage === 'find-pw') {
    return <ResetPassword onBack={() => setCurrentPage('login')} />;
  }

  // 채팅 레이아웃
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
              ${isMaximized ? 'relative shrink-0 grow-0 w-[clamp(16rem,13vw,21rem)] min-w-[16rem] max-w-[21rem]' : 'w-64 fixed h-full left-0 top-0'}`}
          >
            <Sidebar
              onClose={() => setSidebarOpen(false)}
              sessions={sessionList}
              onNewChat={handleNewChat}
              onSelectChat={handleSelectChat}
              isMaximized={isMaximized}
              onLogout={handleLogout}   // 전역 로그아웃 
              // ★ 변경: 세션 삭제 성공 시 부모(App)에 알림 → 현재 보고 있던 세션이면 즉시 새 채팅 화면으로 전환
              onRemoveChat={(removedId) => {
                // 목록에서 제거
                setSessionList((prev) =>
                  prev.filter((x) => (x.session_id || x.id) !== removedId)
                );
                // 현재 보고 있던 세션을 지운 경우 → 새 채팅 화면(UI만 리셋)
                if (currentSession?.id === removedId) {
                  console.log("[App] removed active session -> UI-only reset");
                  setCurrentSession(null);
                }
              }}
            />
          </div>
        )}

        <div className={`flex flex-col flex-1 min-w-0 transition-all duration-300`}>
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
