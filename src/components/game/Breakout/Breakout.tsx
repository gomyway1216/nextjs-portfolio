/**
 * Breakout Game - React Component with Canvas Rendering
 */

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { RotateCcw, Pause, Play } from 'lucide-react';
import { GameTopBar, InfoModal, GameStats } from '../common';
import {
  GameState,
  InputState,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BRICK_TYPES,
  POWERUP_SIZE,
  PowerUpType,
} from './types';
import { createGameState, updateGame } from './GameEngine';

const Breakout: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [stats, setStats] = useState<GameStats>({ wins: 0, losses: 0, draws: 0 });
  const inputRef = useRef<InputState>({ left: false, right: false });
  const lastTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  // Start new game
  const startNewGame = useCallback(() => {
    setGameState(createGameState(1));
    setShowStartScreen(false);
  }, []);

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
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (!showStartScreen && gameState && !gameState.gameOver && !gameState.victory) {
          togglePause();
        }
        e.preventDefault();
      }
      if (e.key === ' ' && showStartScreen) {
        startNewGame();
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
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [showStartScreen, gameState, togglePause, startNewGame]);

  // Render game
  const render = useCallback((ctx: CanvasRenderingContext2D, state: GameState) => {
    // Clear canvas with gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(1, '#1e293b');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw bricks
    for (const brick of state.bricks) {
      if (!brick.active) continue;

      const brickType = BRICK_TYPES[brick.type];
      const gradient = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.height);
      gradient.addColorStop(0, brickType.gradientStart);
      gradient.addColorStop(1, brickType.gradientEnd);

      // Brick shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(brick.x + 2, brick.y + 2, brick.width, brick.height);

      // Brick body
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 4);
      ctx.fill();

      // Brick highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(brick.x + 4, brick.y + brick.height - 2);
      ctx.lineTo(brick.x + 4, brick.y + 4);
      ctx.lineTo(brick.x + brick.width - 4, brick.y + 4);
      ctx.stroke();

      // Show hits remaining for multi-hit bricks
      if (brick.hits > 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(brick.hits.toString(), brick.x + brick.width / 2, brick.y + brick.height / 2);
      }
    }

    // Draw power-ups
    for (const powerUp of state.powerUps) {
      ctx.save();

      // Glow effect
      ctx.shadowColor = powerUp.config.color;
      ctx.shadowBlur = 10;

      // Power-up body
      ctx.fillStyle = powerUp.config.color;
      ctx.beginPath();
      ctx.arc(powerUp.x, powerUp.y, POWERUP_SIZE / 2, 0, Math.PI * 2);
      ctx.fill();

      // Symbol
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(powerUp.config.symbol, powerUp.x, powerUp.y);

      ctx.restore();
    }

    // Draw paddle
    const paddleGradient = ctx.createLinearGradient(
      state.paddle.x, state.paddle.y,
      state.paddle.x, state.paddle.y + state.paddle.height
    );
    paddleGradient.addColorStop(0, '#60a5fa');
    paddleGradient.addColorStop(0.5, '#3b82f6');
    paddleGradient.addColorStop(1, '#2563eb');

    ctx.fillStyle = paddleGradient;
    ctx.beginPath();
    ctx.roundRect(state.paddle.x, state.paddle.y, state.paddle.width, state.paddle.height, 8);
    ctx.fill();

    // Paddle highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(state.paddle.x + 1, state.paddle.y + 1, state.paddle.width - 2, state.paddle.height / 2, 6);
    ctx.stroke();

    // Draw balls
    for (const ball of state.balls) {
      ctx.save();

      // Ball glow
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 15;

      // Ball gradient
      const ballGradient = ctx.createRadialGradient(
        ball.x - ball.radius / 3, ball.y - ball.radius / 3, 0,
        ball.x, ball.y, ball.radius
      );
      ballGradient.addColorStop(0, '#ffffff');
      ballGradient.addColorStop(0.5, '#e2e8f0');
      ballGradient.addColorStop(1, '#94a3b8');

      ctx.fillStyle = ballGradient;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Draw UI
    // Score
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Score: ${state.score}`, 10, 10);

    // Level
    ctx.textAlign = 'center';
    ctx.fillText(`Level ${state.level}`, CANVAS_WIDTH / 2, 10);

    // Lives
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ef4444';
    let livesText = '';
    for (let i = 0; i < state.lives; i++) {
      livesText += '♥ ';
    }
    ctx.fillText(livesText.trim(), CANVAS_WIDTH - 10, 10);

    // Active effects indicator
    if (state.activeEffects.length > 0) {
      ctx.textAlign = 'left';
      ctx.font = '14px Arial';
      let y = 35;
      for (const effect of state.activeEffects) {
        const remaining = Math.max(0, Math.ceil((effect.endTime - Date.now()) / 1000));
        let effectName = '';
        let color = '#fff';

        switch (effect.type) {
          case PowerUpType.EXPAND_PADDLE:
            effectName = 'Wide Paddle';
            color = '#22c55e';
            break;
          case PowerUpType.SHRINK_PADDLE:
            effectName = 'Narrow Paddle';
            color = '#ef4444';
            break;
          case PowerUpType.SLOW_BALL:
            effectName = 'Slow Ball';
            color = '#3b82f6';
            break;
          case PowerUpType.FAST_BALL:
            effectName = 'Fast Ball';
            color = '#f97316';
            break;
        }

        ctx.fillStyle = color;
        ctx.fillText(`${effectName}: ${remaining}s`, 10, y);
        y += 18;
      }
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
  }, []);

  // Game loop
  useEffect(() => {
    if (!gameState || showStartScreen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameLoop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const deltaTime = Math.min(timestamp - lastTimeRef.current, 50); // Cap delta time
      lastTimeRef.current = timestamp;

      // Update game state
      const newState = { ...gameState };
      updateGame(newState, inputRef.current, deltaTime);
      setGameState(newState);

      // Render
      render(ctx, newState);

      // Continue loop if game is active
      if (!newState.gameOver && !newState.victory) {
        animationFrameRef.current = requestAnimationFrame(gameLoop);
      } else {
        // Final render for game over/victory
        render(ctx, newState);

        // Update stats
        if (newState.victory) {
          setStats(prev => ({ ...prev, wins: prev.wins + 1 }));
        } else if (newState.gameOver) {
          setStats(prev => ({ ...prev, losses: prev.losses + 1 }));
        }
      }
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState, showStartScreen, render]);

  // Info modal content
  const infoContent = (
    <div style={{ color: '#d1d5db' }}>
      <p style={{ marginBottom: '0.75rem' }}>
        <strong>Objective:</strong> Break all the bricks to advance through 5 levels!
      </p>
      <p style={{ marginBottom: '0.5rem' }}><strong>Controls:</strong></p>
      <ul style={{ listStyle: 'none', marginLeft: '0', marginBottom: '0.75rem' }}>
        <li>Arrow Keys / A,D - Move paddle</li>
        <li>P / ESC - Pause game</li>
      </ul>
      <p style={{ marginBottom: '0.5rem' }}><strong>Power-ups:</strong></p>
      <ul style={{ listStyle: 'disc', marginLeft: '1.5rem' }}>
        <li><span style={{ color: '#22c55e' }}>+</span> Expand paddle</li>
        <li><span style={{ color: '#ef4444' }}>-</span> Shrink paddle</li>
        <li><span style={{ color: '#8b5cf6' }}>M</span> Multi-ball</li>
        <li><span style={{ color: '#3b82f6' }}>S</span> Slow ball</li>
        <li><span style={{ color: '#f97316' }}>F</span> Fast ball</li>
        <li><span style={{ color: '#ec4899' }}>♥</span> Extra life</li>
      </ul>
    </div>
  );

  // Start screen
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
          background: 'linear-gradient(to bottom, #0f172a, #1e293b)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '1rem',
        }}
      >
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.95)',
            border: '3px solid #3b82f6',
            borderRadius: '1rem',
            padding: '3rem',
            textAlign: 'center',
            maxWidth: '500px',
          }}
        >
          <h1
            style={{
              color: '#fff',
              fontSize: '3rem',
              marginBottom: '0.5rem',
              textShadow: '0 0 20px rgba(59, 130, 246, 0.5)',
            }}
          >
            BREAKOUT
          </h1>
          <p
            style={{
              color: '#9ca3af',
              marginBottom: '2rem',
            }}
          >
            Classic brick-breaking action
          </p>

          <div
            style={{
              color: '#6b7280',
              fontSize: '0.875rem',
              marginBottom: '2rem',
              textAlign: 'left',
            }}
          >
            <p>Break all the bricks to advance through 5 levels.</p>
            <p>Collect power-ups to help you along the way!</p>
            <p>Don't let the ball fall below your paddle.</p>
          </div>

          <button
            onClick={startNewGame}
            style={{
              background: '#3b82f6',
              border: 'none',
              borderRadius: '0.5rem',
              color: '#fff',
              fontSize: '1.5rem',
              fontWeight: 'bold',
              padding: '1rem 3rem',
              cursor: 'pointer',
              width: '100%',
              marginBottom: '1rem',
              transition: 'transform 0.2s, background 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2563eb';
              e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#3b82f6';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Start Game
          </button>

          <button
            onClick={() => setShowInfo(true)}
            style={{
              background: 'transparent',
              border: '1px solid #4b5563',
              borderRadius: '0.5rem',
              color: '#9ca3af',
              fontSize: '1rem',
              padding: '0.75rem 2rem',
              cursor: 'pointer',
              width: '100%',
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
        background: 'linear-gradient(to bottom, #0f172a, #1e293b)',
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
            boxShadow: '0 0 30px rgba(59, 130, 246, 0.3)',
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
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '1rem',
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
          Move: Arrow Keys / A,D | Pause: P / ESC
        </div>
      </div>

      <InfoModal isOpen={showInfo} title="How to Play" onClose={() => setShowInfo(false)}>
        {infoContent}
      </InfoModal>
    </div>
  );
};

export default Breakout;
export { Breakout };
