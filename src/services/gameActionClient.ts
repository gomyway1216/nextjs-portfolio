/**
 * Client for the backend's `gameAction` Cloud Function dispatcher.
 *
 * One HTTPS endpoint, action discriminator in the body. See the matching
 * backend handler at:
 *   Yudai-new-portfolio-backend-ts:functions/src/gameRoom/dispatcher.ts
 *
 * Currently only Territory Number rooms route through this client.
 * Other multiplayer games keep using `gameRoomService.ts` (Next.js API
 * routes) until they're migrated.
 */

import { fetchCloudFunction } from '@/lib/cloudFunctionFetch';
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
  const res = await fetchCloudFunction(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  if (!res.ok && body && typeof body === 'object' && 'success' in body && (body as { success: unknown }).success !== false) {
    return { success: false, error: `HTTP ${res.status}` } as T;
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
  return call({ action: 'getRoom', ...args });
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
