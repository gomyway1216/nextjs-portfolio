/**
 * Secretary Problem (a.k.a. Optimal Stopping / 37% rule).
 *
 * You interview n candidates in random order. After each interview you must
 * either accept (and stop) or reject (forever — you can't go back). Goal:
 * maximise the probability of picking the **single best** candidate.
 *
 * Counter-intuitive optimum:
 *   - Reject (and just observe the best score so far) for the first n/e ≈ 37% of candidates.
 *   - After that, accept the first candidate that beats every previous one.
 *   - As n → ∞ the success probability → 1/e ≈ 36.79%.
 *
 * Engine simulates with relative ranks: each candidate's "score" is just a
 * unique permutation rank 1..n; the best is the one with rank n. The decision
 * rule depends only on whether the current candidate is the best-seen-so-far,
 * which is rank-equivalent — so we don't need actual scores.
 */

export const SUGGESTED_R_RATIO = 1 / Math.E; // ≈ 0.3679

/** Random permutation of 1..n (each value's rank is unique). */
export function generateCandidates(n: number, rng: () => number = Math.random): number[] {
  const arr = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Run one stop-after-r-skips trial. Returns { picked, isBest, totalN } where
 * picked is the value selected (or null if we exhausted everyone without
 * finding anything that beat the skipped-phase best — in which case the last
 * candidate is conventionally taken, matching the rule that "you must hire
 * someone"; we also report picked=null distinctly so the caller can see
 * both interpretations).
 *
 * If `picked` is null AND `forcedLast` is true, we conceptually accepted the
 * very last candidate.
 */
export interface TrialResult {
  picked: number | null;
  pickedIndex: number | null;
  isBest: boolean;
  bestValue: number;
  forcedLast: boolean;
}

export function runTrial(
  candidates: number[],
  r: number,
): TrialResult {
  const n = candidates.length;
  const rr = Math.max(0, Math.min(n, Math.floor(r)));
  const bestValue = Math.max(...candidates);

  let skipPhaseMax = -Infinity;
  for (let i = 0; i < rr; i++) {
    if (candidates[i] > skipPhaseMax) skipPhaseMax = candidates[i];
  }

  for (let i = rr; i < n; i++) {
    if (candidates[i] > skipPhaseMax) {
      return {
        picked: candidates[i],
        pickedIndex: i,
        isBest: candidates[i] === bestValue,
        bestValue,
        forcedLast: false,
      };
    }
  }
  // Nobody beat the skip-phase best (the skipped best WAS the global best, or
  // the global best was inside the skip phase). Convention: hire the last one.
  return {
    picked: candidates[n - 1],
    pickedIndex: n - 1,
    isBest: candidates[n - 1] === bestValue,
    bestValue,
    forcedLast: true,
  };
}

// ---------- Simulation ----------

export interface RatePoint {
  /** Number of candidates skipped (r). */
  r: number;
  /** Fraction skipped (r/n). */
  ratio: number;
  /** Empirical P(picked the best) for this r. */
  successRate: number;
  /** Theoretical asymptotic success rate for this ratio: -ratio * ln(ratio). */
  theoretical: number;
}

export interface SweepSummary {
  n: number;
  trialsPerR: number;
  points: RatePoint[];
  /** r value with the highest empirical success rate (the empirical optimum). */
  bestR: number;
  bestRate: number;
  /** Theoretical optimum: round(n/e). */
  theoreticalBestR: number;
  theoreticalBestRate: number; // 1/e for large n
}

export interface SimOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Theoretical success probability when we skip first r out of n candidates
 * (Lindley / Cayley formula):
 *   P(r, n) = (r/n) * Σ_{i=r+1..n} 1/(i-1)
 *
 * As n → ∞ with r/n → x this becomes -x * ln(x).
 */
export function theoreticalRate(r: number, n: number): number {
  if (r === 0) return 1 / n; // pick first
  if (r >= n) return 1 / n; // forced last
  let sum = 0;
  for (let i = r + 1; i <= n; i++) sum += 1 / (i - 1);
  return (r / n) * sum;
}

/**
 * O(n) per trial: from a single permutation, evaluate strategy success for
 * every r ∈ [0, n) in one pass. Key observation: strategy-r picks the first
 * left-to-right maximum (LRM) at or after position r — because positions
 * before the first LRM after r are all ≤ A[r-1] ≤ A[i-1] for LRMs i. So:
 *
 *   1. Compute LRM bitmap once (single pass, O(n)).
 *   2. Reverse-scan to compute nextLrm[r] = first LRM index ≥ r (or -1).
 *   3. For each r: pick = nextLrm[r] if exists, else n-1 (forced last).
 *      Success iff cands[pick] is the global max.
 *
 * Replaces the previous O(n² × trialsPerR) loop with O(n × trialsPerR),
 * cutting the max-settings runtime by ~200×.
 */
export async function runSecretarySweepAsync(
  n: number,
  trialsPerR: number,
  options: SimOptions = {},
  rng: () => number = Math.random,
): Promise<SweepSummary | null> {
  if (!Number.isInteger(n) || n < 2) {
    throw new Error('runSecretarySweepAsync: n must be an integer >= 2');
  }
  if (!Number.isInteger(trialsPerR) || trialsPerR <= 0) {
    throw new Error('runSecretarySweepAsync: trialsPerR must be a positive integer');
  }

  const successesByR = new Int32Array(n);
  const nextLrm = new Int32Array(n);
  // Reusable buffer for the candidates array — avoids one allocation per trial.
  const cands = new Array<number>(n);

  // Yield every ~chunk trials to keep the UI responsive on huge sweeps.
  const chunkTrials = Math.max(50, Math.floor(50000 / Math.max(1, n)));

  for (let trialStart = 0; trialStart < trialsPerR; trialStart += chunkTrials) {
    const trialEnd = Math.min(trialStart + chunkTrials, trialsPerR);
    for (let t = trialStart; t < trialEnd; t++) {
      // Fisher-Yates in place.
      for (let i = 0; i < n; i++) cands[i] = i + 1;
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = cands[i];
        cands[i] = cands[j];
        cands[j] = tmp;
      }
      // Best position (the value n is always the max).
      let bestPos = 0;
      for (let i = 0; i < n; i++) if (cands[i] === n) { bestPos = i; break; }

      // Compute nextLrm via single reverse scan tracking suffix LRM index.
      let runningMax = -Infinity;
      // First pass: mark LRMs in nextLrm temporarily (1 if LRM, 0 if not).
      for (let i = 0; i < n; i++) {
        if (cands[i] > runningMax) { runningMax = cands[i]; nextLrm[i] = 1; }
        else nextLrm[i] = 0;
      }
      // Second pass: convert to "first LRM ≥ i" by reverse scan.
      let nextL = -1;
      for (let i = n - 1; i >= 0; i--) {
        if (nextLrm[i] === 1) nextL = i;
        nextLrm[i] = nextL;
      }

      for (let r = 0; r < n; r++) {
        const pick = nextLrm[r] !== -1 ? nextLrm[r] : n - 1;
        if (pick === bestPos) successesByR[r]++;
      }
    }
    options.onProgress?.(trialEnd, trialsPerR);
    if (options.signal?.aborted) return null;
    if (trialEnd < trialsPerR) await new Promise<void>((res) => setTimeout(res, 0));
  }

  const points: RatePoint[] = new Array(n);
  for (let r = 0; r < n; r++) {
    points[r] = {
      r,
      ratio: r / n,
      successRate: successesByR[r] / trialsPerR,
      theoretical: theoreticalRate(r, n),
    };
  }

  let bestR = 0;
  let bestRate = points[0].successRate;
  for (const p of points) {
    if (p.successRate > bestRate) { bestRate = p.successRate; bestR = p.r; }
  }
  const theoreticalBestR = Math.round(n / Math.E);
  const theoreticalBestRate = theoreticalRate(theoreticalBestR, n);

  return { n, trialsPerR, points, bestR, bestRate, theoreticalBestR, theoreticalBestRate };
}
