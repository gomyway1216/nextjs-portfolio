/**
 * The cabinet's control panel as an object: what its displays light and what
 * lies in its tray. Pure: the pictures are drawn from these by the panel's
 * components, and nothing here knows of the machine but a count of medals.
 *
 * A real station shows its numbers on displays, not in type, and the medals
 * a player has won lie in a tray in front of them, where the machine pays
 * them out and from where they are fed back in. The counter here is a row of
 * seven-segment digits; the tray holds a heap that is as many medals as the
 * purse holds, up to what can be drawn.
 */

// ---------- Seven-segment digits ----------

/** The seven segments of a digit, in the order they are always named: a at the top, round clockwise to f, and g across the middle. */
export const SEGMENT_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;
export type SegmentName = (typeof SEGMENT_NAMES)[number];

/** The segments each digit lights. */
export const SEGMENTS: Readonly<Record<string, string>> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
};

/**
 * What a display of `places` digits lights to show `value`, the leftmost
 * place first: for each place the segments that are lit, '' for a place left
 * dark. A number is shown with nothing in front of it, as a counter shows
 * it: 42 on five places is three dark places and then 4 and 2. Anything that
 * is not a digit in `value` (the comma in 1,234) is passed over. A number too
 * long for the display shows its last places, as a counter that has gone
 * round does; nothing but a whole number of medals ever comes here, and none
 * that long.
 */
export function segmentsFor(value: number | string, places: number): string[] {
  if (!Number.isInteger(places) || places < 1) throw new Error('a display has a whole number of places, at least one');
  const text = typeof value === 'number' ? (Number.isFinite(value) ? String(Math.max(0, Math.trunc(value))) : '') : value;
  const digits = [...text].filter((char) => char in SEGMENTS).slice(-places);
  const shown: string[] = new Array<string>(places - digits.length).fill('');
  for (const digit of digits) shown.push(SEGMENTS[digit]);
  return shown;
}

/**
 * Where each segment is drawn in a digit's cell, as the points of a polygon.
 * The cell is 12 wide and 20 high; the bars are 2 thick with mitred ends, and
 * the digit leans a little to the right, as the displays in a cabinet do.
 */
export const SEGMENT_SHAPES: Readonly<Record<SegmentName, string>> = {
  a: '2.6,1 9.4,1 8.4,3 3.6,3',
  b: '10,1.6 11,2.6 11,9.2 10,10 9,9 9,3.6',
  c: '10,10 11,10.8 11,17.4 10,18.4 9,16.4 9,11',
  d: '3.6,17 8.4,17 9.4,19 2.6,19',
  e: '2,10 3,11 3,16.4 2,18.4 1,17.4 1,10.8',
  f: '2,1.6 3,3.6 3,9 2,10 1,9.2 1,2.6',
  g: '3,10 3.8,9 8.2,9 9,10 8.2,11 3.8,11',
};
export const SEGMENT_CELL = { width: 12, height: 20, lean: -6 } as const;

// ---------- The tray ----------

/**
 * The rows of the heap, the bottom row first: how many medals lie in each.
 * A full heap is a mound sixty medals high-piled; more than that in the
 * purse is more of the same, and the counter says how many.
 */
export const HEAP_ROWS = [11, 10, 9, 8, 7, 6, 5, 4] as const;
export const HEAP_CAP = HEAP_ROWS.reduce((sum, row) => sum + row, 0);

/** The tray's drawing, in its own units: the dish, the mouth of the chute the machine pays through, and a medal lying in it. */
export const TRAY = {
  width: 120,
  height: 54,
  /** The floor of the dish, where the bottom row lies. */
  floor: 47,
  /** The chute's mouth, at the back of the dish: a medal comes out of it and falls into the heap. */
  chute: { x: 60, y: 6, width: 26 },
  /** A medal as it lies: an ellipse, seen from the player's seat. */
  medal: { rx: 5.1, ry: 3, step: 9.6, rise: 4.6 },
} as const;

/** A medal's place in the heap. */
export interface HeapSpot {
  x: number;
  y: number;
  /** How far it is turned as it lies, in degrees: a few either way. */
  tilt: number;
  /** Which row it lies in, from the bottom. */
  row: number;
}

/** A number between 0 and 1 that is always the same for the same `n`: the heap is not shuffled when a medal is added. */
const scatter = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Where the medals of a full heap lie, in the order they are heaped: the
 * bottom row from the middle outwards, then the row on it, and so on up.
 * Every medal has its own place, so a heap of 20 is the first 20 of these
 * and the 21st medal lands on them without moving any.
 */
export const HEAP_SPOTS: readonly HeapSpot[] = HEAP_ROWS.flatMap((count, row) => {
  const { medal, floor, width } = TRAY;
  const spots: HeapSpot[] = [];
  for (let place = 0; place < count; place++) {
    // From the middle outwards: 0, +1, -1, +2, -2 …, so each row grows as a mound and not from one side.
    const off = place === 0 ? 0 : Math.ceil(place / 2) * (place % 2 === 1 ? 1 : -1);
    const shift = count % 2 === 0 ? 0.5 : 0;
    const n = row * 16 + place;
    spots.push({
      x: width / 2 + (off - shift) * medal.step + (scatter(n) - 0.5) * 1.6,
      y: floor - row * medal.rise + (scatter(n + 0.5) - 0.5) * 1.2,
      tilt: (scatter(n + 0.25) - 0.5) * 16,
      row,
    });
  }
  return spots;
});

/** How many medals are drawn in the tray for a purse of `credits`: every one of them, up to a full heap. */
export const heapCount = (credits: number): number => (Number.isFinite(credits) ? Math.min(HEAP_CAP, Math.max(0, Math.floor(credits))) : 0);

/** The most medals that are shown arriving at once, and leaving at once. More than that is still counted: only the picture is batched. */
export const TRAY_BATCH = { arrive: 6, leave: 2 } as const;
/** A change of this many medals or more is not play (a reset, a refill, a machine that was remembered): the heap changes and nothing is acted out. */
export const TRAY_JUMP = 40;

/**
 * What the tray acts out when the purse goes from `before` to `after`:
 * medals dropping in from the chute for medals won, a medal leaving for one
 * fed. Many at once are shown as a few.
 */
export function trayChange(before: number, after: number): { arrive: number; leave: number } {
  const delta = Math.trunc(after) - Math.trunc(before);
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) >= TRAY_JUMP) return { arrive: 0, leave: 0 };
  return delta > 0 ? { arrive: Math.min(TRAY_BATCH.arrive, delta), leave: 0 } : { arrive: 0, leave: Math.min(TRAY_BATCH.leave, -delta) };
}

/**
 * Which way a medal leaves the tray: towards the feed button that is held,
 * the left one (-1) or the right (1). With both held, or neither (Auto, or a
 * tap already over), they leave by turns, and `turn` says whose it is.
 */
export const leaveSide = (held: readonly [boolean, boolean], turn: number): -1 | 1 => (held[0] !== held[1] ? (held[0] ? -1 : 1) : turn % 2 === 0 ? -1 : 1);
