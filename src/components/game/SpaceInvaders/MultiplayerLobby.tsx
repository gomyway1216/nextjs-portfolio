/**
 * Space Invaders - Multiplayer Lobby Component
 */

'use client';

import { useState } from 'react';
import { UseMultiplayerReturn } from './useMultiplayer';

interface MultiplayerLobbyProps {
  multiplayer: UseMultiplayerReturn;
  onStartSinglePlayer: () => void;
  onGameStart: () => void;
}

export function MultiplayerLobby({
  multiplayer,
  onStartSinglePlayer,
  onGameStart,
}: MultiplayerLobbyProps) {
  const { context, room, myColor, otherColor } = multiplayer;
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [playerName, setPlayerName] = useState('');
  const [password, setPassword] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Handle create room
  const handleCreate = async () => {
    if (!playerName.trim() || !password.trim()) return;

    setIsLoading(true);
    const success = await multiplayer.createRoom(playerName.trim(), password.trim());
    setIsLoading(false);

    if (!success) {
      // Error is set in context
    }
  };

  // Handle join room
  const handleJoin = async () => {
    if (!playerName.trim() || !password.trim() || !roomCode.trim()) return;

    setIsLoading(true);
    const _success = await multiplayer.joinRoom(
      roomCode.trim().toUpperCase(),
      playerName.trim(),
      password.trim()
    );
    setIsLoading(false);
  };

  // Handle ready toggle
  const handleReady = async () => {
    const myPlayer = room?.players?.[context.playerId];
    const newReady = !myPlayer?.ready;

    setIsLoading(true);
    await multiplayer.setReady(newReady);
    setIsLoading(false);
  };

  // Handle start game
  const handleStartGame = () => {
    onGameStart();
  };

  // Check if all players are ready
  const players = Object.values(room?.players || {});
  const allReady = players.length === 2 && players.every(p => p.ready);
  const myPlayer = room?.players?.[context.playerId];

  // Render main menu
  if (context.lobbyState === 'idle' && mode === 'menu') {
    return (
      <div className="flex flex-col items-center gap-6 p-8">
        <h2 className="text-3xl font-bold text-green-400 mb-4">SPACE INVADERS</h2>

        <button
          onClick={onStartSinglePlayer}
          className="w-64 py-4 px-8 bg-green-600 hover:bg-green-500 text-white font-bold text-xl rounded-lg transition-colors"
        >
          Single Player
        </button>

        <div className="flex gap-4">
          <button
            onClick={() => setMode('create')}
            className="py-3 px-6 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors"
          >
            Create Room
          </button>
          <button
            onClick={() => setMode('join')}
            className="py-3 px-6 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-colors"
          >
            Join Room
          </button>
        </div>

        {context.error && (
          <p className="text-red-400 text-sm">{context.error}</p>
        )}
      </div>
    );
  }

  // Render create room form
  if (mode === 'create' && context.lobbyState === 'idle') {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <h3 className="text-2xl font-bold text-blue-400 mb-2">Create Room</h3>

        <input
          type="text"
          placeholder="Your Name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          className="w-64 py-2 px-4 bg-gray-800 text-white rounded border border-gray-600 focus:border-blue-400 outline-none"
          maxLength={20}
        />

        <input
          type="password"
          placeholder="Room Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-64 py-2 px-4 bg-gray-800 text-white rounded border border-gray-600 focus:border-blue-400 outline-none"
          maxLength={20}
        />

        <div className="flex gap-4 mt-4">
          <button
            onClick={() => setMode('menu')}
            className="py-2 px-6 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleCreate}
            disabled={isLoading || !playerName.trim() || !password.trim()}
            className="py-2 px-6 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded transition-colors"
          >
            {isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>

        {context.error && (
          <p className="text-red-400 text-sm">{context.error}</p>
        )}
      </div>
    );
  }

  // Render join room form
  if (mode === 'join' && context.lobbyState === 'idle') {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <h3 className="text-2xl font-bold text-purple-400 mb-2">Join Room</h3>

        <input
          type="text"
          placeholder="Your Name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          className="w-64 py-2 px-4 bg-gray-800 text-white rounded border border-gray-600 focus:border-purple-400 outline-none"
          maxLength={20}
        />

        <input
          type="text"
          placeholder="Room Code"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          className="w-64 py-2 px-4 bg-gray-800 text-white rounded border border-gray-600 focus:border-purple-400 outline-none font-mono"
          maxLength={6}
        />

        <input
          type="password"
          placeholder="Room Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-64 py-2 px-4 bg-gray-800 text-white rounded border border-gray-600 focus:border-purple-400 outline-none"
          maxLength={20}
        />

        <div className="flex gap-4 mt-4">
          <button
            onClick={() => setMode('menu')}
            className="py-2 px-6 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleJoin}
            disabled={isLoading || !playerName.trim() || !password.trim() || !roomCode.trim()}
            className="py-2 px-6 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded transition-colors"
          >
            {isLoading ? 'Joining...' : 'Join'}
          </button>
        </div>

        {context.error && (
          <p className="text-red-400 text-sm">{context.error}</p>
        )}
      </div>
    );
  }

  // Render waiting room
  if (context.lobbyState === 'waiting' || context.lobbyState === 'ready') {
    return (
      <div className="flex flex-col items-center gap-6 p-8">
        <h3 className="text-2xl font-bold text-green-400">Waiting Room</h3>

        {context.isHost && context.roomId && (
          <div className="text-center">
            <p className="text-gray-400 text-sm">Room Code:</p>
            <p className="text-3xl font-mono font-bold text-yellow-400 tracking-widest">
              {context.roomId}
            </p>
            <p className="text-gray-500 text-xs mt-1">Share this code with your friend</p>
          </div>
        )}

        {/* Players list */}
        <div className="w-80 bg-gray-800 rounded-lg p-4">
          <h4 className="text-lg font-bold text-white mb-3">Players</h4>

          {players.map((player, _index) => (
            <div
              key={player.id}
              className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: player.id === context.playerId ? myColor : otherColor }}
                />
                <span className="text-white">
                  {player.name}
                  {player.id === context.playerId && ' (You)'}
                  {room?.hostId === player.id && ' [Host]'}
                </span>
              </div>
              <span className={player.ready ? 'text-green-400' : 'text-gray-500'}>
                {player.ready ? 'Ready' : 'Not Ready'}
              </span>
            </div>
          ))}

          {players.length < 2 && (
            <div className="py-2 text-gray-500 italic">
              Waiting for another player...
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => multiplayer.leaveRoom()}
            className="py-2 px-6 bg-red-600 hover:bg-red-500 text-white font-bold rounded transition-colors"
          >
            Leave
          </button>

          <button
            onClick={handleReady}
            disabled={isLoading}
            className={`py-2 px-6 font-bold rounded transition-colors ${
              myPlayer?.ready
                ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                : 'bg-green-600 hover:bg-green-500 text-white'
            }`}
          >
            {myPlayer?.ready ? 'Not Ready' : 'Ready'}
          </button>

          {context.isHost && (
            <button
              onClick={handleStartGame}
              disabled={!allReady || players.length < 2}
              className="py-2 px-6 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded transition-colors"
            >
              Start Game
            </button>
          )}
        </div>

        {!context.isHost && allReady && (
          <p className="text-yellow-400 text-sm">Waiting for host to start...</p>
        )}

        {context.error && (
          <p className="text-red-400 text-sm">{context.error}</p>
        )}
      </div>
    );
  }

  // Render loading states
  if (context.lobbyState === 'creating' || context.lobbyState === 'joining') {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <div className="animate-spin w-12 h-12 border-4 border-green-400 border-t-transparent rounded-full" />
        <p className="text-gray-400">
          {context.lobbyState === 'creating' ? 'Creating room...' : 'Joining room...'}
        </p>
      </div>
    );
  }

  // Game started / finished — parent transitions out of the start screen.
  // Briefly show a spinner so we don't flash the Single Player menu.
  if (context.lobbyState === 'playing' || context.lobbyState === 'finished') {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <div className="animate-spin w-12 h-12 border-4 border-green-400 border-t-transparent rounded-full" />
        <p className="text-gray-400">Starting game...</p>
      </div>
    );
  }

  // Default: show menu
  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <button
        onClick={onStartSinglePlayer}
        className="w-64 py-4 px-8 bg-green-600 hover:bg-green-500 text-white font-bold text-xl rounded-lg transition-colors"
      >
        Single Player
      </button>
    </div>
  );
}
