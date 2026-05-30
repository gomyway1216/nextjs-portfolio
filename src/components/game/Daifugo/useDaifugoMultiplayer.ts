/**
 * Daifugo (大富豪) — multiplayer hook (Phase 3e CF migration).
 *
 * All writes route through the `gameAction` Cloud Function via
 * `gameActionClient`. RTDB `onSnapshot` subscription kept for real-time
 * reads. The host-arbitration loop is gone — every player calls
 * `submitPlay(cardIds[, give[, discard]])` or `submitPass()` and the CF
 * resolves the move atomically (shibari / revolution / 8-cut / etc.).
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { generatePlayerId, type MultiplayerContext } from '@/services/gameRoomService';
import * as gameActionClient from '@/services/gameActionClient';
import { subscribeToPath } from '@/lib/firebaseRealtimeDb';
import type {
  DaifugoGameRoom,
  DaifugoNetworkState,
  DaifugoPile,
  DaifugoRank,
} from './multiplayerTypes';
import type { Card } from './types';

const PLAYER_ID_KEY = 'daifugoPlayerId';

/**
 * Backend stringifies the strippable Record / array fields — fresh
 * `passes: []`, `pile: null`, `ranks: null`, etc. would otherwise
 * collapse to undefined on the RTDB wire and crash the rehydrate. Same
 * pattern the earlier migrations use.
 */
type WireState = {
  version?: 2;
  round?: number;
  playerOrder?: string[];
  currentTurnPlayerId?: string;
  lastPlayedBy?: string | null;
  finished?: boolean;
  winnerId?: string | null;
  startDaifugoId?: string | null;
  revolution?: boolean;
  jackBack?: boolean;
  lockSignature?: string | null;
  lastPlaySignature?: string | null;
  gekishibaNextRank?: number | null;
  startedAt?: number;
  lastUpdate?: number;
  handsJson?: string;
  pileJson?: string;
  passesJson?: string;
  finishedOrderJson?: string;
  forbiddenFinishersJson?: string;
  ranksJson?: string;
  logJson?: string;
};

