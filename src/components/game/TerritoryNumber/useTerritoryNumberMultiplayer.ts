/**
 * Territory Number — multiplayer hook.
 *
 * Phase 1 of the CF migration: ALL writes go through the `gameAction`
 * Cloud Function via `gameActionClient`. Reads still use the RTDB client
 * SDK (subscribeToPath) since RTDB is the realtime sync layer.
 *
 * No more host loop, no more `pendingAction` direct writes — the CF is
 * the single writer of `gameRooms/*`.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as gameActionClient from '@/services/gameActionClient';
import { generatePlayerId, type MultiplayerContext } from '@/services/gameRoomService';
import { subscribeToPath } from '@/lib/firebaseRealtimeDb';
import type {
  TerritoryNumberGameRoom,
  TerritoryNumberNetworkState,
} from './multiplayerTypes';
import type { Board, TerritoryNumberRules } from './types';

/**
 * The Cloud Function stores `gameState.board` as `boardJson` because RTDB
 * strips fields whose value is `null` — empty cells are `{value:null,
 * owner:null}`, which collapse to `{}` → stripped → the whole `board` array
 * vanishes from the snapshot. The CF therefore writes the board as a JSON
 * string and we rehydrate it here so the rest of the UI keeps working with
 * the original `board: Board` shape.
 */
function rehydrateGameState(
  raw: (TerritoryNumberNetworkState & { boardJson?: string }) | null | undefined,
): TerritoryNumberNetworkState | null {
  if (!raw) return null;
  if (raw.board) return raw; // legacy / not-yet-migrated payload
  if (typeof raw.boardJson === 'string') {
    try {
      return { ...raw, board: JSON.parse(raw.boardJson) as Board };
    } catch {
      return raw;
    }
  }
  return raw;
}

const PLAYER_ID_KEY = 'territoryNumberPlayerId';

export interface UseTerritoryNumberMultiplayerReturn {
  context: MultiplayerContext;
  room: TerritoryNumberGameRoom | null;
  otherPlayerId: string | null;
  otherPlayerName: string | null;
  gameState: TerritoryNumberNetworkState | null;

  createRoom: (
    playerName: string,
    password: string,
    rules: TerritoryNumberRules,
  ) => Promise<boolean>;
  joinRoom: (roomId: string, playerName: string, password: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<boolean>;
  startGame: () => Promise<boolean>;
  updateRules: (rules: TerritoryNumberRules) => Promise<void>;
  submitMove: (card: number, cellIndex: number, turn: number) => Promise<{ success: boolean; error?: string }>;
  resetMultiplayer: () => void;
}

export function useTerritoryNumberMultiplayer(): UseTerritoryNumberMultiplayerReturn {
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

  const [room, setRoom] = useState<TerritoryNumberGameRoom | null>(null);
  const [gameState, setGameState] = useState<TerritoryNumberNetworkState | null>(null);

  // Realtime room subscription (still RTDB — only writes moved to CF).
  useEffect(() => {
    if (!context.roomId) return;
    const unsub = subscribeToPath<TerritoryNumberGameRoom>(
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
        const rehydratedRoom = rehydratedState
          ? { ...roomData, gameState: rehydratedState }
          : roomData;
        setRoom(rehydratedRoom);
        setGameState(rehydratedState);
        setContext((prev) => ({
          ...prev,
          room: roomData as unknown as MultiplayerContext['room'],
          lobbyState:
            roomData.status === 'playing'
              ? 'playing'
              : roomData.status === 'finished'
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

  const createRoom = useCallback(
    async (playerName: string, password: string, rules: TerritoryNumberRules): Promise<boolean> => {
      setContext((prev) => ({ ...prev, lobbyState: 'creating', error: null, playerName }));
      try {
        const result = await gameActionClient.createRoom({
          playerId,
          playerName,
          password,
          gameType: 'territory-number',
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
      // ignore; the room subscription will detect closure
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
          return result.allReady;
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
    async (rules: TerritoryNumberRules): Promise<void> => {
      if (!context.roomId || !context.isHost) return;
      try {
        await gameActionClient.setRules({
          roomId: context.roomId,
          playerId,
          rules,
        });
      } catch {
        // best-effort; server-side state is the source of truth
      }
    },
    [context.roomId, context.isHost, playerId],
  );

  const submitMove = useCallback(
    async (card: number, cellIndex: number, turn: number): Promise<{ success: boolean; error?: string }> => {
      if (!context.roomId) return { success: false, error: 'No room' };
      try {
        return await gameActionClient.submitTerritoryNumberMove({
          roomId: context.roomId,
          playerId,
          card,
          cellIndex,
          turn,
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
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startGame,
    updateRules,
    submitMove,
    resetMultiplayer,
  };
}
