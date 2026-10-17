/**
 * The camera that looks down into the cabinet from the player's side. It turns
 * a point of the cabinet — across, up, and out from the back wall — into a
 * pixel of the drawing, and a pixel back into a point on the field for the
 * pointer. It also says where the screen is in the back wall and how the page
 * is to stand its screen there, so that the screen is seen through the same
 * camera as everything in front of it.
 */

import { FIELD, MEDAL_THICKNESS, PUSHER } from './engine';

/**
 * How much of the drawing is above what it showed when the back wall was a
 * low panel: the rest of the wall, which is the screen. The camera has not
 * moved to make room for it. The drawing grew upward by this much and the
 * camera's middle went down the drawing by the same, so every point of the
 * field is as far from the bottom edge and the sides as it ever was.
 */
export const UPPER = 320;
/** The drawing's own size in pixels; the canvas scales it to whatever room it has. */
export const VIEW = { width: 640, height: 540 + UPPER } as const;

/** Heights above the lower table, in field units. */
export const HEIGHT = {
  /** The top of the pusher, where dropped medals land. */
  pusher: PUSHER.height,
  /** How thick a medal is. */
  medal: MEDAL_THICKNESS,
  sideWall: 13,
  /** The top of the back wall, with the screen's housing in it, and of the side walls. */
  top: 102,
} as const;

const CAMERA = { height: 150, depth: 215 } as const;
/** Where the camera is, as a place in the cabinet: over the middle of the field, in front of it. */
export const EYE_AT = { x: FIELD.width / 2, height: CAMERA.height, depth: CAMERA.depth } as const;
/** The depth on the table that the camera looks at. */
const LOOK_AT = 52;
const FOCAL = 1095;
const CENTRE = { x: VIEW.width / 2, y: 306 + UPPER } as const;

// The camera looks along `forward`; `up` is the drawing's vertical. Both lie in the plane down the middle of the field.
const reach = Math.hypot(CAMERA.height, CAMERA.depth - LOOK_AT);
const FORWARD = { y: -CAMERA.height / reach, z: (LOOK_AT - CAMERA.depth) / reach } as const;
const UP = { y: -FORWARD.z, z: FORWARD.y } as const;

export interface Projected {
  x: number;
  y: number;
  /** Pixels per field unit at that distance from the camera. */
  scale: number;
  /** How round a disc lying flat looks from here: its height on the drawing over its width. */
  tilt: number;
}

/** Where a point of the cabinet appears on the drawing. `x` runs across the field, `depth` from the back wall. */
export function project(x: number, height: number, depth: number): Projected {
  const vx = x - FIELD.width / 2;
  const vy = height - CAMERA.height;
  const vz = depth - CAMERA.depth;
  const distance = vy * FORWARD.y + vz * FORWARD.z;
  const scale = FOCAL / distance;
  return {
    x: CENTRE.x + vx * scale,
    y: CENTRE.y - (vy * UP.y + vz * UP.z) * scale,
    scale,
    tilt: Math.abs(vy) / Math.hypot(vx, vy, vz),
  };
}

/** How many pixels a field unit of height covers at a projected point. */
export const rise = (point: Projected): number => point.scale * UP.y;

/**
 * The point at `height` above the table that a pixel of the drawing shows, or
 * null when the pixel looks above the horizon and never meets that level.
 */
export function unproject(px: number, py: number, height: number): { x: number; depth: number } | null {
  const across = (px - CENTRE.x) / FOCAL;
  const upward = (CENTRE.y - py) / FOCAL;
  const dirY = FORWARD.y + upward * UP.y;
  const dirZ = FORWARD.z + upward * UP.z;
  if (dirY >= -1e-9) return null;
  const t = (height - CAMERA.height) / dirY;
  return { x: FIELD.width / 2 + t * across, depth: CAMERA.depth + t * dirZ };
}

/** The point of the back panel that a pixel of the drawing shows: how far across, and how high above the table. */
export function unprojectPanel(px: number, py: number): { x: number; height: number } | null {
  const across = (px - CENTRE.x) / FOCAL;
  const upward = (CENTRE.y - py) / FOCAL;
  const dirZ = FORWARD.z + upward * UP.z;
  if (dirZ >= -1e-9) return null;
  const t = -CAMERA.depth / dirZ;
  return { x: FIELD.width / 2 + t * across, height: CAMERA.height + t * (FORWARD.y + upward * UP.y) };
}

// ── The open sides ──────────────────────────────────────────────────────────

/**
 * The chute beside each open stretch of the lower table, which a medal
 * pushed off that side goes down. It starts `drop` below the table's edge
 * and falls away by `slope` for every unit out from it: gently, since the
 * steeper it is the more it turns away from the player, who looks down on it
 * from the middle of the cabinet. On it are arrows that point the way out,
 * one at each of the depths in `marks`: an arrow's barbs start `near` out
 * from the table's edge and meet at its point, `far` out, and it is `span`
 * from the end of one barb to the end of the other.
 */
export const CHUTE = { drop: 1.5, slope: 0.3, marks: [82.5, 89, 95.5], near: 1.4, far: 5.5, span: 5 } as const;

