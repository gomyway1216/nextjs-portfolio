/**
 * Shichinarabe (七並べ) — multiplayer hook (Phase 3c CF migration).
 *
 * All writes route through the `gameAction` Cloud Function via
 * `gameActionClient`. RTDB `onSnapshot` subscription kept for real-time
 * reads. No more host loop: every player calls `submitPlay` /
 * `submitPass` and the CF resolves the move atomically.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { generatePlayerId, type MultiplayerContext } from '@/services/gameRoomService';
import * as gameActionClient from '@/services/gameActionClient';
import { subscribeToPath } from '@/lib/firebaseRealtimeDb';
import type {
  ShichinarabeGameRoom,
  ShichinarabeNetworkState,
} from './multiplayerTypes';
import type { Card, CardSuit } from './types';

const PLAYER_ID_KEY = 'shichinarabePlayerId';

/**
 * Backend stringifies the strippable Record/array fields (RTDB drops
 * fields whose values collapse to nullish — `passCounts: {p1:0,p2:0}` and
 * `finishedOrder: []` would otherwise vanish from a fresh game's state).
 * Rehydrate here so the rest of the UI keeps reading
 * `gameState.hands` / `.log` / etc. unchanged.
 */
type WireState = {
  version?: 1;
  playerOrder?: string[];
  currentTurnPlayerId?: string;
  maxPasses?: number;
  finished?: boolean;
  winnerId?: string | null;
  startedAt?: number;
  lastUpdate?: number;
  table?: Record<CardSuit, { low: number; high: number }>;
  handsJson?: string;
  passCountsJson?: string;
  finishedOrderJson?: string;
  eliminatedOrderJson?: string;
  resultOrderJson?: string;
  ranksJson?: string;
  logJson?: string;
};