function safeParse<T>(s: string | undefined, fallback: T): T {
  if (typeof s !== 'string') return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function rehydrateGameState(raw: WireState | null | undefined): DaifugoNetworkState | null {
  if (!raw || !raw.playerOrder || !raw.currentTurnPlayerId) return null;
  return {
    version: 2,
    round: raw.round ?? 1,
    playerOrder: raw.playerOrder,
    currentTurnPlayerId: raw.currentTurnPlayerId,
    lastPlayedBy: raw.lastPlayedBy ?? null,
    finished: raw.finished ?? false,
    winnerId: raw.winnerId ?? null,
    startDaifugoId: raw.startDaifugoId ?? null,
    revolution: raw.revolution ?? false,
    jackBack: raw.jackBack ?? false,
    lockSignature: raw.lockSignature ?? null,
    lastPlaySignature: raw.lastPlaySignature ?? null,
    gekishibaNextRank: raw.gekishibaNextRank ?? null,
    startedAt: raw.startedAt ?? 0,
    lastUpdate: raw.lastUpdate ?? 0,
    hands: safeParse<Record<string, Card[]>>(raw.handsJson, {}),
    pile: safeParse<DaifugoPile | null>(raw.pileJson, null),
    passes: safeParse<string[]>(raw.passesJson, []),
    finishedOrder: safeParse<string[]>(raw.finishedOrderJson, []),
    forbiddenFinishers: safeParse<string[]>(raw.forbiddenFinishersJson, []),
    ranks: safeParse<Record<string, DaifugoRank> | null>(raw.ranksJson, null),
    log: safeParse<DaifugoNetworkState['log']>(raw.logJson, []),
  };
}

export interface UseDaifugoMultiplayerReturn {
  context: MultiplayerContext;
  room: DaifugoGameRoom | null;
  otherPlayerId: string | null;
  otherPlayerName: string | null;
  gameState: DaifugoNetworkState | null;
  pendingAction: null;
  createRoom: (playerName: string, password: string) => Promise<boolean>;
  joinRoom: (roomId: string, playerName: string, password: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<boolean>;
  startGame: () => Promise<boolean>;
  submitPlay: (cardIds: string[], opts?: { giveCardIds?: string[]; discardCardIds?: string[] }) => Promise<{ success: boolean; error?: string }>;
  submitPass: () => Promise<{ success: boolean; error?: string }>;
  resetMultiplayer: () => void;
}

export function useDaifugoMultiplayer(): UseDaifugoMultiplayerReturn {
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
    roomId: null, playerId, playerName: '',
    isHost: false, room: null, lobbyState: 'idle', error: null,
  });

  const [room, setRoom] = useState<DaifugoGameRoom | null>(null);
  const [gameState, setGameState] = useState<DaifugoNetworkState | null>(null);

  useEffect(() => {
    if (!context.roomId) return;
    const unsub = subscribeToPath<DaifugoGameRoom & { gameState?: WireState }>(
      `gameRooms/${context.roomId}`,
      (roomData) => {
        if (!roomData) {
          setContext((prev) => ({ ...prev, roomId: null, room: null, lobbyState: 'idle', error: 'Room was closed' }));
          setRoom(null);
          setGameState(null);
          return;
        }
        const rehydrated = rehydrateGameState(roomData.gameState);
        const rehydratedRoom = (
          rehydrated ? { ...roomData, gameState: rehydrated } : roomData
        ) as unknown as DaifugoGameRoom;
        setRoom(rehydratedRoom);
        setGameState(rehydrated);
        setContext((prev) => ({
          ...prev,
          room: rehydratedRoom as unknown as MultiplayerContext['room'],
          lobbyState:
            rehydratedRoom.status === 'playing' ? 'playing'
            : rehydratedRoom.status === 'finished' ? 'finished'
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

  const createRoom = useCallback(
    async (playerName: string, password: string): Promise<boolean> => {
      setContext((prev) => ({ ...prev, lobbyState: 'creating', error: null, playerName }));
      try {
        const result = await gameActionClient.createRoom({ playerId, playerName, password, gameType: 'daifugo' });
        if (result.success && result.roomId) {
          setContext((prev) => ({ ...prev, roomId: result.roomId!, isHost: true, room: result.room || null, lobbyState: 'waiting' }));
          return true;
        }
        setContext((prev) => ({ ...prev, lobbyState: 'idle', error: result.error || 'Failed to create room' }));
        return false;
      } catch {
        setContext((prev) => ({ ...prev, lobbyState: 'idle', error: 'Network error' }));
        return false;
      }
    }, [playerId],
  );

  const joinRoom = useCallback(
    async (roomId: string, playerName: string, password: string): Promise<boolean> => {
      setContext((prev) => ({ ...prev, lobbyState: 'joining', error: null, playerName }));
      try {
        const result = await gameActionClient.joinRoom({ roomId, playerId, playerName, password });
        if (result.success && result.room) {
          setContext((prev) => ({ ...prev, roomId, isHost: false, room: result.room || null, lobbyState: 'waiting' }));
          return true;
        }
        setContext((prev) => ({ ...prev, lobbyState: 'idle', error: result.error || 'Failed to join room' }));
        return false;
      } catch (err) {
        setContext((prev) => ({ ...prev, lobbyState: 'idle', error: err instanceof Error ? err.message : 'Network error' }));
        return false;
      }
    }, [playerId],
  );

  const leaveRoom = useCallback(async (): Promise<void> => {
    if (!context.roomId) return;
    try { await gameActionClient.leaveRoom({ roomId: context.roomId, playerId }); } catch { /* ignore */ }
    setContext((prev) => ({ ...prev, roomId: null, isHost: false, room: null, lobbyState: 'idle', error: null }));
    setRoom(null);
    setGameState(null);
  }, [context.roomId, playerId]);

  const setReady = useCallback(
    async (ready: boolean): Promise<boolean> => {
      if (!context.roomId) return false;
      try {
        const result = await gameActionClient.setReady({ roomId: context.roomId, playerId, ready });
        if (result.success) {
          setContext((prev) => ({ ...prev, lobbyState: ready ? 'ready' : 'waiting' }));
          return Boolean(result.allReady);
        }
        return false;
      } catch { return false; }
    }, [context.roomId, playerId],
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
    async (cardIds: string[], opts?: { giveCardIds?: string[]; discardCardIds?: string[] }) => {
      if (!context.roomId) return { success: false, error: 'No room' };
      try {
        return await gameActionClient.submitDaifugoPlay({
          roomId: context.roomId, playerId, cardIds,
          giveCardIds: opts?.giveCardIds, discardCardIds: opts?.discardCardIds,
        });
      } catch { return { success: false, error: 'Network error' }; }
    },
    [context.roomId, playerId],
  );

  const submitPass = useCallback(async () => {
    if (!context.roomId) return { success: false, error: 'No room' };
    try {
      return await gameActionClient.submitDaifugoPass({ roomId: context.roomId, playerId });
    } catch { return { success: false, error: 'Network error' }; }
  }, [context.roomId, playerId]);

  const resetMultiplayer = useCallback((): void => {
    setContext({ roomId: null, playerId, playerName: '', isHost: false, room: null, lobbyState: 'idle', error: null });
    setRoom(null);
    setGameState(null);
  }, [playerId]);

  return {
    context, room,
    otherPlayerId: otherPlayer?.id ?? null,
    otherPlayerName: otherPlayer?.name ?? null,
    gameState,
    pendingAction: null,
    createRoom, joinRoom, leaveRoom, setReady, startGame,
    submitPlay, submitPass, resetMultiplayer,
  };
}
