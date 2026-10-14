/**
 * The field as the 3D renderer sees it, with no WebGL in it: the camera as a
 * matrix, the light that throws the shadows, and where every medal and ball
 * is this frame, written as rows of numbers the graphics card draws in one
 * go. All of it is plain arithmetic, so the tests can check it.
 */

import { ARMS, SLOT, airSpot, fedSpot, leftHeld } from './arms';
import { CATCHER, caught, rolling, underCatcher, type Caught } from './catcher';
import { FIELD, MEDAL_RADIUS, SETTLE, pusherFront, type Arm, type FallingMedal, type Machine, type Medal } from './engine';
import { JEWEL_FACETS, collectedJewel, fallingJewel, lyingJewel, type JewelSpot } from './jewel';
import { attitude, cross, dot, fromRows, meet, normalize, type Mat4, type Vec3 } from './mat4';
import { BALL_RADIUS, CHUTE_LEAN, EXIT, EXIT_TIME, LIP_FALL, RIDE, liftOf, railedJewel, turnOf, type ExitingMedal } from './render';
import { railed, sinking } from './sidehole';
import { HEIGHT, VIEW, chuteHeight, project } from './view';
import { onLift, pourPose } from './works';

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

/** Nothing nearer or further than this is drawn: from a medal held up to a slot, which is the nearest thing there is, to behind the back wall. */
const NEAR = distance(FIELD.width / 2, ARMS.collar.height + R, ARMS.collar.depth + SLOT.out + R) * 0.6;
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

/** The part of the cabinet whose shadows are worked out: both tables, everything that stands on them, and the feed arms over them, out to their slots. */
const LIT = { x: [-4, FIELD.width + 4], y: [-1, ARMS.collar.height + 6], z: [-2, ARMS.collar.depth + 8] } as const;

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
 * the dark, and how much nearer the eye than it is it takes its place in
 * depth, which is nothing for every medal but one on a tongue (`RIDER_LEAD`).
 */
export const MEDAL_STRIDE = 12;
/** Numbers per ball, stud or bulb: where its middle is and how big it is; its colour; and what it is. */
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

export function medalRow(rows: Rows, id: number, x: number, y: number, z: number, turn: number, tilt: number, heading: number, ground: number, contact: number, light: number, lead = 0): void {
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
  data[at + 11] = lead;
}

/**
 * A medal on a START slot's tongue is seen, all of it, from the lip to the
 * slot. It comes off the lip from among the medals that lie there, and the
 * ones behind it hang over the lip's edge, above it, by as much as half a
 * medal: square to the camera they would cover the back of it for the first
 * quarter of its ride, and most rides would begin half hidden. The canvas
 * draws a rider after everything on the pusher. Here it is drawn where it is
 * and takes its place in depth as if it were `most` field units nearer the
 * eye, which is further than anything hanging over the lip is above it; so
 * nothing on the pusher covers it, and everything nearer the eye than that
 * still does. The lead is all there while its middle is less than `from`
 * out from the lip, and none by `to`, where it starts to go over the
 * tongue's end: it goes into its slot, and under the slide, with no lead at
 * all. A medal that hangs on a tongue's
 * edge has `hanging` of it while it hangs, and loses it as it tips over,
 * between a lean of `level` and of `over` radians: it goes down into the
 * well behind the slide, which covers it. It has less than a rider has, so
 * that a medal riding down the tongue another hangs on is seen to pass over
 * it and not through it.
 */
export const RIDER_LEAD = { most: 4, hanging: 0.8, from: CATCHER.back - 0.4, to: CATCHER.back + 0.4, level: 0.3, over: 1 } as const;

