/**
 * Bigger Number — multiplayer hook (Phase 1 CF migration).
 *
 * All writes route through the `gameAction` Cloud Function via
 * `gameActionClient`. The CF is the single writer of `gameRooms/*`; this
 * hook keeps the RTDB `onSnapshot` subscription for real-time reads so
 * UI updates stay snappy.
 *
 * The old "host browser advances state" loop is gone — both picks land via
 * `submitBiggerNumberPick`, the CF resolves the round atomically, and
 * either player can call `advanceRound` after the reveal hold.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as gameActionClient from '@/services/gameActionClient';
import { generatePlayerId, type MultiplayerContext } from '@/services/gameRoomService';
import { subscribeToPath } from '@/lib/firebaseRealtimeDb';
import type {
  BiggerNumberGameRoom,
  BiggerNumberNetworkState,
  BiggerNumberPendingActions,
} from './multiplayerTypes';
import type { BiggerNumberRules, CardValue } from './types';

const PLAYER_ID_KEY = 'biggerNumberPlayerId';

/**
 * RTDB strips fields whose value is `null` or `[]` or empty object, so a
 * fresh game's `scores`, `hands`, `pendingPicks`, `log`, and `winnerId`
 * would all be missing on the wire. The CF therefore stringifies `scores`
 * and `hands` (which would collapse on round 1 because all values are 0 /
 * empty arrays). We rehydrate here and fill the other strippable fields
 * with sane defaults so callers can treat the result as a complete
 * `BiggerNumberNetworkState`.
 */
type WireState = Partial<BiggerNumberNetworkState> & {
  scoresJson?: string;
  handsJson?: string;
  pendingPicks?: BiggerNumberPendingActions;
};

function rehydrateGameState(raw: WireState | null | undefined): BiggerNumberNetworkState | null {
  if (!raw) return null;
  const base = raw as BiggerNumberNetworkState;
  let scores = base.scores;
  if (!scores && typeof raw.scoresJson === 'string') {
    try { scores = JSON.parse(raw.scoresJson); } catch { /* leave undefined */ }
  }
  let hands = base.hands;
  if (!hands && typeof raw.handsJson === 'string') {
    try { hands = JSON.parse(raw.handsJson); } catch { /* leave undefined */ }
  }
  return {
    ...base,
    scores: scores ?? {},
    hands: hands ?? {},
    log: base.log ?? [],
    winnerId: base.winnerId ?? null,
    lastReveal: base.lastReveal ?? null,
  };
}

export interface UseBiggerNumberMultiplayerReturn {
  context: MultiplayerContext;
  room: BiggerNumberGameRoom | null;
  otherPlayerId: string | null;
  otherPlayerName: string | null;
  gameState: BiggerNumberNetworkState | null;
  pendingActions: BiggerNumberPendingActions | null;

