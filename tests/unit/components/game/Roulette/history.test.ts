import { describe, expect, it } from 'vitest';

import {
  HISTORY_LIMIT,
  computeHistoryStats,
  formatPercent,
  pushResult,
} from '@/components/game/Roulette/history';

describe('pushResult', () => {
  it('prepends the newest result and caps the history', () => {
    expect(pushResult([5, 7], 12)).toEqual([12, 5, 7]);
    expect(pushResult([3, 2, 1], 4, 3)).toEqual([4, 3, 2]);
    const full = Array.from({ length: HISTORY_LIMIT }, (_, i) => i % 37);
    expect(pushResult(full, 36)).toHaveLength(HISTORY_LIMIT);
  });
});

describe('computeHistoryStats', () => {
  it('returns empty stats for no spins', () => {
    const s = computeHistoryStats([]);
    expect(s.total).toBe(0);
    expect(s.hot).toEqual([]);
    expect(s.cold).toHaveLength(5);
    expect(s.cold.every((c) => c.count === 0 && c.since === null)).toBe(true);
  });

  it('counts colours, parity, halves and dozens — zero belongs to none of them', () => {
    // newest first. Reds: 1, 18, 19, 25, 36. Blacks: 2, 13.
    const s = computeHistoryStats([0, 1, 2, 18, 19, 36, 13, 25, 0]);
    expect(s.total).toBe(9);
    expect(s.zero).toBe(2);
    expect(s.red).toBe(5);
    expect(s.black).toBe(2);
    expect(s.even).toBe(3); // 2, 18, 36
    expect(s.odd).toBe(4); // 1, 19, 13, 25
    expect(s.low).toBe(4); // 1, 2, 18, 13
    expect(s.high).toBe(3); // 19, 36, 25
    expect(s.dozens).toEqual([2, 3, 2]); // [1, 2] [18, 19, 13] [36, 25]
  });

  it('ranks hot numbers by frequency, then recency', () => {
    // 7 ×3, 11 ×2, 23 ×2 (23 more recent than 11), 4 ×1
    const s = computeHistoryStats([23, 7, 11, 7, 23, 4, 11, 7]);
    expect(s.hot.map((h) => h.n)).toEqual([7, 23, 11, 4]);
    expect(s.hot[0]).toEqual({ n: 7, count: 3, since: 1 });
  });

  it('ranks cold numbers by frequency, then longest absence, then number', () => {
    const results = Array.from({ length: 37 }, (_, n) => n).reverse(); // 36 newest … 0 oldest
    const s = computeHistoryStats(results);
    // Every number hit once; the oldest hits are the coldest.
    expect(s.cold.map((c) => c.n)).toEqual([0, 1, 2, 3, 4]);
    expect(s.cold[0].since).toBe(36);

    // Never-hit numbers are colder than anything that has hit.
    const partial = computeHistoryStats([5, 5, 5]);
    expect(partial.cold.map((c) => c.n)).toEqual([0, 1, 2, 3, 4]);
    expect(partial.cold.every((c) => c.count === 0)).toBe(true);
  });

  it('honours a custom hot/cold size', () => {
    const s = computeHistoryStats([1, 2, 3, 4], 2);
    expect(s.hot).toHaveLength(2);
    expect(s.cold).toHaveLength(2);
  });
});

describe('formatPercent', () => {
  it('rounds to whole percentages and handles empty data', () => {
    expect(formatPercent(1, 3)).toBe('33%');
    expect(formatPercent(2, 3)).toBe('67%');
    expect(formatPercent(0, 5)).toBe('0%');
    expect(formatPercent(0, 0)).toBe('—');
  });
});
