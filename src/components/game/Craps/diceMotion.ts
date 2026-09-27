/**
 * Pure motion model for a throw of two dice across the table.
 *
 * Table units: x 0…100 left→right, y 0…TABLE_H top→bottom; the back wall (with
 * its rubber pyramids) runs along the top edge. Each die is thrown from the
 * shooter's end (bottom right), flies up the table, hits the back wall, then
 * bounces back with decaying hops while tumbling, and settles showing the
 * face the engine drew. `rng` only varies the look of the throw.
 *
 * u = normalized time 0…1:
 *   flight [0, uWall)       airborne toward the wall, spinning
 *   bounce [uWall, uSettle) off the wall, hopping and tumbling to a stop
 *   rest   [uSettle, 1]     still, final face up
 */

export const TABLE_H = 56;
export const WALL_Y = 5;
/** Die edge length in table units. */
export const DIE_SIZE = 10;
/** Minimum distance between the two dice at rest (no overlap). */
export const MIN_REST_GAP = DIE_SIZE * 1.3;
export const DICE_ROLL_MS = 1700;

const FACE_STEP = 0.045;

export interface DiePlan {
  face: number;
  start: { x: number; y: number; z: number };
  wall: { x: number; u: number };
  rest: { x: number; y: number; angle: number };
  uSettle: number;
  /** Face shown while tumbling, one per FACE_STEP. */
  tumble: number[];
  /** Face locks to the result from here on. */
  uLock: number;
  spin: number;
  hops: number;
  hopHeight: number;
}

export interface DieFrame {
  x: number;
  y: number;
  /** Height above the felt (drives scale and shadow). */
  z: number;
  angle: number;
  face: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function randomFace(rng: () => number, not: number): number {
  const f = 1 + Math.floor(rng() * 5);
  return f >= not ? f + 1 : f; // uniform over the five faces ≠ `not`
}

export function planThrow(faces: readonly [number, number], rng: () => number = Math.random): [DiePlan, DiePlan] {
  // The dice travel in lanes: the left die starts, hits the wall and comes to
  // rest to the left of the other, always at least MIN_REST_GAP apart. With a
  // shared timing every in-between frame blends those ordered anchor points,
  // so the gap never closes and the dice never overlap.
  const leftRest = { x: 30 + rng() * 26, y: 20 + rng() * 16 };
  const rightRest = { x: leftRest.x + MIN_REST_GAP + rng() * 14, y: 20 + rng() * 16 };
  const leftStart = { x: 78 + rng() * 3, y: 44 + rng() * 5 };
  const rightStart = { x: leftStart.x + MIN_REST_GAP + rng(), y: 44 + rng() * 5 };
  const leftWall = leftRest.x + (rng() - 0.5) * 8;
  const rightWall = Math.max(rightRest.x + (rng() - 0.5) * 8, leftWall + MIN_REST_GAP);
  const lanes = [
    { start: leftStart, wall: leftWall, rest: leftRest },
    { start: rightStart, wall: rightWall, rest: rightRest },
  ];
  const uWall = 0.34 + rng() * 0.08;
  const uSettle = 0.8 + rng() * 0.08;

  return faces.map((face, i) => {
    const lane = lanes[i];
    const tumble: number[] = [];
    let prev = 1 + Math.floor(rng() * 6);
    for (let k = 0; k * FACE_STEP < 1; k++) {
      tumble.push(prev);
      prev = randomFace(rng, prev);
    }
    return {
      face,
      // From the shooter's end, fully on the felt (y ≤ TABLE_H − DIE_SIZE / 2).
      start: { ...lane.start, z: 7 },
      wall: { x: lane.wall, u: uWall },
      rest: { ...lane.rest, angle: (rng() - 0.5) * 50 },
      uSettle,
      tumble,
      uLock: uWall + (uSettle - uWall) * (0.55 + rng() * 0.2),
      spin: (rng() < 0.5 ? -1 : 1) * (540 + rng() * 360),
      hops: 3,
      hopHeight: 5 + rng() * 3,
    };
  }) as [DiePlan, DiePlan];
}

export function dieFrameAt(plan: DiePlan, u: number): DieFrame {
  const t = clamp01(u);
  const wallY = WALL_Y + DIE_SIZE / 2;
  let x: number;
  let y: number;
  let z: number;

  if (t < plan.wall.u) {
    const s = t / plan.wall.u;
    x = lerp(plan.start.x, plan.wall.x, s);
    y = lerp(plan.start.y, wallY, s);
    // Thrown arc: from hand height, up, and down onto the wall.
    z = lerp(plan.start.z, 1, s) + 12 * 4 * s * (1 - s);
  } else if (t < plan.uSettle) {
    const s = (t - plan.wall.u) / (plan.uSettle - plan.wall.u);
    const eased = 1 - (1 - s) ** 3;
    x = lerp(plan.wall.x, plan.rest.x, eased);
    y = lerp(wallY, plan.rest.y, eased);
    z = plan.hopHeight * Math.abs(Math.sin(Math.PI * plan.hops * s)) * (1 - s) ** 1.5;
  } else {
    x = plan.rest.x;
    y = plan.rest.y;
    z = 0;
  }

  const spinProgress = clamp01(t / plan.uSettle);
  const angle = plan.rest.angle - plan.spin * (1 - spinProgress) ** 2;
  const face = t >= plan.uLock ? plan.face : plan.tumble[Math.min(plan.tumble.length - 1, Math.floor(t / FACE_STEP))];
  return { x, y, z, angle, face };
}
