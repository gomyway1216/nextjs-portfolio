/** QR-reader browsers can run without DOM storage, where even reading `localStorage` throws or
 * finds null. Drafts are a convenience, so they must never take a player out of the game. */
export function loadDraft(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function saveDraft(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* The answer box still holds the text. */ }
}
export function clearDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* Nothing was stored. */ }
}
