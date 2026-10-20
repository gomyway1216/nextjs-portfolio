/**
 * Moonlit Sic Bo's exact odds as the table publishes them: what `analyze()` (engine.ts) adds up for every area of the
 * layout over the 216 rolls of three dice, written out here once.
 *
 * The page shows these, so that opening it never adds them up again: the Odds tab and the table each added up every
 * area over every roll as their modules loaded, before the page could wake up, and it always comes to the same
 * fractions. `tests/unit/components/game/SicBo/published.test.tsx` adds them up afresh and checks that every figure here
 * is exactly what the reckoning gives, to the last bit; a change to a pay or an area fails it until this is written out
 * again (the test prints what to write).
 */

import { betInfo, type AreaOdds, type BetId, type Fraction, type SicBoOdds } from './engine';

/** A fraction in lowest terms, as `fraction()` gives it. */
const n = (num: number, den: number): Fraction => ({ num, den });

/** One area: its id, what it pays (x to 1), how many of the 216 rolls win it, its chance, what one medal brings back, what it keeps, the spread, and for a single number the rolls that show it on one, two and three dice. */
type Row = [BetId, number, number, Fraction, Fraction, Fraction, number, (readonly [number, number, number])?];

const ROWS: readonly Row[] = [
  ['small', 1, 105, n(35, 72), n(35, 36), n(1, 36), 0.9996141230803657],
  ['big', 1, 105, n(35, 72), n(35, 36), n(1, 36), 0.9996141230803657],
  ['any-triple', 30, 6, n(1, 36), n(31, 36), n(5, 36), 5.094402035446891],
  ['triple-1', 180, 1, n(1, 216), n(181, 216), n(35, 216), 12.286948944672906],
  ['triple-2', 180, 1, n(1, 216), n(181, 216), n(35, 216), 12.286948944672906],
  ['triple-3', 180, 1, n(1, 216), n(181, 216), n(35, 216), 12.286948944672906],
  ['triple-4', 180, 1, n(1, 216), n(181, 216), n(35, 216), 12.286948944672906],
  ['triple-5', 180, 1, n(1, 216), n(181, 216), n(35, 216), 12.286948944672906],
  ['triple-6', 180, 1, n(1, 216), n(181, 216), n(35, 216), 12.286948944672906],
  ['double-1', 10, 16, n(2, 27), n(22, 27), n(5, 27), 2.8808054048340828],
  ['double-2', 10, 16, n(2, 27), n(22, 27), n(5, 27), 2.8808054048340828],
  ['double-3', 10, 16, n(2, 27), n(22, 27), n(5, 27), 2.8808054048340828],
  ['double-4', 10, 16, n(2, 27), n(22, 27), n(5, 27), 2.8808054048340828],
  ['double-5', 10, 16, n(2, 27), n(22, 27), n(5, 27), 2.8808054048340828],
  ['double-6', 10, 16, n(2, 27), n(22, 27), n(5, 27), 2.8808054048340828],
  ['total-4', 60, 3, n(1, 72), n(61, 72), n(11, 72), 7.138821335607749],
  ['total-5', 30, 6, n(1, 36), n(31, 36), n(5, 36), 5.094402035446891],
  ['total-6', 17, 10, n(5, 108), n(5, 6), n(1, 6), 3.782268572636739],
  ['total-7', 12, 15, n(5, 72), n(65, 72), n(7, 72), 3.304709275422231],
  ['total-8', 8, 21, n(7, 72), n(7, 8), n(1, 8), 2.666341125962693],
  ['total-9', 6, 25, n(25, 216), n(175, 216), n(41, 216), 2.239396405731407],
  ['total-10', 6, 27, n(1, 8), n(7, 8), n(1, 8), 2.315032397181517],
  ['total-11', 6, 27, n(1, 8), n(7, 8), n(1, 8), 2.315032397181517],
  ['total-12', 6, 25, n(25, 216), n(175, 216), n(41, 216), 2.239396405731407],
  ['total-13', 8, 21, n(7, 72), n(7, 8), n(1, 8), 2.666341125962693],
  ['total-14', 12, 15, n(5, 72), n(65, 72), n(7, 72), 3.304709275422231],
  ['total-15', 17, 10, n(5, 108), n(5, 6), n(1, 6), 3.782268572636739],
  ['total-16', 30, 6, n(1, 36), n(31, 36), n(5, 36), 5.094402035446891],
  ['total-17', 60, 3, n(1, 72), n(61, 72), n(11, 72), 7.138821335607749],
  ['pair-1-2', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-1-3', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-1-4', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-1-5', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-1-6', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-2-3', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-2-4', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-2-5', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-2-6', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-3-4', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-3-5', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-3-6', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-4-5', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-4-6', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['pair-5-6', 5, 30, n(5, 36), n(5, 6), n(1, 6), 2.074983266331455],
  ['single-1', 1, 91, n(91, 216), n(199, 216), n(17, 216), 1.113182867903423, [75, 15, 1]],
  ['single-2', 1, 91, n(91, 216), n(199, 216), n(17, 216), 1.113182867903423, [75, 15, 1]],
  ['single-3', 1, 91, n(91, 216), n(199, 216), n(17, 216), 1.113182867903423, [75, 15, 1]],
  ['single-4', 1, 91, n(91, 216), n(199, 216), n(17, 216), 1.113182867903423, [75, 15, 1]],
  ['single-5', 1, 91, n(91, 216), n(199, 216), n(17, 216), 1.113182867903423, [75, 15, 1]],
  ['single-6', 1, 91, n(91, 216), n(199, 216), n(17, 216), 1.113182867903423, [75, 15, 1]],
];

const areaOf = ([id, pays, wins, hit, back, edge, sd, matches]: Row): AreaOdds => ({ id, info: betInfo(id), pays, wins, hit, back, edge, sd, ...(matches ? { matches } : {}) });

/** The exact odds of every area of the layout (`analyze()`), in the layout's order. */
export const PUBLISHED_ODDS: Readonly<SicBoOdds> = {
  areas: ROWS.map(areaOf),
  // Small and Big.
  best: n(35, 36),
  // A total of 9 or 12.
  least: n(175, 216),
};
