/**
 * Birthday paradox engine.
 *
 * Among `n` people with uniformly-distributed birthdays in a 365-day year,
 * the probability that at least two share a birthday is surprisingly large:
 *   n=23 ≈ 50.7%
 *   n=50 ≈ 97.0%
 *   n=70 > 99.9%
 *
 * Closed form: P(no match) = ∏_{i=0..n-1} (365-i)/365, P(match) = 1 - that.
 */

export const DAYS_IN_YEAR = 365;

/**
 * Small, fast, deterministic PRNG (mulberry32). Kept local to this game so the
 * Birthday Paradox engine has no cross-game dependency. Given the same seed it
 * always yields the same stream — used for reproducible demos and tests.
 */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function theoreticalMatchProb(n: number): number {
  if (n <= 1) return 0;
  if (n > DAYS_IN_YEAR) return 1; // pigeonhole
  let pNo = 1;
  for (let i = 0; i < n; i++) {
    pNo *= (DAYS_IN_YEAR - i) / DAYS_IN_YEAR;
  }
  return 1 - pNo;
}

export function generateBirthdays(n: number, rng: () => number = Math.random): number[] {
  const arr = new Array<number>(n);
  for (let i = 0; i < n; i++) arr[i] = Math.floor(rng() * DAYS_IN_YEAR);
  return arr;
}

/** Returns the (sorted, ascending) indices of one matched pair, or null. */
export function findFirstCollision(birthdays: number[]): { day: number; indices: number[] } | null {
  const seen = new Map<number, number[]>();
  for (let i = 0; i < birthdays.length; i++) {
    const d = birthdays[i];
    const existing = seen.get(d);
    if (existing) {
      existing.push(i);
      return { day: d, indices: existing };
    }
    seen.set(d, [i]);
  }
  return null;
}

export function hasCollision(birthdays: number[]): boolean {
  const seen = new Set<number>();
  for (let i = 0; i < birthdays.length; i++) {
    if (seen.has(birthdays[i])) return true;
    seen.add(birthdays[i]);
  }
  return false;
}

// Day-of-year (0-364) → "M/D" for a non-leap year.
export const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function dayLabel(dayOfYear: number): string {
  let d = dayOfYear;
  for (let m = 0; m < 12; m++) {
    if (d < MONTH_LENGTHS[m]) return `${m + 1}/${d + 1}`;
    d -= MONTH_LENGTHS[m];
  }
  return '?';
}

export interface SharedBirthday {
  day: number;
  /** Indices (ascending) of everyone born on `day`; always two or more. */
  indices: number[];
}

/** Every day that two or more people share, ordered by day of year. */
export function findSharedBirthdays(birthdays: number[]): SharedBirthday[] {
  const byDay = new Map<number, number[]>();
  for (let i = 0; i < birthdays.length; i++) {
    const existing = byDay.get(birthdays[i]);
    if (existing) existing.push(i);
    else byDay.set(birthdays[i], [i]);
  }
  const shared: SharedBirthday[] = [];
  byDay.forEach((indices, day) => {
    if (indices.length >= 2) shared.push({ day, indices });
  });
  return shared.sort((a, b) => a.day - b.day);
}

/** How many people were born on each day of the year (length DAYS_IN_YEAR). */
export function countByDay(birthdays: number[]): number[] {
  const counts = new Array<number>(DAYS_IN_YEAR).fill(0);
  for (const d of birthdays) {
    if (d >= 0 && d < DAYS_IN_YEAR) counts[d]++;
  }
  return counts;
}

/** Number of distinct pairs among `n` people: n(n-1)/2. */
export function pairCount(n: number): number {
  return n < 2 ? 0 : (n * (n - 1)) / 2;
}

// ---------- Simulation ----------

export interface SweepPoint {
  n: number;
  empirical: number;
  theoretical: number;
}

