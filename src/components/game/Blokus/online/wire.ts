/**
 * What an online Blokus room looks like on the wire, and how to read it.
 *
 * RTDB strips `[]` and `null`, so the moves and the seats travel as JSON strings.
 * The moves are the whole game: the client rebuilds the state by replaying them
 * with the same newGame / applyMove / passTurn as the server, so the two agree by
 * construction. The server's half of this file is the backend's
 * functions/src/gameRoom/games/blokusRoom.ts.
 */

import type { GameRoom, MultiplayerPlayer } from '@/services/gameRoomService';
import { PASS, applyMove, newGame, passTurn, type GameState, type Mode } from '../engine';
import { SHARED, ownerOf, type Seating } from '../seating';

export interface WireSeat {
  /** Empty for the seat waiting opposite a lone host. */
  id: string;
  name: string;
  colors: number[];
  /** Left mid-game: their colours pass from now on. */
  left?: boolean;
}

export interface WireSeating {
  seats: WireSeat[];
  shared: number | null;
}

export interface BlokusNetworkState {
  version: 1;
  mode: Mode;
  movesJson: string;
  seatsJson: string;
  /** Which of the room's games this is. Sent with a move, as a rematch starts `turnNumber` over. */
  matchId: number;
  /** The length of the move list. A move is sent with it, so one made against an old board is refused. */
  turnNumber: number;
  /** The seat that plays the shared colour next: the server keeps it, as who has left isn't in the moves. */
  sharedTurnSeat: number;
  turnStartedAt: number;
  turnLimitMs: number;
  gameOver: boolean;
  winnersJson: string;
  startedAt: number;
  lastUpdate: number;
}

export interface BlokusRoom extends GameRoom<BlokusNetworkState> {
  gameType: 'blokus';
  rules?: { mode: Mode };
  /** The seats in the lobby. The game's own copy is in `gameState.seatsJson`. */
  seatsJson?: string;
  /** Who has the room open now. Only a courtesy: nothing depends on it. */
  presence?: Record<string, boolean>;
  players: Record<string, MultiplayerPlayer>;
}

export const parseMoves = (json: string | undefined): number[] => {
  try {
    const moves: unknown = JSON.parse(json ?? '');
    return Array.isArray(moves) && moves.every((move) => Number.isSafeInteger(move)) ? (moves as number[]) : [];
  } catch {
    return [];
  }
};

export const parseSeats = (json: string | undefined): WireSeating | null => {
  try {
    const wire = JSON.parse(json ?? '') as WireSeating | null;
    return Array.isArray(wire?.seats) ? wire : null;
  } catch {
    return null;
  }
};

export const parseWinners = (json: string | undefined): number[] => parseMoves(json);

export interface Replayed {
  game: GameState;
  /** Each colour's last move, -1 before its first: the board's `latest` highlight. */
  latest: number[];
}

/** Rebuild the game. */
export const replay = (mode: Mode, moves: readonly number[]): Replayed => {
  const game = newGame(mode);
  const latest = Array.from({ length: game.rules.colors }, () => -1);
  for (const move of moves) {
    if (game.over) break;
    if (move === PASS) {
      passTurn(game);
      continue;
    }
    latest[game.toMove] = move;
    applyMove(game, move);
  }
  return { game, latest };
};

export const toSeating = (mode: Mode, wire: WireSeating): Seating => ({
  mode,
  shared: wire.shared,
  seats: wire.seats.map(({ id, name, colors }) => ({
    colors,
    controller: id ? { kind: 'human', id, name } : { kind: 'human' },
  })),
});

export const leftSeatsOf = (wire: WireSeating): number[] =>
  wire.seats.flatMap((seat, index) => (seat.left ? [index] : []));

/**
 * The seat to play now: the colour's owner, or for the shared colour the seat the
 * server says. Read this rather than `seatFor` online: after someone leaves, the
 * rotation can't be worked out from the pieces played.
 */
export const seatToPlay = (seating: Seating, game: GameState, sharedTurnSeat: number): number => {
  const owner = ownerOf(seating, game.toMove);
  return owner === SHARED ? sharedTurnSeat : owner;
};

export const INVITE_PATH = '/games/blokus';

export const inviteUrl = (origin: string, roomId: string, key: string): string =>
  `${origin}${INVITE_PATH}?room=${encodeURIComponent(roomId)}&key=${encodeURIComponent(key)}`;

export interface Invite {
  roomId: string;
  key: string;
}

/** The invite in a page's query string. A code without its key still fills the code in. */
export const parseInvite = (search: string): Invite | null => {
  const params = new URLSearchParams(search);
  const roomId = params.get('room')?.trim().toUpperCase();
  return roomId ? { roomId, key: params.get('key')?.trim() ?? '' } : null;
};

const KEY_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

/** The room's password: nobody types it unless they want to, so it can be long enough. Without 0/O and 1/l for those who do. */
export const randomKey = (length = 10): string =>
  Array.from(crypto.getRandomValues(new Uint32Array(length)), (value) => KEY_CHARS[value % KEY_CHARS.length]).join('');
