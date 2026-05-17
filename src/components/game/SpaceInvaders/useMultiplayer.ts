/**
 * Space Invaders - Multiplayer Hook
 * Uses Firebase Realtime Database for real-time sync
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GameRoom,
  MultiplayerPlayer,
  MultiplayerGameState,
  generatePlayerId,
  PLAYER_COLORS,
} from './multiplayerTypes';
import {
  MultiplayerContext,
} from '@/services/gameRoomService';
import * as gameActionClient from '@/services/gameActionClient';
import { setData } from '@/lib/firebaseRealtimeDb';
import { subscribeToPath } from '@/lib/firebaseRealtimeDb';

export interface UseMultiplayerReturn {
  // State
  context: MultiplayerContext;
  room: GameRoom | null;
  otherPlayer: MultiplayerPlayer | null;
  myColor: string;
  otherColor: string;

  // Actions
  createRoom: (playerName: string, password: string) => Promise<boolean>;
  joinRoom: (roomId: string, playerName: string, password: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<boolean>;
  startGame: (initialGameState: MultiplayerGameState) => Promise<boolean>;
  updateMyPosition: (x: number) => void;
  updateMyState: (score: number, lives: number) => void;
  updateGameState: (gameState: MultiplayerGameState) => void;
  endGame: (winnerId: string | null) => Promise<void>;
  resetMultiplayer: () => void;
}

export function useMultiplayer(): UseMultiplayerReturn {
  // Generate persistent player ID
  const [playerId] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('spaceInvadersPlayerId');
      if (stored) return stored;
      const newId = generatePlayerId();
      localStorage.setItem('spaceInvadersPlayerId', newId);
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

  const [room, setRoom] = useState<GameRoom | null>(null);

  // Throttle refs for position updates
  const lastPositionUpdate = useRef<number>(0);
  const lastStateUpdate = useRef<number>(0);
  const lastGameStateUpdate = useRef<number>(0);

  // Subscribe to room updates
  useEffect(() => {
    if (!context.roomId) return;

    const unsubscribe = subscribeToPath<GameRoom>(
      `gameRooms/${context.roomId}`,
      (roomData) => {
        if (!roomData) {
          // Room was deleted
          setContext(prev => ({
            ...prev,
            roomId: null,
            room: null,
            lobbyState: 'idle',
            error: 'Room was closed',
          }));
          setRoom(null);
          return;
        }

        setRoom(roomData);
        setContext(prev => ({
          ...prev,
          room: roomData as any,
          lobbyState: roomData.status === 'playing' ? 'playing' :
            roomData.status === 'finished' ? 'finished' : prev.lobbyState,
        }));
      }
    );

    return unsubscribe;
  }, [context.roomId]);

  // Calculate other player
  const otherPlayer = room && context.playerId
    ? Object.values(room.players || {}).find(p => p.id !== context.playerId) || null
    : null;

  // Determine colors based on host status
  const myColor = context.isHost ? PLAYER_COLORS.player1 : PLAYER_COLORS.player2;
  const otherColor = context.isHost ? PLAYER_COLORS.player2 : PLAYER_COLORS.player1;

  // Create room
  const createRoom = useCallback(async (playerName: string, password: string): Promise<boolean> => {
    setContext(prev => ({ ...prev, lobbyState: 'creating', error: null, playerName }));

    try {
      const result = await gameActionClient.createRoom({ playerId, playerName, password, gameType: 'space-invaders' });

      if (result.success && result.roomId) {
        setContext(prev => ({
          ...prev,
          roomId: result.roomId!,
          isHost: true,
          room: result.room || null,
          lobbyState: 'waiting',
        }));
        return true;
      } else {
        setContext(prev => ({
          ...prev,
          lobbyState: 'idle',
          error: result.error || 'Failed to create room',
        }));
        return false;
      }
    } catch {
      setContext(prev => ({
        ...prev,
        lobbyState: 'idle',
        error: 'Network error',
      }));
      return false;
    }
  }, [playerId]);

  // Join room
  const joinRoom = useCallback(async (
    roomId: string,
    playerName: string,
    password: string
  ): Promise<boolean> => {
    setContext(prev => ({ ...prev, lobbyState: 'joining', error: null, playerName }));

    try {
      const result = await gameActionClient.joinRoom({ roomId, playerId, playerName, password });

      if (result.success && result.room) {
        setContext(prev => ({
          ...prev,
          roomId,
          isHost: false,
          room: result.room || null,
          lobbyState: 'waiting',
        }));
        return true;
      } else {
        setContext(prev => ({
          ...prev,
          lobbyState: 'idle',
          error: result.error || 'Failed to join room',
        }));
        return false;
      }
    } catch {
      setContext(prev => ({
        ...prev,
        lobbyState: 'idle',
        error: 'Network error',
      }));
      return false;
    }
  }, [playerId]);

  // Leave room
  const leaveRoom = useCallback(async (): Promise<void> => {
    if (!context.roomId) return;

    try {
      await gameActionClient.leaveRoom({ roomId: context.roomId, playerId });
    } catch {
      // Ignore errors when leaving
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
  }, [context.roomId, playerId]);

  // Set ready
  const setReady = useCallback(async (ready: boolean): Promise<boolean> => {
    if (!context.roomId) return false;

    try {
      const result = await gameActionClient.setReady({ roomId: context.roomId, playerId, ready });

      if (result.success) {
        setContext(prev => ({
          ...prev,
          lobbyState: ready ? 'ready' : 'waiting',
        }));
        return Boolean(result.allReady);
      }
      return false;
    } catch {
      return false;
    }
  }, [context.roomId, playerId]);

  // Start game — CF flips room.status to 'playing' and writes a tiny
  // sentinel gameState. The host then bootstraps the real game state on
  // its first animation frame via `updateGameState`, which (for Space
  // Invaders only) still writes directly to RTDB because 60 fps HTTP
  // round-trips through the CF aren't viable.
  const startGame = useCallback(async (
    initialGameState: MultiplayerGameState
  ): Promise<boolean> => {
    if (!context.roomId || !context.isHost) return false;
    try {
      const result = await gameActionClient.startGame({ roomId: context.roomId, playerId });
      if (result.success) {
        setContext(prev => ({ ...prev, lobbyState: 'playing' }));
        // Seed the first real gameState immediately so peers don't
        // briefly see the bootstrap sentinel.
        try {
          await setData(`gameRooms/${context.roomId}/gameState`, initialGameState);
        } catch { /* ignore — host's next frame writes it anyway */ }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [context.roomId, context.isHost, playerId]);

  // Update position (throttled) - uses game state update
  const updateMyPosition = useCallback((x: number): void => {
    if (!context.roomId) return;

    const now = Date.now();
    if (now - lastPositionUpdate.current < 50) return; // 20 updates per second max
    lastPositionUpdate.current = now;

    // Position updates go through game state for Space Invaders
    // This is handled by the game engine
  }, [context.roomId]);

  // Update state (throttled)
  const updateMyState = useCallback((score: number, lives: number): void => {
    if (!context.roomId) return;

    const now = Date.now();
    if (now - lastStateUpdate.current < 100) return; // 10 updates per second max
    lastStateUpdate.current = now;

    // State updates are bundled with game state updates
  }, [context.roomId]);

  // Update game state (host only, throttled)
  const updateGameState = useCallback((
    gameState: MultiplayerGameState
  ): void => {
    if (!context.roomId || !context.isHost) return;

    const now = Date.now();
    if (now - lastGameStateUpdate.current < 100) return; // 10 updates per second max
    lastGameStateUpdate.current = now;

    // Direct RTDB write — see `functions/src/gameRoom/games/spaceInvaders.ts`
    // for why this isn't routed through the CF dispatcher.
    setData(`gameRooms/${context.roomId}/gameState`, gameState).catch(() => {});
  }, [context.roomId, context.isHost]);

  // End game
  const endGame = useCallback(async (winnerId: string | null): Promise<void> => {
    if (!context.roomId) return;

    try {
      // Direct RTDB write — same rationale as updateGameState; no CF
      // equivalent for end-of-match in the unified dispatcher yet.
      await setData(`gameRooms/${context.roomId}/status`, 'finished');
      if (winnerId) await setData(`gameRooms/${context.roomId}/winnerId`, winnerId);
      setContext(prev => ({ ...prev, lobbyState: 'finished' }));
    } catch {
      // Ignore errors
    }
  }, [context.roomId]);

  // Reset multiplayer state
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
  }, [playerId]);

  return {
    context,
    room,
    otherPlayer,
    myColor,
    otherColor,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startGame,
    updateMyPosition,
    updateMyState,
    updateGameState,
    endGame,
    resetMultiplayer,
  };
}
