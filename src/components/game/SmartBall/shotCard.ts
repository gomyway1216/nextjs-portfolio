import { MARBLES, linesOf, type MarblePlay } from './engine';

/**
 * The shot card: a play marble by marble, as the machine shows it beside the board. It only reads a play that has
 * been drawn and shot (engine.ts): nothing here draws, pays or touches the medals.
 */

/** One marble on the card. */
export interface ShotRow {
  marble: number;
  /** The strength it was shot at, 0 to 6. */
  window: number;
  /** Whether it was shot blind (its page went away mid-play), not by the player. */
  blind: boolean;
  /** The hole it lit, or null: OUT. */
  hole: number | null;
  /** How many lines the hole it lit completed: none for most marbles. */
  lines: number;
}

/** The marbles shot so far, in order, each with the lines it completed as it dropped in. */
export function cardOf(marbles: readonly MarblePlay[]): ShotRow[] {
  let lit = 0;
  return marbles.map(({ marble, window, blind, hole }) => {
    const before = linesOf(lit).length;
    if (hole !== null) lit |= 1 << hole;
    return { marble, window, blind, hole, lines: linesOf(lit).length - before };
  });
}

/** The card's cells, one for each marble of a play: the marbles shot, then empty places for those still to come. */
export const cellsOf = (rows: readonly ShotRow[]): (ShotRow | null)[] => Array.from({ length: MARBLES }, (_, m) => rows[m] ?? null);
