/**
 * Statistics for the casino-style results board ("marquee") next to the wheel.
 * Pure functions over a newest-first list of pocket numbers.
 */

import { POCKET_COUNT, RED_NUMBERS } from './engine';

/** How many spins the session keeps for statistics. */
export const HISTORY_LIMIT = 500;
/** Hot / cold numbers are meaningless on a handful of spins. */
export const HOT_COLD_MIN_SPINS = 10;
export const HOT_COLD_SIZE = 5;

export interface NumberStat {
  n: number;
  count: number;
  /** Spins since it last hit (0 = the latest spin), or null if it never hit. */
  since: number | null;
}

export interface HistoryStats {
  total: number;
  red: number;
  black: number;
  zero: number;
  even: number;
  odd: number;
  low: number;
  high: number;
  /** Hits in 1–12, 13–24, 25–36. */
  dozens: [number, number, number];
  /** Most frequent numbers (ties: most recent first). */
  hot: NumberStat[];
  /** Least frequent numbers (ties: longest absence first, then lowest number). */
  cold: NumberStat[];
}

/** Prepends a new result, keeping at most `limit` entries (newest first). */
export function pushResult(results: readonly number[], n: number, limit = HISTORY_LIMIT): number[] {
  return [n, ...results].slice(0, limit);
}

export function computeHistoryStats(results: readonly number[], size = HOT_COLD_SIZE): HistoryStats {
  const counts = new Array<number>(POCKET_COUNT).fill(0);
  const since = new Array<number | null>(POCKET_COUNT).fill(null);
  const stats: HistoryStats = {
    total: results.length,
    red: 0,
    black: 0,
    zero: 0,
    even: 0,
    odd: 0,
    low: 0,
    high: 0,
    dozens: [0, 0, 0],
    hot: [],
    cold: [],
  };

  results.forEach((n, i) => {
    counts[n] += 1;
    if (since[n] === null) since[n] = i;
    if (n === 0) {
      stats.zero += 1;
      return;
    }
    if (RED_NUMBERS.has(n)) stats.red += 1;
    else stats.black += 1;
    if (n % 2 === 0) stats.even += 1;
    else stats.odd += 1;
    if (n <= 18) stats.low += 1;
    else stats.high += 1;
    stats.dozens[Math.floor((n - 1) / 12)] += 1;
  });

  const all: NumberStat[] = counts.map((count, n) => ({ n, count, since: since[n] }));
  const absence = (s: NumberStat) => (s.since === null ? Infinity : s.since);

  stats.hot = all
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count || absence(a) - absence(b))
    .slice(0, size);
  stats.cold = [...all]
    .sort((a, b) => a.count - b.count || absence(b) - absence(a) || a.n - b.n)
    .slice(0, size);

  return stats;
}

/** Whole-number percentage of `part` in `total` ("—" when there is no data). */
export function formatPercent(part: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((part / total) * 100)}%`;
}
