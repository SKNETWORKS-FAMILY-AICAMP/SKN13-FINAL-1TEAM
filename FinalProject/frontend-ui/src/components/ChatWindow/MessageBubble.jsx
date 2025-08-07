import React, { useState } from "react";

export default function MessageBubble({ message }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isUser = message.role === "user";
  const MAX_LENGTH = 100; // 도구 메시지를 접을 길이 기준

  const isCollapsible = message.role === "tool" || message.role === "thinking";
  const needsTruncation = isCollapsible && message.content.length > MAX_LENGTH;

  const displayedContent = needsTruncation && !isExpanded
    ? message.content.substring(0, MAX_LENGTH) + "..."
    : message.content;

  let bubbleClass = "";
  let textColorClass = "";

  if (isUser) {
    bubbleClass = "bg-blue-100 text-right self-end";
  } else {
    if (message.role === "tool") {
      bubbleClass = "bg-green-100 self-start";
      textColorClass = "text-green-800 font-semibold";
    } else if (message.role === "thinking") {
      bubbleClass = "bg-yellow-100 self-start";
      textColorClass = "text-gray-600 italic";
    } else { // Regular AI message
      bubbleClass = "bg-gray-100 self-start";
    }
  }

  return (
    <div className={`max-w-md my-1 p-2 rounded ${bubbleClass}`}>
      <p
        className={`text-sm whitespace-pre-wrap ${textColorClass} ${needsTruncation ? 'cursor-pointer' : ''}`}
        onClick={() => needsTruncation && setIsExpanded(!isExpanded)}
      >
        {displayedContent}
      </p>
      {needsTruncation && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-blue-500 hover:underline mt-1"
        >
          {isExpanded ? "접기" : "더 보기"}
        </button>
      )}
      {message.file && (
        <p className="text-xs text-blue-600 mt-1">📎 첨부: {message.file.name}</p>
      )}
    </div>
  );
}