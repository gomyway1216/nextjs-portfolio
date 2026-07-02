import { describe, expect, it } from 'vitest';
import {
  dayLabel,
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
});
