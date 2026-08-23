/**
 * Client for POST /api/game/shogi/records — saves the kifu of one shogi game.
 *
 * Fire-and-forget, like the activity log: a game that fails to upload must
 * never surface an error to someone who came to play shogi.
 *
 * The one thing this module is strict about is sending each game once. A game
 * has two possible exits (it ends, or the player walks away) and the second
 * can fire from several places — pagehide, visibilitychange, unmount, and
 * "new game" all mean the same thing to the browser. Deduplication lives here
 * rather than in the component because a React unmount takes the component's
 * refs with it, while a remount inside the same page must still remember what
 * it already sent. The server also keys on game_id, so a genuinely duplicated
 * request overwrites its own document instead of adding a second copy.
 */

import { auth } from '@/lib/firebaseConnect';
import { APP_BUILD_SHA, APP_VERSION } from '@/lib/buildInfo';
import type { ShogiGameRecordPayload } from '@/components/game/ShogiImproved/gameRecord';

const ENDPOINT = '/api/game/shogi/records';

/** Claims taken during this page load, as `<game_id>:<kind>`. */
const submitted = new Set<string>();

/** Which exit is being reported. See `claimGameRecord`. */
export type GameRecordKind = 'final' | 'abandoned';

/**
 * Claim the right to send one record for a game. Returns false if the caller
 * should do nothing at all.
 *
 * A game gets at most two submissions, and only in one order:
 *
 *   - `abandoned` — the player hid the tab or walked away mid-game. Sent once.
 *   - `final` — the game actually ended. Sent once, and allowed even after an
 *     abandonment, because a player who switches tabs and comes back to
 *     checkmate the engine did finish the game. Both writes land on the same
 *     document (the server keys on game_id), so the result replaces the
 *     partial record rather than adding a second copy.
 *
 * The reverse is refused: once a result has been reported, a later pagehide
 * must not file the same game as abandoned. The server enforces this too —
 * this just avoids the pointless request.
 *
 * Claiming happens before the request is sent, not after it succeeds. Two
 * exits firing in the same tick (checkmate and pagehide) must not both get
 * through, and a failed upload is not worth retrying on every tab switch.
 */
export function claimGameRecord(gameId: string, kind: GameRecordKind): boolean {
  const finalKey = `${gameId}:final`;
  if (submitted.has(finalKey)) return false;

  const key = kind === 'final' ? finalKey : `${gameId}:abandoned`;
  if (submitted.has(key)) return false;

  submitted.add(key);
  return true;
}

/** Test seam — forget every claim. Never needed in the browser. */
export function resetSubmittedGameRecords(): void {
  submitted.clear();
}

async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  try {
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  } catch {
    return {};
  }
}

export interface SubmitOptions {
  /**
   * The page is going away. sendBeacon is the only transport the browser
   * promises to finish in that state, so it wins — at the cost of custom
   * headers, which means a signed-in player's record is attributed to their
   * session_id rather than their uid. Losing the uid on one record is a far
   * better trade than losing the record.
   */
  unloading?: boolean;
}

/**
 * Send one game record. Resolves true if a request was actually dispatched.
 *
 * Caller must have claimed the game_id first (see `claimGameRecord`); this
 * does not claim on its own, so that the decision to give up on a game and
 * the decision to send it stay in one place in the component.
 */
export async function submitShogiGameRecord(
  payload: ShogiGameRecordPayload,
  options: SubmitOptions = {},
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const body = JSON.stringify({
    ...payload,
    app_version: payload.app_version ?? APP_VERSION,
    app_build_sha: payload.app_build_sha ?? APP_BUILD_SHA,
  });

  try {
    if (options.unloading && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      return navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    }

    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body,
      // The abandonment path can still fire while the tab is being hidden.
      keepalive: true,
    });
    return true;
  } catch {
    // Saving the kifu is a background nicety; the game keeps working.
    return false;
  }
}
