/**
 * Breakout Game - Game Engine (pure logic, unit-tested)
 */

import type { Difficulty } from '../common/types';
import {
  Ball,
  BALL_RADIUS,
  Brick,
  BRICK_COLS,
  BRICK_HEIGHT,
  BRICK_OFFSET_LEFT,
  BRICK_OFFSET_TOP,
  BRICK_PADDING,
  BRICK_WIDTH,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DIFFICULTY_CONFIGS,
  DifficultyConfig,
  GameState,
  getBrickType,
  InputState,
  MAX_BALL_SPEED,
  MAX_LEVEL,
  MIN_VERTICAL_RATIO,
  Paddle,
  PADDLE_HEIGHT,
  PADDLE_SPEED,
  PADDLE_Y,
  Particle,
  PowerUp,
  POWERUP_CONFIGS,
  POWERUP_SIZE,
  POWERUP_SPEED,
  POWERUP_WEIGHTS,
  PowerUpType,
  STEEL_BRICK_TYPE,
} from './types';

// ---------------------------------------------------------------------------
// Pure math helpers (exported for testing)
// ---------------------------------------------------------------------------

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Given the ball's centre X, the paddle bounds and the ball's speed, return the
 * post-bounce velocity. The horizontal "english" is a function of where on the
 * paddle the ball landed: centre = straight up, edges = steep angle.
 * A vertical floor is enforced so the ball is never (nearly) horizontal.
 */
export function paddleBounce(
  ballX: number,
  paddleX: number,
  paddleWidth: number,
  speed: number
): { dx: number; dy: number } {
  // -1 (left edge) .. 0 (centre) .. 1 (right edge)
  const rel = clamp((ballX - (paddleX + paddleWidth / 2)) / (paddleWidth / 2), -1, 1);
  const maxAngle = (Math.PI / 180) * 60; // up to 60deg from vertical
  const angle = rel * maxAngle;
  const dx = Math.sin(angle) * speed;
  let dy = -Math.cos(angle) * speed;
  // Enforce a minimum vertical speed so a glancing edge hit still climbs.
  const minDy = speed * MIN_VERTICAL_RATIO;
  if (Math.abs(dy) < minDy) dy = -minDy;
  return { dx, dy };
}

/**
 * Re-normalise a ball's velocity vector to a given speed, preserving direction
 * but guaranteeing a minimum vertical component (anti-stall).
 */
export function setBallSpeed(ball: Ball, speed: number): void {
  const mag = Math.hypot(ball.dx, ball.dy) || 1;
  ball.dx = (ball.dx / mag) * speed;
  ball.dy = (ball.dy / mag) * speed;
  ball.speed = speed;
  const minDy = speed * MIN_VERTICAL_RATIO;
  if (Math.abs(ball.dy) < minDy) {
    ball.dy = Math.sign(ball.dy || -1) * minDy;
    // keep magnitude ~= speed
    const remaining = Math.max(speed * speed - ball.dy * ball.dy, 0);
    ball.dx = Math.sign(ball.dx || 1) * Math.sqrt(remaining);
  }
}

export type CollisionSide = 'top' | 'bottom' | 'left' | 'right' | null;

/**
 * Axis-aligned circle-vs-rect collision. Resolves which side was hit by finding
 * the closest point on the rect to the ball centre; the axis of largest
 * penetration determines the bounce side. Returns the side plus the amount the
 * ball must be pushed out to no longer overlap (used to prevent tunnelling /
 * sticking).
 */
export function circleRectCollision(
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): { hit: boolean; side: CollisionSide; pushX: number; pushY: number } {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  if (dx * dx + dy * dy > radius * radius) {
    return { hit: false, side: null, pushX: 0, pushY: 0 };
  }

  // Ball centre relative to rect centre — used to decide horizontal vs vertical.
  const relX = cx - (rx + rw / 2);
  const relY = cy - (ry + rh / 2);
  // Penetration depth along each axis if we treat this as an AABB overlap.
  const overlapX = rw / 2 + radius - Math.abs(relX);
  const overlapY = rh / 2 + radius - Math.abs(relY);

  let side: CollisionSide;
  let pushX = 0;
  let pushY = 0;
  if (overlapX < overlapY) {
    side = relX < 0 ? 'left' : 'right';
    pushX = relX < 0 ? -overlapX : overlapX;
  } else {
    side = relY < 0 ? 'top' : 'bottom';
    pushY = relY < 0 ? -overlapY : overlapY;
  }
  return { hit: true, side, pushX, pushY };
}

