/**
 * The hands played this session, each with how its hold compares with the exact best play (analysis.ts).
 */

import { analyzeHand } from './analysis';
import type { HandRank, PayTable, PayTableId } from './engine';

/** How many finished hands the list keeps. */
export const HISTORY_LIMIT = 30;
/** Holds within this of the best expectation count as the best play. */
export const BEST_EPS = 1e-9;

export interface Verdict {
  /** The best hold of the dealt hand, as a mask over its positions. */
  bestMask: number;
  /** Expected payout per medal bet that the hold gave up; zero for a best play. */
  lost: number;
  best: boolean;
}

/** How the hold `mask` of a dealt hand compares with its best hold under `pays`. Reads the analysis tables. */
export function judgeHold(hand: readonly number[], mask: number, pays: PayTable): Verdict | null {
  const values = analyzeHand(hand, pays);
  const mine = values.find((h) => h.mask === mask);
  if (!mine) return null;
  const lost = values[0].ev - mine.ev;
  const best = lost < BEST_EPS;
  return { bestMask: best ? mask : values[0].mask, lost: best ? 0 : lost, best };
}

export interface HandRecord {
  /** Which hand of the session it was, from 1. */
  no: number;
  /** The five cards dealt, in screen order. */
  dealt: number[];
  /** The cards held, as a mask over `dealt`. */
  held: number;
  payId: PayTableId;
  coins: number;
  /** The pay table as it applied to the bet: what the hold is judged under. */
  pays: PayTable;
  rank: HandRank;
  /** Medals won at the draw (before any double-up). */
  won: number;
  /** Null until the analysis tables exist to judge the hold. */
  verdict: Verdict | null;
}

/** The list with `record` put first, cut to the newest `limit`. */
export const addRecord = (log: readonly HandRecord[], record: HandRecord, limit = HISTORY_LIMIT): HandRecord[] => [record, ...log].slice(0, limit);

/** Judges the hands that were finished before the tables were ready. Call only once they are. */
export const judgePending = (log: readonly HandRecord[]): HandRecord[] =>
  log.map((r) => (r.verdict ? r : { ...r, verdict: judgeHold(r.dealt, r.held, r.pays) }));

/** The hands whose hold was judged and was not the best play. */
export const mistakesOf = (log: readonly HandRecord[]): HandRecord[] => log.filter((r) => r.verdict !== null && !r.verdict.best);

/** The cards of `hand` at the positions in `mask`, in screen order. */
export const cardsAt = (hand: readonly number[], mask: number): number[] => hand.filter((_, i) => (mask & (1 << i)) !== 0);
