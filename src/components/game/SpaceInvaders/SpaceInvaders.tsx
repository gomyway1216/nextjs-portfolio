/**
 * Space Invaders - React Component with Canvas Rendering
 * Supports both single-player and multiplayer modes
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, Pause, Play } from 'lucide-react';
import { GameTopBar, InfoModal, GameStats } from '../common';
import {
  GameState,
  InputState,
  Enemy,
  EnemyType,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  SHIELD_BLOCK_SIZE,
  UFO_WIDTH,
  UFO_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
} from './types';
import { createGameState, updateGame } from './GameEngine';
import { Sounds, initAudio } from './sounds';
import { useMultiplayer } from './useMultiplayer';
import { MultiplayerLobby } from './MultiplayerLobby';
import { toNetworkGameState, MultiplayerPlayer } from './multiplayerTypes';

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
  // Ship body gradient
  const gradient = ctx.createLinearGradient(x, y + height, x, y);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.5, lightenColor(color, 0.2));
  gradient.addColorStop(1, lightenColor(color, 0.4));

  ctx.fillStyle = gradient;

  // Main body
  ctx.beginPath();
  ctx.moveTo(x, y + height);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x + width - 5, y + height * 0.4);
  ctx.lineTo(x + width / 2, y);
  ctx.lineTo(x + 5, y + height * 0.4);
  ctx.closePath();
  ctx.fill();

  // Cockpit
  ctx.fillStyle = '#0ea5e9';
  ctx.beginPath();
  ctx.arc(x + width / 2, y + height * 0.5, 6, 0, Math.PI * 2);
  ctx.fill();

  // Glow
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
    case EnemyType.SQUID:
      // Squid - small with tentacles
      ctx.beginPath();
      // Body
      ctx.ellipse(x + width / 2, y + height * 0.4, width * 0.35, height * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tentacles
      ctx.fillStyle = accent;
      const tentacleOffset = animFrame === 0 ? -3 : 3;
      ctx.fillRect(x + width * 0.2 + tentacleOffset, y + height * 0.5, 4, height * 0.4);
      ctx.fillRect(x + width * 0.4, y + height * 0.5, 4, height * 0.5);
      ctx.fillRect(x + width * 0.6 - 4, y + height * 0.5, 4, height * 0.5);
      ctx.fillRect(x + width * 0.8 - 4 - tentacleOffset, y + height * 0.5, 4, height * 0.4);
      // Eyes
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + width * 0.35, y + height * 0.25, 5, 5);
      ctx.fillRect(x + width * 0.55, y + height * 0.25, 5, 5);
      break;

    case EnemyType.CRAB:
      // Crab - medium with claws
      const clawOffset = animFrame === 0 ? -2 : 2;
      // Body
      ctx.fillRect(x + width * 0.15, y + height * 0.2, width * 0.7, height * 0.5);
      // Head
      ctx.fillStyle = accent;
      ctx.fillRect(x + width * 0.25, y, width * 0.5, height * 0.3);
      // Claws
      ctx.fillStyle = color;
      ctx.fillRect(x + clawOffset, y + height * 0.3, width * 0.2, height * 0.3);
      ctx.fillRect(x + width * 0.8 - clawOffset, y + height * 0.3, width * 0.2, height * 0.3);
      // Legs
      ctx.fillRect(x + width * 0.2, y + height * 0.7, 5, height * 0.3);
      ctx.fillRect(x + width * 0.4, y + height * 0.7, 5, height * 0.3);
      ctx.fillRect(x + width * 0.55, y + height * 0.7, 5, height * 0.3);
      ctx.fillRect(x + width * 0.75, y + height * 0.7, 5, height * 0.3);
      // Eyes
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + width * 0.35, y + height * 0.05, 4, 4);
      ctx.fillRect(x + width * 0.55, y + height * 0.05, 4, 4);
      break;

    case EnemyType.OCTOPUS:
      // Octopus - large with wavy tentacles
      // Body
      ctx.beginPath();
      ctx.arc(x + width / 2, y + height * 0.35, width * 0.4, 0, Math.PI * 2);
      ctx.fill();
      // Tentacles
      ctx.fillStyle = accent;
      const wave = animFrame === 0 ? 0 : Math.PI;
      for (let i = 0; i < 4; i++) {
        const tx = x + width * 0.15 + i * width * 0.2;
        const ty = y + height * 0.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(
          tx + 5 + Math.sin(wave + i) * 3,
          ty + height * 0.25,
          tx + (animFrame === 0 ? -3 : 3),
          ty + height * 0.45
        );
        ctx.lineTo(tx + 8, ty + height * 0.45);
        ctx.quadraticCurveTo(
          tx + 13 + Math.sin(wave + i) * 3,
          ty + height * 0.25,
          tx + 8,
          ty
        );
        ctx.fill();
      }
      // Eyes
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + width * 0.32, y + height * 0.25, 6, 6);
      ctx.fillRect(x + width * 0.55, y + height * 0.25, 6, 6);
      // Pupils
      ctx.fillStyle = '#000';
      ctx.fillRect(x + width * 0.35, y + height * 0.28, 3, 3);
      ctx.fillRect(x + width * 0.58, y + height * 0.28, 3, 3);
      break;
  }
}

// Draw UFO
function drawUFO(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  // Glow
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 15;

  // Body gradient
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, '#f87171');
  gradient.addColorStop(0.5, '#ef4444');
  gradient.addColorStop(1, '#dc2626');

  ctx.fillStyle = gradient;

  // UFO shape
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height * 0.6, width / 2, height * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dome
  ctx.fillStyle = '#fca5a5';
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height * 0.4, width * 0.25, height * 0.35, 0, Math.PI, 0);
  ctx.fill();

  // Lights
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const [gameMode, setGameMode] = useState<GameMode>('menu');
  const inputRef = useRef<InputState>({ left: false, right: false, shoot: false });
  const lastTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  // Multiplayer hook
  const multiplayer = useMultiplayer();

  // Start single player game
  const startSinglePlayer = useCallback(() => {
    initAudio();
    Sounds.startGame();
    setGameState(createGameState(1));
    setGameMode('single');
    setShowStartScreen(false);
  }, []);

  // Start multiplayer game (called when host starts or game begins)
  const startMultiplayerGame = useCallback(async () => {
    initAudio();
    Sounds.startGame();
    const newState = createGameState(1);
    setGameState(newState);
    setGameMode('multi');
    setShowStartScreen(false);

    // If host, send initial game state to Firebase
    if (multiplayer.context.isHost) {
      const networkState = toNetworkGameState(
        newState.formation,
        newState.bullets,
        newState.ufo,
        newState.shields,
        newState.level,
        newState.animationTick,
        newState.marchCounter
      );
      await multiplayer.startGame(networkState);
    }
  }, [multiplayer]);

  // Legacy function for keyboard start
  const startNewGame = useCallback(() => {
    if (gameMode === 'menu') {
      startSinglePlayer();
    }
  }, [gameMode, startSinglePlayer]);

  // Reset game
  const resetGame = useCallback(() => {
    if (gameState) {
      if (gameState.victory) {
        setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
      } else if (gameState.gameOver) {
        setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
      }
    }
    setGameState(createGameState(1));
  }, [gameState]);

  // Toggle pause
  const togglePause = useCallback(() => {
    setGameState(prev => prev ? { ...prev, isPaused: !prev.isPaused } : null);
  }, []);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        inputRef.current.left = true;
        e.preventDefault();
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        inputRef.current.right = true;
        e.preventDefault();
      }
      if (e.key === ' ' || e.key === 'ArrowUp') {
        if (showStartScreen) {
          startNewGame();
        } else {
          inputRef.current.shoot = true;
        }
        e.preventDefault();
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (!showStartScreen && gameState && !gameState.gameOver && !gameState.victory) {
          togglePause();
        }
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        inputRef.current.left = false;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        inputRef.current.right = false;
      }
      if (e.key === ' ' || e.key === 'ArrowUp') {
        inputRef.current.shoot = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [showStartScreen, gameState, togglePause, startNewGame]);

  // Render game
  const render = useCallback((
    ctx: CanvasRenderingContext2D,
    state: GameState,
    otherPlayer?: MultiplayerPlayer | null,
    myColor: string = '#22c55e',
    otherColor: string = '#3b82f6'
  ) => {
    // Clear canvas with space background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw stars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    for (let i = 0; i < 50; i++) {
      const sx = (i * 37 + state.animationTick * 0.1) % CANVAS_WIDTH;
      const sy = (i * 53) % CANVAS_HEIGHT;
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Draw shields
    ctx.fillStyle = '#22c55e';
    for (const shield of state.shields) {
      for (const block of shield.blocks) {
        if (block.active) {
          ctx.fillRect(block.x, block.y, SHIELD_BLOCK_SIZE, SHIELD_BLOCK_SIZE);
        }
      }
    }

    // Draw enemies
    for (const enemy of state.formation.enemies) {
      if (enemy.active) {
        drawEnemy(ctx, enemy);
      }
    }

    // Draw UFO
    if (state.ufo && state.ufo.active) {
      drawUFO(ctx, state.ufo.x, state.ufo.y, UFO_WIDTH, UFO_HEIGHT);
    }

    // Draw other player (in multiplayer mode)
    if (otherPlayer && gameMode === 'multi') {
      drawPlayer(ctx, otherPlayer.x, state.player.y, PLAYER_WIDTH, PLAYER_HEIGHT, otherColor);
      // Draw other player's name above their ship
      ctx.fillStyle = otherColor;
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(otherPlayer.name, otherPlayer.x + PLAYER_WIDTH / 2, state.player.y - 10);
    }

    // Draw player
    drawPlayer(ctx, state.player.x, state.player.y, state.player.width, state.player.height, myColor);

    // Draw bullets
    for (const bullet of state.bullets) {
      if (bullet.isEnemy) {
        // Enemy bullet - zigzag pattern
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
        // Player bullet - simple laser
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

    // Draw UI
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`SCORE: ${state.score}`, 10, 10);

    // Level
    ctx.textAlign = 'center';
    ctx.fillText(`LEVEL ${state.level}`, CANVAS_WIDTH / 2, 10);

    // Lives
    ctx.textAlign = 'right';
    ctx.fillText('LIVES:', CANVAS_WIDTH - 100, 10);
    for (let i = 0; i < state.lives; i++) {
      drawPlayer(ctx, CANVAS_WIDTH - 90 + i * 25, 8, 20, 15);
    }

    // Paused overlay
    if (state.isPaused) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

      ctx.font = '20px Arial';
      ctx.fillText('Press P or ESC to resume', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
    }

    // Game over overlay
    if (state.gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);

      ctx.fillStyle = '#fff';
      ctx.font = '24px Arial';
      ctx.fillText(`Final Score: ${state.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
    }

    // Victory overlay
    if (state.victory) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('VICTORY!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);

      ctx.fillStyle = '#fff';
      ctx.font = '24px Arial';
      ctx.fillText(`Final Score: ${state.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
    }

    // Draw multiplayer scores if in multiplayer mode
    if (gameMode === 'multi' && otherPlayer) {
      // Draw combined score at the top
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`Team Score: ${state.score + (otherPlayer.score || 0)}`, 10, 35);
    }
  }, [gameMode]);

  // Game loop
  useEffect(() => {
    if (!gameState || showStartScreen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameLoop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const deltaTime = Math.min(timestamp - lastTimeRef.current, 50);
      lastTimeRef.current = timestamp;

      // Update game state
      const newState = { ...gameState };
      const soundEvents = updateGame(newState, inputRef.current, deltaTime, Date.now());
      setGameState(newState);

      // Play sounds based on events
      if (soundEvents.playerShoot) Sounds.playerShoot();
      if (soundEvents.enemyHit) Sounds.enemyHit();
      if (soundEvents.playerHit) Sounds.playerHit();
      if (soundEvents.ufoSpawn) Sounds.ufoSound();
      if (soundEvents.ufoHit) Sounds.ufoHit();
      if (soundEvents.enemyShoot) Sounds.enemyShoot();
      if (soundEvents.levelComplete) Sounds.levelComplete();
      if (soundEvents.gameOver) Sounds.gameOver();
      if (soundEvents.enemyMarch) Sounds.enemyMarch(soundEvents.marchPitch);

      // Update multiplayer state
      if (gameMode === 'multi') {
        // Send our position to Firebase
        multiplayer.updateMyPosition(newState.player.x);
        multiplayer.updateMyState(newState.score, newState.lives);

        // If host, sync game state
        if (multiplayer.context.isHost) {
          const networkState = toNetworkGameState(
            newState.formation,
            newState.bullets,
            newState.ufo,
            newState.shields,
            newState.level,
            newState.animationTick,
            newState.marchCounter
          );
          multiplayer.updateGameState(networkState);
        }
      }

      // Render with multiplayer info
      render(ctx, newState, multiplayer.otherPlayer, multiplayer.myColor, multiplayer.otherColor);

      // Continue loop if game is active
      if (!newState.gameOver && !newState.victory) {
        animationFrameRef.current = requestAnimationFrame(gameLoop);
      } else {
        render(ctx, newState, multiplayer.otherPlayer, multiplayer.myColor, multiplayer.otherColor);
        if (newState.victory) {
          setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
        } else if (newState.gameOver) {
          setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
        }
        // End multiplayer game if applicable
        if (gameMode === 'multi') {
          multiplayer.endGame(newState.victory ? multiplayer.context.playerId : null);
        }
      }
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState, showStartScreen, render, gameMode, multiplayer]);

  // Info modal content
  const infoContent = (
    <div style={{ color: '#d1d5db' }}>
      <p style={{ marginBottom: '0.75rem' }}>
        <strong>Objective:</strong> Destroy all alien invaders before they reach Earth!
      </p>
      <p style={{ marginBottom: '0.5rem' }}><strong>Controls:</strong></p>
      <ul style={{ listStyle: 'none', marginLeft: '0', marginBottom: '0.75rem' }}>
        <li>Arrow Keys / A,D - Move ship</li>
        <li>Space / Up Arrow - Fire</li>
        <li>P / ESC - Pause game</li>
      </ul>
      <p style={{ marginBottom: '0.5rem' }}><strong>Enemies:</strong></p>
      <ul style={{ listStyle: 'disc', marginLeft: '1.5rem' }}>
        <li><span style={{ color: '#a855f7' }}>Squid</span> - 30 points (top row)</li>
        <li><span style={{ color: '#3b82f6' }}>Crab</span> - 20 points (middle rows)</li>
        <li><span style={{ color: '#22c55e' }}>Octopus</span> - 10 points (bottom rows)</li>
        <li><span style={{ color: '#ef4444' }}>UFO</span> - 50-300 points (bonus)</li>
      </ul>
      <p style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}><strong>Tips:</strong></p>
      <ul style={{ listStyle: 'disc', marginLeft: '1.5rem' }}>
        <li>Use shields for cover</li>
        <li>Enemies speed up as you destroy them</li>
        <li>Watch for the mystery UFO!</li>
      </ul>
    </div>
  );

  // Start screen with multiplayer lobby
  if (showStartScreen) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(to bottom, #0a0a0f, #1a1a2e)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '1rem',
        }}
      >
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.95)',
            border: '3px solid #22c55e',
            borderRadius: '1rem',
            padding: '2rem',
            textAlign: 'center',
            maxWidth: '500px',
            minWidth: '400px',
          }}
        >
          <MultiplayerLobby
            multiplayer={multiplayer}
            onStartSinglePlayer={startSinglePlayer}
            onGameStart={startMultiplayerGame}
          />

          <button
            onClick={() => setShowInfo(true)}
            style={{
              background: 'transparent',
              border: '1px solid #4b5563',
              borderRadius: '0.5rem',
              color: '#9ca3af',
              fontSize: '0.875rem',
              padding: '0.5rem 1.5rem',
              cursor: 'pointer',
              marginTop: '1rem',
            }}
          >
            How to Play
          </button>
        </div>

        <InfoModal isOpen={showInfo} title="How to Play" onClose={() => setShowInfo(false)}>
          {infoContent}
        </InfoModal>
      </div>
    );
  }

  // Main game screen
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(to bottom, #0a0a0f, #1a1a2e)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '1rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: `${CANVAS_WIDTH}px` }}>
        <GameTopBar stats={stats} onInfoClick={() => setShowInfo(true)} />

        <div
          style={{
            position: 'relative',
            borderRadius: '0.5rem',
            overflow: 'hidden',
            boxShadow: '0 0 30px rgba(34, 197, 94, 0.2)',
            border: '2px solid #22c55e',
          }}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            style={{
              display: 'block',
              maxWidth: '100%',
              height: 'auto',
            }}
          />
        </div>

        {/* Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1rem',
            marginTop: '1rem',
          }}
        >
          {!gameState?.gameOver && !gameState?.victory && (
            <button
              onClick={togglePause}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                background: '#4b5563',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              {gameState?.isPaused ? <Play size={20} /> : <Pause size={20} />}
              {gameState?.isPaused ? 'Resume' : 'Pause'}
            </button>
          )}

          {(gameState?.gameOver || gameState?.victory) && (
            <button
              onClick={resetGame}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                background: '#22c55e',
                color: '#000',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
              }}
            >
              <RotateCcw size={20} />
              Play Again
            </button>
          )}
        </div>

        {/* Controls hint */}
        <div
          style={{
            marginTop: '0.5rem',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '0.75rem',
          }}
        >
          Move: Arrow Keys / A,D | Fire: Space / Up | Pause: P / ESC
        </div>
      </div>

      <InfoModal isOpen={showInfo} title="How to Play" onClose={() => setShowInfo(false)}>
        {infoContent}
      </InfoModal>
    </div>
  );
};

export default SpaceInvaders;
export { SpaceInvaders };
