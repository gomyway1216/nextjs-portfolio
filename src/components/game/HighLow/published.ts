/**
 * The High & Low Ladder's exact odds as the machine publishes them: what `analyzeLadder()` (engine.ts) works out over
 * the 13 × 12 states of the ladder (best play, how its games end, the simple ways of playing beside it), written out
 * here once.
 *
 * The page shows these, so that opening it never works them out again: the reckoning walks the ladder fifteen times
 * in whole numbers (BigInt) as the page wakes up, inside the task that hydrates it, and it always comes to the same
 * fractions. `tests/unit/components/game/HighLow/published.test.tsx` works them out afresh and checks that every figure
 * here is exactly what the reckoning gives; a change to the ladder, the cards or a rule fails it until this is written
 * out again (the test prints what to write). The check by play on the Odds tab still works best play out, when its
 * button is pressed.
 */

import type { Fraction, LadderOdds, Move } from './engine';

/** A fraction, written as its two whole numbers (the site's TypeScript targets a version before BigInt literals). */
const q = (num: string, den: string): Fraction => ({ num: BigInt(num), den: BigInt(den) });

/** Best play at each rung, rank 2 to A: T takes, H guesses HIGH, L guesses LOW. */
const MOVES = [
  'HHHHHHHLLLLLL',
  'HHHTTTTTTTLLL',
  'HHTTTTTTTTTLL',
  'HHTTTTTTTTTLL',
  'HHHTTTTTTTLLL',
  'HHHHTTTTTLLLL',
  'HHHHHTTTLLLLL',
  'HHHHHTTTLLLLL',
  'HHHHHTTTLLLLL',
  'HHHHHTTTLLLLL',
  'HHHHHTTTLLLLL',
  'HHHHHTTTLLLLL',
] as const;
const MOVE_OF: Readonly<Record<string, Move>> = { T: 'take', H: 'high', L: 'low' };

/** The ladder's exact odds (`analyzeLadder()`). */
export const PUBLISHED_LADDER: Readonly<LadderOdds> = {
  best: q('272481482437688', '302875106592253'),
  moves: MOVES.map((row) => [...row].map((sign) => MOVE_OF[sign])),
  bestEndings: {
    lose: q('103162484452725', '302875106592253'),
    take: [
      q('75', '169'),
      q('388', '2197'),
      q('927', '28561'),
      q('1757', '371293'),
      q('5535', '4826809'),
      q('19173', '62748517'),
      q('138285', '815730721'),
      q('70803', '815730721'),
      q('6194133', '137858491849'),
      q('41657091', '1792160394037'),
      q('280141773', '23298085122481'),
      q('6107190808', '302875106592253'),
    ],
    reach: [
      q('120', '169'),
      q('491', '2197'),
      q('1178', '28561'),
      q('2864', '371293'),
      q('11926', '4826809'),
      q('65268', '62748517'),
      q('445098', '815730721'),
      q('2985150', '10604499373'),
      q('20079830', '137858491849'),
      q('10387514', '137858491849'),
      q('908128968', '23298085122481'),
      q('6107190808', '302875106592253'),
    ],
  },
  takeAfter: [
    q('144', '169'),
    q('8504', '10985'),
    q('18846', '28561'),
    q('1002696', '1856465'),
    q('2222769', '4826809'),
    q('26279516', '62748517'),
    q('1631172704', '4078653605'),
    q('4132533968', '10604499373'),
    q('50385277976', '137858491849'),
    q('649853534704', '1792160394037'),
    q('664887122064', '1792160394037'),
    q('127739306011240', '302875106592253'),
  ],
  thumb: q('1359581018177624', '1514375532961265'),
  climbTop: q('3193482650281', '302875106592253'),
};
