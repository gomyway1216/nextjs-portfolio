import { describe, expect, it } from 'vitest';
import {
  fairExpectedDuration,
  runRuin,
  theoreticalRuinProb,
} from '@/components/game/GamblersRuin/engine';

describe('GamblersRuin engine', () => {
  it('computes fair-game ruin probability and duration', () => {
    expect(theoreticalRuinProb({ start: 3, target: 10, winProb: 0.5 })).toBe(0.7);
    expect(fairExpectedDuration({ start: 3, target: 10, winProb: 0.5 })).toBe(21);
  });

  it('handles biased-game boundaries without overflow', () => {
    expect(theoreticalRuinProb({ start: 0, target: 10, winProb: 0.4 })).toBe(1);
    expect(theoreticalRuinProb({ start: 10, target: 10, winProb: 0.4 })).toBe(0);
    expect(theoreticalRuinProb({ start: 2, target: 200, winProb: 0.01 })).toBeGreaterThan(0.99);
    expect(fairExpectedDuration({ start: 3, target: 10, winProb: 0.49 })).toBeNaN();
  });

  it('runs deterministic paths to reached, ruined, or capped outcomes', () => {
    expect(runRuin({ start: 2, target: 4, winProb: 0.5 }, 5, () => 0).outcome).toBe('reached');
    expect(runRuin({ start: 2, target: 4, winProb: 0.5 }, 5, () => 1).outcome).toBe('ruined');
    expect(runRuin({ start: 2, target: 4, winProb: 0.5 }, 1, () => 0).outcome).toBe('capped');
  });
});
