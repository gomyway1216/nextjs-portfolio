import type { CSSProperties } from 'react';

/*
 * The felt's inside bets, and where each piece of the board goes in both of its layouts (Roulette.module.css picks
 * one by the felt's own width):
 * - wide, as a casino table: the numbers run across in 12 columns of three, 0 on the left, the streets and the lines
 *   in two rows under them;
 * - upright, at a phone's width: 0 on top, the numbers run down in 12 rows of three (1 2 3 / 4 5 6 / …), the streets
 *   and the lines in two columns beside them.
 * The grid of the wide layout is [0][12 number columns] over [3 number rows][streets][lines]; the upright one is
 * [lines][streets][3 number columns] over [0][12 number rows].
 *
 * Points on the numbers are measured in cells of the wide table: x along it (0–12, column k runs from k to k + 1) and
 * y across it (0–3, row r runs from r to r + 1, row 0 being the top row 3 6 9 …).
 */

/** The number in column k (0–11) and row r (0 top: 3, 6, 9, …; 2 bottom: 1, 4, 7, …) of the wide table. */
export const numberAt = (k: number, r: number) => 3 * k + (3 - r);

/** A point on the number grid, in cells of the wide table. */
export interface Point {
  x: number;
  y: number;
}

/** The centre of a number's cell (1–36). */
export const cellPoint = (n: number): Point => ({ x: Math.floor((n - 1) / 3) + 0.5, y: 2 - ((n - 1) % 3) + 0.5 });

/** Inline CSS custom properties that place a piece of the board. */
export type Place = CSSProperties & Record<`--${string}`, string | number>;

/** A number's cell (1–36): its grid column and row in each layout. */
export const cellPlace = (n: number): Place => {
  const k = Math.floor((n - 1) / 3);
  const r = 2 - ((n - 1) % 3);
  return { '--wide-col': k + 2, '--wide-row': r + 1, '--up-col': 5 - r, '--up-row': k + 2 };
};

/** The street of column k, or the line that starts at it: the grid line it starts on, the same number in both layouts. */
export const stripPlace = (k: number): Place => ({ '--at': k + 2 });

/**
 * A hit zone centred on a point of the number grid. Wide, the point is x twelfths of the numbers from the left and y
 * thirds from the top; upright, x twelfths from the top and 3 − y thirds from the left (the top row of the wide table,
 * 3 6 9 …, is the right-hand column of the upright one).
 */
export const zonePlace = ({ x, y }: Point): Place => ({
  '--wide-x': `${(x / 12) * 100}%`,
  '--wide-y': `${(y / 3) * 100}%`,
  '--up-x': `${((3 - y) / 3) * 100}%`,
  '--up-y': `${(x / 12) * 100}%`,
});

/** A split or a corner: its numbers, ascending, and the point its hit zone is centred on. */
export interface Zone<N extends number[]> {
  numbers: N;
  at: Point;
}

// 0-involving splits (0-1, 0-2, 0-3) and trios (0-1-2, 0-2-3) are intentionally omitted — they would need to bridge
// the standalone 0 cell to the main grid. Every list is built with its numbers ascending, so a bet's key can join them
// without sorting.

/** Splits of two numbers next to each other along the table (k and k + 1 in one row): on the border between them. */
export const SPLITS_ALONG: Zone<[number, number]>[] = [];
for (let k = 0; k < 11; k++) {
  for (let r = 0; r < 3; r++) {
    SPLITS_ALONG.push({ numbers: [numberAt(k, r), numberAt(k + 1, r)], at: { x: k + 1, y: r + 0.5 } });
  }
}

/** Splits of two numbers in one column of three (rows r and r + 1): on the border between them. */
export const SPLITS_ACROSS: Zone<[number, number]>[] = [];
for (let k = 0; k < 12; k++) {
  for (let r = 0; r < 2; r++) {
    SPLITS_ACROSS.push({ numbers: [numberAt(k, r + 1), numberAt(k, r)], at: { x: k + 0.5, y: r + 1 } });
  }
}

/** Corners of four numbers: on the point where they meet. Ascending, e.g. [1, 2, 4, 5]. */
export const CORNERS: Zone<[number, number, number, number]>[] = [];
for (let k = 0; k < 11; k++) {
  for (let r = 0; r < 2; r++) {
    CORNERS.push({
      numbers: [numberAt(k, r + 1), numberAt(k, r), numberAt(k + 1, r + 1), numberAt(k + 1, r)],
      at: { x: k + 1, y: r + 1 },
    });
  }
}

/** Streets: the three numbers of column k. */
export const STREETS: { k: number; numbers: [number, number, number] }[] = [];
for (let k = 0; k < 12; k++) {
  STREETS.push({ k, numbers: [3 * k + 1, 3 * k + 2, 3 * k + 3] });
}

/** Lines: the six numbers of columns k and k + 1. */
export const LINES: { k: number; numbers: [number, number, number, number, number, number] }[] = [];
for (let k = 0; k < 11; k++) {
  LINES.push({ k, numbers: [3 * k + 1, 3 * k + 2, 3 * k + 3, 3 * k + 4, 3 * k + 5, 3 * k + 6] });
}
