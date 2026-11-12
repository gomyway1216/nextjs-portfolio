import { describe, expect, it } from 'vitest';
import { createSeededRng, credibleIntervalExact, flip, posteriorMean } from '@/components/game/BayesianUpdate/engine';
import {
  EMPTY_TRACE,
  TRACE_MAX_POINTS,
  beliefPath,
  extendTrace,
  formatInterval,
  formatWidth,
} from '@/components/game/BayesianUpdate/trace';

const flips = (n: number, p = 0.7, seed = 42): (0 | 1)[] => {
  const rng = createSeededRng(seed);
  return Array.from({ length: n }, () => flip(p, rng));
};

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

describe('BayesianUpdate flip trace', () => {
  it('records every flip while the run is short', () => {
    const trace = extendTrace(EMPTY_TRACE, [1, 0, 1]);
    expect(trace).toEqual({
      stride: 1,
      n: 3,
      heads: 2,
      points: [
        { n: 1, heads: 1 },
        { n: 2, heads: 1 },
        { n: 3, heads: 2 },
      ],
    });
  });

  it('does not mutate the trace it extends and returns it unchanged for no flips', () => {
    const first = extendTrace(EMPTY_TRACE, [1, 1]);
    const snapshot = JSON.parse(JSON.stringify(first));
    expect(extendTrace(first, [])).toBe(first);
    extendTrace(first, [0, 0, 0]);
    expect(first).toEqual(snapshot);
    expect(EMPTY_TRACE.points).toEqual([]);
  });

  it('stays bounded and evenly spaced over long runs', () => {
    const data = flips(5000);
    const trace = extendTrace(EMPTY_TRACE, data);
    expect(trace.n).toBe(5000);
    expect(trace.heads).toBe(sum(data));
    expect(trace.points.length).toBeLessThanOrEqual(TRACE_MAX_POINTS);
    expect(trace.points.length).toBeGreaterThanOrEqual(TRACE_MAX_POINTS / 2 - 1);
    trace.points.forEach((p, i) => {
      expect(p.n).toBe((i + 1) * trace.stride);
      expect(p.heads).toBe(sum(data.slice(0, p.n)));
    });
  });

  it('gives the same trace whether flips arrive one by one or in batches', () => {
    const data = flips(1337, 0.3, 7);
    const batched = extendTrace(extendTrace(EMPTY_TRACE, data.slice(0, 1000)), data.slice(1000));
    let single = EMPTY_TRACE;
    for (const f of data) single = extendTrace(single, [f]);
    expect(single).toEqual(batched);
  });

  it('respects a custom cap', () => {
    const trace = extendTrace(EMPTY_TRACE, flips(100), 10);
    expect(trace.points.length).toBeLessThanOrEqual(10);
    expect(trace.stride).toBe(16);
  });
});

describe('BayesianUpdate belief path', () => {
  it('is just the prior before any flip', () => {
    const prior = { alpha: 8, beta: 2 };
    const path = beliefPath(EMPTY_TRACE, prior);
    expect(path).toHaveLength(1);
    const [lo, hi] = credibleIntervalExact(prior, 0.95);
    expect(path[0]).toEqual({ n: 0, mean: 0.8, lo, hi });
  });

  it('matches the conjugate posterior at each checkpoint', () => {
    const prior = { alpha: 2, beta: 3 };
    const path = beliefPath(extendTrace(EMPTY_TRACE, [1, 1, 0, 1]), prior);
    expect(path.map((p) => p.n)).toEqual([0, 1, 2, 3, 4]);
    const last = path[4];
    const post = { alpha: 5, beta: 4 };
    expect(last.mean).toBeCloseTo(posteriorMean(post), 12);
    const [lo, hi] = credibleIntervalExact(post, 0.95);
    expect(last.lo).toBe(lo);
    expect(last.hi).toBe(hi);
    for (const p of path) {
      expect(p.lo).toBeLessThan(p.mean);
      expect(p.hi).toBeGreaterThan(p.mean);
    }
  });

  it('ends on the latest flip even when it falls between checkpoints', () => {
    const trace = extendTrace(EMPTY_TRACE, flips(1001));
    expect(trace.stride).toBeGreaterThan(1);
    const path = beliefPath(trace, { alpha: 1, beta: 1 });
    expect(path[path.length - 1].n).toBe(1001);
    expect(path).toHaveLength(trace.points.length + 2);
    const ns = path.map((p) => p.n);
    expect([...ns].sort((a, b) => a - b)).toEqual(ns);
    expect(new Set(ns).size).toBe(ns.length);
  });

  it('narrows as evidence accumulates', () => {
    const path = beliefPath(extendTrace(EMPTY_TRACE, flips(2000)), { alpha: 1, beta: 1 });
    const first = path[0];
    const last = path[path.length - 1];
    expect(first.hi - first.lo).toBeCloseTo(0.95, 10);
    expect(last.hi - last.lo).toBeLessThan(0.05);
  });
});

describe('formatWidth', () => {
  it('keeps tiny widths from rounding to zero', () => {
    expect(formatWidth(0.95)).toBe('0.950');
    expect(formatWidth(0.0567)).toBe('0.057');
    expect(formatWidth(0.00196)).toBe('0.0020');
    expect(formatWidth(0.00001234)).toBe('0.000012');
    expect(formatWidth(0.0000001234)).toBe('1.2e-7');
    expect(formatWidth(0)).toBe('0.000');
    expect(formatWidth(Number.NaN)).toBe('–');
  });
});

describe('formatInterval', () => {
  it('keeps two decimals while the ends are clearly apart', () => {
    expect(formatInterval(0.0253, 0.9747)).toBe('[0.03, 0.97]');
    expect(formatInterval(0.6709, 0.7276)).toBe('[0.67, 0.73]');
  });

  it('adds decimals instead of printing a degenerate interval', () => {
    expect(formatInterval(0.69094, 0.7089)).toBe('[0.691, 0.709]');
    expect(formatInterval(0.69715, 0.70283)).toBe('[0.697, 0.703]');
    expect(formatInterval(0.6991, 0.7009)).toBe('[0.6991, 0.7009]');
  });

  it('shows distinct ends for the real posterior after 100,000 flips', () => {
    const [lo, hi] = credibleIntervalExact({ alpha: 70_001, beta: 30_001 }, 0.95);
    expect(`[${lo.toFixed(2)}, ${hi.toFixed(2)}]`).toBe('[0.70, 0.70]');
    const text = formatInterval(lo, hi);
    const [a, b] = text.slice(1, -1).split(', ').map(Number);
    expect(a).toBeLessThan(b);
    expect(a).toBeCloseTo(lo, 3);
    expect(b).toBeCloseTo(hi, 3);
  });

  it('stops at six decimals and handles non-finite input', () => {
    expect(formatInterval(0.5, 0.5)).toBe('[0.500000, 0.500000]');
    expect(formatInterval(Number.NaN, 0.5)).toBe('–');
  });
});
