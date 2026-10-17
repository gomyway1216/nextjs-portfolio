/**
 * The craps table as it is drawn: where the rails, the far wall's rubber and
 * every betting area are, in the units of the drawing. The felt's art, the
 * areas a player taps to bet, and the dice's throw all read from here, so
 * they always agree.
 *
 * A real table is a tub with a padded rail round it. Its two ends carry the
 * same layout, and the proposition bets are in the middle, under the
 * stickman. The end walls are lined with rubber pyramids, and the shooter
 * must hit the far one with both dice. A mini table is one end of it: a
 * single layout, about half the length.
 *
 * - `full`, for a desk: the whole double-ended table. The shooter stands at
 *   the right-hand end and throws the length of the table, over the middle,
 *   at the left-hand end's wall. The player's bets are on the left-hand end,
 *   where the dice come to rest; the right-hand end is the other players'.
 * - `half`, for a phone: one end, as a mini table, with the stickman's box
 *   of proposition bets drawn under it (`center`). The layout keeps a real
 *   end's shape (its rows run along the table, the Pass Line turns up the
 *   end by the wall), and every area is big enough to tap at 375 px.
 *
 * Seen from above with the far wall on the left: the Don't Come bar and the
 * place numbers along the far side, then Come, the Field, the Don't Pass Bar,
 * and the Pass Line along the near side, turning up the end by the wall. The
 * odds have no box of their own on a real felt: they are put behind the line
 * bet, which is where the ODDS and LAY areas are. A Come or Don't Come bet
 * that moves to its number is drawn in that number's box (CrapsFelt.tsx), as a
 * dealer moves it there: not an area of its own.
 */

import type { BetId } from './engine';
import type { ThrowGeometry } from './throwPhysics';

