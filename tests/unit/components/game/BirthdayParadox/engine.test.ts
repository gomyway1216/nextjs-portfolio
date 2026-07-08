import { describe, expect, it } from 'vitest';
import {
  createSeededRng,
  dayLabel,
  estimateMatchProb,
  findFirstCollision,
  generateBirthdays,
  hasCollision,
  runBirthdaySweepAsync,
  theoreticalMatchProb,
} from '@/components/game/BirthdayParadox/engine';

describe('BirthdayParadox engine', () => {
  it('calculates known birthday collision probabilities', () => {
    expect(theoreticalMatchProb(1)).toBe(0);
    expect(theoreticalMatchProb(23)).toBeCloseTo(0.5073, 3);
    expect(theoreticalMatchProb(366)).toBe(1);
  });

  it('matches the classic reference values from the closed form', () => {
    // The canonical birthday-problem checkpoints.
    expect(theoreticalMatchProb(23)).toBeCloseTo(0.507, 2); // ~50.7%
    expect(theoreticalMatchProb(50)).toBeCloseTo(0.970, 2); // ~97.0%
    expect(theoreticalMatchProb(70)).toBeCloseTo(0.999, 3); // ~99.9%
    // Exactly at the pigeonhole boundary the closed form must be certain.
    expect(theoreticalMatchProb(365)).toBeCloseTo(1, 5);
    expect(theoreticalMatchProb(0)).toBe(0);
    // Monotonically non-decreasing across the whole range.
    let prev = -1;
    for (let n = 0; n <= 100; n++) {
      const p = theoreticalMatchProb(n);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it('is equivalent to the exact factorial form 1 - 365!/(365^n (365-n)!)', () => {
    // Compute the closed factorial form in log-space (stable) and compare.
    const logFactorialForm = (n: number): number => {
      let logProd = 0; // log of ∏_{i=0..n-1} (365-i)/365
      for (let i = 0; i < n; i++) {
        logProd += Math.log((365 - i) / 365);
      }
      return 1 - Math.exp(logProd);
    };
    for (const n of [2, 10, 23, 40, 70, 100]) {
      expect(theoreticalMatchProb(n)).toBeCloseTo(logFactorialForm(n), 10);
    }
  });

  it('generates birthdays with injected rng', () => {
    const values = [0, 0.5, 0.999];
    const rng = () => values.shift() ?? 0;

    expect(generateBirthdays(3, rng)).toEqual([0, 182, 364]);
  });

  it('finds the first repeated day and labels calendar days', () => {
    expect(findFirstCollision([10, 20, 10, 20])).toEqual({ day: 10, indices: [0, 2] });
    expect(hasCollision([1, 2, 3])).toBe(false);
    expect(dayLabel(0)).toBe('1/1');
    expect(dayLabel(364)).toBe('12/31');
    expect(dayLabel(365)).toBe('?');
  });

  it('runs a deterministic sweep and reports theoretical crossing points', async () => {
    const progress: Array<[number, number]> = [];

    const result = await runBirthdaySweepAsync(
      25,
      1,
      { onProgress: (done, total) => progress.push([done, total]) },
      () => 0,
    );

    expect(result?.points).toHaveLength(25);
    expect(result?.points[0]).toMatchObject({ n: 1, empirical: 0, theoretical: 0 });
    expect(result?.points[1].empirical).toBe(1);
    expect(result?.fiftyPercentN).toBe(23);
    expect(result?.ninetyNinePercentN).toBeNull();
    expect(progress[0]).toEqual([1, 25]);
    expect(progress.at(-1)).toEqual([25, 25]);
  });

  it('validates sweep inputs', async () => {
    await expect(runBirthdaySweepAsync(1, 1)).rejects.toThrow('maxN');
    await expect(runBirthdaySweepAsync(2, 0)).rejects.toThrow('trialsPerN');
  });

  it('returns null when a sweep is aborted after progress', async () => {
    const controller = new AbortController();

    const result = await runBirthdaySweepAsync(
      3,
      1,
      {
        signal: controller.signal,
        onProgress: () => controller.abort(),
      },
      () => 0,
    );

    expect(result).toBeNull();
  });

  it('produces a deterministic, uniform-ish stream from a seed', () => {
    const a = createSeededRng(0xabcdef);
    const b = createSeededRng(0xabcdef);
    // Same seed => identical stream (reproducibility).
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
    // Values stay within [0, 1).
    const rng = createSeededRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('Monte-Carlo empirical rate matches theory (law of large numbers)', () => {
    // Seeded RNG keeps the assertion deterministic while still exercising the
    // full sampling path. With 20k trials the empirical rate is tight.
    const rng = createSeededRng(0x1234_5678);
    for (const n of [23, 40, 70]) {
      const empirical = estimateMatchProb(n, 20_000, rng);
      const theory = theoreticalMatchProb(n);
      expect(empirical).toBeCloseTo(theory, 1); // within ~0.05
      expect(Math.abs(empirical - theory)).toBeLessThan(0.03);
    }
  });

  it('empirical n=23 lands near the famous ~50.7%', () => {
    const rng = createSeededRng(20230704);
    const empirical = estimateMatchProb(23, 40_000, rng);
    expect(empirical).toBeGreaterThan(0.48);
    expect(empirical).toBeLessThan(0.53);
  });

  it('a full seeded sweep tracks theory at every group size', async () => {
    const rng = createSeededRng(777);
    const result = await runBirthdaySweepAsync(75, 3000, {}, rng);
    expect(result).not.toBeNull();
    // The famous crossings from the exact curve.
    expect(result?.fiftyPercentN).toBe(23);
    expect(result?.ninetyNinePercentN).toBe(57);
    // Simulation should hug theory: mean abs error small across the sweep.
    const pts = result!.points;
    const mae = pts.reduce((s, p) => s + Math.abs(p.empirical - p.theoretical), 0) / pts.length;
    expect(mae).toBeLessThan(0.02);
    // Spot-check the headline anchors.
    const at = (n: number) => pts.find((p) => p.n === n)!;
    expect(at(23).empirical).toBeCloseTo(0.507, 1);
    expect(at(70).empirical).toBeCloseTo(0.999, 1);
  });
});
