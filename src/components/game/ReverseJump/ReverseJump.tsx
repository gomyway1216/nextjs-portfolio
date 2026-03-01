'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type ObstacleType = 'ground' | 'overhead';

interface Obstacle {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: ObstacleType;
  scored: boolean;
}

type GamePhase = 'menu' | 'playing' | 'gameover';

interface GameState {
  phase: GamePhase;
  playerY: number;
  velocityY: number;
  ducking: boolean;
  obstacles: Obstacle[];
  score: number;
  controlInverted: boolean;
  switchTimerMs: number;
  spawnCooldown: number;
}

const GAME_WIDTH = 860;
const GAME_HEIGHT = 320;
const GROUND_Y = 260;
const PLAYER_X = 90;
const PLAYER_W = 42;
const PLAYER_STAND_H = 56;
const PLAYER_DUCK_H = 32;

const createInitialState = (): GameState => ({
  phase: 'menu',
  playerY: GROUND_Y,
  velocityY: 0,
  ducking: false,
  obstacles: [],
  score: 0,
  controlInverted: false,
  switchTimerMs: 8000,
  spawnCooldown: 95,
});

const intersects = (
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean => {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
};

const createObstacle = (id: number): Obstacle => {
  const overhead = Math.random() < 0.35;
  if (overhead) {
    return {
      id,
      x: GAME_WIDTH + 30,
      y: GROUND_Y - 90,
      width: 52,
      height: 20,
      type: 'overhead',
      scored: false,
    };
  }

  return {
    id,
    x: GAME_WIDTH + 30,
    y: GROUND_Y - 44,
    width: 34,
    height: 44,
    type: 'ground',
    scored: false,
  };
};

export const ReverseJump = () => {
  const [game, setGame] = useState<GameState>(createInitialState);
  const [highScore, setHighScore] = useState(() => {
    if (typeof window === 'undefined') {
      return 0;
    }

    const saved = window.localStorage.getItem('reverse-jump-high-score');
    if (!saved) {
      return 0;
    }

    const parsed = Number.parseInt(saved, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
  const jumpRequestedRef = useRef(false);
  const duckHeldRef = useRef(false);
  const obstacleIdRef = useRef(1);

  const startGame = () => {
    jumpRequestedRef.current = false;
    duckHeldRef.current = false;
    setGame({ ...createInitialState(), phase: 'playing' });
  };

  const triggerPrimary = (inverted: boolean) => {
    if (inverted) {
      duckHeldRef.current = true;
      window.setTimeout(() => {
        duckHeldRef.current = false;
      }, 220);
      return;
    }

    jumpRequestedRef.current = true;
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      if (event.code === 'Space') {
        event.preventDefault();
        if (game.phase === 'playing') {
          triggerPrimary(game.controlInverted);
        }
      }

      if (event.code === 'ArrowDown') {
        event.preventDefault();
        if (game.phase !== 'playing') return;

        if (game.controlInverted) {
          jumpRequestedRef.current = true;
        } else {
          duckHeldRef.current = true;
        }
      }

      if (event.code === 'ArrowUp') {
        event.preventDefault();
        if (game.phase !== 'playing') return;

        if (game.controlInverted) {
          duckHeldRef.current = true;
        } else {
          jumpRequestedRef.current = true;
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'ArrowDown') {
        if (!game.controlInverted) {
          duckHeldRef.current = false;
        }
      }
      if (event.code === 'ArrowUp') {
        if (game.controlInverted) {
          duckHeldRef.current = false;
        }
      }
      if (event.code === 'Space') {
        if (game.controlInverted) {
          duckHeldRef.current = false;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [game.phase, game.controlInverted]);

  useEffect(() => {
    if (game.phase !== 'playing') {
      return;
    }

    const frame = window.setInterval(() => {
      setGame((prev) => {
        if (prev.phase !== 'playing') {
          return prev;
        }

        let { playerY, velocityY, controlInverted, switchTimerMs, spawnCooldown } = prev;
        const onGround = playerY >= GROUND_Y - 0.001;

        if (jumpRequestedRef.current && onGround) {
          velocityY = -11;
          jumpRequestedRef.current = false;
        } else if (jumpRequestedRef.current && !onGround) {
          jumpRequestedRef.current = false;
        }

        velocityY += 0.58;
        playerY += velocityY;
        if (playerY > GROUND_Y) {
          playerY = GROUND_Y;
          velocityY = 0;
        }

        const ducking = duckHeldRef.current && playerY === GROUND_Y;

        switchTimerMs -= 16;
        if (switchTimerMs <= 0) {
          controlInverted = !controlInverted;
          switchTimerMs = 8000;
          duckHeldRef.current = false;
        }

        const speed = Math.min(11, 4.5 + prev.score * 0.04);

        spawnCooldown -= 1;
        const nextObstacles = prev.obstacles
          .map((obs) => ({ ...obs, x: obs.x - speed }))
          .filter((obs) => obs.x + obs.width > -40);

        if (spawnCooldown <= 0) {
          nextObstacles.push(createObstacle(obstacleIdRef.current));
          obstacleIdRef.current += 1;
          const minCooldown = Math.max(52, 90 - Math.floor(prev.score / 3));
          const maxCooldown = Math.max(78, 130 - Math.floor(prev.score / 2));
          spawnCooldown = minCooldown + Math.floor(Math.random() * (maxCooldown - minCooldown + 1));
        }

        const playerH = ducking ? PLAYER_DUCK_H : PLAYER_STAND_H;
        const playerTop = playerY - playerH;

        let score = prev.score;
        let hit = false;

        for (const obstacle of nextObstacles) {
          if (!obstacle.scored && obstacle.x + obstacle.width < PLAYER_X) {
            obstacle.scored = true;
            score += 1;
          }

          if (
            intersects(
              PLAYER_X,
              playerTop,
              PLAYER_W,
              playerH,
              obstacle.x,
              obstacle.y,
              obstacle.width,
              obstacle.height,
            )
          ) {
            hit = true;
          }
        }

        if (hit) {
          if (score > highScore) {
            setHighScore(score);
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('reverse-jump-high-score', String(score));
            }
          }

          return {
            ...prev,
            phase: 'gameover',
            playerY,
            velocityY,
            ducking,
            obstacles: nextObstacles,
            score,
            controlInverted,
            switchTimerMs,
            spawnCooldown,
          };
        }

        return {
          ...prev,
          playerY,
          velocityY,
          ducking,
          obstacles: nextObstacles,
          score,
          controlInverted,
          switchTimerMs,
          spawnCooldown,
        };
      });
    }, 16);

    return () => {
      window.clearInterval(frame);
    };
  }, [game.phase, highScore]);

  const controlLabel = useMemo(() => {
    return game.controlInverted ? 'INVERTED' : 'NORMAL';
  }, [game.controlInverted]);

  const timeToSwap = Math.ceil(game.switchTimerMs / 1000);
  const playerHeight = game.ducking ? PLAYER_DUCK_H : PLAYER_STAND_H;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #020617, #0f172a)', color: '#e2e8f0', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Reverse Jump</h1>
        <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>操作が8秒ごとに反転。低い障害物はジャンプ、高い障害物はしゃがみで回避。</p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <span style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '999px', padding: '0.4rem 0.8rem' }}>Score: {game.score}</span>
          <span style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '999px', padding: '0.4rem 0.8rem' }}>High: {highScore}</span>
          <span style={{ background: game.controlInverted ? '#7f1d1d' : '#1e293b', border: '1px solid #334155', borderRadius: '999px', padding: '0.4rem 0.8rem' }}>Mode: {controlLabel}</span>
          <span style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '999px', padding: '0.4rem 0.8rem' }}>Swap in: {timeToSwap}s</span>
        </div>

        <div
          onClick={() => {
            if (game.phase === 'playing') {
              triggerPrimary(game.controlInverted);
            }
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && game.phase === 'playing') {
              triggerPrimary(game.controlInverted);
            }
          }}
          style={{
            width: '100%',
            maxWidth: `${GAME_WIDTH}px`,
            height: `${GAME_HEIGHT}px`,
            borderRadius: '16px',
            border: '1px solid #334155',
            background: 'linear-gradient(180deg, #0f172a, #1e293b)',
            position: 'relative',
            overflow: 'hidden',
            outline: 'none',
          }}
        >
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${GAME_HEIGHT - GROUND_Y}px`, height: '2px', background: '#94a3b8' }} />

          <div
            style={{
              position: 'absolute',
              left: `${PLAYER_X}px`,
              bottom: `${GAME_HEIGHT - game.playerY}px`,
              width: `${PLAYER_W}px`,
              height: `${playerHeight}px`,
              borderRadius: '8px',
              background: game.controlInverted ? '#fb7185' : '#38bdf8',
              transition: 'height 80ms linear',
            }}
          />

          {game.obstacles.map((obstacle) => (
            <div
              key={obstacle.id}
              style={{
                position: 'absolute',
                left: `${obstacle.x}px`,
                top: `${obstacle.y}px`,
                width: `${obstacle.width}px`,
                height: `${obstacle.height}px`,
                borderRadius: '6px',
                background: obstacle.type === 'ground' ? '#f59e0b' : '#a78bfa',
              }}
            />
          ))}

          {game.phase !== 'playing' && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(2, 6, 23, 0.75)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.75rem' }}>{game.phase === 'menu' ? 'Ready?' : 'Game Over'}</h2>
              {game.phase === 'gameover' && <p style={{ margin: '0.5rem 0 0', color: '#cbd5e1' }}>Final Score: {game.score}</p>}
              <button
                onClick={startGame}
                style={{
                  marginTop: '1rem',
                  background: '#0ea5e9',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0.6rem 1.1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {game.phase === 'menu' ? 'Start' : 'Retry'}
              </button>
            </div>
          )}
        </div>

        <p style={{ marginTop: '1rem', color: '#94a3b8', fontSize: '0.95rem' }}>
          操作: `Space` / `↑` / タップ = メイン操作、`↓` = サブ操作。反転中はジャンプとしゃがみが入れ替わります。
        </p>
      </div>
    </div>
  );
};

export default ReverseJump;
