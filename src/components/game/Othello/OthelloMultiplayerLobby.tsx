/**
 * Othello - Multiplayer Lobby Component
 */

'use client';

import React,{ useState } from 'react';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getOthelloStrings } from './i18n';
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
  const { language } = useGameLanguage();
  const strings = getOthelloStrings(language);
  const t = strings.lobby;
  // The server's own messages are passed through as they are.
  const lobbyError = (message: string) =>
    Object.prototype.hasOwnProperty.call(t.errors, message) ? t.errors[message] : message;
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
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4ade80' }}>{strings.title.toUpperCase()}</h2>

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
            {t.createRoom}
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
            {t.joinRoom}
          </button>
        </div>

        {context.error && (
          <p className="text-red-400 text-sm">{lobbyError(context.error)}</p>
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
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#60a5fa', marginBottom: '0.5rem' }}>{t.createRoom}</h3>

        <input
          type="text"
          placeholder={t.yourName}
          aria-label={t.yourName}
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          style={inputStyle}
          maxLength={20}
        />

        <input
          type="text"
          placeholder={t.roomPassword}
          aria-label={t.roomPassword}
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
            {t.back}
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
            {isLoading ? t.creating : t.create}
          </button>
        </div>

        {context.error && (
          <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{lobbyError(context.error)}</p>
        )}
      </div>
    );
  }

  // Render join room form
  if (mode === 'join' && context.lobbyState === 'idle') {
    return (
      <div className="flex flex-col items-center gap-4 p-4">
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#c084fc', marginBottom: '0.5rem' }}>{t.joinRoom}</h3>

        <input
          type="text"
          placeholder={t.yourName}
          aria-label={t.yourName}
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          style={inputStyle}
          maxLength={20}
        />

        <input
          type="text"
          placeholder={t.roomCode}
          aria-label={t.roomCode}
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          style={{ ...inputStyle, fontFamily: 'monospace' }}
          maxLength={6}
        />

        <input
          type="text"
          placeholder={t.roomPassword}
          aria-label={t.roomPassword}
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
            {t.back}
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
            {isLoading ? t.joining : t.join}
          </button>
        </div>

        {context.error && (
          <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{lobbyError(context.error)}</p>
        )}
      </div>
    );
  }

  // Render waiting room
  if (context.lobbyState === 'waiting' || context.lobbyState === 'ready') {
    return (
      <div className="flex flex-col items-center gap-5 p-4">
        <h3 className="text-xl font-bold text-green-400" style={{ color: '#4ade80' }}>{t.waitingRoom}</h3>

        {context.isHost && context.roomId && (
          <div className="text-center">
            <p className="text-gray-400 text-sm">{t.roomCodeLabel}</p>
            <p className="text-2xl font-mono font-bold text-yellow-400 tracking-widest">
              {context.roomId}
            </p>
            <p className="text-gray-500 text-xs mt-1">{t.shareCode}</p>
          </div>
        )}

        {/* Players list */}
        <div className="w-72 bg-gray-800 rounded-lg p-4">
          <h4 className="text-base font-bold text-white mb-3" style={{ color: '#ffffff' }}>{t.players}</h4>

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
                    {player.id === context.playerId && ` ${t.youTag}`}
                  </span>
                  <div className="text-xs text-gray-400">
                    {player.id === room?.hostId ? t.blackFirst : t.whiteSecond}
                  </div>
                </div>
              </div>
              <span className={player.ready ? 'text-green-400 text-sm' : 'text-gray-500 text-sm'}>
                {player.ready ? t.ready : t.notReady}
              </span>
            </div>
          ))}

          {players.length < 2 && (
            <div className="py-2 text-gray-500 italic text-sm">
              {t.waitingForPlayer}
            </div>
          )}
        </div>

        {/* Your color indicator */}
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>{t.youPlayAs}</span>
          <div style={discStyle(myColor === BLACK, 20)} />
          <span className="text-white font-medium">
            {myColor === BLACK ? t.blackFirst : t.whiteSecond}
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
            {t.leave}
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
            {myPlayer?.ready ? t.cancelReady : t.ready}
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
              {t.startGame}
            </button>
          )}
        </div>

        {!context.isHost && allReady && (
          <p style={{ color: '#facc15', fontSize: '0.875rem' }}>{t.waitingForHost}</p>
        )}

        {context.error && (
          <p style={{ color: '#f87171', fontSize: '0.875rem' }}>{lobbyError(context.error)}</p>
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
          {context.lobbyState === 'creating' ? t.creatingRoom : t.joiningRoom}
        </p>
      </div>
    );
  }

  // Default: show menu
  return (
    <div className="flex flex-col items-center gap-6 p-4">
      <p className="text-sm text-gray-400">{t.chooseAction}</p>
    </div>
  );
}
