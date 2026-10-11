/**
 * The cabinet as shapes: the tables, the back panel, the walls and gutters
 * that never move, the pusher, feed arms and gates that do, the bulbs and
 * pins, and the flat touches laid over them — glows, the dark where two
 * surfaces meet, the aim guide. Like the rest of the scene it is only
 * numbers; the renderer hands them to the graphics card.
 */

import { ARMS, armCollar, rollingSpot } from './arms';
import { CHECKERS, FIELD, LANDING, MEDAL_RADIUS, PUSHER, armFor, checkerShift, tipOf, type Arm, type Machine } from './engine';
import { PANEL_TOP, SIGN, TRAY_DROP, pinSpots } from './art3d';
import { BALL_RADIUS, GATE, GLOW_TIME, LIP_FALL, SPARK_COLORS, type DrawOptions, type Stage } from './render';
import { BEAD, EYE, armTipAt, beadRow, type Rows } from './scene3d';
import { HEIGHT } from './view';

const TAU = Math.PI * 2;
const R = MEDAL_RADIUS;
const W = FIELD.width;
const D = FIELD.depth;
const OPEN = FIELD.sideOpenFrom;
const P = HEIGHT.pusher;
const RAIL = HEIGHT.sideWall;
const WALL = HEIGHT.wall;
/** How far the wall above each rail stands back from it, which leaves a ledge for the bulbs. */
const LEDGE = 0.8;
/** How far the walls and the gutters beside the table reach outward, and how deep the gutters are. */
const OUT = 34;
const GUTTER = -12;
/** The slanted edge along the pusher's lip. */
const BEVEL = 0.4;
/**
 * A feed arm's channel, as the canvas renderer draws it: the room left over
 * a medal's head, how far its track runs on behind the collar and how big
 * the collar is. And what only a solid one has: how thick its two bars are,
 * and how far from the back panel its back and its front stand, with the
 * medal rolling between them.
 */
const CHANNEL = { headroom: 0.7, tail: 2, collar: 3.4, bar: 0.34, back: ARMS.depth - 0.85, front: ARMS.depth + 0.85 } as const;
/** How far a collar stands out from the back panel: past the front of the channel, so the rail and a medal going in are inside it. */
const COLLAR_FACE = CHANNEL.front + 0.85;
/** The collars never move. */
const COLLARS = [armCollar(0), armCollar(1)] as const;

export type Rgb = readonly [number, number, number];

/** A colour as the amounts of light the shaders work in, from the hex the 2D drawing uses. */
export function light(hex: string, gain = 1): Rgb {
  const value = parseInt(hex.slice(1), 16);
  const channel = (byte: number) => (byte / 255) ** 2.2 * gain;
  return [channel(value >> 16), channel((value >> 8) & 255), channel(value & 255)];
}

const WHITE: Rgb = [1, 1, 1];
const BLACK: Rgb = [0, 0, 0];

// ── Solid surfaces ──────────────────────────────────────────────────────────

/** Numbers per corner of a solid surface: where, which way it faces, where in its picture, its colour, how glossy, how self-lit. */
export const SOLID_STRIDE = 13;

/**
 * A list of four-cornered surfaces. The colour, finish and picture of the
 * next ones are set first, like choosing a pen, so drawing one takes only its
 * corners and nothing is allocated on the way.
 */
export class Solid {
  data: Float32Array;
  /** Corners written so far: six to a surface. */
  count = 0;
  private top: Rgb = WHITE;
  private bottom: Rgb = WHITE;
  private gloss = 0;
  private glow = 0;
  private u0 = 0;
  private v0 = 0;
  private u1 = 1;
  private v1 = 1;

  constructor(corners: number) {
    this.data = new Float32Array(corners * SOLID_STRIDE);
  }

  clear(): this {
    this.count = 0;
    return this;
  }

  /** The colour of the first two corners of each surface, and of the last two if it shades from one to the other. */
  paint(top: Rgb, bottom: Rgb = top): this {
    this.top = top;
    this.bottom = bottom;
    return this;
  }

  /** How much the surface mirrors the cabinet (0 to 1), and how much of its colour it gives off as light of its own. */
  finish(gloss: number, glow = 0): this {
    this.gloss = gloss;
    this.glow = glow;
    return this;
  }

  /** The part of the picture the next surfaces show: its first corner, and the corner opposite. */
  map(u0 = 0, v0 = 0, u1 = 1, v1 = 1): this {
    this.u0 = u0;
    this.v0 = v0;
    this.u1 = u1;
    this.v1 = v1;
    return this;
  }

  private corner(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, colour: Rgb): void {
    if ((this.count + 1) * SOLID_STRIDE > this.data.length) {
      const longer = new Float32Array(this.data.length * 2);
      longer.set(this.data);
      this.data = longer;
    }
    const { data } = this;
    let at = this.count++ * SOLID_STRIDE;
    data[at++] = x;
    data[at++] = y;
    data[at++] = z;
    data[at++] = nx;
    data[at++] = ny;
    data[at++] = nz;
    data[at++] = u;
    data[at++] = v;
    data[at++] = colour[0];
    data[at++] = colour[1];
    data[at++] = colour[2];
    data[at++] = this.gloss;
    data[at] = this.glow;
  }