// ---------------------------------------------------------------------------
// Level layouts
// ---------------------------------------------------------------------------

// Each layout is a grid of row strings. Characters map to brick "type":
//   '.'  empty
//   '0'..'5'  coloured brick
//   'S'  steel (multi-hit) brick
//   '#'  brick coloured by row index (classic rainbow)
const LEVEL_LAYOUTS: string[][] = [
  // 1 — classic rainbow rows
  ['##########', '##########', '##########', '##########', '##########'],
  // 2 — pyramid
  ['....SS....', '...5555...', '..333333..', '.11111111.', '0000000000'],
  // 3 — checkerboard
  ['5.4.3.2.1.', '.5.4.3.2.1', '5.4.3.2.1.', '.5.4.3.2.1', '5.4.3.2.1.', '.5.4.3.2.1'],
  // 4 — fortress (steel frame)
  ['SSSSSSSSSS', 'S44444444S', 'S3.....3.S', 'S3.SS..3.S', 'S22222222S', 'S00000000S'],
  // 5 — diamonds
  ['..3....3..', '.323..323.', '32123.32123'.slice(0, 10), '.323..323.', '..3....3..', '4444444444'],
  // 6 — gauntlet (lots of steel)
  ['S5S5S5S5S5', '5S5S5S5S5S', 'SS4444SS44'.slice(0, 10), '3333333333', 'S2S2S2S2S2', '1111111111'],
];

function charToType(ch: string, row: number): number | null {
  if (ch === '.' || ch === ' ') return null;
  if (ch === 'S') return STEEL_BRICK_TYPE;
  if (ch === '#') return row % 6;
  const n = parseInt(ch, 10);
  return Number.isNaN(n) ? null : clamp(n, 0, 5);
}

export function createBricks(level: number): Brick[] {
  const layout = LEVEL_LAYOUTS[(level - 1) % LEVEL_LAYOUTS.length];
  const bricks: Brick[] = [];
  for (let row = 0; row < layout.length; row++) {
    const line = layout[row];
    for (let col = 0; col < BRICK_COLS; col++) {
      const ch = line[col] ?? '.';
      const type = charToType(ch, row);
      if (type === null) continue;
      const bt = getBrickType(type);
      bricks.push({
        x: BRICK_OFFSET_LEFT + col * (BRICK_WIDTH + BRICK_PADDING),
        y: BRICK_OFFSET_TOP + row * (BRICK_HEIGHT + BRICK_PADDING),
        width: BRICK_WIDTH,
        height: BRICK_HEIGHT,
        type,
        hits: bt.hits,
        active: true,
      });
    }
  }
  return bricks;
}

// ---------------------------------------------------------------------------
// State factory
// ---------------------------------------------------------------------------

function createPaddle(width: number): Paddle {
  return {
    x: (CANVAS_WIDTH - width) / 2,
    y: PADDLE_Y,
    width,
    height: PADDLE_HEIGHT,
  };
}

// A held ball rests on the paddle until launch.
function createHeldBall(paddle: Paddle, speed: number): Ball {
  return {
    x: paddle.x + paddle.width / 2,
    y: paddle.y - BALL_RADIUS - 1,
    dx: 0,
    dy: -speed,
    radius: BALL_RADIUS,
    speed,
  };
}

export function createGameState(difficulty: Difficulty = 'medium', level = 1): GameState {
  const config: DifficultyConfig = DIFFICULTY_CONFIGS[difficulty];
  const paddle = createPaddle(config.paddleWidth);
  return {
    balls: [createHeldBall(paddle, config.ballSpeed)],
    paddle,
    bricks: createBricks(level),
    powerUps: [],
    activeEffects: [],
    particles: [],
    score: 0,
    lives: config.lives,
    level,
    combo: 0,
    gameOver: false,
    victory: false,
    isPaused: false,
    launched: false,
    difficulty,
    config,
  flash: 0,
  };
}

