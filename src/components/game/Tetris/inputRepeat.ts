/**
 * Hold-to-repeat input helpers (pure): the delayed auto shift used for
 * sideways movement, and the bookkeeping for which direction is held.
 *
 * A held direction moves once on press, then repeats after `delay` ms and
 * every `interval` ms after that. Repeats are counted from elapsed time, so
 * the rate is the same at any display refresh rate.
 */

export type MoveDirection = -1 | 1;

export interface HeldDirection {
  /** Who is holding it (a key or an on-screen button). */
  id: string;
  dir: MoveDirection;
}

/**
 * How many repeats are due once a direction has been held for `heldMs`.
 * The press itself is not counted — the first repeat fires at `delay`.
 */
export const repeatCount = (heldMs: number, delay: number, interval: number): number => {
  if (!(heldMs >= delay)) return 0;
  if (!(interval > 0)) return 1;
  return Math.floor((heldMs - delay) / interval) + 1;
};

/**
 * Repeats that fall due while the hold time advances from `beforeMs` to
 * `afterMs`. Summed over consecutive frames this equals `repeatCount` for the
 * whole hold, however the time is sliced.
 */
export const repeatsBetween = (
  beforeMs: number,
  afterMs: number,
  delay: number,
  interval: number
): number =>
  Math.max(0, repeatCount(afterMs, delay, interval) - repeatCount(beforeMs, delay, interval));

/** Add a held direction, or move it to the end of the list. The newest press wins. */
export const pressDirection = (
  held: HeldDirection[],
  id: string,
  dir: MoveDirection
): HeldDirection[] => [...held.filter(h => h.id !== id), { id, dir }];

/** Remove a held direction; an older one that is still held takes over. */
export const releaseDirection = (held: HeldDirection[], id: string): HeldDirection[] =>
  held.filter(h => h.id !== id);

/** The direction currently in effect (0 = none). */
export const activeDirection = (held: HeldDirection[]): MoveDirection | 0 =>
  held.length > 0 ? held[held.length - 1].dir : 0;
