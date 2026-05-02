'use client';

import { useEffect, useMemo, useState } from 'react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
type Holder = 'player' | 'ai';
type GamePhase = 'menu' | 'playing' | 'gameover';

interface GameState {
  phase: GamePhase;
  playerScore: number;
  aiScore: number;
  holder: Holder;
  timerMs: number;
  roundMs: number;
  playerCooldown: number;
  aiCooldown: number;
  freezeMs: number;
  message: string;
}

const TARGET_SCORE = 5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const createRound = () => {
  const roundMs = 5000 + Math.floor(Math.random() * 7000);
  const holder: Holder = Math.random() > 0.5 ? 'player' : 'ai';
  return { roundMs, holder };
};

const createInitialState = (): GameState => {
  const round = createRound();
  return {
    phase: 'menu',
    playerScore: 0,
    aiScore: 0,
    holder: round.holder,
    timerMs: round.roundMs,
    roundMs: round.roundMs,
    playerCooldown: 0,
    aiCooldown: 0,
    freezeMs: 0,
    message: 'Press Start',
  };
};

export const TimedButton = () => {
  useFeatureLifecycle('game.timed-button');
  const [game, setGame] = useState<GameState>(createInitialState);

  const start = () => {
    const round = createRound();
    setGame({
      phase: 'playing',
      playerScore: 0,
      aiScore: 0,
      holder: round.holder,
      timerMs: round.roundMs,
      roundMs: round.roundMs,
      playerCooldown: 0,
      aiCooldown: 0,
      freezeMs: 0,
      message: `Round start. ${round.holder === 'player' ? 'You' : 'AI'} hold the bomb.`,
    });
  };

  const passBomb = () => {
    setGame((prev) => {
      if (prev.phase !== 'playing' || prev.freezeMs > 0) return prev;
      if (prev.holder !== 'player' || prev.playerCooldown > 0) return prev;
      return {
        ...prev,
        holder: 'ai',
        playerCooldown: 520,
        message: 'You passed the bomb.',
      };
    });
  };

  useEffect(() => {
    if (game.phase !== 'playing') return;

    const timer = window.setInterval(() => {
      setGame((prev) => {
        if (prev.phase !== 'playing') return prev;

        let next = { ...prev };

        if (next.freezeMs > 0) {
          next.freezeMs = Math.max(0, next.freezeMs - 50);
          next.playerCooldown = Math.max(0, next.playerCooldown - 50);
          next.aiCooldown = Math.max(0, next.aiCooldown - 50);

          if (next.freezeMs === 0 && next.playerScore < TARGET_SCORE && next.aiScore < TARGET_SCORE) {
            const round = createRound();
            next = {
              ...next,
              holder: round.holder,
              timerMs: round.roundMs,
              roundMs: round.roundMs,
              playerCooldown: 0,
              aiCooldown: 0,
              message: `Next round. ${round.holder === 'player' ? 'You' : 'AI'} start with bomb.`,
            };
          }

          return next;
        }

        next.playerCooldown = Math.max(0, next.playerCooldown - 50);
        next.aiCooldown = Math.max(0, next.aiCooldown - 50);
        next.timerMs -= 50;

        if (next.holder === 'ai' && next.aiCooldown <= 0) {
          const pressure = clamp(1 - next.timerMs / next.roundMs, 0, 1);
          const chancePerTick = (0.04 + pressure * 0.75) * 0.09;
          if (Math.random() < chancePerTick) {
            next.holder = 'player';
            next.aiCooldown = 520;
            next.message = 'AI passed the bomb.';
          }
        }

        if (next.timerMs <= 0) {
          const loser = next.holder;
          const winner = loser === 'player' ? 'ai' : 'player';
          if (winner === 'player') {
            next.playerScore += 1;
          } else {
            next.aiScore += 1;
          }
          next.timerMs = 0;
          next.freezeMs = 1400;
          next.message = `💥 Boom! ${loser === 'player' ? 'You' : 'AI'} exploded.`;

          if (next.playerScore >= TARGET_SCORE || next.aiScore >= TARGET_SCORE) {
            next.phase = 'gameover';
          }
        }

        return next;
      });
    }, 50);

    return () => window.clearInterval(timer);
  }, [game.phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        passBomb();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const winnerText = useMemo(() => {
    if (game.playerScore === game.aiScore) return 'Draw';
    return game.playerScore > game.aiScore ? 'You Win' : 'AI Wins';
  }, [game.playerScore, game.aiScore]);

  const timerSeconds = (game.timerMs / 1000).toFixed(2);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #020617, #111827)', color: '#e2e8f0', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Timed Button</h1>
        <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>爆発前にボムを押し付ける「押す/待つ」心理戦。先に5点取った方が勝ち。</p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <span style={{ borderRadius: '999px', border: '1px solid #334155', background: '#0f172a', padding: '0.35rem 0.8rem' }}>You: {game.playerScore}</span>
          <span style={{ borderRadius: '999px', border: '1px solid #334155', background: '#0f172a', padding: '0.35rem 0.8rem' }}>AI: {game.aiScore}</span>
          <span style={{ borderRadius: '999px', border: '1px solid #334155', background: '#0f172a', padding: '0.35rem 0.8rem' }}>Holder: {game.holder === 'player' ? 'You' : 'AI'}</span>
        </div>

        <div style={{ border: '1px solid #334155', borderRadius: '16px', background: '#020617', padding: '1.2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', fontWeight: 800, color: game.timerMs < 2500 ? '#f87171' : '#67e8f9' }}>{timerSeconds}s</div>
          <div style={{ marginTop: '0.4rem', minHeight: '1.5rem', color: '#cbd5e1' }}>{game.message}</div>

          <button
            onClick={passBomb}
            disabled={game.phase !== 'playing' || game.holder !== 'player' || game.playerCooldown > 0 || game.freezeMs > 0}
            style={{
              marginTop: '1rem',
              width: '100%',
              maxWidth: '360px',
              background: game.holder === 'player' ? '#f97316' : '#334155',
              color: '#fff',
              border: 'none',
              borderRadius: '14px',
              padding: '0.9rem 1rem',
              fontSize: '1.15rem',
              fontWeight: 800,
              cursor: game.holder === 'player' ? 'pointer' : 'not-allowed',
              opacity: game.playerCooldown > 0 ? 0.55 : 1,
            }}
          >
            PASS BOMB
          </button>

          {game.playerCooldown > 0 && <div style={{ marginTop: '0.45rem', color: '#94a3b8' }}>Cooldown: {(game.playerCooldown / 1000).toFixed(2)}s</div>}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            onClick={start}
            style={{ background: '#22c55e', border: 'none', borderRadius: '10px', padding: '0.62rem 1rem', fontWeight: 700, cursor: 'pointer' }}
          >
            {game.phase === 'playing' ? 'Restart' : game.phase === 'gameover' ? 'Play Again' : 'Start'}
          </button>
          {game.phase === 'gameover' && <div style={{ alignSelf: 'center', color: '#facc15' }}>{winnerText}</div>}
        </div>
      </div>
    </div>
  );
};

export default TimedButton;