export function launchBall(state: GameState): void {
  if (state.launched) return;
  state.launched = true;
  for (const ball of state.balls) {
    // Nudge slightly to a side so it isn't perfectly vertical.
    const dir = Math.random() < 0.5 ? -1 : 1;
    ball.dx = dir * ball.speed * 0.35;
    ball.dy = -ball.speed;
    setBallSpeed(ball, ball.speed);
  }
}

// Reset ball after losing a life (held on paddle again).
export function resetBall(state: GameState): void {
  state.paddle.width = state.config.paddleWidth;
  state.paddle.x = clamp(state.paddle.x, 0, CANVAS_WIDTH - state.paddle.width);
  state.balls = [createHeldBall(state.paddle, state.config.ballSpeed)];
  state.powerUps = [];
  state.activeEffects = [];
  state.combo = 0;
  state.launched = false;
}

// Advance to next level.
export function nextLevel(state: GameState): void {
  state.level++;
  state.bricks = createBricks(state.level);
  state.paddle.width = state.config.paddleWidth;
  state.balls = [createHeldBall(state.paddle, state.config.ballSpeed)];
  state.powerUps = [];
  state.activeEffects = [];
  state.combo = 0;
  state.launched = false;
}

// ---------------------------------------------------------------------------
// Power-ups
// ---------------------------------------------------------------------------

function weightedPowerUp(): (typeof POWERUP_CONFIGS)[number] {
  const total = POWERUP_CONFIGS.reduce((s, c) => s + POWERUP_WEIGHTS[c.type], 0);
  let r = Math.random() * total;
  for (const config of POWERUP_CONFIGS) {
    r -= POWERUP_WEIGHTS[config.type];
    if (r <= 0) return config;
  }
  return POWERUP_CONFIGS[0];
}

function spawnPowerUp(state: GameState, brick: Brick): PowerUp | null {
  if (Math.random() > state.config.powerUpChance) return null;
  const config = weightedPowerUp();
  return {
    x: brick.x + brick.width / 2,
    y: brick.y + brick.height,
    type: config.type,
    config,
  };
}

function applyPowerUp(state: GameState, powerUp: PowerUp): void {
  const now = Date.now();
  const setEffect = (type: PowerUpType, duration?: number) => {
    if (!duration) return;
    // Refresh existing effect of same type rather than stacking.
    state.activeEffects = state.activeEffects.filter((e) => e.type !== type);
    state.activeEffects.push({ type, endTime: now + duration });
  };

  switch (powerUp.type) {
    case PowerUpType.EXPAND_PADDLE:
      state.paddle.width = Math.min(state.config.paddleWidth * 1.6, CANVAS_WIDTH / 3);
      state.paddle.x = clamp(state.paddle.x, 0, CANVAS_WIDTH - state.paddle.width);
      setEffect(PowerUpType.EXPAND_PADDLE, powerUp.config.duration);
      break;

    case PowerUpType.SHRINK_PADDLE:
      state.paddle.width = Math.max(state.config.paddleWidth * 0.6, 48);
      setEffect(PowerUpType.SHRINK_PADDLE, powerUp.config.duration);
      break;

    case PowerUpType.MULTI_BALL: {
      const newBalls: Ball[] = [];
      for (const ball of state.balls) {
        for (let i = 0; i < 2; i++) {
          const clone: Ball = { ...ball };
          const angle = (Math.random() - 0.5) * (Math.PI / 2);
          clone.dx = Math.sin(angle) * ball.speed;
          clone.dy = -Math.abs(Math.cos(angle) * ball.speed);
          setBallSpeed(clone, ball.speed);
          newBalls.push(clone);
        }
      }
      state.balls.push(...newBalls);
      state.launched = true;
      break;
    }

    case PowerUpType.SLOW_BALL:
      for (const ball of state.balls) {
        setBallSpeed(ball, Math.max(ball.speed * 0.7, state.config.ballSpeed * 0.5));
      }
      setEffect(PowerUpType.SLOW_BALL, powerUp.config.duration);
      break;

    case PowerUpType.FAST_BALL:
      for (const ball of state.balls) {
        setBallSpeed(ball, Math.min(ball.speed * 1.3, MAX_BALL_SPEED));
      }
      setEffect(PowerUpType.FAST_BALL, powerUp.config.duration);
      break;

    case PowerUpType.EXTRA_LIFE:
      state.lives++;
      break;
  }
}

