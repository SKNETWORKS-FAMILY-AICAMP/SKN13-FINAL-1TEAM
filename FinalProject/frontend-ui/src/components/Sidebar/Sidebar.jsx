/* src/components/Sidebar/Sidebar.jsx — 기존 동작 그대로 (부모 onLogout을 전역 트리거로 연결) */
import React, { useCallback, useMemo, useRef } from "react";
import ChatSummaryItem from "./ChatSummaryItem.jsx";
import IconButton from "../shared/IconButton.jsx";

export default React.memo(function Sidebar({
    onClose,
    sessions = [],
    onNewChat,
    onSelectChat,
    isMaximized,
    onLogout,
}) {
    const busyRef = useRef(false);

    const handleNewChat = useCallback(() => {
        if (busyRef.current) return;
        busyRef.current = true;
        try {
            onNewChat?.();
        } finally {
            busyRef.current = false;
        }
    }, [onNewChat]);

    const handleLogout = useCallback(() => {
        if (busyRef.current) return;
        busyRef.current = true;
        try {
            onLogout?.();
        } finally {
            busyRef.current = false;
        }
    }, [onLogout]);

    const makeSelectHandler = useCallback(
        (sid) => () => {
            if (busyRef.current) return;
            busyRef.current = true;
            try {
                onSelectChat?.(sid);
            } finally {
                busyRef.current = false;
            }
        },
        [onSelectChat]
    );

    const safeSessions = useMemo(() => {
        return (Array.isArray(sessions) ? sessions : []).map((chat) => {
            const key =
                chat?.session_id ??
                chat?.id ??
                chat?.messageId ??
                `${chat?.title ?? "untitled"}-${(
                    chat?.updated_at ?? ""
                ).toString()}`;
            const sid = chat?.session_id ?? chat?.id ?? key;
            return { chat, key, sid };
        });
    }, [sessions]);

    return (
        <div className="w-full h-full bg-white shadow-lg z-50 flex flex-col">
            <div className="flex flex-col flex-grow h-0">
                {!isMaximized && (
                    <div className="flex justify-end items-center h-10 px-3 drag-region">
                        <div className="no-drag">
                            <IconButton icon="close" onClick={onClose} />
                        </div>
                    </div>
                )}

                <div className="p-4 pb-0">
                    <div className="mb-2">
                        <button
                            className="text-sm px-3 py-2 rounded bg-blue-600 text-white w-full"
                            onClick={handleNewChat}
                        >
                            ＋ 새 채팅
                        </button>
                    </div>
                    <hr className="my-2" />
                </div>

                <div className="flex-grow overflow-y-auto px-4 no-scrollbar">
                    {safeSessions.length === 0 ? (
                        <div className="text-sm text-gray-400">
                            채팅 기록 없음
                        </div>
                    ) : (
                        safeSessions.map(({ chat, key, sid }) => (
                            <ChatSummaryItem
                                key={key}
                                title={chat.title}
                                onClick={makeSelectHandler(sid)}
                            />
                        ))
                    )}
                </div>
            </div>

            <div className="p-4 border-t border-gray-200">
                <button
                    onClick={handleLogout}
                    className="w-full text-sm py-2 rounded bg-red-500 text-white hover:bg-red-600"
                >
                    로그아웃
                </button>
            </div>
        </div>
    );
});
