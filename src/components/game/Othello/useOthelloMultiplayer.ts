/**
 * Othello — multiplayer hook (Phase 3b CF migration).
 *
 * All writes route through the `gameAction` Cloud Function via
 * `gameActionClient`. The RTDB `onSnapshot` subscription is kept for
 * real-time reads. `makeMove` is the single online write: it tells the
 * server to apply a disc placement; the CF flips and broadcasts the new
 * state. No more `updateGameState` / `endGame` / `pendingMove` from the
 * client.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  OthelloGameRoom,
  OthelloNetworkState,
  OthelloPlayer,
  assignPlayerColors,
} from './multiplayerTypes';
import { Color, Point, BLACK, WHITE } from './types';
import { MultiplayerContext, generatePlayerId } from '@/services/gameRoomService';
import * as gameActionClient from '@/services/gameActionClient';
import { subscribeToPath } from '@/lib/firebaseRealtimeDb';

/**
 * The CF stores the board as `gameState.boardJson` (a JSON string) for
 * the same RTDB-strips-nullish reason every other migrated game hits.
 * Othello's board cells are non-null numbers (0 / 1 / -1) and would
 * probably survive un-stringified, but keeping the field name aligned
 * with the other games is cheap and avoids an SDK-version foot-gun.
 *
 * `moveHistory` and `winner` may also be missing on the wire (RTDB
 * strips `[]` and `null`); pre-fill them so consumers don't crash.
 */
type WireState = Partial<OthelloNetworkState> & { boardJson?: string };

function rehydrateGameState(raw: WireState | null | undefined): OthelloNetworkState | null {
  if (!raw) return null;
  const base = raw as OthelloNetworkState;
  let board = base.board;
  if (!board && typeof raw.boardJson === 'string') {
    try { board = JSON.parse(raw.boardJson); } catch { /* leave undefined */ }
  }
  return {
    ...base,
    board: board ?? base.board,
    moveHistory: base.moveHistory ?? [],
    winner: base.winner ?? null,
    validMoves: base.validMoves ?? [],
    lastMove: base.lastMove ?? null,
  };
}

export interface UseOthelloMultiplayerReturn {
  // State
  context: MultiplayerContext;
  room: OthelloGameRoom | null;
  otherPlayer: OthelloPlayer | null;
  myColor: Color;
  opponentColor: Color;
  gameState: OthelloNetworkState | null;
  isMyTurn: boolean;

  // Actions
  createRoom: (playerName: string, password: string) => Promise<boolean>;
  joinRoom: (roomId: string, playerName: string, password: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<boolean>;
  startGame: () => Promise<boolean>;
  makeMove: (move: Point) => Promise<{ success: boolean; error?: string }>;
  resetMultiplayer: () => void;
}

export function useOthelloMultiplayer(): UseOthelloMultiplayerReturn {
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
  const [myColor, setMyColor] = useState<Color>(BLACK);
  const [opponentColor, setOpponentColor] = useState<Color>(WHITE);

  // Realtime room subscription (RTDB reads only; writes go via CF).
  useEffect(() => {
    if (!context.roomId) return;

    const unsubscribe = subscribeToPath<OthelloGameRoom & { gameState?: WireState }>(
      `gameRooms/${context.roomId}`,
      (roomData) => {
        if (!roomData) {
          // During gameplay a transient null can be a temp blip rather
          // than a real close — match the previous behaviour and don't
          // tear down state mid-game.
          if (context.lobbyState === 'playing') return;
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
        ) as unknown as OthelloGameRoom;

        setRoom(rehydratedRoom);
        if (rehydratedState) setGameState(rehydratedState);

        if (rehydratedRoom.hostId) {
          const colors = assignPlayerColors(rehydratedRoom.hostId, playerId);
          setMyColor(colors.myColor);
          setOpponentColor(colors.opponentColor);
        }

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

    return unsubscribe;
  }, [context.roomId, playerId, context.lobbyState]);

  const otherPlayer =
    room && context.playerId
      ? Object.values(room.players || {}).find((p) => p.id !== context.playerId) || null
      : null;

  const isMyTurn = gameState
    ? gameState.currentTurn === myColor && !gameState.gameOver
    : false;

  const createRoom = useCallback(
    async (playerName: string, password: string): Promise<boolean> => {
      setContext((prev) => ({ ...prev, lobbyState: 'creating', error: null, playerName }));
      try {
        const result = await gameActionClient.createRoom({
          playerId,
          playerName,
          password,
          gameType: 'othello',
        });
        if (result.success && result.roomId) {
          setMyColor(BLACK);
          setOpponentColor(WHITE);
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
          setMyColor(WHITE);
          setOpponentColor(BLACK);
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
      } catch (err) {
        setContext((prev) => ({
          ...prev,
          lobbyState: 'idle',
          error: err instanceof Error ? err.message : 'Network error',
        }));
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
      const result = await gameActionClient.startGame({ roomId: context.roomId, playerId });
      if (result.success) {
        setContext((prev) => ({ ...prev, lobbyState: 'playing' }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [context.roomId, context.isHost, playerId]);

  const makeMove = useCallback(
    async (move: Point): Promise<{ success: boolean; error?: string }> => {
      if (!context.roomId) return { success: false, error: 'No room' };
      if (!gameState) return { success: false, error: 'No game state' };
      try {
        return await gameActionClient.submitOthelloMove({
          roomId: context.roomId,
          playerId,
          x: move.x,
          y: move.y,
          turn: gameState.turnNumber,
        });
      } catch {
        return { success: false, error: 'Network error' };
      }
    },
    [context.roomId, playerId, gameState],
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
    otherPlayer,
    myColor,
    opponentColor,
    gameState,
    isMyTurn,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startGame,
    makeMove,
    resetMultiplayer,
  };
}
