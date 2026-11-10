/**
 * Mid-run outlook for a single collection: what to expect from here, given how
 * many of the n coupons are already held, plus how the finished run compares
 * with the exact distribution of the completion time T.
 */

const assertCounts = (n: number, collected: number) => {
  if (!Number.isInteger(n) || n <= 0) throw new Error('outlook: n must be a positive integer');
  if (!Number.isInteger(collected) || collected < 0 || collected > n) {
    throw new Error('outlook: collected must be an integer in 0..n');
  }
};

/** Chance that the next draw is a coupon not held yet: (n − k) / n. */
export function newCouponChance(n: number, collected: number): number {
  assertCounts(n, collected);
  return (n - collected) / n;
}

/** Expected draws until the next new coupon, n / (n − k). Infinity once the set is complete. */
export function expectedWaitForNext(n: number, collected: number): number {
  assertCounts(n, collected);
  return collected === n ? Infinity : n / (n - collected);
}

/**
 * Expected draws still needed with k coupons held: Σ n/(n−j) for j = k…n−1,
 * which is n·H₍ₙ₋ₖ₎. The process is memoryless, so draws already made don't matter.
 */
export function expectedRemaining(n: number, collected: number): number {
  assertCounts(n, collected);
  let sum = 0;
  for (let missing = n - collected; missing >= 1; missing--) sum += n / missing;
  return sum;
}

/**
 * Wait (in draws) for each new coupon, in the order they arrived:
 * waits[j] is the number of draws it took to go from j to j+1 distinct coupons.
 * `uniqueCurve[i]` is the distinct count after draw i+1.
 */
export function waitsPerNewCoupon(uniqueCurve: readonly number[]): number[] {
  const waits: number[] = [];
  let prev = 0;
  let since = 0;
  for (const unique of uniqueCurve) {
    since++;
    if (unique > prev) {
      waits.push(since);
      since = 0;
      prev = unique;
    }
  }
  return waits;
}

/** Draws made since the last new coupon arrived (0 right after a new one, or before any draw). */
export function currentDryStreak(uniqueCurve: readonly number[]): number {
  let streak = 0;
  for (let i = uniqueCurve.length - 1; i >= 0; i--) {
    const before = i === 0 ? 0 : uniqueCurve[i - 1];
    if (uniqueCurve[i] > before) break;
    streak++;
  }
  return streak;
}

/**
 * Exact P(T ≤ draws): the probability that a fresh collection of n coupons is
 * complete within `draws` draws. Walks the distribution of the distinct count
 * forward one draw at a time (O(n · draws)); unlike the inclusion–exclusion
 * formula this has no cancellation, so it stays accurate for large n.
 */
export function completionCdf(n: number, draws: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error('completionCdf: n must be a positive integer');
  if (!Number.isInteger(draws) || draws < 0) {
    throw new Error('completionCdf: draws must be a non-negative integer');
  }
  if (draws < n) return 0;
  // p[k] = probability of holding exactly k distinct coupons.
  const p = new Float64Array(n + 1);
  p[0] = 1;
  for (let t = 0; t < draws; t++) {
    // Descending k so p[k − 1] is still the previous draw's value.
    for (let k = Math.min(n, t + 1); k >= 1; k--) {
      p[k] = (p[k] * k) / n + (p[k - 1] * (n - k + 1)) / n;
    }
    p[0] = 0;
  }
  return Math.min(1, p[n]);
}

/**
 * Format a probability as a percentage with one decimal, without ever rounding
 * a non-zero chance down to 0.0% or a non-certain one up to 100.0%.
 */
export function formatChance(p: number): string {
  if (!(p > 0)) return '0%';
  if (p >= 1) return '100%';
  if (p < 0.001) return '<0.1%';
  if (p > 0.999) return '>99.9%';
  // Values just inside the thresholds would otherwise print as 0.0 / 100.0.
  const pct = Math.min(99.9, Math.max(0.1, Number((p * 100).toFixed(1))));
  return `${pct.toFixed(1)}%`;
}
