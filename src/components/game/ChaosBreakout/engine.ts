/**
 * Chaos Breakout — pure game engine.
 *
 * The "chaos" twist: every few seconds a random "chaos pulse" fires and mutates
 * the run — it flips gravity to a new direction (down/up/left/right), warps the
 * ball speed, resizes the paddle, or spawns a multiball. Gravity constantly
 * curves the ball, so the player has to re-read the board after every pulse.
 *
 * Everything here is deterministic given an injected RNG, so it can be unit
 * tested without a canvas. Rendering + input live in the React component.
 */

export type GravityDirection = 'down' | 'up' | 'left' | 'right';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';
export type ChaosKind = 'gravity' | 'speed' | 'paddle' | 'multiball';

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
  baseWidth: number;
}

export interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  color: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface ChaosBanner {
  kind: ChaosKind;
  text: string;
  timer: number;
}

export interface GameState {
  balls: Ball[];
  paddle: Paddle;
  bricks: Brick[];
  particles: Particle[];
  gravity: GravityDirection;
  score: number;
  combo: number;
  comboTimer: number;
  lives: number;
  stage: number;
  chaosTimer: number;
  chaosInterval: number;
  banner: ChaosBanner | null;
  flash: number;
  gravityFlash: number;
  status: 'ready' | 'playing' | 'stageclear' | 'gameover';
  launchDelay: number;
}

export const WIDTH = 760;
export const HEIGHT = 480;
export const BRICK_ROWS = 6;
export const BRICK_COLS = 10;
export const BRICK_TOP = 64;
export const BRICK_GAP = 8;
export const BRICK_HEIGHT = 22;

export const BALL_RADIUS = 8;
export const MAX_BALLS = 4;

/** Per-difficulty tuning. */
export interface DifficultyConfig {
  chaosInterval: number; // frames between chaos pulses (60fps)
  baseSpeed: number; // target ball speed magnitude
  gravityStrength: number; // acceleration per frame from gravity
  lives: number;
  paddleWidth: number;
  chaosSpeedMul: number; // how hard the "speed" chaos hits
  allowMultiball: boolean;
}

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    chaosInterval: 780,
    baseSpeed: 5.4,
    gravityStrength: 0.035,
    lives: 5,
    paddleWidth: 132,
    chaosSpeedMul: 1.12,
    allowMultiball: false,
  },
  medium: {
    chaosInterval: 660,
    baseSpeed: 6.1,
    gravityStrength: 0.05,
    lives: 4,
    paddleWidth: 118,
    chaosSpeedMul: 1.16,
    allowMultiball: true,
  },
  hard: {
    chaosInterval: 540,
    baseSpeed: 6.9,
    gravityStrength: 0.066,
    lives: 3,
    paddleWidth: 104,
    chaosSpeedMul: 1.2,
    allowMultiball: true,
  },
  expert: {
    chaosInterval: 450,
    baseSpeed: 7.6,
    gravityStrength: 0.08,
    lives: 3,
    paddleWidth: 92,
    chaosSpeedMul: 1.24,
    allowMultiball: true,
  },
  master: {
    chaosInterval: 360,
    baseSpeed: 8.4,
    gravityStrength: 0.095,
    lives: 2,
    paddleWidth: 82,
    chaosSpeedMul: 1.28,
    allowMultiball: true,
  },
};

export type Rng = () => number;

const BRICK_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#fb923c', '#a78bfa', '#f472b6'];

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const magnitude = (vx: number, vy: number): number => Math.hypot(vx, vy);

/** Rescale a velocity vector to a target magnitude, keeping direction. */
export const setSpeed = (ball: Ball, target: number): void => {
  const m = magnitude(ball.vx, ball.vy);
  if (m < 1e-4) {
    ball.vx = 0;
    ball.vy = -target;
    return;
  }
  const k = target / m;
  ball.vx *= k;
  ball.vy *= k;
};

export const gravityVector = (
  direction: GravityDirection,
  strength: number,
): { gx: number; gy: number } => {
  switch (direction) {
    case 'down':
      return { gx: 0, gy: strength };
    case 'up':
      return { gx: 0, gy: -strength };
    case 'left':
      return { gx: -strength, gy: 0 };
    case 'right':
      return { gx: strength, gy: 0 };
  }
};

export const pickRandomGravity = (
  current: GravityDirection,
  rng: Rng,
): GravityDirection => {
  const options: GravityDirection[] = ['down', 'up', 'left', 'right'];
  const filtered = options.filter((item) => item !== current);
  return filtered[Math.floor(rng() * filtered.length)];
};

