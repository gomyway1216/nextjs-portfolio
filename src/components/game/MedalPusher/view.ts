/**
 * The camera that looks down into the cabinet from the player's side. It turns
 * a point on the field — across, up, and back from the wall — into a pixel of
 * the drawing, and a pixel back into a point on the field for the pointer.
 */

import { FIELD, MEDAL_THICKNESS } from './engine';

/** The drawing's own size in pixels; the canvas scales it to whatever room it has. */
export const VIEW = { width: 640, height: 540 } as const;

/** Heights above the lower table, in field units. */
export const HEIGHT = {
  /** The top of the pusher, where dropped medals land. */
  pusher: 6,
  /** How thick a medal is. */
  medal: MEDAL_THICKNESS,
  sideWall: 13,
  /** The top of the back panel, where medals are let go. */
  wall: 40,
} as const;

const CAMERA = { height: 150, depth: 215 } as const;
/** The depth on the table that the camera looks at. */
const LOOK_AT = 52;
const FOCAL = 1095;
const CENTRE = { x: VIEW.width / 2, y: 306 } as const;

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
