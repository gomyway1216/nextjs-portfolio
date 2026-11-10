/**
 * Candy Shop Medal Maze: a look back at a play's flicks.
 *
 * For each gate reached, how the flick stood against the gate's turn: in one of the windows where the gate stood
 * widest (`off` 0), or so many windows before the nearest of them (early, negative) or after it (late, positive).
 * It reads a play that has ended and changes nothing about how the machine plays.
 */

import { GATE_PATTERNS, OPENING, STAGES, TIMEOUT, WINDOWS, type GateKind, type Play, type StagePlay } from './engine';

/** The widest a gate of a kind ever stands in its turn: 1 where it opens, less for a gate that only flutters. */
export const widestOf = (kind: GateKind): number => Math.max(...GATE_PATTERNS[kind].map((slot) => OPENING[slot]));

/** Whether a gate of a kind stands at its widest in `window`. */
export const atWidest = (kind: GateKind, window: number): boolean => OPENING[GATE_PATTERNS[kind][window]] === widestOf(kind);

/**
 * How far a flick in `window` was from the gate's widest: 0 in one of its widest windows, `-n` when the nearest of
 * them came `n` windows after the flick (too early), `n` when it was `n` windows before it (too late). The turn goes
 * round, so the nearest is looked for both ways; just as near both ways counts as early. Null for a flick that never
 * came (the time ran out).
 */
export function timingOf(kind: GateKind, window: number): number | null {
  if (window === TIMEOUT) return null;
  for (let n = 0; n <= WINDOWS / 2; n++) {
    if (atWidest(kind, (window + n) % WINDOWS)) return n === 0 ? 0 : -n;
    if (atWidest(kind, (window - n + WINDOWS) % WINDOWS)) return n;
  }
  return null;
}

/** A gate of a play, looked back at. */
export interface GateReview {
  played: StagePlay;
  /** How far the flick was from the gate's widest (`timingOf`). */
  off: number | null;
  /** Whether this gate ever opens all the way: where it does not, its widest is a graze. */
  opens: boolean;
}

/** Every gate of a play, in order: how its flick went, or null for a gate the medal never came to. */
export function reviewOf(play: Play): (GateReview | null)[] {
  return Array.from({ length: STAGES }, (_, stage) => {
    const played = play.stages[stage];
    if (!played) return null;
    return { played, off: timingOf(played.gate, played.window), opens: widestOf(played.gate) === OPENING.open };
  });
}
