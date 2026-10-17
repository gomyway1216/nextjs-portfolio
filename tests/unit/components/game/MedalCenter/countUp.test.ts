import { describe, expect, it } from 'vitest';
import { COUNT_UP, countUpDuration, countedAt } from '@/components/game/MedalCenter/countUp';

// How a win runs into the medals on a machine's meters: a medal at a time for a small win, faster for a big one,
// whole medals only, and always ending exactly on what the player has.

describe('a win running into the medals', () => {
  it('takes one medal’s time per medal, and never longer than the longest count', () => {
    expect(countUpDuration(0)).toBe(0);
    expect(countUpDuration(1)).toBe(COUNT_UP.perMedal);
    expect(countUpDuration(15)).toBe(15 * COUNT_UP.perMedal);
    expect(countUpDuration(3000)).toBe(COUNT_UP.longest);
    expect(countUpDuration(-5)).toBe(0);
    // A jackpot of 3,000 at three medals runs in no slower than a 40-medal win.
    expect(countUpDuration(3000)).toBeLessThanOrEqual(countUpDuration(40));
  });

  it('counts whole medals up from the start to the end, never past it, never back', () => {
    for (const [from, to] of [
      [97, 3097],
      [99, 101],
      [0, 125],
      [1234, 1270],
    ]) {
      const duration = countUpDuration(to - from);
      let last = from;
      for (let t = 0; t <= duration + 100; t += 7) {
        const n = countedAt(from, to, t);
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(last);
        expect(n).toBeLessThanOrEqual(to);
        last = n;
      }
      expect(countedAt(from, to, 0)).toBe(from);
      expect(countedAt(from, to, duration)).toBe(to);
      expect(countedAt(from, to, duration * 10)).toBe(to);
    }
  });

  it('shows a fall, or no change, as it is', () => {
    expect(countedAt(100, 97, 0)).toBe(97);
    expect(countedAt(100, 100, 0)).toBe(100);
  });

  it('runs a small win in a medal at a time', () => {
    // 3 medals: 99, 100, 101 then 102, each a medal's time apart.
    expect([0, 59, 60, 119, 120, 179, 180].map((t) => countedAt(99, 102, t))).toEqual([99, 99, 100, 100, 101, 101, 102]);
  });
});
