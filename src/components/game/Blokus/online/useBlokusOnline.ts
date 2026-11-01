/**
 * Blokus online: one room, read live from RTDB, written through the `gameAction`
 * Cloud Function, which holds the rules. Nothing here is optimistic: the board
 * changes when the server's state arrives, and a refused move comes back as
 * `error`, a code for `errorText` in ./strings.
 *
 * The player id and the room stay in localStorage, so a phone that slept or a
 * page that reloaded rejoins by itself.
 */

'use client';

import { onDisconnect, onValue, ref, remove, set } from 'firebase/database';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureGameSignIn } from '@/lib/gameAuth';
import { getFirebaseDatabase, subscribeToPath } from '@/lib/firebaseRealtimeDb';
import * as gameActionClient from '@/services/gameActionClient';
import { generatePlayerId, type GenericResponse, type LobbyState } from '@/services/gameRoomService';
import type { GameState, Mode } from '../engine';
import type { Seating } from '../seating';
import {
  inviteUrl,
  leftSeatsOf,
  parseInvite,
  parseMoves,
  parseSeats,
  parseWinners,
  randomKey,
  replay,
  seatToPlay,
  toSeating,
  type BlokusRoom,
  type Invite,
} from './wire';

const PLAYER_ID_KEY = 'blokusPlayerId';
const SESSION_KEY = 'blokusOnlineSession';
const NAME_KEY = 'blokusPlayerName';

/** The joinRoom answers that mean this room is no use to us any more. */
const GONE = ['Room not found', 'Incorrect password', 'Game already in progress', 'Room is full'];
/** Give the player whose turn it is a moment past the limit, and space the others out. */
const CLAIM_GRACE_MS = 800;
const CLAIM_SPACING_MS = 300;
const CLAIM_RETRY_MS = 2000;

interface Session {
  roomId: string;
  password: string;
  name: string;
}

const readStored = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: string | null): void => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse: the game still works, it just can't rejoin after a reload.
  }
};

const readSession = (): Session | null => {
  try {
    const session = JSON.parse(readStored(SESSION_KEY) ?? 'null') as Session | null;
    return session?.roomId && session.password ? session : null;
  } catch {
    return null;
  }
};

const failure = (error: unknown): GenericResponse => ({
  success: false,
  error: error instanceof Error ? error.message : 'Network error',
});

export interface UseBlokusOnlineReturn {
  /** An online room is open (or being rejoined): the page should show it rather than the solo game. */
  active: boolean;
  lobbyState: LobbyState;
  /** Coming back to a room after a reload, rather than joining one from the form. */
  rejoining: boolean;
  playerId: string;
  roomId: string | null;
  room: BlokusRoom | null;
  isHost: boolean;
  mode: Mode | null;
  /** A code or server message. Show it with `errorText`. */
  error: string | null;
  clearError: () => void;
  /** The invite this page was opened with. */
  invite: Invite | null;
  /** Turn the invite down, for the page behind it. */
  dismissInvite: () => void;
  /** The link to send friends, once in a room. */
  shareUrl: string | null;
  /** The room's password, for reading out instead of the link. */
  roomKey: string | null;
  savedName: string;

  seating: Seating | null;
  /** This player's seat, or -1. */
  mySeat: number;
  /** Seats whose player left mid-game. */
  leftSeats: number[];
  /** The seat to play now, or -1. Use this rather than `seatFor`: see `seatToPlay`. */
  currentSeat: number;
  /** Rebuilt from the moves, and a new object only when they change. Null until the game starts. */
  game: GameState | null;
  /** Each colour's last move, -1 before its first, for the board's highlight. */
  latestMoves: number[];
  /** The winning seats, once over. More than one is a tie. */
  winners: number[];
  isMyTurn: boolean;
  /** When this turn runs out, on this device's clock, or null. */
  turnDeadline: number | null;
  /** Whether a player has the room open. Absent until known. */
  presence: Record<string, boolean>;
  /** A move is on its way. */
  sending: boolean;

