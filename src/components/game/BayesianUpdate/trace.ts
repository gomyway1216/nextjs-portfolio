/**
 * A bounded record of one run of coin flips, so the Play tab can show how the
 * posterior travelled from the prior to where it is now.
 *
 * Only cumulative counts are stored (the Beta posterior depends on nothing
 * else). To stay bounded however many flips are made, checkpoints are kept
 * every `stride` flips and the stride doubles whenever the list would exceed
 * the cap, so the checkpoints always span the whole run evenly.
 */
import { Posterior, credibleIntervalExact, posteriorMean } from './engine';

export interface TracePoint {
  /** Flips made so far. */
  n: number;
  /** Heads among those flips. */
  heads: number;
}

export interface FlipTrace {
  stride: number;
  n: number;
  heads: number;
  /** Checkpoints at multiples of `stride`, ascending in `n`. */
  points: TracePoint[];
}

export const TRACE_MAX_POINTS = 160;

export const EMPTY_TRACE: FlipTrace = { stride: 1, n: 0, heads: 0, points: [] };

export function extendTrace(
  trace: FlipTrace,
  flips: readonly (0 | 1)[],
  maxPoints: number = TRACE_MAX_POINTS,
): FlipTrace {
  if (flips.length === 0) return trace;
  const cap = Math.max(2, Math.floor(maxPoints));
  let { stride, n, heads } = trace;
  let points = trace.points.slice();
  for (const f of flips) {
    n += 1;
    heads += f;
    if (n % stride !== 0) continue;
    points.push({ n, heads });
    if (points.length > cap) {
      stride *= 2;
      const s = stride;
      points = points.filter((p) => p.n % s === 0);
    }
  }
  return { stride, n, heads, points };
}

export interface BeliefPoint {
  n: number;
  mean: number;
  /** Lower / upper end of the equal-tailed credible interval. */
  lo: number;
  hi: number;
}

/**
 * Posterior mean and credible interval at the prior (n = 0), at every
 * checkpoint and at the latest flip.
 */
export function beliefPath(trace: FlipTrace, prior: Posterior, level = 0.95): BeliefPoint[] {
  const counts: TracePoint[] = [{ n: 0, heads: 0 }, ...trace.points];
  if (counts[counts.length - 1].n !== trace.n) counts.push({ n: trace.n, heads: trace.heads });
  return counts.map(({ n, heads }) => {
    const post: Posterior = { alpha: prior.alpha + heads, beta: prior.beta + (n - heads) };
    const [lo, hi] = credibleIntervalExact(post, level);
    return { n, mean: posteriorMean(post), lo, hi };
  });
}

/** Interval widths shrink towards 0; keep two significant digits once they get tiny. */
export function formatWidth(width: number): string {
  if (!Number.isFinite(width)) return '–';
  if (width >= 0.01 || width <= 0) return width.toFixed(3);
  if (width < 1e-6) return width.toExponential(1);
  return width.toPrecision(2);
}