  /**
   * A surface with corners a, b, c, d in order round it. The picture runs
   * from a to b across and from a to d down. Whichever way round they are
   * given, it faces the camera: nothing in the cabinet is seen from behind.
   */
  quad(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number): void {
    let nx = (by - ay) * (dz - az) - (bz - az) * (dy - ay);
    let ny = (bz - az) * (dx - ax) - (bx - ax) * (dz - az);
    let nz = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    const toward = nx * (EYE[0] - ax) + ny * (EYE[1] - ay) + nz * (EYE[2] - az);
    const length = Math.hypot(nx, ny, nz) * (toward < 0 ? -1 : 1) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    const { u0, v0, u1, v1, top, bottom } = this;
    this.corner(ax, ay, az, nx, ny, nz, u0, v0, top);
    this.corner(bx, by, bz, nx, ny, nz, u1, v0, top);
    this.corner(cx, cy, cz, nx, ny, nz, u1, v1, bottom);
    this.corner(ax, ay, az, nx, ny, nz, u0, v0, top);
    this.corner(cx, cy, cz, nx, ny, nz, u1, v1, bottom);
    this.corner(dx, dy, dz, nx, ny, nz, u0, v1, bottom);
  }

  /** A block, by two opposite corners: its top, its front and both sides. The camera never sees under or behind one. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.quad(x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1);
    this.quad(x0, y1, z1, x1, y1, z1, x1, y0, z1, x0, y0, z1);
    this.quad(x0, y1, z0, x0, y1, z1, x0, y0, z1, x0, y0, z0);
    this.quad(x1, y1, z0, x1, y1, z1, x1, y0, z1, x1, y0, z0);
  }
}

/** The pictures a surface can show. */
export type Art = 'table' | 'panel' | 'wall' | 'lip' | 'pusher' | 'sign' | 'plain';

/** A run of surfaces that share a picture. */
export interface Part {
  art: Art;
  first: number;
  count: number;
}

const STEEL_TOP = light('#b9c2dc');
const STEEL_FOOT = light('#4b5574');
const STEEL_BRIGHT = light('#e4e8f4');
const WALL_END = light('#1c1146');
const WALL_END_FOOT = light('#0b0622');
const WALL_CAP = light('#150c36');
const PIT_NEAR = light('#58101f');
const PIT_FAR = light('#0b0307');
const NEON_RED = light('#ff6b81', 1.5);
const NEON_GOLD = light('#ffd65c', 1.5);
const NEON_PINK = light('#ff9bd0', 1.6);
const NEON_CYAN = light('#40e2ff', 1.3);
const BRACKET_TOP = light('#8d97b8');
const BRACKET_FOOT = light('#39416a');
const HUB_RIM = light('#343c5e');
const HUB_MID = light('#aab4d0');
const HUB_BOLT = light('#e6ebf7');
/** Flat sides to a round thing: enough that a collar reads as turned on a lathe. */
const SIDES = 20;

/** The curved side of a round boss whose axis runs out of the back panel: `radius` about (x, y), from depth z0 to z1. */
function band(solid: Solid, x: number, y: number, radius: number, z0: number, z1: number): void {
  for (let i = 0; i < SIDES; i++) {
    const x0 = x + Math.cos((i / SIDES) * TAU) * radius;
    const y0 = y + Math.sin((i / SIDES) * TAU) * radius;
    const x1 = x + Math.cos(((i + 1) / SIDES) * TAU) * radius;
    const y1 = y + Math.sin(((i + 1) / SIDES) * TAU) * radius;
    solid.quad(x0, y0, z0, x1, y1, z0, x1, y1, z1, x0, y0, z1);
  }
}

/** A flat ring facing the player at depth z, from `outer` in to `inner`; with no inner radius, a disc. It shades from the first colour at its outside to the second. */
function ring(solid: Solid, x: number, y: number, outer: number, inner: number, z: number): void {
  for (let i = 0; i < SIDES; i++) {
    const c0 = Math.cos((i / SIDES) * TAU);
    const s0 = Math.sin((i / SIDES) * TAU);
    const c1 = Math.cos(((i + 1) / SIDES) * TAU);
    const s1 = Math.sin(((i + 1) / SIDES) * TAU);
    solid.quad(x + c0 * outer, y + s0 * outer, z, x + c1 * outer, y + s1 * outer, z, x + c1 * inner, y + s1 * inner, z, x + c0 * inner, y + s0 * inner, z);
  }
}

/**
 * Everything that stands still: the lower table and its front, the back
 * panel, the two side walls with their rails, the gutters beside the open
 * part of the table, and the lit edges that warn of them.
 */
export function buildCabinet(solid: Solid): Part[] {
  const parts: Part[] = [];
  const part = (art: Art, draw: () => void) => {
    const first = solid.count;
    draw();
    parts.push({ art, first, count: solid.count - first });
  };
  solid.map().paint(WHITE);
  part('table', () => solid.finish(0.22).quad(0, 0, 0, W, 0, 0, W, 0, D, 0, 0, D));
  part('panel', () => solid.finish(0.06, 0.6).quad(0, PANEL_TOP, 0, W, PANEL_TOP, 0, W, 0, 0, 0, 0, 0));
  part('lip', () => solid.finish(0.15).quad(0, 0, D, W, 0, D, W, -TRAY_DROP, D, 0, -TRAY_DROP, D));
  part('wall', () => {
    solid.finish(0.12);
    for (const x of [-LEDGE, W + LEDGE]) solid.quad(x, WALL, 0, x, WALL, OPEN, x, RAIL, OPEN, x, RAIL, 0);
  });
  part('plain', () => {
    for (const side of [-1, 1]) {
      const x = side < 0 ? 0 : W;
      const back = x + side * LEDGE;
      const out = x + side * OUT;
      // The rail along the table, and the ledge on top of it.
      solid.finish(0.75).paint(STEEL_TOP, STEEL_FOOT).quad(x, RAIL, 0, x, RAIL, OPEN, x, 0, OPEN, x, 0, 0);
      solid.finish(0.9).paint(STEEL_BRIGHT).quad(back, RAIL, 0, back, RAIL, OPEN, x, RAIL, OPEN, x, RAIL, 0);
      // The strip of back panel behind the ledge, the end of the wall where the table opens, and the top of the wall.
      solid.finish(0.06, 0.6).paint(light('#33177c'), light('#1e0d52')).quad(back, PANEL_TOP, 0, x, PANEL_TOP, 0, x, RAIL, 0, back, RAIL, 0);
      solid.finish(0.1).paint(WALL_END, WALL_END_FOOT);
      solid.quad(out, WALL, OPEN, back, WALL, OPEN, back, RAIL, OPEN, out, RAIL, OPEN);
      solid.paint(WALL_END_FOOT).quad(out, RAIL, OPEN, x, RAIL, OPEN, x, GUTTER, OPEN, out, GUTTER, OPEN);
      solid.paint(WALL_CAP).quad(out, WALL, 0, back, WALL, 0, back, WALL, OPEN, out, WALL, OPEN);
      // The gutter a medal pushed off the side falls into, and an arrow on its floor pointing the way out.
      solid.finish(0.05).paint(PIT_NEAR, PIT_FAR).quad(x, GUTTER, OPEN, x, GUTTER, D + 40, out, GUTTER, D + 40, out, GUTTER, OPEN);
      solid.finish(0, 1).paint(NEON_RED);
      for (const end of [85, 94]) {
        const ax = x + side * 5;
        const bx = x + side * 10;
        const lean = end < 89.5 ? 0.45 : -0.45;
        solid.quad(ax, GUTTER + 0.05, end - lean, bx, GUTTER + 0.05, 89.5 - lean, bx, GUTTER + 0.05, 89.5 + lean, ax, GUTTER + 0.05, end + lean);
      }
      // The red edge of the open side, and the lit pillar where the wall ends.
      const inner = x - side * 0.45;
      solid.quad(x, 0.04, OPEN, inner, 0.04, OPEN, inner, 0.04, D, x, 0.04, D);
      solid.paint(NEON_PINK).box(Math.min(x, x + side * 0.6), 1, OPEN - 0.3, Math.max(x, x + side * 0.6), WALL - 2, OPEN + 0.3);
    }
    // The brackets the feed arms hang from, one in each upper corner of the back panel, and on each the collar
    // its rail slides through: a turned boss of polished metal with a ring of light in its face and the bolt it swivels on.
    for (const collar of COLLARS) {
      const { x, height: y } = collar;
      solid.finish(0.7).paint(BRACKET_TOP, BRACKET_FOOT).box(x - 2.6, y - 1.5, 0, x + 2.6, PANEL_TOP, 0.45);
      solid.finish(1).paint(CHROME);
      band(solid, x, y, CHANNEL.collar, 0, COLLAR_FACE);
      solid.finish(0.55).paint(HUB_RIM, HUB_MID);
      ring(solid, x, y, CHANNEL.collar, CHANNEL.collar * 0.74, COLLAR_FACE);
      solid.finish(0, 0.9).paint(NEON_CYAN);
      ring(solid, x, y, CHANNEL.collar * 0.74, CHANNEL.collar * 0.62, COLLAR_FACE);
      solid.finish(0.55).paint(HUB_MID, WHITE);
      ring(solid, x, y, CHANNEL.collar * 0.62, 0, COLLAR_FACE);
      solid.finish(1).paint(CHROME);
      band(solid, x, y, CHANNEL.collar * 0.3, COLLAR_FACE, COLLAR_FACE + 0.4);
      solid.finish(0.4).paint(HUB_BOLT);
      ring(solid, x, y, CHANNEL.collar * 0.3, 0, COLLAR_FACE + 0.4);
      solid.finish(0).paint(HUB_RIM).quad(x - 0.7, y + 0.11, COLLAR_FACE + 0.42, x + 0.7, y + 0.11, COLLAR_FACE + 0.42, x + 0.7, y - 0.11, COLLAR_FACE + 0.42, x - 0.7, y - 0.11, COLLAR_FACE + 0.42);
    }
    // The gold edge the winnings go over.
    solid.finish(0, 1).paint(NEON_GOLD);
    solid.quad(0, 0.04, D - 0.45, W, 0.04, D - 0.45, W, 0.04, D, 0, 0.04, D);
    solid.quad(0, 0.04, D + 0.02, W, 0.04, D + 0.02, W, -0.45, D + 0.02, 0, -0.45, D + 0.02);
  });
  return parts;
}

const FACE_TOP = light('#c2cbe2');
const FACE_FOOT = light('#2a3148');
const CHROME = light('#f4f7fd');
const BAR_IDLE = light('#8fa6c0');
const BAR_LIT = light('#c9f4ff');
const GATE_NEON = light('#7df0ff', 1.5);
const GATE_LIT = light('#fffbe0', 1.7);

/** The runs of surfaces that move, in the order `buildMoving` writes them. The first `MOVING_CAST` of them throw shadows. */
export const MOVING_PARTS: Part[] = [
  { art: 'pusher', first: 0, count: 0 },
  { art: 'plain', first: 0, count: 0 },
  { art: 'plain', first: 0, count: 0 },
  { art: 'sign', first: 0, count: 0 },
];
export const MOVING_CAST = 2;

/**
 * Where one arm hangs this frame: its collar, one step along its rail toward
 * the tip, one step square to that on the side a medal rests on, and how far
 * the tip is from the collar. Everything on an arm is placed by how far
 * along the rail it is and how far below the line a medal's middle runs on.
 */
const rail = { x: 0, y: 0, alongX: 0, alongY: 0, underX: 0, underY: 0, length: 0 };

function hang(arm: Arm, tip: number): void {
  const from = COLLARS[arm];
  const dx = tipOf(arm, tip) - from.x;
  const dy = ARMS.tip - from.height;
  const side = arm === 0 ? 1 : -1;
  rail.length = Math.hypot(dx, dy);
  rail.x = from.x;
  rail.y = from.height;
  rail.alongX = dx / rail.length;
  rail.alongY = dy / rail.length;
  rail.underX = rail.alongY * side;
  rail.underY = -rail.alongX * side;
}

const railX = (far: number, below: number): number => rail.x + rail.alongX * far + rail.underX * below;
const railY = (far: number, below: number): number => rail.y + rail.alongY * far + rail.underY * below;

/** How bright an arm's neon is: full on the one that takes the next medal and on one with a medal on its rail, low on the other. */
function armLit(machine: Machine, arm: Arm, aim: number): number {
  if (armFor(aim) === arm) return 1;
  for (let i = 0; i < machine.rolling.length; i++) if (machine.rolling[i].arm === arm) return 1;
  return 0.2;
}

/**
 * The two feed arms: for each, the track its medals roll on, the guide over
 * their heads and the hood at the tip that turns a medal down. The medals
 * themselves are among the other medals, and the clear walls of the channel
 * are among the flat touches. Whatever feeds the field is drawn here.
 */
function buildFeed(solid: Solid, machine: Machine, stage: Stage, options: DrawOptions): void {
  const { back, front, bar } = CHANNEL;
  const head = R + CHANNEL.headroom;
  for (let index = 0; index < 2; index++) {
    const arm = index as Arm;
    const lit = armLit(machine, arm, options.aim);
    hang(arm, armTipAt(stage, arm));
    const end = rail.length;
    // The tops of the two bars are polished and catch the lamp; their fronts are tubes of light.
    solid.finish(1).paint(CHROME);
    solid.quad(railX(-CHANNEL.tail, R), railY(-CHANNEL.tail, R), back, railX(end - 0.4, R), railY(end - 0.4, R), back, railX(end - 0.4, R), railY(end - 0.4, R), front, railX(-CHANNEL.tail, R), railY(-CHANNEL.tail, R), front);
    solid.quad(railX(-CHANNEL.tail, -head - bar), railY(-CHANNEL.tail, -head - bar), back, railX(end, -head - bar), railY(end, -head - bar), back, railX(end, -head - bar), railY(end, -head - bar), front, railX(-CHANNEL.tail, -head - bar), railY(-CHANNEL.tail, -head - bar), front);
    solid.finish(0, 0.5 + 0.6 * lit).paint(lit > 0.5 ? BAR_LIT : BAR_IDLE);
    solid.quad(railX(-CHANNEL.tail, R), railY(-CHANNEL.tail, R), front, railX(end - 0.4, R), railY(end - 0.4, R), front, railX(end - 0.4, R + bar), railY(end - 0.4, R + bar), front, railX(-CHANNEL.tail, R + bar), railY(-CHANNEL.tail, R + bar), front);
    solid.quad(railX(-CHANNEL.tail, -head - bar), railY(-CHANNEL.tail, -head - bar), front, railX(end, -head - bar), railY(end, -head - bar), front, railX(end, -head), railY(end, -head), front, railX(-CHANNEL.tail, -head), railY(-CHANNEL.tail, -head), front);
    // The hood: the guide carried a quarter turn and a little more round the tip.
    for (let turn = 0; turn < 100; turn += 20) {
      const s0 = Math.sin((turn * Math.PI) / 180);
      const c0 = Math.cos((turn * Math.PI) / 180);
      const s1 = Math.sin(((turn + 20) * Math.PI) / 180);
      const c1 = Math.cos(((turn + 20) * Math.PI) / 180);
      const outer = head + bar;
      solid.finish(1).paint(CHROME);
      solid.quad(railX(end + s0 * outer, -c0 * outer), railY(end + s0 * outer, -c0 * outer), back, railX(end + s1 * outer, -c1 * outer), railY(end + s1 * outer, -c1 * outer), back, railX(end + s1 * outer, -c1 * outer), railY(end + s1 * outer, -c1 * outer), front, railX(end + s0 * outer, -c0 * outer), railY(end + s0 * outer, -c0 * outer), front);
      solid.finish(0, 0.5 + 0.6 * lit).paint(lit > 0.5 ? BAR_LIT : BAR_IDLE);
      solid.quad(railX(end + s0 * outer, -c0 * outer), railY(end + s0 * outer, -c0 * outer), front, railX(end + s1 * outer, -c1 * outer), railY(end + s1 * outer, -c1 * outer), front, railX(end + s1 * head, -c1 * head), railY(end + s1 * head, -c1 * head), front, railX(end + s0 * head, -c0 * head), railY(end + s0 * head, -c0 * head), front);
    }
  }
}

/**
 * Everything that moves: the pusher where its stroke has taken it, the two
 * feed arms where they point, and the three gates where their sweep has
 * taken them, each with its sign.
 */
export function buildMoving(solid: Solid, machine: Machine, front: number, stage: Stage, options: DrawOptions): void {
  solid.clear().map().paint(WHITE);
  const top = MOVING_PARTS[0];
  const cast = MOVING_PARTS[1];
  const gates = MOVING_PARTS[2];
  const signs = MOVING_PARTS[3];

  // The pusher's top is one picture that rides with its lip.
  top.first = solid.count;
  solid.map(0, BEVEL / PUSHER.max, 1, front / PUSHER.max).finish(0.55);
  solid.quad(0, P, front - BEVEL, W, P, front - BEVEL, W, P, 0, 0, P, 0);
  top.count = solid.count - top.first;

  cast.first = solid.count;
  solid.map().finish(1).paint(STEEL_BRIGHT).quad(0, P, front - BEVEL, W, P, front - BEVEL, W, P - BEVEL, front, 0, P - BEVEL, front);
  solid.finish(0.45).paint(FACE_TOP, FACE_FOOT).quad(0, P - BEVEL, front, W, P - BEVEL, front, W, 0, front, 0, 0, front);
  buildFeed(solid, machine, stage, options);
  cast.count = solid.count - cast.first;

  // A gate is a frame of neon tube round its opening, and turns gold for a moment when a medal comes through.
  gates.first = solid.count;
  const shift = checkerShift(machine.time);
  const half = GATE.halfWidth;
  const tube = 0.32;
  for (let i = 0; i < CHECKERS.positions.length; i++) {
    const centre = CHECKERS.positions[i] + shift;
    solid.finish(0, 1).paint(stage.gateGlow[i] > 0 ? GATE_LIT : GATE_NEON);
    solid.box(centre - half - tube, P, 0, centre - half + tube, P + GATE.height, 0.7);
    solid.box(centre + half - tube, P, 0, centre + half + tube, P + GATE.height, 0.7);
    solid.box(centre - half - tube, P + GATE.height - tube, 0, centre + half + tube, P + GATE.height + tube, 0.7);
  }
  gates.count = solid.count - gates.first;

  signs.first = solid.count;
  const foot = P + GATE.height + 2.4 - SIGN.height / 2;
  for (let i = 0; i < CHECKERS.positions.length; i++) {
    const centre = CHECKERS.positions[i] + shift;
    const lit = stage.gateGlow[i] / GLOW_TIME;
    solid.finish(0, 0.85 + 0.6 * lit).paint(WHITE);
    solid.quad(centre - SIGN.width / 2, foot + SIGN.height, 0.5, centre + SIGN.width / 2, foot + SIGN.height, 0.5, centre + SIGN.width / 2, foot, 0.5, centre - SIGN.width / 2, foot, 0.5);
  }
  signs.count = solid.count - signs.first;
}

// ── Flat touches ────────────────────────────────────────────────────────────

/** Numbers per corner of a flat touch: where, its colour, how much it hides and how much light it adds, where in its own square, and its shape. */
export const FLAT_STRIDE = 11;
/** A flat touch is even all over, fades from its middle like a spot, or fades to either side of a line. */
export const SHAPE = { even: 0, spot: 1, line: 2 } as const;

/**
 * Glows and shades laid on the surfaces after they are drawn. Each either
 * hides what is under it by some amount (a shade), adds light to it (a
 * glow), or both.
 */
export class Flat {
  data: Float32Array;
  count = 0;
  private near = new Float32Array(5);
  private far = new Float32Array(5);