  create: (mode: Mode, name: string) => Promise<boolean>;
  join: (code: string, password: string, name: string) => Promise<boolean>;
  pickColor: (color: number) => Promise<boolean>;
  setReady: (ready: boolean) => Promise<boolean>;
  start: () => Promise<boolean>;
  submitMove: (move: number) => Promise<boolean>;
  /** Any member may call it once the turn is up. The hook does so by itself; this is for a "skip" button. */
  claimTimeout: () => Promise<boolean>;
  leave: () => Promise<void>;
  rematch: () => Promise<boolean>;
}

export function useBlokusOnline(): UseBlokusOnlineReturn {
  const [playerId, setPlayerId] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<BlokusRoom | null>(null);
  const [connecting, setConnecting] = useState<'creating' | 'joining' | null>(null);
  const [rejoining, setRejoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [savedName, setSavedName] = useState('');
  const [clockOffset, setClockOffset] = useState(0);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  const roomId = session?.roomId ?? null;

  const openSession = useCallback((next: Session) => {
    writeStored(SESSION_KEY, JSON.stringify(next));
    writeStored(NAME_KEY, next.name);
    setSession(next);
    setSavedName(next.name);
    setInvite(null);
    // The key has done its job in the address bar, where it would stay in the history.
    if (window.location.search) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  const closeSession = useCallback(() => {
    writeStored(SESSION_KEY, null);
    setSession(null);
    setRoom(null);
  }, []);

  // localStorage and the address bar only exist in the browser, so this runs
  // after hydration rather than in the state initialisers.
  useEffect(() => {
    let cancelled = false;
    let id = readStored(PLAYER_ID_KEY);
    if (!id) {
      id = generatePlayerId();
      writeStored(PLAYER_ID_KEY, id);
    }
    setPlayerId(id);
    setSavedName(readStored(NAME_KEY) ?? '');

    const opened = parseInvite(window.location.search);
    const stored = readSession();
    const rejoin = stored && (!opened || opened.roomId === stored.roomId) ? stored : null;
    if (opened && !rejoin) setInvite(opened);
    if (!rejoin) return undefined;

    setRejoining(true);
    gameActionClient
      .joinRoom({ roomId: rejoin.roomId, playerId: id, playerName: rejoin.name, password: rejoin.password })
      .then((result) => {
        if (cancelled) return;
        setRejoining(false);
        if (result.success) {
          openSession(rejoin);
        } else if (GONE.includes(result.error ?? '')) {
          writeStored(SESSION_KEY, null);
          if (opened) setInvite(opened);
        } else {
          setError(result.error ?? 'Network error');
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setRejoining(false);
        setError(failure(caught).error ?? 'Network error');
      });
    return () => {
      cancelled = true;
    };
  }, [openSession]);

  // The room itself. RTDB reads need no sign-in.
  useEffect(() => {
    if (!roomId) return undefined;
    return subscribeToPath<BlokusRoom>(`gameRooms/${roomId}`, (data) => {
      if (data?.players?.[playerId]) {
        setRoom(data);
        return;
      }
      closeSession();
      setError('Room was closed');
    });
  }, [roomId, playerId, closeSession]);

  // How far this device's clock is from the server's, so the deadline shown is the one the server keeps.
  useEffect(() => {
    if (!roomId) return undefined;
    return subscribeToPath<number>('.info/serverTimeOffset', (offset) => setClockOffset(offset ?? 0));
  }, [roomId]);

  // Who has the room open: set while connected, and RTDB clears it when the connection drops.
  useEffect(() => {
    if (!roomId || !playerId) return undefined;
    const db = getFirebaseDatabase();
    const here = ref(db, `gameRooms/${roomId}/presence/${playerId}`);
    let disposed = false;
    const announce = async () => {
      try {
        await ensureGameSignIn();
        await onDisconnect(here).remove();
        if (!disposed) await set(here, true);
      } catch {
        // The dot just stays off: refused once the room has gone, and nothing relies on it.
      }
    };
    const stopWatching = onValue(ref(db, '.info/connected'), (connected) => {
      if (connected.val() === true) void announce();
    });
    return () => {
      disposed = true;
      stopWatching();
      void onDisconnect(here).cancel().catch(() => undefined);
      void remove(here).catch(() => undefined);
    };
  }, [roomId, playerId]);

  const state = room?.gameState;
  const mode = state?.mode ?? room?.rules?.mode ?? null;
  const movesJson = state?.movesJson;
  const seatsJson = state?.seatsJson ?? room?.seatsJson;
  const winnersJson = state?.winnersJson;
  const turnNumber = state?.turnNumber ?? null;

  const wire = useMemo(() => parseSeats(seatsJson), [seatsJson]);
  const seating = useMemo(() => (mode && wire ? toSeating(mode, wire) : null), [mode, wire]);
  const leftSeats = useMemo(() => (wire ? leftSeatsOf(wire) : []), [wire]);
  const replayed = useMemo(() => (mode && movesJson !== undefined ? replay(mode, parseMoves(movesJson)) : null), [mode, movesJson]);
  const winners = useMemo(() => parseWinners(winnersJson), [winnersJson]);

  const game = replayed?.game ?? null;
  const playing = room?.status === 'playing' && !!game && !game.over;
  const mySeat = wire?.seats.findIndex((seat) => seat.id === playerId) ?? -1;
  const currentSeat = playing && seating ? seatToPlay(seating, game, leftSeats) : -1;
  const isMyTurn = currentSeat >= 0 && currentSeat === mySeat;
  const turnDeadline = playing && state ? state.turnStartedAt + state.turnLimitMs - clockOffset : null;

  // A dropped player must not hang the game, so every client claims a turn
  // that has run out. The server checks the time itself and takes the first
  // claim; the later ones are refused as stale, and are meant to be.
  useEffect(() => {
    if (!roomId || turnDeadline === null || turnNumber === null) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const claim = async () => {
      try {
        await gameActionClient.claimBlokusTimeout({ roomId, playerId, turn: turnNumber });
      } catch {
        // Offline for now. The retry below is what gets the game going again.
      }
      // Success or not, the next state cancels this. Until it does, try again.
      if (!cancelled) timer = setTimeout(claim, CLAIM_RETRY_MS);
    };
    const wait = turnDeadline - Date.now() + CLAIM_GRACE_MS + Math.max(0, mySeat) * CLAIM_SPACING_MS;
    timer = setTimeout(claim, Math.max(0, wait));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [roomId, playerId, turnNumber, turnDeadline, mySeat]);

  // A refusal is about a board that has gone once the next turn is up.
  useEffect(() => setError(null), [turnNumber]);

  const settled = useCallback(async (send: () => Promise<GenericResponse>): Promise<boolean> => {
    let result: GenericResponse;
    try {
      result = await send();
    } catch (caught) {
      result = failure(caught);
    }
    setError(result.success ? null : result.error ?? 'Network error');
    return result.success;
  }, []);

  const create = useCallback(
    async (nextMode: Mode, name: string): Promise<boolean> => {
      setConnecting('creating');
      setError(null);
      const password = randomKey();
      let created: Awaited<ReturnType<typeof gameActionClient.createRoom>>;
      try {
        created = await gameActionClient.createRoom({ playerId, playerName: name, password, gameType: 'blokus', rules: { mode: nextMode } });
      } catch (caught) {
        created = failure(caught);
      }
      setConnecting(null);
      if (!created.success || !created.roomId) {
        setError(created.error ?? 'Network error');
        return false;
      }
      openSession({ roomId: created.roomId, password, name });
      return true;
    },
    [playerId, openSession],
  );

  const join = useCallback(
    async (code: string, password: string, name: string): Promise<boolean> => {
      const target = code.trim().toUpperCase();
      setConnecting('joining');
      setError(null);
      let joined: GenericResponse;
      try {
        joined = await gameActionClient.joinRoom({ roomId: target, playerId, playerName: name, password });
      } catch (caught) {
        joined = failure(caught);
      }
      setConnecting(null);
      if (!joined.success) {
        setError(joined.error ?? 'Network error');
        return false;
      }
      // Followed a new invite while still seated elsewhere: free that seat.
      const previous = readSession();
      if (previous && previous.roomId !== target) {
        void gameActionClient.leaveRoom({ roomId: previous.roomId, playerId }).catch(() => undefined);
      }
      openSession({ roomId: target, password, name });
      return true;
    },
    [playerId, openSession],
  );

  const pickColor = useCallback(
    (color: number) => settled(() => gameActionClient.pickBlokusColor({ roomId: roomId ?? '', playerId, color })),
    [settled, roomId, playerId],
  );

  const setReady = useCallback(
    (ready: boolean) => settled(() => gameActionClient.setReady({ roomId: roomId ?? '', playerId, ready })),
    [settled, roomId, playerId],
  );

  const start = useCallback(
    () => settled(() => gameActionClient.startGame({ roomId: roomId ?? '', playerId })),
    [settled, roomId, playerId],
  );

  const submitMove = useCallback(
    async (move: number): Promise<boolean> => {
      // A double tap must not send the same turn twice: the second would come back as an error.
      if (!roomId || turnNumber === null || sendingRef.current) return false;
      sendingRef.current = true;
      setSending(true);
      const sent = await settled(() => gameActionClient.submitBlokusMove({ roomId, playerId, move, turn: turnNumber }));
      sendingRef.current = false;
      setSending(false);
      return sent;
    },
    [settled, roomId, playerId, turnNumber],
  );

  const claimTimeout = useCallback(async (): Promise<boolean> => {
    if (!roomId || turnNumber === null) return false;
    return settled(() => gameActionClient.claimBlokusTimeout({ roomId, playerId, turn: turnNumber }));
  }, [settled, roomId, playerId, turnNumber]);

  const leave = useCallback(async (): Promise<void> => {
    const leaving = roomId;
    closeSession();
    setError(null);
    // Already gone from this page's point of view. If the server never hears, the turn limit deals with the seat.
    if (leaving) await gameActionClient.leaveRoom({ roomId: leaving, playerId }).catch(() => undefined);
  }, [closeSession, roomId, playerId]);

  const rematch = useCallback(
    () => settled(() => gameActionClient.rematchBlokus({ roomId: roomId ?? '', playerId })),
    [settled, roomId, playerId],
  );

  const clearError = useCallback(() => setError(null), []);

  const dismissInvite = useCallback(() => {
    setInvite(null);
    setError(null);
    // Or a reload would bring it straight back.
    if (window.location.search) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  const lobbyState: LobbyState =
    connecting ??
    (!room
      ? roomId || rejoining
        ? 'joining'
        : 'idle'
      : room.status === 'playing'
        ? 'playing'
        : room.status === 'finished'
          ? 'finished'
          : room.players[playerId]?.ready
            ? 'ready'
            : 'waiting');

  return {
    active: !!roomId || rejoining,
    lobbyState,
    rejoining: rejoining || (!!roomId && !room),
    playerId,
    roomId,
    room,
    isHost: !!room && room.hostId === playerId,
    mode,
    error,
    clearError,
    invite,
    dismissInvite,
    shareUrl: session ? inviteUrl(window.location.origin, session.roomId, session.password) : null,
    roomKey: session?.password ?? null,
    savedName,
    seating,
    mySeat,
    leftSeats,
    currentSeat,
    game,
    latestMoves: replayed?.latest ?? [],
    winners,
    isMyTurn,
    turnDeadline,
    presence: room?.presence ?? {},
    sending,
    create,
    join,
    pickColor,
    setReady,
    start,
    submitMove,
    claimTimeout,
    leave,
    rematch,
  };
}
