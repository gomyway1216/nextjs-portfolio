/**
 * Space Invaders - Multiplayer Hook
 * Uses Firebase Realtime Database for real-time sync
 */

'use client';

import { setData,subscribeToPath,updateData } from '@/lib/firebaseRealtimeDb';
import * as gameActionClient from '@/services/gameActionClient';
import {
MultiplayerContext,
} from '@/services/gameRoomService';
import { type MutableRefObject,useCallback,useEffect,useRef,useState } from 'react';
import {
GameRoom,
generatePlayerId,
JoinerReport,
MultiplayerGameState,
MultiplayerPlayer,
PLAYER_COLORS,
} from './multiplayerTypes';

export interface UseMultiplayerReturn {
  // State
  context: MultiplayerContext;
  room: GameRoom | null;
  otherPlayer: MultiplayerPlayer | null;
  myColor: string;
  otherColor: string;
  /**
   * Always-fresh room data for the game loop. React state (`room`,
   * `otherPlayer`) only updates on lobby-relevant changes; high-frequency
   * gameplay writes (positions, gameState snapshots) land here without
   * triggering re-renders.
   */
  latestRoomRef: MutableRefObject<GameRoom | null>;

  // Actions
  createRoom: (playerName: string, password: string) => Promise<boolean>;
  joinRoom: (roomId: string, playerName: string, password: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<boolean>;
  startGame: (initialGameState: MultiplayerGameState) => Promise<boolean>;
  updateMyPosition: (x: number, bullet: { x: number; y: number } | null) => void;
  updateMyState: (score: number, lives: number) => void;
  updateGameState: (gameState: MultiplayerGameState) => void;
  sendJoinerReport: (report: JoinerReport) => void;
  endGame: (winnerId: string | null) => Promise<void>;
  resetMultiplayer: () => void;
}

/**
 * Signature of the lobby-relevant parts of a room. Gameplay traffic
 * (player x/score, gameState snapshots at 10-20Hz) is excluded so it doesn't
 * re-render the React tree every frame — the game loop reads it from
 * `latestRoomRef` instead.
 */
function roomMetaSignature(room: GameRoom): string {
  const players = Object.values(room.players || {})
    .map(p => [p.id, p.name, p.ready] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify([room.status, room.winnerId ?? null, players]);
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

  // Always-fresh room mirror for the game loop (no re-render on update).
  const latestRoomRef = useRef<GameRoom | null>(null);
  const lastRoomSigRef = useRef<string>('');

  // Throttle / change-detection refs for gameplay writes
  const lastPositionUpdate = useRef<number>(0);
  const lastSentPositionRef = useRef<{ x: number; hadBullet: boolean } | null>(null);
  const lastSentStateRef = useRef<{ score: number; lives: number } | null>(null);
  const lastGameStateUpdate = useRef<number>(0);

  // Subscribe to room updates
  useEffect(() => {
    if (!context.roomId) return;

    lastRoomSigRef.current = '';
    const unsubscribe = subscribeToPath<GameRoom>(
      `gameRooms/${context.roomId}`,
      (roomData) => {
        latestRoomRef.current = roomData;

        if (!roomData) {
          // Room was deleted
          lastRoomSigRef.current = '';
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

        // Only push lobby-relevant changes into React state; per-frame
        // gameplay traffic is consumed via latestRoomRef by the RAF loop.
        const sig = roomMetaSignature(roomData);
        if (sig === lastRoomSigRef.current) return;
        lastRoomSigRef.current = sig;

        setRoom(roomData);
        setContext(prev => ({
          ...prev,
          room: roomData,
          lobbyState: roomData.status === 'playing' ? 'playing' :
            roomData.status === 'finished' ? 'finished' : prev.lobbyState,
        }));
      }
    );

    return () => {
      unsubscribe();
      latestRoomRef.current = null;
    };
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
        latestRoomRef.current = (result.room as GameRoom) || null;
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
        latestRoomRef.current = (result.room as GameRoom) || null;
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
    latestRoomRef.current = null;
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

  // Reset gameplay write book-keeping whenever a match starts so the first
  // frame of a new game always publishes fresh player state.
  useEffect(() => {
    if (context.lobbyState === 'playing') {
      lastPositionUpdate.current = 0;
      lastSentPositionRef.current = null;
      lastSentStateRef.current = null;
      lastGameStateUpdate.current = 0;
    }
  }, [context.lobbyState]);

  // Publish own ship position + in-flight bullet (throttled to ~20Hz, and
  // skipped entirely while idle with no bullet on screen).
  const updateMyPosition = useCallback((x: number, bullet: { x: number; y: number } | null): void => {
    if (!context.roomId) return;

    const now = Date.now();
    if (now - lastPositionUpdate.current < 50) return; // 20 updates per second max

    const rx = Math.round(x);
    const prev = lastSentPositionRef.current;
    if (prev && prev.x === rx && !prev.hadBullet && !bullet) return; // nothing changed

    lastPositionUpdate.current = now;
    lastSentPositionRef.current = { x: rx, hadBullet: Boolean(bullet) };

    // Direct RTDB write — same rationale as updateGameState below.
    updateData(`gameRooms/${context.roomId}/players/${playerId}`, {
      x: rx,
      bullet: bullet ? { x: Math.round(bullet.x), y: Math.round(bullet.y) } : null,
      lastUpdate: now,
    }).catch(() => {});
  }, [context.roomId, playerId]);

  // Publish own score/lives. Change-driven: writes immediately when either
  // value changes and never otherwise.
  const updateMyState = useCallback((score: number, lives: number): void => {
    if (!context.roomId) return;

    const prev = lastSentStateRef.current;
    if (prev && prev.score === score && prev.lives === lives) return;
    lastSentStateRef.current = { score, lives };

    updateData(`gameRooms/${context.roomId}/players/${playerId}`, {
      score,
      lives,
      lastUpdate: Date.now(),
    }).catch(() => {});
  }, [context.roomId, playerId]);

  // Joiner → host event report (kills / shield erosion / UFO kills resolved
  // locally on the joiner). Level-scoped and idempotent, so it's safe to
  // rewrite the whole node on every new event.
  const sendJoinerReport = useCallback((report: JoinerReport): void => {
    if (!context.roomId) return;

    setData(`gameRooms/${context.roomId}/pendingActions/${playerId}`, {
      ...report,
      lastUpdate: Date.now(),
    }).catch(() => {});
  }, [context.roomId, playerId]);

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
    latestRoomRef.current = null;
  }, [playerId]);

  return {
    context,
    room,
    otherPlayer,
    myColor,
    otherColor,
    latestRoomRef,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    startGame,
    updateMyPosition,
    updateMyState,
    updateGameState,
    sendJoinerReport,
    endGame,
    resetMultiplayer,
  };
}
