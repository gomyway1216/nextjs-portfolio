/**
 * Othello - Multiplayer Hook
 * Uses Firebase Realtime Database for real-time sync
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  OthelloGameRoom,
  OthelloNetworkState,
  OthelloPlayer,
  OthelloMoveAction,
  assignPlayerColors,
} from './multiplayerTypes';
import { Color, Point, BLACK, WHITE } from './types';
import {
  MultiplayerContext,
  generatePlayerId,
} from '@/services/gameRoomService';
import * as api from '@/services/gameRoomService';
import { subscribeToPath, setData } from '@/lib/firebaseRealtimeDb';

export interface UseOthelloMultiplayerReturn {
  // State
  context: MultiplayerContext;
  room: OthelloGameRoom | null;
  otherPlayer: OthelloPlayer | null;
  myColor: Color;
  opponentColor: Color;
  gameState: OthelloNetworkState | null;
  isMyTurn: boolean;
  pendingMove: OthelloMoveAction | null;

  // Actions
  createRoom: (playerName: string, password: string) => Promise<boolean>;
  joinRoom: (roomId: string, playerName: string, password: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<boolean>;
  startGame: (initialGameState: OthelloNetworkState) => Promise<boolean>;
  makeMove: (move: Point) => Promise<void>;
  updateGameState: (gameState: OthelloNetworkState) => Promise<void>;
  endGame: (winnerId: string | null) => Promise<void>;
  resetMultiplayer: () => void;
}

export function useOthelloMultiplayer(): UseOthelloMultiplayerReturn {
  // Generate persistent player ID
  const [playerId] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('othelloPlayerId');
      if (stored) return stored;
      const newId = generatePlayerId();
      localStorage.setItem('othelloPlayerId', newId);
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

  const [room, setRoom] = useState<OthelloGameRoom | null>(null);
  const [gameState, setGameState] = useState<OthelloNetworkState | null>(null);
  const [pendingMove, setPendingMove] = useState<OthelloMoveAction | null>(null);
  const [myColor, setMyColor] = useState<Color>(BLACK);
  const [opponentColor, setOpponentColor] = useState<Color>(WHITE);

  // Subscribe to room updates
  useEffect(() => {
    if (!context.roomId) return;

    const unsubscribe = subscribeToPath<OthelloGameRoom>(
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
          setGameState(null);
          return;
        }

        setRoom(roomData);

        // Update game state if playing
        if (roomData.gameState) {
          setGameState(roomData.gameState);
        }

        // Assign colors based on host
        if (roomData.hostId) {
          const colors = assignPlayerColors(roomData.hostId, playerId);
          setMyColor(colors.myColor);
          setOpponentColor(colors.opponentColor);
        }

        setContext(prev => ({
          ...prev,
          room: roomData as any,
          lobbyState: roomData.status === 'playing' ? 'playing' :
            roomData.status === 'finished' ? 'finished' : prev.lobbyState,
        }));
      }
    );

    return unsubscribe;
  }, [context.roomId, playerId]);

  // Listen for pending moves (for non-host to receive moves)
  useEffect(() => {
    if (!context.roomId || !room || room.status !== 'playing') return;

    const unsubscribe = subscribeToPath<OthelloMoveAction>(
      `gameRooms/${context.roomId}/pendingMove`,
      (move) => {
        if (move && move.playerId !== playerId) {
          setPendingMove(move);
        }
      }
    );

    return unsubscribe;
  }, [context.roomId, room?.status, playerId]);

  // Calculate other player
  const otherPlayer = room && context.playerId
    ? Object.values(room.players || {}).find(p => p.id !== context.playerId) || null
    : null;

  // Check if it's my turn
  const isMyTurn = gameState ? gameState.currentTurn === myColor && !gameState.gameOver : false;

  // Create room
  const createRoom = useCallback(async (playerName: string, password: string): Promise<boolean> => {
    setContext(prev => ({ ...prev, lobbyState: 'creating', error: null, playerName }));

    try {
      const result = await api.createRoom(playerId, playerName, password, 'othello');

      if (result.success && result.roomId) {
        setMyColor(BLACK); // Host is always black
        setOpponentColor(WHITE);
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
      const result = await api.joinRoom(roomId, playerId, playerName, password);

      if (result.success && result.room) {
        setMyColor(WHITE); // Joiner is always white
        setOpponentColor(BLACK);
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
      await api.leaveRoom(context.roomId, playerId);
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
    setGameState(null);
  }, [context.roomId, playerId]);

  // Set ready
  const setReady = useCallback(async (ready: boolean): Promise<boolean> => {
    if (!context.roomId) return false;

    try {
      const result = await api.setPlayerReady(context.roomId, playerId, ready);

      if (result.success) {
        setContext(prev => ({
          ...prev,
          lobbyState: ready ? 'ready' : 'waiting',
        }));
        return result.allReady;
      }
      return false;
    } catch {
      return false;
    }
  }, [context.roomId, playerId]);

  // Start game
  const startGame = useCallback(async (
    initialGameState: OthelloNetworkState
  ): Promise<boolean> => {
    if (!context.roomId || !context.isHost) return false;

    try {
      const result = await api.startGame(context.roomId, playerId, initialGameState);

      if (result.success) {
        setGameState(initialGameState);
        setContext(prev => ({ ...prev, lobbyState: 'playing' }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [context.roomId, context.isHost, playerId]);

  // Make a move
  const makeMove = useCallback(async (move: Point): Promise<void> => {
    if (!context.roomId) return;

    const moveAction: OthelloMoveAction = {
      playerId,
      move,
      timestamp: Date.now(),
    };

    // Write move to Firebase for opponent to see
    await setData(`gameRooms/${context.roomId}/pendingMove`, moveAction);
  }, [context.roomId, playerId]);

  // Update game state
  const updateGameState = useCallback(async (
    newGameState: OthelloNetworkState
  ): Promise<void> => {
    if (!context.roomId) return;

    try {
      await api.updateGameState(context.roomId, newGameState);
      setGameState(newGameState);

      // Clear pending move after state update
      await setData(`gameRooms/${context.roomId}/pendingMove`, null);
    } catch {
      // Ignore errors
    }
  }, [context.roomId]);

  // End game
  const endGame = useCallback(async (winnerId: string | null): Promise<void> => {
    if (!context.roomId) return;

    try {
      await api.endGame(context.roomId, winnerId);
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
    setGameState(null);
    setPendingMove(null);
  }, [playerId]);

  return {
    context,
    room,
    otherPlayer,
    myColor,
    opponentColor,
    gameState,
    isMyTurn,
    pendingMove,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startGame,
    makeMove,
    updateGameState,
    endGame,
    resetMultiplayer,
  };
}
