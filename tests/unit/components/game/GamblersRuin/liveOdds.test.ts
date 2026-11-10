import { describe, expect, it } from 'vitest';
import { expectedDuration, theoreticalRuinProb } from '@/components/game/GamblersRuin/engine';
import {
  RUN_LOG_LIMIT,
  appendRunLog,
  continueRun,
  formatChance,
  oddsFrom,
  reviewRun,
  type RunLogEntry,
} from '@/components/game/GamblersRuin/liveOdds';

function sequence(values: number[], fallback = 0): () => number {
  let index = 0;
  return () => values[index++] ?? fallback;
}

describe('oddsFrom', () => {
  it('matches the closed forms evaluated at the current bankroll', () => {
    const config = { start: 10, target: 20, winProb: 0.45 };
    const odds = oddsFrom(config, 14);
    const here = { ...config, start: 14 };
    expect(odds.ruinProb).toBe(theoreticalRuinProb(here));
    expect(odds.reachProb).toBeCloseTo(1 - theoreticalRuinProb(here), 12);
    expect(odds.expectedSteps).toBe(expectedDuration(here));
    expect(odds.settled).toBe(false);
  });

  it('gives b/N and b(N-b) in a fair game', () => {
    const odds = oddsFrom({ start: 10, target: 20, winProb: 0.5 }, 5);
    expect(odds.reachProb).toBeCloseTo(0.25, 12);
    expect(odds.ruinProb).toBeCloseTo(0.75, 12);
    expect(odds.expectedSteps).toBe(75);
  });

  it('is exact and settled once the bankroll is on a boundary', () => {
    const config = { start: 10, target: 20, winProb: 0.3 };
    expect(oddsFrom(config, 0)).toEqual({ ruinProb: 1, reachProb: 0, expectedSteps: 0, settled: true });
    expect(oddsFrom(config, 20)).toEqual({ ruinProb: 0, reachProb: 1, expectedSteps: 0, settled: true });
  });

  it('moves the reach chance up with every dollar won', () => {
    const config = { start: 10, target: 20, winProb: 0.48 };
    for (let b = 1; b < 19; b++) {
      expect(oddsFrom(config, b + 1).reachProb).toBeGreaterThan(oddsFrom(config, b).reachProb);
    }
  });
});

describe('formatChance', () => {
  it('prints two decimals for ordinary values', () => {
    expect(formatChance(0.5)).toBe('50.00%');
    expect(formatChance(0.12345)).toBe('12.35%');
    expect(formatChance(0.0001)).toBe('0.01%');
  });

  it('never shows an open run as 0.00% or 100.00%', () => {
    expect(formatChance(0)).toBe('<0.01%');
    expect(formatChance(3e-9)).toBe('<0.01%');
    expect(formatChance(0.00004)).toBe('<0.01%');
    expect(formatChance(1)).toBe('>99.99%');
    expect(formatChance(0.99996)).toBe('>99.99%');
  });

  it('agrees with what toFixed would print just inside the thresholds', () => {
    expect(formatChance(0.00006)).toBe('0.01%');
    expect(formatChance(0.9999)).toBe('99.99%');
  });

  it('shows exact 0% / 100% once settled', () => {
    expect(formatChance(0, true)).toBe('0.00%');
    expect(formatChance(1, true)).toBe('100.00%');
  });

  it('handles a hopeless open game without rounding to certainty', () => {
    const odds = oddsFrom({ start: 1, target: 200, winProb: 0.01 }, 1);
    expect(formatChance(odds.ruinProb, odds.settled)).toBe('>99.99%');
    expect(formatChance(odds.reachProb, odds.settled)).toBe('<0.01%');
  });

  it('prints a dash for non-finite input', () => {
    expect(formatChance(NaN)).toBe('—');
  });
});

