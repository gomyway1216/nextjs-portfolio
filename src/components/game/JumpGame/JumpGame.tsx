'use client';

import { useGameToolbar } from '@/contexts/GameToolbarContext';
import { useHighScore } from '@/hooks/useHighScore';
import { Info, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import { getJumpGameUITranslation, getUITranslation } from '../constants/gameTranslations';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { InfoModal } from '../common/InfoModal';
import {
  checkCircleSquareCollision,
  checkCollision,
  createEnemy,
  dodgePoints,
  getDifficultyMultiplier,
  getJumpImpulse,
  stageForScore,
} from './gameLogic';
import { Enemy, GAME_CONSTANTS, GameState, Scene } from './types';
import styles from './JumpGame.module.css';

type Difficulty = 'easy' | 'medium' | 'hard';

const {
  CANVAS_SIZE,
  GROUND_Y,
  GROUND_LINE_Y,
  CHARACTER_X,
  CHARACTER_RADIUS,
  MAX_LIVES,
  HEART_SPAWN_INTERVAL,
  INVINCIBILITY_FRAMES,
  SHIELD_FRAMES,
  SLOWMO_FRAMES,
  SLOWMO_FACTOR,
} = GAME_CONSTANTS;

const infoCardStyles = [
  { icon: '⌨️', color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.1)', border: 'rgba(14, 165, 233, 0.3)' },
  { icon: '🎯', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)' },
  { icon: '⭐', color: '#eab308', bg: 'rgba(234, 179, 8, 0.1)', border: 'rgba(234, 179, 8, 0.3)' },
  { icon: '⚡', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)' },
  { icon: '❤️', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)' },
  { icon: '💕', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)' },
  { icon: '🛡️', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)' },
  { icon: '💎', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)' },
  { icon: '🔥', color: '#eab308', bg: 'rgba(234, 179, 8, 0.1)', border: 'rgba(234, 179, 8, 0.3)' },
] as const;

// Parallax mountain / cloud layers, generated once for a stable skyline.
const CLOUDS = [
  { x: 60, y: 90, s: 26, speed: 0.18 },
  { x: 220, y: 60, s: 20, speed: 0.24 },
  { x: 360, y: 110, s: 30, speed: 0.14 },
  { x: 470, y: 70, s: 22, speed: 0.2 },
];
const HILLS = [
  { x: 40, w: 150, h: 70, speed: 0.5 },
  { x: 200, w: 190, h: 95, speed: 0.5 },
  { x: 380, w: 160, h: 78, speed: 0.5 },
  { x: 520, w: 200, h: 100, speed: 0.5 },
];

const JumpGame = () => {
  useFeatureLifecycle('game.jump-game');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { setContent } = useGameToolbar();
  const { language } = useGameLanguage();
  const ui = getUITranslation(language);
  const jumpCopy = getJumpGameUITranslation(language);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [highScore, updateHighScore] = useHighScore('jumpgame');
  const [showInfo, setShowInfo] = useState(false);
  const [showDifficultySelect, setShowDifficultySelect] = useState(true);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium');
  const [currentStage, setCurrentStage] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const jumpCopyRef = useRef(jumpCopy);
  const gameStateRef = useRef<GameState | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  // Latest values the rAF loop needs, kept in refs so the loop never captures
  // a stale closure (the classic requestAnimationFrame bug).
  const updateHighScoreRef = useRef(updateHighScore);
  const selectedDifficultyRef = useRef<Difficulty>(selectedDifficulty);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    jumpCopyRef.current = jumpCopy;
  }, [jumpCopy]);

  useEffect(() => {
    updateHighScoreRef.current = updateHighScore;
  }, [updateHighScore]);

  useEffect(() => {
    selectedDifficultyRef.current = selectedDifficulty;
  }, [selectedDifficulty]);

  // Initialize audio context once.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const AudioContextConstructor =
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextConstructor) {
          throw new Error('Web Audio API not available');
        }
        audioContextRef.current = new AudioContextConstructor();
      } catch {
        console.warn('Web Audio API not available');
      }
    }
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const createSound = useCallback(
    (frequency: number, duration: number, type: OscillatorType = 'sine') => {
      if (isMutedRef.current || !audioContextRef.current || typeof window === 'undefined') return;
      try {
        const audioContext = audioContextRef.current;
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = frequency;
        oscillator.type = type;
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
      } catch {
        // Silently ignore audio failures.
      }
    },
    []
  );

  const playJumpSound = useCallback(() => {
    createSound(400, 0.1, 'square');
    setTimeout(() => createSound(600, 0.1, 'square'), 50);
  }, [createSound]);

  const playScoreSound = useCallback(() => {
    createSound(800, 0.08, 'sine');
    setTimeout(() => createSound(1000, 0.08, 'sine'), 40);
    setTimeout(() => createSound(1200, 0.12, 'sine'), 80);
  }, [createSound]);

  const playCollisionSound = useCallback(() => {
    createSound(100, 0.3, 'sawtooth');
  }, [createSound]);

  const playStageCompleteSound = useCallback(() => {
    createSound(600, 0.1, 'sine');
    setTimeout(() => createSound(700, 0.1, 'sine'), 70);
    setTimeout(() => createSound(800, 0.1, 'sine'), 140);
    setTimeout(() => createSound(1000, 0.15, 'sine'), 210);
  }, [createSound]);

  const playPowerupSound = useCallback(() => {
    createSound(1000, 0.08, 'sine');
    setTimeout(() => createSound(1200, 0.08, 'sine'), 40);
    setTimeout(() => createSound(1400, 0.08, 'sine'), 80);
    setTimeout(() => createSound(1600, 0.12, 'sine'), 120);
  }, [createSound]);

  const playHealSound = useCallback(() => {
    createSound(800, 0.1, 'sine');
    setTimeout(() => createSound(1000, 0.1, 'sine'), 60);
    setTimeout(() => createSound(1200, 0.15, 'sine'), 120);
  }, [createSound]);

  const initGame = useCallback((difficulty: Difficulty): GameState => {
    const multiplier = getDifficultyMultiplier(difficulty);
    const baseSpeed = 5 * multiplier;

    const firstEnemy = createEnemy(baseSpeed, 1, difficulty, []);
    const enemies: Enemy[] = [firstEnemy];

    if (difficulty !== 'easy') {
      const secondEnemy = createEnemy(baseSpeed, 1, difficulty, [firstEnemy]);
      secondEnemy.x = 900;
      enemies.push(secondEnemy);
    }

    return {
      characterPosX: CHARACTER_X,
      characterPosY: GROUND_Y,
      characterR: CHARACTER_RADIUS,
      speed: 0,
      acceleration: 0,
      enemies,
      powerups: [],
      baseSpeed,
      score: 0,
      scene: Scene.GameMain,
      frameCount: 0,
      stage: 1,
      difficulty,
      combo: 0,
      bestCombo: 0,
      hasShield: false,
      shieldTimer: 0,
      slowMoTimer: 0,
      lives: MAX_LIVES,
      maxLives: MAX_LIVES,
      lastHeartSpawn: 0,
      invincibilityTimer: 0,
    };
  }, []);

  const triggerJumpAction = useCallback(() => {
    const state = gameStateRef.current;
    if (!state) return;

    if (state.scene === Scene.GameMain) {
      // Only jump when grounded (prevents mid-air double jumps).
      if (state.characterPosY >= GROUND_Y && state.speed === 0) {
        const { speed, acceleration } = getJumpImpulse();
        state.speed = speed;
        state.acceleration = acceleration;
        playJumpSound();
      }
    } else if (state.scene === Scene.GameOver) {
      if (state.frameCount > 60) {
        gameStateRef.current = initGame(state.difficulty as Difficulty);
        setCurrentStage(1);
      }
    }
  }, [initGame, playJumpSound]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Only act while a game is running; otherwise leave Space/ArrowUp to the
      // page (scrolling, activating the difficulty-screen buttons, etc.).
      if (!gameStateRef.current) return;
      // Only intercept the game controls; leave other keys (tab, devtools) alone.
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        triggerJumpAction();
      }
    },
    [triggerJumpAction]
  );
  const handleKeyDownRef = useRef(handleKeyDown);
  useEffect(() => {
    handleKeyDownRef.current = handleKeyDown;
  }, [handleKeyDown]);

  /**
   * Advance the simulation by `dt` (1 = one 60fps frame). Delta-time keeps the
   * game running at the same pace on 60/120/144Hz displays.
   */
  const update = useCallback(
    (state: GameState, dt: number) => {
      if (state.scene === Scene.GameMain) {
        // Character physics.
        state.speed += state.acceleration * dt;
        state.characterPosY += state.speed * dt;
        if (state.characterPosY > GROUND_Y) {
          state.characterPosY = GROUND_Y;
          state.speed = 0;
          state.acceleration = 0;
        }

        // Timers (counted in frames).
        if (state.shieldTimer > 0) {
          state.shieldTimer = Math.max(0, state.shieldTimer - dt);
          if (state.shieldTimer === 0) state.hasShield = false;
        }
        if (state.slowMoTimer > 0) state.slowMoTimer = Math.max(0, state.slowMoTimer - dt);
        if (state.invincibilityTimer > 0) {
          state.invincibilityTimer = Math.max(0, state.invincibilityTimer - dt);
        }

        // Heart every 30s if not already present.
        if (
          state.frameCount - state.lastHeartSpawn > HEART_SPAWN_INTERVAL &&
          state.powerups.every((p) => p.type !== 'heart')
        ) {
          state.powerups.push({ x: 600, y: GROUND_Y, r: 12, type: 'heart' });
          state.lastHeartSpawn = state.frameCount;
        }

        const slowMoMultiplier = state.slowMoTimer > 0 ? SLOWMO_FACTOR : 1.0;

        // Enemies.
        for (let i = state.enemies.length - 1; i >= 0; i--) {
          const enemy = state.enemies[i];
          enemy.x -= enemy.speed * slowMoMultiplier * dt;

          if (enemy.x < -100) {
            state.enemies.splice(i, 1);
            state.combo++;
            state.bestCombo = Math.max(state.bestCombo, state.combo);
            state.score += dodgePoints(state.combo);
            playScoreSound();

            state.enemies.push(
              createEnemy(state.baseSpeed, state.stage, state.difficulty as Difficulty, state.enemies)
            );

            // 10% chance to drop a shield/slow powerup (max 2 on field).
            if (Math.random() < 0.1 && state.powerups.filter((p) => p.type !== 'heart').length < 2) {
              const powerupType: 'shield' | 'slow' = Math.random() < 0.5 ? 'shield' : 'slow';
              state.powerups.push({ x: 600, y: 350 - Math.random() * 150, r: 12, type: powerupType });
            }

            // Stage derived from score so it can't desync.
            const nextStage = stageForScore(state.score);
            if (nextStage > state.stage) {
              state.stage = nextStage;
              setCurrentStage(state.stage);
              playStageCompleteSound();
              if (state.stage % 3 === 0 && state.enemies.length < 3) {
                state.enemies.push(
                  createEnemy(state.baseSpeed, state.stage, state.difficulty as Difficulty, state.enemies)
                );
              }
            }

            updateHighScoreRef.current(state.score);
          }
        }

        // Powerups.
        for (let i = state.powerups.length - 1; i >= 0; i--) {
          const powerup = state.powerups[i];
          powerup.x -= state.baseSpeed * slowMoMultiplier * dt;

          if (powerup.x < -50) {
            state.powerups.splice(i, 1);
            continue;
          }

          if (
            checkCollision(
              state.characterPosX,
              state.characterPosY,
              state.characterR,
              powerup.x,
              powerup.y,
              powerup.r
            )
          ) {
            if (powerup.type === 'shield') {
              playPowerupSound();
              state.hasShield = true;
              state.shieldTimer = SHIELD_FRAMES;
              state.powerups.splice(i, 1);
            } else if (powerup.type === 'slow') {
              playPowerupSound();
              state.slowMoTimer = SLOWMO_FRAMES;
              state.powerups.splice(i, 1);
            } else if (powerup.type === 'heart' && state.lives < state.maxLives) {
              playHealSound();
              state.lives++;
              state.powerups.splice(i, 1);
            }
          }
        }

        // Enemy collision (square hitbox) unless invincible.
        if (state.invincibilityTimer <= 0) {
          state.invincibilityTimer = 0;
          for (const enemy of state.enemies) {
            if (
              checkCircleSquareCollision(
                state.characterPosX,
                state.characterPosY,
                state.characterR,
                enemy.x,
                enemy.y,
                enemy.r
              )
            ) {
              if (state.hasShield) {
                state.hasShield = false;
                state.shieldTimer = 0;
                playPowerupSound();
                state.invincibilityTimer = 60;
              } else {
                state.lives--;
                state.combo = 0;
                playCollisionSound();
                if (state.lives <= 0) {
                  state.scene = Scene.GameOver;
                  state.frameCount = 0;
                } else {
                  state.invincibilityTimer = INVINCIBILITY_FRAMES;
                }
              }
              break;
            }
          }
        }
      } else if (state.scene === Scene.GameOver) {
        for (const enemy of state.enemies) {
          enemy.x -= enemy.speed * dt;
        }
      }

      state.frameCount += dt;
    },
    [
      playCollisionSound,
      playHealSound,
      playPowerupSound,
      playScoreSound,
      playStageCompleteSound,
    ]
  );
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, state: GameState) => {
    const slow = state.slowMoTimer > 0;
    // Sky gradient (blue-tinted during slow-mo).
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_SIZE);
    if (slow) {
      sky.addColorStop(0, '#0b1d4d');
      sky.addColorStop(1, '#071233');
    } else {
      sky.addColorStop(0, '#0b1220');
      sky.addColorStop(0.55, '#111a2e');
      sky.addColorStop(1, '#1a2540');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Stars (static twinkle).
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 24; i++) {
      const sx = (i * 71 + 20) % CANVAS_SIZE;
      const sy = (i * 43 + 15) % 190;
      const tw = 0.35 + 0.35 * Math.sin(state.frameCount * 0.05 + i);
      ctx.globalAlpha = tw;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Parallax clouds.
    for (const c of CLOUDS) {
      const cx = ((c.x - state.frameCount * c.speed) % (CANVAS_SIZE + 80) + CANVAS_SIZE + 80) % (CANVAS_SIZE + 80) - 40;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.beginPath();
      ctx.arc(cx, c.y, c.s, 0, Math.PI * 2);
      ctx.arc(cx + c.s * 0.9, c.y + 6, c.s * 0.75, 0, Math.PI * 2);
      ctx.arc(cx - c.s * 0.9, c.y + 6, c.s * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Parallax hills.
    for (const h of HILLS) {
      const period = CANVAS_SIZE + h.w;
      const hx = ((h.x - state.frameCount * h.speed) % period + period) % period - h.w / 2;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.55)';
      ctx.beginPath();
      ctx.moveTo(hx - h.w / 2, GROUND_LINE_Y);
      ctx.quadraticCurveTo(hx, GROUND_LINE_Y - h.h, hx + h.w / 2, GROUND_LINE_Y);
      ctx.closePath();
      ctx.fill();
    }

    // Ground.
    ctx.fillStyle = '#0a0f1c';
    ctx.fillRect(0, GROUND_LINE_Y, CANVAS_SIZE, CANVAS_SIZE - GROUND_LINE_Y);
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_LINE_Y);
    ctx.lineTo(CANVAS_SIZE, GROUND_LINE_Y);
    ctx.stroke();

    // Scrolling ground dashes for a sense of speed.
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 3;
    const dashGap = 40;
    const offset = (state.frameCount * state.baseSpeed) % dashGap;
    ctx.beginPath();
    for (let x = -offset; x < CANVAS_SIZE; x += dashGap) {
      ctx.moveTo(x, GROUND_LINE_Y + 16);
      ctx.lineTo(x + 18, GROUND_LINE_Y + 16);
    }
    ctx.stroke();
  }, []);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, state: GameState) => {
      const copy = jumpCopyRef.current;
      ctx.imageSmoothingEnabled = true;

      drawBackground(ctx, state);

      // Powerups.
      for (const powerup of state.powerups) {
        ctx.save();
        ctx.translate(powerup.x, powerup.y);
        ctx.rotate((state.frameCount * Math.PI * 2) / 90);
        ctx.shadowBlur = 12;
        if (powerup.type === 'shield') {
          ctx.shadowColor = '#22c55e';
          ctx.fillStyle = '#22c55e';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 * i) / 6;
            const x = Math.cos(angle) * powerup.r;
            const y = Math.sin(angle) * powerup.r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (powerup.type === 'slow') {
          ctx.shadowColor = '#a855f7';
          ctx.fillStyle = '#a855f7';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -powerup.r);
          ctx.lineTo(powerup.r, 0);
          ctx.lineTo(0, powerup.r);
          ctx.lineTo(-powerup.r, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (powerup.type === 'heart') {
          ctx.shadowColor = '#ef4444';
          ctx.fillStyle = '#ef4444';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          const r = powerup.r;
          ctx.beginPath();
          ctx.moveTo(0, r / 4);
          ctx.bezierCurveTo(-r, -r / 2, -r * 1.5, r / 2, 0, r * 1.5);
          ctx.bezierCurveTo(r * 1.5, r / 2, r, -r / 2, 0, r / 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }

      // Enemies (rounded squares with glow).
      for (const enemy of state.enemies) {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(239, 68, 68, 0.7)';
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        const size = enemy.r * 2;
        const rad = 5;
        const x = enemy.x - enemy.r;
        const y = enemy.y - enemy.r;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, size, size, rad);
        } else {
          ctx.rect(x, y, size, size);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        if (enemy.type === 'high') {
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(enemy.x - 3, enemy.y - 3, 6, 6);
        }
      }

      // Character.
      const isFlashing = state.invincibilityTimer > 0 && !state.hasShield;
      const showCharacter = !isFlashing || state.frameCount % 10 < 5;
      if (showCharacter) {
        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = 'rgba(14, 165, 233, 0.8)';
        const grad = ctx.createRadialGradient(
          state.characterPosX - 5,
          state.characterPosY - 5,
          2,
          state.characterPosX,
          state.characterPosY,
          state.characterR
        );
        grad.addColorStop(0, '#7dd3fc');
        grad.addColorStop(1, '#0284c7');
        ctx.fillStyle = grad;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(state.characterPosX, state.characterPosY, state.characterR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Shield ring.
      if (state.hasShield) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(state.characterPosX, state.characterPosY, state.characterR + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (state.scene === Scene.GameMain) {
        // Score.
        ctx.fillStyle = 'rgb(255,255,255)';
        ctx.font = 'bold 16pt Arial';
        const scoreLabel = `${copy.score.toUpperCase()}: ${state.score}`;
        const scoreLabelWidth = ctx.measureText(scoreLabel).width;
        ctx.fillText(scoreLabel, 460 - scoreLabelWidth, 40);

        // Lives.
        for (let i = 0; i < state.lives; i++) {
          ctx.fillStyle = '#ef4444';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          const heartX = 460 - i * 25;
          const heartY = 60;
          const hs = 8;
          ctx.save();
          ctx.translate(heartX, heartY);
          ctx.beginPath();
          ctx.moveTo(0, hs / 4);
          ctx.bezierCurveTo(-hs, -hs / 2, -hs * 1.5, hs / 2, 0, hs * 1.5);
          ctx.bezierCurveTo(hs * 1.5, hs / 2, hs, -hs / 2, 0, hs / 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        // Combo.
        if (state.combo > 1) {
          ctx.fillStyle = '#eab308';
          ctx.font = 'bold 12pt Arial';
          ctx.fillText(`${copy.combo.toUpperCase()} x${state.combo}`, 20, 460);
        }

        // Stage.
        if (state.stage > 1) {
          ctx.fillStyle = '#eab308';
          ctx.font = 'bold 14pt Arial';
          ctx.fillText(`${copy.stage.toUpperCase()} ${state.stage}`, 20, 40);
        }

        // Active effects.
        let effectY = 70;
        if (state.slowMoTimer > 0) {
          ctx.fillStyle = '#a855f7';
          ctx.font = 'bold 10pt Arial';
          ctx.fillText(`${copy.slowMo.toUpperCase()}: ${Math.ceil(state.slowMoTimer / 60)}s`, 20, effectY);
          effectY += 20;
        }
        if (state.shieldTimer > 0) {
          ctx.fillStyle = '#22c55e';
          ctx.font = 'bold 10pt Arial';
          ctx.fillText(`${copy.shield.toUpperCase()}: ${Math.ceil(state.shieldTimer / 60)}s`, 20, effectY);
          effectY += 20;
        }
        if (state.invincibilityTimer > 0) {
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 10pt Arial';
          ctx.fillText(`${copy.invincible.toUpperCase()}: ${Math.ceil(state.invincibilityTimer / 60)}s`, 20, effectY);
        }
      } else if (state.scene === Scene.GameOver) {
        const fadeAlpha = Math.min(state.frameCount / 60, 0.72);
        ctx.fillStyle = `rgba(2, 6, 16, ${fadeAlpha})`;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        // Explosion particles.
        if (state.frameCount < 60) {
          const particleCount = 22;
          for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const dist = state.frameCount * 3;
            const x = state.characterPosX + Math.cos(angle) * dist;
            const y = state.characterPosY + Math.sin(angle) * dist;
            const alpha = 1 - state.frameCount / 60;
            const size = 6 - (state.frameCount / 60) * 4;
            ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Score in corner.
        ctx.fillStyle = 'rgb(255,255,255)';
        ctx.font = 'bold 16pt Arial';
        const scoreLabel = `${copy.score.toUpperCase()}: ${state.score}`;
        const scoreLabelWidth = ctx.measureText(scoreLabel).width;
        ctx.fillText(scoreLabel, 460 - scoreLabelWidth, 40);

        if (state.frameCount > 30) {
          const textAlpha = Math.min((state.frameCount - 30) / 30, 1);
          const textScale = 0.5 + Math.min((state.frameCount - 30) / 30, 1) * 0.5;
          ctx.save();
          ctx.translate(240, 190);
          ctx.scale(textScale, textScale);
          ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha})`;
          ctx.font = 'bold 46pt Arial';
          const gameOverLabel = copy.gameOver.toUpperCase();
          const gameOverWidth = ctx.measureText(gameOverLabel).width;
          ctx.fillText(gameOverLabel, -gameOverWidth / 2, 0);
          ctx.restore();

          if (state.frameCount > 45) {
            const a = Math.min((state.frameCount - 45) / 30, 1);
            ctx.fillStyle = `rgba(56, 189, 248, ${a})`;
            ctx.font = 'bold 24pt Arial';
            const finalScoreLabel = `${copy.finalScore}: ${state.score}`;
            const finalScoreWidth = ctx.measureText(finalScoreLabel).width;
            ctx.fillText(finalScoreLabel, 240 - finalScoreWidth / 2, 250);

            if (state.bestCombo > 1) {
              ctx.fillStyle = `rgba(234, 179, 8, ${a})`;
              ctx.font = 'bold 15pt Arial';
              const comboLabel = `${copy.combo.toUpperCase()} x${state.bestCombo}`;
              const comboWidth = ctx.measureText(comboLabel).width;
              ctx.fillText(comboLabel, 240 - comboWidth / 2, 284);
            }
          }
        }

        if (state.frameCount > 60) {
          const blinkAlpha = Math.sin(state.frameCount * 0.1) * 0.3 + 0.7;
          ctx.fillStyle = `rgba(56, 189, 248, ${blinkAlpha})`;
          ctx.font = 'bold 16pt Arial';
          const restartLabel = copy.restartPrompt;
          const restartWidth = ctx.measureText(restartLabel).width;
          ctx.fillText(restartLabel, 240 - restartWidth / 2, 324);
        }
      }
    },
    [drawBackground]
  );
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // The loop is fully stable: it reads all mutable state through refs, so it
  // never captures a stale closure and can safely re-schedule itself. It reads
  // every mutable value through a ref, so it is defined once and held in a ref.
  const gameLoopRef = useRef<(timestamp: number) => void>(() => {});
  useEffect(() => {
    const loop = (timestamp: number) => {
      if (!canvasRef.current || !gameStateRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      // Delta-time in 60fps units, clamped to avoid huge jumps after a tab stall.
      if (lastTimeRef.current == null) lastTimeRef.current = timestamp;
      const elapsedMs = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      const dt = Math.min(elapsedMs / (1000 / 60), 3);

      const state = gameStateRef.current;
      updateRef.current(state, dt > 0 ? dt : 1);
      drawRef.current(ctx, state);

      animationIdRef.current = requestAnimationFrame(loop);
    };
    gameLoopRef.current = loop;
  }, []);

  const startGame = useCallback(() => {
    if (!canvasRef.current) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    gameStateRef.current = initGame(selectedDifficultyRef.current);
    setCurrentStage(1);
    setIsGameStarted(true);
    setShowDifficultySelect(false);
    lastTimeRef.current = null;

    animationIdRef.current = requestAnimationFrame((t) => gameLoopRef.current(t));
  }, [initGame]);

  const stopGame = useCallback(() => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }
    gameStateRef.current = null;
    lastTimeRef.current = null;
    setIsGameStarted(false);
    setShowDifficultySelect(true);
    setCurrentStage(1);
  }, []);

  // Single global keydown listener; delegates to the latest handler via ref.
  useEffect(() => {
    const listener = (e: KeyboardEvent) => handleKeyDownRef.current(e);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  // Cleanup rAF on unmount.
  useEffect(() => {
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
      gameStateRef.current = null;
    };
  }, []);

  useEffect(() => {
    const toggleMute = () => {
      const newMutedState = !isMuted;
      setIsMuted(newMutedState);
      isMutedRef.current = newMutedState;
      if (!newMutedState && audioContextRef.current) {
        try {
          const audioContext = audioContextRef.current;
          if (audioContext.state === 'suspended') audioContext.resume();
        } catch {}
      }
    };
    setContent({
      center: (
        <div className={styles.toolbarStats}>
          {isGameStarted && currentStage > 1 && (
            <div className={`${styles.toolbarPill} ${styles.stagePill}`}>
              <Zap className={styles.toolbarIcon} />
              <div className={styles.toolbarPillText}>
                <div className={styles.toolbarLabel}>{jumpCopy.stage}</div>
                <div className={styles.toolbarValue}>{currentStage}</div>
              </div>
            </div>
          )}
          <div className={`${styles.toolbarPill} ${styles.scorePill}`}>
            <Trophy className={styles.toolbarIcon} />
            <div className={styles.toolbarPillText}>
              <div className={styles.toolbarLabel}>{jumpCopy.highScore}</div>
              <div className={styles.toolbarValue}>{highScore}</div>
            </div>
          </div>
        </div>
      ),
      right: (
        <>
          <button
            type="button"
            onClick={toggleMute}
            className={`${styles.toolbarButton} ${isMuted ? styles.mutedButton : ''}`}
            aria-label={isMuted ? jumpCopy.muted : jumpCopy.sound}
          >
            {isMuted ? <VolumeX className={styles.toolbarButtonIcon} /> : <Volume2 className={styles.toolbarButtonIcon} />}
            <span className={styles.toolbarActionLabel}>{isMuted ? jumpCopy.muted : jumpCopy.sound}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowInfo(!showInfo)}
            className={styles.toolbarButton}
            aria-label={ui.howToPlay}
          >
            <Info className={styles.toolbarButtonIcon} />
            <span className={styles.toolbarActionLabel}>{ui.howToPlay}</span>
          </button>
        </>
      ),
    });
    return () => setContent(null);
  }, [isGameStarted, currentStage, highScore, isMuted, showInfo, setContent, ui.howToPlay, jumpCopy]);

  return (
    <div className={styles.gameShell}>
      <div className={styles.canvasFrame}>
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          role="application"
          aria-label={`${ui.howToPlay} — ${jumpCopy.infoSections[0]?.description ?? ''}`}
          onPointerDown={(e) => {
            e.preventDefault();
            triggerJumpAction();
          }}
          className={styles.gameCanvas}
        />

        {isGameStarted && (
          <div className={styles.hudHint} aria-hidden="true">
            {jumpCopy.infoSections[0]?.description}
          </div>
        )}

        {!isGameStarted && showDifficultySelect && (
          <div className={styles.difficultyOverlay}>
            <h2 className={styles.difficultyTitle}>{jumpCopy.selectDifficulty}</h2>

            <div className={styles.difficultyOptions} role="radiogroup" aria-label={jumpCopy.selectDifficulty}>
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((diff) => {
                const isSelected = selectedDifficulty === diff;
                return (
                  <button
                    key={diff}
                    type="button"
                    role="radio"
                    onClick={() => setSelectedDifficulty(diff)}
                    aria-checked={isSelected}
                    className={styles.difficultyButton}
                    data-difficulty={diff}
                  >
                    <span className={styles.difficultyLabel}>{jumpCopy.difficulties[diff].label}</span>
                    <span className={styles.difficultyDescription}>{jumpCopy.difficulties[diff].description}</span>
                  </button>
                );
              })}
            </div>

            <button type="button" onClick={startGame} className={styles.startButton}>
              {jumpCopy.startGame}
            </button>
          </div>
        )}
      </div>

      {isGameStarted && (
        <div className={styles.stopButtonWrap}>
          <button type="button" onClick={stopGame} className={styles.stopButton}>
            {jumpCopy.stopGame}
          </button>
        </div>
      )}

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title={ui.howToPlay}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          {jumpCopy.infoSections.map((section, index) => {
            // Fall back gracefully if more info sections than card styles are added.
            const style =
              (infoCardStyles as readonly (typeof infoCardStyles)[number][])[index] ??
              { icon: '💡', color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.1)', border: 'rgba(14, 165, 233, 0.3)' };
            return (
              <div
                key={section.title}
                style={{
                  background: style.bg,
                  border: `1px solid ${style.border}`,
                  borderRadius: '0.5rem',
                  padding: '1rem',
                }}
              >
                <div style={{ color: style.color, fontSize: '2rem', marginBottom: '0.5rem' }}>{style.icon}</div>
                <h3 style={{ color: 'var(--games-route-fg)', fontWeight: '600', marginBottom: '0.25rem' }}>
                  {section.title}
                </h3>
                <p style={{ color: 'var(--games-route-muted)', fontSize: '0.875rem' }}>{section.description}</p>
              </div>
            );
          })}
        </div>

        <div
          style={{
            background: 'rgba(14, 165, 233, 0.1)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            borderRadius: '0.5rem',
            padding: '1rem',
          }}
        >
          <div style={{ color: '#0ea5e9', fontWeight: '600', marginBottom: '0.5rem' }}>💡 {jumpCopy.proTipsTitle}</div>
          <ul style={{ color: 'var(--games-route-muted)', fontSize: '0.875rem', paddingLeft: '1.5rem', margin: 0 }}>
            {jumpCopy.proTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      </InfoModal>
    </div>
  );
};

export default JumpGame;
