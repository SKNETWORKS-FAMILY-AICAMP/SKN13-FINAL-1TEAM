// frontend-ui/src/components/services/notifyState.js
const STORAGE_DISMISSED = "upcoming:dismissed";
const STORAGE_SNOOZE    = "upcoming:snoozeUntil";

const load = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || "{}"); } catch { return {}; } };
const save = (k, v) => sessionStorage.setItem(k, JSON.stringify(v || {}));

export function dismissEvent(id) {
  const m = load(STORAGE_DISMISSED); m[id] = true; save(STORAGE_DISMISSED, m);
}
export function snoozeEvent5m(id) {
  const m = load(STORAGE_SNOOZE); m[id] = Date.now() + 5 * 60 * 1000; save(STORAGE_SNOOZE, m);
}
