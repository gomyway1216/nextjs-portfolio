/**
 * Whale Isle Sugoroku's exact odds as the machine publishes them: what `analyzeBoard()` (engine.ts) works out over
 * every way a roll can go from every square (the die, the whale's three rolls, the lamps and the final), the long run
 * of steady play from the board's chain, and the best any choice of bet can do, written out here once.
 *
 * The page shows these, so that opening it never works them out again: the reckoning solves the board's chain exactly
 * (a 30 × 30 system in fractions of BigInts) and walks every roll from every square, about 30 ms on a desktop and over
 * 100 ms on a phone as the page wakes up, and it always comes to the same fractions.
 * `tests/unit/components/game/Sugoroku/published.test.tsx` works them out afresh and checks that every figure here is
 * exactly what the reckoning gives; a change to a square, a lamp, a pay or a rule fails it until this is written out
 * again (the test prints what to write).
 */

import type { BoardOdds, Fraction } from './engine';

/** A fraction in lowest terms, written as its two whole numbers (the site's TypeScript targets a version before BigInt literals). */
const q = (num: string, den: string): Fraction => ({ num: BigInt(num), den: BigInt(den) });

/** The board's exact odds (`analyzeBoard()`). */
export const PUBLISHED_BOARD_ODDS: Readonly<BoardOdds> = {
  returns: [
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('67', '72'),
    q('1', '2'),
    q('7', '12'),
    q('2', '3'),
    q('3', '4'),
    q('5', '6'),
    q('11', '12'),
  ],
  rests: [
    q('1048266199910873', '14877492809084850'),
    q('417392372714388', '12397910674237375'),
    q('269339819771626', '7438746404542425'),
    q('1984829998550109', '24795821348474750'),
    q('1664104142458136', '37193732022712125'),
    q('85413089880071', '1771130096319625'),
    q('554979321168727', '10626780577917750'),
    q('0', '1'),
    q('648276716714231', '14877492809084850'),
    q('0', '1'),
    q('2999537719112063', '37193732022712125'),
    q('66320095416426', '1771130096319625'),
    q('378827578034911', '10626780577917750'),
    q('893711916301352', '12397910674237375'),
    q('3339994595556277', '74387464045424250'),
    q('0', '1'),
    q('1678214882110232', '37193732022712125'),
    q('0', '1'),
    q('490349630127641', '14877492809084850'),
    q('345486762100549', '10626780577917750'),
    q('0', '1'),
    q('32645179561756', '1771130096319625'),
    q('114258128466146', '5313390288958875'),
    q('217801856262829', '12397910674237375'),
    q('217801856262829', '10626780577917750'),
    q('228348411284456', '12397910674237375'),
    q('3123134297393683', '74387464045424250'),
    q('285982228795472', '12397910674237375'),
    q('126668524616858', '5313390288958875'),
    q('8582461598354', '354226019263925'),
  ],
  standing: [0, 1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 14, 16, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29],
  longRun: q('40054856905809077', '44632478427254550'),
  best: q('67', '72'),
  worst: q('1', '2'),
  bestSquares: [0, 1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 14, 16, 18, 19, 21, 22, 23],
  worstSquares: [24],
  lampChance: q('37', '12'),
  jpChance: q('37', '12'),
  whaleRide: q('37', '12'),
  lapShare: q('558034286800441', '12397910674237375'),
  betting: { value: q('904645916935578143', '980099071737322878'), threshold: q('67', '72'), bigOn: [0, 1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 14, 16, 18, 19, 21, 22, 23] },
  chances: {
    lap: q('1116068573600882', '12397910674237375'),
    paid: q('125234758962114877', '148774928090848500'),
    moved: q('6510716711911127', '31880341733753250'),
    lamp: q('3168301699409647', '37193732022712125'),
    jpChance: q('271477096853523', '7084520385278500'),
    ride: q('378827578034911', '10626780577917750'),
    blowhole: q('378827578034911', '21253561155835500'),
    jackpot: q('90492365617841', '170028489246684000'),
  },
  mostPays: 204,
};
