/**
 * Breakout Game - React Component with Canvas Rendering
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, Pause, Play, Home, Gamepad2, Heart } from 'lucide-react';
import { GameTopBar, InfoModal, DifficultySelector, GameStats } from '../common';
import type { Difficulty } from '../common/types';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { useHighScore } from '@/hooks/useHighScore';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import {
  GameState,
  InputState,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  POWERUP_SIZE,
  getBrickType,
} from './types';
import { createGameState, updateGame, launchBall } from './GameEngine';
import { getStrings, getDifficultyOptions } from './i18n';

type Screen = 'menu' | 'playing';

/** Lightweight render snapshot mirrored from the game loop into React state. */
interface UISnapshot {
  score: number;
  lives: number;
  level: number;
  isPaused: boolean;
  gameOver: boolean;
  victory: boolean;
}

function snapshot(state: GameState): UISnapshot {
  return {
    score: state.score,
    lives: state.lives,
    level: state.level,
    isPaused: state.isPaused,
    gameOver: state.gameOver,
    victory: state.victory,
  };
}

function snapshotsEqual(a: UISnapshot | null, b: UISnapshot): boolean {
  return (
    a !== null &&
    a.score === b.score &&
    a.lives === b.lives &&
    a.level === b.level &&
    a.isPaused === b.isPaused &&
    a.gameOver === b.gameOver &&
    a.victory === b.victory
  );
}

