/**
 * A game's balls, one by one: where each went, what it marked and what it
 * gave. Read off the pockets drawn for the game (engine.ts), for the balls
 * that have landed so far; nothing here draws anything.
 */

import { CHANCE_BALLS, FREE_GIVES, MOST_SHOTS, POCKETS, START, after, isOpen, linesOf, over, type PocketKind } from './engine';

export interface BallOfRecord {
  /** The ball's place in the game, from 1. */
  ball: number;
  /** The pocket it went into, by its place in `POCKETS`. */
  pocket: number;
  kind: PocketKind;
  /** The number it marked on the card; 0 for a ball that marked none. */
  number: number;
  /** The lines this ball finished (more than one, when its number ends several at once). */
  linesMade: number;
  /** The balls it gave on top of the game's own: one from a FREE pocket, four from CHANCE, none otherwise. */
  gave: number;
}

export interface RecordTally {
  shots: number;
  numbers: number;
  outs: number;
  frees: number;
  /** Whether a ball went into CHANCE. */
  chance: boolean;
}

/**
 * The first `shown` balls of a game, as they landed. A ball the machine could
 * not have drawn (a closed pocket, a ball after the game was over) ends the
 * record where it stands: what is listed is always a game as it was played.
 */
export function recordOf(draws: readonly number[], shown: number = draws.length): BallOfRecord[] {
  const record: BallOfRecord[] = [];
  let state = START;
  const upTo = Math.min(draws.length, Math.max(0, shown), MOST_SHOTS);
  for (let i = 0; i < upTo; i++) {
    const pocket = draws[i];
    if (!Number.isInteger(pocket) || over(state) || !isOpen(state, pocket)) break;
    const next = after(state, pocket);
    const { kind, number } = POCKETS[pocket];
    record.push({
      ball: i + 1,
      pocket,
      kind,
      number,
      linesMade: linesOf(next.marks) - linesOf(state.marks),
      gave: kind === 'free' ? FREE_GIVES : kind === 'chance' ? CHANCE_BALLS : 0,
    });
    state = next;
  }
  return record;
}

/** How many of a record's balls went where. */
export function tallyOf(record: readonly BallOfRecord[]): RecordTally {
  const count = (kind: PocketKind) => record.filter((entry) => entry.kind === kind).length;
  return { shots: record.length, numbers: count('number'), outs: count('out'), frees: count('free'), chance: count('chance') > 0 };
}

/** An earlier game chosen from the list, and the game that was on the machine as it was chosen. */
export interface ChosenGame {
  id: string;
  during: string | null;
}

/**
 * The earlier game whose balls the record lists, if any: the one chosen, while
 * the game it was chosen during is still the one on the machine and the list
 * still has it. A new game, or a reset that empties the list, gives the record
 * back to the machine.
 */
export function earlierOf<G extends { id: string }>(chosen: ChosenGame | null, gameId: string | null, recent: readonly G[]): G | null {
  if (!chosen || chosen.during !== gameId) return null;
  return recent.find((entry) => entry.id === chosen.id) ?? null;
}
