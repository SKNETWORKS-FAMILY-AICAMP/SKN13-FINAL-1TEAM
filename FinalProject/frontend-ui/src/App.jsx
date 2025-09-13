import React, {
    useEffect,
    useMemo,
    useState,
    useLayoutEffect,
    useRef,
} from "react";

import ToastProvider from "./components/shared/toast/ToastProvider.jsx";

import ChatWindow from "./components/ChatWindow/ChatWindow.jsx";
import Sidebar from "./components/Sidebar/Sidebar.jsx";
import HeaderBar from "./components/shared/HeaderBar.jsx";
import { getChatSessions } from "./components/services/chatApi";

import LoginPage from "./components/Login/LoginPage.jsx";
import FindId from "./components/Login/FindId.jsx";
import ResetPassword from "./components/Login/ResetPassword.jsx";
import ChangePasswordView from "./components/ChangePassword/ChangePasswordView.jsx";

/** 기능부 전용 창에서만 사용하는 하이브리드 셸 */
import FeatureShell from "./components/FeatureWindow/FeatureShell.jsx";
import NotifyWindowRoot from "./components/Modal/NotifyWindowRoot.jsx";
import { startUpcomingWatcher } from "./components/services/upcomingWatcher.js";
import calendarApi from "./components/services/calendarApi.js";  // ← 오늘 일정 1회 알림용

const USER_KEY = "user";
const TOKEN_KEY = "userToken";

const TODAY_SHOWN_PREFIX = "shown:today:";
const SESSION_SHOWN_PREFIX = "shown:session:";