  constructor(corners: number) {
    this.data = new Float32Array(corners * FLAT_STRIDE);
  }

  clear(): this {
    this.count = 0;
    return this;
  }

  /** The colour of what comes next: how much of what is under it it hides, and how much light it adds. */
  ink(colour: Rgb, cover: number, shine = 0): this {
    this.near.set(colour);
    this.near[3] = cover;
    this.near[4] = shine;
    this.far.set(this.near);
    return this;
  }

  /** Lets the next touches fade to this at their far side: their last two corners. */
  fade(colour: Rgb, cover: number, shine = 0): this {
    this.far.set(colour);
    this.far[3] = cover;
    this.far[4] = shine;
    return this;
  }

  private corner(x: number, y: number, z: number, colour: Float32Array, u: number, v: number, shape: number): void {
    if ((this.count + 1) * FLAT_STRIDE > this.data.length) {
      const longer = new Float32Array(this.data.length * 2);
      longer.set(this.data);
      this.data = longer;
    }
    const { data } = this;
    let at = this.count++ * FLAT_STRIDE;
    data[at++] = x;
    data[at++] = y;
    data[at++] = z;
    data[at++] = colour[0];
    data[at++] = colour[1];
    data[at++] = colour[2];
    data[at++] = colour[3];
    data[at++] = colour[4];
    data[at++] = u;
    data[at++] = v;
    data[at] = shape;
  }

