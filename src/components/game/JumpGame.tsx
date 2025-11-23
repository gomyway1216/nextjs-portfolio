'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Info, X, Trophy } from 'lucide-react';

enum Scene {
  GameMain = 'GameMain',
  GameOver = 'GameOver',
}

interface GameState {
  characterPosX: number;
  characterPosY: number;
  characterR: number;
  speed: number;
  acceleration: number;
  enemyPosX: number;
  enemyPosY: number;
  enemyR: number;
  enemySpeed: number;
  score: number;
  scene: Scene;
  frameCount: number;
  bound: boolean;
}

const JumpGame = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const gameStateRef = useRef<GameState | null>(null);
  const animationIdRef = useRef<number | null>(null);

  // Sound effects
  const jumpSoundRef = useRef<HTMLAudioElement | null>(null);
  const collisionSoundRef = useRef<HTMLAudioElement | null>(null);
  const scoreSoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize sound effects
    if (typeof window !== 'undefined') {
      jumpSoundRef.current = new Audio();
      jumpSoundRef.current.src = 'data:audio/wav;base64,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';

      collisionSoundRef.current = new Audio();
      collisionSoundRef.current.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PVa3n77BdGAg+ltrzxnMmBSl+zPLaizsIGGS56+ihUBALTKXh8bllHAU2jdXzzn0vBSF1xe/glEILElyx6OyrWBUIOpjc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFODwxPqOLwuGIdBjiP1vPOfy8GI3fH8OKSPwsVXrTp7K5aFgk7mdvzyn0tBSp+zPDbjDwIHGi76+mjTxAMTqfi8LpjHQU5kdXz0H4wBSR3x+/jlEILElyx6OyvWhYIPZfc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFODwxPqOLwuGIdBjiP1vPOfy8GI3fH8OKSPwsVXrTp7K5aFgk7mdvzyn0tBSp+zPDbjDwIHGi76+mjTxAMTqfi8LpjHQU5kdXz0H4wBSR3x+/jlEILElyx6OyvWhYIPZfc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFODwxPqOLwuGIdBjiP1vPOfy8GI3fH8OKSPwsVXrTp7K5aFgk7mdvzyn0tBSp+zPDbjDwIHGi76+mjTxAMTqfi8LpjHQU5kdXz0H4wBSR3x+/jlEILElyx6OyvWhYIPZfc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFODwxPqOLwuGIdBjiP1vPOfy8GI3fH8OKSPwsVXrTp7K5aFgk7mdvzyn0tBSp+zPDbjDwIHGi76+mjTxAMTqfi8LpjHQU5kdXz0H4wBSR3x+/jlEILElyx6OyvWhYIPZfc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFODwxPqOLwuGIdBjiP1vPOfy8GI3fH8OKSPwsVXrTp7K5aFgk7mdvzyn0tBSp+zPDbjDwIHGi76+mjTxAMTqfi8LpjHQU5kdXz0H4wBSR3x+/jlEILElyx6OyvWhYIPZfc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFODwxPqOLwuGIdBjiP1vPOfy8GI3fH8OKSPwsVXrTp7K5aFgk7mdvzyn0tBSp+zPDbjDwIHGi76+mjTxAMTqfi8LpjHQU5kdXz0H4wBSR3x+/jlEILElyx6OyvWhYIPZfc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFOD';

      scoreSoundRef.current = new Audio();
      scoreSoundRef.current.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0PVa3n77BdGAg+ltrzxnMmBSl+zPLaizsIGGS56+ihUBALTKXh8bllHAU2jdXzzn0vBSF1xe/glEILElyx6OyrWBUIOpjc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFODwxPqOLwuGIdBjiP1vPOfy8GI3fH8OKSPwsVXrTp7K5aFgk7mdvzyn0tBSp+zPDbjDwIHGi76+mjTxAMTqfi8LpjHQU5kdXz0H4wBSR3x+/jlEILElyx6OyvWhYIPZfc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFODwxPqOLwuGIdBjiP1vPOfy8GI3fH8OKSPwsVXrTp7K5aFgk7mdvzyn0tBSp+zPDbjDwIHGi76+mjTxAMTqfi8LpjHQU5kdXz0H4wBSR3x+/jlEILElyx6OyvWhYIPZfc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFODwxPqOLwuGIdBjiP1vPOfy8GI3fH8OKSPwsVXrTp7K5aFgk7mdvzyn0tBSp+zPDbjDwIHGi76+mjTxAMTqfi8LpjHQU5kdXz0H4wBSR3x+/jlEILElyx6OyvWhYIPZfc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFODwxPqOLwuGIdBjiP1vPOfy8GI3fH8OKSPwsVXrTp7K5aFgk7mdvzyn0tBSp+zPDbjDwIHGi76+mjTxAMTqfi8LpjHQU5kdXz0H4wBSR3x+/jlEILElyx6OyvWhYIPZfc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFODwxPqOLwuGIdBjiP1vPOfy8GI3fH8OKSPwsVXrTp7K5aFgk7mdvzyn0tBSp+zPDbjDwIHGi76+mjTxAMTqfi8LpjHQU5kdXz0H4wBSR3x+/jlEILElyx6OyvWhYIPZfc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFODwxPqOLwuGIdBjiP1vPOfy8GI3fH8OKSPwsVXrTp7K5aFgk7mdvzyn0tBSp+zPDbjDwIHGi76+mjTxAMTqfi8LpjHQU5kdXz0H4wBSR3x+/jlEILElyx6OyvWhYIPZfc88p5KwUme8rx3I4+CRxqvO7mnUgPC1Gs5O+1YhoGPJPY88h2JwUleMnw34xACRVgsOftsVkUCkKc3vLBcCcFMIXP8tqINQcZZrjr6aFOD';
    }

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, []);

  const initGame = (): GameState => {
    return {
      characterPosX: 100,
      characterPosY: 400,
      characterR: 16,
      speed: 0,
      acceleration: 0,
      enemyPosX: 600,
      enemyPosY: 400,
      enemyR: 16,
      enemySpeed: 5,
      score: 0,
      scene: Scene.GameMain,
      frameCount: 0,
      bound: false,
    };
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!gameStateRef.current) return;

    // Prevent default behavior (especially for spacebar scrolling)
    e.preventDefault();

    const state = gameStateRef.current;

    if (state.scene === Scene.GameMain) {
      if (state.speed === 0) {
        state.speed = -20;
        state.acceleration = 1.5;
        // Play jump sound
        if (jumpSoundRef.current) {
          jumpSoundRef.current.currentTime = 0;
          jumpSoundRef.current.play().catch(() => { });
        }
      }
    } else if (state.scene === Scene.GameOver) {
      if (state.frameCount > 60) {
        gameStateRef.current = initGame();
      }
    }
  };

  const update = (state: GameState) => {
    if (state.scene === Scene.GameMain) {
      // Update character
      state.speed += state.acceleration;
      state.characterPosY += state.speed;
      if (state.characterPosY > 400) {
        state.characterPosY = 400;
        state.speed = 0;
        state.acceleration = 0;
      }

      // Update enemy
      state.enemyPosX -= state.enemySpeed;
      if (state.enemyPosX < -100) {
        state.enemyPosX = 600;
        state.score += 100;

        // Play score sound
        if (scoreSoundRef.current) {
          scoreSoundRef.current.currentTime = 0;
          scoreSoundRef.current.play().catch(() => { });
        }

        // Update high score
        if (state.score > highScore) {
          setHighScore(state.score);
        }
      }

      // Collision detection
      const diffX = state.characterPosX - state.enemyPosX;
      const diffY = state.characterPosY - state.enemyPosY;
      const distance = Math.sqrt(diffX * diffX + diffY * diffY);
      if (distance < state.characterR + state.enemyR) {
        state.scene = Scene.GameOver;
        state.speed = -20;
        state.acceleration = 0.5;
        state.frameCount = 0;

        // Play collision sound
        if (collisionSoundRef.current) {
          collisionSoundRef.current.currentTime = 0;
          collisionSoundRef.current.play().catch(() => { });
        }
      }
    } else if (state.scene === Scene.GameOver) {
      // Update character (death animation)
      state.speed += state.acceleration;
      state.characterPosY += state.speed;

      if (state.characterPosX < 20 || state.characterPosX > 460) {
        state.bound = !state.bound;
      }
      if (state.bound) {
        state.characterPosX += 30;
      } else {
        state.characterPosX -= 30;
      }

      // Continue enemy movement
      state.enemyPosX -= state.enemySpeed;
    }

    state.frameCount++;
  };

  const draw = (
    ctx: CanvasRenderingContext2D,
    state: GameState
  ) => {
    ctx.imageSmoothingEnabled = false;

    if (state.scene === Scene.GameMain) {
      // Background
      ctx.fillStyle = 'rgb(0,0,0)';
      ctx.fillRect(0, 0, 480, 480);

      // Draw ground line
      ctx.strokeStyle = 'rgb(100,100,100)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 420);
      ctx.lineTo(480, 420);
      ctx.stroke();

      // Draw character (blue circle with white outline)
      ctx.fillStyle = '#0ea5e9'; // Sky blue color
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(state.characterPosX, state.characterPosY, state.characterR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw enemy (red square)
      ctx.fillStyle = '#ef4444'; // Red color
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      const enemySize = state.enemyR * 2;
      ctx.fillRect(
        state.enemyPosX - state.enemyR,
        state.enemyPosY - state.enemyR,
        enemySize,
        enemySize
      );
      ctx.strokeRect(
        state.enemyPosX - state.enemyR,
        state.enemyPosY - state.enemyR,
        enemySize,
        enemySize
      );

      // Draw score
      ctx.fillStyle = 'rgb(255,255,255)';
      ctx.font = 'bold 16pt Arial';
      const scoreLabel = 'SCORE: ' + state.score;
      const scoreLabelWidth = ctx.measureText(scoreLabel).width;
      ctx.fillText(scoreLabel, 460 - scoreLabelWidth, 40);
    } else if (state.scene === Scene.GameOver) {
      // Background
      ctx.fillStyle = 'rgb(0,0,0)';
      ctx.fillRect(0, 0, 480, 480);

      // Draw ground line
      ctx.strokeStyle = 'rgb(100,100,100)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 420);
      ctx.lineTo(480, 420);
      ctx.stroke();

      // Draw character (death animation with rotation and size change)
      if (state.frameCount < 120) {
        ctx.save();
        ctx.translate(state.characterPosX, state.characterPosY);
        ctx.rotate(((state.frameCount % 30) * Math.PI * 2) / 30);

        const sizeIncrease = state.frameCount * 0.5;
        ctx.fillStyle = '#0ea5e9';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, state.characterR + sizeIncrease, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Draw enemy (red square)
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      const enemySize = state.enemyR * 2;
      ctx.fillRect(
        state.enemyPosX - state.enemyR,
        state.enemyPosY - state.enemyR,
        enemySize,
        enemySize
      );
      ctx.strokeRect(
        state.enemyPosX - state.enemyR,
        state.enemyPosY - state.enemyR,
        enemySize,
        enemySize
      );

      // Draw score
      ctx.fillStyle = 'rgb(255,255,255)';
      ctx.font = 'bold 16pt Arial';
      const scoreLabel = 'SCORE: ' + state.score;
      const scoreLabelWidth = ctx.measureText(scoreLabel).width;
      ctx.fillText(scoreLabel, 460 - scoreLabelWidth, 40);

      // Draw game over text
      ctx.fillStyle = 'rgb(255,255,255)';
      ctx.font = 'bold 48pt Arial';
      const gameOverLabel = 'GAME OVER';
      const gameOverWidth = ctx.measureText(gameOverLabel).width;
      ctx.fillText(gameOverLabel, 240 - gameOverWidth / 2, 240);
    }
  };

  const gameLoop = () => {
    if (!canvasRef.current || !gameStateRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const state = gameStateRef.current;

    update(state);
    draw(ctx, state);

    animationIdRef.current = requestAnimationFrame(gameLoop);
  };

  const startGame = () => {
    if (!canvasRef.current) return;

    gameStateRef.current = initGame();
    setIsGameStarted(true);

    // Add keyboard event listener
    document.addEventListener('keydown', handleKeyDown);

    // Start game loop
    gameLoop();
  };

  const stopGame = () => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }
    document.removeEventListener('keydown', handleKeyDown);
    gameStateRef.current = null;
    setIsGameStarted(false);
  };

  useEffect(() => {
    return () => {
      stopGame();
    };
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Top Bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem',
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(14, 165, 233, 0.3)',
        zIndex: 10
      }}>
        <Link
          href="/games"
          style={{
            color: '#94a3b8',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: '500',
            transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#0ea5e9'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
        >
          ← Back to Games
        </Link>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'rgba(14, 165, 233, 0.1)',
          border: '1px solid rgba(14, 165, 233, 0.3)',
          borderRadius: '0.5rem',
          padding: '0.5rem 1rem'
        }}>
          <Trophy style={{ width: '1.25rem', height: '1.25rem', color: '#0ea5e9' }} />
          <div>
            <div style={{ fontSize: '0.625rem', color: '#94a3b8', textTransform: 'uppercase' }}>High Score</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0ea5e9' }}>{highScore}</div>
          </div>
        </div>

        <button
          onClick={() => setShowInfo(!showInfo)}
          style={{
            background: 'rgba(14, 165, 233, 0.2)',
            border: '1px solid rgba(14, 165, 233, 0.5)',
            borderRadius: '0.5rem',
            color: '#0ea5e9',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(14, 165, 233, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(14, 165, 233, 0.2)';
          }}
        >
          <Info style={{ width: '1rem', height: '1rem' }} />
          How to Play
        </button>
      </div>

      {/* Game Canvas */}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={480}
          height={480}
          style={{
            border: '3px solid #0ea5e9',
            borderRadius: '0.5rem',
            boxShadow: '0 0 50px rgba(14, 165, 233, 0.3)',
            backgroundColor: '#000'
          }}
        />
        {!isGameStarted && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.9)',
            borderRadius: '0.5rem'
          }}>
            <button
              onClick={startGame}
              style={{
                background: '#0ea5e9',
                border: 'none',
                borderRadius: '0.5rem',
                color: '#fff',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                padding: '1.5rem 3rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 10px 40px rgba(14, 165, 233, 0.5)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#0284c7';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#0ea5e9';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Start Game
            </button>
          </div>
        )}
      </div>

      {/* Stop Button */}
      {isGameStarted && (
        <div style={{ position: 'absolute', bottom: '2rem' }}>
          <button
            onClick={stopGame}
            style={{
              background: '#ef4444',
              border: 'none',
              borderRadius: '0.5rem',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: '600',
              padding: '0.75rem 2rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#dc2626';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ef4444';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Stop Game
          </button>
        </div>
      )}

      {/* Info Modal */}
      {showInfo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem'
          }}
          onClick={() => setShowInfo(false)}
        >
          <div
            style={{
              background: '#1f2937',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              borderRadius: '1rem',
              padding: '2rem',
              maxWidth: '600px',
              width: '100%',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowInfo(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '0.375rem',
                color: '#fff',
                cursor: 'pointer',
                padding: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            >
              <X style={{ width: '1.25rem', height: '1.25rem' }} />
            </button>

            <h2 style={{
              color: '#fff',
              fontSize: '1.875rem',
              fontWeight: 'bold',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              How to Play
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{
                background: 'rgba(14, 165, 233, 0.1)',
                border: '1px solid rgba(14, 165, 233, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#0ea5e9', fontSize: '2rem', marginBottom: '0.5rem' }}>⌨️</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Controls</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Press any key to make the blue circle jump
                </p>
              </div>

              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#ef4444', fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Objective</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Avoid the red square obstacles
                </p>
              </div>

              <div style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#eab308', fontSize: '2rem', marginBottom: '0.5rem' }}>⭐</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Scoring</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Each successful dodge earns 100 points
                </p>
              </div>

              <div style={{
                background: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <div style={{ color: '#a855f7', fontSize: '2rem', marginBottom: '0.5rem' }}>🎮</div>
                <h3 style={{ color: '#fff', fontWeight: '600', marginBottom: '0.25rem' }}>Game Over</h3>
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                  Collision ends the game - beat your high score!
                </p>
              </div>
            </div>

            <div style={{
              background: 'rgba(14, 165, 233, 0.1)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              borderRadius: '0.5rem',
              padding: '1rem'
            }}>
              <div style={{ color: '#0ea5e9', fontWeight: '600', marginBottom: '0.5rem' }}>💡 Pro Tip</div>
              <p style={{ color: '#d1d5db', fontSize: '0.875rem' }}>
                Time your jumps carefully! Master the rhythm to achieve the highest score.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JumpGame;
