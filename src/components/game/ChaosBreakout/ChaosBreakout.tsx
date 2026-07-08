'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Info, Pause, Play, RotateCcw, Sparkles, Trophy, Zap } from 'lucide-react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { useHighScore } from '@/hooks/useHighScore';
import { getDifficultyColor } from '../common';
import { InfoModal } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import styles from './ChaosBreakout.module.css';
import { getBannerText, getStrings } from './i18n';
import {
  BRICK_TOP,
  createGameState,
  type Difficulty,
  DIFFICULTY_CONFIG,
  type GameState,
  HEIGHT,
  launch,
  step,
  type StepInput,
  WIDTH,
} from './engine';

type Phase = 'menu' | 'ready' | 'playing' | 'paused' | 'gameover';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

const GRAVITY_ARROW: Record<GameState['gravity'], string> = {
  down: '↓',
  up: '↑',
  left: '←',
  right: '→',
};

interface Hud {
  score: number;
  lives: number;
  stage: number;
  combo: number;
  gravity: GameState['gravity'];
}

export const ChaosBreakout = () => {
  const { trackEvent } = useFeatureLifecycle('game.chaos-breakout');
  const { language } = useGameLanguage();
  const t = getStrings(language);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const frameRef = useRef<number | null>(null);
  const inputRef = useRef<StepInput>({ pointerX: null, left: false, right: false });
  const difficultyRef = useRef<Difficulty>('medium');
  const phaseRef = useRef<Phase>('menu');
  const languageRef = useRef(language);

  const [phase, setPhase] = useState<Phase>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [highScore, updateHighScore] = useHighScore('chaos-breakout');
  const [showInfo, setShowInfo] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);
  const [hud, setHud] = useState<Hud>({ score: 0, lives: 0, stage: 1, combo: 0, gravity: 'down' });

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  // ---- Rendering ------------------------------------------------------------
  const draw = useCallback((ctx: CanvasRenderingContext2D, state: GameState) => {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    bg.addColorStop(0, '#0b1120');
    bg.addColorStop(1, '#020617');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Gravity direction tint on the edge the ball is being pulled toward.
    if (state.gravityFlash > 0) {
      const a = (state.gravityFlash / 30) * 0.35;
      ctx.fillStyle = `rgba(103, 232, 249, ${a})`;
      const band = 60;
      if (state.gravity === 'down') ctx.fillRect(0, HEIGHT - band, WIDTH, band);
      else if (state.gravity === 'up') ctx.fillRect(0, 0, WIDTH, band);
      else if (state.gravity === 'left') ctx.fillRect(0, 0, band, HEIGHT);
      else ctx.fillRect(WIDTH - band, 0, band, HEIGHT);
    }

    // Bricks
    for (const brick of state.bricks) {
      if (brick.hp <= 0) continue;
      const dim = brick.hp < brick.maxHp ? 0.55 : 1;
      ctx.globalAlpha = dim;
      ctx.fillStyle = brick.color;
      const r = 5;
      roundRect(ctx, brick.x, brick.y, brick.width, brick.height, r);
      ctx.fill();
      ctx.globalAlpha = 1;
      // top highlight
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(ctx, brick.x, brick.y, brick.width, brick.height / 2, r);
      ctx.fill();
    }

    // Particles
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Paddle
    const p = state.paddle;
    const pg = ctx.createLinearGradient(p.x, 0, p.x + p.width, 0);
    pg.addColorStop(0, '#22d3ee');
    pg.addColorStop(1, '#a855f7');
    ctx.fillStyle = pg;
    roundRect(ctx, p.x, p.y, p.width, p.height, 7);
    ctx.fill();
    ctx.shadowColor = 'rgba(168, 85, 247, 0.6)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Balls
    for (const ball of state.balls) {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fillStyle = '#fef08a';
      ctx.shadowColor = 'rgba(250, 204, 21, 0.8)';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // White flash on chaos pulse
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(state.flash / 12) * 0.22})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // Chaos banner
    if (state.banner) {
      const a = Math.min(1, state.banner.timer / 40);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(103, 232, 249, 0.9)';
      ctx.shadowBlur = 18;
      ctx.fillText(getBannerText(state.banner, languageRef.current), WIDTH / 2, BRICK_TOP / 2 + 6);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
  }, []);

  // ---- Game loop ------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'playing') return;
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let hudFrame = 0;

    const loop = () => {
      if (phaseRef.current !== 'playing') return;
      const s = stateRef.current;
      if (!s) return;

      const events = step(s, inputRef.current, difficultyRef.current);

      if (events.chaos) trackEvent('chaos', { kind: events.chaos });
      if (events.stageCleared) trackEvent('stage', { stage: s.stage });

      // Throttle HUD state updates to ~10/s to avoid re-render storms.
      hudFrame += 1;
      if (hudFrame % 6 === 0 || events.lifeLost || events.stageCleared) {
        setHud({
          score: s.score,
          lives: s.lives,
          stage: s.stage,
          combo: s.combo,
          gravity: s.gravity,
        });
      }

      draw(ctx, s);

      if (events.gameOver) {
        setHud({ score: s.score, lives: 0, stage: s.stage, combo: 0, gravity: s.gravity });
        if (s.score > highScore) {
          updateHighScore(s.score);
          setIsNewBest(true);
        }
        trackEvent('gameover', { score: s.score, stage: s.stage });
        setPhaseBoth('gameover');
        return;
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [phase, draw, trackEvent, highScore, updateHighScore, setPhaseBoth]);

  // Draw a single static frame for non-playing phases (ready / paused / gameover).
  useEffect(() => {
    if (phase === 'playing' || phase === 'menu') return;
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const ctx = canvas.getContext('2d');
    if (ctx) draw(ctx, state);
  }, [phase, draw]);

  // ---- Controls -------------------------------------------------------------
  const startGame = useCallback(() => {
    // Use the difficulty state directly so a start immediately after a
    // difficulty change can't read a stale ref. Keep the ref (read by the
    // game loop) in sync synchronously as well.
    difficultyRef.current = difficulty;
    const s = createGameState(difficulty);
    stateRef.current = s;
    setIsNewBest(false);
    setHud({ score: 0, lives: s.lives, stage: 1, combo: 0, gravity: 'down' });
    inputRef.current = { pointerX: null, left: false, right: false };
    trackEvent('start', { difficulty });
    setPhaseBoth('ready');
  }, [difficulty, trackEvent, setPhaseBoth]);

  const doLaunch = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    if (phaseRef.current === 'ready') {
      launch(s);
      setPhaseBoth('playing');
    }
  }, [setPhaseBoth]);

  const togglePause = useCallback(() => {
    if (phaseRef.current === 'playing') setPhaseBoth('paused');
    else if (phaseRef.current === 'paused') setPhaseBoth('playing');
  }, [setPhaseBoth]);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          inputRef.current.left = true;
          inputRef.current.pointerX = null;
          break;
        case 'ArrowRight':
        case 'KeyD':
          inputRef.current.right = true;
          inputRef.current.pointerX = null;
          break;
        case 'Space':
          if (phaseRef.current === 'ready') {
            e.preventDefault();
            doLaunch();
          } else if (phaseRef.current === 'menu' || phaseRef.current === 'gameover') {
            e.preventDefault();
            startGame();
          }
          break;
        case 'KeyP':
        case 'Escape':
          if (phaseRef.current === 'playing' || phaseRef.current === 'paused') {
            e.preventDefault();
            togglePause();
          }
          break;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') inputRef.current.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') inputRef.current.right = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [doLaunch, startGame, togglePause]);

  // Pointer (mouse + touch) maps to paddle position in game coordinates.
  const pointerToGameX = useCallback((clientX: number): number | null => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    if (rect.width === 0) return null;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, ratio)) * WIDTH;
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (phaseRef.current !== 'playing' && phaseRef.current !== 'ready') return;
      const x = pointerToGameX(e.clientX);
      if (x !== null) inputRef.current.pointerX = x;
    },
    [pointerToGameX],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Capture the pointer so the paddle keeps tracking even if a fast drag
      // leaves the stage bounds.
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* setPointerCapture can throw for stale pointer ids; safe to ignore */
      }
      const x = pointerToGameX(e.clientX);
      if (x !== null) inputRef.current.pointerX = x;
      if (phaseRef.current === 'ready') doLaunch();
    },
    [pointerToGameX, doLaunch],
  );

  // ---- Derived --------------------------------------------------------------
  const maxLives = DIFFICULTY_CONFIG[difficulty].lives;
  const showCanvas = phase !== 'menu';

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <span className={styles.logo} aria-hidden="true">
              <Zap size={26} strokeWidth={2.4} />
            </span>
            <div>
              <h1 className={styles.title}>{t.title}</h1>
              <p className={styles.tagline}>{t.tagline}</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.infoBtn}
            onClick={() => setShowInfo(true)}
            aria-label={t.howToPlay}
          >
            <Info size={16} />
            <span>{t.howToPlay}</span>
          </button>
        </header>

        {showCanvas && (
          <>
            <div className={styles.hud} aria-live="polite">
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.score}</span>
                <span className={styles.statValue}>{hud.score.toLocaleString()}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.best}</span>
                <span className={styles.statValue} data-tone="best">
                  {Math.max(highScore, hud.score).toLocaleString()}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.lives}</span>
                <span className={styles.livesRow} aria-label={`${hud.lives} / ${maxLives}`}>
                  {Array.from({ length: maxLives }).map((_, i) => (
                    <Heart
                      key={i}
                      size={15}
                      className={i < hud.lives ? styles.heart : styles.heartEmpty}
                      fill={i < hud.lives ? 'currentColor' : 'none'}
                    />
                  ))}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.stage}</span>
                <span className={styles.statValue}>{hud.stage}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>{t.gravity}</span>
                <span className={styles.statValue} data-tone="gravity">
                  {GRAVITY_ARROW[hud.gravity]} {hud.gravity.toUpperCase()}
                </span>
              </div>
              {/* Always mounted so the HUD grid doesn't reflow; just fade it. */}
              <div
                className={styles.stat}
                aria-hidden={hud.combo <= 1}
                style={{
                  opacity: hud.combo > 1 ? 1 : 0,
                  visibility: hud.combo > 1 ? 'visible' : 'hidden',
                  transition: 'opacity 0.2s',
                }}
              >
                <span className={styles.statLabel}>{t.combo}</span>
                <span className={styles.statValue}>x{hud.combo}</span>
              </div>
            </div>

            <div
              ref={wrapRef}
              className={styles.stageWrap}
              onPointerMove={onPointerMove}
              onPointerDown={onPointerDown}
            >
              <canvas
                ref={canvasRef}
                width={WIDTH}
                height={HEIGHT}
                className={styles.canvas}
                aria-label={t.title}
                role="img"
              />

              {phase === 'ready' && (
                <div className={styles.overlay}>
                  <h2 className={styles.overlayTitle}>{t.ready}</h2>
                  <p className={styles.overlayHint}>{t.readyHint}</p>
                </div>
              )}
              {phase === 'paused' && (
                <div className={styles.overlay}>
                  <h2 className={styles.overlayTitle}>{t.paused}</h2>
                  <button type="button" className={styles.primaryBtn} onClick={togglePause}>
                    <Play size={18} /> {t.resume}
                  </button>
                </div>
              )}
              {phase === 'gameover' && (
                <div className={styles.overlay}>
                  <h2 className={styles.overlayTitle} data-tone="over">
                    {t.gameOver}
                  </h2>
                  <p className={styles.overlayHint}>
                    {t.finalScore}: <span className={styles.overlayScore}>{hud.score.toLocaleString()}</span>
                  </p>
                  {isNewBest && (
                    <span className={styles.newBest}>
                      <Trophy size={16} /> {t.newBest}
                    </span>
                  )}
                  <button type="button" className={styles.primaryBtn} onClick={startGame}>
                    <RotateCcw size={18} /> {t.playAgain}
                  </button>
                </div>
              )}
            </div>

            <div className={styles.controls}>
              {(phase === 'playing' || phase === 'paused') && (
                <button type="button" className={styles.ghostBtn} onClick={togglePause}>
                  {phase === 'paused' ? <Play size={16} /> : <Pause size={16} />}
                  {phase === 'paused' ? t.resume : t.pause}
                </button>
              )}
              <button type="button" className={styles.ghostBtn} onClick={startGame}>
                <RotateCcw size={16} /> {t.restart}
              </button>
            </div>

            <p className={styles.hint}>{t.controls[0]}</p>
          </>
        )}

        {phase === 'menu' && (
          <section className={styles.setup} aria-label={t.difficultyTitle}>
            <p className={styles.setupHeading}>{t.difficultyTitle}</p>
            <h2 className={styles.setupTitle}>{t.tagline}</h2>
            <div className={styles.difficultyGrid} role="radiogroup" aria-label={t.difficultyTitle}>
              {DIFFICULTIES.map((d) => {
                const colors = getDifficultyColor(d);
                const info = t.difficulties[d];
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={difficulty === d}
                    data-selected={difficulty === d}
                    className={styles.difficultyBtn}
                    style={
                      {
                        '--diff-bg': colors.bg,
                        '--diff-border': colors.border,
                        '--diff-text': colors.text,
                      } as React.CSSProperties
                    }
                    onClick={() => setDifficulty(d)}
                  >
                    <span className={styles.difficultyLabel}>{info.label}</span>
                    <span className={styles.difficultyDesc}>{info.description}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className={styles.primaryBtn} onClick={startGame}>
              <Play size={18} /> {t.start}
            </button>
          </section>
        )}
      </div>

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={t.title}>
        <div className={styles.modalText}>
          <p>{t.tagline}</p>
          <h3>
            <Sparkles size={15} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            {t.chaosTitle}
          </h3>
          <p>{t.chaosIntro}</p>
          <ul>
            {t.chaosList.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <h3>{t.controlsTitle}</h3>
          <ul>
            {t.controls.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </InfoModal>
    </div>
  );
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export default ChaosBreakout;
