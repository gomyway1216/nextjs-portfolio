/**
 * What a visit's spins add up to, number by number, and what one spin's medals
 * did: the arithmetic behind the spin record beside the machine (VisitLog.tsx).
 *
 * Nothing here draws a spin or moves a medal, and nothing here says anything
 * about the next spin: every spin is drawn afresh (engine.ts).
 */

import { SPOTS, analyzeWheel, valueOf, type Multiplier, type Spot } from './engine';
import type { PlacedBet } from './medalTable';

/** A spin that has ended, as the record keeps it. */
export interface EndedSpin {
  /** The number that paid: the stop's, or the second chance's after BONUS. */
  spot: Spot;
  /** 1, or the lamp's multiplier after BONUS. */
  multiplier: 1 | Multiplier;
  bets: readonly PlacedBet[];
}

/** One number over a visit. */
export interface SpotTally {
  /** The spins that ended on it: it was the number that paid, medals on it or not. */
  cameUp: number;
  /** The medals put on it. */
  placed: number;
  /** The medals it brought back, the medals on it included. */
  back: number;
}

export interface VisitTally {
  spins: number;
  spots: Readonly<Record<Spot, SpotTally>>;
}

export const emptyTally = (): VisitTally => ({
  spins: 0,
  spots: Object.fromEntries(SPOTS.map((spot) => [spot, { cameUp: 0, placed: 0, back: 0 }])) as Record<Spot, SpotTally>,
});

/** One number's medals on one spin. */
export interface BetLine {
  spot: Spot;
  /** The medals on it (0 when none). */
  amount: number;
  /** The medals it brought back: its medals times its number times the multiplier when the spin ended on it, 0 otherwise. */
  back: number;
  /** Whether the spin ended on it. */
  paying: boolean;
}

/** A spin's medals, number by number in the board's order: all seven numbers, with or without medals. */
export function linesOf(spin: EndedSpin): BetLine[] {
  return SPOTS.map((spot) => {
    const amount = spin.bets.reduce((sum, bet) => (bet.spot === spot ? sum + bet.amount : sum), 0);
    const paying = spot === spin.spot;
    return { spot, amount, back: paying ? amount * spot * spin.multiplier : 0, paying };
  });
}

/** The tally with one more spin in it. The tally given is left as it was. */
export function tallyWith(tally: VisitTally, spin: EndedSpin): VisitTally {
  const spots = { ...tally.spots };
  for (const line of linesOf(spin)) {
    const before = spots[line.spot];
    spots[line.spot] = { cameUp: before.cameUp + (line.paying ? 1 : 0), placed: before.placed + line.amount, back: before.back + line.back };
  }
  return { spins: tally.spins + 1, spots };
}

/** Each number's chance to be the number a spin ends on: the stop, or the second chance after BONUS (the wheel's exact odds). */
export const END_CHANCE: Readonly<Record<Spot, number>> = Object.fromEntries(analyzeWheel().spots.map((odds) => [odds.spot, valueOf(odds.hit)])) as Record<Spot, number>;

/** How many of `spins` spins a number's chance comes to. */
export const expectedOf = (spins: number, spot: Spot): number => spins * END_CHANCE[spot];

/** The decimals an expected count is shown with: one, or two while it is under 0.1, so that a small one is not shown as 0.0. */
export const expectedDigits = (expected: number): number => (expected > 0 && expected < 0.1 ? 2 : 1);
