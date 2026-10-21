/**
 * How the cabinet is seen: from in front and above, square on, with no perspective, so that a thing moved across or
 * along the field moves the same on the screen wherever it is (a parallel projection). That is what lets the
 * carousel turn on the compositor while the machine stands unplayed (Stage.tsx): the deck is a flat picture turned
 * and squashed, and the skirt a picture slid round an ellipse, both exact.
 *
 * A point of the cabinet, `x` across and `y` back to front in medal radii, `z` up from the field, is drawn at
 * `((x - VIEW.left) * s, (y * DEPTH_SQUASH - z * HEIGHT_SQUASH - VIEW.top) * s)` on a stage `s` pixels a medal radius.
 */

import { AXIS, CAROUSEL, FIELD, MEDAL_RADIUS, RING, TIMES, type Air } from './engine';

/** How much a distance back to front is shortened on the screen, and a height. */
export const DEPTH_SQUASH = 0.62;
export const HEIGHT_SQUASH = 0.8;

/** The part of the cabinet the stage shows, in the stage's own units (medal radii across, squashed down). */
export const VIEW = { left: -1.6, top: -6.4, width: FIELD.width + 3.2, height: 26.4 } as const;

/** Heights: the deck, the tip of the rail, the treasure dish, and how high a thrown medal goes. */
export const HEIGHTS = { deck: CAROUSEL.height, tip: CAROUSEL.height + 1.4, dish: CAROUSEL.height + 3.6, throw: 6 } as const;

/** Where the rail starts, at the back on the left, and where its tip is: over the drop spot. */
export const RAIL = {
  from: { x: 2.4, y: -2.6, z: 9.2 },
  to: { x: AXIS.x, y: AXIS.y + RING, z: CAROUSEL.height + 1.4 },
} as const;

export interface Point {
  x: number;
  y: number;
}

/** A point of the cabinet on the stage, in stage units (multiply by the scale for pixels). */
export function project(x: number, y: number, z = 0): Point {
  return { x: x - VIEW.left, y: y * DEPTH_SQUASH - z * HEIGHT_SQUASH - VIEW.top };
}

/** A medal in the air at a moment (`now`, in steps, fractional), as the stage draws it: where, how high, and whether it shows. */
export interface AirMedal {
  id: number;
  x: number;
  y: number;
  z: number;
  /** How far it is turned over (0 lying flat, 1 on its edge): a medal rolling down the rail stands on its edge. */
  edge: number;
  /** How big it is drawn (1 whole; a medal going down a hole shrinks). */
  size: number;
}

const ease = (k: number): number => k * k * (3 - 2 * k);
const clamp01 = (k: number): number => (k < 0 ? 0 : k > 1 ? 1 : k);

/**
 * Where a medal in the air is drawn at `now` (fractional steps). `deckAt` gives a point of the deck on the field at a
 * moment (engine.ts `deckToField`, at a fractional angle). Null for one not to be drawn.
 */
export function airMedalAt(a: Air, now: number, deckAt: (qx: number, qy: number, now: number) => Point): AirMedal | null {
  const k = clamp01((now - a.from) / Math.max(1, a.at - a.from));
  switch (a.k) {
    case 'rail': {
      if (now < a.from) return null;
      // In at the slot, then down the rail on its edge to the tip.
      const along = clamp01((now - a.from) / TIMES.rail);
      const e = along * along;
      return {
        id: a.id,
        x: RAIL.from.x + (RAIL.to.x - RAIL.from.x) * e,
        y: RAIL.from.y + (RAIL.to.y - RAIL.from.y) * e,
        z: RAIL.from.z + (RAIL.to.z - RAIL.from.z) * e + MEDAL_RADIUS,
        edge: 1,
        size: 1,
      };
    }
    case 'drop': {
      // Off the tip, turning over as it falls to the deck.
      const fall = k * k;
      return { id: a.id, x: RAIL.to.x + (a.x - RAIL.to.x) * ease(k), y: RAIL.to.y + (a.y - RAIL.to.y) * ease(k), z: HEIGHTS.tip + MEDAL_RADIUS * (1 - k) - (HEIGHTS.tip - HEIGHTS.deck) * fall, edge: 1 - k, size: 1 };
    }
    case 'slide': {
      const q = deckAt(a.qx + (a.ex - a.qx) * k, a.qy + (a.ey - a.qy) * k, now);
      // Into a hole: it sinks and shrinks out of sight over the last third.
      const sink = a.pocket >= 0 ? clamp01((k - 0.55) / 0.45) : 0;
      return { id: a.id, x: q.x, y: q.y, z: HEIGHTS.deck - sink * 0.8, edge: 0, size: 1 - sink * 0.6 };
    }
    case 'off': {
      const fall = k * k;
      return { id: a.id, x: a.sx + (a.x - a.sx) * k, y: a.sy + (a.y - a.sy) * k, z: HEIGHTS.deck * (1 - fall), edge: 0.35 * Math.sin(Math.PI * k), size: 1 };
    }
    case 'fling': {
      const arc = 4 * k * (1 - k);
      return { id: a.id, x: AXIS.x + (a.x - AXIS.x) * k, y: AXIS.y + (a.y - AXIS.y) * k, z: HEIGHTS.dish * (1 - k) + HEIGHTS.throw * arc, edge: 0.5 * Math.sin(2 * Math.PI * k), size: 1 };
    }
  }
}