function safeParse<T>(s: string | undefined, fallback: T): T {
  if (typeof s !== 'string') return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function rehydrateGameState(raw: WireState | null | undefined): ShichinarabeNetworkState | null {
  if (!raw || !raw.playerOrder || !raw.currentTurnPlayerId) return null;
  return {
    version: 1,
    playerOrder: raw.playerOrder,
    currentTurnPlayerId: raw.currentTurnPlayerId,
    maxPasses: raw.maxPasses ?? 3,
    finished: raw.finished ?? false,
    winnerId: raw.winnerId ?? null,
    startedAt: raw.startedAt ?? 0,
    lastUpdate: raw.lastUpdate ?? 0,
    table: raw.table ?? {
      S: { low: 7, high: 7 }, H: { low: 7, high: 7 },
      D: { low: 7, high: 7 }, C: { low: 7, high: 7 },
    },
    hands: safeParse<Record<string, Card[]>>(raw.handsJson, {}),
    passCounts: safeParse<Record<string, number>>(raw.passCountsJson, {}),
    finishedOrder: safeParse<string[]>(raw.finishedOrderJson, []),
    eliminatedOrder: safeParse<string[]>(raw.eliminatedOrderJson, []),
    resultOrder: safeParse<string[]>(raw.resultOrderJson, []),
    ranks: safeParse<Record<string, number> | null>(raw.ranksJson, null),
    log: safeParse<ShichinarabeNetworkState['log']>(raw.logJson, []),
  };
}

export interface UseShichinarabeMultiplayerReturn {
  context: MultiplayerContext;
  room: ShichinarabeGameRoom | null;
  otherPlayers: Array<{ id: string; name: string }>;
  gameState: ShichinarabeNetworkState | null;
  /** Kept for backwards compat with existing UI checks; always null now
   * (the CF resolves picks inside the same submitAction call). */
  pendingAction: null;
  createRoom: (playerName: string, password: string) => Promise<boolean>;
  joinRoom: (roomId: string, playerName: string, password: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<boolean>;
  startGame: () => Promise<boolean>;
  submitPlay: (cardId: string) => Promise<{ success: boolean; error?: string }>;
  submitPass: () => Promise<{ success: boolean; error?: string }>;
  resetMultiplayer: () => void;
}

export function useShichinarabeMultiplayer(): UseShichinarabeMultiplayerReturn {
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

  const [room, setRoom] = useState<ShichinarabeGameRoom | null>(null);
  const [gameState, setGameState] = useState<ShichinarabeNetworkState | null>(null);

  useEffect(() => {
    if (!context.roomId) return;
    const unsub = subscribeToPath<ShichinarabeGameRoom & { gameState?: WireState }>(
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
        ) as unknown as ShichinarabeGameRoom;
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

  const otherPlayers = useMemo(() => {
    if (!room) return [];
    return Object.values(room.players || {})
      .filter((p) => p.id !== context.playerId)
      .map((p) => ({ id: p.id, name: p.name }));
  }, [room, context.playerId]);

  const createRoom = useCallback(
    async (playerName: string, password: string): Promise<boolean> => {
      setContext((prev) => ({ ...prev, lobbyState: 'creating', error: null, playerName }));
      try {
        const result = await gameActionClient.createRoom({
          playerId,
          playerName,
          password,
          gameType: 'shichinarabe',
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
          ...prev, lobbyState: 'idle',
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
          roomId, playerId, playerName, password,
        });
        if (result.success && result.room) {
          setContext((prev) => ({
            ...prev, roomId, isHost: false,
            room: result.room || null, lobbyState: 'waiting',
          }));
          return true;
        }
        setContext((prev) => ({
          ...prev, lobbyState: 'idle',
          error: result.error || 'Failed to join room',
        }));
        return false;
      } catch (err) {
        setContext((prev) => ({
          ...prev, lobbyState: 'idle',
          error: err instanceof Error ? err.message : 'Network error',
        }));
        return false;
      }
    },
    [playerId],
  );

  const leaveRoom = useCallback(async (): Promise<void> => {
    if (!context.roomId) return;
    try { await gameActionClient.leaveRoom({ roomId: context.roomId, playerId }); } catch { /* ignore */ }
    setContext((prev) => ({
      ...prev, roomId: null, isHost: false,
      room: null, lobbyState: 'idle', error: null,
    }));
    setRoom(null);
    setGameState(null);
  }, [context.roomId, playerId]);

  const setReady = useCallback(
    async (ready: boolean): Promise<boolean> => {
      if (!context.roomId) return false;
      try {
        const result = await gameActionClient.setReady({
          roomId: context.roomId, playerId, ready,
        });
        if (result.success) {
          setContext((prev) => ({ ...prev, lobbyState: ready ? 'ready' : 'waiting' }));
          return Boolean(result.allReady);
        }
        return false;
      } catch { return false; }
    },
    [context.roomId, playerId],
  );

  const startGame = useCallback(async (): Promise<boolean> => {
    if (!context.roomId || !context.isHost) return false;
    try {
      const result = await gameActionClient.startGame({ roomId: context.roomId, playerId });
      if (result.success) {
        setContext((prev) => ({ ...prev, lobbyState: 'playing' }));
        return true;
      }
      return false;
    } catch { return false; }
  }, [context.roomId, context.isHost, playerId]);

  const submitPlay = useCallback(
    async (cardId: string) => {
      if (!context.roomId) return { success: false, error: 'No room' };
      try {
        return await gameActionClient.submitShichinarabePlay({
          roomId: context.roomId, playerId, cardId,
        });
      } catch { return { success: false, error: 'Network error' }; }
    },
    [context.roomId, playerId],
  );

  const submitPass = useCallback(async () => {
    if (!context.roomId) return { success: false, error: 'No room' };
    try {
      return await gameActionClient.submitShichinarabePass({
        roomId: context.roomId, playerId,
      });
    } catch { return { success: false, error: 'Network error' }; }
  }, [context.roomId, playerId]);

  const resetMultiplayer = useCallback((): void => {
    setContext({
      roomId: null, playerId, playerName: '',
      isHost: false, room: null, lobbyState: 'idle', error: null,
    });
    setRoom(null);
    setGameState(null);
  }, [playerId]);

  return {
    context, room, otherPlayers, gameState,
    pendingAction: null,
    createRoom, joinRoom, leaveRoom, setReady, startGame,
    submitPlay, submitPass, resetMultiplayer,
  };
}
