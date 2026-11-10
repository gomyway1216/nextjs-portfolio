/**
 * How often the counter has stopped on each outcome while this page watched, counted from what the machine says a
 * spin came to (engine.ts `paid` and `jackpot`). For show only: nothing reads it back, and it is never written down.
 */

import type { MachineEvent } from './engine';
import { OUTCOME_IDS, chanceOf, type OutcomeId } from './lottery';

export type Tally = Readonly<Record<OutcomeId, number>>;

export const EMPTY_TALLY: Tally = { jackpot: 0, triple: 0, sevens: 0, seven: 0, miss: 0 };

/** The outcome a spin ended on, when the event is the end of one. */
export function endedOn(event: MachineEvent): OutcomeId | null {
  if (event.type === 'jackpot') return 'jackpot';
  if (event.type === 'paid') return OUTCOME_IDS[event.outcome] ?? null;
  return null;
}

/** The tally after an event: one more of its outcome when a spin ended, the same tally otherwise. */
export function counted(tally: Tally, event: MachineEvent): Tally {
  const id = endedOn(event);
  return id === null ? tally : { ...tally, [id]: tally[id] + 1 };
}

export const tallyTotal = (tally: Tally): number => OUTCOME_IDS.reduce((sum, id) => sum + tally[id], 0);

export interface TallyRow {
  id: OutcomeId;
  count: number;
  /** Its part of the spins counted, or null before any. */
  share: number | null;
  /** Its chance on any one spin (lottery.ts `WEIGHTS`). */
  chance: number;
}

/** A row for each outcome, in the pay table's order. */
export function tallyRows(tally: Tally): TallyRow[] {
  const total = tallyTotal(tally);
  return OUTCOME_IDS.map((id) => ({ id, count: tally[id], share: total > 0 ? tally[id] / total : null, chance: chanceOf(id) }));
}

/** The least share two decimals of a percent can show. */
export const LEAST_SHARE = 0.0001;

/** Whether a share is of something, yet would be written as 0.00%: it is written as under the least (<0.01%) instead. */
export const tooSmallToShow = (row: Pick<TallyRow, 'count' | 'share'>): boolean => row.count > 0 && row.share !== null && row.share < LEAST_SHARE / 2;
