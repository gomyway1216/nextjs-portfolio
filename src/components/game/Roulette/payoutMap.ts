/**
 * What the bets on the felt would do on each of the 37 pockets: the medals a
 * pocket wins back (bets on winning spots included) less every medal on the
 * felt. Pure functions over the placed bets, for the panel under the felt.
 */

import { POCKET_COUNT } from './engine';
import { winningsOf, type PlacedBet } from './medalTable';

export interface PayoutMap {
  /** Every medal on the felt. */
  wagered: number;
  /** The net change in medals by pocket number (index 0–36). */
  nets: number[];
  /** Pockets that leave the player with more medals, with as many, and with fewer. */
  ahead: number;
  level: number;
  behind: number;
  /** The highest net and the pockets that give it, ascending. */
  best: number;
  bestNumbers: number[];
  /** The lowest net and the pockets that give it, ascending. */
  worst: number;
  worstNumbers: number[];
  /** The mean of the 37 nets: what a spin of these bets changes on average. */
  average: number;
}

/** The map for a set of bets, or null when no medal is on the felt. */
export function payoutMap(bets: readonly PlacedBet[]): PayoutMap | null {
  const placed = bets.filter(({ amount }) => amount > 0);
  const wagered = placed.reduce((sum, { amount }) => sum + amount, 0);
  if (wagered <= 0) return null;
  const nets = Array.from({ length: POCKET_COUNT }, (_, n) => winningsOf(placed, n) - wagered);
  const best = Math.max(...nets);
  const worst = Math.min(...nets);
  const numbersAt = (net: number) => nets.flatMap((value, n) => (value === net ? [n] : []));
  return {
    wagered,
    nets,
    ahead: nets.filter((net) => net > 0).length,
    level: nets.filter((net) => net === 0).length,
    behind: nets.filter((net) => net < 0).length,
    best,
    bestNumbers: numbersAt(best),
    worst,
    worstNumbers: numbersAt(worst),
    average: nets.reduce((sum, net) => sum + net, 0) / POCKET_COUNT,
  };
}

/** A whole net change with its sign, as short as a cell of the map needs it: +35, −5, ±0. */
export const signedNet = (net: number): string => (net > 0 ? `+${net}` : net < 0 ? `−${-net}` : '±0');

/** A share of the 37 pockets as a percentage with one decimal: 18 → "48.6%". */
export const pocketShare = (pockets: number): string => `${((pockets / POCKET_COUNT) * 100).toFixed(1)}%`;

/** The average net with two decimals and its sign: −0.27. Anything that rounds to nothing is ±0.00. */
export const signedAverage = (average: number): string => {
  const text = Math.abs(average).toFixed(2);
  if (Number(text) === 0) return '±0.00';
  return `${average > 0 ? '+' : '−'}${text}`;
};