  /** A four-cornered touch: a and b in the near colour, c and d in the far one. */
  quad(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, shape: number = SHAPE.even): void {
    const { near, far } = this;
    this.corner(ax, ay, az, near, -1, -1, shape);
    this.corner(bx, by, bz, near, 1, -1, shape);
    this.corner(cx, cy, cz, far, 1, 1, shape);
    this.corner(ax, ay, az, near, -1, -1, shape);
    this.corner(cx, cy, cz, far, 1, 1, shape);
    this.corner(dx, dy, dz, far, -1, 1, shape);
  }

  /** A three-cornered one: a in the near colour, b and c in the far one. */
  wedge(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): void {
    this.corner(ax, ay, az, this.near, 0, 0, SHAPE.even);
    this.corner(bx, by, bz, this.far, 0, 0, SHAPE.even);
    this.corner(cx, cy, cz, this.far, 0, 0, SHAPE.even);
  }

  /** A round spot of `radius` on a surface that faces the player, at depth z. */
  onPanel(x: number, y: number, z: number, radius: number): void {
    this.quad(x - radius, y + radius, z, x + radius, y + radius, z, x + radius, y - radius, z, x - radius, y - radius, z, SHAPE.spot);
  }

  /** The same on a side wall, at x. */
  onWall(x: number, y: number, z: number, radius: number): void {
    this.quad(x, y + radius, z - radius, x, y + radius, z + radius, x, y - radius, z + radius, x, y - radius, z - radius, SHAPE.spot);
  }