export const createBricks = (stage: number, rng: Rng): Brick[] => {
  const margin = BRICK_GAP;
  const totalGap = margin * (BRICK_COLS + 1);
  const brickWidth = (WIDTH - totalGap) / BRICK_COLS;
  const bricks: Brick[] = [];

  // Later stages introduce tougher (multi-hit) bricks toward the top.
  const toughRows = Math.min(BRICK_ROWS - 1, Math.floor((stage - 1) / 2));

  for (let row = 0; row < BRICK_ROWS; row += 1) {
    for (let col = 0; col < BRICK_COLS; col += 1) {
      // Introduce some gaps in later stages for texture.
      if (stage > 2 && rng() < Math.min(0.12, 0.03 * stage) && row > 2) {
        continue;
      }
      const isTough = row < toughRows;
      const hp = isTough ? 2 : 1;
      bricks.push({
        x: margin + col * (brickWidth + margin),
        y: BRICK_TOP + row * (BRICK_HEIGHT + BRICK_GAP),
        width: brickWidth,
        height: BRICK_HEIGHT,
        hp,
        maxHp: hp,
        color: BRICK_COLORS[row % BRICK_COLORS.length],
      });
    }
  }
  return bricks;
};

const spawnBall = (config: DifficultyConfig, rng: Rng): Ball => {
  const angle = (-Math.PI / 2) + (rng() - 0.5) * (Math.PI / 4);
  return {
    x: WIDTH / 2,
    y: HEIGHT - 96,
    vx: Math.cos(angle) * config.baseSpeed,
    vy: Math.sin(angle) * config.baseSpeed,
    r: BALL_RADIUS,
  };
};

export const createGameState = (
  difficulty: Difficulty,
  rng: Rng = Math.random,
): GameState => {
  const config = DIFFICULTY_CONFIG[difficulty];
  return {
    balls: [spawnBall(config, rng)],
    paddle: {
      x: WIDTH / 2 - config.paddleWidth / 2,
      y: HEIGHT - 30,
      width: config.paddleWidth,
      height: 14,
      baseWidth: config.paddleWidth,
    },
    bricks: createBricks(1, rng),
    particles: [],
    gravity: 'down',
    score: 0,
    combo: 0,
    comboTimer: 0,
    lives: config.lives,
    stage: 1,
    chaosTimer: config.chaosInterval,
    chaosInterval: config.chaosInterval,
    banner: null,
    flash: 0,
    gravityFlash: 0,
    status: 'ready',
    launchDelay: 0,
  };
};

const spawnParticles = (
  state: GameState,
  x: number,
  y: number,
  color: string,
  count: number,
  rng: Rng,
): void => {
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const speed = 1 + rng() * 3.5;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 1,
      color,
      size: 1.5 + rng() * 2.5,
    });
  }
  // Cap particle count to keep the sim cheap.
  if (state.particles.length > 260) {
    state.particles.splice(0, state.particles.length - 260);
  }
};

const CHAOS_LABELS: Record<GravityDirection, string> = {
  down: '↓ DOWN',
  up: '↑ UP',
  left: '← LEFT',
  right: '→ RIGHT',
};

/** Fire a chaos pulse. Returns the kind that fired (for the component's callbacks). */
export const applyChaos = (
  state: GameState,
  config: DifficultyConfig,
  rng: Rng,
): ChaosKind => {
  // Weight the options; only allow multiball when there's room + it's enabled.
  const canMultiball = config.allowMultiball && state.balls.length < MAX_BALLS;
  const pool: ChaosKind[] = ['gravity', 'gravity', 'speed', 'paddle'];
  if (canMultiball) pool.push('multiball');
  const kind = pool[Math.floor(rng() * pool.length)];

  let text = '';
  if (kind === 'gravity') {
    state.gravity = pickRandomGravity(state.gravity, rng);
    state.gravityFlash = 30;
    text = `GRAVITY ${CHAOS_LABELS[state.gravity]}`;
  } else if (kind === 'speed') {
    const speedUp = rng() > 0.5;
    const mul = speedUp ? config.chaosSpeedMul : 1 / config.chaosSpeedMul;
    for (const ball of state.balls) {
      const m = magnitude(ball.vx, ball.vy);
      // Keep speeds inside a sane band so runs stay fair.
      const target = clamp(m * mul, config.baseSpeed * 0.75, config.baseSpeed * 2.1);
      setSpeed(ball, target);
    }
    text = speedUp ? 'SPEED UP' : 'SLOW MOTION';
  } else if (kind === 'paddle') {
    const grow = rng() > 0.45;
    const factor = grow ? 1.35 : 0.7;
    const next = clamp(state.paddle.baseWidth * factor, 60, 220);
    const center = state.paddle.x + state.paddle.width / 2;
    state.paddle.width = next;
    state.paddle.x = clamp(center - next / 2, 0, WIDTH - next);
    text = grow ? 'PADDLE GROW' : 'PADDLE SHRINK';
  } else {
    // Multiball: clone the fastest existing ball at a mirrored angle.
    const source = state.balls[0];
    const clone: Ball = {
      x: source.x,
      y: source.y,
      vx: -source.vx,
      vy: source.vy,
      r: source.r,
    };
    state.balls.push(clone);
    text = 'MULTIBALL';
  }

  state.banner = { kind, text, timer: 150 };
  state.flash = 12;
  return kind;
};

