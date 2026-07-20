/**
 * Space Invaders - React Component with Canvas Rendering
 * Supports both single-player and multiplayer modes.
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, Pause, Play, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { GameTopBar, InfoModal, GameStats } from '../common';
import { useGameLanguage } from '../contexts/GameLanguageContext';
import { useHighScore } from '@/hooks/useHighScore';
import { useFeatureLifecycle } from '@/hooks/useActivityTracker';
import {
  GameState,
  InputState,
  Enemy,
  EnemyType,
  Difficulty,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  SHIELD_BLOCK_SIZE,
  UFO_WIDTH,
  UFO_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
} from './types';
import { createGameState, updateGame } from './GameEngine';
import { getSpaceInvadersStrings } from './i18n';
import { Sounds, initAudio } from './sounds';
import { useMultiplayer } from './useMultiplayer';
import { MultiplayerLobby } from './MultiplayerLobby';
import { toNetworkGameState, MultiplayerPlayer } from './multiplayerTypes';
import styles from './SpaceInvaders.module.css';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

const DIFFICULTY_ACCENTS: Record<Difficulty, string> = {
  easy: '#22c55e',
  normal: '#38bdf8',
  hard: '#f43f5e',
};

// Color helpers for multiplayer
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 34, g: 197, b: 94 };
}

function lightenColor(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const lighten = (c: number) => Math.min(255, Math.floor(c + (255 - c) * percent));
  return `rgb(${lighten(r)}, ${lighten(g)}, ${lighten(b)})`;
}

// Draw player ship with customizable color
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string = '#22c55e'
) {
  const gradient = ctx.createLinearGradient(x, y + height, x, y);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.5, lightenColor(color, 0.2));
  gradient.addColorStop(1, lightenColor(color, 0.4));

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(x, y + height);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x + width - 5, y + height * 0.4);
  ctx.lineTo(x + width / 2, y);
  ctx.lineTo(x + 5, y + height * 0.4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0ea5e9';
  ctx.beginPath();
  ctx.arc(x + width / 2, y + height * 0.5, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  const { r, g, b } = hexToRgb(color);
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
  ctx.fillRect(x + 5, y + height - 5, width - 10, 5);
  ctx.shadowBlur = 0;
}

// Draw enemy based on type
function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const { x, y, width, height, type, config, animFrame } = enemy;
  const color = config.color;
  const accent = config.accentColor;

  ctx.fillStyle = color;

  switch (type) {
    case EnemyType.SQUID: {
      ctx.beginPath();
      ctx.ellipse(x + width / 2, y + height * 0.4, width * 0.35, height * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      const tentacleOffset = animFrame === 0 ? -3 : 3;
      ctx.fillRect(x + width * 0.2 + tentacleOffset, y + height * 0.5, 4, height * 0.4);
      ctx.fillRect(x + width * 0.4, y + height * 0.5, 4, height * 0.5);
      ctx.fillRect(x + width * 0.6 - 4, y + height * 0.5, 4, height * 0.5);
      ctx.fillRect(x + width * 0.8 - 4 - tentacleOffset, y + height * 0.5, 4, height * 0.4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + width * 0.35, y + height * 0.25, 5, 5);
      ctx.fillRect(x + width * 0.55, y + height * 0.25, 5, 5);
      break;
    }

    case EnemyType.CRAB: {
      const clawOffset = animFrame === 0 ? -2 : 2;
      ctx.fillRect(x + width * 0.15, y + height * 0.2, width * 0.7, height * 0.5);
      ctx.fillStyle = accent;
      ctx.fillRect(x + width * 0.25, y, width * 0.5, height * 0.3);
      ctx.fillStyle = color;
      ctx.fillRect(x + clawOffset, y + height * 0.3, width * 0.2, height * 0.3);
      ctx.fillRect(x + width * 0.8 - clawOffset, y + height * 0.3, width * 0.2, height * 0.3);
      ctx.fillRect(x + width * 0.2, y + height * 0.7, 5, height * 0.3);
      ctx.fillRect(x + width * 0.4, y + height * 0.7, 5, height * 0.3);
      ctx.fillRect(x + width * 0.55, y + height * 0.7, 5, height * 0.3);
      ctx.fillRect(x + width * 0.75, y + height * 0.7, 5, height * 0.3);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + width * 0.35, y + height * 0.05, 4, 4);
      ctx.fillRect(x + width * 0.55, y + height * 0.05, 4, 4);
      break;
    }

    case EnemyType.OCTOPUS: {
      ctx.beginPath();
      ctx.arc(x + width / 2, y + height * 0.35, width * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      const wave = animFrame === 0 ? 0 : Math.PI;
      for (let i = 0; i < 4; i++) {
        const tx = x + width * 0.15 + i * width * 0.2;
        const ty = y + height * 0.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(tx + 5 + Math.sin(wave + i) * 3, ty + height * 0.25, tx + (animFrame === 0 ? -3 : 3), ty + height * 0.45);
        ctx.lineTo(tx + 8, ty + height * 0.45);
        ctx.quadraticCurveTo(tx + 13 + Math.sin(wave + i) * 3, ty + height * 0.25, tx + 8, ty);
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + width * 0.32, y + height * 0.25, 6, 6);
      ctx.fillRect(x + width * 0.55, y + height * 0.25, 6, 6);
      ctx.fillStyle = '#000';
      ctx.fillRect(x + width * 0.35, y + height * 0.28, 3, 3);
      ctx.fillRect(x + width * 0.58, y + height * 0.28, 3, 3);
      break;
    }
  }
}

// Draw UFO
function drawUFO(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 15;

  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, '#f87171');
  gradient.addColorStop(0.5, '#ef4444');
  gradient.addColorStop(1, '#dc2626');
  ctx.fillStyle = gradient;

  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height * 0.6, width / 2, height * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fca5a5';
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height * 0.4, width * 0.25, height * 0.35, 0, Math.PI, 0);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fef08a';
  for (let i = 0; i < 5; i++) {
    const lx = x + width * 0.15 + i * width * 0.15;
    ctx.beginPath();
    ctx.arc(lx, y + height * 0.6, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

type GameMode = 'menu' | 'single' | 'multi';

const SpaceInvaders: React.FC = () => {
  useFeatureLifecycle('game.space-invaders');
  const { language } = useGameLanguage();
  const t = getSpaceInvadersStrings(language);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [highScore, updateHighScore] = useHighScore('spaceinvaders');

  const inputRef = useRef<InputState>({ left: false, right: false, shoot: false });
  const gameStateRef = useRef<GameState | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lastSyncRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const finishedRef = useRef<boolean>(false);
  // High score at the moment the current run started, so we can tell a genuine
  // beat (score strictly greater) from a tie or a run that never surpassed it.
  const runStartHighScoreRef = useRef<number>(0);
  const diffRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [touchActive, setTouchActive] = useState({ left: false, right: false, shoot: false });

  // WAI-ARIA radio-group keyboard navigation for the difficulty selector:
  // arrow keys move selection (and focus) with wrap-around.
  const handleDifficultyKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIndex = (index + 1) % DIFFICULTIES.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIndex = (index - 1 + DIFFICULTIES.length) % DIFFICULTIES.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = DIFFICULTIES.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    setDifficulty(DIFFICULTIES[nextIndex]);
    diffRefs.current[nextIndex]?.focus();
  }, []);

  // Multiplayer hook
  const multiplayer = useMultiplayer();
  const multiplayerRef = useRef(multiplayer);
  const gameModeRef = useRef<GameMode>('menu');

  // Keep refs in sync outside of render so the RAF loop reads live values.
  useEffect(() => {
    multiplayerRef.current = multiplayer;
  }, [multiplayer]);
  useEffect(() => {
    gameModeRef.current = gameMode;
  }, [gameMode]);

  // Keep the mutable ref in sync when React state is (re)set externally.
  const setActiveGame = useCallback((state: GameState | null) => {
    gameStateRef.current = state;
    setGameState(state);
  }, []);

  // Update high score when the score changes
  const score = gameState?.score;
  useEffect(() => {
    if (score !== undefined) updateHighScore(score);
  }, [score, updateHighScore]);

  const beginGame = useCallback((mode: GameMode) => {
    initAudio();
    Sounds.startGame();
    finishedRef.current = false;
    lastTimeRef.current = 0;
    lastSyncRef.current = 0;
    runStartHighScoreRef.current = highScore;
    const newState = createGameState(1, 0, undefined, mode === 'multi' ? 'normal' : difficulty);
    setActiveGame(newState);
    setGameMode(mode);
    setShowStartScreen(false);
    return newState;
  }, [difficulty, highScore, setActiveGame]);

  const startSinglePlayer = useCallback(() => {
    beginGame('single');
  }, [beginGame]);

  const startMultiplayerGame = useCallback(async () => {
    const newState = beginGame('multi');
    if (multiplayer.context.isHost) {
      const networkState = toNetworkGameState(
        newState.formation, newState.bullets, newState.ufo, newState.shields,
        newState.level, newState.animationTick, newState.marchCounter
      );
      await multiplayer.startGame(networkState);
    }
  }, [beginGame, multiplayer]);

  // Joiner transitions into the game when the host starts. This synchronizes
  // local state with an external system (Firebase RTDB lobby status), so the
  // setState here is intentional.
  useEffect(() => {
    if (
      multiplayer.context.lobbyState === 'playing' &&
      !multiplayer.context.isHost &&
      showStartScreen
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      beginGame('multi');
    }
  }, [multiplayer.context.lobbyState, multiplayer.context.isHost, showStartScreen, beginGame]);

  const startNewGame = useCallback(() => {
    if (gameMode === 'menu') startSinglePlayer();
  }, [gameMode, startSinglePlayer]);

  // Reset / play again
  const resetGame = useCallback(() => {
    finishedRef.current = false;
    lastTimeRef.current = 0;
    lastSyncRef.current = 0;
    runStartHighScoreRef.current = highScore;
    setActiveGame(createGameState(1, 0, undefined, difficulty));
  }, [difficulty, highScore, setActiveGame]);

  // Toggle pause
  const togglePause = useCallback(() => {
    const current = gameStateRef.current;
    if (!current || current.gameOver || current.victory) return;
    const next = { ...current, isPaused: !current.isPaused };
    setActiveGame(next);
  }, [setActiveGame]);

  const backToMenu = useCallback(() => {
    finishedRef.current = false;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    setActiveGame(null);
    setGameMode('menu');
    setShowStartScreen(true);
  }, [setActiveGame]);

  // Keyboard input
  useEffect(() => {
    // Don't swallow keys while the user types into a form field (e.g. the
    // multiplayer lobby name/room inputs) — space there is just a space.
    const isTypingTarget = (target: EventTarget | null): boolean =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        inputRef.current.left = true;
        e.preventDefault();
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        inputRef.current.right = true;
        e.preventDefault();
      }
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        if (showStartScreen) {
          startNewGame();
        } else {
          inputRef.current.shoot = true;
        }
        e.preventDefault();
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        // While the info modal is open, Escape belongs to the modal (which
        // closes itself) — don't also toggle pause in the same keypress.
        if (e.key === 'Escape' && showInfo) return;
        if (!showStartScreen) togglePause();
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // (no typing-target guard here: releasing a key should always clear flags)
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') inputRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') inputRef.current.right = false;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') inputRef.current.shoot = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [showStartScreen, showInfo, togglePause, startNewGame]);

  // Render game to canvas
  const render = useCallback((
    ctx: CanvasRenderingContext2D,
    state: GameState,
    otherPlayer?: MultiplayerPlayer | null,
    myColor: string = '#22c55e',
    otherColor: string = '#3b82f6'
  ) => {
    // Map logical game coordinates onto the DPR-scaled backing store (sized by
    // the ResizeObserver effect); logical coordinates are unchanged.
    const canvas = ctx.canvas;
    ctx.setTransform(canvas.width / CANVAS_WIDTH, 0, 0, canvas.height / CANVAS_HEIGHT, 0, 0);

    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Parallax stars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    for (let i = 0; i < 60; i++) {
      const sx = (i * 37 + state.animationTick * 0.15) % CANVAS_WIDTH;
      const sy = (i * 53) % CANVAS_HEIGHT;
      ctx.fillRect(sx, sy, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }

    // Shields
    ctx.fillStyle = '#22c55e';
    for (const shield of state.shields) {
      for (const block of shield.blocks) {
        if (block.active) ctx.fillRect(block.x, block.y, SHIELD_BLOCK_SIZE, SHIELD_BLOCK_SIZE);
      }
    }

    // Enemies
    for (const enemy of state.formation.enemies) {
      if (enemy.active) drawEnemy(ctx, enemy);
    }

    // UFO
    if (state.ufo && state.ufo.active) drawUFO(ctx, state.ufo.x, state.ufo.y, UFO_WIDTH, UFO_HEIGHT);

    // Other player (multiplayer)
    if (otherPlayer && gameModeRef.current === 'multi') {
      drawPlayer(ctx, otherPlayer.x, state.player.y, PLAYER_WIDTH, PLAYER_HEIGHT, otherColor);
      ctx.fillStyle = otherColor;
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(otherPlayer.name, otherPlayer.x + PLAYER_WIDTH / 2, state.player.y - 10);
    }

    // Player
    drawPlayer(ctx, state.player.x, state.player.y, state.player.width, state.player.height, myColor);

    // Bullets
    for (const bullet of state.bullets) {
      if (bullet.isEnemy) {
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.moveTo(bullet.x + bullet.width / 2, bullet.y);
        ctx.lineTo(bullet.x + bullet.width, bullet.y + bullet.height * 0.33);
        ctx.lineTo(bullet.x, bullet.y + bullet.height * 0.66);
        ctx.lineTo(bullet.x + bullet.width / 2, bullet.y + bullet.height);
        ctx.fill();
      } else {
        const gradient = ctx.createLinearGradient(bullet.x, bullet.y + bullet.height, bullet.x, bullet.y);
        gradient.addColorStop(0, myColor);
        gradient.addColorStop(1, lightenColor(myColor, 0.4));
        ctx.fillStyle = gradient;
        ctx.shadowColor = myColor;
        ctx.shadowBlur = 8;
        ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
      }
      ctx.shadowBlur = 0;
    }

    // Team score (multiplayer)
    if (gameModeRef.current === 'multi' && otherPlayer) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`Team: ${state.score + (otherPlayer.score || 0)}`, 12, 12);
    }

    // Paused overlay
    if (state.isPaused) {
      ctx.fillStyle = 'rgba(3, 6, 16, 0.78)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.paused.toUpperCase(), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.font = '20px Arial';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(t.pausedHint, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
    }

    // Game over overlay
    if (state.gameOver) {
      ctx.fillStyle = 'rgba(3, 6, 16, 0.85)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.gameOver.toUpperCase(), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
      ctx.fillStyle = '#fff';
      ctx.font = '24px Arial';
      ctx.fillText(`${t.finalScore}: ${state.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 10);
      // Show the banner only when this run strictly beat the high score it
      // started with (a tie is not a new record).
      if (state.score > runStartHighScoreRef.current && state.score > 0) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(t.newHighScore, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 46);
      }
    }
  }, [t]);

  // Keep the canvas backing store sized to its displayed rect × device pixel
  // ratio (capped at 2) so it stays crisp on retina displays. A ResizeObserver
  // keeps the layout read out of the frame loop (no per-frame reflow); it
  // fires once on observe() for the initial size.
  useEffect(() => {
    if (showStartScreen) return; // canvas not mounted
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = (width: number, height: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.round(width * dpr);
      const ph = Math.round(height * dpr);
      if (pw > 0 && ph > 0 && (canvas.width !== pw || canvas.height !== ph)) {
        canvas.width = pw;
        canvas.height = ph;
      }
    };
    // Size synchronously so the first frame renders at the right resolution.
    const rect = canvas.getBoundingClientRect();
    resize(rect.width, rect.height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [showStartScreen]);

  // Game loop — single RAF driven by refs (state syncs to React for the HUD).
  useEffect(() => {
    if (!gameState || showStartScreen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameLoop = (timestamp: number) => {
      const state = gameStateRef.current;
      if (!state) return;

      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const deltaTime = Math.min(timestamp - lastTimeRef.current, 50);
      lastTimeRef.current = timestamp;

      const mp = multiplayerRef.current;

      if (!state.isPaused) {
        const soundEvents = updateGame(state, inputRef.current, deltaTime, Date.now());

        if (soundEvents.playerShoot) Sounds.playerShoot();
        if (soundEvents.enemyHit) Sounds.enemyHit();
        if (soundEvents.playerHit) Sounds.playerHit();
        if (soundEvents.ufoSpawn) Sounds.ufoSound();
        if (soundEvents.ufoHit) Sounds.ufoHit();
        if (soundEvents.enemyShoot) Sounds.enemyShoot();
        if (soundEvents.levelComplete) Sounds.levelComplete();
        if (soundEvents.gameOver) Sounds.gameOver();
        if (soundEvents.extraLife) Sounds.levelComplete();
        if (soundEvents.enemyMarch) Sounds.enemyMarch(soundEvents.marchPitch);

        if (gameModeRef.current === 'multi') {
          mp.updateMyPosition(state.player.x);
          mp.updateMyState(state.score, state.lives);
          if (mp.context.isHost) {
            const networkState = toNetworkGameState(
              state.formation, state.bullets, state.ufo, state.shields,
              state.level, state.animationTick, state.marchCounter
            );
            mp.updateGameState(networkState);
          }
        }
      }

      render(ctx, state, mp.otherPlayer, mp.myColor, mp.otherColor);

      // Sync to React ~15x/sec so the DOM HUD updates without re-mounting RAF.
      if (timestamp - lastSyncRef.current > 66) {
        lastSyncRef.current = timestamp;
        setGameState({ ...state });
      }

      if (!state.gameOver && !state.victory) {
        animationFrameRef.current = requestAnimationFrame(gameLoop);
      } else if (!finishedRef.current) {
        finishedRef.current = true;
        setGameState({ ...state });
        if (state.victory) {
          setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
        } else {
          setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
        }
        if (gameModeRef.current === 'multi') {
          mp.endGame(state.victory ? mp.context.playerId : null);
        }
      }
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
    // Restart the loop only when a new game begins or we leave the start screen,
    // NOT on every score/HUD update — the loop reads live state from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStartScreen, gameState === null, render]);

  // Touch control handlers
  const setTouch = useCallback((key: 'left' | 'right' | 'shoot', value: boolean) => {
    initAudio();
    inputRef.current[key] = value;
    setTouchActive(prev => ({ ...prev, [key]: value }));
  }, []);

  const touchHandlers = (key: 'left' | 'right' | 'shoot') => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); setTouch(key, true); },
    onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); setTouch(key, false); },
    onPointerLeave: () => setTouch(key, false),
    onPointerCancel: () => setTouch(key, false),
  });

  // Info modal content
  const infoContent = (
    <div className={styles.info}>
      <p><strong>{t.objective}:</strong> {t.objectiveText}</p>
      <h3>{t.controls}</h3>
      <ul className={styles.infoPlain}>
        <li>{t.ctrlMove}</li>
        <li>{t.ctrlFire}</li>
        <li>{t.ctrlPause}</li>
      </ul>
      <h3>{t.enemies}</h3>
      <ul className={styles.infoPlain}>
        <li><span className={styles.enemyDot} style={{ background: '#a855f7' }} />Squid — 30 pts ({t.topRow})</li>
        <li><span className={styles.enemyDot} style={{ background: '#3b82f6' }} />Crab — 20 pts ({t.midRows})</li>
        <li><span className={styles.enemyDot} style={{ background: '#22c55e' }} />Octopus — 10 pts ({t.botRows})</li>
        <li><span className={styles.enemyDot} style={{ background: '#ef4444' }} />UFO — 50-300 pts ({t.bonus})</li>
      </ul>
      <h3>{t.tips}</h3>
      <ul>
        <li>{t.tipShields}</li>
        <li>{t.tipSpeed}</li>
        <li>{t.tipUfo}</li>
        <li>{t.tipExtraLife}</li>
      </ul>
    </div>
  );

  // ---------- Start screen ----------
  if (showStartScreen) {
    return (
      <div className={styles.page}>
        <div className={styles.startCard}>
          <h1 className={styles.brand}>{t.title}</h1>
          <p className={styles.tagline}>{t.tagline}</p>

          <span className={styles.sectionLabel}>{t.difficulty}</span>
          <div className={styles.diffGrid} role="radiogroup" aria-label={t.difficulty}>
            {DIFFICULTIES.map((d, i) => (
              <button
                key={d}
                ref={(el) => { diffRefs.current[i] = el; }}
                type="button"
                role="radio"
                aria-checked={difficulty === d}
                tabIndex={difficulty === d ? 0 : -1}
                data-selected={difficulty === d}
                className={styles.diffButton}
                style={{ ['--diff-accent' as string]: DIFFICULTY_ACCENTS[d] }}
                onClick={() => setDifficulty(d)}
                onKeyDown={(e) => handleDifficultyKeyDown(e, i)}
              >
                <span className={styles.diffName}>{t.difficultyLabels[d]}</span>
                <span className={styles.diffDesc}>{t.difficultyDescriptions[d]}</span>
              </button>
            ))}
          </div>

          <MultiplayerLobby
            multiplayer={multiplayer}
            onStartSinglePlayer={startSinglePlayer}
            onGameStart={startMultiplayerGame}
          />

          <button
            type="button"
            className={styles.infoLink}
            onClick={() => setShowInfo(true)}
          >
            {t.howToPlay}
          </button>
        </div>

        <InfoModal isOpen={showInfo} title={t.howToPlay} onClose={() => setShowInfo(false)}>
          {infoContent}
        </InfoModal>
      </div>
    );
  }

  // ---------- Game screen ----------
  const isOver = Boolean(gameState?.gameOver || gameState?.victory);

  return (
    <div className={styles.page}>
      <div className={styles.gameWrap}>
        <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />

        {/* HUD */}
        <div className={styles.hud} aria-live="off">
          <div className={styles.hudBlock}>
            <span className={styles.hudLabel}>{t.score}</span>
            <span className={styles.hudValue}>{gameState?.score ?? 0}</span>
          </div>
          <div className={styles.hudCenter}>
            <span className={styles.wavePill}>{t.wave} {gameState?.level ?? 1}</span>
            <div className={styles.livesRow} aria-label={`${t.lives}: ${gameState?.lives ?? 0}`}>
              {Array.from({ length: gameState?.lives ?? 0 }).map((_, i) => (
                <Heart key={i} className={styles.lifeIcon} fill="currentColor" strokeWidth={0} />
              ))}
            </div>
          </div>
          <div className={`${styles.hudBlock} ${styles.hudBlockRight}`}>
            <span className={styles.hudLabel}>{t.high}</span>
            <span className={`${styles.hudValue} ${styles.hudValueHi}`}>
              {Math.max(highScore, gameState?.score ?? 0)}
            </span>
          </div>
        </div>

        <div className={styles.canvasFrame}>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className={styles.canvas}
            aria-label={t.title}
          />
        </div>

        {/* Buttons */}
        <div className={styles.buttonRow}>
          {!isOver && (
            <button type="button" onClick={togglePause} className={`${styles.btn} ${styles.btnSecondary}`}>
              {gameState?.isPaused ? <Play size={18} /> : <Pause size={18} />}
              {gameState?.isPaused ? t.resume : t.pause}
            </button>
          )}
          {isOver && (
            <>
              <button type="button" onClick={resetGame} className={`${styles.btn} ${styles.btnPrimary}`}>
                <RotateCcw size={18} />
                {t.playAgain}
              </button>
              <button type="button" onClick={backToMenu} className={`${styles.btn} ${styles.btnSecondary}`}>
                {t.difficulty}
              </button>
            </>
          )}
        </div>

        {/* On-screen touch controls */}
        {!isOver && (
          <div className={styles.touchControls} aria-hidden={false}>
            <div className={styles.touchDpad}>
              <button
                type="button"
                aria-label={`${t.move} ${language === 'ja' ? '左' : 'left'}`}
                className={`${styles.touchBtn} ${touchActive.left ? styles.touchBtnActive : ''}`}
                {...touchHandlers('left')}
              >
                <ChevronLeft size={30} />
              </button>
              <button
                type="button"
                aria-label={`${t.move} ${language === 'ja' ? '右' : 'right'}`}
                className={`${styles.touchBtn} ${touchActive.right ? styles.touchBtnActive : ''}`}
                {...touchHandlers('right')}
              >
                <ChevronRight size={30} />
              </button>
            </div>
            <button
              type="button"
              aria-label={t.fire}
              className={`${styles.touchFire} ${touchActive.shoot ? styles.touchFireActive : ''}`}
              {...touchHandlers('shoot')}
            >
              {t.fire}
            </button>
          </div>
        )}

        <div className={styles.hint}>{t.controlsHint}</div>
      </div>

      <InfoModal isOpen={showInfo} title={t.howToPlay} onClose={() => setShowInfo(false)}>
        {infoContent}
      </InfoModal>
    </div>
  );
};

export default SpaceInvaders;
export { SpaceInvaders };