const Breakout: React.FC = () => {
  useFeatureLifecycle('game.breakout');
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const [ui, setUi] = useState<UISnapshot | null>(null);
  const [screen, setScreen] = useState<Screen>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [highScore, updateHighScore] = useHighScore('breakout');
  const [beatHighScore, setBeatHighScore] = useState(false);

  const inputRef = useRef<InputState>({ left: false, right: false, pointerX: null });
  const lastTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const resultRecordedRef = useRef(false);
  const highScoreRef = useRef(highScore);
  useEffect(() => {
    highScoreRef.current = highScore;
  }, [highScore]);

  // Push a fresh HUD/overlay snapshot into React state (only when it changed).
  const syncUi = useCallback(() => {
    const state = gameStateRef.current;
    if (!state) return;
    setUi((prev) => (snapshotsEqual(prev, snapshot(state)) ? prev : snapshot(state)));
  }, []);

  // Start a new game with the selected difficulty.
  const startNewGame = useCallback(() => {
    const state = createGameState(difficulty, 1);
    gameStateRef.current = state;
    resultRecordedRef.current = false;
    setBeatHighScore(false);
    lastTimeRef.current = 0;
    setUi(snapshot(state));
    setScreen('playing');
  }, [difficulty]);

  const returnToMenu = useCallback(() => {
    gameStateRef.current = null;
    setUi(null);
    setScreen('menu');
  }, []);

  const togglePause = useCallback(() => {
    const state = gameStateRef.current;
    if (!state || state.gameOver || state.victory || !state.launched) return;
    state.isPaused = !state.isPaused;
    syncUi();
  }, [syncUi]);

  // Convert a client pointer position to game-space X.
  const pointerToGameX = useCallback((clientX: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    const x = ((clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    return Math.max(0, Math.min(CANVAS_WIDTH, x));
  }, []);

  // Keyboard input.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only intercept game keys while actually playing, so the menu (and the
      // rest of the page) keep normal keyboard behaviour.
      if (screen !== 'playing') return;
      const state = gameStateRef.current;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
        inputRef.current.left = true;
        inputRef.current.pointerX = null;
        e.preventDefault();
      } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
        inputRef.current.right = true;
        inputRef.current.pointerX = null;
        e.preventDefault();
      } else if (k === 'p' || k === 'P' || k === 'Escape') {
        togglePause();
        e.preventDefault();
      } else if (k === ' ' || k === 'Enter') {
        if (state && !state.gameOver && !state.victory) {
          launchBall(state);
        }
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (screen !== 'playing') return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') inputRef.current.left = false;
      if (k === 'ArrowRight' || k === 'd' || k === 'D') inputRef.current.right = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [screen, togglePause]);

  // ------------------------------------------------------------------ render
  const render = useCallback(
    (ctx: CanvasRenderingContext2D, state: GameState) => {
      const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      bg.addColorStop(0, '#0b1220');
      bg.addColorStop(1, '#1e293b');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // subtle grid
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= CANVAS_WIDTH; gx += 40) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, CANVAS_HEIGHT);
        ctx.stroke();
      }

      // Bricks
      for (const brick of state.bricks) {
        if (!brick.active) continue;
        const bt = getBrickType(brick.type);
        const grad = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.height);
        grad.addColorStop(0, bt.gradientStart);
        grad.addColorStop(1, bt.gradientEnd);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.beginPath();
        ctx.roundRect(brick.x + 2, brick.y + 3, brick.width, brick.height, 5);
        ctx.fill();

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 5);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(brick.x + 5, brick.y + brick.height - 3);
        ctx.lineTo(brick.x + 5, brick.y + 5);
        ctx.lineTo(brick.x + brick.width - 5, brick.y + 5);
        ctx.stroke();

        if (brick.hits > 1) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.font = 'bold 13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(brick.hits), brick.x + brick.width / 2, brick.y + brick.height / 2 + 1);
        }
      }

      // Particles
      for (const p of state.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Power-ups
      for (const pu of state.powerUps) {
        ctx.save();
        ctx.shadowColor = pu.config.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = pu.config.color;
        ctx.beginPath();
        ctx.roundRect(pu.x - POWERUP_SIZE / 2, pu.y - POWERUP_SIZE / 2, POWERUP_SIZE, POWERUP_SIZE, 6);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pu.config.symbol, pu.x, pu.y + 1);
        ctx.restore();
      }

      // Paddle
      const p = state.paddle;
      const pg = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.height);
      pg.addColorStop(0, '#7dd3fc');
      pg.addColorStop(0.5, '#38bdf8');
      pg.addColorStop(1, '#0284c7');
      ctx.save();
      ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.width, p.height, 8);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(p.x + 2, p.y + 2, p.width - 4, p.height / 2, 5);
      ctx.stroke();

      // Balls
      for (const ball of state.balls) {
        ctx.save();
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 16;
        const bgrad = ctx.createRadialGradient(
          ball.x - ball.radius / 3,
          ball.y - ball.radius / 3,
          0,
          ball.x,
          ball.y,
          ball.radius
        );
        bgrad.addColorStop(0, '#ffffff');
        bgrad.addColorStop(0.6, '#e2e8f0');
        bgrad.addColorStop(1, '#94a3b8');
        ctx.fillStyle = bgrad;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Launch hint
      if (!state.launched && !state.gameOver && !state.victory) {
        ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
        ctx.font = '600 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.launchHint, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
      }

      // Combo flash text
      if (state.combo > 2) {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.9)';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${state.combo}× ${t.combo}`, CANVAS_WIDTH / 2, 30);
      }

      // Power-up flash
      if (state.flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${state.flash * 0.18})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }

      // Pause overlay
      if (state.isPaused) {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 48px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.paused, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      }
    },
    [t]
  );

  // ------------------------------------------------------------------ loop
  useEffect(() => {
    if (screen !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loop = (timestamp: number) => {
      const state = gameStateRef.current;
      if (!state) return;
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const deltaTime = Math.min(timestamp - lastTimeRef.current, 50);
      lastTimeRef.current = timestamp;

      updateGame(state, inputRef.current, deltaTime);
      render(ctx, state);

      // Only persist genuinely new highs (avoids scheduling a state update every frame).
      if (state.score > highScoreRef.current) updateHighScore(state.score);

      const nowOver = state.gameOver || state.victory;
      if (nowOver && !resultRecordedRef.current) {
        resultRecordedRef.current = true;
        if (state.victory) setStats((prev) => ({ ...prev, wins: prev.wins + 1 }));
        else setStats((prev) => ({ ...prev, losses: prev.losses + 1 }));
        if (state.score > highScoreRef.current) setBeatHighScore(true);
      }

      // Keep HUD/overlays in sync (no-op re-render when nothing changed).
      syncUi();

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [screen, render, updateHighScore, syncUi]);

  // ------------------------------------------------------------------ info
  const infoContent = (
    <div style={{ color: 'var(--games-route-fg, #d1d5db)', lineHeight: 1.6 }}>
      <p style={{ marginBottom: '0.75rem' }}>
        <strong>{t.objective}:</strong> {t.objectiveBody}
      </p>
      <p style={{ marginBottom: '0.4rem' }}>
        <strong>{t.controls}</strong>
      </p>
      <ul style={{ listStyle: 'disc', margin: '0 0 0.9rem 1.25rem' }}>
        <li>{t.controlMove}</li>
        <li>{t.controlLaunch}</li>
        <li>{t.controlPause}</li>
      </ul>
      <p style={{ marginBottom: '0.4rem' }}>
        <strong>{t.powerups}</strong>
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.3rem' }}>
        <li><Chip color="#22c55e" sym="+" /> {t.puExpand}</li>
        <li><Chip color="#8b5cf6" sym="×3" /> {t.puMulti}</li>
        <li><Chip color="#3b82f6" sym="S" /> {t.puSlow}</li>
        <li><Chip color="#ec4899" sym="♥" /> {t.puLife}</li>
        <li><Chip color="#ef4444" sym="−" /> {t.puShrink}</li>
        <li><Chip color="#f97316" sym="F" /> {t.puFast}</li>
      </ul>
    </div>
  );

  // ------------------------------------------------------------------ menu
  if (screen === 'menu') {
    return (
      <div style={pageStyle}>
        <DifficultySelector
          title={t.title}
          subtitle={t.tagline}
          icon={<Gamepad2 aria-hidden />}
          selectedDifficulty={difficulty}
          onSelectDifficulty={setDifficulty}
          options={getDifficultyOptions(language)}
          onStart={startNewGame}
          difficultyTitle={t.selectDifficulty}
          startLabel={t.start}
        />
        <button type="button" onClick={() => setShowInfo(true)} style={linkBtnStyle}>
          {t.howToPlay}
        </button>
        <InfoModal isOpen={showInfo} title={t.howToPlay} onClose={() => setShowInfo(false)}>
          {infoContent}
        </InfoModal>
      </div>
    );
  }

  // ------------------------------------------------------------------ game
  const over = !!ui && (ui.gameOver || ui.victory);

  return (
    <div style={pageStyle}>
      <div style={{ width: '100%', maxWidth: `${CANVAS_WIDTH}px` }}>
        <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />

        {/* HUD */}
        {ui && (
          <div style={hudStyle}>
            <HudItem label={t.score} value={ui.score.toLocaleString()} />
            <HudItem label={t.hi} value={Math.max(highScore, ui.score).toLocaleString()} accent="#facc15" />
            <HudItem label={t.level} value={`${ui.level} / 6`} />
            <div style={{ ...hudItemStyle, alignItems: 'flex-end' }}>
              <span style={hudLabelStyle}>{t.lives}</span>
              <span style={{ display: 'inline-flex', gap: 3 }} aria-label={`${ui.lives} ${t.lives}`}>
                {Array.from({ length: Math.max(0, Math.min(ui.lives, 6)) }).map((_, i) => (
                  <Heart key={i} size={16} fill="#f43f5e" color="#f43f5e" />
                ))}
                {ui.lives > 6 && <span style={{ color: '#f43f5e', fontWeight: 700 }}>×{ui.lives}</span>}
              </span>
            </div>
          </div>
        )}

        <div
          style={{
            position: 'relative',
            borderRadius: '0.75rem',
            overflow: 'hidden',
            boxShadow: '0 0 34px rgba(56, 189, 248, 0.28)',
            touchAction: 'none',
          }}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            role="application"
            aria-label="Breakout game board"
            tabIndex={0}
            style={{ display: 'block', width: '100%', height: 'auto', cursor: over ? 'default' : 'none' }}
            onPointerMove={(e) => {
              if (over) return;
              const gx = pointerToGameX(e.clientX);
              if (gx !== null) inputRef.current.pointerX = gx;
            }}
            onPointerDown={(e) => {
              const s = gameStateRef.current;
              if (!s || over) return;
              const gx = pointerToGameX(e.clientX);
              if (gx !== null) inputRef.current.pointerX = gx;
              launchBall(s);
              e.currentTarget.focus();
            }}
            onPointerLeave={() => {
              inputRef.current.pointerX = null;
            }}
          />

          {/* Game over / victory overlay (React so buttons are accessible) */}
          {over && ui && (
            <div style={overlayStyle} role="dialog" aria-live="polite">
              <h2
                style={{
                  fontSize: 'clamp(2rem, 8vw, 3rem)',
                  fontWeight: 800,
                  margin: 0,
                  color: ui.victory ? '#4ade80' : '#f87171',
                  textShadow: '0 0 24px rgba(0,0,0,0.5)',
                }}
              >
                {ui.victory ? t.victory : t.gameOver}
              </h2>
              {beatHighScore && (
                <span style={{ color: '#facc15', fontWeight: 700 }}>★ {t.newHighScore}</span>
              )}
              <p style={{ margin: 0, color: '#e2e8f0', fontSize: '1.15rem' }}>
                {t.finalScore}: <strong>{ui.score.toLocaleString()}</strong>
              </p>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>
                {t.clearedLevels(ui.victory ? 6 : Math.max(0, ui.level - 1))}
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button type="button" onClick={startNewGame} style={primaryBtnStyle}>
                  <RotateCcw size={18} /> {t.playAgain}
                </button>
                <button type="button" onClick={returnToMenu} style={secondaryBtnStyle}>
                  <Home size={18} /> {t.backToMenu}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '0.9rem', flexWrap: 'wrap' }}>
          {!over && (
            <button type="button" onClick={togglePause} style={secondaryBtnStyle} aria-label={ui?.isPaused ? t.resume : t.pause}>
              {ui?.isPaused ? <Play size={18} /> : <Pause size={18} />}
              {ui?.isPaused ? t.resume : t.pause}
            </button>
          )}
          {!over && (
            <button type="button" onClick={returnToMenu} style={secondaryBtnStyle}>
              <Home size={18} /> {t.backToMenu}
            </button>
          )}
        </div>

        <div style={{ marginTop: '0.5rem', textAlign: 'center', color: 'var(--games-route-muted, #94a3b8)', fontSize: '0.78rem' }}>
          {t.controlMove}
        </div>
      </div>

      <InfoModal isOpen={showInfo} title={t.howToPlay} onClose={() => setShowInfo(false)}>
        {infoContent}
      </InfoModal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

const Chip: React.FC<{ color: string; sym: string }> = ({ color, sym }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 22,
      height: 22,
      borderRadius: 6,
      background: color,
      color: '#fff',
      fontWeight: 700,
      fontSize: 12,
      marginRight: 8,
      verticalAlign: 'middle',
    }}
  >
    {sym}
  </span>
);

const HudItem: React.FC<{ label: string; value: string; accent?: string }> = ({ label, value, accent }) => (
  <div style={hudItemStyle}>
    <span style={hudLabelStyle}>{label}</span>
    <span style={{ fontWeight: 700, fontSize: '1.05rem', color: accent ?? 'var(--games-route-fg, #f1f5f9)' }}>{value}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const pageStyle: React.CSSProperties = {
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1rem',
  padding: 'clamp(0.75rem, 3vw, 1.5rem)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const hudStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.6rem 0.9rem',
  marginBottom: '0.6rem',
  borderRadius: '0.75rem',
  background: 'var(--games-route-surface-raised, rgba(15, 23, 42, 0.6))',
  border: '1px solid var(--games-route-border, rgba(148, 163, 184, 0.2))',
};

const hudItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
};

const hudLabelStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--games-route-muted, #94a3b8)',
};

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.6rem',
  textAlign: 'center',
  padding: '1rem',
  background: 'rgba(2, 6, 23, 0.82)',
  backdropFilter: 'blur(3px)',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.7rem 1.4rem',
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: '0.6rem',
  cursor: 'pointer',
  fontSize: '1rem',
  fontWeight: 600,
};

const secondaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.7rem 1.3rem',
  background: 'var(--games-route-control, rgba(71, 85, 105, 0.6))',
  color: 'var(--games-route-fg, #fff)',
  border: '1px solid var(--games-route-border, rgba(148, 163, 184, 0.25))',
  borderRadius: '0.6rem',
  cursor: 'pointer',
  fontSize: '0.95rem',
  fontWeight: 600,
};

const linkBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--games-route-muted, #94a3b8)',
  cursor: 'pointer',
  fontSize: '0.9rem',
  textDecoration: 'underline',
  padding: '0.25rem 0.5rem',
};

export default Breakout;
export { Breakout };