function updateEffects(state: GameState): void {
  const now = Date.now();
  let paddleReset = false;
  let speedReset = false;
  for (const effect of state.activeEffects) {
    if (effect.endTime > now) continue;
    if (effect.type === PowerUpType.EXPAND_PADDLE || effect.type === PowerUpType.SHRINK_PADDLE) {
      paddleReset = true;
    }
    if (effect.type === PowerUpType.SLOW_BALL || effect.type === PowerUpType.FAST_BALL) {
      speedReset = true;
    }
  }
  if (paddleReset) {
    state.paddle.width = state.config.paddleWidth;
    state.paddle.x = clamp(state.paddle.x, 0, CANVAS_WIDTH - state.paddle.width);
  }
  if (speedReset) {
    for (const ball of state.balls) {
      // Restore toward the difficulty base speed (not the accumulated speed).
      setBallSpeed(ball, clamp(state.config.ballSpeed, state.config.ballSpeed, MAX_BALL_SPEED));
    }
  }
  state.activeEffects = state.activeEffects.filter((e) => e.endTime > now);
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

function spawnBreakParticles(state: GameState, brick: Brick, color: string): void {
  const cx = brick.x + brick.width / 2;
  const cy = brick.y + brick.height / 2;
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 1.5 + Math.random() * 2.5;
    state.particles.push({
      x: cx,
      y: cy,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed - 1,
      life: 1,
      color,
      size: 2 + Math.random() * 2.5,
    });
  }
}

