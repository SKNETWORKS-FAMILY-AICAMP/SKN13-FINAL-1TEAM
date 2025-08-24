// src/shared/useLogout.js
import { useEffect } from "react";
import { clearAuth } from "./authStore";

export function useLogout(onAfter) {
  useEffect(() => {
    const handler = () => {
      clearAuth();
      onAfter?.(); // 예: setCurrentPage('login') 또는 라우터 이동
    };
    const off = window.auth?.onLogout?.(handler);
    return () => { off?.(); };
  }, [onAfter]);
}
