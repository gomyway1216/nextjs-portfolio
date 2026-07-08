import { describe, expect, it } from 'vitest';

import {
  applyChaos,
  clamp,
  createBricks,
  createGameState,
  DIFFICULTY_CONFIG,
  type GameState,
  gravityVector,
  HEIGHT,
  launch,
  magnitude,
  MAX_BALLS,
  pickRandomGravity,
  setSpeed,
  step,
  type StepInput,
  WIDTH,
} from '@/components/game/ChaosBreakout/engine';

/** Deterministic RNG that cycles through the given values. */
const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const idleInput: StepInput = { pointerX: null, left: false, right: false };

describe('helpers', () => {
  it('clamp bounds values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('magnitude computes vector length', () => {
    expect(magnitude(3, 4)).toBe(5);
  });

  it('setSpeed preserves direction and sets magnitude', () => {
    const ball = { x: 0, y: 0, vx: 3, vy: 4, r: 8 };
    setSpeed(ball, 10);
    expect(magnitude(ball.vx, ball.vy)).toBeCloseTo(10, 5);
    // direction preserved (3:4 ratio)
    expect(ball.vx / ball.vy).toBeCloseTo(3 / 4, 5);
  });

  it('setSpeed handles a zero vector by launching upward', () => {
    const ball = { x: 0, y: 0, vx: 0, vy: 0, r: 8 };
    setSpeed(ball, 7);
    expect(ball.vy).toBe(-7);
    expect(ball.vx).toBe(0);
  });

  it('gravityVector points the right way', () => {
    expect(gravityVector('down', 0.05)).toEqual({ gx: 0, gy: 0.05 });
    expect(gravityVector('up', 0.05)).toEqual({ gx: 0, gy: -0.05 });
    expect(gravityVector('left', 0.05)).toEqual({ gx: -0.05, gy: 0 });
    expect(gravityVector('right', 0.05)).toEqual({ gx: 0.05, gy: 0 });
  });

  it('pickRandomGravity never returns the current direction', () => {
    for (let r = 0; r < 1; r += 0.1) {
      expect(pickRandomGravity('down', () => r)).not.toBe('down');
    }
  });
});

describe('createGameState / createBricks', () => {
  it('starts ready with correct lives per difficulty', () => {
    const s = createGameState('hard', Math.random);
    expect(s.status).toBe('ready');
    expect(s.lives).toBe(DIFFICULTY_CONFIG.hard.lives);
    expect(s.balls).toHaveLength(1);
    expect(s.gravity).toBe('down');
  });

  it('builds a full brick grid on stage 1', () => {
    const bricks = createBricks(1, () => 0.5);
    expect(bricks.length).toBe(60); // 6 rows x 10 cols, no gaps stage 1
    for (const b of bricks) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(WIDTH + 0.001);
      expect(b.hp).toBe(1); // no tough rows at stage 1
    }
  });

  it('introduces tough (multi-hp) bricks at higher stages', () => {
    const bricks = createBricks(5, () => 0.9); // high rng => no gaps
    expect(bricks.some((b) => b.maxHp > 1)).toBe(true);
  });
});