function updateParticles(state: GameState, dt: number): void {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p: Particle = state.particles[i];
    p.x += p.dx * dt;
    p.y += p.dy * dt;
    p.dy += 0.12 * dt; // gravity
    p.life -= 0.025 * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// Main update
// ---------------------------------------------------------------------------

export function updateGame(state: GameState, input: InputState, deltaTime: number): void {
  if (state.gameOver || state.victory || state.isPaused) return;

  const dt = deltaTime / 16.67; // Normalize to ~60fps

  updateEffects(state);
  if (state.flash > 0) state.flash = Math.max(0, state.flash - 0.08 * dt);

  // Move paddle: pointer control takes precedence, else keyboard.
  if (input.pointerX !== null) {
    const target = clamp(input.pointerX - state.paddle.width / 2, 0, CANVAS_WIDTH - state.paddle.width);
    // Smooth follow so the paddle doesn't teleport (keeps english meaningful).
    state.paddle.x += (target - state.paddle.x) * Math.min(1, 0.5 * dt);
  } else {
    if (input.left) state.paddle.x = Math.max(0, state.paddle.x - PADDLE_SPEED * dt);
    if (input.right) {
      state.paddle.x = Math.min(CANVAS_WIDTH - state.paddle.width, state.paddle.x + PADDLE_SPEED * dt);
    }
  }
  state.paddle.x = clamp(state.paddle.x, 0, CANVAS_WIDTH - state.paddle.width);

  updateParticles(state, dt);

  // Ball held on paddle until launch.
  if (!state.launched) {
    for (const ball of state.balls) {
      ball.x = state.paddle.x + state.paddle.width / 2;
      ball.y = state.paddle.y - ball.radius - 1;
    }
    return;
  }

  // Update falling power-ups.
  for (let i = state.powerUps.length - 1; i >= 0; i--) {
    const powerUp = state.powerUps[i];
    powerUp.y += POWERUP_SPEED * dt;
    if (
      powerUp.y + POWERUP_SIZE / 2 >= state.paddle.y &&
      powerUp.y - POWERUP_SIZE / 2 <= state.paddle.y + state.paddle.height &&
      powerUp.x >= state.paddle.x &&
      powerUp.x <= state.paddle.x + state.paddle.width
    ) {
      applyPowerUp(state, powerUp);
      state.flash = Math.max(state.flash, powerUp.config.good ? 0.35 : 0.5);
      state.powerUps.splice(i, 1);
      continue;
    }
    if (powerUp.y - POWERUP_SIZE / 2 > CANVAS_HEIGHT) state.powerUps.splice(i, 1);
  }

  // Update balls with sub-stepping so fast balls don't tunnel through bricks.
  for (let i = state.balls.length - 1; i >= 0; i--) {
    const ball = state.balls[i];
    const travel = Math.hypot(ball.dx, ball.dy) * dt;
    const steps = Math.max(1, Math.ceil(travel / (ball.radius * 0.9)));
    const stepDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      ball.x += ball.dx * stepDt;
      ball.y += ball.dy * stepDt;

      // Wall collisions.
      if (ball.x - ball.radius <= 0) {
        ball.x = ball.radius;
        ball.dx = Math.abs(ball.dx);
      } else if (ball.x + ball.radius >= CANVAS_WIDTH) {
        ball.x = CANVAS_WIDTH - ball.radius;
        ball.dx = -Math.abs(ball.dx);
      }
      if (ball.y - ball.radius <= 0) {
        ball.y = ball.radius;
        ball.dy = Math.abs(ball.dy);
      }

      // Paddle collision.
      if (
        ball.dy > 0 &&
        ball.y + ball.radius >= state.paddle.y &&
        ball.y - ball.radius <= state.paddle.y + state.paddle.height &&
        ball.x + ball.radius >= state.paddle.x &&
        ball.x - ball.radius <= state.paddle.x + state.paddle.width
      ) {
        const { dx, dy } = paddleBounce(ball.x, state.paddle.x, state.paddle.width, ball.speed);
        ball.dx = dx;
        ball.dy = dy;
        ball.y = state.paddle.y - ball.radius - 0.5;
        state.combo = 0; // combo resets when the ball returns to the paddle
      }

      // Brick collision — resolve at most one brick per sub-step.
      for (const brick of state.bricks) {
        if (!brick.active) continue;
        const col = circleRectCollision(
          ball.x,
          ball.y,
          ball.radius,
          brick.x,
          brick.y,
          brick.width,
          brick.height
        );
        if (!col.hit || !col.side) continue;

        // Push the ball out so it can't lodge inside / double-hit.
        ball.x += col.pushX;
        ball.y += col.pushY;
        if (col.side === 'left' || col.side === 'right') {
          ball.dx = col.side === 'left' ? -Math.abs(ball.dx) : Math.abs(ball.dx);
        } else {
          ball.dy = col.side === 'top' ? -Math.abs(ball.dy) : Math.abs(ball.dy);
        }

        brick.hits--;
        if (brick.hits <= 0) {
          brick.active = false;
          state.combo++;
          const base = getBrickType(brick.type).points;
          const comboBonus = 1 + Math.min(state.combo - 1, 9) * 0.1; // up to +90%
          state.score += Math.round(base * state.level * comboBonus);
          spawnBreakParticles(state, brick, getBrickType(brick.type).gradientStart);
          const pu = spawnPowerUp(state, brick);
          if (pu) state.powerUps.push(pu);
          // Speed up slightly on each destroyed brick.
          setBallSpeed(ball, Math.min(ball.speed + state.config.speedIncrement, MAX_BALL_SPEED));
        }
        break;
      }
    }

    // Ball lost.
    if (ball.y - ball.radius > CANVAS_HEIGHT) state.balls.splice(i, 1);
  }

  // Check if all balls lost.
  if (state.balls.length === 0) {
    state.lives--;
    if (state.lives <= 0) {
      state.gameOver = true;
    } else {
      resetBall(state);
    }
    return;
  }

  // Check victory / level clear.
  if (state.bricks.every((b) => !b.active)) {
    if (state.level >= MAX_LEVEL) {
      state.victory = true;
    } else {
      nextLevel(state);
    }
  }
}
