import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clamp,
  paddleBounce,
  setBallSpeed,
  circleRectCollision,
  createBricks,
  createGameState,
  updateGame,
  launchBall,
  nextLevel,
} from '@/components/game/Breakout/GameEngine';
import {
  CANVAS_HEIGHT,
  MIN_VERTICAL_RATIO,
  MAX_LEVEL,
  type Ball,
  type InputState,
} from '@/components/game/Breakout/types';

const noInput: InputState = { left: false, right: false, pointerX: null };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('clamp', () => {
  it('bounds a value between min and max', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe('paddleBounce', () => {
  const speed = 6;

  it('sends the ball straight up (mostly) when hit dead centre', () => {
    const { dx, dy } = paddleBounce(100, 60, 80, speed); // centre at 100
    expect(Math.abs(dx)).toBeLessThan(0.01);
    expect(dy).toBeCloseTo(-speed, 5);
  });

  it('adds leftward english when hit on the left half', () => {
    const { dx, dy } = paddleBounce(70, 60, 80, speed); // left of centre
    expect(dx).toBeLessThan(0);
    expect(dy).toBeLessThan(0); // always travels upward
  });

  it('adds rightward english when hit on the right half', () => {
    const { dx } = paddleBounce(130, 60, 80, speed);
    expect(dx).toBeGreaterThan(0);
  });

  it('preserves overall speed magnitude', () => {
    const { dx, dy } = paddleBounce(75, 60, 80, speed);
    expect(Math.hypot(dx, dy)).toBeCloseTo(speed, 4);
  });

  it('enforces a minimum upward component even at the far edge', () => {
    const { dy } = paddleBounce(200, 60, 80, speed); // way past right edge -> clamped
    expect(Math.abs(dy)).toBeGreaterThanOrEqual(speed * MIN_VERTICAL_RATIO - 1e-6);
  });
});

describe('setBallSpeed', () => {
  it('rescales velocity to the requested speed while keeping direction', () => {
    const ball: Ball = { x: 0, y: 0, dx: 3, dy: -4, radius: 8, speed: 5 };
    setBallSpeed(ball, 10);
    expect(Math.hypot(ball.dx, ball.dy)).toBeCloseTo(10, 4);
    expect(ball.speed).toBe(10);
    // direction roughly preserved (still up-right)
    expect(ball.dx).toBeGreaterThan(0);
    expect(ball.dy).toBeLessThan(0);
  });

  it('injects a vertical component when the ball is nearly horizontal', () => {
    const ball: Ball = { x: 0, y: 0, dx: 10, dy: 0.0001, radius: 8, speed: 10 };
    setBallSpeed(ball, 10);
    expect(Math.abs(ball.dy)).toBeGreaterThanOrEqual(10 * MIN_VERTICAL_RATIO - 1e-6);
  });
});

describe('circleRectCollision', () => {
  it('reports no hit when clearly apart', () => {
    const r = circleRectCollision(0, 0, 5, 100, 100, 20, 10);
    expect(r.hit).toBe(false);
    expect(r.side).toBeNull();
  });

  it('detects a top hit and pushes the ball upward', () => {
    // ball just above the top edge of a brick at (100,100,20,10)
    const r = circleRectCollision(110, 96, 5, 100, 100, 20, 10);
    expect(r.hit).toBe(true);
    expect(r.side).toBe('top');
    expect(r.pushY).toBeLessThan(0); // pushed up/out
  });

  it('detects a left hit and pushes the ball leftward', () => {
    const r = circleRectCollision(97, 105, 5, 100, 100, 20, 10);
    expect(r.hit).toBe(true);
    expect(r.side).toBe('left');
    expect(r.pushX).toBeLessThan(0);
  });

  it('detects a right hit', () => {
    const r = circleRectCollision(123, 105, 5, 100, 100, 20, 10);
    expect(r.hit).toBe(true);
    expect(r.side).toBe('right');
    expect(r.pushX).toBeGreaterThan(0);
  });
});

describe('createBricks', () => {
  it('creates a non-empty layout for each level up to MAX_LEVEL', () => {
    for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
      const bricks = createBricks(lvl);
      expect(bricks.length).toBeGreaterThan(0);
      expect(bricks.every((b) => b.active)).toBe(true);
    }
  });

  it('gives steel bricks more than one hit', () => {
    // level 4 is the steel "fortress"
    const bricks = createBricks(4);
    const steel = bricks.filter((b) => b.hits > 1);
    expect(steel.length).toBeGreaterThan(0);
  });

  it('cycles layouts beyond MAX_LEVEL rather than crashing', () => {
    expect(() => createBricks(MAX_LEVEL + 3)).not.toThrow();
    expect(createBricks(MAX_LEVEL + 1).length).toBeGreaterThan(0);
  });
});

describe('createGameState', () => {
  it('starts with the difficulty-configured lives and an unlaunched ball', () => {
    const state = createGameState('easy');
    expect(state.lives).toBe(5);
    expect(state.launched).toBe(false);
    expect(state.balls).toHaveLength(1);
    expect(state.balls[0].dx).toBe(0);
    expect(state.difficulty).toBe('easy');
  });
});

describe('updateGame integration', () => {
  it('does not move the ball before launch', () => {
    const state = createGameState('medium');
    const y0 = state.balls[0].y;
    updateGame(state, noInput, 16.67);
    expect(state.balls[0].y).toBe(state.paddle.y - state.balls[0].radius - 1);
    expect(state.balls[0].y).toBeCloseTo(y0, 5);
  });

  it('launches the ball with a non-zero velocity', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const state = createGameState('medium');
    launchBall(state);
    expect(state.launched).toBe(true);
    expect(Math.hypot(state.balls[0].dx, state.balls[0].dy)).toBeGreaterThan(0);
  });

  it('loses a life and resets when the last ball falls off the bottom', () => {
    const state = createGameState('medium');
    launchBall(state);
    const startLives = state.lives;
    // Force the ball below the floor moving downward.
    state.balls[0].y = CANVAS_HEIGHT + 100;
    state.balls[0].dy = 5;
    updateGame(state, noInput, 16.67);
    expect(state.lives).toBe(startLives - 1);
    expect(state.launched).toBe(false); // ball re-held on paddle
    expect(state.balls).toHaveLength(1);
  });

  it('ends the game when the final life is lost', () => {
    const state = createGameState('expert'); // 2 lives
    state.lives = 1;
    launchBall(state);
    state.balls[0].y = CANVAS_HEIGHT + 100;
    state.balls[0].dy = 5;
    updateGame(state, noInput, 16.67);
    expect(state.gameOver).toBe(true);
  });

  it('awards score and destroys a brick on collision', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // suppress power-up drop
    const state = createGameState('medium');
    // Target brick under a rising ball, plus a decoy so clearing the target
    // doesn't trigger a level advance that regenerates bricks.
    const target = { x: 100, y: 100, width: 70, height: 26, type: 0, hits: 1, active: true };
    state.bricks = [
      target,
      { x: 400, y: 100, width: 70, height: 26, type: 0, hits: 1, active: true },
    ];
    launchBall(state);
    const ball = state.balls[0];
    ball.x = 135;
    ball.y = 140; // below the brick (bottom edge = 126), moving up into it
    ball.dx = 0;
    ball.dy = -ball.speed;
    // Step a few frames so the ball travels up into the brick.
    for (let i = 0; i < 5 && target.active; i++) {
      updateGame(state, noInput, 16.67);
    }
    expect(target.active).toBe(false);
    expect(state.score).toBeGreaterThan(0);
    expect(ball.dy).toBeGreaterThan(0); // bounced downward off the brick's bottom
  });

  it('advances to the next level when all bricks cleared (not final level)', () => {
    const state = createGameState('medium', 1);
    nextLevel(state);
    expect(state.level).toBe(2);
    expect(state.bricks.some((b) => b.active)).toBe(true);
    expect(state.launched).toBe(false);
  });

  it('declares victory after clearing the final level', () => {
    const state = createGameState('medium', MAX_LEVEL);
    launchBall(state);
    state.bricks.forEach((b) => (b.active = false));
    updateGame(state, noInput, 16.67);
    expect(state.victory).toBe(true);
  });

  it('respects the pause flag', () => {
    const state = createGameState('medium');
    launchBall(state);
    state.isPaused = true;
    const before = { ...state.balls[0] };
    updateGame(state, noInput, 16.67);
    expect(state.balls[0].x).toBe(before.x);
    expect(state.balls[0].y).toBe(before.y);
  });
});
