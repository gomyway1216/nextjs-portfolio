/**
 * Game Room Service
 * Client-side API for multiplayer game room management
 */

// Types
export interface MultiplayerPlayer {
  id: string;
  name: string;
  ready: boolean;
  lastUpdate: number;
}

export interface GameRoom<TGameState = unknown> {
  id: string;
  hostId: string;
  gameType: string;
  status: 'waiting' | 'playing' | 'finished';
  players: { [key: string]: MultiplayerPlayer };
  createdAt: number;
  gameState?: TGameState;
  winnerId?: string | null;
  currentTurn?: string;
}

export type LobbyState = 'idle' | 'creating' | 'joining' | 'waiting' | 'ready' | 'playing' | 'finished';

export interface MultiplayerContext {
  roomId: string | null;
  playerId: string;
  playerName: string;
  isHost: boolean;
  room: GameRoom | null;
  lobbyState: LobbyState;
  error: string | null;
}

export interface CreateRoomResponse {
  success: boolean;
  roomId?: string;
  room?: GameRoom;
  error?: string;
}

export interface JoinRoomResponse {
  success: boolean;
  room?: GameRoom;
  error?: string;
}

export interface GenericResponse {
  success: boolean;
  error?: string;
}

export interface ReadyResponse {
  success: boolean;
  allReady: boolean;
  error?: string;
}

// Constants
export const PLAYER_COLORS = {
  player1: '#22c55e',
  player2: '#3b82f6',
};

// Utilities
export function generatePlayerId(): string {
  return 'player_' + Math.random().toString(36).substring(2, 15);
}

// API base URL
const API_BASE = '/api/game/room';

// API helper function
async function apiCall<T>(endpoint: string, method: 'GET' | 'POST', body?: object): Promise<T> {
  const url = endpoint.startsWith('/') ? endpoint : `${API_BASE}${endpoint}`;

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  return response.json();
}

// API Functions
export async function createRoom(
  hostId: string,
  hostName: string,
  password: string,
  gameType: string = 'generic'
): Promise<CreateRoomResponse> {
  return apiCall<CreateRoomResponse>('', 'POST', {
    hostId,
    hostName,
    password,
    gameType,
  });
}

export async function joinRoom(
  roomId: string,
  playerId: string,
  playerName: string,
  password: string
): Promise<JoinRoomResponse> {
  return apiCall<JoinRoomResponse>('/join', 'POST', {
    roomId,
    playerId,
    playerName,
    password,
  });
}

export async function leaveRoom(
  roomId: string,
  playerId: string
): Promise<GenericResponse & { roomDeleted?: boolean }> {
  return apiCall<GenericResponse & { roomDeleted?: boolean }>('/leave', 'POST', {
    roomId,
    playerId,
  });
}

export async function setPlayerReady(
  roomId: string,
  playerId: string,
  ready: boolean
): Promise<ReadyResponse> {
  return apiCall<ReadyResponse>('/ready', 'POST', {
    roomId,
    playerId,
    ready,
  });
}

export async function startGame<TGameState>(
  roomId: string,
  playerId: string,
  initialGameState: TGameState
): Promise<GenericResponse> {
  return apiCall<GenericResponse>('/start', 'POST', {
    roomId,
    playerId,
    initialGameState,
  });
}

export async function updateGameState<TGameState>(
  roomId: string,
  gameState: TGameState
): Promise<GenericResponse> {
  return apiCall<GenericResponse>('/state', 'POST', {
    roomId,
    gameState,
  });
}

export async function endGame(
  roomId: string,
  winnerId: string | null
): Promise<GenericResponse> {
  return apiCall<GenericResponse>('/end', 'POST', {
    roomId,
    winnerId,
  });
}

export async function getRoom(
  roomId: string
): Promise<{ success: boolean; room?: GameRoom; error?: string }> {
  return apiCall<{ success: boolean; room?: GameRoom; error?: string }>(
    `${API_BASE}?roomId=${encodeURIComponent(roomId)}`,
    'GET'
  );
}
