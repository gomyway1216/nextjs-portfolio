'use client';

import { useEffect, useRef, useState } from 'react';

type GravityDirection = 'down' | 'up' | 'left' | 'right';
type GamePhase = 'menu' | 'playing' | 'gameover';

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  alive: boolean;
  color: string;
}

interface RuntimeState {
  ball: Ball;
  paddle: Paddle;
  bricks: Brick[];
  gravity: GravityDirection;
  score: number;
  lives: number;
  stage: number;
  chaosTimer: number;
  chaosText: string;
  chaosTextTimer: number;
}

const WIDTH = 760;
const HEIGHT = 460;
const BRICK_ROWS = 6;
const BRICK_COLS = 10;

const createBricks = (): Brick[] => {
  const colors = ['#0ea5e9', '#22c55e', '#f59e0b', '#f97316', '#a855f7', '#fb7185'];
  const margin = 10;
  const totalGap = margin * (BRICK_COLS + 1);
  const brickWidth = (WIDTH - totalGap) / BRICK_COLS;
  const brickHeight = 22;

  const bricks: Brick[] = [];
  for (let row = 0; row < BRICK_ROWS; row += 1) {
    for (let col = 0; col < BRICK_COLS; col += 1) {
      bricks.push({
        x: margin + col * (brickWidth + margin),
        y: 56 + row * (brickHeight + 10),
        width: brickWidth,
        height: brickHeight,
        alive: true,
        color: colors[row % colors.length],
      });
    }
  }
  return bricks;
};

