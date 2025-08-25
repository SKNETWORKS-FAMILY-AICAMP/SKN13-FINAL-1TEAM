########## chat_history_manager.py
"""
agent와 나눈 대화 내역을 저장하는 manager 파일입니다.
"""

from create_engine import engine
from langchain_core.messages import BaseMessage
from langchain_community.chat_message_histories import SQLChatMessageHistory


class ChatHistoryManager:
    def __init__(self):
        self.engine = engine
        self.store = {}  # session_id -> SQLChatMessageHistory
        self.memory_cache = {}  # session_id -> List[BaseMessage]

    def get_session_history(self, session_id: str) -> SQLChatMessageHistory:
        if session_id not in self.store:
            self.store[session_id] = SQLChatMessageHistory(
                session_id=session_id,
                connection=self.engine
            )
        return self.store[session_id]

    def get_messages(self, session_id: str) -> list[BaseMessage]:
        """최신 메시지 목록을 가져옴 (메모리 기준)"""
        if session_id not in self.memory_cache:
            history = self.get_session_history(session_id)
            self.memory_cache[session_id] = history.messages
        return self.memory_cache[session_id]

    def append_message(self, session_id: str, msg: BaseMessage):
        """메시지를 메모리 + DB에 동시 반영"""
        self.get_messages(session_id).append(msg)
        history = self.get_session_history(session_id)
        history.add_message(msg)

    def flush_to_db(self, session_id: str):
        """메모리 메시지를 DB에 강제 저장 (초기화 후 전체 덮어쓰기)"""
        if session_id in self.memory_cache:
            history = self.get_session_history(session_id)
            history.clear()
            for msg in self.memory_cache[session_id]:
                history.add_message(msg)

    def clear_session(self, session_id: str):
        """해당 세션의 캐시와 DB 모두 초기화"""
        if session_id in self.memory_cache:
            del self.memory_cache[session_id]
        history = self.get_session_history(session_id)
        history.clear()

chat_store = ChatHistoryManager()