import React from "react";

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  let bubbleClass = "";
  let textColorClass = "";

  if (isUser) {
    bubbleClass = "bg-blue-100 text-right self-end";
  } else {
    switch (message.type) {
      case 'thinking':
        bubbleClass = "bg-yellow-100 self-start";
        textColorClass = "text-gray-600 italic";
        break;
      case 'tool':
        bubbleClass = "bg-green-100 self-start";
        textColorClass = "text-green-800 font-semibold";
        break;
      default: // Regular AI message
        bubbleClass = "bg-gray-100 self-start";
        break;
    }
  }

  return (
    <div className={`max-w-md my-1 p-2 rounded ${bubbleClass}`}>
      <p className={`text-sm whitespace-pre-wrap ${textColorClass}`}>{message.content}</p>
      {message.file && (
        <p className="text-xs text-blue-600 mt-1">📎 첨부: {message.file.name}</p>
      )}
    </div>
  );
}