import { describe, expect, it } from 'vitest';
import {
  applyPowerUp,
  createGameState,
  getEffectStatuses,
  getInstantPickup,
  launchBall,
  nextLevel,
  resetBall,
  updateGame,
} from '@/components/game/Breakout/GameEngine';
import {
  PICKUP_NOTICE_MS,
  POWERUP_CONFIGS,
  PowerUpType,
  getPowerUpConfig,
  type GameState,
  type InputState,
} from '@/components/game/Breakout/types';

const noInput: InputState = { left: false, right: false, pointerX: null };

function give(state: GameState, type: PowerUpType): void {
  applyPowerUp(state, { x: 0, y: 0, type, config: getPowerUpConfig(type) });
}

// A launched game with one out-of-the-way brick, so a level is never cleared.
function runningState(): GameState {
  const state = createGameState('medium');
  launchBall(state);
  state.bricks = [{ x: 0, y: 0, width: 10, height: 10, type: 0, hits: 1, active: true }];
  return state;
}

// Step simulated time, re-parking the balls mid-field every frame so only the
// timers advance (no brick, paddle or floor contact).
function advance(state: GameState, ms: number, frameMs = 10): void {
  for (let elapsed = 0; elapsed + frameMs <= ms + 1e-6; elapsed += frameMs) {
    for (const ball of state.balls) {
      ball.x = 400;
      ball.y = 300;
    }
    updateGame(state, noInput, frameMs);
  }
}

describe('getPowerUpConfig', () => {
  it('returns the config of every power-up type', () => {
    for (const config of POWERUP_CONFIGS) {
      expect(getPowerUpConfig(config.type)).toBe(config);
    }
  });
});

describe('getEffectStatuses', () => {
  it('is empty when nothing is active', () => {
    expect(getEffectStatuses(createGameState('medium'))).toEqual([]);
  });

  it('reports a fresh timed effect at its full duration', () => {
    const state = runningState();
    give(state, PowerUpType.EXPAND_PADDLE);
    expect(getEffectStatuses(state)).toEqual([
      { type: PowerUpType.EXPAND_PADDLE, secondsLeft: 10, fraction: 1 },
    ]);
  });

  it('counts down in simulated time and rounds seconds up', () => {
    const state = runningState();
    give(state, PowerUpType.SLOW_BALL); // 8000 ms
    advance(state, 2600);
    const [status] = getEffectStatuses(state);
    expect(status.secondsLeft).toBe(6); // 5400 ms left
    expect(status.fraction).toBeCloseTo(5500 / 8000);
  });

  it('never shows 0 seconds while the effect is still running', () => {
    const state = runningState();
    give(state, PowerUpType.FAST_BALL);
    state.activeEffects[0].remainingMs = 40;
    const [status] = getEffectStatuses(state);
    expect(status.secondsLeft).toBe(1);
    expect(status.fraction).toBeGreaterThan(0);
  });

  it('drops the effect once it expires', () => {
    const state = runningState();
    give(state, PowerUpType.SLOW_BALL);
    advance(state, 8010);
    expect(getEffectStatuses(state)).toEqual([]);
  });

  it('does not count down while paused', () => {
    const state = runningState();
    give(state, PowerUpType.EXPAND_PADDLE);
    state.isPaused = true;
    advance(state, 3000);
    expect(getEffectStatuses(state)[0].secondsLeft).toBe(10);
  });

  it('gives the same countdown at 30, 60 and 144 fps', () => {
    const results = [1000 / 30, 1000 / 60, 1000 / 144].map((frame) => {
      const state = runningState();
      give(state, PowerUpType.EXPAND_PADDLE);
      advance(state, 4500, frame);
      return getEffectStatuses(state)[0].secondsLeft;
    });
    expect(results).toEqual([6, 6, 6]);
  });

  it('keeps a fixed order however the effects were collected', () => {
    const state = runningState();
    give(state, PowerUpType.FAST_BALL);
    give(state, PowerUpType.SHRINK_PADDLE);
    expect(getEffectStatuses(state).map((s) => s.type)).toEqual([
      PowerUpType.SHRINK_PADDLE,
      PowerUpType.FAST_BALL,
    ]);
  });

  it('restarts the timer when the same power-up is caught again', () => {
    const state = runningState();
    give(state, PowerUpType.EXPAND_PADDLE);
    advance(state, 4000);
    give(state, PowerUpType.EXPAND_PADDLE);
    expect(getEffectStatuses(state)).toEqual([
      { type: PowerUpType.EXPAND_PADDLE, secondsLeft: 10, fraction: 1 },
    ]);
  });
});

