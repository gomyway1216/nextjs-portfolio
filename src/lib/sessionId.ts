/**
 * Browser-scoped session identifier for visitor tracking.
 *
 * Persists in localStorage so the same browser keeps the same session_id
 * across page loads, tabs, and (importantly) sign-in transitions. This
 * lets the activity log track a visitor's full journey:
 *
 *   - Anonymous browsing (no Firebase auth) → rows with session_id only
 *   - Sign-in completes → subsequent rows have session_id + agent_uid
 *   - Admin can pivot by session_id to see pre-login + post-login activity
 *     for the same visitor
 *
 * Resets when:
 *   - User clears site data / localStorage
 *   - Different browser or device (new session_id there)
 *
 * Format: 36-char UUID v4 (e.g. "a1b2c3d4-e5f6-..."). Different shape
 *   from request_id (12-hex) and agent_uid (Firebase 28-char) so it's
 *   unambiguous in logs and filter UIs.
 */

const KEY = 'portfolio_session_id';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (rare, very old browsers).
  // Generate a v4-shaped UUID from getRandomValues / Math.random.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Returns the visitor's session_id, generating + persisting one on first
 * call. Safe to call from server-side rendering — returns null if no
 * window/localStorage available, callers should treat absence as "no
 * session yet" and skip the field.
 */
export function getSessionId(): string | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = generateUuid();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Some browsers (e.g. Safari private mode) throw on localStorage access.
    // Generate a per-page-load id as a fallback so logging still works.
    return generateUuid();
  }
}

/**
 * Clears the stored session_id. Mostly useful for testing or a "reset
 * tracking" admin action — production users get a new session naturally
 * by clearing site data.
 */
export function resetSessionId(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
