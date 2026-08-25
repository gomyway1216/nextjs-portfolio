/**
 * Layout-only memory of "this browser was signed in last time".
 *
 * Restoring a session on load costs three round trips (`/api/auth/client-token`
 * -> `signInWithCustomToken` -> `/api/auth/verify`), so `currentUser` stays null
 * for a second or two after the first paint. Any chrome that keys off
 * `currentUser` therefore renders its signed-out shape first and swaps once auth
 * settles — a visible reflow. On /games/shogi that reflow rewraps the sticky
 * toolbar and pushes the board down, which reads as the board "jumping" mid-game.
 *
 * This hint lets such chrome reserve the right shape from the first frame. It is
 * ONLY ever used to pick a layout: every privileged action still gates on the
 * real `currentUser`, so a stale hint can at worst reserve a box for a button
 * that stays disabled.
 */

const AUTH_LAYOUT_HINT_KEY = 'meetyudai:auth-layout-hint';
const AUTH_LAYOUT_HINT_VERSION = 1;

export interface AuthLayoutHint {
  /** Single character rendered in the avatar bubble. */
  initial: string;
  /** Name shown next to the avatar on wide viewports, when the account has one. */
  displayName: string | null;
}

interface StoredAuthLayoutHint extends AuthLayoutHint {
  v: number;
}

/**
 * The avatar bubble's letter. Shared with the toolbar so the placeholder and the
 * resolved avatar can never disagree.
 */
export function deriveUserInitial(displayName?: string | null, email?: string | null): string {
  return (displayName || email || 'U').charAt(0).toUpperCase();
}

export function toAuthLayoutHint(
  user: { displayName?: string | null; email?: string | null } | null,
): AuthLayoutHint | null {
  if (!user) return null;
  return {
    initial: deriveUserInitial(user.displayName, user.email),
    displayName: user.displayName ?? null,
  };
}

/**
 * The shape to paint while auth is still settling, or null to read the real
 * user instead. The hint is deliberately dropped the moment auth settles: from
 * then on `currentUser` is authoritative, including when it says "signed out"
 * and the remembered session turns out to have expired.
 */
export function resolvePresumedProfile(
  isSignedIn: boolean,
  loading: boolean,
  hint: AuthLayoutHint | null,
): AuthLayoutHint | null {
  if (isSignedIn) return null;
  return loading ? hint : null;
}

export function readAuthLayoutHint(): AuthLayoutHint | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(AUTH_LAYOUT_HINT_KEY);
  } catch {
    // Private mode / storage disabled: fall back to the signed-out shape.
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuthLayoutHint> | null;
    if (!parsed || parsed.v !== AUTH_LAYOUT_HINT_VERSION) return null;
    const initial = typeof parsed.initial === 'string' && parsed.initial.length === 1
      ? parsed.initial
      : 'U';
    return {
      initial,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
    };
  } catch {
    return null;
  }
}

export function writeAuthLayoutHint(hint: AuthLayoutHint | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!hint) {
      window.localStorage.removeItem(AUTH_LAYOUT_HINT_KEY);
      return;
    }
    const stored: StoredAuthLayoutHint = { v: AUTH_LAYOUT_HINT_VERSION, ...hint };
    window.localStorage.setItem(AUTH_LAYOUT_HINT_KEY, JSON.stringify(stored));
  } catch {
    // Storage failures only cost the reflow this hint exists to avoid.
  }
}