const createRuntimeState = (): RuntimeState => ({
  ball: {
    x: WIDTH / 2,
    y: HEIGHT - 110,
    vx: 4.2,
    vy: -4.2,
    r: 8,
  },
  paddle: {
    x: WIDTH / 2 - 56,
    y: HEIGHT - 32,
    width: 112,
    height: 12,
  },
  bricks: createBricks(),
  gravity: 'down',
  score: 0,
  lives: 3,
  stage: 1,
  chaosTimer: 600,
  chaosText: 'Chaos starts in 10s',
  chaosTextTimer: 120,
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const gravityVector = (direction: GravityDirection) => {
  if (direction === 'down') return { gx: 0, gy: 0.055 };
  if (direction === 'up') return { gx: 0, gy: -0.055 };
  if (direction === 'left') return { gx: -0.055, gy: 0 };
  return { gx: 0.055, gy: 0 };
};

const pickRandomGravity = (current: GravityDirection): GravityDirection => {
  const options: GravityDirection[] = ['down', 'up', 'left', 'right'];
  const filtered = options.filter((item) => item !== current);
  return filtered[Math.floor(Math.random() * filtered.length)];
};

export const ChaosBreakout = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<RuntimeState>(createRuntimeState());
  const frameRef = useRef<number | null>(null);
  const keysRef = useRef({ left: false, right: false });

  const [phase, setPhase] = useState<GamePhase>('menu');
  const [hud, setHud] = useState({
    score: 0,
    lives: 3,
    stage: 1,
    gravity: 'down' as GravityDirection,
    chaosText: 'Chaos starts in 10s',
  });

  const resetGame = () => {
    runtimeRef.current = createRuntimeState();
    setHud({ score: 0, lives: 3, stage: 1, gravity: 'down', chaosText: 'Chaos starts in 10s' });
  };

  const draw = (ctx: CanvasRenderingContext2D, state: RuntimeState) => {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#020617');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      ctx.fillStyle = brick.color;
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
    }

    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(state.paddle.x, state.paddle.y, state.paddle.width, state.paddle.height);

    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, state.ball.r, 0, Math.PI * 2);
    ctx.fillStyle = '#fef08a';
    ctx.fill();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.font = '14px monospace';
    ctx.fillText(`GRAVITY: ${state.gravity.toUpperCase()}`, 16, HEIGHT - 16);
  };

  useEffect(() => {
    if (phase !== 'playing') {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loop = () => {
      const state = runtimeRef.current;

      if (keysRef.current.left) {
        state.paddle.x -= 7;
      }
      if (keysRef.current.right) {
        state.paddle.x += 7;
      }
      state.paddle.x = clamp(state.paddle.x, 0, WIDTH - state.paddle.width);

      state.chaosTimer -= 1;
      if (state.chaosTimer <= 0) {
        const roll = Math.floor(Math.random() * 3);
        if (roll === 0) {
          state.gravity = pickRandomGravity(state.gravity);
          state.chaosText = `Chaos: gravity -> ${state.gravity.toUpperCase()}`;
        } else if (roll === 1) {
          const mul = 1.2 + Math.random() * 0.55;
          state.ball.vx *= mul;
          state.ball.vy *= mul;
          state.chaosText = `Chaos: speed x${mul.toFixed(2)}`;
        } else {
          const nextWidth = 70 + Math.random() * 120;
          state.paddle.width = nextWidth;
          state.paddle.x = clamp(state.paddle.x, 0, WIDTH - state.paddle.width);
          state.chaosText = `Chaos: paddle width ${Math.round(nextWidth)}px`;
        }
        state.chaosTextTimer = 180;
        state.chaosTimer = 600;
      }

      if (state.chaosTextTimer > 0) {
        state.chaosTextTimer -= 1;
      } else {
        state.chaosText = 'Survive the next chaos pulse';
      }

      const g = gravityVector(state.gravity);
      state.ball.vx += g.gx;
      state.ball.vy += g.gy;

      state.ball.vx = clamp(state.ball.vx, -11, 11);
      state.ball.vy = clamp(state.ball.vy, -11, 11);

      state.ball.x += state.ball.vx;
      state.ball.y += state.ball.vy;

      if (state.ball.x - state.ball.r <= 0) {
        state.ball.x = state.ball.r;
        state.ball.vx *= -1;
      }
      if (state.ball.x + state.ball.r >= WIDTH) {
        state.ball.x = WIDTH - state.ball.r;
        state.ball.vx *= -1;
      }
      if (state.ball.y - state.ball.r <= 0) {
        state.ball.y = state.ball.r;
        state.ball.vy *= -1;
      }

      const inPaddleX = state.ball.x >= state.paddle.x && state.ball.x <= state.paddle.x + state.paddle.width;
      const touchingPaddle =
        state.ball.y + state.ball.r >= state.paddle.y &&
        state.ball.y + state.ball.r <= state.paddle.y + state.paddle.height &&
        inPaddleX &&
        state.ball.vy > 0;

      if (touchingPaddle) {
        const relative = (state.ball.x - (state.paddle.x + state.paddle.width / 2)) / (state.paddle.width / 2);
        state.ball.vx += relative * 1.2;
        state.ball.vy = -Math.abs(state.ball.vy) * 0.95;
      }

      for (const brick of state.bricks) {
        if (!brick.alive) continue;
        const hitX = state.ball.x + state.ball.r > brick.x && state.ball.x - state.ball.r < brick.x + brick.width;
        const hitY = state.ball.y + state.ball.r > brick.y && state.ball.y - state.ball.r < brick.y + brick.height;
        if (!hitX || !hitY) continue;

        brick.alive = false;
        state.score += 10;

        const overlapLeft = state.ball.x + state.ball.r - brick.x;
        const overlapRight = brick.x + brick.width - (state.ball.x - state.ball.r);
        const overlapTop = state.ball.y + state.ball.r - brick.y;
        const overlapBottom = brick.y + brick.height - (state.ball.y - state.ball.r);

        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
        if (minOverlap === overlapLeft || minOverlap === overlapRight) {
          state.ball.vx *= -1;
        } else {
          state.ball.vy *= -1;
        }
        break;
      }

      const remaining = state.bricks.filter((brick) => brick.alive).length;
      if (remaining === 0) {
        state.stage += 1;
        state.bricks = createBricks();
        state.ball.x = WIDTH / 2;
        state.ball.y = HEIGHT - 110;
        state.ball.vx = (Math.random() > 0.5 ? 1 : -1) * (4 + state.stage * 0.3);
        state.ball.vy = -4.6 - state.stage * 0.25;
        state.chaosText = `Stage ${state.stage} started`; 
        state.chaosTextTimer = 150;
      }

      const outOfBounds =
        state.ball.x < -48 ||
        state.ball.x > WIDTH + 48 ||
        state.ball.y > HEIGHT + 48 ||
        state.ball.y < -48;

      if (outOfBounds) {
        state.lives -= 1;
        state.ball.x = WIDTH / 2;
        state.ball.y = HEIGHT - 110;
        state.ball.vx = (Math.random() > 0.5 ? 1 : -1) * (4 + state.stage * 0.3);
        state.ball.vy = -4.2;
        state.gravity = 'down';
        state.chaosText = `Life lost. ${state.lives} left`;
        state.chaosTextTimer = 160;
        if (state.lives <= 0) {
          setPhase('gameover');
        }
      }

      setHud({
        score: state.score,
        lives: state.lives,
        stage: state.stage,
        gravity: state.gravity,
        chaosText: state.chaosText,
      });

      draw(ctx, state);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        keysRef.current.left = true;
      }
      if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        keysRef.current.right = true;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        keysRef.current.left = false;
      }
      if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        keysRef.current.right = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', padding: '2rem 1rem', background: 'linear-gradient(180deg, #030712, #0f172a)', color: '#e2e8f0' }}>
      <div style={{ maxWidth: '980px', margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Chaos Breakout</h1>
        <p style={{ marginTop: '0.5rem', color: '#94a3b8' }}>10秒ごとに重力・速度・パドル幅がカオス変化するブロック崩し。</p>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', padding: '0.4rem 0.75rem', background: '#0f172a' }}>Score: {hud.score}</span>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', padding: '0.4rem 0.75rem', background: '#0f172a' }}>Lives: {hud.lives}</span>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', padding: '0.4rem 0.75rem', background: '#0f172a' }}>Stage: {hud.stage}</span>
          <span style={{ border: '1px solid #334155', borderRadius: '999px', padding: '0.4rem 0.75rem', background: '#0f172a' }}>Gravity: {hud.gravity.toUpperCase()}</span>
        </div>

        <div style={{ marginBottom: '0.8rem', minHeight: '1.4rem', color: '#fca5a5' }}>{hud.chaosText}</div>

        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          style={{ width: '100%', maxWidth: `${WIDTH}px`, border: '1px solid #334155', borderRadius: '14px', display: 'block', background: '#020617' }}
        />

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            onClick={() => {
              resetGame();
              setPhase('playing');
            }}
            style={{ background: '#22d3ee', color: '#083344', border: 'none', borderRadius: '10px', padding: '0.65rem 1rem', fontWeight: 700, cursor: 'pointer' }}
          >
            {phase === 'playing' ? 'Restart' : phase === 'gameover' ? 'Play Again' : 'Start'}
          </button>
          {phase === 'gameover' && <div style={{ alignSelf: 'center', color: '#fca5a5' }}>Game Over</div>}
        </div>

        <p style={{ marginTop: '0.75rem', color: '#94a3b8' }}>操作: ← → または A / D</p>
      </div>
    </div>
  );
};

export default ChaosBreakout;