  createRoom: (
    playerName: string,
    password: string,
    rules: BiggerNumberRules
  ) => Promise<boolean>;
  joinRoom: (roomId: string, playerName: string, password: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<boolean>;
  startGame: () => Promise<boolean>;
  updateRules: (rules: BiggerNumberRules) => Promise<void>;
  submitPick: (card: CardValue, round: number) => Promise<{ success: boolean; error?: string }>;
  advanceRound: (round: number) => Promise<{ success: boolean; error?: string }>;
  resetMultiplayer: () => void;
}

export function useBiggerNumberMultiplayer(): UseBiggerNumberMultiplayerReturn {
  const [playerId] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(PLAYER_ID_KEY);
      if (stored) return stored;
      const newId = generatePlayerId();
      localStorage.setItem(PLAYER_ID_KEY, newId);
      return newId;
    }
    return generatePlayerId();
  });

  const [context, setContext] = useState<MultiplayerContext>({
    roomId: null,
    playerId,
    playerName: '',
    isHost: false,
    room: null,
    lobbyState: 'idle',
    error: null,
  });

  const [room, setRoom] = useState<BiggerNumberGameRoom | null>(null);
  const [gameState, setGameState] = useState<BiggerNumberNetworkState | null>(null);

  // Realtime room subscription (RTDB reads only; writes go via CF).
  useEffect(() => {
    if (!context.roomId) return;
    const unsub = subscribeToPath<BiggerNumberGameRoom & { gameState?: WireState }>(
      `gameRooms/${context.roomId}`,
      (roomData) => {
        if (!roomData) {
          setContext((prev) => ({
            ...prev,
            roomId: null,
            room: null,
            lobbyState: 'idle',
            error: 'Room was closed',
          }));
          setRoom(null);
          setGameState(null);
          return;
        }
        const rehydratedState = rehydrateGameState(roomData.gameState);
        const rehydratedRoom = (
          rehydratedState
            ? { ...roomData, gameState: rehydratedState }
            : roomData
        ) as unknown as BiggerNumberGameRoom;
        setRoom(rehydratedRoom);
        setGameState(rehydratedState);
        setContext((prev) => ({
          ...prev,
          room: rehydratedRoom as unknown as MultiplayerContext['room'],
          lobbyState:
            rehydratedRoom.status === 'playing'
              ? 'playing'
              : rehydratedRoom.status === 'finished'
              ? 'finished'
              : prev.lobbyState,
        }));
      },
    );
    return unsub;
  }, [context.roomId]);

  const otherPlayer = useMemo(() => {
    if (!room) return null;
    return Object.values(room.players || {}).find((p) => p.id !== context.playerId) || null;
  }, [room, context.playerId]);

  const otherPlayerId = otherPlayer?.id ?? null;
  const otherPlayerName = otherPlayer?.name ?? null;

  // The CF now stores in-flight picks under `gameState.pendingPicks` (so
  // they're transactionally consistent with the rest of the state). Expose
  // them under the existing `pendingActions` name so the UI code reads
  // unchanged.
  const pendingActions = (gameState as (BiggerNumberNetworkState & { pendingPicks?: BiggerNumberPendingActions }) | null)
    ?.pendingPicks ?? null;

  const createRoom = useCallback(
    async (playerName: string, password: string, rules: BiggerNumberRules): Promise<boolean> => {
      setContext((prev) => ({ ...prev, lobbyState: 'creating', error: null, playerName }));
      try {
        const result = await gameActionClient.createRoom({
          playerId,
          playerName,
          password,
          gameType: 'bigger-number',
          rules,
        });
        if (result.success && result.roomId) {
          setContext((prev) => ({
            ...prev,
            roomId: result.roomId!,
            isHost: true,
            room: result.room || null,
            lobbyState: 'waiting',
          }));
          return true;
        }
        setContext((prev) => ({
          ...prev,
          lobbyState: 'idle',
          error: result.error || 'Failed to create room',
        }));
        return false;
      } catch {
        setContext((prev) => ({ ...prev, lobbyState: 'idle', error: 'Network error' }));
        return false;
      }
    },
    [playerId],
  );

  const joinRoom = useCallback(
    async (roomId: string, playerName: string, password: string): Promise<boolean> => {
      setContext((prev) => ({ ...prev, lobbyState: 'joining', error: null, playerName }));
      try {
        const result = await gameActionClient.joinRoom({
          roomId,
          playerId,
          playerName,
          password,
        });
        if (result.success && result.room) {
          setContext((prev) => ({
            ...prev,
            roomId,
            isHost: false,
            room: result.room || null,
            lobbyState: 'waiting',
          }));
          return true;
        }
        setContext((prev) => ({
          ...prev,
          lobbyState: 'idle',
          error: result.error || 'Failed to join room',
        }));
        return false;
      } catch {
        setContext((prev) => ({ ...prev, lobbyState: 'idle', error: 'Network error' }));
        return false;
      }
    },
    [playerId],
  );

  const leaveRoom = useCallback(async (): Promise<void> => {
    if (!context.roomId) return;
    try {
      await gameActionClient.leaveRoom({ roomId: context.roomId, playerId });
    } catch {
      // ignore
    }
    setContext((prev) => ({
      ...prev,
      roomId: null,
      isHost: false,
      room: null,
      lobbyState: 'idle',
      error: null,
    }));
    setRoom(null);
    setGameState(null);
  }, [context.roomId, playerId]);

  const setReady = useCallback(
    async (ready: boolean): Promise<boolean> => {
      if (!context.roomId) return false;
      try {
        const result = await gameActionClient.setReady({
          roomId: context.roomId,
          playerId,
          ready,
        });
        if (result.success) {
          setContext((prev) => ({ ...prev, lobbyState: ready ? 'ready' : 'waiting' }));
          return Boolean(result.allReady);
        }
        return false;
      } catch {
        return false;
      }
    },
    [context.roomId, playerId],
  );

  const startGame = useCallback(async (): Promise<boolean> => {
    if (!context.roomId || !context.isHost) return false;
    try {
      const result = await gameActionClient.startGame({
        roomId: context.roomId,
        playerId,
      });
      if (result.success) {
        setContext((prev) => ({ ...prev, lobbyState: 'playing' }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [context.roomId, context.isHost, playerId]);

  const updateRules = useCallback(
    async (nextRules: BiggerNumberRules): Promise<void> => {
      if (!context.roomId || !context.isHost) return;
      try {
        await gameActionClient.setRules({
          roomId: context.roomId,
          playerId,
          rules: nextRules,
        });
      } catch {
        // ignore — caller will see stale rules and can re-edit
      }
    },
    [context.roomId, context.isHost, playerId],
  );

  const submitPick = useCallback(
    async (card: CardValue, round: number): Promise<{ success: boolean; error?: string }> => {
      if (!context.roomId) return { success: false, error: 'No room' };
      try {
        return await gameActionClient.submitBiggerNumberPick({
          roomId: context.roomId,
          playerId,
          round,
          card,
        });
      } catch {
        return { success: false, error: 'Network error' };
      }
    },
    [context.roomId, playerId],
  );

  const advanceRound = useCallback(
    async (round: number): Promise<{ success: boolean; error?: string }> => {
      if (!context.roomId) return { success: false, error: 'No room' };
      try {
        return await gameActionClient.advanceBiggerNumberRound({
          roomId: context.roomId,
          playerId,
          round,
        });
      } catch {
        return { success: false, error: 'Network error' };
      }
    },
    [context.roomId, playerId],
  );

  const resetMultiplayer = useCallback((): void => {
    setContext({
      roomId: null,
      playerId,
      playerName: '',
      isHost: false,
      room: null,
      lobbyState: 'idle',
      error: null,
    });
    setRoom(null);
    setGameState(null);
  }, [playerId]);

  return {
    context,
    room,
    otherPlayerId,
    otherPlayerName,
    gameState,
    pendingActions,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startGame,
    updateRules,
    submitPick,
    advanceRound,
    resetMultiplayer,
  };
}