export interface StepEvents {
  brickBroken: boolean;
  lifeLost: boolean;
  stageCleared: boolean;
  gameOver: boolean;
  chaos: ChaosKind | null;
}

export interface StepInput {
  /** Absolute target x for the paddle center (mouse/touch), or null for keyboard. */
  pointerX: number | null;
  left: boolean;
  right: boolean;
}

const PADDLE_KEY_SPEED = 9;

/** Reflect a ball off the paddle, giving control via the contact point. */
const bounceOffPaddle = (ball: Ball, paddle: Paddle, baseSpeed: number): void => {
  const relative =
    (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
  const clamped = clamp(relative, -1, 1);
  // Map contact point to a launch angle: straight up at center, up to ~60deg at edges.
  const angle = (-Math.PI / 2) + clamped * (Math.PI / 3);
  const speed = Math.max(magnitude(ball.vx, ball.vy), baseSpeed);
  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
  // Ensure it's actually leaving the paddle.
  ball.y = paddle.y - ball.r - 0.5;
};

const damageBrick = (
  state: GameState,
  brick: Brick,
  config: DifficultyConfig,
  rng: Rng,
): boolean => {
  brick.hp -= 1;
  spawnParticles(state, brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color, 6, rng);
  if (brick.hp <= 0) {
    state.combo += 1;
    state.comboTimer = 90;
    const comboBonus = Math.min(state.combo, 10);
    state.score += 10 * comboBonus;
    return true;
  }
  state.score += 3;
  return false;
};

/** Advance one ball's physics + collisions. Mutates state. Returns per-ball events. */
const stepBall = (
  state: GameState,
  ball: Ball,
  config: DifficultyConfig,
  rng: Rng,
): { broke: boolean; lost: boolean } => {
  const g = gravityVector(state.gravity, config.gravityStrength);
  ball.vx += g.gx;
  ball.vy += g.gy;

  // Keep the ball inside a fair speed band (prevents gravity from either
  // stalling it or launching it into an unplayable blur).
  const speedCap = config.baseSpeed * 2.2;
  const m = magnitude(ball.vx, ball.vy);
  if (m > speedCap) setSpeed(ball, speedCap);
  if (m < config.baseSpeed * 0.6) setSpeed(ball, config.baseSpeed * 0.6);

  ball.x += ball.vx;
  ball.y += ball.vy;

  let broke = false;

  // Walls
  if (ball.x - ball.r <= 0) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x + ball.r >= WIDTH) {
    ball.x = WIDTH - ball.r;
    ball.vx = -Math.abs(ball.vx);
  }
  if (ball.y - ball.r <= 0) {
    ball.y = ball.r;
    ball.vy = Math.abs(ball.vy);
  }

  // Paddle
  const p = state.paddle;
  const withinX = ball.x >= p.x - ball.r && ball.x <= p.x + p.width + ball.r;
  const crossingTop =
    ball.y + ball.r >= p.y && ball.y - ball.r <= p.y + p.height && ball.vy > 0;
  if (withinX && crossingTop) {
    bounceOffPaddle(ball, p, config.baseSpeed);
  }

  // Bricks — resolve at most one per ball per frame (classic breakout feel).
  for (const brick of state.bricks) {
    if (brick.hp <= 0) continue;
    const hitX = ball.x + ball.r > brick.x && ball.x - ball.r < brick.x + brick.width;
    const hitY = ball.y + ball.r > brick.y && ball.y - ball.r < brick.y + brick.height;
    if (!hitX || !hitY) continue;

    const overlapLeft = ball.x + ball.r - brick.x;
    const overlapRight = brick.x + brick.width - (ball.x - ball.r);
    const overlapTop = ball.y + ball.r - brick.y;
    const overlapBottom = brick.y + brick.height - (ball.y - ball.r);
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    // Push the ball out along the shallowest axis so it can't tunnel/stick.
    if (minOverlap === overlapLeft) {
      ball.x = brick.x - ball.r;
      ball.vx = -Math.abs(ball.vx);
    } else if (minOverlap === overlapRight) {
      ball.x = brick.x + brick.width + ball.r;
      ball.vx = Math.abs(ball.vx);
    } else if (minOverlap === overlapTop) {
      ball.y = brick.y - ball.r;
      ball.vy = -Math.abs(ball.vy);
    } else {
      ball.y = brick.y + brick.height + ball.r;
      ball.vy = Math.abs(ball.vy);
    }

    broke = damageBrick(state, brick, config, rng);
    break;
  }

  // Lost when it falls off the bottom (or is flung fully off any edge).
  const lost =
    ball.y - ball.r > HEIGHT ||
    ball.x < -ball.r * 4 ||
    ball.x > WIDTH + ball.r * 4 ||
    ball.y < -ball.r * 6;

  return { broke, lost };
};

