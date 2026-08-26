/**
 * Riichi Mahjong — the M7 EV tables, and the push/fold comparison built on
 * them.
 *
 * `heuristicAI.ts` v1 decides whether to push or fold with three thresholds
 * (`FOLD_MIN_SHANTEN`, `FOLD_CHEAP_HAN`, `FOLD_BAD_WAIT_TILES`). This module
 * is the v2 replacement §M7 of the development plan asks for: estimate what a
 * push is *worth* and what it *costs*, and compare the two.
 *
 *     push when   P(win) × E[win value]
 *               > E[dangerous discards left] × P(deal in) × E[deal-in cost]
 *
 * Every one of those four factors is a frequency measured from the AI's own
 * play. Nothing here is a guess dressed as a table.
 *
 * ## Provenance
 *
 * All tables were estimated from **11,179 hands / 528,124 discard decisions**
 * of `medium`-policy self play — 2,000 independent tonpuu games, seed `99` —
 * collected with
 *
 *     node -r tsx/cjs scripts/mahjong-ai-match.ts --a=medium --sets=500 \
 *       --seed=99 --ev-log=docs/data/mahjong-ev-tables-v1-source.json
 *
 * The raw counts are committed at `docs/data/mahjong-ev-tables-v1-source.json`,
 * so every number below can be re-derived. Seed `99` is deliberately disjoint
 * from the seeds the R1 A/B experiment plays (`20260826#0…`), so the tables are
 * not fitted on the hands they are judged on.
 *
 * ## Smoothing
 *
 * Three rules, applied in this order, and nothing else:
 *
 * 1. A cell with fewer than 30 observations inherits the cell above it (the
 *    same shanten one turn earlier).
 * 2. Win probability is forced monotone — non-increasing in turn and
 *    non-increasing in shanten — which every well-populated cell already was.
 * 3. Deal-in probability by danger and win value by han are pooled with
 *    pool-adjacent-violators until each group holds enough observations
 *    (300 discards / 100 wins) and the sequence is monotone non-decreasing.
 *    That is what flattens the top danger bands, which hold only 204 discards
 *    between them, and the han ≥ 6 tail, which holds 396 wins.
 *
 * ## Known biases (read before trusting a number)
 *
 * The tables were collected from a policy that already folds — so
 * {@link DEAL_IN_PROBABILITY_BY_DANGER} is conditioned on the tiles `medium`
 * was willing to throw, and {@link BASELINE_DEAL_IN_PROBABILITY} averages over
 * a great many deliberately safe discards. Both understate what a seat that
 * pushes to the end actually faces. They are the honest description of the
 * data that exists; removing the bias needs a push/fold label in the log,
 * which is an R2 item.
 *
 * Like the rest of `engine/` and `ai/`, this module has no React or DOM
 * dependency and never calls `Math.random`.
 */

import type { ThreatInfo } from './safety';

/** Rows of {@link WIN_PROBABILITY_BY_TURN_SHANTEN}: own discards made so far. */
export const EV_TURN_BUCKETS = 18;
/** Columns of {@link WIN_PROBABILITY_BY_TURN_SHANTEN}: shanten after discard. */
export const EV_SHANTEN_BUCKETS = 7;
/** Bands of {@link DEAL_IN_PROBABILITY_BY_DANGER}. */
export const EV_DANGER_BUCKETS = 13;
/** Buckets of {@link WIN_VALUE_BY_HAN}. */
export const EV_HAN_BUCKETS = 14;

/** How the tables were produced. Quoted in the strengthening log and the plan. */
export const EV_TABLE_PROVENANCE = {
  source: 'docs/data/mahjong-ev-tables-v1-source.json',
  policy: 'medium',
  seed: '99',
  games: 2000,
  hands: 11179,
  discards: 528124,
  length: 'tonpuu',
} as const;

/**
 * `P(this seat wins the hand)` by `[own discards so far][shanten after the
 * discard]`.
 *
 * Read a row and the shape of mahjong falls out of it: a tenpai hand at turn 0
 * wins 68% of the time and at turn 17 wins 5%, while a 3-shanten hand at turn 8
 * wins 1%. Column 0 is tenpai; column 6 is 6-or-more shanten.
 */
