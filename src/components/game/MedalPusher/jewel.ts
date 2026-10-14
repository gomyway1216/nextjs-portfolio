/**
 * A jewel as a thing in the cabinet: the cut of the stone, facet by facet,
 * and where one that the machine holds is at this moment and how it is
 * turned. The engine knows a jewel as a medal that is marked as one: it has a
 * place on a table and is pushed about like any medal. This file says what
 * that looks like — the stone, lying on its point among the medals, thrown
 * from the hatch, going over the lip or over the front — so that the two
 * renderers draw the same stone in the same place. It decides nothing.
 *
 * The cabinet also has the jewel lamps: five of them, in a plate let into
 * the front of the lower table, under the edge a collected jewel goes over.
 */

import { airSpot } from './arms';
import { caught } from './catcher';
import { CHUCKERS } from './chuckers';
import { FIELD, MEDAL_RADIUS, MEDAL_THICKNESS, type FallingMedal, type Medal } from './engine';
import { JEWEL } from './lottery';
import { attitude, rotate, type Vec3 } from './mat4';
import { HEIGHT } from './view';

const TAU = Math.PI * 2;
const P = HEIGHT.pusher;
const T = MEDAL_THICKNESS;

/**
 * The cut. A stone is round, a little less across than a medal, and stands
 * on the point of its pavilion with its table up. From the girdle, which is
 * its widest, the crown goes up to the table and the pavilion down to the
 * point. It has `sides` corners round the girdle and as many round the
 * table, half a side on, so the crown is cut in twice that many triangles:
 * no two of them face the same way, and that is what makes it flash.
 */
export const JEWEL_CUT = { girdle: MEDAL_RADIUS - 0.15, table: 1.7, crown: 0.85, pavilion: 1.45, sides: 8 } as const;
/** How tall a stone stands. It is taller than two medals lying one on the other, and passes under the catcher on the pusher's front. */
export const JEWEL_HEIGHT = JEWEL_CUT.crown + JEWEL_CUT.pavilion;

/** One flat face of the stone: its corners, from the middle of the girdle (across, up, toward the player), anticlockwise seen from outside, and the way it faces. */
export interface Facet {
  corners: readonly Vec3[];
  normal: Vec3;
}

function facet(corners: Vec3[]): Facet {
  const [a, b, c] = corners;
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let normal: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  // The stone is rounded outward everywhere, so a face looks away from the middle of it.
  const middle: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3 + 0.2, (a[2] + b[2] + c[2]) / 3];
  const outward = normal[0] * middle[0] + normal[1] * middle[1] + normal[2] * middle[2] > 0;
  if (!outward) {
    corners.reverse();
    normal = [-normal[0], -normal[1], -normal[2]];
  }
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  return { corners, normal: [normal[0] / length, normal[1] / length, normal[2] / length] };
}

/**
 * Every face of the stone: the table first, then the crown's triangles round
 * it, then the pavilion's, which meet at the point.
 */
export const JEWEL_FACETS: readonly Facet[] = (() => {
  const { girdle, table, crown, pavilion, sides } = JEWEL_CUT;
  const onGirdle = (i: number): Vec3 => [Math.cos((i / sides) * TAU) * girdle, 0, Math.sin((i / sides) * TAU) * girdle];
  const onTable = (i: number): Vec3 => [Math.cos(((i + 0.5) / sides) * TAU) * table, crown, Math.sin(((i + 0.5) / sides) * TAU) * table];
  const point: Vec3 = [0, -pavilion, 0];
  const facets: Facet[] = [facet(Array.from({ length: sides }, (_, i) => onTable(i)))];
  for (let i = 0; i < sides; i++) {
    facets.push(facet([onGirdle(i), onGirdle(i + 1), onTable(i)]));
    facets.push(facet([onTable(i), onGirdle(i + 1), onTable(i + 1)]));
  }
  for (let i = 0; i < sides; i++) facets.push(facet([onGirdle(i), onGirdle(i + 1), point]));
  return facets;
})();

