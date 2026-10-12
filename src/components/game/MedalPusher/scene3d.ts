/**
 * The field as the 3D renderer sees it, with no WebGL in it: the camera as a
 * matrix, the light that throws the shadows, and where every medal and ball
 * is this frame, written as rows of numbers the graphics card draws in one
 * go. All of it is plain arithmetic, so the tests can check it.
 */

import { letGoAt, rollingSpot } from './arms';
import { FIELD, MEDAL_RADIUS, RELEASE, SETTLE, type Arm, type FallingMedal, type Machine, type Medal } from './engine';
import { attitude, cross, dot, fromRows, meet, normalize, type Mat4, type Vec3 } from './mat4';
import { BALL_RADIUS, EXIT, EXIT_TIME, LIP_FALL, RIDE, liftOf, turnOf, type ExitingMedal } from './render';
import { HEIGHT, VIEW, project } from './view';

const R = MEDAL_RADIUS;
const P = HEIGHT.pusher;
const T = HEIGHT.medal;
const TAU = Math.PI * 2;

// ── The camera ──────────────────────────────────────────────────────────────

/**
 * `project` is a pinhole camera, so the pixel it gives a point, times the
 * point's distance, is a plain sum `a·x + b·height + c·depth + d` — and so is
 * the distance. Three of those sums are three rows of the matrix. They are
 * read off `project` itself, so the 3D scene cannot drift from the camera the
 * pointer and the 2D drawing use.
 */
const sumOf = (f: (x: number, height: number, depth: number) => number): number[] => {
  const d = f(0, 0, 0);
  return [(f(100, 0, 0) - d) / 100, (f(0, 100, 0) - d) / 100, (f(0, 0, 100) - d) / 100, d];
};
/** How far a point is from the camera, as field units per pixel of the drawing there. */
const distance = (x: number, height: number, depth: number): number => 1 / project(x, height, depth).scale;
const ACROSS = sumOf((x, height, depth) => project(x, height, depth).x * distance(x, height, depth));
const DOWN = sumOf((x, height, depth) => project(x, height, depth).y * distance(x, height, depth));
const AWAY = sumOf(distance);

/** Nothing nearer or further than this is drawn: from in front of the tray to behind the back panel. */
const NEAR = distance(FIELD.width / 2, HEIGHT.wall + 8, FIELD.depth + 14) * 0.6;
const FAR = distance(-40, -30, -4) * 1.25;

/** Where the camera is: the one point that is no distance from itself. */
export const EYE: Vec3 = meet([ACROSS, DOWN, AWAY]);

/** The camera when the cabinet stands still. The canvas's own coordinates run from −1 to 1 each way, up being up. */
const CAMERA = fromRows(new Float32Array(16), [
  ACROSS.map((value, i) => (value * 2) / VIEW.width - AWAY[i]),
  DOWN.map((value, i) => AWAY[i] - (value * 2) / VIEW.height),
  AWAY.map((value, i) => (value * (FAR + NEAR) - (i === 3 ? 2 * FAR * NEAR : 0)) / (FAR - NEAR)),
  AWAY,
]);

/**
 * The matrix that takes a point of the cabinet — across, up, toward the
 * player — to where the canvas shows it. `shake` moves the whole picture
 * sideways by that many pixels of the drawing.
 */
export function cameraMatrix(out: Mat4, shake = 0): Mat4 {
  out.set(CAMERA);
  for (let i = 0; i < 4; i++) out[i * 4] += (AWAY[i] * shake * 2) / VIEW.width;
  return out;
}

// ── The light ───────────────────────────────────────────────────────────────

/**
 * The way to the key light: over the back of the field and a little to the
 * left, like the lamps under the cabinet's roof. From there the medals glint
 * toward the player, and every shadow falls forward where it can be seen.
 */
export const KEY_LIGHT: Vec3 = normalize([-0.26, 0.9, -0.35]);

/** The part of the cabinet whose shadows are worked out: both tables and everything that stands on them. */
const LIT = { x: [-4, FIELD.width + 4], y: [-1, HEIGHT.wall + 6], z: [-2, FIELD.depth + 4] } as const;

/** The matrix that looks at the field from the key light, for the map of what its light reaches. */
export function lightMatrix(out: Mat4): Mat4 {
  const toward: Vec3 = [-KEY_LIGHT[0], -KEY_LIGHT[1], -KEY_LIGHT[2]];
  const side = normalize(cross(toward, [0, 0, 1]));
  const up = cross(side, toward);
  const row = (axis: Vec3): number[] => {
    let low = Infinity;
    let high = -Infinity;
    for (const x of LIT.x) {
      for (const y of LIT.y) {
        for (const z of LIT.z) {
          const along = dot(axis, [x, y, z]);
          low = Math.min(low, along);
          high = Math.max(high, along);
        }
      }
    }
    const scale = 2 / (high - low);
    return [axis[0] * scale, axis[1] * scale, axis[2] * scale, -(high + low) / (high - low)];
  };
  return fromRows(out, [row(side), row(up), row(toward), [0, 0, 0, 1]]);
}