export const WIN_PROBABILITY_BY_TURN_SHANTEN: readonly (readonly number[])[] = [
  [0.6829, 0.4622, 0.3201, 0.2233, 0.1518, 0.0914, 0.0159],
  [0.657, 0.4414, 0.286, 0.1852, 0.114, 0.0659, 0.0159],
  [0.657, 0.4085, 0.2444, 0.1438, 0.0881, 0.0459, 0.0159],
  [0.6233, 0.3736, 0.2053, 0.1092, 0.0513, 0.0211, 0.0159],
  [0.6058, 0.3307, 0.1686, 0.0747, 0.0349, 0, 0],
  [0.5745, 0.2949, 0.1355, 0.0463, 0.0175, 0, 0],
  [0.5483, 0.2511, 0.1078, 0.0304, 0.0043, 0, 0],
  [0.5204, 0.2149, 0.0835, 0.0192, 0.0031, 0, 0],
  [0.4866, 0.1827, 0.0648, 0.0114, 0, 0, 0],
  [0.4623, 0.1521, 0.0463, 0.0084, 0, 0, 0],
  [0.4278, 0.1263, 0.0311, 0.0047, 0, 0, 0],
  [0.3971, 0.1022, 0.0232, 0.0025, 0, 0, 0],
  [0.3641, 0.0772, 0.0111, 0.0021, 0, 0, 0],
  [0.3175, 0.0597, 0.0074, 0.0006, 0, 0, 0],
  [0.2737, 0.0361, 0.0039, 0, 0, 0, 0],
  [0.2145, 0.0178, 0.0013, 0, 0, 0, 0],
  [0.1353, 0.0045, 0, 0, 0, 0, 0],
  [0.0498, 0.0007, 0, 0, 0, 0, 0],
];

/**
 * `P(this discard is ronned)` by danger band, where the band is
 * `floor(weightedDanger)` from `safety.ts` — band 0 is a genbutsu or
 * near-genbutsu tile, band 9+ is a live no-suji middle tile against a riichi.
 *
 * Only discards made while at least one threat was live are counted; 174,366
 * of the 528,124 logged discards qualify, and 5,469 of them were ronned.
 * A genbutsu costs 0.13%, a live no-suji middle tile costs 17%: a factor of
 * 130, which is the entire reason the danger read exists.
 */
export const DEAL_IN_PROBABILITY_BY_DANGER: readonly number[] = [
  0.0013, 0.0125, 0.0325, 0.0531, 0.0591, 0.076, 0.1153, 0.1444, 0.1444, 0.1695, 0.1695,
  0.1695, 0.1695,
];

/**
 * Mean number of **further** discards the seat still makes in the hand, by the
 * turn it is on. This is the horizon a push is committing to: pushing at turn
 * 3 means roughly eight more discards, pushing at turn 14 means under two.
 */
export const REMAINING_DISCARDS_BY_TURN: readonly number[] = [
  10.9, 9.97, 8.98, 8.01, 7.09, 6.26, 5.51, 4.86, 4.3, 3.8, 3.39, 3.02, 2.64, 2.24, 1.79,
  1.25, 0.58, 0.12,
];

/**
 * `E[points won | the hand is won]` by the `estimateHan` value the policy read
 * at the decision. Honba and riichi sticks are excluded — this is the value of
 * the hand itself.
 *
 * Han 6 and above are pooled (396 wins between them) at the mean of the group.
 */
export const WIN_VALUE_BY_HAN: readonly number[] = [
  1483, 3801, 5623, 7942, 10301, 12298, 14666, 14666, 14666, 14666, 14666, 14666, 14666,
  14666,
];

/**
 * `E[points paid | dealing in]`, by the strongest live threat at the moment of
 * the discard. Riichi hands cost 6,000 and an open yakuhai hand costs 3,291 —
 * folding is worth roughly twice as much against a riichi as against a cheap
 * open hand, which the v1 threshold rule had no way to express.
 */
export const DEAL_IN_COST_BY_THREAT: Readonly<Record<string, number>> = {
  riichi: 6000,
  melds: 3799,
  yakuhai: 3291,
  flush: 3265,
};

/** Fallback cost when the threat reason is not in the table: all deal-ins. */
export const DEFAULT_DEAL_IN_COST = 5557;

