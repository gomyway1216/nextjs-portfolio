/**
 * Game Room Service
 * Handles multiplayer game room operations using Firebase Realtime Database
 */

import { getRealtimeDatabase } from './firebase-admin';

// Game room types
export interface GameRoomPlayer {
  id: string;
  name: string;
  ready: boolean;
  score: number;
  lives: number;
  x: number;
  lastUpdate: number;
}

export interface GameRoom {
  id: string;
  password: string; // Hashed password
  hostId: string;
  gameType: string;
  status: 'waiting' | 'playing' | 'finished';
  players: { [key: string]: GameRoomPlayer };
  createdAt: number;
  gameState?: unknown;
  winnerId?: string | null;
}

// Simple password hashing (for game rooms, not security-critical)
function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function getPlayerLimits(gameType: string): { minPlayers: number; maxPlayers: number } {
  if (gameType === 'daifugo') {
    return { minPlayers: 3, maxPlayers: 6 };
  }

  // Default (2P)
  return { minPlayers: 2, maxPlayers: 2 };
}

// Generate a short room ID
function generateRoomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Create a new game room
 */
export async function createRoom(
  hostId: string,
  hostName: string,
  password: string,
  gameType: string = 'generic'
): Promise<{ roomId: string; room: GameRoom }> {
  const db = getRealtimeDatabase();
  const roomId = generateRoomId();

  const room: GameRoom = {
    id: roomId,
    password: hashPassword(password),
    hostId,
    gameType,
    status: 'waiting',
    players: {
      [hostId]: {
        id: hostId,
        name: hostName,
        ready: false,
        score: 0,
        lives: 3,
        x: 375,
        lastUpdate: Date.now(),
      },
    },
    createdAt: Date.now(),
  };

  await db.ref(`gameRooms/${roomId}`).set(room);
  console.log(`[GameRoom] Room ${roomId} created by ${hostName}`);

  return { roomId, room };
}

/**
 * Join an existing game room
 */
export async function joinRoom(
  roomId: string,
  playerId: string,
  playerName: string,
  password: string
): Promise<{ success: boolean; error?: string; room?: GameRoom }> {
  const db = getRealtimeDatabase();
  const roomRef = db.ref(`gameRooms/${roomId}`);

  const snapshot = await roomRef.once('value');
  const room = snapshot.val() as GameRoom | null;

  if (!room) {
    return { success: false, error: 'Room not found' };
  }

  if (room.password !== hashPassword(password)) {
    return { success: false, error: 'Incorrect password' };
  }

  if (room.status !== 'waiting') {
    return { success: false, error: 'Game already in progress' };
  }

  const playerCount = Object.keys(room.players || {}).length;
  const { maxPlayers } = getPlayerLimits(room.gameType);
  if (playerCount >= maxPlayers) {
    return { success: false, error: 'Room is full' };
  }

  // Add player to room
  const player: GameRoomPlayer = {
    id: playerId,
    name: playerName,
    ready: false,
    score: 0,
    lives: 3,
    x: 375,
    lastUpdate: Date.now(),
  };

  await roomRef.child(`players/${playerId}`).set(player);

  // Get updated room
  const updatedSnapshot = await roomRef.once('value');
  const updatedRoom = updatedSnapshot.val() as GameRoom;

  console.log(`[GameRoom] Player ${playerName} joined room ${roomId}`);

  return { success: true, room: updatedRoom };
}

/**
 * Leave a game room
 */
export async function leaveRoom(
  roomId: string,
  playerId: string
): Promise<{ success: boolean; roomDeleted: boolean }> {
  const db = getRealtimeDatabase();
  const roomRef = db.ref(`gameRooms/${roomId}`);

  const snapshot = await roomRef.once('value');
  const room = snapshot.val() as GameRoom | null;

  if (!room) {
    return { success: false, roomDeleted: false };
  }

  // Remove player
  await roomRef.child(`players/${playerId}`).remove();

  // If host left or no players remaining, delete room
  const remainingPlayers = Object.keys(room.players || {}).filter(id => id !== playerId);

  if (room.hostId === playerId || remainingPlayers.length === 0) {
    await roomRef.remove();
    console.log(`[GameRoom] Room ${roomId} deleted`);
    return { success: true, roomDeleted: true };
  }

  console.log(`[GameRoom] Player ${playerId} left room ${roomId}`);
  return { success: true, roomDeleted: false };
}