/**
 * Advance the whole game one frame. Pure w.r.t. the injected RNG.
 * Returns a summary of notable events for the component to react to (sfx, stats).
 */
export const step = (
  state: GameState,
  input: StepInput,
  difficulty: Difficulty,
  rng: Rng = Math.random,
): StepEvents => {
  const events: StepEvents = {
    brickBroken: false,
    lifeLost: false,
    stageCleared: false,
    gameOver: false,
    chaos: null,
  };
  if (state.status !== 'playing') return events;

  const config = DIFFICULTY_CONFIG[difficulty];

  // Paddle movement (pointer takes priority, else keyboard).
  if (input.pointerX !== null) {
    state.paddle.x = clamp(
      input.pointerX - state.paddle.width / 2,
      0,
      WIDTH - state.paddle.width,
    );
  } else {
    if (input.left) state.paddle.x -= PADDLE_KEY_SPEED;
    if (input.right) state.paddle.x += PADDLE_KEY_SPEED;
    state.paddle.x = clamp(state.paddle.x, 0, WIDTH - state.paddle.width);
  }

  // Effects timers
  if (state.flash > 0) state.flash -= 1;
  if (state.gravityFlash > 0) state.gravityFlash -= 1;
  if (state.banner) {
    state.banner.timer -= 1;
    if (state.banner.timer <= 0) state.banner = null;
  }
  if (state.comboTimer > 0) {
    state.comboTimer -= 1;
    if (state.comboTimer === 0) state.combo = 0;
  }

  // Chaos pulse
  state.chaosTimer -= 1;
  if (state.chaosTimer <= 0) {
    events.chaos = applyChaos(state, config, rng);
    state.chaosTimer = state.chaosInterval;
  }

  // Particles
  for (const pt of state.particles) {
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.vy += 0.05;
    pt.vx *= 0.97;
    pt.life -= 0.025;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);

  // Balls
  const survivors: Ball[] = [];
  for (const ball of state.balls) {
    const res = stepBall(state, ball, config, rng);
    if (res.broke) events.brickBroken = true;
    if (!res.lost) survivors.push(ball);
  }
  state.balls = survivors;

  // Lost all balls -> lose a life (or game over).
  if (state.balls.length === 0) {
    state.lives -= 1;
    state.combo = 0;
    events.lifeLost = true;
    if (state.lives <= 0) {
      state.status = 'gameover';
      events.gameOver = true;
    } else {
      state.balls = [spawnBall(config, rng)];
      state.gravity = 'down';
      state.paddle.width = state.paddle.baseWidth;
      state.paddle.x = clamp(
        state.paddle.x + state.paddle.width / 2 - state.paddle.baseWidth / 2,
        0,
        WIDTH - state.paddle.baseWidth,
      );
      state.chaosTimer = Math.max(state.chaosTimer, 180);
    }
    return events;
  }

  // Stage clear
  const remaining = state.bricks.filter((b) => b.hp > 0).length;
  if (remaining === 0) {
    events.stageCleared = true;
    state.stage += 1;
    state.bricks = createBricks(state.stage, rng);
    state.balls = [spawnBall(config, rng)];
    state.gravity = 'down';
    state.paddle.width = state.paddle.baseWidth;
    // Chaos comes a touch faster each stage, floored so it never gets silly.
    state.chaosInterval = Math.max(
      Math.round(config.chaosInterval * 0.9 ** (state.stage - 1)),
      Math.round(config.chaosInterval * 0.55),
    );
    state.chaosTimer = state.chaosInterval;
    state.score += 100; // stage clear bonus
    state.banner = { kind: 'gravity', text: `STAGE ${state.stage}`, timer: 150 };
  }

  return events;
};

/** Launch the ball(s) from the "ready" state into play. */
export const launch = (state: GameState): void => {
  if (state.status === 'ready') {
    state.status = 'playing';
  }
};
