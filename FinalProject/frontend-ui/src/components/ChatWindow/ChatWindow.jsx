// ✅ ChatWindow.jsx
import React, { useEffect, useState } from 'react';
import ChatBubble from './MessageBubble.jsx';
import ChatInput from './ChatInput.jsx';
import { getMessages, saveMessage } from '../services/chatApi.js';
import { getLLMResponse } from '../services/llmApi.js';

export default function ChatWindow({ currentSession, onSessionUpdated, isMaximized }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (currentSession?.id) {
      getMessages(currentSession.id).then(setMessages);
    }
  }, [currentSession]);

  const handleSend = async () => {
    if (!input.trim() || !currentSession?.id) return;

    const sessionId = currentSession.id;

    const userMsg = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    await saveMessage({ sessionId, ...userMsg });

    const aiContent = await getLLMResponse(input);
    const aiMsg = { role: 'ai', content: aiContent };
    setMessages((prev) => [...prev, aiMsg]);
    await saveMessage({ sessionId, ...aiMsg });

    setInput('');
    setFile(null);
    onSessionUpdated();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-10 text-sm">
            퇴근하고 싶으시죠? 일하세요.
          </div>
        ) : (
          messages.map((msg, idx) => (
            // <ChatBubble key={idx} sender={msg.role} text={msg.content} />
            <ChatBubble key={idx} message={msg} />
          ))
        )}
      </div>

      <ChatInput
        input={input}
        setInput={setInput}
        onSend={handleSend}
        file={file}
        setFile={setFile}
        isMaximized={isMaximized}
      />
    </div>
  );
}
