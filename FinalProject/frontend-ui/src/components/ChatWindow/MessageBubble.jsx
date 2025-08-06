import React from "react";

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const bubbleClass = isUser
    ? "bg-blue-100 text-right self-end"
    : "bg-gray-100 self-start";

  return (
    <div className={`max-w-md my-1 p-2 rounded ${bubbleClass}`}>
      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      {message.file && (
        <p className="text-xs text-blue-600 mt-1">📎 첨부: {message.file.name}</p>
      )}
    </div>
  );
}
