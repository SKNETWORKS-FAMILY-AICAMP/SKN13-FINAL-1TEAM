// src/shared/authStore.js
const USER_KEY = 'user';
const TOKEN_KEY = 'userToken';

export function clearAuth() {
  try { localStorage.removeItem(USER_KEY); } catch {}
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}
export function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
}
export function readUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
  catch { return null; }
}
export function isLoggedIn() {
  return !!localStorage.getItem(USER_KEY);
}
