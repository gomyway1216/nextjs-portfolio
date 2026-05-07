/**
 * Bigger Number — multiplayer hook.
 * Wraps gameRoomService for room mgmt and uses RTDB direct writes for picks.
 *
 * Host-authoritative: only the host advances gameState (resolves rounds,
 * updates scores, ends match). Each player writes their own pick into
 * `gameRooms/{id}/pendingActions/{playerId}`; the host watches that path
 * and resolves once both picks have arrived.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as gameRoomService from '@/services/gameRoomService';
import type { MultiplayerContext } from '@/services/gameRoomService';
import { subscribeToPath, setData } from '@/lib/firebaseRealtimeDb';
import type {
  BiggerNumberGameRoom,
  BiggerNumberNetworkState,
  BiggerNumberPendingActions,
  BiggerNumberPendingPick,
} from './multiplayerTypes';
import type { BiggerNumberRules, CardValue } from './types';

const PLAYER_ID_KEY = 'biggerNumberPlayerId';

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
  startGame: (initialGameState: BiggerNumberNetworkState) => Promise<boolean>;
  updateGameState: (gameState: BiggerNumberNetworkState) => Promise<void>;
  endGame: (winnerId: string | null) => Promise<void>;
  submitPick: (card: CardValue, round: number) => Promise<void>;
  clearPendingActions: () => Promise<void>;
  resetMultiplayer: () => void;
}

export function useBiggerNumberMultiplayer(): UseBiggerNumberMultiplayerReturn {
  const [playerId] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(PLAYER_ID_KEY);
      if (stored) return stored;
      const newId = gameRoomService.generatePlayerId();
      localStorage.setItem(PLAYER_ID_KEY, newId);
      return newId;
    }
    return gameRoomService.generatePlayerId();
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
  const [pendingActions, setPendingActions] = useState<BiggerNumberPendingActions | null>(null);

  // Room subscription.
  useEffect(() => {
    if (!context.roomId) return;

    const unsub = subscribeToPath<BiggerNumberGameRoom>(
      `gameRooms/${context.roomId}`,
      (roomData) => {
        if (!roomData) {
          setContext(prev => ({
            ...prev,
            roomId: null,
            room: null,
            lobbyState: 'idle',
            error: 'Room was closed',
          }));
          setRoom(null);
          setGameState(null);
          setPendingActions(null);
          return;
        }

        setRoom(roomData);
        setGameState(roomData.gameState ?? null);

        setContext(prev => ({
          ...prev,
          room: roomData as unknown as MultiplayerContext['room'],
          lobbyState: roomData.status === 'playing'
            ? 'playing'
            : roomData.status === 'finished'
            ? 'finished'
            : prev.lobbyState,
        }));
      }
    );

    return unsub;
  }, [context.roomId]);

  // Pending picks subscription (host watches both, players watch their own for confirmation).
  useEffect(() => {
    if (!context.roomId) return;

    const unsub = subscribeToPath<BiggerNumberPendingActions>(
      `gameRooms/${context.roomId}/pendingActions`,
      (actions) => setPendingActions(actions ?? null)
    );

    return unsub;
  }, [context.roomId]);

  const otherPlayer = useMemo(() => {
    if (!room) return null;
    return Object.values(room.players || {}).find(p => p.id !== context.playerId) || null;
  }, [room, context.playerId]);

  const otherPlayerId = otherPlayer?.id ?? null;
  const otherPlayerName = otherPlayer?.name ?? null;

  const createRoom = useCallback(async (
    playerName: string,
    password: string,
    rules: BiggerNumberRules
  ): Promise<boolean> => {
    setContext(prev => ({ ...prev, lobbyState: 'creating', error: null, playerName }));

    try {
      const result = await gameRoomService.createRoom(playerId, playerName, password, 'bigger-number');
      if (result.success && result.roomId) {
        // Persist the chosen rules on the room so the joiner sees them.
        await setData(`gameRooms/${result.roomId}/rules`, rules);

        setContext(prev => ({
          ...prev,
          roomId: result.roomId!,
          isHost: true,
          room: result.room || null,
          lobbyState: 'waiting',
        }));
        return true;
      }
      setContext(prev => ({
        ...prev,
        lobbyState: 'idle',
        error: result.error || 'Failed to create room',
      }));
      return false;
    } catch {
      setContext(prev => ({ ...prev, lobbyState: 'idle', error: 'Network error' }));
      return false;
    }
  }, [playerId]);

  const joinRoom = useCallback(async (
    roomId: string,
    playerName: string,
    password: string
  ): Promise<boolean> => {
    setContext(prev => ({ ...prev, lobbyState: 'joining', error: null, playerName }));

    try {
      const result = await gameRoomService.joinRoom(roomId, playerId, playerName, password);
      if (result.success && result.room) {
        setContext(prev => ({
          ...prev,
          roomId,
          isHost: false,
          room: result.room || null,
          lobbyState: 'waiting',
        }));
        return true;
      }
      setContext(prev => ({
        ...prev,
        lobbyState: 'idle',
        error: result.error || 'Failed to join room',
      }));
      return false;
    } catch {
      setContext(prev => ({ ...prev, lobbyState: 'idle', error: 'Network error' }));
      return false;
    }
  }, [playerId]);

  const leaveRoom = useCallback(async (): Promise<void> => {
    if (!context.roomId) return;

    try {
      await gameRoomService.leaveRoom(context.roomId, playerId);
    } catch {
      // ignore
    }

    setContext(prev => ({
      ...prev,
      roomId: null,
      isHost: false,
      room: null,
      lobbyState: 'idle',
      error: null,
    }));
    setRoom(null);
    setGameState(null);
    setPendingActions(null);
  }, [context.roomId, playerId]);

  const setReady = useCallback(async (ready: boolean): Promise<boolean> => {
    if (!context.roomId) return false;

    try {
      const result = await gameRoomService.setPlayerReady(context.roomId, playerId, ready);
      if (result.success) {
        setContext(prev => ({ ...prev, lobbyState: ready ? 'ready' : 'waiting' }));
        return result.allReady;
      }
      return false;
    } catch {
      return false;
    }
  }, [context.roomId, playerId]);

  const startGame = useCallback(async (initialGameState: BiggerNumberNetworkState): Promise<boolean> => {
    if (!context.roomId || !context.isHost) return false;

    try {
      const result = await gameRoomService.startGame(context.roomId, playerId, initialGameState);
      if (result.success) {
        setContext(prev => ({ ...prev, lobbyState: 'playing' }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [context.roomId, context.isHost, playerId]);

  const updateGameState = useCallback(async (nextState: BiggerNumberNetworkState): Promise<void> => {
    if (!context.roomId || !context.isHost) return;
    await gameRoomService.updateGameState(context.roomId, nextState);
  }, [context.roomId, context.isHost]);

  const endGame = useCallback(async (winnerId: string | null): Promise<void> => {
    if (!context.roomId) return;
    try {
      await gameRoomService.endGame(context.roomId, winnerId);
      setContext(prev => ({ ...prev, lobbyState: 'finished' }));
    } catch {
      // ignore
    }
  }, [context.roomId]);

  const submitPick = useCallback(async (card: CardValue, round: number): Promise<void> => {
    if (!context.roomId) return;
    const action: BiggerNumberPendingPick = {
      actionId: `${playerId}-${round}-${Date.now()}`,
      playerId,
      card,
      round,
      timestamp: Date.now(),
    };
    await setData(`gameRooms/${context.roomId}/pendingActions/${playerId}`, action);
  }, [context.roomId, playerId]);

  const clearPendingActions = useCallback(async (): Promise<void> => {
    if (!context.roomId) return;
    await setData(`gameRooms/${context.roomId}/pendingActions`, null);
  }, [context.roomId]);

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
    setPendingActions(null);
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
    updateGameState,
    endGame,
    submitPick,
    clearPendingActions,
    resetMultiplayer,
  };
}
