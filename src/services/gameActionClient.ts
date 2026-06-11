/**
 * Client for the backend's `gameAction` Cloud Function dispatcher.
 *
 * One HTTPS endpoint, action discriminator in the body. See the matching
 * backend handler at:
 *   Yudai-new-portfolio-backend-ts:functions/src/gameRoom/dispatcher.ts
 *
 * Territory Number and Bigger Number rooms route through this client.
 * The remaining multiplayer games keep using `gameRoomService.ts` (Next.js
 * API routes) until they're migrated.
 */

import { fetchCloudFunction } from '@/lib/cloudFunctionFetch';
import { ensureGameSignIn } from '@/lib/gameAuth';
import { getCloudFunctionUrl } from '@/app/api/constants';
import type {
  GameRoom,
  CreateRoomResponse,
  JoinRoomResponse,
  GenericResponse,
  ReadyResponse,
} from './gameRoomService';

const ENDPOINT = getCloudFunctionUrl('gameAction');

interface GameActionRequest {
  action:
    | 'createRoom'
    | 'joinRoom'
    | 'leaveRoom'
    | 'setReady'
    | 'setRules'
    | 'startGame'
    | 'submitAction'
    | 'getRoom';
  [key: string]: unknown;
}

async function call<T>(payload: GameActionRequest): Promise<T> {
  // Phase 2: the dispatcher requires a Firebase ID token. Guests are
  // signed in anonymously (no signup) before their first action.
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const user = await ensureGameSignIn();
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  } catch (error) {
    // Proceed without a token; the server replies with a clear 401.
    console.error('[gameAction] sign-in failed:', error);
  }

  const res = await fetchCloudFunction(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  // The CF returns JSON for both success and error responses (with
  // success: false + error: string in the latter case). Parse either way;
  // surface non-2xx as `{success: false, error}` so callers don't need
  // double error handling.
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { success: false, error: `HTTP ${res.status}` } as T;
  }
  if (!res.ok) {
    // If the CF already shaped it as {success: false, ...}, pass through.
    if (body && typeof body === 'object' && 'success' in body && (body as { success: unknown }).success === false) {
      return body as T;
    }
    // Otherwise normalize so callers can rely on the success flag, even
    // when the server returned a bare `{error: "..."}` (or a non-object).
    const errMsg = body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `HTTP ${res.status}`;
    return { success: false, error: errMsg } as T;
  }
  return body as T;
}

// ---- Room CRUD ------------------------------------------------------------

export function createRoom(args: {
  playerId: string;
  playerName: string;
  password: string;
  gameType: string;
  rules?: unknown;
}): Promise<CreateRoomResponse> {
  return call<CreateRoomResponse>({ action: 'createRoom', ...args });
}

export function joinRoom(args: {
  roomId: string;
  playerId: string;
  playerName: string;
  password: string;
}): Promise<JoinRoomResponse> {
  return call<JoinRoomResponse>({ action: 'joinRoom', ...args });
}

export function leaveRoom(args: {
  roomId: string;
  playerId: string;
}): Promise<GenericResponse & { roomDeleted?: boolean }> {
  return call<GenericResponse & { roomDeleted?: boolean }>({ action: 'leaveRoom', ...args });
}

export function setReady(args: {
  roomId: string;
  playerId: string;
  ready: boolean;
}): Promise<ReadyResponse> {
  return call<ReadyResponse>({ action: 'setReady', ...args });
}

export function setRules(args: {
  roomId: string;
  playerId: string;
  rules: unknown;
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'setRules', ...args });
}

export function startGame(args: {
  roomId: string;
  playerId: string;
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'startGame', ...args });
}

export function getRoom(args: { roomId: string }): Promise<{ success: boolean; room?: GameRoom; error?: string }> {
  return call<{ success: boolean; room?: GameRoom; error?: string }>({ action: 'getRoom', ...args });
}

// ---- Game-specific moves --------------------------------------------------

/**
 * Territory Number `submitAction`. Server validates that this is the
 * caller's turn, the cell is empty, the card is still in the pool, and
 * the turn index matches expected.
 */
export function submitTerritoryNumberMove(args: {
  roomId: string;
  playerId: string;
  card: number;
  cellIndex: number;
  turn: number;
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'submitAction', ...args });
}

/**
 * Bigger Number — pick the card you'll reveal this round. If both players
 * have picks the server resolves the round in the same call (atomically).
 */
