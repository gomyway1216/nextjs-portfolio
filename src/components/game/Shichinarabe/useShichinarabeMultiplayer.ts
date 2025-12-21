/**
 * Shichinarabe (七並べ) - Multiplayer Hook
 * Uses Firebase Realtime Database for room sync.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import * as gameRoomService from '@/services/gameRoomService';
import { subscribeToPath, setData } from '@/lib/firebaseRealtimeDb';
import type { MultiplayerContext } from '@/services/gameRoomService';
import type { ShichinarabeAction, ShichinarabeGameRoom, ShichinarabeNetworkState } from './multiplayerTypes';

export interface UseShichinarabeMultiplayerReturn {
  context: MultiplayerContext;
  room: ShichinarabeGameRoom | null;
  gameState: ShichinarabeNetworkState | null;
  pendingAction: ShichinarabeAction | null;

  createRoom: (playerName: string, password: string) => Promise<boolean>;
  joinRoom: (roomId: string, playerName: string, password: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<boolean>;
  startGame: (initialGameState: ShichinarabeNetworkState) => Promise<boolean>;
  updateGameState: (gameState: ShichinarabeNetworkState) => Promise<void>;
  endGame: (winnerId: string | null) => Promise<void>;
  sendAction: (action: ShichinarabeAction) => Promise<void>;
  clearPendingAction: () => Promise<void>;
  resetMultiplayer: () => void;
}

export function useShichinarabeMultiplayer(): UseShichinarabeMultiplayerReturn {
  const [playerId] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('shichinarabePlayerId');
      if (stored) return stored;
      const newId = gameRoomService.generatePlayerId();
      localStorage.setItem('shichinarabePlayerId', newId);
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

  const [room, setRoom] = useState<ShichinarabeGameRoom | null>(null);
  const [gameState, setGameState] = useState<ShichinarabeNetworkState | null>(null);
  const [pendingAction, setPendingAction] = useState<ShichinarabeAction | null>(null);

  // Subscribe to room updates
  useEffect(() => {
    if (!context.roomId) return;

    const unsubscribe = subscribeToPath<ShichinarabeGameRoom>(
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
          setPendingAction(null);
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

    return unsubscribe;
  }, [context.roomId]);

  // Subscribe to pending actions (host processes)
  useEffect(() => {
    if (!context.roomId) return;

    const unsubscribe = subscribeToPath<ShichinarabeAction>(
      `gameRooms/${context.roomId}/pendingAction`,
      (action) => setPendingAction(action ?? null)
    );

    return unsubscribe;
  }, [context.roomId]);

  const createRoom = useCallback(async (playerName: string, password: string): Promise<boolean> => {
    setContext(prev => ({ ...prev, lobbyState: 'creating', error: null, playerName }));

    try {
      const result = await gameRoomService.createRoom(playerId, playerName, password, 'shichinarabe');
      if (result.success && result.roomId) {
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
      setContext(prev => ({
        ...prev,
        lobbyState: 'idle',
        error: 'Network error',
      }));
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
      setContext(prev => ({
        ...prev,
        lobbyState: 'idle',
        error: 'Network error',
      }));
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
    setPendingAction(null);
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

  const startGame = useCallback(async (initialGameState: ShichinarabeNetworkState): Promise<boolean> => {
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

  const updateGameState = useCallback(async (nextState: ShichinarabeNetworkState): Promise<void> => {
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

  const sendAction = useCallback(async (action: ShichinarabeAction): Promise<void> => {
    if (!context.roomId) return;
    await setData(`gameRooms/${context.roomId}/pendingAction`, action);
  }, [context.roomId]);

  const clearPendingAction = useCallback(async (): Promise<void> => {
    if (!context.roomId) return;
    await setData(`gameRooms/${context.roomId}/pendingAction`, null);
  }, [context.roomId]);

  const resetMultiplayer = useCallback(() => {
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
    setPendingAction(null);
  }, []);

  return {
    context,
    room,
    gameState,
    pendingAction,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startGame,
    updateGameState,
    endGame,
    sendAction,
    clearPendingAction,
    resetMultiplayer,
  };
}

