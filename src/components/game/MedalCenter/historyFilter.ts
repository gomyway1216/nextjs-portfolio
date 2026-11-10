/**
 * My Page's history, one machine at a time: which machines the listed entries are of, and what the entries of one of
 * them add up to. Only what the page shows: nothing here is kept, and nothing reads or changes the history.
 */

import type { Entry } from './history';

/** The choice that lists everything. No game has this name (a game's name is never empty). */
export const EVERYTHING = '';

export interface Listed {
  /** A game, `CENTER` or `FLOOR_JACKPOT`: whatever the entries are of. */
  game: string;
  /** How many of the entries are its. */
  count: number;
}

/** What the entries are of, each with how many are its, in the order the entries first come to them. */
export function listedIn(entries: readonly Entry[]): Listed[] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.g, (counts.get(entry.g) ?? 0) + 1);
  return [...counts].map(([game, count]) => ({ game, count }));
}

/** The choice as it stands: everything, once the list no longer holds anything of what was picked. */
export const chosenOf = (picked: string, listed: readonly Listed[]): string => (listed.some(({ game }) => game === picked) ? picked : EVERYTHING);

export interface Tally {
  /** Rounds among the entries. */
  rounds: number;
  /** Visits among them (the Medal Pusher's, and those of a machine that reports its play as it goes). */
  visits: number;
  /** Medals bet in those rounds, or fed in those visits. */
  bet: number;
  /** Medals those rounds and visits gave back. */
  won: number;
}

/**
 * What the rounds and the visits among the entries add up to. Nothing else is counted: a jackpot's medals are its
 * visit's, and a bonus, a refill, a reset and a floor jackpot are not play at a machine.
 */
export function tallyOf(entries: readonly Entry[]): Tally {
  const tally: Tally = { rounds: 0, visits: 0, bet: 0, won: 0 };
  for (const entry of entries) {
    if (entry.k !== 'round' && entry.k !== 'play') continue;
    if (entry.k === 'round') tally.rounds += 1;
    else tally.visits += 1;
    tally.bet += entry.bet;
    tally.won += entry.won;
  }
  return tally;
}
