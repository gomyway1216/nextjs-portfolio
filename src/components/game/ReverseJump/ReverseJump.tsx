'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Info, Pause, Play, RotateCcw } from 'lucide-react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { useHighScore } from '@/hooks/useHighScore';
import { InfoModal } from '../common/InfoModal';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { getReverseJumpCopy } from './i18n';
import styles from './ReverseJump.module.css';
import {
  ControlMode,
  createObstacle,
  Difficulty,
  DIFFICULTY_CONFIG,
  intersects,
  Obstacle,
  playerBox,
  speedForScore,
  stepPlayer,
  WORLD,
} from './gameLogic';

type Phase = 'menu' | 'playing' | 'paused' | 'gameover';

interface Runtime {
  playerY: number;
  velocityY: number;
  ducking: boolean;
  obstacles: Obstacle[];
  score: number;
  mode: ControlMode;
  swapTimerMs: number;
  spawnTimer: number;
  nextObstacleId: number;
  wantJump: boolean;
  duckHeld: boolean;
}

const FLIP_WARN_MS = 1600;

const createRuntime = (config = DIFFICULTY_CONFIG.medium): Runtime => ({
  playerY: WORLD.groundY,
  velocityY: 0,
  ducking: false,
  obstacles: [],
  score: 0,
  mode: 'normal',
  swapTimerMs: config.swapIntervalMs,
  spawnTimer: 0.6,
  nextObstacleId: 1,
  wantJump: false,
  duckHeld: false,
});