/** How high the chute is `out` from the edge of the table: under the table, so less than nothing. */
export const chuteHeight = (out: number): number => -(CHUTE.drop + out * CHUTE.slope);

// ── The screen ──────────────────────────────────────────────────────────────

/**
 * The housing the screen sits in, which is the cabinet's back wall above the
 * pusher: a strip of lights down each side of the screen, a shelf under it
 * with the hold's lamps, and over it a hood that stands out from the wall,
 * with the hatch the prize balls come out of and the slot the machine pays
 * its medals from. Under the shelf the wall is a plain panel down to the
 * pusher.
 */
export const HOUSING = {
  /** How wide each strip of lights is. */
  side: 4,
  /** The shelf: from this height up to the foot of the screen, standing this far out from the wall. */
  shelf: 24,
  ledge: 1.2,
  /** The hood: from this height up to the top of the wall, standing this far out from it. */
  hood: 90.5,
  out: 6,
  /** How far the housing laps over the edge of the screen all round. */
  lap: 0.6,
} as const;

/**
 * The hold's lamps on the front of the shelf: how many, one for each spin
 * the machine can hold (`MAX_STOCK` in session.ts, which this file cannot
 * read without reading itself; the tests hold the two to each other), where
 * the first one is across the field, how far it is from one to the next, how
 * big each is, and where the word that names them is. The ten of them and
 * their word sit in the middle of the shelf, between the two tube windows.
 */
export const HOLD_LAMPS = { count: 10, first: FIELD.width / 2 - 10.4, step: 3.6, radius: 1.3, label: FIELD.width / 2 - 18.4 } as const;

/**
 * The screen itself: the part of the back wall the page's screen is stood
 * on, from side strip to side strip and from the shelf up to under the hood.
 * Everything else in the cabinet is in front of it. The page lays its screen
 * out on a sheet this many of its own pixels to a field unit, which is about
 * what a unit of the wall covers on the drawing, so the sheet is shown at
 * close to its own size and stays sharp.
 */
export const SCREEN = { left: HOUSING.side, right: FIELD.width - HOUSING.side, foot: 28, top: 89, perUnit: 5 } as const;

/**
 * How the page stands that sheet on the wall. A browser can look at a sheet
 * through a pinhole camera of its own: `perspective` is how far the eye is
 * from the page, `origin` where it looks straight at, and a sheet moved by
 * (x, y, z) and tipped back by `tilt` about its top edge is drawn as the eye
 * sees it. These are the numbers that make that camera this one and put the
 * sheet where the screen is, so its picture and the scene in front of it are
 * seen from the same place at any size. Lengths are in pixels of the
 * drawing; `tilt` is in radians, and negative: the foot of the wall is
 * further from the eye than its top.
 */
export interface ScreenPlacement {
  /** The sheet's own size before it is stood on the wall. */
  width: number;
  height: number;
  perspective: number;
  origin: { x: number; y: number };
  x: number;
  y: number;
  z: number;
  tilt: number;
  /** How much smaller the sheet is made first: a pixel of it is this much of a field unit. */
  scale: number;
}

export function screenPlacement(): ScreenPlacement {
  // The top left corner of the screen as the camera has it: across from its middle, down from it, and how far off.
  const vx = SCREEN.left - FIELD.width / 2;
  const vy = SCREEN.top - CAMERA.height;
  const vz = -CAMERA.depth;
  return {
    width: (SCREEN.right - SCREEN.left) * SCREEN.perUnit,
    height: (SCREEN.top - SCREEN.foot) * SCREEN.perUnit,
    perspective: FOCAL,
    origin: { x: CENTRE.x, y: CENTRE.y },
    x: CENTRE.x + vx,
    y: CENTRE.y - (vy * UP.y + vz * UP.z),
    z: FOCAL - (vy * FORWARD.y + vz * FORWARD.z),
    tilt: Math.atan2(FORWARD.y, UP.y),
    scale: 1 / SCREEN.perUnit,
  };
}

/**
 * Where a point of the sheet ends up on the drawing when a browser has done
 * all of the above to it: (across, down) from the sheet's top left corner,
 * in the sheet's own pixels. It is the browser's arithmetic written out, so
 * that a test can hold it to `project`.
 */
export function onScreen(across: number, down: number): { x: number; y: number } {
  const p = screenPlacement();
  const x = p.x + across * p.scale;
  const y = p.y + down * p.scale * Math.cos(p.tilt);
  const z = p.z + down * p.scale * Math.sin(p.tilt);
  const seen = p.perspective / (p.perspective - z);
  return { x: p.origin.x + (x - p.origin.x) * seen, y: p.origin.y + (y - p.origin.y) * seen };
}

/**
 * The point of the back wall that hides behind a point of the cabinet, as
 * the camera sees it: where something in front of the screen is seen against
 * it.
 */
export function wallBehind(x: number, height: number, depth: number): { x: number; height: number } {
  const stretch = CAMERA.depth / (CAMERA.depth - depth);
  return { x: FIELD.width / 2 + (x - FIELD.width / 2) * stretch, height: CAMERA.height + (height - CAMERA.height) * stretch };
}
