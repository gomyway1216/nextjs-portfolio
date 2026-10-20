/**
 * Candy Shop Medal Maze's exact odds as the machine publishes them: what `analyze()` (engine.ts) works out for the
 * three hands (perfect timing, the everyday player and blind flicks), gate by gate down to the pins, and for leaving
 * the machine to flick blind from each gate on, written out here once.
 *
 * The page shows these, so that opening it never works them out again: the reckoning multiplies its way down the
 * maze eight times over in fractions of BigInts as the page wakes up, and it always comes to the same fractions.
 * `tests/unit/components/game/CoinMaze/published.test.tsx` works them out afresh and checks that every figure here is
 * exactly what the reckoning gives; a change to a gate, a window, a pocket or a pay fails it until this is written out
 * again (the test prints what to write). The Odds tab's table of the five kinds of gate still works each one out as it
 * is drawn: fifteen fractions, about a tenth of a millisecond.
 */

import type { Fraction, MazeOdds } from './engine';

/** A fraction in lowest terms, written as its two whole numbers (the site's TypeScript targets a version before BigInt literals). */
const q = (num: string, den: string): Fraction => ({ num: BigInt(num), den: BigInt(den) });

/** The maze's exact odds (`analyze()`). */
export const PUBLISHED_MAZE_ODDS: Readonly<MazeOdds> = {
  perfect: {
    back: q('121275', '131072'),
    stages: [q('15', '16'), q('15', '16'), q('7', '8'), q('7', '8')],
    reach: q('11025', '16384'),
    win: q('33075', '131072'),
    big: q('11025', '131072'),
  },
  typical: {
    back: q('50873163', '67108864'),
    stages: [q('59', '64'), q('29', '32'), q('53', '64'), q('51', '64')],
    reach: q('4624833', '8388608'),
    win: q('13874499', '67108864'),
    big: q('4624833', '67108864'),
  },
  blind: {
    back: q('3333275', '67108864'),
    stages: [q('17', '32'), q('31', '64'), q('25', '64'), q('23', '64')],
    reach: q('303025', '8388608'),
    win: q('909075', '67108864'),
    big: q('303025', '67108864'),
  },
  // Perfect timing at the gates before each, blind flicks from it on: from the first gate (all blind) to none (all perfect).
  skipAt: [q('3333275', '67108864'), q('2941125', '33554432'), q('1423125', '8388608'), q('398475', '1048576'), q('121275', '131072')],
};
