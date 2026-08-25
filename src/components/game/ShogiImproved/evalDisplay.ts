/**
 * Pure helpers for the shogi 形勢バー (eval bar) and its numeric label.
 *
 * Everything here is a pure function of a SENTE-perspective centipawn score so
 * the sign/scale conversions can be unit-tested without rendering the game.
 *
 * Perspective contract (the whole reason this file exists):
 * - The worker answers with `scoreCp` already converted to SENTE's perspective
 *   (`toSenteCp()` in shogi-ai.worker.ts negates the negamax root score when
 *   GOTE is to move). Positive = the human (先手) is better, negative = the AI
 *   (後手) is better. Nothing in this module may flip that again.
 */

/**
 * Sigmoid scale for cp -> win probability.
 *
 * 600 is the NNUE's own k_sigmoid (`NNUE_SCALE_K` in wasmEngine.ts): the
 * evaluator is trained so that `sigmoid(cp / 600)` IS its estimated win rate,
 * so the bar shows the engine's calibrated probability rather than a made-up
 * rescaling of material.
 */
export const EVAL_WIN_RATE_K = 600;

/**
 * |cp| at or above this reads as a forced win instead of a number. The mate
 * solver answers with ±30000 and a mate found by the WASM search comes back far
 * larger still (its internal S_MATE is 9e7), so one threshold covers both.
 */
export const MATE_DISPLAY_CP = 29_000;

/**
 * Non-mate evals never paint a 0%/100% bar: a huge-but-not-forced score is a
 * different statement from "this is mate", and the losing side keeps a visible
 * sliver. Mate scores intentionally bypass this and paint the full bar.
 */
const NON_MATE_BAR_CLAMP_PERCENT = 2;

/** True when the score means "forced mate" rather than a positional value. */
export function isMateDisplayScore(scoreCp: number): boolean {
  return Math.abs(scoreCp) >= MATE_DISPLAY_CP;
}

/**
 * Map a SENTE-perspective centipawn score to Sente's win probability (0..1).
 * Positive cp -> above 0.5. Kept as the single definition of the mapping so the
 * bar, its aria-label and any future readout can never drift apart.
 */
export function cpToSenteWinRate(scoreCp: number): number {
  return 1 / (1 + Math.exp(-scoreCp / EVAL_WIN_RATE_K));
}

/**
 * Width of the bar's 先手 (dark) segment, in percent of the track.
 * Mate scores paint 0/100; everything else is clamped so both sides stay
 * visible. Rounded to one decimal to keep the inline style stable.
 */
export function senteBarPercent(scoreCp: number): number {
  if (isMateDisplayScore(scoreCp)) return scoreCp > 0 ? 100 : 0;
  const raw = cpToSenteWinRate(scoreCp) * 100;
  const clamped = Math.min(100 - NON_MATE_BAR_CLAMP_PERCENT, Math.max(NON_MATE_BAR_CLAMP_PERCENT, raw));
  return Math.round(clamped * 10) / 10;
}

/** Sente's win rate as a whole percentage, for labels ("先手 62%"). */
export function senteWinRatePercent(scoreCp: number): number {
  if (isMateDisplayScore(scoreCp)) return scoreCp > 0 ? 100 : 0;
  return Math.round(cpToSenteWinRate(scoreCp) * 100);
}

/**
 * The numeric readout next to the bar.
 * `stale` marks a score that belongs to an earlier position (the current AI
 * turn has not produced one yet — book reply, or a search still running), so
 * the bar can keep its last honest value instead of snapping to "even".
 */
export function formatEvalValue(
  scoreCp: number,
  depth?: number,
  stale = false,
): string {
  const suffix = stale ? '（前の局面）' : '';
  if (isMateDisplayScore(scoreCp)) {
    return `${scoreCp > 0 ? '先手勝勢（詰み）' : '後手勝勢（詰み）'}${suffix}`;
  }
  const sign = scoreCp >= 0 ? '+' : '';
  const depthText = !stale && depth ? `（深さ${depth}）` : '';
  return `評価値 ${sign}${scoreCp}${depthText}${suffix}`;
}

/** Screen-reader description of the bar for a known score. */
export function formatEvalAriaLabel(scoreCp: number, stale = false): string {
  const prefix = stale ? '形勢（前の局面）' : '形勢';
  if (isMateDisplayScore(scoreCp)) {
    return `${prefix}: ${scoreCp > 0 ? '先手の勝ち' : '後手の勝ち'}`;
  }
  return `${prefix}: 先手勝率 ${senteWinRatePercent(scoreCp)}%`;
}

/**
 * Elapsed AI think time for the status strip ("2.6秒").
 * Kept here so the completed-think readout and the live counter format the
 * same way.
 */
export function formatThinkElapsedMs(elapsedMs: number): string {
  return `${(Math.max(0, elapsedMs) / 1000).toFixed(1)}秒`;
}
