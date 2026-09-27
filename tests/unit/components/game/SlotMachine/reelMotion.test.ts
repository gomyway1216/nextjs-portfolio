import { describe, expect, it } from 'vitest';

import { PHYSICAL_STOPS } from '@/components/game/SlotMachine/engine';
import {
  ANTICIPATION_MS,
  REEL_STOP_MS,
  mod,
  planReels,
  reelPosition,
  reelSpeed,
  spinDuration,
} from '@/components/game/SlotMachine/reelMotion';

const allStarts = [0, 3.5, 11, 21.99, -4, 40];

describe('planReels / reelPosition', () => {
  it('always stops each reel with its drawn stop on the payline (middle row)', () => {
    for (const from of allStarts) {
      for (let a = 0; a < PHYSICAL_STOPS; a++) {
        const stops = [a, (a * 7) % PHYSICAL_STOPS, (a * 13 + 5) % PHYSICAL_STOPS];
        for (const anticipation of [false, true]) {
          const plans = planReels([from, from + 1, from + 2], stops, anticipation);
          plans.forEach((plan, r) => {
            const end = reelPosition(plan, plan.durationMs);
            // Top row = stop − 1, so the stop sits in the middle row.
            expect(Math.abs(mod(end) - mod(stops[r] - 1))).toBeLessThan(1e-9);
            // …and it stays there afterwards.
            expect(reelPosition(plan, plan.durationMs + 5_000)).toBeCloseTo(end, 12);
          });
        }
      }
    }
  });

  it('starts from the current position and moves the symbols downward', () => {
    const plans = planReels([5, 9, 14], [0, 0, 0], false);
    plans.forEach((plan, r) => {
      expect(reelPosition(plan, 0)).toBeCloseTo(mod([5, 9, 14][r]), 12);
      expect(plan.travel).toBeGreaterThan(PHYSICAL_STOPS); // at least one full turn
      expect(reelPosition(plan, plan.durationMs)).toBeLessThan(plan.from);
    });
  });

  it('stops the reels left to right; anticipation only delays the last one', () => {
    const normal = planReels([0, 0, 0], [3, 4, 5], false);
    expect(normal.map((p) => p.durationMs)).toEqual([...REEL_STOP_MS]);
    const tense = planReels([0, 0, 0], [3, 4, 5], true);
    expect(tense.map((p) => p.durationMs)).toEqual([REEL_STOP_MS[0], REEL_STOP_MS[1], REEL_STOP_MS[2] + ANTICIPATION_MS]);
    expect(spinDuration(tense)).toBe(REEL_STOP_MS[2] + ANTICIPATION_MS);
  });

  it('moves smoothly: small steps, a brief wind-up and a small overshoot only', () => {
    for (const from of allStarts) {
      const [plan] = planReels([from], [9], false);
      const end = reelPosition(plan, plan.durationMs);
      let prev = reelPosition(plan, 0);
      let max = prev;
      let min = prev;
      for (let t = 1; t <= plan.durationMs; t++) {
        const p = reelPosition(plan, t);
        expect(Math.abs(p - prev)).toBeLessThan(0.2); // < 0.2 cell per ms
        max = Math.max(max, p);
        min = Math.min(min, p);
        prev = p;
      }
      expect(max - plan.from).toBeLessThanOrEqual(0.3 + 1e-9); // wind-up
      expect(end - min).toBeLessThanOrEqual(0.28 + 1e-9); // overshoot past the stop
      expect(end - min).toBeGreaterThan(0.2); // …but there is a visible settle
    }
  });

  it('is fast mid-spin and still at the end (drives the motion blur)', () => {
    const [plan] = planReels([0], [12], false);
    expect(reelSpeed(plan, plan.durationMs * 0.2)).toBeGreaterThan(30);
    expect(reelSpeed(plan, plan.durationMs + 10)).toBe(0);
  });
});