export function submitBiggerNumberPick(args: {
  roomId: string;
  playerId: string;
  round: number;
  card: number | 'dragon';
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'submitAction', type: 'pick', ...args });
}

/**
 * Bigger Number — acknowledge the round-reveal hold and advance to the
 * next round (or finish the match). Idempotent: either player may call
 * after `REVEAL_HOLD_MS`; the first wins, the second is a no-op.
 */
export function advanceBiggerNumberRound(args: {
  roomId: string;
  playerId: string;
  round: number;
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'submitAction', type: 'advance', ...args });
}

/**
 * Othello — place a disc at 1-indexed (x, y). Server validates that the
 * cell is empty, that it's the caller's colour (host = black, joiner =
 * white), that `turn` matches the current `turnNumber`, and that the
 * move actually flips at least one disc; auto-passes the opponent if
 * they have no legal reply and ends the match when neither side can move.
 */
export function submitOthelloMove(args: {
  roomId: string;
  playerId: string;
  x: number;
  y: number;
  turn: number;
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'submitAction', ...args });
}

/**
 * Shichinarabe — play a card from hand. Server validates that it's the
 * caller's turn, that the card is in their hand, and that it's adjacent
 * to the current run for that suit. Auto-advances to the next active
 * player and ends the match if everyone has finished or been eliminated.
 */
export function submitShichinarabePlay(args: {
  roomId: string;
  playerId: string;
  cardId: string;
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'submitAction', type: 'play', ...args });
}

/**
 * Shichinarabe — pass your turn. Server increments the caller's pass
 * count, eliminates them when the count hits `maxPasses`, and ends the
 * match if no active player remains.
 */
export function submitShichinarabePass(args: {
  roomId: string;
  playerId: string;
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'submitAction', type: 'pass', ...args });
}

/**
 * Doubt — play 1–4 face-down cards declaring them as the required rank.
 * Server validates that it's the caller's turn, that the phase is
 * `play`, that the cards are in the caller's hand, and stores them in
 * the pile + a `pendingClaim` for the next active player to accept or
 * doubt.
 */
export function submitDoubtPlay(args: {
  roomId: string;
  playerId: string;
  cardIds: string[];
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'submitAction', type: 'play', ...args });
}

/**
 * Doubt — accept the pending claim (no challenge). Server clears
 * `pendingClaim`, marks the claimant as finished if they went out, and
 * advances to the next active player.
 */
export function submitDoubtAccept(args: {
  roomId: string;
  playerId: string;
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'submitAction', type: 'accept', ...args });
}

/**
 * Doubt — challenge the pending claim. Server reveals the played
 * cards: if the claim was truthful the doubter takes the pile;
 * otherwise the claimant does. The pile taker plays next.
 */
export function submitDoubtDoubt(args: {
  roomId: string;
  playerId: string;
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'submitAction', type: 'doubt', ...args });
}

/**
 * Daifugo — play 1+ cards. Server validates the play shape (group /
 * straight), applies shibari / revolution / 8-cut / 11-back / 7-give /
 * 10-discard rules, and advances the turn (skipping eliminated /
 * skip-affected players).
 */
export function submitDaifugoPlay(args: {
  roomId: string;
  playerId: string;
  cardIds: string[];
  giveCardIds?: string[];   // 7-give: which cards to hand to the next player
  discardCardIds?: string[]; // 10-discard: which cards to drop
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'submitAction', type: 'play', ...args });
}

/**
 * Daifugo — pass. Server records the pass; when everyone except the
 * last player has passed the table clears and the last player leads
 * the next trick.
 */
export function submitDaifugoPass(args: {
  roomId: string;
  playerId: string;
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'submitAction', type: 'pass', ...args });
}

/**
 * kuizu — submit an answer for the current question. Server validates
 * the phase is `question` and the questionIdx matches, scores the
 * answer (correctness + time + streak bonuses), and flips to
 * `answer_reveal` once everyone has answered.
 */
export function submitKuizuAnswer(args: {
  roomId: string;
  playerId: string;
  questionIdx: number;
  answer: string;
  answerTime: number;
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'submitAction', type: 'answer', ...args });
}

/**
 * kuizu — host advances past `answer_reveal` / `scoreboard` to the
 * next question, or to `results` after the last question.
 */
export function submitKuizuNext(args: {
  roomId: string;
  playerId: string;
}): Promise<GenericResponse> {
  return call<GenericResponse>({ action: 'submitAction', type: 'next', ...args });
}
