import ChatSummaryItem from './ChatSummaryItem.jsx';
import IconButton from '../shared/IconButton.jsx';

export default function Sidebar({
  onClose,
  sessions,
  onNewChat,
  onSelectChat,
  isMaximized, // ✅ 전달받은 창 상태
}) {
  return (
    <div className="w-full h-full bg-white shadow-lg z-50">
      {/* 닫기 버튼 (일반 모드일 때만) */}
      {!isMaximized && (
        <div className="flex justify-end items-center h-10 px-3 drag-region">
          <div className="no-drag">
            <IconButton icon="close" onClick={onClose} />
          </div>
        </div>
      )}

      <div className="p-4">
        {/* 새 채팅 버튼 */}
        <div className="mb-2">
          <button
            className="text-sm px-3 py-2 rounded bg-blue-600 text-white w-full"
            onClick={onNewChat}
          >
            ＋ 새 채팅
          </button>
        </div>

        <hr className="my-2" />

        {/* 세션 목록 */}
        {sessions.length === 0 ? (
          <div className="text-sm text-gray-400">채팅 기록 없음</div>
        ) : (
          sessions.map((chat) => (
            <ChatSummaryItem
              key={chat.session_id}
              title={chat.title}
              onClick={() => onSelectChat(chat.session_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
