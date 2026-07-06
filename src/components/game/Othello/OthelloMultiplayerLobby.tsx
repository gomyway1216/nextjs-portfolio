/**
 * Othello - Multiplayer Lobby Component
 */

'use client';

import React,{ useState } from 'react';
import { BLACK } from './types';
import { UseOthelloMultiplayerReturn } from './useOthelloMultiplayer';

interface OthelloMultiplayerLobbyProps {
  multiplayer: UseOthelloMultiplayerReturn;
  onGameStart: () => void;
}

export function OthelloMultiplayerLobby({
  multiplayer,
  onGameStart,
}: OthelloMultiplayerLobbyProps) {
  const { context, room, myColor } = multiplayer;
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [playerName, setPlayerName] = useState('');
  const [password, setPassword] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Handle create room
  const handleCreate = async () => {
    if (!playerName.trim() || !password.trim()) return;

    setIsLoading(true);
    await multiplayer.createRoom(playerName.trim(), password.trim());
    setIsLoading(false);
  };

  // Handle join room
  const handleJoin = async () => {
    if (!playerName.trim() || !password.trim() || !roomCode.trim()) return;

    setIsLoading(true);
    await multiplayer.joinRoom(
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

  // Disc style helper
  const discStyle = (isBlack: boolean, size: number = 24): React.CSSProperties => ({
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    backgroundColor: isBlack ? '#1a1a1a' : '#ffffff',
    border: isBlack ? '2px solid #374151' : '2px solid #d1d5db',
    flexShrink: 0,
  });

  // Render main menu
  if (context.lobbyState === 'idle' && mode === 'menu') {
    return (
      <div className="flex flex-col items-center gap-6 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div style={discStyle(true, 40)} />
          <div style={discStyle(false, 40)} />
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4ade80' }}>OTHELLO</h2>

        <div className="flex gap-3">
          <button
            onClick={() => setMode('create')}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontWeight: 'bold',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Create Room
          </button>
          <button
            onClick={() => setMode('join')}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: '#9333ea',
              color: '#ffffff',
              fontWeight: 'bold',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
            }}
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

  // Input style helper
  const inputStyle: React.CSSProperties = {
    width: '14rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#1f2937',
    color: '#ffffff',
    borderRadius: '0.25rem',
    border: '1px solid #4b5563',
    outline: 'none',
  };

  // Render create room form
  if (mode === 'create' && context.lobbyState === 'idle') {
    return (
      <div className="flex flex-col items-center gap-4 p-4">
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#60a5fa', marginBottom: '0.5rem' }}>Create Room</h3>

        <input
          type="text"
          placeholder="Your Name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          style={inputStyle}
          maxLength={20}
        />

        <input
          type="text"
          placeholder="Room Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          maxLength={20}
        />

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            onClick={() => setMode('menu')}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: '#4b5563',
              color: '#ffffff',
              fontWeight: 'bold',
              borderRadius: '0.25rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Back
          </button>
          <button
            onClick={handleCreate}
            disabled={isLoading || !playerName.trim() || !password.trim()}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: isLoading || !playerName.trim() || !password.trim() ? '#4b5563' : '#2563eb',
              color: '#ffffff',
              fontWeight: 'bold',
              borderRadius: '0.25rem',
              border: 'none',
              cursor: isLoading || !playerName.trim() || !password.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>

        {context.error && (
          <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{context.error}</p>
        )}
      </div>
    );
  }

  // Render join room form
  if (mode === 'join' && context.lobbyState === 'idle') {
    return (
      <div className="flex flex-col items-center gap-4 p-4">
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#c084fc', marginBottom: '0.5rem' }}>Join Room</h3>

        <input
          type="text"
          placeholder="Your Name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          style={inputStyle}
          maxLength={20}
        />

        <input
          type="text"
          placeholder="Room Code"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          style={{ ...inputStyle, fontFamily: 'monospace' }}
          maxLength={6}
        />

        <input
          type="text"
          placeholder="Room Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          maxLength={20}
        />

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            onClick={() => setMode('menu')}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: '#4b5563',
              color: '#ffffff',
              fontWeight: 'bold',
              borderRadius: '0.25rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Back
          </button>
          <button
            onClick={handleJoin}
            disabled={isLoading || !playerName.trim() || !password.trim() || !roomCode.trim()}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: isLoading || !playerName.trim() || !password.trim() || !roomCode.trim() ? '#4b5563' : '#9333ea',
              color: '#ffffff',
              fontWeight: 'bold',
              borderRadius: '0.25rem',
              border: 'none',
              cursor: isLoading || !playerName.trim() || !password.trim() || !roomCode.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Joining...' : 'Join'}
          </button>
        </div>

        {context.error && (
          <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{context.error}</p>
        )}
      </div>
    );
  }

  // Render waiting room
  if (context.lobbyState === 'waiting' || context.lobbyState === 'ready') {
    return (
      <div className="flex flex-col items-center gap-5 p-4">
        <h3 className="text-xl font-bold text-green-400">Waiting Room</h3>

        {context.isHost && context.roomId && (
          <div className="text-center">
            <p className="text-gray-400 text-sm">Room Code:</p>
            <p className="text-2xl font-mono font-bold text-yellow-400 tracking-widest">
              {context.roomId}
            </p>
            <p className="text-gray-500 text-xs mt-1">Share this code with your friend</p>
          </div>
        )}

        {/* Players list */}
        <div className="w-72 bg-gray-800 rounded-lg p-4">
          <h4 className="text-base font-bold text-white mb-3">Players</h4>

          {players.map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div style={discStyle(player.id === room?.hostId)} />
                <div>
                  <span className="text-white">
                    {player.name}
                    {player.id === context.playerId && ' (You)'}
                  </span>
                  <div className="text-xs text-gray-400">
                    {player.id === room?.hostId ? 'Black (first)' : 'White (second)'}
                  </div>
                </div>
              </div>
              <span className={player.ready ? 'text-green-400 text-sm' : 'text-gray-500 text-sm'}>
                {player.ready ? 'Ready' : 'Not Ready'}
              </span>
            </div>
          ))}

          {players.length < 2 && (
            <div className="py-2 text-gray-500 italic text-sm">
              Waiting for another player...
            </div>
          )}
        </div>

        {/* Your color indicator */}
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>You will play as:</span>
          <div style={discStyle(myColor === BLACK, 20)} />
          <span className="text-white font-medium">
            {myColor === BLACK ? 'Black (first)' : 'White (second)'}
          </span>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => multiplayer.leaveRoom()}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              fontWeight: 'bold',
              borderRadius: '0.25rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Leave
          </button>

          <button
            onClick={handleReady}
            disabled={isLoading}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: myPlayer?.ready ? '#ca8a04' : '#16a34a',
              color: '#ffffff',
              fontWeight: 'bold',
              borderRadius: '0.25rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {myPlayer?.ready ? 'Not Ready' : 'Ready'}
          </button>

          {context.isHost && (
            <button
              onClick={handleStartGame}
              disabled={!allReady || players.length < 2}
              style={{
                padding: '0.5rem 1.25rem',
                backgroundColor: !allReady || players.length < 2 ? '#4b5563' : '#2563eb',
                color: '#ffffff',
                fontWeight: 'bold',
                borderRadius: '0.25rem',
                border: 'none',
                cursor: !allReady || players.length < 2 ? 'not-allowed' : 'pointer',
              }}
            >
              Start Game
            </button>
          )}
        </div>

        {!context.isHost && allReady && (
          <p style={{ color: '#facc15', fontSize: '0.875rem' }}>Waiting for host to start...</p>
        )}

        {context.error && (
          <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{context.error}</p>
        )}
      </div>
    );
  }

  // Render loading states
  if (context.lobbyState === 'creating' || context.lobbyState === 'joining') {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <div className="animate-spin w-10 h-10 border-4 border-green-400 border-t-transparent rounded-full" />
        <p className="text-gray-400">
          {context.lobbyState === 'creating' ? 'Creating room...' : 'Joining room...'}
        </p>
      </div>
    );
  }

  // Default: show menu
  return (
    <div className="flex flex-col items-center gap-6 p-4">
      <p className="text-sm text-gray-400">Choose a multiplayer action above or use the AI match setup below.</p>
    </div>
  );
}
