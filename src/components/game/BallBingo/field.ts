/**
 * The field of Ball Bingo, as numbers: where its walls, pins and pockets are.
 * The page draws it from these (Board.tsx), and the ball's flight is worked
 * out against the same (ballPath.ts), so that what the ball bounces off is
 * what is drawn.
 *
 * Units are the drawing's own (a field 300 wide and 436 tall, y downwards).
 * Every coordinate is a whole number or a tenth, so that the server and the
 * browser write the same drawing.
 *
 * The field is a board of pins under an arch, as a pin-and-ball machine's is:
 * the ball is shot up the lane on the right, runs round the inside of the
 * arch and, where it is too slow to hold to it, comes away and falls through
 * the pins. At the foot stand the pockets: a wide OUT gutter at each side,
 * the numbers 1 to 9 between, all of a width. Three pockets stand among the
 * pins: FREE on each side and CHANCE in the middle, each a cup with an open
 * top and a pin over its mouth.
 *
 * The field was set (the rows of pins, the bumps on the walls, the cups'
 * mouths, the pins over them) until a ball shot at any strength comes down
 * about as often in each kind of pocket as the published odds say (about
 * half the numbers, two fifths OUT, a few in a cup): so the flights the
 * machine picks for the drawn pockets look like the field's own, and are
 * found within a few shots. `tests/unit/components/game/BallBingo/ballPath.test.ts`
 * holds the field to that.
 */

import { FIELD_POCKETS, FOOT, POCKETS } from './engine';

export const VIEW = { width: 300, height: 436 } as const;

/** The ball. */
export const BALL_R = 5;

/** The field of pins inside its walls: the left wall, and the wall between the field and the lane on the right. */
export const FIELD = { left: 8, right: 262 } as const;
/** The lane the ball is shot up, on the right: its walls, its centre line, the plunger at its foot and the top where it opens into the arch. */
export const LANE = { inner: 262, outer: 278, x: 270, bottom: 420, top: 150 } as const;
/** The arch over the field and the lane: its centre, the radius of its wall, and the radius the ball's centre runs at inside it. */
export const ARCH = { cx: 143, cy: 150, wall: 135, run: 135 - BALL_R } as const;
/** The flap over the lane's top: from the lane's outer wall down to the field's right wall, so a ball on it rolls into the field. */
export const FLAP = { x0: LANE.outer, y0: ARCH.cy - 4, x1: FIELD.right, y1: ARCH.cy + 4 } as const;

/**
 * The foot of the field: the tops of the posts between the pockets, the line under which a ball is in a pocket, where
 * a numbered pocket's ball sits (in the pocket's mouth, standing a little over the posts, so that a ball that comes
 * down on it rolls off), the floor of the drawing under the pockets, and where a ball into OUT falls away to.
 */
export const FOOT_ROW = { postTop: 392, inLine: 393, restY: 394, bottom: 414, away: 452 } as const;
/**
 * How wide the pockets at the foot are: every numbered pocket the same, as on a real field, and the two OUT gutters
 * the rest of the width. What makes one pocket likelier than another is the field of pins above it, and its chances are
 * printed on the machine's glass (the Odds tab); the drawing does not pretend to show them.
 */
export const FOOT_WIDTH = { number: 18, out: (FIELD.right - FIELD.left - 9 * 18) / 2 } as const;
const tenth = (v: number) => Math.round(v * 10) / 10;

export interface FootPocket {
  /** Its place in `POCKETS`. */
  pocket: number;
  /** Its left and right edges, and its middle. */
  x0: number;
  x1: number;
  cx: number;
}

/** The pockets at the foot, left to right. */
export const FOOT_POCKETS: readonly FootPocket[] = (() => {
  let x = FIELD.left;
  return FOOT.map((pocket) => {
    const width = POCKETS[pocket].kind === 'out' ? FOOT_WIDTH.out : FOOT_WIDTH.number;
    const shape: FootPocket = { pocket, x0: tenth(x), x1: tenth(x + width), cx: tenth(x + width / 2) };
    x += width;
    return shape;
  });
})();

/** The posts between the pockets at the foot (none at the walls): their x. */
export const POSTS: readonly number[] = FOOT_POCKETS.slice(1).map((p) => p.x0);
/** Half a post's thickness. */
export const POST_HALF = 1.4;

export interface Cup {
  /** Its place in `POCKETS`. */
  pocket: number;
  /** The middle of its mouth, the top of its walls, and half its width between them. */
  cx: number;
  top: number;
  half: number;
  /** How deep it is, and where a ball sits in it. */
  depth: number;
  restY: number;
}

