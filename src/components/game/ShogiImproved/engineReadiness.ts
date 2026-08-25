/**
 * Shared facts about "is the AI engine ready to play at full strength yet".
 *
 * This lives in its own module because both sides of the worker boundary need
 * it and neither may import the other's implementation: `shogi-ai.worker.ts`
 * decides which searches actually switch NNUE on, while
 * `shogiAiWorkerClient.ts` (main thread) decides whether an AI turn should wait
 * for the weights before starting a search. Duplicating the difficulty set on
 * the client would let the two drift apart silently — the exact failure mode
 * this gate exists to prevent.
 */

import type { Difficulty } from '../common/types';

/**
 * Difficulties that use the NNUE evaluation. `easy` (250ms) intentionally stays
 * on V3: at ~200ms budgets V3 measured stronger (NNUE 40.9%), and easy is meant
 * to be weak anyway.
 *
 * 2026-07-06: RE-ENABLED for hard/expert/master. The medium-only hotfix
 * (below) was lifted after the cycle-3 weights (run5m-base, 5.24M positions,
 * balance-rate 0.5) fixed the saturation that caused the 2-dan loss:
 *   - The infamous 72nd move: move-value spread 20cp (all moves equal =
 *     saturated, picked a −35281cp blunder) → 532cp (26x), now picks the TRUE
 *     best move; game blunders (>300cp) halved 8→4.
 *   - Direct A/B vs the shipped run1m-base NNUE: 92.2% (29.5/32) at 1000ms.
 *   - vs V3 at 2000ms (the hard budget that was never verified before): 87.5%.
 * Verified directly at 1000ms and 2000ms. expert (4000ms) and master (5000ms)
 * are enabled by extrapolation: throughout cycles 2-3 NNUE's edge only widened
 * with more thinking time (deeper search rewards its move ordering), so a
 * budget >= 2000ms is expected to be at least as favorable — the author's own
 * play is the final check for those.
 *
 * Prior hotfix rationale (2026-07-05, superseded): reduced to medium only after
 * a 2-dan game exposed NNUE saturation at decided positions; the 77.1% A/B was
 * 1000ms-only and hard (2000ms) was an unverified extrapolation.
 */
export const NNUE_DIFFICULTIES: ReadonlySet<Difficulty> = new Set<Difficulty>([
  'medium',
  'hard',
  'expert',
  'master',
]);

export function difficultyUsesNnue(difficulty: Difficulty): boolean {
  return NNUE_DIFFICULTIES.has(difficulty);
}

/**
 * How an AI turn's wait for the NNUE weights ended.
 *
 * - `not-required` — the level does not use NNUE (easy), or the weights already
 *   settled. No wait happened and nothing was shown to the player.
 * - `ready` — the turn waited and the weights arrived. The search that follows
 *   is a full-strength NNUE search.
 * - `timed-out` — the weights did not arrive inside ENGINE_READY_WAIT_MS. The
 *   turn goes ahead on the hand-crafted V3 evaluation (the pre-gate behaviour)
 *   and the page records the fact.
 */
export type ShogiAiEngineReadyOutcome = 'not-required' | 'ready' | 'timed-out';

/**
 * Cap on how long ONE AI turn may wait for the NNUE weights before playing a
 * V3 move anyway.
 *
 * Sizing (production measurements, 2026-08-25): a cold worker has its 94.7MB
 * weights ~11.0s after spawn, and a warm Cache Storage hit takes 38ms. The wait
 * is measured from the moment the AI's turn arrives, and in the worst realistic
 * case (a kifu imported straight into an out-of-book position, so the very first
 * AI turn lands almost at spawn time) essentially the whole 11.0s is still
 * ahead of us. A cap below that would time out precisely in the situation the
 * gate exists for, so 12s = the measured 11.0s plus ~1s of margin.
 *
 * It is not raised further on purpose: past ~12s the link is slow enough that
 * a V3 move now is worth more to the player than an NNUE move much later, and a
 * spinner that outlasts the player's patience is its own bug. Crossing the cap
 * is logged, so a real population of slow links shows up in the activity log
 * instead of being guessed at.
 *
 * With the worker spawned at game start (PR #721) and the opening book covering
 * ~18 plies of real play, this timer should essentially never be reached in
 * ordinary play — see the gate in ShogiImproved.tsx.
 */
export const ENGINE_READY_WAIT_MS = 12_000;