export type TableKind = 'half' | 'full';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An area the player bets on. `more` are further parts of the same area (the Pass Line's turn up the end). */
export interface LiveArea {
  id: BetId;
  box: Box;
  more?: Box[];
}

/** One felt: a tub with dice in it, or the stickman's box. */
export interface Felt {
  width: number;
  height: number;
  rail: number;
  live: LiveArea[];
  /** The text sizes the art is printed in. */
  type: { number: number; label: number; small: number };
}

export interface TableLayout extends Felt {
  kind: TableKind;
  /** The rubber on the far wall: the strip of pyramids the dice hit. */
  rubber: Box;
  /** The rubber on the shooter's end wall: a full table has it at both ends. */
  nearRubber: Box | null;
  /** The middle of the table, with the proposition bets, when it is part of this felt. */
  middle: Box | null;
  /** The other players' end, printed as a mirror of this one and not played: on the full table only. */
  mirror: boolean;
  /** Where the OFF puck lies when no point is set, and how big the puck is. */
  puckOff: { x: number; y: number };
  puck: number;
  throw: ThrowGeometry;
  /** The stickman's box, drawn as a felt of its own under the tub, when the middle is not part of it. */
  center: Felt | null;
}

const PLACE_IDS = ['place4', 'place5', 'place6', 'place8', 'place9', 'place10'] as const;

/** A row of equal boxes, side by side. */
export const row = (x: number, y: number, w: number, h: number, n: number, gap = 0): Box[] =>
  Array.from({ length: n }, (_, i) => ({ x: x + i * ((w - gap * (n - 1)) / n + gap), y, w: (w - gap * (n - 1)) / n, h }));

/** The proposition bets: Any Seven over the hardways, then Aces, Yo and Twelve, then Any Craps. */
function propositions(x: number, y: number, w: number, rows: { seven: number; hard: number; ends: number; craps: number }, hardAcross: 2 | 4, gap: number): LiveArea[] {
  const hard =
    hardAcross === 4
      ? row(x, y + rows.seven + gap, w, rows.hard, 4, gap)
      : [...row(x, y + rows.seven + gap, w, rows.hard, 2, gap), ...row(x, y + rows.seven + rows.hard + 2 * gap, w, rows.hard, 2, gap)];
  const hardBottom = y + rows.seven + gap + (hardAcross === 4 ? rows.hard : 2 * rows.hard + gap);
  const ends = row(x, hardBottom + gap, w, rows.ends, 3, gap);
  return [
    { id: 'any7', box: { x, y, w, h: rows.seven } },
    { id: 'hard6', box: hard[0] },
    { id: 'hard10', box: hard[1] },
    { id: 'hard8', box: hard[2] },
    { id: 'hard4', box: hard[3] },
    { id: 'aces', box: ends[0] },
    { id: 'yo', box: ends[1] },
    { id: 'twelve', box: ends[2] },
    { id: 'anyCraps', box: { x, y: hardBottom + rows.ends + 2 * gap, w, h: rows.craps } },
  ];
}

function half(): TableLayout {
  const width = 360;
  const height = 272;
  const rail = 12;
  const places = row(48, 36, 298, 70, 6);
  return {
    kind: 'half',
    width,
    height,
    rail,
    rubber: { x: rail, y: rail, w: 8, h: height - 2 * rail },
    nearRubber: null,
    middle: null,
    live: [
      { id: 'dontCome', box: { x: 48, y: 14, w: 298, h: 20 } },
      ...PLACE_IDS.map((id, i) => ({ id, box: places[i] })),
      { id: 'come', box: { x: 48, y: 108, w: 298, h: 44 } },
      { id: 'field', box: { x: 48, y: 154, w: 298, h: 42 } },
      { id: 'dontPass', box: { x: 48, y: 198, w: 240, h: 26 } },
      { id: 'dontPassOdds', box: { x: 290, y: 198, w: 56, h: 26 } },
      { id: 'pass', box: { x: 22, y: 226, w: 266, h: 32 }, more: [{ x: 22, y: 14, w: 24, h: 210 }] },
      { id: 'passOdds', box: { x: 290, y: 226, w: 56, h: 32 } },
    ],
    mirror: false,
    puckOff: { x: 60, y: 24 },
    puck: 22,
    type: { number: 24, label: 13, small: 9 },
    throw: { felt: { left: rail + 8, right: width - rail, top: rail, bottom: height - rail }, die: 26, hand: { x: 306, y: 206 } },
    center: {
      width,
      height: 186,
      rail,
      live: propositions(18, 18, 324, { seven: 30, hard: 48, ends: 36, craps: 30 }, 4, 4),
      type: { number: 18, label: 13, small: 9.5 },
    },
  };
}

function full(): TableLayout {
  const width = 1000;
  const height = 440;
  const rail = 18;
  const places = row(74, 58, 330, 96, 6);
  const middle: Box = { x: 410, y: 24, w: 180, h: 392 };
  return {
    kind: 'full',
    width,
    height,
    rail,
    rubber: { x: rail, y: rail, w: 10, h: height - 2 * rail },
    nearRubber: { x: width - rail - 10, y: rail, w: 10, h: height - 2 * rail },
    middle,
    live: [
      { id: 'dontCome', box: { x: 74, y: 24, w: 330, h: 32 } },
      ...PLACE_IDS.map((id, i) => ({ id, box: places[i] })),
      { id: 'come', box: { x: 74, y: 156, w: 330, h: 86 } },
      { id: 'field', box: { x: 74, y: 244, w: 330, h: 60 } },
      { id: 'dontPass', box: { x: 74, y: 306, w: 262, h: 40 } },
      { id: 'dontPassOdds', box: { x: 338, y: 306, w: 66, h: 40 } },
      { id: 'pass', box: { x: 32, y: 348, w: 304, h: 68 }, more: [{ x: 32, y: 24, w: 40, h: 322 }] },
      { id: 'passOdds', box: { x: 338, y: 348, w: 66, h: 68 } },
      ...propositions(middle.x, 24, middle.w, { seven: 50, hard: 72, ends: 58, craps: 52 }, 2, 4),
    ],
    mirror: true,
    puckOff: { x: 52, y: 40 },
    puck: 34,
    type: { number: 40, label: 18, small: 12 },
    throw: { felt: { left: rail + 10, right: width - rail - 10, top: rail, bottom: height - rail }, die: 30, hand: { x: 912, y: 370 } },
    center: null,
  };
}

export const TABLES: Record<TableKind, TableLayout> = { half: half(), full: full() };

/** Every live area of a table, the stickman's box's among them. */
export const liveAreas = (layout: TableLayout): LiveArea[] => [...layout.live, ...(layout.center?.live ?? [])];

/** A box as a share of its felt, for placing what is drawn over the art. */
export const share = (felt: { width: number; height: number }, box: Box) => ({
  left: `${(box.x / felt.width) * 100}%`,
  top: `${(box.y / felt.height) * 100}%`,
  width: `${(box.w / felt.width) * 100}%`,
  height: `${(box.h / felt.height) * 100}%`,
});

/** A box mirrored end for end across the table. */
export const mirrored = (layout: { width: number }, box: Box): Box => ({ ...box, x: layout.width - box.x - box.w });
