/**
 * Territory Number — multiplayer lobby (menu / create / join / waiting).
 */

'use client';

import React, { useMemo, useState } from 'react';
import type { UseTerritoryNumberMultiplayerReturn } from './useTerritoryNumberMultiplayer';
import { DEFAULT_RULES, type FirstPlayerRule, type TerritoryNumberRules } from './types';
import { useGameLanguage } from '../contexts/GameLanguageContext';

interface TerritoryNumberMultiplayerLobbyProps {
  multiplayer: UseTerritoryNumberMultiplayerReturn;
  onGameStart: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '16rem',
  maxWidth: '90vw',
  padding: '0.5rem 1rem',
  backgroundColor: '#1f2937',
  color: '#fff',
  borderRadius: '0.375rem',
  border: '1px solid #4b5563',
  outline: 'none',
};

const buttonStyle = (color: string, disabled = false): React.CSSProperties => ({
  padding: '0.55rem 1.25rem',
  backgroundColor: disabled ? '#4b5563' : color,
  color: '#fff',
  fontWeight: 700,
  borderRadius: '0.5rem',
  border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '1rem',
  padding: '1rem',
};

function ErrorLine({ text }: { text: string }) {
  return <p style={{ color: '#f87171', margin: 0, fontSize: '0.875rem' }}>{text}</p>;
}

export function TerritoryNumberMultiplayerLobby({
  multiplayer,
  onGameStart,
}: TerritoryNumberMultiplayerLobbyProps) {
  const { language } = useGameLanguage();
  const ja = language === 'ja';
  const { context, room } = multiplayer;

  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [playerName, setPlayerName] = useState('');
  const [password, setPassword] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rules, setRules] = useState<TerritoryNumberRules>({ ...DEFAULT_RULES });

  const players = useMemo(() => {
    const list = Object.values(room?.players || {});
    return list.sort((a, b) => (a.lastUpdate - b.lastUpdate) || a.id.localeCompare(b.id));
  }, [room?.players]);
  const myPlayer = room?.players?.[context.playerId];
  const allReady = players.length === 2 && players.every(p => p.ready);

  // Sync rules from room (joiner sees host's rules).
  const roomRules = (room?.rules as TerritoryNumberRules | undefined) ?? null;
  React.useEffect(() => {
    if (roomRules && !context.isHost) {
      setRules(roomRules);
    }
  }, [roomRules, context.isHost]);

  // Push host's rule edits (debounced) once a room exists.
  React.useEffect(() => {
    if (!context.isHost || !context.roomId) return;
    const handle = setTimeout(() => {
      void multiplayer.updateRules(rules);
    }, 250);
    return () => clearTimeout(handle);
  }, [rules, context.isHost, context.roomId, multiplayer]);

  const handleCreate = async () => {
    if (!playerName.trim() || !password.trim()) return;
    setIsLoading(true);
    await multiplayer.createRoom(playerName.trim(), password.trim(), rules);
    setIsLoading(false);
  };

  const handleJoin = async () => {
    if (!playerName.trim() || !password.trim() || !roomCode.trim()) return;
    setIsLoading(true);
    await multiplayer.joinRoom(roomCode.trim().toUpperCase(), playerName.trim(), password.trim());
    setIsLoading(false);
  };

  const handleReady = async () => {
    setIsLoading(true);
    await multiplayer.setReady(!myPlayer?.ready);
    setIsLoading(false);
  };

  const handleStart = async () => {
    // The server builds the initial state from persisted `rules`. The host's
    // rule edits are pushed on a 250ms debounce, so an immediate Start click
    // could race and start with stale rules. Flush before starting.
    if (context.isHost) {
      await multiplayer.updateRules(rules);
    }
    onGameStart();
  };

  // -- IDLE / MENU
  if (context.lobbyState === 'idle' && mode === 'menu') {
    return (
      <div style={containerStyle}>
        <div style={{ fontSize: '3rem' }}>🎯</div>
        <h2 style={{ margin: 0, color: '#fbbf24', fontSize: '1.5rem' }}>
          {ja ? '陣取り数字' : 'Territory Number'}
        </h2>
        <p style={{ margin: 0, color: '#94a3b8', textAlign: 'center', maxWidth: '24rem', fontSize: '0.9rem' }}>
          {ja
            ? '2人対戦専用。ルームコードを共有して友達と対戦！'
            : '2-player only. Share a room code with a friend.'}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => setMode('create')} style={buttonStyle('#2563eb')}>
            {ja ? 'ルーム作成' : 'Create Room'}
          </button>
          <button onClick={() => setMode('join')} style={buttonStyle('#9333ea')}>
            {ja ? 'ルームに参加' : 'Join Room'}
          </button>
        </div>
        {context.error && <ErrorLine text={context.error} />}
      </div>
    );
  }

  // -- CREATE
  if (mode === 'create' && context.lobbyState === 'idle') {
    return (
      <div style={containerStyle}>
        <h3 style={{ margin: 0, color: '#60a5fa' }}>{ja ? 'ルーム作成' : 'Create Room'}</h3>
        <input
          type="text"
          placeholder={ja ? 'あなたの名前' : 'Your Name'}
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
          style={inputStyle}
          maxLength={20}
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder={ja ? 'ルームパスワード' : 'Room Password'}
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={inputStyle}
          maxLength={20}
        />
        <FirstPlayerEditor rules={rules} onChange={setRules} ja={ja} />
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => setMode('menu')} style={buttonStyle('#4b5563')}>
            {ja ? '戻る' : 'Back'}
          </button>
          <button
            onClick={handleCreate}
            disabled={isLoading || !playerName.trim() || !password.trim()}
            style={buttonStyle('#2563eb', isLoading || !playerName.trim() || !password.trim())}
          >
            {isLoading ? (ja ? '作成中...' : 'Creating...') : ja ? '作成' : 'Create'}
          </button>
        </div>
        {context.error && <ErrorLine text={context.error} />}
      </div>
    );
  }

  // -- JOIN
  if (mode === 'join' && context.lobbyState === 'idle') {
    return (
      <div style={containerStyle}>
        <h3 style={{ margin: 0, color: '#c084fc' }}>{ja ? 'ルームに参加' : 'Join Room'}</h3>
        <input
          type="text"
          placeholder={ja ? 'あなたの名前' : 'Your Name'}
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
          style={inputStyle}
          maxLength={20}
        />
        <input
          type="text"
          placeholder={ja ? 'ルームコード' : 'Room Code'}
          value={roomCode}
          onChange={e => setRoomCode(e.target.value.toUpperCase())}
          style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '0.12em' }}
          maxLength={6}
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder={ja ? 'ルームパスワード' : 'Room Password'}
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={inputStyle}
          maxLength={20}
        />
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => setMode('menu')} style={buttonStyle('#4b5563')}>
            {ja ? '戻る' : 'Back'}
          </button>
          <button
            onClick={handleJoin}
            disabled={isLoading || !playerName.trim() || !password.trim() || !roomCode.trim()}
            style={buttonStyle('#9333ea', isLoading || !playerName.trim() || !password.trim() || !roomCode.trim())}
          >
            {isLoading ? (ja ? '参加中...' : 'Joining...') : ja ? '参加' : 'Join'}
          </button>
        </div>
        {context.error && <ErrorLine text={context.error} />}
      </div>
    );
  }

  // -- WAITING ROOM
  if (context.lobbyState === 'waiting' || context.lobbyState === 'ready') {
    return (
      <div style={containerStyle}>
        <h3 style={{ margin: 0, color: '#4ade80' }}>{ja ? '待機中' : 'Waiting Room'}</h3>

        {context.isHost && context.roomId && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{ja ? 'ルームコード' : 'Room Code'}</div>
            <div style={{
              fontFamily: 'monospace',
              fontSize: '2rem',
              fontWeight: 800,
              color: '#fbbf24',
              letterSpacing: '0.15em',
            }}>
              {context.roomId}
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
              {ja ? 'このコードを友達に共有' : 'Share this code with your friend'}
            </div>
          </div>
        )}

        <div style={{
          width: '18rem',
          background: '#0f172a',
          border: '1px solid #374151',
          borderRadius: '0.75rem',
          padding: '1rem',
        }}>
          <div style={{ color: '#fff', fontWeight: 800, marginBottom: '0.5rem' }}>
            {ja ? 'プレイヤー' : 'Players'} ({players.length}/2)
          </div>
          {players.map((p, idx) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.5rem 0',
                borderBottom: idx < players.length - 1 ? '1px solid #1f2937' : 'none',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#fff' }}>
                  {p.name}{p.id === context.playerId ? ` (${ja ? 'あなた' : 'You'})` : ''}
                </span>
                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                  {p.id === room?.hostId ? ja ? 'ホスト' : 'Host' : ja ? 'ゲスト' : 'Guest'}
                </span>
              </div>
              <span style={{
                color: p.ready ? '#4ade80' : '#94a3b8',
                fontSize: '0.85rem',
                fontWeight: 700,
              }}>
                {p.ready ? (ja ? '準備完了' : 'Ready') : (ja ? '未準備' : 'Not Ready')}
              </span>
            </div>
          ))}
          {players.length < 2 && (
            <div style={{ paddingTop: '0.5rem', color: '#6b7280', fontStyle: 'italic', fontSize: '0.85rem' }}>
              {ja ? '相手のプレイヤーを待っています…' : 'Waiting for an opponent…'}
            </div>
          )}
        </div>

        <FirstPlayerEditor
          rules={rules}
          onChange={setRules}
          ja={ja}
          disabled={!context.isHost}
        />

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => multiplayer.leaveRoom()} style={buttonStyle('#dc2626')}>
            {ja ? '退室' : 'Leave'}
          </button>
          <button
            onClick={handleReady}
            disabled={isLoading}
            style={buttonStyle(myPlayer?.ready ? '#ca8a04' : '#16a34a', isLoading)}
          >
            {myPlayer?.ready
              ? (ja ? '未準備に戻す' : 'Not Ready')
              : (ja ? '準備完了' : 'Ready')}
          </button>
          {context.isHost && (
            <button
              onClick={handleStart}
              disabled={!allReady}
              style={buttonStyle('#2563eb', !allReady)}
            >
              {ja ? '開始' : 'Start'}
            </button>
          )}
        </div>

        {!context.isHost && allReady && (
          <p style={{ color: '#fbbf24', margin: 0, fontSize: '0.875rem' }}>
            {ja ? 'ホストの開始を待っています…' : 'Waiting for host to start…'}
          </p>
        )}

        {context.error && <ErrorLine text={context.error} />}
      </div>
    );
  }

  // -- LOADING
  if (context.lobbyState === 'creating' || context.lobbyState === 'joining') {
    return (
      <div style={containerStyle}>
        <div style={{
          width: '2.5rem',
          height: '2.5rem',
          borderRadius: '9999px',
          border: '4px solid rgba(251, 191, 36, 0.8)',
          borderTopColor: 'transparent',
          animation: 'tn-spin 1s linear infinite',
        }} />
        <p style={{ color: '#94a3b8', margin: 0 }}>
          {context.lobbyState === 'creating'
            ? (ja ? 'ルームを作成中...' : 'Creating room...')
            : (ja ? '参加中...' : 'Joining...')}
        </p>
        <style jsx>{`
          @keyframes tn-spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {context.error && <ErrorLine text={context.error} />}
      <button onClick={() => setMode('menu')} style={buttonStyle('#4b5563')}>
        {ja ? 'メニューに戻る' : 'Back to menu'}
      </button>
    </div>
  );
}

function FirstPlayerEditor({
  rules, onChange, ja, disabled,
}: {
  rules: TerritoryNumberRules;
  onChange: (r: TerritoryNumberRules) => void;
  ja: boolean;
  disabled?: boolean;
}) {
  const options: Array<{ value: FirstPlayerRule; label: string }> = [
    { value: 'host', label: ja ? 'ホスト' : 'Host' },
    { value: 'guest', label: ja ? 'ゲスト' : 'Guest' },
    { value: 'random', label: ja ? 'ランダム' : 'Random' },
  ];
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
      padding: '0.85rem 1rem',
      background: 'rgba(15, 23, 42, 0.7)',
      border: '1px solid rgba(148, 163, 184, 0.2)',
      borderRadius: '0.6rem',
      width: '20rem',
      maxWidth: '90vw',
    }}>
      <div style={{
        color: '#94a3b8',
        fontSize: '0.78rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {ja ? '先手' : 'First move'}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {options.map(o => {
          const active = o.value === rules.firstPlayer;
          return (
            <button
              key={o.value}
              onClick={() => !disabled && onChange({ ...rules, firstPlayer: o.value })}
              style={{
                padding: '0.4rem 0.85rem',
                background: active ? '#2563eb' : 'transparent',
                border: `1px solid ${active ? '#3b82f6' : 'rgba(148, 163, 184, 0.35)'}`,
                color: active ? '#fff' : '#cbd5e1',
                borderRadius: '999px',
                fontWeight: 700,
                cursor: disabled ? 'default' : 'pointer',
                fontSize: '0.85rem',
                opacity: disabled ? 0.6 : 1,
              }}
              disabled={disabled}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