export const ReverseJump = () => {
  useFeatureLifecycle('game.reverse-jump');
  const { language } = useGameLanguage();
  const copy = getReverseJumpCopy(language);
  const [highScore, updateHighScore] = useHighScore('reverse-jump');

  const [phase, setPhase] = useState<Phase>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [infoOpen, setInfoOpen] = useState(false);

  // HUD mirror state (updated at a throttled cadence from the loop).
  const [hud, setHud] = useState({ score: 0, mode: 'normal' as ControlMode, swapTimerMs: DIFFICULTY_CONFIG.medium.swapIntervalMs });
  const [isNewBest, setIsNewBest] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime>(createRuntime());
  const phaseRef = useRef<Phase>('menu');
  const difficultyRef = useRef<Difficulty>('medium');
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const hudAccumRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  const config = DIFFICULTY_CONFIG[difficulty];

  // ---- Input intent ----
  const triggerAction = useCallback((intent: 'primary' | 'secondary') => {
    const rt = runtimeRef.current;
    if (phaseRef.current !== 'playing') return;
    // resolveAction inlined via mode so refs stay authoritative
    const normal = intent === 'primary' ? 'jump' : 'duck';
    const action =
      rt.mode === 'normal' ? normal : normal === 'jump' ? 'duck' : 'jump';
    if (action === 'jump') {
      rt.wantJump = true;
    } else {
      rt.duckHeld = true;
    }
  }, []);

  const releaseAction = useCallback((intent: 'primary' | 'secondary') => {
    const rt = runtimeRef.current;
    const normal = intent === 'primary' ? 'jump' : 'duck';
    const action =
      rt.mode === 'normal' ? normal : normal === 'jump' ? 'duck' : 'jump';
    if (action === 'duck') {
      rt.duckHeld = false;
    }
  }, []);

  const startGame = useCallback(() => {
    runtimeRef.current = createRuntime(DIFFICULTY_CONFIG[difficultyRef.current]);
    setIsNewBest(false);
    setHud({ score: 0, mode: 'normal', swapTimerMs: DIFFICULTY_CONFIG[difficultyRef.current].swapIntervalMs });
    lastTimeRef.current = 0;
    setPhase('playing');
  }, []);

  const togglePause = useCallback(() => {
    setPhase((p) => {
      if (p === 'playing') return 'paused';
      if (p === 'paused') {
        lastTimeRef.current = 0;
        return 'playing';
      }
      return p;
    });
  }, []);

  // Auto-pause when the tab is hidden so the player never returns to an
  // unfair, time-skipped state (rAF also stops firing while hidden).
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && phaseRef.current === 'playing') {
        setPhase('paused');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // ---- Keyboard ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyP') {
        if (phaseRef.current === 'playing' || phaseRef.current === 'paused') {
          e.preventDefault();
          togglePause();
        }
        return;
      }
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
      }
      if (e.repeat) return;

      if (phaseRef.current === 'menu' || phaseRef.current === 'gameover') {
        if (e.code === 'Space' || e.code === 'Enter') {
          startGame();
        }
        return;
      }
      if (phaseRef.current !== 'playing') return;

      if (e.code === 'Space' || e.code === 'ArrowUp') {
        triggerAction('primary');
      } else if (e.code === 'ArrowDown') {
        triggerAction('secondary');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        releaseAction('primary');
      } else if (e.code === 'ArrowDown') {
        releaseAction('secondary');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [startGame, triggerAction, releaseAction, togglePause]);

  // ---- Pointer (split the field: left = primary, right = secondary) ----
  const pointerIntent = useRef<Map<number, 'primary' | 'secondary'>>(new Map());

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (phaseRef.current !== 'playing') return;
      const rect = e.currentTarget.getBoundingClientRect();
      const intent: 'primary' | 'secondary' =
        e.clientX - rect.left < rect.width / 2 ? 'primary' : 'secondary';
      pointerIntent.current.set(e.pointerId, intent);
      triggerAction(intent);
    },
    [triggerAction],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const intent = pointerIntent.current.get(e.pointerId);
      if (intent) {
        releaseAction(intent);
        pointerIntent.current.delete(e.pointerId);
      }
    },
    [releaseAction],
  );

  // ---- Rendering ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle DPR + responsive sizing.
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(rect.width * dpr);
    const ph = Math.round(rect.height * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const sx = canvas.width / WORLD.width;
    const sy = canvas.height / WORLD.height;

    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);

    const rt = runtimeRef.current;
    const inverted = rt.mode === 'inverted';
    const accent = inverted ? '#fb7185' : '#38bdf8';

    // Ground line
    ctx.strokeStyle = 'rgba(148,163,184,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, WORLD.groundY + 1);
    ctx.lineTo(WORLD.width, WORLD.groundY + 1);
    ctx.stroke();

    // Subtle ground hatching for a sense of motion
    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.lineWidth = 1;
    const dashOffset = (Date.now() / 8) % 40;
    for (let x = -dashOffset; x < WORLD.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, WORLD.groundY + 8);
      ctx.lineTo(x + 18, WORLD.groundY + 8);
      ctx.stroke();
    }

    // Obstacles
    for (const obs of rt.obstacles) {
      if (obs.type === 'low') {
        ctx.fillStyle = '#f59e0b';
        roundRect(ctx, obs.x, obs.y, obs.width, obs.height, 6);
        ctx.fill();
        // spike top accent
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        roundRect(ctx, obs.x + 4, obs.y + 4, obs.width - 8, 6, 3);
        ctx.fill();
      } else {
        ctx.fillStyle = '#a78bfa';
        roundRect(ctx, obs.x, obs.y, obs.width, obs.height, 6);
        ctx.fill();
        // tether up to the ceiling so it reads as "overhead"
        ctx.strokeStyle = 'rgba(167,139,250,0.4)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(obs.x + obs.width / 2, 0);
        ctx.lineTo(obs.x + obs.width / 2, obs.y);
        ctx.stroke();
      }
    }

    // Player
    const box = playerBox(rt.playerY, rt.ducking);
    ctx.fillStyle = accent;
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    // eye to show a facing / liveliness
    ctx.fillStyle = 'rgba(4,18,31,0.85)';
    const eyeY = box.y + Math.min(14, box.h * 0.3);
    ctx.beginPath();
    ctx.arc(box.x + box.w - 12, eyeY, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  // ---- Main loop ----
  useEffect(() => {
    if (phase !== 'playing') {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Still render one frame for paused/gameover/menu so the canvas reflects state.
      if (phase === 'paused' || phase === 'gameover') {
        draw();
      }
      return;
    }

    const cfg = DIFFICULTY_CONFIG[difficultyRef.current];

    const tick = (time: number) => {
      const rt = runtimeRef.current;
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = time;
      }
      // Clamp dt to avoid huge jumps after a tab is backgrounded.
      const dt = Math.min(0.05, (time - lastTimeRef.current) / 1000);
      lastTimeRef.current = time;

      // Physics
      const wantJump = rt.wantJump;
      rt.wantJump = false;
      const p = stepPlayer(rt.playerY, rt.velocityY, dt, wantJump);
      rt.playerY = p.playerY;
      rt.velocityY = p.velocityY;
      rt.ducking = rt.duckHeld && p.onGround;

      // Control flip timer
      rt.swapTimerMs -= dt * 1000;
      if (rt.swapTimerMs <= 0) {
        rt.mode = rt.mode === 'normal' ? 'inverted' : 'normal';
        rt.swapTimerMs = cfg.swapIntervalMs;
        // Clear held ducks so a stuck key doesn't carry the wrong action across a flip.
        rt.duckHeld = false;
      }

      // Scroll + spawn
      const speed = speedForScore(rt.score, cfg);
      rt.spawnTimer -= dt;
      for (const obs of rt.obstacles) {
        obs.x -= speed * dt;
      }
      rt.obstacles = rt.obstacles.filter((o) => o.x + o.width > -60);

      if (rt.spawnTimer <= 0) {
        rt.obstacles.push(createObstacle(rt.nextObstacleId, cfg));
        rt.nextObstacleId += 1;
        const gap = cfg.minSpawnGap + Math.random() * (cfg.maxSpawnGap - cfg.minSpawnGap);
        // Scale spawn gap down slightly with speed so density stays fair.
        rt.spawnTimer = gap * (cfg.baseSpeed / speed);
      }

      // Scoring + collision
      const box = playerBox(rt.playerY, rt.ducking);
      let dead = false;
      for (const obs of rt.obstacles) {
        if (!obs.scored && obs.x + obs.width < WORLD.playerX) {
          obs.scored = true;
          rt.score += 1;
        }
        if (intersects(box.x, box.y, box.w, box.h, obs.x, obs.y, obs.width, obs.height)) {
          dead = true;
        }
      }

      draw();

      // Throttle HUD react-state updates (~15fps) to avoid re-render churn.
      hudAccumRef.current += dt;
      if (hudAccumRef.current >= 0.066 || dead) {
        hudAccumRef.current = 0;
        setHud({ score: rt.score, mode: rt.mode, swapTimerMs: Math.max(0, rt.swapTimerMs) });
      }

      if (dead) {
        const finalScore = rt.score;
        if (finalScore > highScore) {
          setIsNewBest(true);
          updateHighScore(finalScore);
        }
        setPhase('gameover');
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // draw is stable via useCallback; highScore/updateHighScore intentionally captured fresh per start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Redraw idle frames when mode colors or phase change.
  useEffect(() => {
    draw();
  }, [draw, hud.mode, phase]);

  const cfgSwap = config.swapIntervalMs;
  const swapSeconds = Math.ceil(hud.swapTimerMs / 1000);
  const showFlipWarn = phase === 'playing' && hud.swapTimerMs <= FLIP_WARN_MS;
  const swapPct = Math.max(0, Math.min(100, (hud.swapTimerMs / cfgSwap) * 100));
  const modeIsInverted = hud.mode === 'inverted';

  const diffLabel: Record<Difficulty, string> = {
    easy: copy.easy,
    medium: copy.medium,
    hard: copy.hard,
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.tagline}>{copy.tagline}</p>
      </header>

      <div className={styles.hud}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{copy.score}</span>
          <span className={styles.statValue}>{hud.score}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{copy.best}</span>
          <span className={styles.statValue}>{highScore}</span>
        </div>
        <div
          className={`${styles.stat} ${styles.modeStat} ${modeIsInverted ? styles.modeInverted : styles.modeNormal}`}
          aria-live="polite"
        >
          <span className={styles.statLabel}>{copy.mode}</span>
          <span
            className={`${styles.statValue} ${modeIsInverted ? styles.modeValueInverted : styles.modeValueNormal}`}
          >
            {modeIsInverted ? copy.modeInverted : copy.modeNormal}
          </span>
        </div>
        <div className={styles.stat} style={{ color: modeIsInverted ? '#fb7185' : '#38bdf8' }}>
          <span className={styles.statLabel}>{copy.swapIn}</span>
          <span className={styles.statValue} style={{ color: 'var(--games-route-fg)' }}>
            {copy.seconds(Math.max(0, swapSeconds))}
          </span>
          <div className={styles.swapBarTrack}>
            <div className={styles.swapBarFill} style={{ width: `${swapPct}%` }} />
          </div>
        </div>
      </div>

      <div
        className={`${styles.stage} ${modeIsInverted ? styles.stageInverted : ''}`}
        role="application"
        aria-label={copy.a11yPlayfield}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <canvas ref={canvasRef} className={styles.canvas} />

        {showFlipWarn && (
          <div className={styles.flipWarn}>⟲ {copy.swapIn} {copy.seconds(Math.max(1, swapSeconds))}</div>
        )}

        {phase === 'paused' && (
          <div className={styles.overlay}>
            <h2 className={styles.overlayTitle}>{copy.paused}</h2>
            <button type="button" className={styles.primaryButton} onClick={togglePause}>
              {copy.resume}
            </button>
          </div>
        )}

        {(phase === 'menu' || phase === 'gameover') && (
          <div className={styles.overlay}>
            <h2 className={styles.overlayTitle}>
              {phase === 'menu' ? copy.ready : copy.gameOver}
            </h2>
            {phase === 'gameover' && (
              <>
                <p className={styles.overlaySub}>
                  {copy.finalScore}: {hud.score}
                </p>
                {isNewBest && <p className={styles.newBest}>🏆 {copy.newBest}</p>}
              </>
            )}

            {phase === 'menu' && (
              <div className={styles.diffRow} role="group" aria-label={copy.difficulty}>
                {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`${styles.diffButton} ${difficulty === d ? styles.diffActive : ''}`}
                    aria-pressed={difficulty === d}
                    onClick={() => setDifficulty(d)}
                  >
                    {diffLabel[d]}
                  </button>
                ))}
              </div>
            )}

            <button type="button" className={styles.primaryButton} onClick={startGame}>
              {phase === 'menu' ? copy.start : copy.retry}
            </button>
            <p className={styles.overlayHint}>{copy.tapHint}</p>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <p className={styles.controlsHint}>
          {copy.controlKeyboard}
          <br />
          {copy.controlTouch}
        </p>
        <div className={styles.actionButtons}>
          {(phase === 'playing' || phase === 'paused') && (
            <button type="button" className={styles.ghostButton} onClick={togglePause}>
              {phase === 'paused' ? (
                <Play className={styles.ghostIcon} />
              ) : (
                <Pause className={styles.ghostIcon} />
              )}
              {phase === 'paused' ? copy.resume : copy.pause}
            </button>
          )}
          {phase !== 'menu' && (
            <button type="button" className={styles.ghostButton} onClick={startGame}>
              <RotateCcw className={styles.ghostIcon} />
              {copy.retry}
            </button>
          )}
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => setInfoOpen(true)}
            aria-label={copy.howToPlay}
          >
            <Info className={styles.ghostIcon} />
            {copy.howToPlay}
          </button>
        </div>
      </div>

      <InfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title={copy.instrTitle}>
        <div className={styles.modalBody}>
          <div className={styles.modalSection}>
            <ol className={styles.modalList}>
              {copy.instr.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </div>
          <div className={styles.modalSection}>
            <h3>{copy.controlsHeading}</h3>
            <ul className={styles.modalList} style={{ listStyle: 'none', paddingLeft: 0 }}>
              <li>
                <span className={styles.modalKbd}>Space</span> / <span className={styles.modalKbd}>↑</span> — {copy.primaryControl}
              </li>
              <li>
                <span className={styles.modalKbd}>↓</span> — {copy.secondaryControl}
              </li>
              <li>
                <span className={styles.modalKbd}>P</span> — {copy.pause}
              </li>
            </ul>
            <p style={{ margin: '0.5rem 0 0', color: 'var(--games-route-muted)' }}>{copy.invertNote}</p>
          </div>
        </div>
      </InfoModal>
    </div>
  );
};

// --- canvas helpers ---
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

export default ReverseJump;
