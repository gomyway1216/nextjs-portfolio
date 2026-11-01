/** QR-reader browsers can run without DOM storage, where even reading `localStorage` throws or
 * finds null. Drafts are a convenience, so they must never take a player out of the game. */
const session = new Map<string, string>();
/** The unsent-change checks read drafts too, so this page's copy wins over a write storage refused. */
export function loadDraft(key: string): string | null {
  const draft = session.get(key);
  if (draft !== undefined) return draft;
  try { return localStorage.getItem(key); } catch { return null; }
}
export function saveDraft(key: string, value: string) {
  session.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* The copy above lasts until the page closes. */ }
}
export function clearDraft(key: string) {
  session.delete(key);
  try { localStorage.removeItem(key); } catch { /* Nothing was stored. */ }
}
