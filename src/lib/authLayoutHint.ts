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
 * How far auth resolution has got, for layout purposes.
 *
 * Kept distinct from any `loading` flag on purpose. A watchdog that force-clears
 * `loading` after N seconds says nothing about whether auth resolved — it fires
 * just as happily while a session restore is mid-flight — so reusing it here
 * would drop the reservation at N seconds and reflow the page twice instead of
 * never.
 *
 * - `pending`  — auth work is still in flight; keep reserving the remembered shape.
 * - `resolved` — a listener pass completed. The only positive evidence of the real
 *                state, and the only state allowed to rewrite the stored hint.
 * - `unknown`  — a watchdog gave up. Stop presuming, but leave the stored hint
 *                alone: nothing was learned, and erasing it would cost the next load.
 */
export type AuthResolution = 'pending' | 'resolved' | 'unknown';

export type AuthResolutionEvent =
  /** A listener pass ran to completion — we know the real state. */
  | 'pass-completed'
  /** A watchdog fired — we know nothing, we are only done waiting. */
  | 'gave-up';

export function nextAuthResolution(
  previous: AuthResolution,
  event: AuthResolutionEvent,
): AuthResolution {
  if (event === 'pass-completed') return 'resolved';
  // Giving up must never downgrade a real answer.
  return previous === 'pending' ? 'unknown' : previous;
}

/**
 * Only a completed pass may rewrite the stored hint. A watchdog reaching its
 * deadline is not evidence of being signed out, and treating it as such would
 * erase the hint for a user who is merely on a slow connection — breaking the
 * next load as well as this one.
 */
export function shouldPersistAuthLayoutHint(resolution: AuthResolution): boolean {
  return resolution === 'resolved';
}

/**
 * The hang guard exists for one failure: Firebase's listener never calling back
 * at all. If it has called back, a pass is in flight and will resolve things, so
 * the guard must leave the presumption alone.
 */
export function hangGuardShouldStopPresuming(authCallbackStarted: boolean): boolean {
  return !authCallbackStarted;
}

/**
 * The shape to paint while auth work is still in flight, or null to read the
 * real user instead. The hint is dropped the moment that work stops: from then
 * on `currentUser` is authoritative, including when it says "signed out" and
 * the remembered session turns out to have expired.
 *
 * `authPending` must track whether the auth pipeline is still working, NOT a
 * loading flag that some watchdog can flip on a timer — presuming has to
 * outlast a slow session restore or the reflow it prevents simply happens later.
 */
export function resolvePresumedProfile(
  isSignedIn: boolean,
  authPending: boolean,
  hint: AuthLayoutHint | null,
): AuthLayoutHint | null {
  if (isSignedIn) return null;
  return authPending ? hint : null;
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
