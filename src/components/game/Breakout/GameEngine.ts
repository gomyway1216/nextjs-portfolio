/**
 * Breakout Game - Game Engine
 */

import {
  GameState,
  Ball,
  Paddle,
  Brick,
  PowerUp,
  InputState,
  ActiveEffect,
  PowerUpType,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PADDLE_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_SPEED,
  PADDLE_Y,
  BALL_RADIUS,
  INITIAL_BALL_SPEED,
  MAX_BALL_SPEED,
  BALL_SPEED_INCREMENT,
  BRICK_ROWS,
  BRICK_COLS,
  BRICK_WIDTH,
  BRICK_HEIGHT,
  BRICK_PADDING,
  BRICK_OFFSET_TOP,
  BRICK_OFFSET_LEFT,
  BRICK_TYPES,
  POWERUP_SIZE,
  POWERUP_SPEED,
  POWERUP_CHANCE,
  POWERUP_CONFIGS,
  INITIAL_LIVES,
} from './types';

// Create initial ball
function createBall(paddle: Paddle): Ball {
  return {
    x: paddle.x + paddle.width / 2,
    y: paddle.y - BALL_RADIUS - 1,
    dx: (Math.random() - 0.5) * 2 * INITIAL_BALL_SPEED,
    dy: -INITIAL_BALL_SPEED,
    radius: BALL_RADIUS,
    speed: INITIAL_BALL_SPEED,
  };
}

// Create paddle
function createPaddle(): Paddle {
  return {
    x: (CANVAS_WIDTH - PADDLE_WIDTH) / 2,
    y: PADDLE_Y,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
  };
}

// Create bricks for a level
function createBricks(level: number): Brick[] {
  const bricks: Brick[] = [];
  const rows = Math.min(BRICK_ROWS + Math.floor(level / 2), 8);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < BRICK_COLS; col++) {
      const typeIndex = row % BRICK_TYPES.length;
      const brickType = BRICK_TYPES[typeIndex];

      // Higher levels have stronger bricks
      const extraHits = level > 3 && row < 2 ? 1 : 0;

      bricks.push({
        x: BRICK_OFFSET_LEFT + col * (BRICK_WIDTH + BRICK_PADDING),
        y: BRICK_OFFSET_TOP + row * (BRICK_HEIGHT + BRICK_PADDING),
        width: BRICK_WIDTH,
        height: BRICK_HEIGHT,
        type: typeIndex,
        hits: brickType.hits + extraHits,
        active: true,
      });
    }
  }

  return bricks;
}

// Create initial game state
export function createGameState(level: number = 1): GameState {
  const paddle = createPaddle();
  const ball = createBall(paddle);

  return {
    balls: [ball],
    paddle,
    bricks: createBricks(level),
    powerUps: [],
    activeEffects: [],
    score: 0,
    lives: INITIAL_LIVES,
    level,
    gameOver: false,
    victory: false,
    isPaused: false,
  };
}

// Reset ball after losing a life
export function resetBall(state: GameState): void {
  state.balls = [createBall(state.paddle)];
  state.powerUps = [];
  // Reset paddle width
  state.paddle.width = PADDLE_WIDTH;
  state.paddle.x = Math.min(
    Math.max(state.paddle.x, 0),
    CANVAS_WIDTH - state.paddle.width
  );
}

// Advance to next level
export function nextLevel(state: GameState): void {
  state.level++;
  state.bricks = createBricks(state.level);
  state.balls = [createBall(state.paddle)];
  state.powerUps = [];
  state.activeEffects = [];
  state.paddle.width = PADDLE_WIDTH;
}

// Spawn power-up from brick
function spawnPowerUp(brick: Brick): PowerUp | null {
  if (Math.random() > POWERUP_CHANCE) return null;

  const config = POWERUP_CONFIGS[Math.floor(Math.random() * POWERUP_CONFIGS.length)];

  return {
    x: brick.x + brick.width / 2,
    y: brick.y + brick.height,
    type: config.type,
    config,
  };
}

