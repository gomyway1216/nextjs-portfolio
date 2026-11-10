/**
 * Pure, framework-free logic for the Timed Button precision game.
 *
 * Gameplay: a marker sweeps back and forth across a horizontal track. The
 * player taps to "stop" it; the closer the marker is to the centre of the
 * target zone, the higher the score. Timing is measured with performance.now()
 * in the component and mapped to a marker position here, so scoring stays a
 * deterministic pure function that is trivial to unit-test.
 */

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export type HitRating = 'perfect' | 'great' | 'good' | 'miss';

export interface DifficultyTuning {
  /** Full sweep period (marker left -> right -> left) in ms. Lower = faster. */
  periodMs: number;
  /** Half-width of the target zone as a fraction of the track (0..0.5). */
  targetHalfWidth: number;
  /** Number of rounds in a run. */
  rounds: number;
  /** Points multiplier applied to the per-round score. */
  scoreMultiplier: number;
}

export const DIFFICULTY_TUNING: Record<Difficulty, DifficultyTuning> = {
  easy: { periodMs: 2600, targetHalfWidth: 0.12, rounds: 5, scoreMultiplier: 1 },
  medium: { periodMs: 2000, targetHalfWidth: 0.09, rounds: 5, scoreMultiplier: 1.4 },
  hard: { periodMs: 1500, targetHalfWidth: 0.065, rounds: 6, scoreMultiplier: 1.9 },
  expert: { periodMs: 1150, targetHalfWidth: 0.05, rounds: 6, scoreMultiplier: 2.5 },
  master: { periodMs: 850, targetHalfWidth: 0.038, rounds: 7, scoreMultiplier: 3.2 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

/** Max points obtainable on a single round before the difficulty multiplier. */
export const BASE_ROUND_SCORE = 1000;

/**
 * Position of the marker (0..1 across the track) for a given elapsed time.
 * Uses a triangle wave so the marker sweeps right, then back left, forever.
 * Deterministic: same elapsedMs + period always yields the same position.
 */
export const markerPosition = (elapsedMs: number, periodMs: number): number => {
  if (periodMs <= 0) return 0;
  // Normalise into [0, 1) over one full back-and-forth cycle.
  const phase = ((elapsedMs % periodMs) + periodMs) % periodMs / periodMs;
  // Triangle wave: 0 -> 1 over first half, 1 -> 0 over second half.
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
};

/**
 * Precision in [0, 1]: 1 when the marker is dead-centre on the target, 0 when
 * it is a full target-zone-width (or more) away. Linear falloff.
 */
export const precisionFor = (
  markerPos: number,
  targetCenter: number,
  targetHalfWidth: number
): number => {
  if (targetHalfWidth <= 0) return markerPos === targetCenter ? 1 : 0;
  const distance = Math.abs(markerPos - targetCenter);
  const precision = 1 - distance / targetHalfWidth;
  return Math.max(0, Math.min(1, precision));
};

/** Classify a precision value into a rating band. */
export const ratingFor = (precision: number): HitRating => {
  if (precision <= 0) return 'miss';
  if (precision >= 0.9) return 'perfect';
  if (precision >= 0.6) return 'great';
  return 'good';
};

export interface RoundResult {
  precision: number;
  rating: HitRating;
  score: number;
  distance: number;
}

/**
 * Score a single tap. `precision` is squared (eased) so that dead-centre hits
 * are rewarded meaningfully more than merely-inside-the-zone hits, then scaled
 * by BASE_ROUND_SCORE and the difficulty multiplier. A miss scores 0.
 */
export const scoreRound = (
  markerPos: number,
  targetCenter: number,
  tuning: DifficultyTuning
): RoundResult => {
  const precision = precisionFor(markerPos, targetCenter, tuning.targetHalfWidth);
  const rating = ratingFor(precision);
  const eased = precision * precision; // reward centre hits
  const score = Math.round(BASE_ROUND_SCORE * eased * tuning.scoreMultiplier);
  return {
    precision,
    rating,
    score,
    distance: Math.abs(markerPos - targetCenter),
  };
};

/**
 * Pick a target centre that is always fully reachable by the marker (i.e. the
 * whole target zone lies within [0, 1]). Deterministic given `rng`.
 */
export const pickTargetCenter = (
  targetHalfWidth: number,
  rng: () => number = Math.random
): number => {
  const min = targetHalfWidth;
  const max = 1 - targetHalfWidth;
  if (max <= min) return 0.5;
  return min + rng() * (max - min);
};

/** Aggregate a run's rounds into a final tally. */
export interface RunSummary {
  totalScore: number;
  perfects: number;
  greats: number;
  goods: number;
  misses: number;
  bestPrecision: number;
  averagePrecision: number;
}

export const summarizeRun = (results: RoundResult[]): RunSummary => {
  const summary: RunSummary = {
    totalScore: 0,
    perfects: 0,
    greats: 0,
    goods: 0,
    misses: 0,
    bestPrecision: 0,
    averagePrecision: 0,
  };
  if (results.length === 0) return summary;

  let precisionSum = 0;
  for (const r of results) {
    summary.totalScore += r.score;
    precisionSum += r.precision;
    summary.bestPrecision = Math.max(summary.bestPrecision, r.precision);
    switch (r.rating) {
      case 'perfect':
        summary.perfects += 1;
        break;
      case 'great':
        summary.greats += 1;
        break;
      case 'good':
        summary.goods += 1;
        break;
      case 'miss':
        summary.misses += 1;
        break;
    }
  }
  summary.averagePrecision = precisionSum / results.length;
  return summary;
};

// ---- Timing: how early or late a tap was, in milliseconds ----

/** +1 while the marker travels right (first half of the period), -1 while it travels left. */
export const markerDirection = (elapsedMs: number, periodMs: number): 1 | -1 => {
  if (periodMs <= 0) return 1;
  const phase = ((elapsedMs % periodMs) + periodMs) % periodMs / periodMs;
  return phase < 0.5 ? 1 : -1;
};

/**
 * Signed time between a tap and the marker crossing the target centre on the
 * pass it was on: negative = tapped before reaching the centre (early),
 * positive = tapped after passing it (late). Because the marker moves at a
 * constant speed, that crossing is also the one nearest in time to the tap.
 */
export const timingOffsetMs = (elapsedMs: number, targetCenter: number, periodMs: number): number => {
  if (periodMs <= 0) return 0;
  const pos = markerPosition(elapsedMs, periodMs);
  const direction = markerDirection(elapsedMs, periodMs);
  // The marker covers the track twice per period: speed = 2 / periodMs per ms.
  const offset = (direction * (pos - targetCenter) * periodMs) / 2;
  return offset === 0 ? 0 : offset; // never -0
};

/** One finished round: the score plus where and when the marker was stopped. */
export interface RoundRecord extends RoundResult {
  markerPos: number;
  targetCenter: number;
  offsetMs: number;
}

/** Score a tap made `elapsedMs` after the round's marker started sweeping. */
export const recordRound = (
  elapsedMs: number,
  targetCenter: number,
  tuning: DifficultyTuning
): RoundRecord => {
  const markerPos = markerPosition(elapsedMs, tuning.periodMs);
  return {
    ...scoreRound(markerPos, targetCenter, tuning),
    markerPos,
    targetCenter,
    offsetMs: timingOffsetMs(elapsedMs, targetCenter, tuning.periodMs),
  };
};

export type TimingSide = 'early' | 'late' | 'onTime';

/** Which side a tap fell on, at the whole-millisecond resolution it is displayed in. */
export const timingSide = (offsetMs: number): TimingSide => {
  const rounded = Math.round(offsetMs);
  if (rounded < 0) return 'early';
  if (rounded > 0) return 'late';
  return 'onTime';
};

/** A median offset closer to zero than this is reported as no early/late lean. */
export const TENDENCY_THRESHOLD_MS = 10;

export interface TimingSummary {
  taps: number;
  early: number;
  late: number;
  onTime: number;
  /** Median signed offset of all taps (misses included); 0 for an empty run. */
  medianOffsetMs: number;
  tendency: TimingSide;
}

export const summarizeTiming = (offsets: number[]): TimingSummary => {
  const summary: TimingSummary = {
    taps: offsets.length,
    early: 0,
    late: 0,
    onTime: 0,
    medianOffsetMs: 0,
    tendency: 'onTime',
  };
  if (offsets.length === 0) return summary;

  for (const offset of offsets) {
    const side = timingSide(offset);
    if (side === 'early') summary.early += 1;
    else if (side === 'late') summary.late += 1;
    else summary.onTime += 1;
  }

  const sorted = [...offsets].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  summary.medianOffsetMs = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  if (Math.abs(summary.medianOffsetMs) >= TENDENCY_THRESHOLD_MS) {
    summary.tendency = summary.medianOffsetMs < 0 ? 'early' : 'late';
  }
  return summary;
};
