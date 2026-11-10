/**
 * The three derived roads a casino board posts under the big road: the big eye
 * boy, the small road and the cockroach pig. None of them records who won.
 * Each mark says whether the big road, at that hand, was repeating the shape
 * of an earlier column (red) or breaking from it (blue).
 */

import { bigRoad, type RoadEntry, type Side } from './engine';

export type DerivedMark = 'red' | 'blue';

export const DERIVED_ROADS = ['bigEye', 'small', 'cockroach'] as const;
export type DerivedRoadId = (typeof DERIVED_ROADS)[number];

/** How many big-road columns back each road looks. */
export const DERIVED_GAP: Record<DerivedRoadId, number> = { bigEye: 1, small: 2, cockroach: 3 };

type Result = Pick<RoadEntry, 'winner'>;

/**
 * The big road as streak lengths, one per change of winner, ties left out.
 * These are the columns the derived roads compare: a streak that turned into a
 * dragon tail on the drawn board is still one column here.
 */
export function streakLengths(entries: readonly Result[]): number[] {
  const lengths: number[] = [];
  let previous: Side | null = null;
  for (const { winner } of entries) {
    if (winner === 'tie') continue;
    if (winner === previous) lengths[lengths.length - 1]++;
    else lengths.push(1);
    previous = winner;
  }
  return lengths;
}

/**
 * The mark a hand at (column, row) of the big road puts on a road, or null
 * while that road has not started: it starts with the second hand of column
 * `gap` (counting from 0), or with the first hand of the column after it.
 *
 * - A hand that opens a column compares the column just finished with the one
 *   `gap` before that: red when they are the same length.
 * - A hand further down compares its column with the one `gap` to its left:
 *   blue when that column is exactly one hand shorter than this one now is
 *   (the streak has just outrun it), red otherwise.
 */
export function markAt(lengths: readonly number[], column: number, row: number, gap: number): DerivedMark | null {
  if (column < gap || (column === gap && row === 0)) return null;
  if (row === 0) return lengths[column - 1] === lengths[column - 1 - gap] ? 'red' : 'blue';
  return lengths[column - gap] === row ? 'blue' : 'red';
}

/** Every mark of one road, in the order the hands were played. */
export function derivedMarks(entries: readonly Result[], road: DerivedRoadId): DerivedMark[] {
  const lengths = streakLengths(entries);
  const gap = DERIVED_GAP[road];
  const marks: DerivedMark[] = [];
  lengths.forEach((length, column) => {
    for (let row = 0; row < length; row++) {
      const mark = markAt(lengths, column, row, gap);
      if (mark) marks.push(mark);
    }
  });
  return marks;
}

/** The mark each road would get if `side` won the next hand (null: that road would get none yet). */
export function nextMarks(entries: readonly Result[], side: Side): Record<DerivedRoadId, DerivedMark | null> {
  const lengths = streakLengths(entries);
  let last: Side | null = null;
  for (const { winner } of entries) if (winner !== 'tie') last = winner;
  const column = side === last ? lengths.length - 1 : lengths.length;
  const row = side === last ? lengths[column] : 0;
  return {
    bigEye: markAt(lengths, column, row, DERIVED_GAP.bigEye),
    small: markAt(lengths, column, row, DERIVED_GAP.small),
    cockroach: markAt(lengths, column, row, DERIVED_GAP.cockroach),
  };
}

export interface DerivedCell {
  col: number;
  row: number;
  mark: DerivedMark;
}

/** Marks laid out the way the big road is: a run down a column, a change starts the next, a blocked run turns right. */
export function derivedCells(marks: readonly DerivedMark[]): DerivedCell[] {
  const entries = marks.map((mark): RoadEntry => ({ winner: mark === 'red' ? 'banker' : 'player', playerPair: false, bankerPair: false, natural: false }));
  return bigRoad(entries).cells.map((cell, i) => ({ col: cell.col, row: cell.row, mark: marks[i] }));
}
