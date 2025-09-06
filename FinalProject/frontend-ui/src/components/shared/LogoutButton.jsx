// src/components/common/LogoutButton.jsx
import React from "react";

export default function LogoutButton({ scope = "current", className, children }) {
  const onClick = () => window.auth?.requestLogout?.(scope);
  return (
    <button type="button" className={className} onClick={onClick} title="로그아웃">
      {children || "로그아웃"}
    </button>
  );
}