// ── Medals and balls ────────────────────────────────────────────────────────

/**
 * Numbers per medal: where its middle is and a number of its own; its
 * attitude, as a quaternion; the height of whatever it lies on, how dark the
 * contact shadow under it is, how much light it still gets as it falls into
 * the dark, and one to spare.
 */
export const MEDAL_STRIDE = 12;
/** Numbers per ball, pin or bulb: where its middle is and how big it is; its colour; and what it is. */
export const BEAD_STRIDE = 8;

/** A growing list of rows for the graphics card. `count` rows are in use. */
export interface Rows {
  data: Float32Array;
  count: number;
  readonly stride: number;
}

export const createRows = (stride: number, capacity: number): Rows => ({ data: new Float32Array(stride * capacity), count: 0, stride });

/** The place of the next row, making the list longer first if it is full. */
function next(rows: Rows): number {
  if ((rows.count + 1) * rows.stride > rows.data.length) {
    const longer = new Float32Array(rows.data.length * 2);
    longer.set(rows.data);
    rows.data = longer;
  }
  return rows.count++ * rows.stride;
}

/** A number from 0 to 1 that is fixed by a medal's id: the same every frame, different for every medal. */
export function chance(id: number, salt: number): number {
  let h = Math.imul(id ^ Math.imul(salt + 1, 0x9e3779b9), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * How far out of level a medal lies, in radians. No medal in a heap lies
 * quite flat: one on the table by a degree or two, one on other medals by
 * several, since it rests on their edges. The engine knows nothing of this;
 * it is only how the medal is drawn, fixed by its id so that it never
 * flickers, and it is what makes each medal catch the lamps its own way.
 */
export const LEAN = { table: { least: 0.012, most: 0.05 }, pile: { least: 0.05, most: 0.13 } } as const;

/** How far a medal that has just come over the pusher's lip still is above the lower table. */
const lipDrop = (medal: Medal): number =>
  medal.level === 0 && medal.sinceDrop >= 0 && medal.sinceDrop < LIP_FALL ? P * (1 - (medal.sinceDrop / LIP_FALL) ** 2) : 0;

function medalRow(rows: Rows, id: number, x: number, y: number, z: number, turn: number, tilt: number, heading: number, ground: number, contact: number, light: number): void {
  const at = next(rows);
  const { data } = rows;
  data[at] = x;
  data[at + 1] = y;
  data[at + 2] = z;
  data[at + 3] = chance(id, 0);
  attitude(data, at + 4, turn, tilt, heading);
  data[at + 8] = ground;
  data[at + 9] = contact;
  data[at + 10] = light;
  data[at + 11] = 0;
}

/**
 * Where across the field the tip of a feed arm is. The machine swings each
 * tip itself and lets a medal go from wherever it has got to, so everything
 * that draws an arm or a medal on one reads the tip here and eases nothing.
 */
export const armTipAt = (machine: Pick<Machine, 'tips'>, arm: Arm): number => machine.tips[arm];

/**
 * A medal in the air. Let go on its edge, it turns over one and a quarter
 * times on the way down and lands flat: one the player fed starts at the tip
 * of its arm, standing as it rolled; one the machine pays, at the top of the
 * back panel. Off a falling tower it slides out, and the ones from high up
 * turn right over.
 */
function fallingRow(rows: Rows, medal: FallingMedal): void {
  const t = Math.min(1, Math.max(0, 1 - medal.remaining / medal.duration));
  const x = medal.fromX + (medal.x - medal.fromX) * t;
  const z = medal.fromY + (medal.y - medal.fromY) * t;
  if (medal.source === 'spill') {
    const from = P + T * (medal.rank + 1);
    const wobble = (0.5 + chance(medal.id, 3)) * 4 * t * (1 - t);
    const tilt = medal.rank > 9 ? Math.PI * t * t * (3 - 2 * t) + wobble * 0.4 : wobble;
    medalRow(rows, medal.id, x, T / 2 + (from - T) * (1 - t * t), z, turnOf(medal.id) + t * 5, tilt, (chance(medal.id, 4) - 0.5) * 1.2, 0, 0, 1);
    return;
  }
  // It comes down to where it will lie once it has landed, on top of the pile. One off an arm starts
  // where its rail left it, and only ever goes down from there.
  const offArm = medal.source === 'player';
  const height = P + (letGoAt(medal) - P) * (1 - t * t) + (T * 1.5 + RIDE * 0.5) * (offArm ? t * t : 1);
  // No two tumble quite alike on the way, but each starts on its edge and ends flat.
  const tilt = Math.PI * 2.5 * (1 - t) + (chance(medal.id, 3) - 0.5) * 1.2 * Math.sin(Math.PI * t);
  medalRow(rows, medal.id, x, height, z, turnOf(medal.id), tilt, (chance(medal.id, 4) - 0.5) * 0.9 * (offArm ? t : 1), 0, 0, 1);
}

/** How long a medal that has left by a side is still lit on its way down into the dark. */
const lightLeft = (exit: ExitingMedal): number => (exit.kind === 'won' ? 1 : Math.max(0, 1 - (exit.age / (EXIT_TIME * 0.7)) ** 2));

/**
 * Every medal there is to draw: the ones lying on the two tables, each
 * tower's column, the ones rolling down the feed arms, the ones in the air
 * and the ones that have just gone over an edge. Balls are not among them.
 */
export function writeMedals(rows: Rows, machine: Machine, exits: readonly ExitingMedal[]): void {
  rows.count = 0;
  for (const medal of machine.medals) {
    if (medal.ball) continue;
    const base = medal.level === 1 ? P : 0;
    const drop = lipDrop(medal);
    const lift = liftOf(medal);
    const { id } = medal;
    // It leans its own way and its own amount. A tower stands straight, and a medal that has just come
    // down is level and leans over as it settles, so nothing jumps as it lands.
    const lean = medal.tier === 1 ? LEAN.pile : LEAN.table;
    const settled = medal.grown < 1 ? (medal.grown - SETTLE.from) / (1 - SETTLE.from) : 1;
    let tilt = medal.stack > 1 ? 0 : (lean.least + (lean.most - lean.least) * chance(id, 1)) * settled;
    let heading = TAU * chance(id, 2);
    // One lying on others is held up by the edge it leans on, so its low side rests on them instead of sinking in.
    const propped = medal.tier === 1 ? R * Math.sin(tilt) : 0;
    // Coming over the lip it tips forward, and is level again as it lands.
    if (drop > 0) {
      tilt = 0.75 * Math.sin((Math.PI * medal.sinceDrop) / LIP_FALL);
      heading = (chance(id, 2) - 0.5) * 0.8;
    }
    const ground = base + (medal.tier === 1 ? T : 0);
    medalRow(rows, id, medal.x, base + drop + lift + propped + T / 2, medal.y, turnOf(id), tilt, heading, ground, drop > 0 ? 0 : 1, 1);
    // A tower: the rest of its medals, each a hair out of line with the one below.
    for (let i = 1; i < medal.stack; i++) {
      const dx = (chance(id, i * 2 + 5) - 0.5) * 0.2;
      const dz = (chance(id, i * 2 + 6) - 0.5) * 0.2;
      medalRow(rows, id + i * 31, medal.x + dx, base + T * (i + 0.5), medal.y + dz, turnOf(id + i * 7), 0, 0, 0, 0, 1);
    }
  }
  // On a feed arm a medal stands on its edge, its face to the player, and turns as it rolls. It
  // reaches the tip the way round it will lie, so nothing jumps as it tips over and falls.
  for (const medal of machine.rolling) {
    const tip = armTipAt(machine, medal.arm);
    const spot = rollingSpot(medal.arm, tip, medal.remaining);
    const still = rollingSpot(medal.arm, tip, 0).turned - spot.turned;
    medalRow(rows, medal.id, spot.x, spot.height, spot.depth, turnOf(medal.id) + still, Math.PI / 2, 0, 0, 0, 1);
  }
  for (const medal of machine.falling) if (!medal.ball) fallingRow(rows, medal);
  for (const exit of exits) {
    if (exit.ball) continue;
    const a = exit.age;
    const won = exit.kind === 'won';
    const light = lightLeft(exit);
    if (light <= 0) continue;
    const fall = (EXIT.gravity * a * a) / 2;
    const x = exit.x + (won ? 0 : exit.side * EXIT.sideways * a);
    const z = exit.y + (won ? EXIT.forward * a : 0);
    // It tips over the edge it left by: forward into the tray, or outward into the pit.
    const turned = Math.min(Math.PI, a * EXIT.turn);
    medalRow(rows, exit.id, x, T / 2 - fall, z, turnOf(exit.id), won ? turned : -exit.side * turned, won ? 0 : Math.PI / 2, 0, 0, light);
  }
}

/** What a bead is, as the number the shader reads: a prize ball, a pin of the back panel, or a bulb lit this far. */
export const BEAD = { ball: 0, pin: 1, bulb: (glow: number): number => 2 + glow } as const;

export function beadRow(rows: Rows, x: number, y: number, z: number, radius: number, r: number, g: number, b: number, kind: number): void {
  const at = next(rows);
  const { data } = rows;
  data[at] = x;
  data[at + 1] = y;
  data[at + 2] = z;
  data[at + 3] = radius;
  data[at + 4] = r;
  data[at + 5] = g;
  data[at + 6] = b;
  data[at + 7] = kind;
}

/** The prize balls: lying among the medals, on their way down the back panel, or going over the front. */
export function writeBalls(rows: Rows, machine: Machine, exits: readonly ExitingMedal[]): void {
  rows.count = 0;
  for (const medal of machine.medals) {
    if (medal.ball) beadRow(rows, medal.x, (medal.level === 1 ? P : 0) + lipDrop(medal) + BALL_RADIUS, medal.y, BALL_RADIUS, 1, 1, 1, BEAD.ball);
  }
  for (const medal of machine.falling) {
    if (!medal.ball) continue;
    const t = Math.min(1, Math.max(0, 1 - medal.remaining / medal.duration));
    const height = P + (RELEASE.height - P) * (1 - t * t);
    beadRow(rows, medal.fromX + (medal.x - medal.fromX) * t, height + BALL_RADIUS, medal.fromY + (medal.y - medal.fromY) * t, BALL_RADIUS, 1, 1, 1, BEAD.ball);
  }
  for (const exit of exits) {
    if (!exit.ball) continue;
    const fall = (EXIT.gravity * exit.age * exit.age) / 2;
    beadRow(rows, exit.x, BALL_RADIUS - fall, exit.y + EXIT.forward * exit.age, BALL_RADIUS, 1, 1, 1, BEAD.ball);
  }
}

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface Shape {
  /** Three numbers of position and three of the way the surface faces, per corner. */
  vertices: Float32Array;
  indices: Uint16Array;
}

/**
 * One medal lying flat at the origin, full size: two faces, a rim, and a
 * rounded edge between them that catches the light. `edge` is how far the
 * rounding reaches in from the rim; 0 leaves a plain cylinder.
 */
export function medalShape(segments: number, edge: number): Shape {
  const half = T / 2;
  // From the middle of the top face outward and down to the middle of the bottom: radius, height, and the lean of the surface.
  const rings: [number, number, number, number][] =
    edge > 0
      ? [
          [R - edge, half, 0, 1],
          [R - edge, half, 0.42, 0.91],
          [R, half - edge, 0.91, 0.42],
          [R, edge - half, 0.91, -0.42],
          [R - edge, -half, 0.42, -0.91],
          [R - edge, -half, 0, -1],
        ]
      : [
          [R, half, 0, 1],
          [R, half, 1, 0],
          [R, -half, 1, 0],
          [R, -half, 0, -1],
        ];
  const vertices: number[] = [0, half, 0, 0, 1, 0];
  for (const [radius, y, out, up] of rings) {
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * TAU;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      vertices.push(radius * c, y, radius * s, out * c, up, out * s);
    }
  }
  const bottom = vertices.length / 6;
  vertices.push(0, -half, 0, 0, -1, 0);
  const indices: number[] = [];
  const ring = (index: number, i: number) => 1 + index * segments + (i % segments);
  for (let i = 0; i < segments; i++) {
    indices.push(0, ring(0, i + 1), ring(0, i));
    // The first and the last ring are the edges of the two faces; the bands between the others are the edge and the rim.
    for (let index = 1; index < rings.length - 2; index++) {
      indices.push(ring(index, i), ring(index, i + 1), ring(index + 1, i), ring(index, i + 1), ring(index + 1, i + 1), ring(index + 1, i));
    }
    indices.push(bottom, ring(rings.length - 1, i), ring(rings.length - 1, i + 1));
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

/** A ball of radius 1 at the origin. A point's position is also the way its surface faces. */
export function ballShape(around: number, down: number): Shape {
  const vertices: number[] = [];
  for (let j = 0; j <= down; j++) {
    const tilt = (j / down) * Math.PI;
    for (let i = 0; i <= around; i++) {
      const angle = (i / around) * TAU;
      const x = Math.sin(tilt) * Math.cos(angle);
      const y = Math.cos(tilt);
      const z = Math.sin(tilt) * Math.sin(angle);
      vertices.push(x, y, z, x, y, z);
    }
  }
  const indices: number[] = [];
  const at = (i: number, j: number) => j * (around + 1) + i;
  for (let j = 0; j < down; j++) {
    for (let i = 0; i < around; i++) {
      indices.push(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}
