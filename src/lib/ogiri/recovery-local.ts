import type { RoomView } from './types';

// Session-only storage keeps a code available after navigation/reload. Never put it in
// the URL, shared history, or persistent localStorage. Storage can be disabled.
const issued = new Map<string, string>();
const keyFor = (code: string, id: string) => `ogiri:recovery:${code}:${id}`;
export function rememberRecovery(view: RoomView) {
  if (!view.me || !view.recoveryCode || !/^[A-HJ-NP-Z2-9]{8}$/.test(view.recoveryCode)) return;
  const key = keyFor(view.code, view.me);
  issued.set(key, view.recoveryCode);
  try { sessionStorage.setItem(key, view.recoveryCode); } catch { /* In-memory navigation still works. */ }
}
export function recallRecovery(code: string, id: string): string {
  const key = keyFor(code, id);
  try {
    const stored = sessionStorage.getItem(key);
    if (stored && /^[A-HJ-NP-Z2-9]{8}$/.test(stored)) return stored;
  } catch { /* The authenticated owner can reissue if this tab has no copy. */ }
  return issued.get(key) ?? '';
}