/**
 * Set player ready status
 */
export async function setPlayerReady(
  roomId: string,
  playerId: string,
  ready: boolean
): Promise<{ success: boolean; allReady: boolean }> {
  const db = getRealtimeDatabase();
  const roomRef = db.ref(`gameRooms/${roomId}`);

  await roomRef.child(`players/${playerId}/ready`).set(ready);

  // Check if all players are ready
  const snapshot = await roomRef.once('value');
  const room = snapshot.val() as GameRoom | null;

  if (!room) {
    return { success: false, allReady: false };
  }

  const players = Object.values(room.players || {});
  const { minPlayers, maxPlayers } = getPlayerLimits(room.gameType);
  const allReady = players.length >= minPlayers
    && players.length <= maxPlayers
    && players.every(p => p.ready);

  return { success: true, allReady };
}

/**
 * Start the game (host only)
 */
export async function startGame(
  roomId: string,
  playerId: string,
  initialGameState: unknown
): Promise<{ success: boolean; error?: string }> {
  const db = getRealtimeDatabase();
  const roomRef = db.ref(`gameRooms/${roomId}`);

  const snapshot = await roomRef.once('value');
  const room = snapshot.val() as GameRoom | null;

  if (!room) {
    return { success: false, error: 'Room not found' };
  }

  if (room.hostId !== playerId) {
    return { success: false, error: 'Only host can start the game' };
  }

  const players = Object.values(room.players || {});
  const { minPlayers, maxPlayers } = getPlayerLimits(room.gameType);
  if (players.length < minPlayers) {
    return { success: false, error: `Need ${minPlayers} players to start` };
  }

  if (players.length > maxPlayers) {
    return { success: false, error: `Too many players (max ${maxPlayers})` };
  }

  if (!players.every(p => p.ready)) {
    return { success: false, error: 'All players must be ready' };
  }

  await roomRef.update({
    status: 'playing',
    gameState: initialGameState,
  });

  console.log(`[GameRoom] Game started in room ${roomId}`);
  return { success: true };
}

/**
 * Update game state
 */
export async function updateGameState(
  roomId: string,
  gameState: unknown
): Promise<void> {
  const db = getRealtimeDatabase();
  await db.ref(`gameRooms/${roomId}/gameState`).set({
    ...(gameState as object),
    lastUpdate: Date.now(),
  });
}

/**
 * End the game
 */
export async function endGame(
  roomId: string,
  winnerId: string | null
): Promise<void> {
  const db = getRealtimeDatabase();
  await db.ref(`gameRooms/${roomId}`).update({
    status: 'finished',
    winnerId,
  });

  console.log(`[GameRoom] Game ended in room ${roomId}, winner: ${winnerId || 'draw'}`);
}

/**
 * Get room info
 */
export async function getRoom(roomId: string): Promise<GameRoom | null> {
  const db = getRealtimeDatabase();
  const snapshot = await db.ref(`gameRooms/${roomId}`).once('value');
  return snapshot.val();
}

/**
 * Clean up old rooms
 */
export async function cleanupOldRooms(): Promise<number> {
  const db = getRealtimeDatabase();
  const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour old

  const snapshot = await db.ref('gameRooms').once('value');
  const rooms = snapshot.val() as { [key: string]: GameRoom } | null;

  if (!rooms) return 0;

  let deleted = 0;
  for (const [roomId, room] of Object.entries(rooms)) {
    if (room.createdAt < cutoff) {
      await db.ref(`gameRooms/${roomId}`).remove();
      deleted++;
    }
  }

  console.log(`[GameRoom] Cleaned up ${deleted} old rooms`);
  return deleted;
}