describe('continueRun', () => {
  const config = { start: 10, target: 20, winProb: 0.5 };

  it('starts from the current bankroll, not the configured start', () => {
    const run = continueRun(config, 18, 30, 5000, sequence([0.1, 0.1]));
    expect(run.trajectory).toEqual([18, 19, 20]);
    expect(run.outcome).toBe('reached');
    expect(run.steps).toBe(2);
  });

  it('can be ruined from a low bankroll', () => {
    const run = continueRun(config, 2, 12, 5000, sequence([0.9, 0.9]));
    expect(run.trajectory).toEqual([2, 1, 0]);
    expect(run.outcome).toBe('ruined');
  });

  it('spends only what is left of the step cap', () => {
    // Alternating win/loss never resolves; 3 steps remain of a 10-step cap.
    const run = continueRun(config, 10, 7, 10, sequence([0.1, 0.9, 0.1, 0.9, 0.1, 0.9]));
    expect(run.outcome).toBe('capped');
    expect(run.steps).toBe(3);
    expect(run.trajectory).toEqual([10, 11, 10, 11]);
  });

  it('still takes one step when the cap is already used up', () => {
    const run = continueRun(config, 10, 10, 10, sequence([0.1]));
    expect(run.steps).toBe(1);
    expect(run.outcome).toBe('capped');
  });
});

describe('reviewRun', () => {
  const config = { start: 3, target: 6, winProb: 0.5 };

  it('reports the peak, when it was first hit and the reach chance there', () => {
    const review = reviewRun(config, [3, 4, 5, 4, 5, 4, 3, 2, 1, 0], 'ruined');
    expect(review.steps).toBe(9);
    expect(review.wins).toBe(3);
    expect(review.losses).toBe(6);
    expect(review.expectedWins).toBe(4.5);
    expect(review.peak).toBe(5);
    expect(review.peakStep).toBe(2);
    expect(review.reachProbAtPeak).toBeCloseTo(5 / 6, 12);
    expect(review.low).toBe(0);
    expect(review.lowStep).toBe(9);
    expect(review.ruinProbAtLow).toBe(1);
  });

  it('reports the low and the ruin chance there for a run that reached the target', () => {
    const review = reviewRun(config, [3, 2, 1, 2, 3, 4, 5, 6], 'reached');
    expect(review.low).toBe(1);
    expect(review.lowStep).toBe(2);
    expect(review.ruinProbAtLow).toBeCloseTo(5 / 6, 12);
    expect(review.peak).toBe(6);
    expect(review.reachProbAtPeak).toBe(1);
    expect(review.wins).toBe(5);
    expect(review.losses).toBe(2);
  });

  it('marks a run that never rose above its start with peakStep 0', () => {
    const review = reviewRun(config, [3, 2, 1, 0], 'ruined');
    expect(review.peak).toBe(3);
    expect(review.peakStep).toBe(0);
    expect(review.reachProbAtPeak).toBeCloseTo(0.5, 12);
    expect(review.wins).toBe(0);
  });

  it('uses the biased formula for the chances', () => {
    const biased = { start: 3, target: 6, winProb: 0.4 };
    const review = reviewRun(biased, [3, 4, 3, 2, 1, 0], 'ruined');
    expect(review.reachProbAtPeak).toBeCloseTo(1 - theoreticalRuinProb({ ...biased, start: 4 }), 12);
    expect(review.expectedWins).toBeCloseTo(2, 12);
  });

  it('counts wins + losses = steps for a capped run', () => {
    const review = reviewRun(config, [3, 4, 3, 4, 3], 'capped');
    expect(review.outcome).toBe('capped');
    expect(review.wins + review.losses).toBe(review.steps);
    expect(review.peak).toBe(4);
    expect(review.low).toBe(3);
    expect(review.lowStep).toBe(0);
  });

  it('rejects an empty trajectory', () => {
    expect(() => reviewRun(config, [], 'capped')).toThrow();
  });
});

describe('appendRunLog', () => {
  const config = { start: 3, target: 6, winProb: 0.5 };
  const entry = (id: number): RunLogEntry => ({
    id,
    config,
    review: reviewRun(config, [3, 2, 1, 0], 'ruined'),
  });

  it('puts the newest run first and does not mutate the input', () => {
    const log = [entry(1)];
    const next = appendRunLog(log, entry(2));
    expect(next.map((e) => e.id)).toEqual([2, 1]);
    expect(log.map((e) => e.id)).toEqual([1]);
  });

  it('keeps only the most recent RUN_LOG_LIMIT runs', () => {
    let log: RunLogEntry[] = [];
    for (let id = 1; id <= RUN_LOG_LIMIT + 3; id++) log = appendRunLog(log, entry(id));
    expect(log).toHaveLength(RUN_LOG_LIMIT);
    expect(log[0].id).toBe(RUN_LOG_LIMIT + 3);
    expect(log[log.length - 1].id).toBe(4);
  });
});