// Apply power-up effect
function applyPowerUp(state: GameState, powerUp: PowerUp): void {
  const now = Date.now();

  switch (powerUp.type) {
    case PowerUpType.EXPAND_PADDLE:
      state.paddle.width = Math.min(PADDLE_WIDTH * 1.5, CANVAS_WIDTH / 3);
      state.paddle.x = Math.min(state.paddle.x, CANVAS_WIDTH - state.paddle.width);
      if (powerUp.config.duration) {
        state.activeEffects.push({
          type: PowerUpType.EXPAND_PADDLE,
          endTime: now + powerUp.config.duration,
        });
      }
      break;

    case PowerUpType.SHRINK_PADDLE:
      state.paddle.width = Math.max(PADDLE_WIDTH * 0.6, 50);
      if (powerUp.config.duration) {
        state.activeEffects.push({
          type: PowerUpType.SHRINK_PADDLE,
          endTime: now + powerUp.config.duration,
        });
      }
      break;

    case PowerUpType.MULTI_BALL:
      const newBalls: Ball[] = [];
      for (const ball of state.balls) {
        // Create 2 extra balls
        for (let i = 0; i < 2; i++) {
          const angle = (Math.random() - 0.5) * Math.PI / 2;
          const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          newBalls.push({
            ...ball,
            dx: Math.sin(angle) * speed,
            dy: -Math.abs(Math.cos(angle) * speed),
          });
        }
      }
      state.balls.push(...newBalls);
      break;

    case PowerUpType.SLOW_BALL:
      for (const ball of state.balls) {
        ball.speed = Math.max(ball.speed * 0.7, INITIAL_BALL_SPEED * 0.5);
        const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
        const ratio = ball.speed / currentSpeed;
        ball.dx *= ratio;
        ball.dy *= ratio;
      }
      if (powerUp.config.duration) {
        state.activeEffects.push({
          type: PowerUpType.SLOW_BALL,
          endTime: now + powerUp.config.duration,
        });
      }
      break;

    case PowerUpType.FAST_BALL:
      for (const ball of state.balls) {
        ball.speed = Math.min(ball.speed * 1.3, MAX_BALL_SPEED);
        const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
        const ratio = ball.speed / currentSpeed;
        ball.dx *= ratio;
        ball.dy *= ratio;
      }
      if (powerUp.config.duration) {
        state.activeEffects.push({
          type: PowerUpType.FAST_BALL,
          endTime: now + powerUp.config.duration,
        });
      }
      break;

    case PowerUpType.EXTRA_LIFE:
      state.lives++;
      break;
  }
}

// Update active effects
function updateEffects(state: GameState): void {
  const now = Date.now();
  const expiredEffects = state.activeEffects.filter(e => e.endTime <= now);

  for (const effect of expiredEffects) {
    if (effect.type === PowerUpType.EXPAND_PADDLE || effect.type === PowerUpType.SHRINK_PADDLE) {
      state.paddle.width = PADDLE_WIDTH;
      state.paddle.x = Math.min(state.paddle.x, CANVAS_WIDTH - state.paddle.width);
    }
  }

  state.activeEffects = state.activeEffects.filter(e => e.endTime > now);
}

// Check ball-brick collision
function checkBrickCollision(ball: Ball, brick: Brick): { hit: boolean; side: 'top' | 'bottom' | 'left' | 'right' | null } {
  if (!brick.active) return { hit: false, side: null };

  const ballLeft = ball.x - ball.radius;
  const ballRight = ball.x + ball.radius;
  const ballTop = ball.y - ball.radius;
  const ballBottom = ball.y + ball.radius;

  const brickLeft = brick.x;
  const brickRight = brick.x + brick.width;
  const brickTop = brick.y;
  const brickBottom = brick.y + brick.height;

  if (ballRight < brickLeft || ballLeft > brickRight ||
      ballBottom < brickTop || ballTop > brickBottom) {
    return { hit: false, side: null };
  }

  // Determine which side was hit
  const overlapLeft = ballRight - brickLeft;
  const overlapRight = brickRight - ballLeft;
  const overlapTop = ballBottom - brickTop;
  const overlapBottom = brickBottom - ballTop;

  const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

  let side: 'top' | 'bottom' | 'left' | 'right';
  if (minOverlap === overlapTop) side = 'top';
  else if (minOverlap === overlapBottom) side = 'bottom';
  else if (minOverlap === overlapLeft) side = 'left';
  else side = 'right';

  return { hit: true, side };
}