export interface SweepSummary {
  /** trialsPerN actually used after clamping. */
  trialsPerN: number;
  /** Inclusive max n covered (sweep is n = 1..maxN). */
  maxN: number;
  points: SweepPoint[];
  /** Crossing points the chart can annotate, computed from `points`. */
  fiftyPercentN: number | null;
  ninetyNinePercentN: number | null;
}

export interface SweepOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export async function runBirthdaySweepAsync(
  maxN: number,
  trialsPerN: number,
  options: SweepOptions = {},
  rng: () => number = Math.random,
): Promise<SweepSummary | null> {
  if (!Number.isInteger(maxN) || maxN < 2) {
    throw new Error('runBirthdaySweepAsync: maxN must be an integer >= 2');
  }
  if (!Number.isInteger(trialsPerN) || trialsPerN <= 0) {
    throw new Error('runBirthdaySweepAsync: trialsPerN must be a positive integer');
  }

  const points: SweepPoint[] = new Array(maxN);
  // Reusable seen-flags buffer — avoids allocating a Set per trial. At maxN ~ 200
  // and trialsPerN ~ 10000 that's 2M trial loops, where GC pressure shows up.
  const seen = new Uint8Array(DAYS_IN_YEAR);
  for (let n = 1; n <= maxN; n++) {
    let matches = 0;
    for (let t = 0; t < trialsPerN; t++) {
      seen.fill(0);
      let collided = false;
      for (let i = 0; i < n; i++) {
        const d = Math.floor(rng() * DAYS_IN_YEAR);
        if (seen[d] === 1) { collided = true; break; }
        seen[d] = 1;
      }
      if (collided) matches++;
    }
    points[n - 1] = {
      n,
      empirical: matches / trialsPerN,
      theoretical: theoreticalMatchProb(n),
    };
    options.onProgress?.(n, maxN);
    if (options.signal?.aborted) return null;
    // Yield every ~5 group sizes so the UI stays responsive even at huge trialsPerN.
    if (n % 5 === 0 && n < maxN) {
      await new Promise<void>((res) => setTimeout(res, 0));
    }
  }

  const findCrossing = (target: number): number | null => {
    for (const p of points) {
      if (p.theoretical >= target) return p.n;
    }
    return null;
  };
  return {
    trialsPerN,
    maxN,
    points,
    fiftyPercentN: findCrossing(0.5),
    ninetyNinePercentN: findCrossing(0.99),
  };
}

/**
 * Synchronous Monte-Carlo estimate of P(match) for a fixed group size `n`.
 * Runs `trials` independent groups and returns the empirical collision rate.
 * By the law of large numbers this converges to `theoreticalMatchProb(n)`.
 */
export function estimateMatchProb(
  n: number,
  trials: number,
  rng: () => number = Math.random,
): number {
  if (n <= 1 || trials <= 0) return 0;
  const seen = new Uint8Array(DAYS_IN_YEAR);
  let matches = 0;
  for (let t = 0; t < trials; t++) {
    seen.fill(0);
    let collided = false;
    for (let i = 0; i < n; i++) {
      const d = Math.floor(rng() * DAYS_IN_YEAR);
      if (seen[d] === 1) { collided = true; break; }
      seen[d] = 1;
    }
    if (collided) matches++;
  }
  return matches / trials;
}

/**
 * A probability as a percentage with `digits` decimals that never rounds an
 * uncertain value to a certain one: a chance below 1 that would print as 100%
 * reads ">99.99%", and a chance above 0 that would print as 0% reads "<0.01%".
 */
export function formatProbability(p: number, digits = 2): string {
  if (!Number.isFinite(p)) return '—';
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  const step = 10 ** -digits;
  const pct = p * 100;
  const rounded = Number(pct.toFixed(digits));
  if (rounded >= 100) return `>${(100 - step).toFixed(digits)}%`;
  if (rounded <= 0) return `<${step.toFixed(digits)}%`;
  return `${pct.toFixed(digits)}%`;
}