const smooth = (from: number, to: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** How much nearer the eye a medal the catcher has takes its place in depth, in field units, with the lip `front` out from the back wall: see `RIDER_LEAD`. */
export function leadOf(held: Pick<Caught, 'leg' | 'depth' | 'tilt' | 'chucker'>, front: number): number {
  if (held.leg !== 'tongue') return 0;
  const { most, hanging, from, to, level, over } = RIDER_LEAD;
  return most * (held.chucker >= 0 ? 1 : hanging) * (1 - smooth(from, to, held.depth - front)) * (1 - smooth(level, over, held.tilt));
}

/**
 * Where across the field the tip of a feed arm is. The machine swings each
 * tip itself and lets a medal go from wherever it has got to, so everything
 * that draws an arm or a medal on one reads the tip here and eases nothing.
 */
export const armTipAt = (machine: Pick<Machine, 'tips'>, arm: Arm): number => machine.tips[arm];

/** How high the middle of a medal is when it has only just come down on the pusher: on top of the pile, and not yet settled into it. */
export const LANDED = P + T * 1.5 + RIDE * 0.5;

/**
 * A medal in the air. One the player fed leaves the tip of its arm held as
 * it rolled, leaning on its edge, falls over onto its back on the way down
 * and lands flat. One the machine pays drops out of the slot under the hood
 * on its edge, and turns over one and a quarter times in front of the screen
 * before it lands. Off a falling tower it slides out, and the ones from high
 * up turn right over. One the hopper pours comes down a door's channel,
 * turns over once in the air and lands with a hop (works.ts). `arm` is the
 * arm a fed one left, if that is known; with `calm` a poured one neither
 * turns over nor hops.
 */
function fallingRow(rows: Rows, medal: FallingMedal, arm: Arm | undefined, calm: boolean): void {
  if (medal.source === 'pour') {
    // It comes out of the dark behind its door.
    const pose = pourPose(medal, LANDED, calm);
    if (pose.shown > 0) medalRow(rows, medal.id, pose.x, pose.height, pose.depth, turnOf(medal.id), pose.tilt, 0, 0, 0, pose.shown);
    return;
  }
  const t = Math.min(1, Math.max(0, 1 - medal.remaining / medal.duration));
  if (medal.source === 'spill') {
    const x = medal.fromX + (medal.x - medal.fromX) * t;
    const z = medal.fromY + (medal.y - medal.fromY) * t;
    const from = P + T * (medal.rank + 1);
    const wobble = (0.5 + chance(medal.id, 3)) * 4 * t * (1 - t);
    const tilt = medal.rank > 9 ? Math.PI * t * t * (3 - 2 * t) + wobble * 0.4 : wobble;
    medalRow(rows, medal.id, x, T / 2 + (from - T) * (1 - t * t), z, turnOf(medal.id) + t * 5, tilt, (chance(medal.id, 4) - 0.5) * 1.2, 0, 0, 1);
    return;
  }
  // It comes down to where it will lie once it has landed, on top of the pile.
  const at = airSpot(medal, LANDED);
  // No two come down quite alike, but each ends flat.
  const wobble = (chance(medal.id, 3) - 0.5) * 1.2 * Math.sin(Math.PI * t);
  if (medal.source === 'player') {
    const held = leftHeld(medal, arm);
    medalRow(rows, medal.id, at.x, at.height, at.depth, turnOf(medal.id), held.tilt * (1 - t * t * (3 - 2 * t)) + wobble * 0.5, held.heading, 0, 0, 1);
    return;
  }
  medalRow(rows, medal.id, at.x, at.height, at.depth, turnOf(medal.id), Math.PI * 2.5 * (1 - t) + wobble, (chance(medal.id, 4) - 0.5) * 0.9, 0, 0, 1);
}

/** How long a medal that has left by a side is still lit on its way down into the dark. */
const lightLeft = (exit: ExitingMedal): number => (exit.kind === 'won' ? 1 : Math.max(0, 1 - (exit.age / (EXIT_TIME * 0.7)) ** 2));

/**
 * Every medal there is to draw: the ones lying on the two tables, each
 * tower's column, the ones on their way in along the feed arms, the ones in
 * the air and the ones that have just gone over an edge. Balls and jewels are
 * not among them. `fed` says which arm each medal that has been seen on a
 * rail was on, so that one in the air leaves the rail it rolled down. `calm`
 * leaves the flourish out of how a poured medal comes down, and shows a
 * medal that goes into a START slot lying still in its mouth, and one that
 * has some of a tongue under it going straight down into the well; `wings`
 * says the slots' wings are open, as they are during chance time.
 */
export function writeMedals(rows: Rows, machine: Machine, exits: readonly ExitingMedal[], fed?: ReadonlyMap<number, Arm>, calm = false, wings = false): void {
  rows.count = 0;
  for (const medal of machine.medals) {
    if (medal.ball || medal.jewel) continue;
    // A tower that a lift still holds is not standing on the deck yet: the lift writes it, as far up through its hatch as it has come (works3d.ts).
    if (medal.stack + medal.grow > 1 && onLift(machine, medal)) continue;
    // One that has just come over the lip at the catcher is on its way down it: along its tongue and into its slot,
    // hanging on a tongue's edge, or going down into the well under the lip. Once it is down it is the engine's.
    const held = caught(medal, machine.time, calm, wings);
    const base = medal.level === 1 ? P : 0;
    const { id } = medal;
    // It leans its own way and its own amount. A tower stands straight, and a medal that has just come
    // down is level and leans over as it settles, so nothing jumps as it lands.
    const lean = medal.tier === 1 ? LEAN.pile : LEAN.table;
    const settled = medal.grown < 1 ? (medal.grown - SETTLE.from) / (1 - SETTLE.from) : 1;
    let tilt = medal.stack > 1 ? 0 : (lean.least + (lean.most - lean.least) * chance(id, 1)) * settled;
    let heading = TAU * chance(id, 2);
    // One lying on others is held up by the edge it leans on, so its low side rests on them instead of sinking in.
    const propped = medal.tier === 1 ? R * Math.sin(tilt) : 0;
    if (held) {
      // One on a tongue lies as the catcher has it, and one hanging on a tongue's edge is rocked over it; one going over the lip's edge into the well tips forward a little its own way.
      const own = held.leg === 'gap' && held.heading === 0 ? (chance(id, 2) - 0.5) * 0.5 : held.heading;
      medalRow(rows, id, held.x, held.height, held.depth, turnOf(id), held.tilt, own, 0, 0, held.light, leadOf(held, pusherFront(machine.time)));
      continue;
    }
    const x = medal.x;
    const z = medal.y;
    const drop = lipDrop(medal);
    const lift = liftOf(medal);
    // Coming over the lip beside the catcher it tips forward, and is level again as it lands.
    if (drop > 0) {
      tilt = 0.75 * Math.sin((Math.PI * medal.sinceDrop) / LIP_FALL);
      heading = (chance(id, 2) - 0.5) * 0.8;
    }
    const ground = base + (medal.tier === 1 ? T : 0);
    medalRow(rows, id, x, base + drop + lift + propped + T / 2, z, turnOf(id), tilt, heading, ground, drop > 0 ? 0 : 1, 1);
    // A tower: the rest of its medals, each a hair out of line with the one below.
    for (let i = 1; i < medal.stack; i++) {
      const dx = (chance(id, i * 2 + 5) - 0.5) * 0.2;
      const dz = (chance(id, i * 2 + 6) - 0.5) * 0.2;
      medalRow(rows, id + i * 31, medal.x + dx, base + T * (i + 0.5), medal.y + dz, turnOf(id + i * 7), 0, 0, 0, 0, 1);
    }
  }
  // A fed medal is shown to its slot face on, turned edge on and taken in. From there to the tip of
  // its arm it rolls on its edge, leaning back in the channel. It reaches the tip the way round it
  // will lie, so nothing jumps as it leaves and falls over.
  for (const medal of machine.rolling) {
    const held = fedSpot(medal.arm, armTipAt(machine, medal.arm), medal.remaining);
    medalRow(rows, medal.id, held.x, held.height, held.depth, turnOf(medal.id) + held.turn, held.tilt, held.heading, 0, 0, 1);
  }
  for (const medal of machine.falling) if (!medal.ball && !medal.jewel) fallingRow(rows, medal, fed?.get(medal.id), calm);
  for (const exit of exits) {
    if (exit.ball || exit.jewel) continue;
    const a = exit.age;
    const won = exit.kind === 'won';
    const light = lightLeft(exit);
    if (light <= 0) continue;
    // Over the front edge at a side hole's mouth it tips nose down into the mouth, under the bars across it, and on to the chute.
    if (exit.corner) {
      const sunk = sinking(exit.x, exit.y, exit.side, a, T);
      medalRow(rows, exit.id, sunk.x, sunk.height, sunk.depth, turnOf(exit.id), sunk.tilt, 0, 0, 0, light);
      continue;
    }
    const fall = (EXIT.gravity * a * a) / 2;
    const x = exit.x + (won ? 0 : exit.side * EXIT.sideways * a);
    const z = exit.y + (won ? EXIT.forward * a : 0);
    // It tips over the edge it left by: forward into the tray, or outward onto the chute, which it then slides down, lying along it.
    if (won) {
      medalRow(rows, exit.id, x, T / 2 - fall, z, turnOf(exit.id), Math.min(Math.PI, a * EXIT.turn), 0, 0, 0, light);
      continue;
    }
    const slide = chuteHeight(Math.max(0, exit.side < 0 ? -x : x - FIELD.width)) + T / 2 + 0.05;
    medalRow(rows, exit.id, x, Math.max(T / 2 - fall, slide), z, turnOf(exit.id), -exit.side * Math.min(CHUTE_LEAN, a * EXIT.turn), Math.PI / 2, 0, 0, light);
  }
}

/**
 * The jewels: lying among the medals, thrown from the hatch, or going over
 * the front: into the tray, or at a corner along the bars across a side
 * hole's mouth and then into it. A row is a medal's row, since a stone is
 * held the way a medal is: a place and an attitude. `calm` leaves the roll
 * along the bars out.
 */
export function writeJewels(rows: Rows, machine: Machine, exits: readonly ExitingMedal[], calm = false): void {
  rows.count = 0;
  const row = (spot: JewelSpot) => medalRow(rows, spot.id, spot.x, spot.height, spot.depth, spot.turn, spot.tilt, spot.heading, 0, 0, spot.light);
  for (const medal of machine.medals) if (medal.jewel) row(lyingJewel(medal, machine.time));
  for (const medal of machine.falling) if (medal.jewel) row(fallingJewel(medal));
  for (const exit of exits) if (exit.jewel) row(exit.corner ? railedJewel(exit, calm) : collectedJewel(exit.id, exit.x, exit.y, exit.age));
}

/** What a bead is, as the number the shader reads: a prize ball, a stud of polished metal, or a bulb lit this far. */
export const BEAD = { ball: 0, stud: 1, bulb: (glow: number): number => 2 + glow } as const;

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

/**
 * The prize balls: lying among the medals, on their way down from the hatch,
 * or going over the front. A ball that lies on the lower table under the
 * catcher, wholly or in part, goes into `under` instead, if that is given:
 * it is taller than the catcher, and whoever draws it has to hide what of it
 * is under there. One that has just come over the lip at the catcher is on
 * its slide, rolling down it and off its foot, where the catcher has it;
 * and one that has come down in front of the foot stands there, where the
 * catcher has it, until the engine has it there too: under the catcher's
 * hood too, when the catcher comes over it. One that went over the front at
 * a corner is on the bars across the side hole's mouth, rolling along them to
 * the tray; with `calm` it crosses them the way it was going.
 */
export function writeBalls(rows: Rows, machine: Machine, exits: readonly ExitingMedal[], under?: Rows, calm = false): void {
  rows.count = 0;
  if (under) under.count = 0;
  for (const medal of machine.medals) {
    if (!medal.ball) continue;
    const rolled = rolling(medal, BALL_RADIUS, machine.time);
    if (rolled && rolled.leg !== 'table') {
      beadRow(rows, rolled.x, rolled.height, rolled.depth, BALL_RADIUS, 1, 1, 1, BEAD.ball);
      continue;
    }
    // Where it stands: where the catcher has it, if the catcher has it on the lower table, and where the engine has it if not.
    const x = rolled ? rolled.x : medal.x;
    const z = rolled ? rolled.depth : medal.y;
    const dropping = !rolled && medal.level === 0 && medal.sinceDrop >= 0 && medal.sinceDrop < LIP_FALL;
    if (medal.level === 0 && !dropping && underCatcher(x, z, BALL_RADIUS, machine.time)) {
      beadRow(under ?? rows, x, BALL_RADIUS, z, BALL_RADIUS, 1, 1, 1, BEAD.ball);
      continue;
    }
    beadRow(rows, x, (medal.level === 1 ? P : 0) + (rolled ? 0 : lipDrop(medal)) + BALL_RADIUS, z, BALL_RADIUS, 1, 1, 1, BEAD.ball);
  }
  for (const medal of machine.falling) {
    if (!medal.ball) continue;
    const at = airSpot(medal, P + BALL_RADIUS);
    beadRow(rows, at.x, at.height, at.depth, BALL_RADIUS, 1, 1, 1, BEAD.ball);
  }
  for (const exit of exits) {
    if (!exit.ball) continue;
    if (exit.corner) {
      const at = railed(exit.x, exit.y, exit.side, exit.age, BALL_RADIUS, calm);
      beadRow(rows, at.x, at.height, at.depth, BALL_RADIUS, 1, 1, 1, BEAD.ball);
      continue;
    }
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
 * How far the rounding of a medal's edge reaches in from its rim, across its
 * face and down its side: a little under a fifth of its thickness, which
 * leaves the middle three fifths of its side a plain rim however thick it is.
 */
export const MEDAL_EDGE = T * 0.19;

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

/**
 * One jewel standing at the origin, the middle of its girdle there: every
 * face flat, with corners of its own that all face the way the face does.
 */
export function jewelShape(): Shape {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const { corners, normal } of JEWEL_FACETS) {
    const first = vertices.length / 6;
    for (const corner of corners) vertices.push(corner[0], corner[1], corner[2], normal[0], normal[1], normal[2]);
    // A face with more than three corners is a fan from its first.
    for (let i = 1; i + 1 < corners.length; i++) indices.push(first, first + i, first + i + 1);
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
