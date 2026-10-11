/**
 * The cabinet as shapes: the tables, the back panel, the walls and gutters
 * that never move, the pusher, chute and gates that do, the bulbs and pins,
 * and the flat touches laid over them — glows, the dark where two surfaces
 * meet, the aim guide. Like the rest of the scene it is only numbers; the
 * renderer hands them to the graphics card.
 */

import { CHECKERS, FIELD, LANDING, MEDAL_RADIUS, PUSHER, RELEASE, checkerShift, type Machine } from './engine';
import { PANEL_TOP, SIGN, TRAY_DROP, pinSpots } from './art3d';
import { BALL_RADIUS, GATE, GLOW_TIME, LIP_FALL, SPARK_COLORS, type DrawOptions, type Stage } from './render';
import { BEAD, EYE, beadRow, type Rows } from './scene3d';
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
/** How far the chute stands out from the back panel. */
const CHUTE = RELEASE.depth * 2 + 0.2;

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
const CHROME_EDGE = light('#8d97b3');
const CHROME_DARK = light('#2b3350');
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
 * The chute the next medal is let go from, hanging on the back panel over
 * the aim. Whatever feeds the field is drawn here.
 */
function buildFeed(solid: Solid, aim: number): void {
  const top = PANEL_TOP;
  const foot = RELEASE.height;
  solid.finish(0.6, 0.3);
  // Its front, bright down the middle, and its two flanks.
  solid.paint(CHROME_EDGE, CHROME).quad(aim - 5, top, CHUTE, aim - 2.8, foot, CHUTE, aim, foot, CHUTE, aim, top, CHUTE);
  solid.paint(CHROME_EDGE, CHROME).quad(aim + 5, top, CHUTE, aim + 2.8, foot, CHUTE, aim, foot, CHUTE, aim, top, CHUTE);
  solid.paint(CHROME_EDGE, CHROME_DARK);
  solid.quad(aim - 5, top, 0, aim - 5, top, CHUTE, aim - 2.8, foot, CHUTE, aim - 2.8, foot, 0);
  solid.quad(aim + 5, top, 0, aim + 5, top, CHUTE, aim + 2.8, foot, CHUTE, aim + 2.8, foot, 0);
  // The mouth the medals drop out of.
  solid.finish(0).paint(CHROME_DARK).quad(aim - 2.8, foot, 0, aim + 2.8, foot, 0, aim + 2.8, foot, CHUTE, aim - 2.8, foot, CHUTE);
}

/**
 * Everything that moves: the pusher where its stroke has taken it, the
 * chute over the aim, and the three gates where their sweep has taken them,
 * each with its sign.
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
  buildFeed(solid, options.aim);
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

/**
 * The flat touches of one frame: the dark where the pusher meets the lower
 * table and where the tables meet the walls, the glow round every lit edge,
 * the aim guide on the back panel, the light a medal leaves on the tray or
 * in a gutter as it goes, and the dark under each ball.
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

  // Where the next medal will be let go, and how far from that it can land.
  if (options.showGuide) {
    const { aim } = options;
    flat.ink(WHITE, 0.22).fade(WHITE, 0.03);
    flat.wedge(aim, RELEASE.height, 0.1, Math.max(R, aim - LANDING.scatter), P, 0.1, Math.min(W - R, aim + LANDING.scatter), P, 0.1);
  }

  // A ball rests in the dark it throws on whatever it stands on.
  flat.ink(BLACK, 0.5);
  for (const medal of machine.medals) {
    const dropping = medal.level === 0 && medal.sinceDrop >= 0 && medal.sinceDrop < LIP_FALL;
    if (medal.ball && !dropping) flat.onFloor(medal.x, (medal.level === 1 ? P : 0) + HEIGHT.medal + 0.06, medal.y, BALL_RADIUS * 1.3);
  }
}