describe('opposite power-ups', () => {
  it('a shrink replaces a running widen and lasts its own full duration', () => {
    const state = runningState();
    give(state, PowerUpType.EXPAND_PADDLE);
    advance(state, 5000);
    give(state, PowerUpType.SHRINK_PADDLE);
    expect(getEffectStatuses(state).map((s) => s.type)).toEqual([PowerUpType.SHRINK_PADDLE]);
    const shrunk = state.paddle.width;
    expect(shrunk).toBeLessThan(state.config.paddleWidth);
    // The replaced widen would have expired here; the paddle must stay shrunk.
    advance(state, 6000);
    expect(state.paddle.width).toBe(shrunk);
    advance(state, 4010);
    expect(state.paddle.width).toBe(state.config.paddleWidth);
    expect(getEffectStatuses(state)).toEqual([]);
  });

  it('a widen replaces a running shrink', () => {
    const state = runningState();
    give(state, PowerUpType.SHRINK_PADDLE);
    give(state, PowerUpType.EXPAND_PADDLE);
    expect(getEffectStatuses(state).map((s) => s.type)).toEqual([PowerUpType.EXPAND_PADDLE]);
    expect(state.paddle.width).toBeGreaterThan(state.config.paddleWidth);
  });

  it('a fast ball replacing a slow ball is faster than the base speed', () => {
    const state = runningState();
    give(state, PowerUpType.SLOW_BALL);
    expect(state.balls[0].speed).toBeLessThan(state.config.ballSpeed);
    give(state, PowerUpType.FAST_BALL);
    expect(getEffectStatuses(state).map((s) => s.type)).toEqual([PowerUpType.FAST_BALL]);
    expect(state.balls[0].speed).toBeCloseTo(state.config.ballSpeed * 1.3);
  });

  it('a slow ball replacing a fast ball is slower than the base speed', () => {
    const state = runningState();
    give(state, PowerUpType.FAST_BALL);
    give(state, PowerUpType.SLOW_BALL);
    expect(getEffectStatuses(state).map((s) => s.type)).toEqual([PowerUpType.SLOW_BALL]);
    expect(state.balls[0].speed).toBeCloseTo(state.config.ballSpeed * 0.7);
  });

  it('paddle and speed effects run side by side', () => {
    const state = runningState();
    give(state, PowerUpType.EXPAND_PADDLE);
    give(state, PowerUpType.SLOW_BALL);
    expect(getEffectStatuses(state)).toHaveLength(2);
  });
});

describe('pickupEvents', () => {
  it('starts empty', () => {
    expect(createGameState('medium').pickupEvents).toEqual([]);
  });

  it('queues the same power-up caught twice in a row as two events', () => {
    const state = runningState();
    give(state, PowerUpType.EXTRA_LIFE);
    advance(state, 200);
    give(state, PowerUpType.EXTRA_LIFE);
    expect(state.pickupEvents).toEqual([PowerUpType.EXTRA_LIFE, PowerUpType.EXTRA_LIFE]);
  });

  it('queues every capsule caught in the same update', () => {
    const state = runningState();
    for (const type of [PowerUpType.SLOW_BALL, PowerUpType.EXTRA_LIFE]) {
      state.powerUps.push({
        x: state.paddle.x + state.paddle.width / 2,
        y: state.paddle.y,
        type,
        config: getPowerUpConfig(type),
      });
    }
    advance(state, 10);
    expect(state.powerUps).toHaveLength(0);
    expect([...state.pickupEvents].sort()).toEqual([PowerUpType.EXTRA_LIFE, PowerUpType.SLOW_BALL].sort());
  });

  it('keeps unannounced events across a lost ball and a new level', () => {
    const state = runningState();
    give(state, PowerUpType.MULTI_BALL);
    resetBall(state);
    nextLevel(state);
    expect(state.pickupEvents).toEqual([PowerUpType.MULTI_BALL]);
  });
});

describe('getInstantPickup', () => {
  it('is null until something is caught', () => {
    expect(getInstantPickup(createGameState('medium'))).toBeNull();
  });

  it('acknowledges an extra life, then clears after the notice time', () => {
    const state = runningState();
    const lives = state.lives;
    give(state, PowerUpType.EXTRA_LIFE);
    expect(state.lives).toBe(lives + 1);
    expect(getInstantPickup(state)).toBe(PowerUpType.EXTRA_LIFE);
    advance(state, PICKUP_NOTICE_MS - 100);
    expect(getInstantPickup(state)).toBe(PowerUpType.EXTRA_LIFE);
    advance(state, 110);
    expect(getInstantPickup(state)).toBeNull();
    expect(state.pickup).toBeNull();
  });

  it('acknowledges multi-ball', () => {
    const state = runningState();
    give(state, PowerUpType.MULTI_BALL);
    expect(getInstantPickup(state)).toBe(PowerUpType.MULTI_BALL);
  });

  it('records timed pickups too, but leaves them to the countdown', () => {
    const state = runningState();
    give(state, PowerUpType.SLOW_BALL);
    expect(state.pickup?.type).toBe(PowerUpType.SLOW_BALL);
    expect(getInstantPickup(state)).toBeNull();
  });

  it('is set when a falling capsule reaches the paddle', () => {
    const state = runningState();
    state.powerUps.push({
      x: state.paddle.x + state.paddle.width / 2,
      y: state.paddle.y,
      type: PowerUpType.EXTRA_LIFE,
      config: getPowerUpConfig(PowerUpType.EXTRA_LIFE),
    });
    advance(state, 20);
    expect(state.powerUps).toHaveLength(0);
    expect(getInstantPickup(state)).toBe(PowerUpType.EXTRA_LIFE);
  });

  it('is cleared with the effects on a lost ball and on a new level', () => {
    const lost = runningState();
    give(lost, PowerUpType.EXPAND_PADDLE);
    give(lost, PowerUpType.EXTRA_LIFE);
    resetBall(lost);
    expect(lost.pickup).toBeNull();
    expect(getEffectStatuses(lost)).toEqual([]);

    const cleared = runningState();
    give(cleared, PowerUpType.SLOW_BALL);
    give(cleared, PowerUpType.MULTI_BALL);
    nextLevel(cleared);
    expect(cleared.pickup).toBeNull();
    expect(getEffectStatuses(cleared)).toEqual([]);
  });
});