/**
 * Per-discard deal-in probability over every discard made with a threat live
 * (5,469 / 174,366).
 *
 * It stands in for the *future* discards a push commits to, whose danger
 * cannot be known now. Only the tile being thrown this turn gets its own band;
 * everything after it is charged at this average. Charging the whole horizon at
 * the current tile's danger was the first thing tried and it folded almost
 * every tenpai hand, which is exactly the failure mode of assuming the worst
 * tile in hand will be repeated ten times.
 */
export const BASELINE_DEAL_IN_PROBABILITY = 0.03137;

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

function clampIndex(value: number, size: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(size - 1, Math.floor(value));
}

/** `P(win)` for a hand this many discards in and this far from tenpai. */
export function winProbability(turn: number, handShanten: number): number {
  if (handShanten < 0) return 1;
  const row = WIN_PROBABILITY_BY_TURN_SHANTEN[clampIndex(turn, EV_TURN_BUCKETS)];
  return row[clampIndex(handShanten, EV_SHANTEN_BUCKETS)];
}

/** `P(ron)` for a tile at this weighted danger. */
export function dealInProbability(danger: number): number {
  return DEAL_IN_PROBABILITY_BY_DANGER[clampIndex(danger, EV_DANGER_BUCKETS)];
}

/** Discards still to come after this one. */
export function remainingDiscards(turn: number): number {
  return REMAINING_DISCARDS_BY_TURN[clampIndex(turn, EV_TURN_BUCKETS)];
}

/** `E[points]` a win of this estimated han is worth. */
export function expectedWinValue(estimatedHan: number): number {
  return WIN_VALUE_BY_HAN[clampIndex(estimatedHan, EV_HAN_BUCKETS)];
}

/**
 * `E[points]` a deal-in costs against these threats: the most expensive of
 * them, since one deal-in is what actually happens and the biggest hand is the
 * one worth being afraid of.
 */
export function expectedDealInCost(threats: readonly ThreatInfo[]): number {
  let worst = 0;
  for (const threat of threats) {
    worst = Math.max(worst, DEAL_IN_COST_BY_THREAT[threat.reason] ?? DEFAULT_DEAL_IN_COST);
  }
  return worst === 0 ? DEFAULT_DEAL_IN_COST : worst;
}

// ---------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------

export interface PushInputs {
  /** Discards this seat has already made. */
  turn: number;
  /** Shanten the hand is left at by the discard under consideration. */
  handShanten: number;
  /** `estimateHan` of the hand as it stands. */
  estimatedHan: number;
  /** `weightedDanger` of the tile the push would throw. */
  danger: number;
  threats: readonly ThreatInfo[];
}

export interface PushDecision {
  /** `P(win) × E[win value]`, in points. */
  pushValue: number;
  /** `P(deal in) × E[cost]` over the remaining horizon, in points. */
  foldRisk: number;
  push: boolean;
}

/**
 * The EV comparison itself.
 *
 * `foldRisk` charges this turn's tile at its own danger band and every later
 * discard of the hand at {@link BASELINE_DEAL_IN_PROBABILITY}, because the
 * tiles a future turn will offer are not knowable now. Folding is modelled as
 * worth zero: a folded hand neither wins nor deals in, which is close enough
 * to true for a seat with genbutsu to spare and is the same simplification the
 * v1 threshold rule made implicitly.
 *
 * Ties push. The threshold rule pushed by default and the point of R1 is to
 * measure one change, not two.
 */
export function evaluatePush(inputs: PushInputs): PushDecision {
  const pushValue =
    winProbability(inputs.turn, inputs.handShanten) *
    expectedWinValue(inputs.estimatedHan);

  // `remainingDiscards` already excludes the discard being decided (the EV log
  // records "discards this seat still made in the hand *after* this one"), so
  // there is nothing to subtract: this turn's tile is charged at its own band
  // and all `later` discards at the baseline.
  const later = Math.max(0, remainingDiscards(inputs.turn));
  const exposure = dealInProbability(inputs.danger) + later * BASELINE_DEAL_IN_PROBABILITY;
  const foldRisk = exposure * expectedDealInCost(inputs.threats);

  return { pushValue, foldRisk, push: pushValue >= foldRisk };
}