// Update game state
export function updateGame(state: GameState, input: InputState, deltaTime: number): void {
  if (state.gameOver || state.victory || state.isPaused) return;

  const dt = deltaTime / 16.67; // Normalize to ~60fps

  // Update effects
  updateEffects(state);

  // Move paddle
  if (input.left) {
    state.paddle.x = Math.max(0, state.paddle.x - PADDLE_SPEED * dt);
  }
  if (input.right) {
    state.paddle.x = Math.min(CANVAS_WIDTH - state.paddle.width, state.paddle.x + PADDLE_SPEED * dt);
  }

  // Update power-ups
  for (let i = state.powerUps.length - 1; i >= 0; i--) {
    const powerUp = state.powerUps[i];
    powerUp.y += POWERUP_SPEED * dt;

    // Check collision with paddle
    if (
      powerUp.y + POWERUP_SIZE / 2 >= state.paddle.y &&
      powerUp.y - POWERUP_SIZE / 2 <= state.paddle.y + state.paddle.height &&
      powerUp.x >= state.paddle.x &&
      powerUp.x <= state.paddle.x + state.paddle.width
    ) {
      applyPowerUp(state, powerUp);
      state.powerUps.splice(i, 1);
      continue;
    }

    // Remove if off screen
    if (powerUp.y > CANVAS_HEIGHT) {
      state.powerUps.splice(i, 1);
    }
  }

  // Update balls
  for (let i = state.balls.length - 1; i >= 0; i--) {
    const ball = state.balls[i];

    // Move ball
    ball.x += ball.dx * dt;
    ball.y += ball.dy * dt;

    // Wall collisions
    if (ball.x - ball.radius <= 0) {
      ball.x = ball.radius;
      ball.dx = Math.abs(ball.dx);
    }
    if (ball.x + ball.radius >= CANVAS_WIDTH) {
      ball.x = CANVAS_WIDTH - ball.radius;
      ball.dx = -Math.abs(ball.dx);
    }
    if (ball.y - ball.radius <= 0) {
      ball.y = ball.radius;
      ball.dy = Math.abs(ball.dy);
    }

    // Paddle collision
    if (
      ball.dy > 0 &&
      ball.y + ball.radius >= state.paddle.y &&
      ball.y - ball.radius <= state.paddle.y + state.paddle.height &&
      ball.x >= state.paddle.x &&
      ball.x <= state.paddle.x + state.paddle.width
    ) {
      // Calculate bounce angle based on hit position
      const hitPos = (ball.x - state.paddle.x) / state.paddle.width;
      const angle = (hitPos - 0.5) * Math.PI * 0.7; // -63 to +63 degrees

      ball.dy = -Math.abs(Math.cos(angle) * ball.speed);
      ball.dx = Math.sin(angle) * ball.speed;
      ball.y = state.paddle.y - ball.radius;
    }

    // Brick collisions
    for (const brick of state.bricks) {
      const { hit, side } = checkBrickCollision(ball, brick);
      if (hit && side) {
        brick.hits--;
        if (brick.hits <= 0) {
          brick.active = false;
          state.score += BRICK_TYPES[brick.type].points * state.level;

          // Chance to spawn power-up
          const powerUp = spawnPowerUp(brick);
          if (powerUp) {
            state.powerUps.push(powerUp);
          }
        }

        // Bounce ball
        if (side === 'top' || side === 'bottom') {
          ball.dy = -ball.dy;
        } else {
          ball.dx = -ball.dx;
        }

        // Speed up slightly
        ball.speed = Math.min(ball.speed + BALL_SPEED_INCREMENT * 0.1, MAX_BALL_SPEED);
        break;
      }
    }

    // Ball lost
    if (ball.y - ball.radius > CANVAS_HEIGHT) {
      state.balls.splice(i, 1);
    }
  }

  // Check if all balls lost
  if (state.balls.length === 0) {
    state.lives--;
    if (state.lives <= 0) {
      state.gameOver = true;
    } else {
      resetBall(state);
    }
  }

  // Check victory
  if (state.bricks.every(b => !b.active)) {
    if (state.level >= 5) {
      state.victory = true;
    } else {
      nextLevel(state);
    }
  }
}
