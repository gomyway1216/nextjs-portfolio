/**
 * Firework Ball Tower's exact odds as the machine publishes them: what `analyze()` (engine.ts) works out over the
 * Markov chain of its five discs, written out here once: the return on every bet, the chance of reaching each disc,
 * of a ball paying anything, of the jackpot, of each way a run can end on each disc, what each disc's pockets bring
 * back, and the chance of every multiple a ball can pay.
 *
 * The page shows these, so that opening it never works them out again. `tests/unit/components/game/BallTower/
 * published.test.tsx` works them out afresh and checks that every figure here is exactly what the reckoning gives; a
 * change to a pocket, a lamp or a bet fails it until this is written out again (the test prints what to write). Only
 * the Odds tab's check by play works anything out, when it is asked to play.
 */

import type { Fraction, TowerOdds } from './engine';

/** A fraction in lowest terms, written as its two whole numbers (the site's TypeScript targets a version before BigInt literals). */
const q = (num: string, den: string): Fraction => ({ num: BigInt(num), den: BigInt(den) });

/** The tower's exact odds (`analyze()`), per medal bet. */
export const PUBLISHED_BALL_TOWER_ODDS: Readonly<TowerOdds> = {
  back: q('9', '10'),
  byBet: [q('9', '10'), q('9', '10'), q('9', '10'), q('9', '10'), q('9', '10')],
  reach: [q('1', '1'), q('1', '3'), q('1', '15'), q('1', '90'), q('1', '540')],
  hit: q('2', '9'),
  jackpot: q('1', '3240'),
  ends: [
    { pay: q('0', '1'), mystery: q('0', '1'), jackpot: q('0', '1'), out: q('2', '3') },
    { pay: q('4', '45'), mystery: q('1', '15'), jackpot: q('0', '1'), out: q('1', '9') },
    { pay: q('2', '45'), mystery: q('1', '90'), jackpot: q('0', '1'), out: q('0', '1') },
    { pay: q('1', '135'), mystery: q('1', '540'), jackpot: q('0', '1'), out: q('0', '1') },
    { pay: q('1', '810'), mystery: q('1', '3240'), jackpot: q('1', '3240'), out: q('0', '1') },
  ],
  backByLevel: [q('0', '1'), q('179', '450'), q('7', '25'), q('5', '54'), q('7', '54')],
  pays: [
    { pays: 1, chance: q('19', '450') },
    { pays: 2, chance: q('13', '225') },
    { pays: 3, chance: q('3', '50') },
    { pays: 5, chance: q('1', '60') },
    { pays: 6, chance: q('11', '400') },
    { pays: 8, chance: q('29', '21600') },
    { pays: 10, chance: q('173', '21600') },
    { pays: 12, chance: q('109', '21600') },
    { pays: 15, chance: q('229', '129600') },
    { pays: 20, chance: q('7', '12960') },
    { pays: 25, chance: q('1', '25920') },
    { pays: 30, chance: q('1', '1080') },
    { pays: 50, chance: q('1', '12960') },
    { pays: 300, chance: q('1', '3240') },
  ],
};
