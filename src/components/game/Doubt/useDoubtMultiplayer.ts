/**
 * Doubt (ダウト) — multiplayer hook (Phase 3d CF migration).
 *
 * All writes route through the `gameAction` Cloud Function via
 * `gameActionClient`. RTDB `onSnapshot` subscription kept for real-time
 * reads. Three player-facing actions: `submitPlay(cardIds)`,
 * `submitAccept()`, `submitDoubt()` — the CF resolves the move
 * atomically and broadcasts the new state.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { generatePlayerId, type MultiplayerContext } from '@/services/gameRoomService';
import * as gameActionClient from '@/services/gameActionClient';
import { subscribeToPath } from '@/lib/firebaseRealtimeDb';
import type {
  DoubtGameRoom,
  DoubtNetworkState,
} from './multiplayerTypes';
import type { Card } from './types';

const PLAYER_ID_KEY = 'doubtPlayerId';

/**
 * Backend stringifies the strippable Record / array fields — empty
 * `pile: []`, `finishedOrder: []`, `pendingClaim: null`, `ranks: null`
 * would all collapse to undefined on the RTDB wire and crash the
 * rehydrate. Same fix the earlier migrations use.
 */
type WireState = {
  version?: 1;
  phase?: DoubtNetworkState['phase'];
  playerOrder?: string[];
  currentTurnPlayerId?: string;
  requiredRank?: number;
  finished?: boolean;
  winnerId?: string | null;
  startedAt?: number;
  lastUpdate?: number;
  handsJson?: string;
  pileJson?: string;
  pendingClaimJson?: string;
  finishedOrderJson?: string;
  ranksJson?: string;
  logJson?: string;
};

function safeParse<T>(s: string | undefined, fallback: T): T {
  if (typeof s !== 'string') return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function rehydrateGameState(raw: WireState | null | undefined): DoubtNetworkState | null {
  if (!raw || !raw.playerOrder || !raw.currentTurnPlayerId) return null;
  return {
    version: 1,
    phase: raw.phase ?? 'play',
    playerOrder: raw.playerOrder,
    currentTurnPlayerId: raw.currentTurnPlayerId,
    requiredRank: raw.requiredRank ?? 1,
    finished: raw.finished ?? false,
    winnerId: raw.winnerId ?? null,
    startedAt: raw.startedAt ?? 0,
    lastUpdate: raw.lastUpdate ?? 0,
    hands: safeParse<Record<string, Card[]>>(raw.handsJson, {}),
    pile: safeParse<Card[]>(raw.pileJson, []),
    pendingClaim: safeParse<DoubtNetworkState['pendingClaim']>(raw.pendingClaimJson, null),
    finishedOrder: safeParse<string[]>(raw.finishedOrderJson, []),
    ranks: safeParse<Record<string, number> | null>(raw.ranksJson, null),
    log: safeParse<DoubtNetworkState['log']>(raw.logJson, []),
  };
}

export interface UseDoubtMultiplayerReturn {
  context: MultiplayerContext;
  room: DoubtGameRoom | null;
  otherPlayers: Array<{ id: string; name: string }>;
  gameState: DoubtNetworkState | null;
  /** Backwards-compat field; CF resolves inside the same submit call now. */
  pendingAction: null;
  createRoom: (playerName: string, password: string) => Promise<boolean>;
  joinRoom: (roomId: string, playerName: string, password: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<boolean>;
  startGame: () => Promise<boolean>;
  submitPlay: (cardIds: string[]) => Promise<{ success: boolean; error?: string }>;
  submitAccept: () => Promise<{ success: boolean; error?: string }>;
  submitDoubt: () => Promise<{ success: boolean; error?: string }>;
  resetMultiplayer: () => void;
}

export function useDoubtMultiplayer(): UseDoubtMultiplayerReturn {
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

  const [room, setRoom] = useState<DoubtGameRoom | null>(null);
  const [gameState, setGameState] = useState<DoubtNetworkState | null>(null);

  useEffect(() => {
    if (!context.roomId) return;
    const unsub = subscribeToPath<DoubtGameRoom & { gameState?: WireState }>(
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
        const rehydrated = rehydrateGameState(roomData.gameState);
        const rehydratedRoom = (
          rehydrated
            ? { ...roomData, gameState: rehydrated }
            : roomData
        ) as unknown as DoubtGameRoom;
        setRoom(rehydratedRoom);
        setGameState(rehydrated);
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
          playerId, playerName, password, gameType: 'doubt',
        });
        if (result.success && result.roomId) {
          setContext((prev) => ({
            ...prev, roomId: result.roomId!, isHost: true,
            room: result.room || null, lobbyState: 'waiting',
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

  const submitPlay = useCallback(async (cardIds: string[]) => {
    if (!context.roomId) return { success: false, error: 'No room' };
    try {
      return await gameActionClient.submitDoubtPlay({
        roomId: context.roomId, playerId, cardIds,
      });
    } catch { return { success: false, error: 'Network error' }; }
  }, [context.roomId, playerId]);

  const submitAccept = useCallback(async () => {
    if (!context.roomId) return { success: false, error: 'No room' };
    try {
      return await gameActionClient.submitDoubtAccept({
        roomId: context.roomId, playerId,
      });
    } catch { return { success: false, error: 'Network error' }; }
  }, [context.roomId, playerId]);

  const submitDoubt = useCallback(async () => {
    if (!context.roomId) return { success: false, error: 'No room' };
    try {
      return await gameActionClient.submitDoubtDoubt({
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
    submitPlay, submitAccept, submitDoubt, resetMultiplayer,
  };
}
