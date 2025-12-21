/**
 * Doubt (ダウト) - Multiplayer Lobby
 */

'use client';

import React, { useMemo, useState } from 'react';
import type { UseDoubtMultiplayerReturn } from './useDoubtMultiplayer';

interface DoubtMultiplayerLobbyProps {
  multiplayer: UseDoubtMultiplayerReturn;
  onGameStart: () => void;
}

export function DoubtMultiplayerLobby({ multiplayer, onGameStart }: DoubtMultiplayerLobbyProps) {
  const { context, room } = multiplayer;
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [playerName, setPlayerName] = useState('');
  const [password, setPassword] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const players = useMemo(() => {
    const list = Object.values(room?.players || {});
    return list.sort((a, b) => (a.lastUpdate - b.lastUpdate) || a.id.localeCompare(b.id));
  }, [room?.players]);
  const myPlayer = room?.players?.[context.playerId];

  const minPlayers = 3;
  const maxPlayers = 6;
  const allReady = players.length >= minPlayers && players.length <= maxPlayers && players.every(p => p.ready);

  const inputStyle: React.CSSProperties = {
    width: '16rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#1f2937',
    color: '#ffffff',
    borderRadius: '0.375rem',
    border: '1px solid #4b5563',
    outline: 'none',
  };

  const handleCreate = async () => {
    if (!playerName.trim() || !password.trim()) return;
    setIsLoading(true);
    await multiplayer.createRoom(playerName.trim(), password.trim());
    setIsLoading(false);
  };

  const handleJoin = async () => {
    if (!playerName.trim() || !password.trim() || !roomCode.trim()) return;
    setIsLoading(true);
    await multiplayer.joinRoom(roomCode.trim().toUpperCase(), playerName.trim(), password.trim());
    setIsLoading(false);
  };

  const handleReady = async () => {
    const newReady = !myPlayer?.ready;
    setIsLoading(true);
    await multiplayer.setReady(!!newReady);
    setIsLoading(false);
  };

  if (context.lobbyState === 'idle' && mode === 'menu') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '1rem' }}>
        <div style={{ fontSize: '3rem' }}>🃏</div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#fbbf24', margin: 0 }}>Doubt (ダウト)</h2>
        <p style={{ color: '#9ca3af', margin: 0, textAlign: 'center', maxWidth: '28rem', fontSize: '0.9rem' }}>
          Online mode ({minPlayers}–{maxPlayers} players). Create a room, share the code, and play together.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setMode('create')}
            style={{
              padding: '0.6rem 1.25rem',
              backgroundColor: '#2563eb',
              color: '#fff',
              fontWeight: 700,
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
              padding: '0.6rem 1.25rem',
              backgroundColor: '#9333ea',
              color: '#fff',
              fontWeight: 700,
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Join Room
          </button>
        </div>

        {context.error && (
          <p style={{ color: '#f87171', fontSize: '0.875rem', margin: 0 }}>{context.error}</p>
        )}
      </div>
    );
  }

  if (mode === 'create' && context.lobbyState === 'idle') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.9rem', padding: '1rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#60a5fa', margin: 0 }}>Create Room</h3>

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

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
          <button
            onClick={() => setMode('menu')}
            style={{
              padding: '0.55rem 1.25rem',
              backgroundColor: '#4b5563',
              color: '#fff',
              fontWeight: 700,
              borderRadius: '0.5rem',
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
              padding: '0.55rem 1.25rem',
              backgroundColor: isLoading || !playerName.trim() || !password.trim() ? '#4b5563' : '#2563eb',
              color: '#fff',
              fontWeight: 700,
              borderRadius: '0.5rem',
              border: 'none',
              cursor: isLoading || !playerName.trim() || !password.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>

        {context.error && (
          <p style={{ color: '#f87171', fontSize: '0.875rem', margin: 0 }}>{context.error}</p>
        )}
      </div>
    );
  }

  if (mode === 'join' && context.lobbyState === 'idle') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.9rem', padding: '1rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#c084fc', margin: 0 }}>Join Room</h3>

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
          style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '0.12em' }}
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

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
          <button
            onClick={() => setMode('menu')}
            style={{
              padding: '0.55rem 1.25rem',
              backgroundColor: '#4b5563',
              color: '#fff',
              fontWeight: 700,
              borderRadius: '0.5rem',
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
              padding: '0.55rem 1.25rem',
              backgroundColor: isLoading || !playerName.trim() || !password.trim() || !roomCode.trim() ? '#4b5563' : '#9333ea',
              color: '#fff',
              fontWeight: 700,
              borderRadius: '0.5rem',
              border: 'none',
              cursor: isLoading || !playerName.trim() || !password.trim() || !roomCode.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Joining...' : 'Join'}
          </button>
        </div>

        {context.error && (
          <p style={{ color: '#f87171', fontSize: '0.875rem', margin: 0 }}>{context.error}</p>
        )}
      </div>
    );
  }

  if (context.lobbyState === 'waiting' || context.lobbyState === 'ready') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#4ade80', margin: 0 }}>Waiting Room</h3>

        {context.isHost && context.roomId && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Room Code</div>
            <div style={{ fontFamily: 'monospace', fontSize: '2rem', fontWeight: 800, color: '#fbbf24', letterSpacing: '0.15em' }}>
              {context.roomId}
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>Share this code with your friends</div>
          </div>
        )}

        <div style={{ width: '18rem', background: '#111827', border: '1px solid #374151', borderRadius: '0.75rem', padding: '1rem' }}>
          <div style={{ color: '#fff', fontWeight: 800, marginBottom: '0.75rem' }}>Players</div>
          {players.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0',
                borderBottom: '1px solid #1f2937',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <span style={{ color: '#fff' }}>
                  {p.name}{p.id === context.playerId ? ' (You)' : ''}
                </span>
                <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
                  {p.id === room?.hostId ? 'Host' : 'Guest'}
                </span>
              </div>
              <span style={{ color: p.ready ? '#4ade80' : '#9ca3af', fontSize: '0.875rem', fontWeight: 700 }}>
                {p.ready ? 'Ready' : 'Not Ready'}
              </span>
            </div>
          ))}
          {players.length < minPlayers && (
            <div style={{ paddingTop: '0.5rem', color: '#6b7280', fontStyle: 'italic', fontSize: '0.85rem' }}>
              Need {minPlayers - players.length} more player(s) (min {minPlayers}, max {maxPlayers})
            </div>
          )}
          {players.length >= maxPlayers && (
            <div style={{ paddingTop: '0.5rem', color: '#6b7280', fontStyle: 'italic', fontSize: '0.85rem' }}>
              Room is full ({maxPlayers}/{maxPlayers})
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
          <button
            onClick={() => multiplayer.leaveRoom()}
            style={{
              padding: '0.55rem 1.25rem',
              backgroundColor: '#dc2626',
              color: '#fff',
              fontWeight: 700,
              borderRadius: '0.5rem',
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
              padding: '0.55rem 1.25rem',
              backgroundColor: myPlayer?.ready ? '#ca8a04' : '#16a34a',
              color: '#fff',
              fontWeight: 700,
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              opacity: isLoading ? 0.8 : 1,
            }}
          >
            {myPlayer?.ready ? 'Not Ready' : 'Ready'}
          </button>
          {context.isHost && (
            <button
              onClick={onGameStart}
              disabled={!allReady}
              style={{
                padding: '0.55rem 1.25rem',
                backgroundColor: !allReady ? '#4b5563' : '#2563eb',
                color: '#fff',
                fontWeight: 700,
                borderRadius: '0.5rem',
                border: 'none',
                cursor: !allReady ? 'not-allowed' : 'pointer',
              }}
            >
              Start Game
            </button>
          )}
        </div>

        {!context.isHost && allReady && (
          <p style={{ color: '#fbbf24', fontSize: '0.875rem', margin: 0 }}>Waiting for host to start...</p>
        )}

        {context.error && (
          <p style={{ color: '#f87171', fontSize: '0.875rem', margin: 0 }}>{context.error}</p>
        )}
      </div>
    );
  }

  if (context.lobbyState === 'creating' || context.lobbyState === 'joining') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem' }}>
        <div style={{
          width: '2.5rem',
          height: '2.5rem',
          borderRadius: '9999px',
          border: '4px solid rgba(251, 191, 36, 0.8)',
          borderTopColor: 'transparent',
          animation: 'spin 1s linear infinite',
        }} />
        <p style={{ color: '#9ca3af', margin: 0 }}>
          {context.lobbyState === 'creating' ? 'Creating room...' : 'Joining room...'}
        </p>
        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
      {context.error && (
        <p style={{ color: '#f87171', fontSize: '0.875rem', margin: 0 }}>{context.error}</p>
      )}
      <button
        onClick={() => setMode('menu')}
        style={{
          padding: '0.55rem 1.25rem',
          backgroundColor: '#4b5563',
          color: '#fff',
          fontWeight: 700,
          borderRadius: '0.5rem',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Back to Menu
      </button>
    </div>
  );
}