/** The corners of the girdle, round the stone, from the middle of it: the stone's outline, seen from above. */
export const JEWEL_GIRDLE: readonly Vec3[] = Array.from({ length: JEWEL_CUT.sides }, (_, i) => [Math.cos((i / JEWEL_CUT.sides) * TAU) * JEWEL_CUT.girdle, 0, Math.sin((i / JEWEL_CUT.sides) * TAU) * JEWEL_CUT.girdle]);

/** How many of the faces are the table and the crown: the ones seen from above. */
export const CROWN_FACETS = 1 + JEWEL_CUT.sides * 2;

/** Where the middle of a stone's girdle is, and how the stone is held there: the three angles `attitude` in mat4.ts takes, and how much light it still gets. */
export interface JewelSpot {
  id: number;
  x: number;
  height: number;
  depth: number;
  turn: number;
  tilt: number;
  heading: number;
  light: number;
}

/** A number from 0 to 1 fixed by a stone's id, so that no two lie alike and none flickers. */
const own = (id: number, salt: number): number => {
  const x = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** How long a stone that comes over the pusher's lip takes to drop to the lower table: as long as a medal does. */
const LIP_FALL = CHUCKERS.drop;

/**
 * A stone lying on a table, or on its way down from the pusher's lip. It
 * lies on its point, leaning a little its own way. Over the lip beside the
 * catcher it tips forward as a medal does and comes down level; at the
 * catcher it goes over the lip's edge and down into the well, out of the
 * light, as a medal that fits no START slot does.
 */
export function lyingJewel(medal: Medal, time: number): JewelSpot {
  const { id } = medal;
  const turn = own(id, 1) * TAU;
  const lean = 0.05 + 0.09 * own(id, 2);
  const heading = own(id, 3) * TAU;
  const behind = caught(medal, time);
  if (behind) return { id, x: behind.x, height: behind.height - T / 2 + JEWEL_CUT.pavilion, depth: behind.depth, turn, tilt: behind.tilt, heading: 0, light: behind.light };
  const dropping = medal.level === 0 && medal.sinceDrop >= 0 && medal.sinceDrop < LIP_FALL;
  if (dropping) {
    const fallen = medal.sinceDrop / LIP_FALL;
    return { id, x: medal.x, height: P * (1 - fallen * fallen) + JEWEL_CUT.pavilion, depth: medal.y, turn, tilt: lean + 0.75 * Math.sin(Math.PI * fallen), heading: 0, light: 1 };
  }
  return { id, x: medal.x, height: (medal.level === 1 ? P : 0) + JEWEL_CUT.pavilion, depth: medal.y, turn, tilt: lean, heading, light: 1 };
}

/** A stone the hatch has thrown, on its way to the table it will land on: it tumbles as it comes, and lands on its point. */
export function fallingJewel(medal: FallingMedal): JewelSpot {
  const t = Math.min(1, Math.max(0, 1 - medal.remaining / medal.duration));
  const at = airSpot(medal, (medal.level === 1 ? P : 0) + JEWEL_CUT.pavilion);
  const { id } = medal;
  return { id, x: at.x, height: at.height, depth: at.depth, turn: own(id, 1) * TAU + (1 - t) * 7, tilt: (0.05 + 0.09 * own(id, 2)) * t + 2.2 * Math.sin(Math.PI * t) * (1 - t), heading: own(id, 3) * TAU, light: 1 };
}

/** How a stone that has gone over the front moves: carried on at the pace it was pushed, pulled down, and turning over. */
const OVER = { forward: 15, gravity: 190, turn: 7 } as const;

/** A stone that went over the front `age` seconds ago, where it left the table at (x, depth): it tips forward and drops into the tray, catching the light as it turns. */
export function collectedJewel(id: number, x: number, depth: number, age: number): JewelSpot {
  return { id, x, height: JEWEL_CUT.pavilion - (OVER.gravity * age * age) / 2, depth: depth + OVER.forward * age, turn: own(id, 1) * TAU, tilt: Math.min(Math.PI, 0.1 + age * OVER.turn), heading: 0, light: 1 };
}

/**
 * How bright the glint on a lying stone's table is at this moment, from 0 to
 * 1. It comes and goes as the lamps drift over it, each stone in its own
 * time. With reduced motion it is a small steady one.
 */
export function jewelGlint(id: number, clock: number, calm: boolean): number {
  if (calm) return 0.35;
  const swing = Math.sin(clock * 2.6 + own(id, 4) * TAU);
  return swing > 0 ? swing ** 6 : 0;
}

const quaternion = new Float32Array(4);

/** Where a point of a stone held as `spot` says is in the cabinet: across, up from the lower table, out from the back wall. */
export function pointInCabinet(spot: JewelSpot, corner: Vec3): Vec3 {
  attitude(quaternion, 0, spot.turn, spot.tilt, spot.heading);
  const turned = rotate(quaternion, 0, corner);
  return [spot.x + turned[0], spot.height + turned[1], spot.depth + turned[2]];
}

/** The corners of one face of a stone held as `spot` says, as places in the cabinet (across, up from the lower table, out from the back wall), and the way the face looks. */
export function facetInCabinet(spot: JewelSpot, face: Facet): { corners: Vec3[]; normal: Vec3 } {
  attitude(quaternion, 0, spot.turn, spot.tilt, spot.heading);
  return {
    corners: face.corners.map((corner) => {
      const turned = rotate(quaternion, 0, corner);
      return [spot.x + turned[0], spot.height + turned[1], spot.depth + turned[2]] as Vec3;
    }),
    normal: rotate(quaternion, 0, face.normal),
  };
}

// ── The jewel lamps ─────────────────────────────────────────────────────────

/**
 * The jewel lamps: a plate let into the front of the lower table, in the
 * middle, with a lamp for each jewel of a set. A lamp is the shape of a cut
 * stone seen from the side: `radius` to either side of its middle and as far
 * down to its point. They are `step` apart, `height` below the table's edge
 * (so a negative height), and the plate reaches `margin` beyond the lamps
 * each way.
 */
export const JEWEL_LAMPS = { count: JEWEL.lamps, step: 6.4, radius: 2.3, height: -7.5, margin: { across: 2.6, up: 3.3 } } as const;

/** Where the middle of a lamp is across the field: the row is centred on the middle of the front. */
export const jewelLampX = (lamp: number): number => FIELD.width / 2 + (lamp - (JEWEL_LAMPS.count - 1) / 2) * JEWEL_LAMPS.step;

/** The plate the lamps are in: from where to where across the field, and from what height down to what. */
export const JEWEL_PLATE = {
  from: jewelLampX(0) - JEWEL_LAMPS.radius - JEWEL_LAMPS.margin.across,
  to: jewelLampX(JEWEL_LAMPS.count - 1) + JEWEL_LAMPS.radius + JEWEL_LAMPS.margin.across,
  top: JEWEL_LAMPS.height + JEWEL_LAMPS.margin.up,
  foot: JEWEL_LAMPS.height - JEWEL_LAMPS.margin.up,
} as const;

/**
 * The outline of a lamp about its middle, as shares of its radius: across to
 * the right and up. The flat top is the stone's table, the two corners below
 * it its girdle, and the bottom its point.
 */
export const LAMP_OUTLINE: readonly (readonly [number, number])[] = [
  [-0.55, 0.8],
  [0.55, 0.8],
  [1, 0.3],
  [0, -1],
  [-1, 0.3],
];

/**
 * Which lamps are lit, and how brightly, from 0 to 1. `lit` of them are lit
 * from the left. While a bonus is being shown (`show` seconds of it left,
 * out of `SHOW`) all of them are, and they flash unless the cabinet is calm.
 */
export const JEWEL_SHOW = 1.8;
export function lampLight(lamp: number, lit: number, show: number, clock: number, calm: boolean): number {
  if (show > 0) return calm ? 1 : 0.55 + 0.45 * Math.sign(Math.sin(clock * 22));
  return lamp < lit ? 1 : 0;
}