export default function App() {
    // ----- 기존 상태/로직 유지 -----
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sessionList, setSessionList] = useState([]);
    const [currentSession, setCurrentSession] = useState(null);
    const [isMaximized, setIsMaximized] = useState(false);
    const [currentPage, setCurrentPage] = useState("login");
    const [pageParams, setPageParams] = useState(null); // 화면 파라미터
    const [currentUser, setCurrentUser] = useState(null); // 로그인 사용자 payload 저장

    const initedRef = useRef(false);
    const mountIdRef = useRef(Math.random().toString(36).slice(2));

    const isFeatureWindow = useMemo(() => {
        try {
            return (
                new URLSearchParams(window.location.search).get("feature") ===
                "1"
            );
        } catch {
            return false;
        }
    }, []);

    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        console.groupCollapsed(`[App boot ${mountIdRef.current}]`);
        console.log("href:", window.location.href);
        console.log("query:", Object.fromEntries(q.entries()));
        console.log("versions:", window?.process?.versions || "(browser)");
        console.groupEnd();
    }, []);

    // ✅ 알림 전용 창(#/notify)이면 알림 루트만 렌더
    const isNotifyWindow = useMemo(() => {
        try { return window.location.hash === "#/notify"; } catch { return false; }
    }, []);
    if (isNotifyWindow) {
        return <NotifyWindowRoot />;
    }

    // ✅ Feature 창이면 App의 나머지 로직을 건너뛰고 바로 FeatureShell 렌더
    if (isFeatureWindow) {
        // URL ?role=... 우선, 없으면 localStorage.user.role 사용
        let role =
            new URLSearchParams(window.location.search).get("role") ||
            "employee";
        try {
            const raw = localStorage.getItem(USER_KEY);
            if (raw) role = JSON.parse(raw)?.role || role;
        } catch {}
        // admin 외에는 employee로 통일
        const userType = role === "admin" ? "admin" : "employee";
        return (
            <ToastProvider position="bottom" defaultDuration={3000}>
                <FeatureShell userType={userType} />
            </ToastProvider>
        );
    }

    const loadSessions = async () => {
        const t0 = performance.now();
        console.group(`[App ${mountIdRef.current}] loadSessions start`);
        try {
            const sessions = await getChatSessions();
            console.log(
                "getChatSessions ->",
                Array.isArray(sessions) ? `length=${sessions.length}` : sessions
            );
            setSessionList(sessions || []);
            if (!currentSession && sessions?.length) {
                setCurrentSession({
                    id: sessions[0].session_id || sessions[0].id,
                });
            }
        } catch (e) {
            console.error("loadSessions error", e?.name, e?.message, e);
        } finally {
            const dt = (performance.now() - t0).toFixed(1);
            console.groupEnd();
            console.log(
                `[App ${mountIdRef.current}] loadSessions finished in ${dt}ms`
            );
        }
    };

    const handleNewChat = () => {
        const newId = `session-${Date.now()}`;
        console.log("[App] new chat ->", newId);
        setCurrentSession({ id: newId, title: "새로운 대화", isNew: true });
    };

    const handleSelectChat = (target) => {
        const id =
            typeof target === "string"
                ? target
                : target?.session_id || target?.id;
        console.log("[App] select chat ->", id);
        if (!id) return;
        setCurrentSession({ id });
        if (!isMaximized) setSidebarOpen(false);
    };

    const chatKey = useMemo(
        () => currentSession?.id || "no-session",
        [currentSession?.id]
    );

    /** ✅ 변경: 사이드바에서 눌러도 "전역" 로그아웃을 트리거 */
    const handleLogout = () => {
        window.auth?.requestLogout?.("all"); // ← 브로드캐스트
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

    // useEffect(() => {
    //     const userRaw = localStorage.getItem(USER_KEY);
    //     console.log("[App] auto-login check ->", !!userRaw);
    //     setCurrentPage(userRaw ? "chat" : "login");
    // }, []);
  useEffect(() => {
    const userRaw = localStorage.getItem(USER_KEY);
    console.log("[App] auto-login check ->", !!userRaw);
    setCurrentPage(userRaw ? 'chat' : 'login');
  }, []);

    // const handleLoginSuccess = (userData) => {
    //     console.log("[App] login success", userData);
    //     localStorage.setItem(USER_KEY, JSON.stringify(userData));
    //     setSidebarOpen(false);
    //     setCurrentPage("chat");
    // };

    // 강제 비번 변경 분기 수정 전 코드
    // const handleLoginSuccess = (userData) => {
    //     console.log("[App] login success", userData);
    //     localStorage.setItem(USER_KEY, JSON.stringify(userData));

    //     // userData 예: { role: 'admin'|'employee'|'user', initialPassword: true|false }
    //     const role = userData?.role === "admin" ? "admin" : "employee";

    //     if (userData?.initialPassword) {
    //         // 로그인 창 크기/스타일로 비번 변경 진입
    //         setPageParams({ beforeStep: "login", role, isForceChange: true });
    //         setCurrentPage("change-password");
    //         return;
    //     }

    //     setSidebarOpen(false);
    //     setCurrentPage("chat");
    // };

    const handleLoginSuccess = (userData) => {
        console.log("[App] login success", userData);
        localStorage.setItem("user", JSON.stringify(userData));
        setCurrentUser(userData);

        const role = userData?.role === "admin" ? "admin" : "employee";

        if (userData?.initialPassword) {
            // ⬇️ 먼저 비번 변경 화면으로 보냄 (아직 IPC 안 보냄)
            setPageParams({ beforeStep: "login", role, isForceChange: true });
            setCurrentPage("change-password");
            return;
        }

        // 초기비번이 아니면 바로 기존 흐름 유지
        setSidebarOpen(false);
        setCurrentPage("chat");

        // (선택) 초기비번이 아닌 경우 IPC 보낼 곳이 로그인페이지라면 여기서 보낼 수도 있음
        try {
            window?.electron?.ipcRenderer?.send("auth:success", userData);
        } catch {}

        // ✅ 로그인 직후: ‘오늘 일정 1회 알림’ 시도
        try { showTodayEventsOnce(userData); } catch {}
    };

    useEffect(() => {
        console.log("[App] currentPage =", currentPage);
        if (currentPage === "chat") {
            loadSessions();
            // watcher를 한 번만 시작 (마감 N분 전 알림)
            if (!initedRef.current) {
                try { startUpcomingWatcher({ refreshSec: 20 }); } catch {}
                initedRef.current = true;
            }
            // 자동 로그인 진입 등으로 여기서도 ‘오늘 일정 1회 알림’ 보장
            try {
                const raw = localStorage.getItem(USER_KEY);
                const user = raw ? JSON.parse(raw) : null;
                if (user) showTodayEventsOnce(user);
            } catch {}
        }
    }, [currentPage]);

    useLayoutEffect(() => {
        const kickComposite = () => {
            document.body.classList.add("no-corner-flicker");
            requestAnimationFrame(() => {
                document.body.classList.remove("no-corner-flicker");
            });
        };
        window.addEventListener("resize", kickComposite);
        window.electron?.onWindowState?.(kickComposite);
        return () => {
            window.removeEventListener("resize", kickComposite);
            window.electron?.offWindowState?.(kickComposite);
        };
    }, []);

    /** ✅ 추가: 전역 logout 브로드캐스트 "수신" → 토큰 정리 + 로그인 화면 */
    useEffect(() => {
        const off = window.auth?.onLogout?.(() => {
            try {
                localStorage.removeItem(USER_KEY);
                localStorage.removeItem(TOKEN_KEY);
                try {
                    const keys = Object.keys(sessionStorage);
                    keys.forEach(k => {
                        if (k.startsWith(TODAY_SHOWN_PREFIX)) sessionStorage.removeItem(k);
                        if (k.startsWith(SESSION_SHOWN_PREFIX)) sessionStorage.removeItem(k); // ✅ 세션 1회 플래그도 제거
                    });
                } catch {}
            } catch {}
            setCurrentPage("login");
        });
        return () => off?.();
    }, []);

    if (currentPage === "login") {
        return (
            <LoginPage
                // currentPage={"login"}
                onLoginSuccess={handleLoginSuccess}
                onFindId={() => setCurrentPage("find-id")}
                onFindPw={() => setCurrentPage("find-pw")}
            />
        );
    }
    if (currentPage === "find-id") {
        return <FindId onBack={() => setCurrentPage("login")} />;
    }
    if (currentPage === "find-pw") {
        return <ResetPassword onBack={() => setCurrentPage("login")} />;
    }
    if (currentPage === "change-password") {
        const beforeStep = pageParams?.beforeStep || "login"; // 'login' | 'mypage'
        const role = pageParams?.role || "employee";
        const isForceChange = !!pageParams?.isForceChange;

        return (
            <ChangePasswordView
                beforeStep={beforeStep}
                role={role}
                isForceChange={isForceChange}
                // ✅ 변경 성공: 이 시점에 메인 프로세스에 auth:success 송신 → 기능부/챗봇 창 오픈
                routeTo={() => {
                    try {
                        const payload =
                            currentUser ||
                            JSON.parse(localStorage.getItem("user") || "{}");
                        // 강제 변경 완료했으므로 플래그 제거
                        const updated = { ...payload, initialPassword: false };
                        localStorage.setItem("user", JSON.stringify(updated));

                        window?.electron?.ipcRenderer?.send(
                            "auth:success",
                            updated
                        );
                    } catch {}

                    setPageParams(null);
                    setCurrentPage("chat"); // 로그인 창에서는 chat 상태로 종료
                }}
                // 취소 → 로그인 복귀 (IPC 없음)
                goLogin={() => {
                    setPageParams(null);
                    setCurrentUser(null);
                    setCurrentPage("login");
                }}
                // (마이페이지 경유가 아니라서 여기선 의미 없음)
                goMyPage={() => {
                    setPageParams(null);
                    setCurrentPage("chat");
                }}
            />
        );
    }

    return (
        <ToastProvider position="bottom" defaultDuration={3000}>
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

                    {/* 사이드바 */}
                    {(isMaximized || sidebarOpen) && (
                    <div
                        className={`bg-white shadow-lg z-40 transition-all duration-300
                        ${isMaximized
                            // 기존: basis-1/6 relative
                            ? "relative flex-none w-1/6 min-w-0"
                            : "w-64 fixed h-full left-0 top-0"
                        }`}
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

                    {/* 채팅 영역 */}
                    <div
                      className={`chat-pane flex flex-col transition-all duration-300
                        ${isMaximized
                          ? "flex-auto"
                          : "flex-1"
                        }`}
                    >
                    <ChatWindow
                        key={chatKey}
                        currentSession={currentSession}
                        onSessionUpdated={loadSessions}
                        isMaximized={isMaximized}
                    />
                    </div>
                </div>
            </div>
        </ToastProvider>
    );
}

/* ---------------------------------------------
   오늘 해야할 일정 1회 알림
   - 로그인 직후 1회만 표시
   --------------------------------------------- */
async function showTodayEventsOnce(user) {
    const userId = user?.id || user?.user_id || "anonymous";
    const flagKey = `${SESSION_SHOWN_PREFIX}${userId}`;
    if (sessionStorage.getItem(flagKey) === "done") return;
    // 로컬(PC 시간 = 한국시간) 기준 오늘 00:00 ~ 23:59:59.999
    const startLocal = new Date();
    startLocal.setHours(0, 0, 0, 0);
    const endLocal = new Date(startLocal.getTime() + 24 * 60 * 60 * 1000 - 1);

    const start = startLocal.toISOString();
    const end   = endLocal.toISOString();
    let events = [];
    try {
        events = await calendarApi.getEvents({ start, end });
    } catch (e) {
        console.warn("[App] showTodayEventsOnce getEvents failed:", e?.message || e);
        return;
    }
    if (!Array.isArray(events) || events.length === 0) {
        // 일정이 없으면 "오늘 일정이 없습니다." 팝업 출력
        const todayKey = startLocal.toLocaleDateString("sv-SE"); // YYYY-MM-DD
        window.notify?.openUpcoming?.({
            id: `todayEvents:${todayKey}:${Date.now()}`,
            title: "오늘 해야 할 일정",
            description: "오늘 일정이 없습니다.",
            start,
            end,
            reminder_minutes_before: null,
        });
        return;
    }

   // ✅ (선택) 이미 끝난 일정은 제외하려면 이 줄을 활성화
   // const now = Date.now();
   // events = events.filter(ev => new Date(ev.end ?? ev.start).getTime() >= now);
 
   // ✅ 마감(끝) 빠른 순 → 동률이면 시작 빠른 순으로 정렬
   const sorted = [...events].sort((a, b) => {
     const ak = new Date(a.end ?? a.start).getTime();
     const bk = new Date(b.end ?? b.start).getTime();
     if (ak !== bk) return ak - bk;
     return new Date(a.start).getTime() - new Date(b.start).getTime();
   });
 
   // 간결한 리스트(제목 / 마감시간 HH시 mm분까지 / 내용 요약 1줄)
   const lines = sorted.map(ev => {
     const title = ev.title || "(제목 없음)";
     const desc  = (ev.description || "").trim().split("\n")[0] || "";
     const base  = ev.end || ev.start;
     const d     = new Date(base);
     const hh    = String(d.getHours()).padStart(2, "0");
     const mm    = String(d.getMinutes()).padStart(2, "0");
     const until = `일정 종료 : ${hh}시 ${mm}분`;
     // 제목·내용 같은 줄, 그 아래 마감시간
     return `• ${title}${desc ? ` — ${desc}` : ""}\n  ${until}`;
   }).join("\n\n");

    // 하나의 커스텀 이벤트 payload로 notify 창 열기
    const todayKey = startLocal.toLocaleDateString("sv-SE");
    window.notify?.openUpcoming?.({
        id: `todayEvents:${todayKey}:${Date.now()}`,
        title: "오늘 해야 할 일정",
        description: lines,
        start,
        end,
        reminder_minutes_before: null, // 일반 알림과 구분(시계열 트리거 아님)
    });

    // 이번 세션에서는 다시 안 뜨도록 플래그 저장
    sessionStorage.setItem(flagKey, "done");
}