/** Half a cup's width between its walls, and how far over its mouth the pin that guards it stands. */
export const CUP_HALF = 9;
export const CUP_GATE = 14;
/** The cups among the pins: FREE on the left, CHANCE in the middle, FREE on the right. */
export const CUPS: readonly Cup[] = FIELD_POCKETS.map((pocket) => {
  const kind = POCKETS[pocket].kind;
  const cx = kind === 'chance' ? 135 : POCKETS[pocket].id === 'free-l' ? 52 : 218;
  const top = kind === 'chance' ? 268 : 226;
  const half = CUP_HALF;
  const depth = 13;
  return { pocket, cx, top, half, depth, restY: top + depth - BALL_R - 1.5 };
});
/** The dome that shuts a cup whose lamp has gone out (and the CHANCE cup once it holds its ball): its middle and radius. */
export const lidOf = (cup: Cup): { cx: number; cy: number; r: number } => ({ cx: cup.cx, cy: cup.top + 5, r: cup.half + 1 });
/** Half a cup wall's thickness. */
export const CUP_WALL = 1.2;

export const PIN_R = 2.2;
/** The rows of pins: the first, how far apart the rows are, how many, and how far apart the pins in a row. */
export const PIN_ROWS = { first: 88, gap: 22, count: 13, pitch: 26 } as const;

/** The pins: staggered rows down the field, kept clear of the walls, the arch, the cups and the foot. */
export const PINS: readonly { x: number; y: number }[] = (() => {
  const pins: { x: number; y: number }[] = [];
  const rows = PIN_ROWS.count;
  const middle = (FIELD.left + FIELD.right) / 2;
  // A pin must stand either against a wall (a bump that turns a ball back in) or a ball's width and more from it, so
  // that no ball can come to rest between a pin and a wall.
  const clear = PIN_R + 2 * BALL_R + 1;
  for (let row = 0; row < rows; row++) {
    const y = PIN_ROWS.first + row * PIN_ROWS.gap;
    // The rows are set from the middle of the field, every other one half a pitch over.
    const offset = row % 2 === 0 ? 0 : PIN_ROWS.pitch / 2;
    const xs: number[] = [];
    for (let x = middle + offset - PIN_ROWS.pitch * 6; x <= FIELD.right; x += PIN_ROWS.pitch) if (x - FIELD.left >= clear && FIELD.right - x >= clear) xs.push(x);
    // Every other row has a bump on each wall, so that no ball can run straight down beside it.
    if (row % 2 === 0) xs.push(FIELD.left + PIN_R, FIELD.right - PIN_R);
    for (const x of xs) {
      // Inside the arch, with room for a ball between the pin and the wall.
      if (y < ARCH.cy + 10 && Math.hypot(x - ARCH.cx, y - ARCH.cy) > ARCH.wall - 3 * BALL_R) continue;
      // Not in a cup, nor over its mouth, nor so near its walls that a ball could stand between the two.
      if (CUPS.some((cup) => Math.abs(x - cup.cx) < cup.half + 2 * BALL_R + 4 && y > cup.top - 24 && y < cup.top + cup.depth + 14)) continue;
      // Clear of the posts at the foot.
      if (y > FOOT_ROW.postTop - 3 * BALL_R) continue;
      pins.push({ x: tenth(x), y });
    }
  }
  // A pin over each cup's mouth, which turns away a ball that falls straight at it: only a ball that comes in from the
  // side drops in, as through the pins that guard a pocket on a pin board.
  for (const cup of CUPS) pins.push({ x: cup.cx, y: cup.top - CUP_GATE });
  return pins;
})();

/** The foot pocket for a place in `POCKETS`, if it is one. */
export const footOf = (pocket: number): FootPocket | undefined => FOOT_POCKETS.find((p) => p.pocket === pocket);
/** The cup for a place in `POCKETS`, if it is one. */
export const cupOf = (pocket: number): Cup | undefined => CUPS.find((c) => c.pocket === pocket);

/** Where a ball sits once it is in a pocket (a ball into OUT falls away below the field). */
export function restOf(pocket: number): { x: number; y: number } {
  const foot = footOf(pocket);
  if (foot) return { x: foot.cx, y: POCKETS[pocket].kind === 'out' ? FOOT_ROW.away : FOOT_ROW.restY };
  const cup = cupOf(pocket)!;
  return { x: cup.cx, y: cup.restY };
}