describe('step / physics', () => {
  const playing = (difficulty: 'easy' | 'medium' | 'hard' | 'expert' | 'master' = 'medium') => {
    const s = createGameState(difficulty, () => 0.5);
    launch(s);
    return s;
  };

  it('does nothing while not playing', () => {
    const s = createGameState('medium', () => 0.5);
    const before = JSON.stringify(s);
    step(s, idleInput, 'medium', () => 0.5);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('pointer input moves the paddle center to the pointer', () => {
    const s = playing();
    step(s, { pointerX: 300, left: false, right: false }, 'medium', () => 0.5);
    expect(s.paddle.x + s.paddle.width / 2).toBeCloseTo(300, 1);
  });

  it('keeps the paddle within the field', () => {
    const s = playing();
    step(s, { pointerX: 5000, left: false, right: false }, 'medium', () => 0.5);
    expect(s.paddle.x + s.paddle.width).toBeLessThanOrEqual(WIDTH + 0.001);
    step(s, { pointerX: -5000, left: false, right: false }, 'medium', () => 0.5);
    expect(s.paddle.x).toBeGreaterThanOrEqual(0);
  });

  it('bounces the ball off the left and right walls', () => {
    const s = playing();
    s.balls[0] = { x: 3, y: HEIGHT / 2, vx: -6, vy: 0, r: 8 };
    step(s, idleInput, 'medium', () => 0.5);
    expect(s.balls[0].vx).toBeGreaterThan(0);

    s.balls[0] = { x: WIDTH - 3, y: HEIGHT / 2, vx: 6, vy: 0, r: 8 };
    step(s, idleInput, 'medium', () => 0.5);
    expect(s.balls[0].vx).toBeLessThan(0);
  });

  it('bounces the ball off the top wall', () => {
    const s = playing();
    s.balls[0] = { x: WIDTH / 2, y: 3, vx: 0, vy: -6, r: 8 };
    step(s, idleInput, 'medium', () => 0.5);
    expect(s.balls[0].vy).toBeGreaterThan(0);
  });

  it('keeps ball speed within a fair band (never stalls, never blurs)', () => {
    const s = playing('master');
    const cfg = DIFFICULTY_CONFIG.master;
    // Run many frames of gravity accumulation.
    for (let i = 0; i < 400; i += 1) {
      step(s, { pointerX: s.balls[0]?.x ?? WIDTH / 2, left: false, right: false }, 'master', () => 0.5);
      if (s.balls.length === 0) break;
      const m = magnitude(s.balls[0].vx, s.balls[0].vy);
      expect(m).toBeLessThanOrEqual(cfg.baseSpeed * 2.2 + 0.5);
      expect(m).toBeGreaterThanOrEqual(cfg.baseSpeed * 0.6 - 0.5);
    }
  });

  it('paddle bounce sends the ball upward and can be aimed by contact point', () => {
    const s = playing();
    const p = s.paddle;
    // Hit near the right edge of the paddle, moving down.
    s.balls[0] = { x: p.x + p.width - 4, y: p.y - 6, vx: 0, vy: 5, r: 8 };
    step(s, { pointerX: p.x + p.width / 2, left: false, right: false }, 'medium', () => 0.5);
    expect(s.balls[0].vy).toBeLessThan(0); // going up
    expect(s.balls[0].vx).toBeGreaterThan(0); // aimed right
  });

  it('destroys a 1-hp brick, awards score and removes it', () => {
    const s = playing();
    // isolate a single brick
    const brick = s.bricks[0];
    s.bricks = [brick];
    s.balls[0] = {
      x: brick.x + brick.width / 2,
      y: brick.y + brick.height + 2,
      vx: 0,
      vy: -4,
      r: 8,
    };
    const scoreBefore = s.score;
    const events = step(s, idleInput, 'medium', () => 0.5);
    expect(events.brickBroken).toBe(true);
    expect(brick.hp).toBe(0);
    expect(s.score).toBeGreaterThan(scoreBefore);
  });

  it('loses a life (not game over) when the last ball falls, and respawns', () => {
    const s = playing('easy');
    const livesBefore = s.lives;
    s.balls = [{ x: WIDTH / 2, y: HEIGHT + 50, vx: 0, vy: 6, r: 8 }];
    const events = step(s, idleInput, 'easy', () => 0.5);
    expect(events.lifeLost).toBe(true);
    expect(events.gameOver).toBe(false);
    expect(s.lives).toBe(livesBefore - 1);
    expect(s.balls).toHaveLength(1); // respawned
    expect(s.gravity).toBe('down'); // reset
  });

  it('triggers game over when the last life is lost', () => {
    const s = playing('master');
    s.lives = 1;
    s.balls = [{ x: WIDTH / 2, y: HEIGHT + 50, vx: 0, vy: 6, r: 8 }];
    const events = step(s, idleInput, 'master', () => 0.5);
    expect(events.gameOver).toBe(true);
    expect(s.status).toBe('gameover');
  });

  it('multiball ball loss only costs a life when ALL balls are gone', () => {
    const s = playing('medium');
    const livesBefore = s.lives;
    s.balls = [
      { x: WIDTH / 2, y: HEIGHT + 50, vx: 0, vy: 6, r: 8 }, // falling out
      { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: -4, r: 8 }, // still alive
    ];
    const events = step(s, idleInput, 'medium', () => 0.5);
    expect(events.lifeLost).toBe(false);
    expect(s.lives).toBe(livesBefore);
    expect(s.balls).toHaveLength(1);
  });

  it('advances stage and bonus when all bricks cleared', () => {
    const s = playing('medium');
    // Leave exactly one brick, positioned to be hit.
    const brick = s.bricks[0];
    s.bricks = [brick];
    const stageBefore = s.stage;
    const scoreBefore = s.score;
    s.balls[0] = {
      x: brick.x + brick.width / 2,
      y: brick.y + brick.height + 2,
      vx: 0,
      vy: -4,
      r: 8,
    };
    const events = step(s, idleInput, 'medium', () => 0.5);
    expect(events.stageCleared).toBe(true);
    expect(s.stage).toBe(stageBefore + 1);
    expect(s.score).toBeGreaterThanOrEqual(scoreBefore + 100);
    expect(s.bricks.length).toBeGreaterThan(0); // new grid
  });
});

describe('applyChaos', () => {
  it('gravity chaos changes direction and sets a banner', () => {
    const s = createGameState('medium', () => 0.5);
    launch(s);
    // rng: first value picks kind from pool, then direction pick
    const kind = applyChaos(s, DIFFICULTY_CONFIG.medium, seq([0, 0.6]));
    expect(kind).toBe('gravity');
    expect(s.banner).not.toBeNull();
    expect(s.gravityFlash).toBeGreaterThan(0);
  });

  it('speed chaos keeps ball speed inside the fair band', () => {
    const s = createGameState('hard', () => 0.5);
    launch(s);
    const cfg = DIFFICULTY_CONFIG.hard;
    // Force "speed" kind (index 2 of pool of length 5 => rng 0.5 -> floor(2.5)=2)
    applyChaos(s, cfg, () => 0.5);
    const m = magnitude(s.balls[0].vx, s.balls[0].vy);
    expect(m).toBeGreaterThanOrEqual(cfg.baseSpeed * 0.75 - 0.001);
    expect(m).toBeLessThanOrEqual(cfg.baseSpeed * 2.1 + 0.001);
  });

  it('multiball adds a ball but never exceeds MAX_BALLS', () => {
    const s = createGameState('medium', () => 0.5);
    launch(s);
    const cfg = DIFFICULTY_CONFIG.medium;
    // Pool with multiball has length 5; rng 0.99 -> index 4 -> 'multiball'.
    for (let i = 0; i < 10; i += 1) {
      applyChaos(s, cfg, () => 0.99);
      expect(s.balls.length).toBeLessThanOrEqual(MAX_BALLS);
    }
    expect(s.balls.length).toBe(MAX_BALLS);
  });

  it('easy difficulty never spawns multiball', () => {
    const s = createGameState('easy', () => 0.5);
    launch(s);
    const cfg = DIFFICULTY_CONFIG.easy;
    for (let i = 0; i < 20; i += 1) {
      applyChaos(s, cfg, () => 0.99);
    }
    expect(s.balls.length).toBe(1);
  });
});

describe('chaos pulse cadence via step', () => {
  it('fires a chaos event exactly when the timer elapses', () => {
    const s = createGameState('easy', () => 0.5) as GameState;
    launch(s);
    s.chaosTimer = 2;
    // First step decrements to 1 (no chaos), second to 0 -> chaos.
    let fired = step(s, idleInput, 'easy', () => 0.5).chaos;
    expect(fired).toBeNull();
    fired = step(s, idleInput, 'easy', () => 0.5).chaos;
    expect(fired).not.toBeNull();
    expect(s.chaosTimer).toBe(s.chaosInterval);
  });
});