  /** The same lying flat, at height y. */
  onFloor(x: number, y: number, z: number, radius: number): void {
    this.quad(x - radius, y, z - radius, x + radius, y, z - radius, x + radius, y, z + radius, x - radius, y, z + radius, SHAPE.spot);
  }
}

const PIN = light('#d9d2ff');
const LAMPS = ['#fff3a8', '#ffd65c'].map((hex) => light(hex));
const PARTY_LAMPS = SPARK_COLORS.map((hex) => light(hex));
const TRAY_LAMPS = ['#ffd65c', '#fff3a8'].map((hex) => light(hex));
const FACE_LAMPS = ['#7df0ff', '#d6fbff'].map((hex) => light(hex));
const PINS = pinSpots();
/** Bulbs in each row: along the top of the back panel, along each rail, under the front edge, across the pusher's face. */
export const LAMP_ROWS = { top: 26, rail: 12, tray: 30, face: 24 } as const;

/**
 * The pins of the back panel and every bulb: along the top of the panel,
 * along both rails, under the front edge and across the pusher's face. A
 * glow travels along each row, a third of a cycle from one bulb to the next;
 * `wave` is where it has got to. Each bulb also lights the surface it is on.
 */
export function buildLamps(beads: Rows, flat: Flat, front: number, wave: number, partying: boolean): void {
  beads.count = 0;
  for (let i = 0; i < PINS.length; i++) beadRow(beads, PINS[i].x, PINS[i].height, 0.12, 0.46, PIN[0], PIN[1], PIN[2], BEAD.pin);
  const lamps = partying ? PARTY_LAMPS : LAMPS;
  for (let i = 0; i < LAMP_ROWS.top; i++) {
    const x = 1 + ((i + 0.5) / LAMP_ROWS.top) * (W - 2);
    const colour = lamps[i % lamps.length];
    const glow = 0.5 + 0.5 * Math.sin(wave - (i * TAU) / 3);
    beadRow(beads, x, WALL - 1.2, 0.2, 0.62, colour[0], colour[1], colour[2], BEAD.bulb(glow));
    flat.ink(colour, 0, 0.12 + 0.5 * glow).onPanel(x, WALL - 1.2, 0.06, 2.8);
  }
  for (let i = 0; i < LAMP_ROWS.rail * 2; i++) {
    const along = i >> 1;
    const side = i % 2 === 0 ? -1 : 1;
    const z = 2 + ((along + 0.5) / LAMP_ROWS.rail) * (OPEN - 4);
    const x = (side < 0 ? 0 : W) + side * (LEDGE - 0.3);
    const colour = lamps[along % lamps.length];
    const glow = 0.5 + 0.5 * Math.sin(wave - (along * TAU) / 3);
    beadRow(beads, x, RAIL + 0.55, z, 0.6, colour[0], colour[1], colour[2], BEAD.bulb(glow));
    flat.ink(colour, 0, 0.12 + 0.5 * glow).onWall(x + side * 0.24, RAIL + 1.6, z, 2.6);
  }
  for (let i = 0; i < LAMP_ROWS.tray; i++) {
    const x = 2 + ((i + 0.5) / LAMP_ROWS.tray) * (W - 4);
    const colour = TRAY_LAMPS[i % 2];
    const glow = 0.5 + 0.5 * Math.sin(wave - (i * TAU) / 3);
    beadRow(beads, x, -3, D + 0.15, 0.46, colour[0], colour[1], colour[2], BEAD.bulb(glow));
    flat.ink(colour, 0, 0.08 + 0.4 * glow).onPanel(x, -3, D + 0.06, 2.1);
  }
  for (let i = 0; i < LAMP_ROWS.face; i++) {
    const x = 3 + ((i + 0.5) / LAMP_ROWS.face) * (W - 6);
    const colour = FACE_LAMPS[i % 2];
    const glow = 0.5 + 0.5 * Math.sin(wave - (i * TAU) / 3);
    beadRow(beads, x, P / 2, front + 0.15, 0.44, colour[0], colour[1], colour[2], BEAD.bulb(glow));
    flat.ink(colour, 0, 0.08 + 0.4 * glow).onPanel(x, P / 2, front + 0.06, 2);
  }
}

const GLOW_RED = light('#ff5468');
const GLOW_GOLD = light('#ffd65c');
const GLOW_PINK = light('#ff56aa');
const GLOW_CYAN = light('#40e2ff');
const GLOW_LIT = light('#fff496');
const GATE_DARK = light('#06021e');
const ACRYLIC = light('#96e8ff');
const ICE = light('#c8f4ff');
/** How far a shadow on the back panel lies from what throws it: the room's light comes from the upper left. */
const CAST = { x: 1.5, y: -2.4 } as const;

/** A flat piece of the arm hung last, at one depth: from `far0` to `far1` along its rail and from `below0` to `below1` across it, moved over by (dx, dy). */
function piece(flat: Flat, far0: number, far1: number, below0: number, below1: number, z: number, shape: number = SHAPE.even, dx = 0, dy = 0): void {
  flat.quad(railX(far0, below0) + dx, railY(far0, below0) + dy, z, railX(far1, below0) + dx, railY(far1, below0) + dy, z, railX(far1, below1) + dx, railY(far1, below1) + dy, z, railX(far0, below1) + dx, railY(far0, below1) + dy, z, shape);
}

/**
 * What is clear or only light about the feed arms: the shadow each throws
 * on the back panel behind it — dark under its bars and its collar and under
 * every medal on its rail, faint under the clear channel between — then the
 * two walls of the channel, a streak of light along the front one, the
 * arrowheads that point down the rail, and the glow of its bars.
 */
function armTouches(flat: Flat, machine: Machine, stage: Stage, options: DrawOptions): void {
  const { back, front, bar, collar } = CHANNEL;
  const head = R + CHANNEL.headroom;
  for (let index = 0; index < 2; index++) {
    const arm = index as Arm;
    const lit = armLit(machine, arm, options.aim);
    const tip = armTipAt(stage, arm);
    hang(arm, tip);
    const end = rail.length;

    // Its shadow on the back panel.
    flat.ink(BLACK, 0.1);
    piece(flat, 0, end, -head, R, 0.07, SHAPE.even, CAST.x, CAST.y);
    flat.ink(BLACK, 0.34);
    piece(flat, 0, end - 0.4, R - 0.25, R + bar + 0.25, 0.07, SHAPE.even, CAST.x, CAST.y);
    piece(flat, 0, end + head * 0.6, -head - bar - 0.25, -head + 0.25, 0.07, SHAPE.even, CAST.x, CAST.y);
    flat.ink(BLACK, 0.55);
    flat.onPanel(rail.x + CAST.x * 1.6, rail.y + CAST.y * 1.6, 0.07, collar * 1.5);
    for (let i = 0; i < machine.rolling.length; i++) {
      if (machine.rolling[i].arm !== arm) continue;
      const spot = rollingSpot(arm, tip, machine.rolling[i].remaining);
      flat.onPanel(spot.x + CAST.x, spot.height + CAST.y, 0.08, R * 1.35);
    }
    // The channel's back wall and its front one, clear with a tint of ice, and brighter on the arm at work.
    flat.ink(ACRYLIC, 0.05, 0.02 + 0.04 * lit);
    piece(flat, collar - 0.6, end, -head, R, back);
    flat.ink(ACRYLIC, 0.03, 0.04 + 0.05 * lit);
    piece(flat, collar - 0.6, end, -head, R, front + 0.02);
    flat.ink(WHITE, 0, 0.12);
    piece(flat, collar, end - 1, -head * 0.8, -head * 0.5, front + 0.03);
    // Arrowheads on the front wall that point down the rail. They are part of the rail, so they slide with it.
    flat.ink(ICE, 0, 0.2 + 0.25 * lit);
    const middle = (R - head) / 2;
    for (let far = end - 5; far > collar + 2; far -= 8) {
      for (let wing = -1; wing <= 1; wing += 2) {
        flat.quad(railX(far - 1.5, middle + wing * 2), railY(far - 1.5, middle + wing * 2), front + 0.04, railX(far, middle), railY(far, middle), front + 0.04, railX(far + 0.32, middle), railY(far + 0.32, middle), front + 0.04, railX(far - 1.18, middle + wing * 2), railY(far - 1.18, middle + wing * 2), front + 0.04);
      }
    }
    // The glow of the two bars, and of the ring in the collar's face: on the panel round it, and on the face itself.
    flat.ink(GLOW_CYAN, 0, 0.08 + 0.3 * lit);
    piece(flat, collar, end, R + bar / 2 - 1.3, R + bar / 2 + 1.3, front + 0.05, SHAPE.line);
    piece(flat, collar, end + head * 0.6, -head - bar / 2 - 1.3, -head - bar / 2 + 1.3, front + 0.05, SHAPE.line);
    flat.ink(GLOW_CYAN, 0, 0.1 + 0.4 * lit).onPanel(rail.x, rail.y, 0.06, collar * 1.9);
    flat.ink(GLOW_CYAN, 0, 0.5 * lit).onPanel(rail.x, rail.y, COLLAR_FACE + 0.5, collar * 1.15);
  }
}

/**
 * The flat touches of one frame: the dark where the pusher meets the lower
 * table and where the tables meet the walls, the glow round every lit edge,
 * the aim guide on the back panel, what is clear about the feed arms, the
 * light a medal leaves on the tray or in a gutter as it goes, and the dark
 * under each ball.
 */
export function buildTouches(flat: Flat, machine: Machine, front: number, stage: Stage, options: DrawOptions): void {
  const calm = options.calm ?? false;
  // Where the pusher's face meets the lower table, and where the tables meet the back panel and the walls.
  flat.ink(BLACK, 0.62).fade(BLACK, 0).quad(0, 0.03, front, W, 0.03, front, W, 0.03, front + 9, 0, 0.03, front + 9);
  flat.ink(BLACK, 0.4).fade(BLACK, 0).quad(0, P + 0.03, 0, W, P + 0.03, 0, W, P + 0.03, 5, 0, P + 0.03, 5);
  for (let index = 0; index < 2; index++) {
    const x = index === 0 ? 0 : W;
    const inward = index === 0 ? 5 : W - 5;
    flat.ink(BLACK, 0.34).fade(BLACK, 0);
    flat.quad(x, P + 0.03, 0, x, P + 0.03, front - BEVEL, inward, P + 0.03, front - BEVEL, inward, P + 0.03, 0);
    flat.quad(x, 0.03, front, x, 0.03, OPEN, inward, 0.03, OPEN, inward, 0.03, front);
  }

  // The glow of the lit edges: red along the open sides, gold along the front, pink up the pillars.
  for (let index = 0; index < 2; index++) {
    const x = index === 0 ? 0 : W;
    const side = index === 0 ? -1 : 1;
    const lit = stage.sideGlow[index] / GLOW_TIME;
    flat.ink(GLOW_RED, 0, 0.5 + 0.5 * lit).quad(x - 2.2, 0.05, OPEN, x - 2.2, 0.05, D, x + 2.2, 0.05, D, x + 2.2, 0.05, OPEN, SHAPE.line);
    // A medal that has just gone out by this side lights its gutter for a moment.
    if (lit > 0) flat.ink(GLOW_RED, 0, 0.55 * lit).fade(GLOW_RED, 0, 0).quad(x, GUTTER + 0.1, OPEN, x, GUTTER + 0.1, D + 40, x + side * OUT, GUTTER + 0.1, D + 40, x + side * OUT, GUTTER + 0.1, OPEN);
    flat.ink(GLOW_PINK, 0, 0.5).quad(x - side * 2.4, 1, OPEN + 0.35, x - side * 2.4, WALL - 2, OPEN + 0.35, x + side * 3, WALL - 2, OPEN + 0.35, x + side * 3, 1, OPEN + 0.35, SHAPE.line);
  }
  const tray = stage.trayGlow / GLOW_TIME;
  flat.ink(GLOW_GOLD, 0, 0.45 + 0.4 * tray).quad(0, 0.05, D - 2.4, W, 0.05, D - 2.4, W, 0.05, D + 0.2, 0, 0.05, D + 0.2, SHAPE.line);
  flat.ink(GLOW_GOLD, 0, 0.14 + 0.36 * tray).fade(GLOW_GOLD, 0, 0.22 * tray).quad(0, 0, D + 0.04, W, 0, D + 0.04, W, -TRAY_DROP, D + 0.04, 0, -TRAY_DROP, D + 0.04);

  // The gates: the dark of each opening, lit when a medal has come through, and the glow of its tubes.
  const shift = checkerShift(machine.time);
  const half = GATE.halfWidth;
  for (let i = 0; i < CHECKERS.positions.length; i++) {
    const centre = CHECKERS.positions[i] + shift;
    const lit = stage.gateGlow[i] / GLOW_TIME;
    const pulse = calm ? 0 : 0.5 + 0.5 * Math.sin(stage.clock * 4 + i * 2.1);
    const top = P + GATE.height;
    if (lit > 0) flat.ink(GLOW_LIT, 0.25 + 0.5 * lit, 0.3 * lit);
    else flat.ink(GATE_DARK, 0.6);
    flat.quad(centre - half, top, 0.05, centre + half, top, 0.05, centre + half, P, 0.05, centre - half, P, 0.05);
    const reach = 1.9;
    if (lit > 0) flat.ink(GLOW_LIT, 0, 0.75);
    else flat.ink(GLOW_CYAN, 0, 0.42 + 0.3 * pulse);
    for (let post = -1; post <= 1; post += 2) {
      const x = centre + post * half;
      flat.quad(x - reach, P, 0.08, x - reach, top + reach, 0.08, x + reach, top + reach, 0.08, x + reach, P, 0.08, SHAPE.line);
    }
    flat.quad(centre - half - reach, top + reach, 0.08, centre + half + reach, top + reach, 0.08, centre + half + reach, top - reach, 0.08, centre - half - reach, top - reach, 0.08, SHAPE.line);
  }

  // Where a medal that leaves its arm now is let go, and how far from that it can land.
  if (options.showGuide) {
    const { aim } = options;
    flat.ink(WHITE, 0.22).fade(WHITE, 0.03);
    flat.wedge(aim, ARMS.tip, 0.1, Math.max(R, aim - LANDING.scatter), P, 0.1, Math.min(W - R, aim + LANDING.scatter), P, 0.1);
  }
  armTouches(flat, machine, stage, options);

  // A ball rests in the dark it throws on whatever it stands on.
  flat.ink(BLACK, 0.5);
  for (const medal of machine.medals) {
    const dropping = medal.level === 0 && medal.sinceDrop >= 0 && medal.sinceDrop < LIP_FALL;
    if (medal.ball && !dropping) flat.onFloor(medal.x, (medal.level === 1 ? P : 0) + HEIGHT.medal + 0.06, medal.y, BALL_RADIUS * 1.3);
  }
}
