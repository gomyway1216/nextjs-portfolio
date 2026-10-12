/**
 * The cabinet as shapes: the tables, the walls and gutters that never move,
 * the housing round the screen, the pusher, the feed arms and their slots,
 * the gates, the bulbs and lamps, and the flat touches laid over them —
 * glows, the dark where two surfaces meet, the aim guide, and whatever is
 * seen against the screen. Like the rest of the scene it is only numbers;
 * the renderer hands them to the graphics card.
 *
 * The screen is not here. It is the page's own, stood behind this picture
 * exactly where the opening in the housing is, and nothing is drawn in that
 * opening but what is in front of it.
 */

import { ARMS, HATCH, SLOT, airSpot, armCollar, legOf, railFrame } from './arms';
import { CHECKERS, FIELD, LANDING, MEDAL_RADIUS, PUSHER, armFor, checkerShift, type Arm, type Machine } from './engine';
import { SHELF_SHARE, SIGN, TRAY_DROP } from './art3d';
import { BALL_RADIUS, GATE, GLOW_TIME, LIP_FALL, SPARK_COLORS, type DrawOptions, type Stage } from './render';
import { BEAD, EYE, LANDED, armTipAt, beadRow, type Rows } from './scene3d';
import { HEIGHT, HOLD_LAMPS, HOUSING, SCREEN } from './view';

const TAU = Math.PI * 2;
const R = MEDAL_RADIUS;
const W = FIELD.width;
const D = FIELD.depth;
const OPEN = FIELD.sideOpenFrom;
const P = HEIGHT.pusher;
const RAIL = HEIGHT.sideWall;
/** The top of the back wall and the side walls. */
const WALL = HEIGHT.top;
/** How far the wall above each rail stands back from it, which leaves a ledge for the bulbs. */
const LEDGE = 0.8;
/** How far the walls and the gutters beside the table reach outward, and how deep the gutters are. */
const OUT = 34;
const GUTTER = -12;
/** The slanted edge along the pusher's lip. */
const BEVEL = 0.4;
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
export type Art = 'table' | 'foot' | 'wall' | 'lip' | 'pusher' | 'sign' | 'plain';

/** A run of surfaces that share a picture. */
export interface Part {
  art: Art;
  first: number;
  count: number;
  /** Set on a run that is not in the picture and is there only for the shadow it throws. */
  unseen?: boolean;
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
/** Flat sides to a round thing: enough that a collar reads as turned on a lathe. */
const SIDES = 20;

/** The curved side of a round boss whose axis runs out toward the player: `radius` about (x, y), from depth z0 to z1. */
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
const GOLD_BRIGHT = light('#ffe9a6');
const GOLD = light('#e8b22e');
const GOLD_DEEP = light('#9a6410');
const GOLD_DARK = light('#5a3606');
const SOFFIT = light('#0a0624');
const BED = light('#140a36');
const GLASS = light('#0a0624');
/** How many facets each strip beside the screen is cut into, and how many panels the hood's face is. */
const FACETS = { strip: 6, hood: 8 } as const;
/** How far the bracket a slot hangs from reaches out past the side of the field, to the cabinet's frame. */
const BRACKET_REACH = 16;
/** How far in front of its collar a slot's face stands, and how far behind it the slot's body ends. */
const SLOT_BODY = { face: 1.6, back: 4.2 } as const;

/**
 * The housing the screen sits in. The screen itself is not drawn: the page
 * stands its own screen in the opening, behind this picture, and everything
 * here is what is round it and laps over its edges. Down each side, a strip
 * of gold cut in facets with a bed for a row of bulbs; under it, the bevel
 * on top of the shelf; over it, the wall under the hood, and the hood: its
 * top, its face in panels, the ring of the hatch, and the lit lip of the gap
 * under it, which is the slot the machine pays from.
 */
function buildHousing(solid: Solid): void {
  const { ledge, hood, out, lap } = HOUSING;
  const { foot, top } = SCREEN;
  solid.map();
  for (const side of [-1, 1]) {
    const outer = side < 0 ? -LEDGE : W + LEDGE;
    const inner = side < 0 ? SCREEN.left : SCREEN.right;
    // Where the strip's face ends and it slopes back to the screen, and where that slope meets the screen.
    const shoulder = inner + side * 1.1;
    const lapped = inner - side * lap;
    for (let i = 0; i < FACETS.strip; i++) {
      const y1 = hood - ((hood - foot) * i) / FACETS.strip;
      const y0 = hood - ((hood - foot) * (i + 1)) / FACETS.strip;
      const lit = i % 2 === 0;
      solid.finish(0.85).paint(lit ? GOLD_BRIGHT : GOLD, lit ? GOLD : GOLD_DEEP);
      solid.quad(outer, y1, ledge, shoulder, y1, ledge, shoulder, y0, ledge, outer, y0, ledge);
      solid.paint(lit ? GOLD_DEEP : GOLD, lit ? GOLD_DARK : GOLD_DEEP);
      solid.quad(shoulder, y1, ledge, lapped, y1, 0, lapped, y0, 0, shoulder, y0, ledge);
    }
    const middle = ((side < 0 ? 0 : W) + shoulder) / 2;
    solid.finish(0.1, 0.5).paint(BED);
    solid.quad(middle - 0.8, hood - 1.6, ledge + 0.02, middle + 0.8, hood - 1.6, ledge + 0.02, middle + 0.8, foot + 1.6, ledge + 0.02, middle - 0.8, foot + 1.6, ledge + 0.02);
  }
  // The top of the shelf, sloping back from its front edge to lap over the foot of the screen.
  solid.finish(0.9).paint(GOLD, GOLD_BRIGHT);
  solid.quad(-LEDGE, foot + lap, 0, W + LEDGE, foot + lap, 0, W + LEDGE, foot, ledge, -LEDGE, foot, ledge);
  // The wall over the screen, in the dark under the hood.
  solid.finish(0.05).paint(SOFFIT);
  solid.quad(-LEDGE, hood, 0, W + LEDGE, hood, 0, W + LEDGE, top - lap, 0, -LEDGE, top - lap, 0);
  // The hood: its top, then its face, panel by panel.
  solid.finish(0.9).paint(GOLD_BRIGHT, GOLD);
  solid.quad(-LEDGE, WALL, 0, W + LEDGE, WALL, 0, W + LEDGE, WALL, out, -LEDGE, WALL, out);
  for (let i = 0; i < FACETS.hood; i++) {
    const x0 = -LEDGE + ((W + LEDGE * 2) * i) / FACETS.hood;
    const x1 = -LEDGE + ((W + LEDGE * 2) * (i + 1)) / FACETS.hood;
    const lit = i % 2 === 0;
    solid.finish(0.85).paint(lit ? GOLD_BRIGHT : GOLD, lit ? GOLD_DEEP : GOLD_DARK);
    solid.quad(x0, WALL, out, x1, WALL, out, x1, hood, out, x0, hood, out);
  }
  // The lip of the gap under the hood: a line of light all the way across, under a line of chrome.
  solid.finish(0, 1).paint(NEON_GOLD);
  solid.quad(-LEDGE, hood + 0.7, out + 0.03, W + LEDGE, hood + 0.7, out + 0.03, W + LEDGE, hood, out + 0.03, -LEDGE, hood, out + 0.03);
  solid.finish(1).paint(CHROME);
  solid.quad(-LEDGE, hood + 1, out + 0.03, W + LEDGE, hood + 1, out + 0.03, W + LEDGE, hood + 0.7, out + 0.03, -LEDGE, hood + 0.7, out + 0.03);
  // The frame of the hatch. Its door is among the things that change.
  solid.finish(1).paint(CHROME);
  band(solid, HATCH.x, HATCH.height, HATCH.radius, out, out + 0.5);
  solid.finish(0.6).paint(HUB_MID, HUB_RIM);
  ring(solid, HATCH.x, HATCH.height, HATCH.radius, HATCH.radius * HATCH_DOOR, out + 0.5);
}

/**
 * Everything that stands still: the lower table and its front, the wall
 * under the screen with the shelf on it, the housing round the screen, the
 * two side walls with their rails, the brackets the slots hang from, the
 * gutters beside the open part of the table, and the lit edges that warn of
 * them.
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
  part('foot', () => {
    // The front of the shelf, which stands out from the wall, and the panel under it.
    solid.map(0, 0, 1, SHELF_SHARE).finish(0.3, 0.6);
    solid.quad(-LEDGE, SCREEN.foot, HOUSING.ledge, W + LEDGE, SCREEN.foot, HOUSING.ledge, W + LEDGE, HOUSING.shelf, HOUSING.ledge, -LEDGE, HOUSING.shelf, HOUSING.ledge);
    solid.map(0, SHELF_SHARE, 1, 1).finish(0.12, 0.55);
    solid.quad(-LEDGE, HOUSING.shelf, 0, W + LEDGE, HOUSING.shelf, 0, W + LEDGE, P, 0, -LEDGE, P, 0);
    solid.map();
  });
  part('lip', () => solid.finish(0.15).quad(0, 0, D, W, 0, D, W, -TRAY_DROP, D, 0, -TRAY_DROP, D));
  part('wall', () => {
    // Dark mirror in gold frames: it shows the lit cabinet back, and its strips of light are its own.
    solid.finish(0.45, 0.42);
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
      // The end of the wall where the table opens, and the top of the wall.
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
    buildHousing(solid);
    // The bracket each slot hangs from: a bar in from the cabinet's frame, at the front corner.
    for (const collar of COLLARS) {
      const side = collar.x < W / 2 ? -1 : 1;
      const near = collar.x + side * (SLOT.ring - 0.5);
      const far = (side < 0 ? 0 : W) + side * BRACKET_REACH;
      solid.finish(0.7).paint(BRACKET_TOP, BRACKET_FOOT);
      solid.box(Math.min(near, far), collar.height - 1.3, collar.depth - 3.4, Math.max(near, far), collar.height + 1.3, collar.depth - 0.8);
    }
    // The gold edge the winnings go over.
    solid.finish(0, 1).paint(NEON_GOLD);
    solid.quad(0, 0.04, D - 0.45, W, 0.04, D - 0.45, W, 0.04, D, 0, 0.04, D);
    solid.quad(0, 0.04, D + 0.02, W, 0.04, D + 0.02, W, -0.45, D + 0.02, 0, -0.45, D + 0.02);
  });
  return parts;
}

const CHROME = light('#f4f7fd');
const BAR_IDLE = light('#8fa6c0');
const BAR_LIT = light('#c9f4ff');
const GATE_NEON = light('#7df0ff', 1.5);
const GATE_LIT = light('#fffbe0', 1.7);
const GROOVE = light('#1a2036');
const ICE_EDGE = light('#eafcff');
const ICE_TOP = light('#9fe6ff');
const ICE_FOOT = light('#0e3a5c');
const DOOR_RIM = light('#ff6aa6');
const DOOR_MID = light('#7a0034');
const DOOR_OPEN = light('#1c0312');
/** How much of the hatch's ring is door. */
const HATCH_DOOR = 0.84;

/**
 * The runs of surfaces that change from frame to frame, in the order
 * `buildMoving` writes them: the pusher's top, the rest of the pusher, the
 * rails of the two feed arms, the shades under the rails, the fittings
 * whose light changes (the slots and the hatch), the gates, and the signs
 * over the gates. The first `MOVING_CAST` of them throw shadows: the pusher,
 * and the rails, which cross over the lower table and are seen to be over it
 * by the shadows they lay on it. A rail is thin, and the shadow of a thin
 * thing on a heap of medals is a broken line that reads as a scratch, so
 * under each rail there is a broader shade that is not in the picture and
 * only throws a shadow. The rest are lights, or out past the edge of
 * anything a shadow could fall on.
 */
export const MOVING_PARTS: Part[] = [
  { art: 'pusher', first: 0, count: 0 },
  { art: 'plain', first: 0, count: 0 },
  { art: 'plain', first: 0, count: 0 },
  { art: 'plain', first: 0, count: 0, unseen: true },
  { art: 'plain', first: 0, count: 0 },
  { art: 'plain', first: 0, count: 0 },
  { art: 'sign', first: 0, count: 0 },
];
export const MOVING_CAST = 4;

/**
 * A rail's channel, across: how far its floor reaches to either side of the
 * edge a medal stands on, how high the wall the medal leans on stands and
 * how high the lip on the other side, how wide the tube of light along the
 * top of the wall is, how far from the collar the rail comes out of the
 * slot, how far past the tip it runs on, and how far the shade under it
 * reaches to either side.
 */
const CHANNEL = { half: 0.6, wall: 2, lip: 0.7, tube: 0.45, from: 3, past: 0.6, shade: 1.3 } as const;

/**
 * The arm in hand: everything on a rail is placed by how far along it is
 * from the collar, how far from the line a medal's middle runs on toward the
 * edge the medal stands on, and how far to the side its face looks to.
 */
let rail = railFrame(0, 0);
const hang = (arm: Arm, tip: number): void => {
  rail = railFrame(arm, tip);
};
const railX = (far: number, down: number, across: number): number => rail.from.x + rail.along.x * far + rail.foot.x * down + rail.face.x * across;
const railY = (far: number, down: number, across: number): number => rail.from.height + rail.along.height * far + rail.foot.height * down + rail.face.height * across;
const railZ = (far: number, down: number, across: number): number => rail.from.depth + rail.along.depth * far + rail.foot.depth * down + rail.face.depth * across;

/** The four corners of a strip of the arm in hand, from `far0` to `far1` along it, between two lines that run down the rail. */
const corners = new Float64Array(12);
function strip(far0: number, far1: number, down0: number, across0: number, down1: number, across1: number): Float64Array {
  corners[0] = railX(far0, down0, across0);
  corners[1] = railY(far0, down0, across0);
  corners[2] = railZ(far0, down0, across0);
  corners[3] = railX(far1, down0, across0);
  corners[4] = railY(far1, down0, across0);
  corners[5] = railZ(far1, down0, across0);
  corners[6] = railX(far1, down1, across1);
  corners[7] = railY(far1, down1, across1);
  corners[8] = railZ(far1, down1, across1);
  corners[9] = railX(far0, down1, across1);
  corners[10] = railY(far0, down1, across1);
  corners[11] = railZ(far0, down1, across1);
  return corners;
}
/** Lays the strip last worked out as a surface, or as a flat touch of the given shape. */
function lay(to: Solid | Flat, c: Float64Array, shape: number = SHAPE.even): void {
  if (to instanceof Flat) to.quad(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], shape);
  else to.quad(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11]);
}

/** How bright an arm's light is: full on the one that takes the next medal and on one with a medal on its rail, low on the other. */
function armLit(machine: Machine, arm: Arm, aim: number): number {
  if (armFor(aim) === arm) return 1;
  for (let i = 0; i < machine.rolling.length; i++) if (machine.rolling[i].arm === arm) return 1;
  return 0.2;
}

/** Whether a slot is taking a medal in at this moment. */
function taking(machine: Machine, arm: Arm): boolean {
  for (let i = 0; i < machine.rolling.length; i++) {
    if (machine.rolling[i].arm === arm && legOf(machine.rolling[i].remaining) === 'slot') return true;
  }
  return false;
}

/** Whether a prize ball has only just been let go, and the hatch's door is still open behind it. */
function hatchOpen(machine: Machine): boolean {
  for (let i = 0; i < machine.falling.length; i++) {
    const ball = machine.falling[i];
    if (ball.ball && ball.remaining > ball.duration * 0.35) return true;
  }
  return false;
}

/**
 * The rails of the two feed arms, each from its slot to its tip: a thin
 * channel of polished metal, with a floor the medal's edge runs in a groove
 * of, a wall behind the medal that it leans on, a low lip in front of it,
 * and along the top of the wall a tube of light. The medals themselves are
 * among the other medals.
 */
function buildRails(solid: Solid, machine: Machine, options: DrawOptions): void {
  const { half, wall, lip, tube, from, past } = CHANNEL;
  for (let index = 0; index < 2; index++) {
    const arm = index as Arm;
    const lit = armLit(machine, arm, options.aim);
    hang(arm, armTipAt(machine, arm));
    const end = rail.length + past;
    solid.finish(1).paint(STEEL_TOP);
    lay(solid, strip(from, end, R, -half, R, half));
    solid.finish(0.3).paint(GROOVE);
    lay(solid, strip(from, end, R - 0.02, -0.16, R - 0.02, 0.16));
    solid.finish(0.9).paint(STEEL_BRIGHT, STEEL_TOP);
    lay(solid, strip(from, end, R - lip, half, R, half));
    solid.paint(STEEL_TOP, STEEL_FOOT);
    lay(solid, strip(from, end, R - wall, -half, R, -half));
    solid.finish(0, 0.6 + 0.8 * lit).paint(lit > 0.5 ? BAR_LIT : BAR_IDLE);
    lay(solid, strip(from, end, R - wall - tube, -half, R - wall, -half));
  }
}

/** The shade under each rail: a strip broader than the rail, just under its floor. It is not in the picture; it is what the lamp sees. */
function buildShades(solid: Solid, machine: Machine): void {
  for (let index = 0; index < 2; index++) {
    hang(index as Arm, armTipAt(machine, index as Arm));
    lay(solid, strip(CHANNEL.from, rail.length + CHANNEL.past, R + 0.15, -CHANNEL.shade, R + 0.15, CHANNEL.shade));
  }
}

/**
 * The fittings whose light changes. Each slot: a boss of polished metal at
 * the near end of its rail, facing the player, with a mouth cut upright in
 * its face, as wide as a medal is thick and a little taller than a medal,
 * inside a ring of light. The ring is bright on the side the next medal goes
 * in at, and flashes gold as one is taken. And the door of the hatch, which
 * stands open for a moment behind a prize ball.
 */
function buildFittings(solid: Solid, machine: Machine, options: DrawOptions): void {
  for (let index = 0; index < 2; index++) {
    const arm = index as Arm;
    const { x, height: y, depth } = COLLARS[index];
    const face = depth + SLOT_BODY.face;
    const busy = taking(machine, arm);
    const lit = busy ? 1 : armFor(options.aim) === arm ? 0.7 : 0.25;
    solid.finish(1).paint(CHROME);
    band(solid, x, y, SLOT.ring, depth - SLOT_BODY.back, face);
    solid.finish(0.55).paint(HUB_RIM, HUB_MID);
    ring(solid, x, y, SLOT.ring, SLOT.ring * 0.86, face);
    solid.finish(0, 0.5 + 0.9 * lit).paint(busy ? GATE_LIT : NEON_CYAN);
    ring(solid, x, y, SLOT.ring * 0.86, SLOT.ring * 0.68, face);
    solid.finish(0.3).paint(HUB_RIM, GLASS);
    ring(solid, x, y, SLOT.ring * 0.68, 0, face);
    // The mouth, and the bright edge down either side of it.
    const tall = R + 0.4;
    solid.finish(0, 0.4 + 0.6 * lit).paint(ICE_EDGE);
    solid.quad(x - 0.95, y + tall, face + 0.02, x + 0.95, y + tall, face + 0.02, x + 0.95, y - tall, face + 0.02, x - 0.95, y - tall, face + 0.02);
    solid.finish(0).paint(BLACK);
    solid.quad(x - 0.7, y + tall - 0.2, face + 0.04, x + 0.7, y + tall - 0.2, face + 0.04, x + 0.7, y - tall + 0.2, face + 0.04, x - 0.7, y - tall + 0.2, face + 0.04);
  }
  if (hatchOpen(machine)) solid.finish(0, 0.6).paint(DOOR_OPEN, BLACK);
  else solid.finish(0.6, 0.35).paint(DOOR_RIM, DOOR_MID);
  ring(solid, HATCH.x, HATCH.height, HATCH.radius * HATCH_DOOR, 0, HOUSING.out + 0.3);
}

// ── The gates ───────────────────────────────────────────────────────────────
// The three gates stand at the foot of the wall under the screen for as long as the engine has them
// there. They are kept to themselves — the two functions below, the one call to each, and the last
// two of `MOVING_PARTS` — so that they can be taken out in one piece when the engine moves them.

/** A gate is a frame of neon tube round its opening, where its sweep has taken it, and turns gold for a moment when a medal comes through. Over it rides its sign. */
function buildGates(solid: Solid, machine: Machine, stage: Stage, gates: Part, signs: Part): void {
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

/** What is only light about the gates: the dark of each opening, lit when a medal has come through, and the glow of its tubes. */
function gateTouches(flat: Flat, machine: Machine, stage: Stage, calm: boolean): void {
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
}

// ── What moves ──────────────────────────────────────────────────────────────

/**
 * Everything that changes from frame to frame: the pusher where its stroke
 * has taken it, the rails of the two feed arms where they point, the slots
 * and the hatch as they are lit, and the three gates where their sweep has
 * taken them, each with its sign.
 */
export function buildMoving(solid: Solid, machine: Machine, front: number, stage: Stage, options: DrawOptions): void {
  solid.clear().map().paint(WHITE);
  const [top, cast, rails, shades, fittings, gates, signs] = MOVING_PARTS;

  // The pusher is a box of clear acrylic. Its top is one picture that rides with its lip.
  top.first = solid.count;
  solid.map(0, BEVEL / PUSHER.max, 1, front / PUSHER.max).finish(0.5, 0.3);
  solid.quad(0, P, front - BEVEL, W, P, front - BEVEL, W, P, 0, 0, P, 0);
  top.count = solid.count - top.first;

  // The edge of the sheet along the lip catches the light; the face below it is clear, and darker toward the table.
  cast.first = solid.count;
  solid.map().finish(0.3, 0.9).paint(ICE_EDGE).quad(0, P, front - BEVEL, W, P, front - BEVEL, W, P - BEVEL, front, 0, P - BEVEL, front);
  solid.finish(0.7, 0.3).paint(ICE_TOP, ICE_FOOT).quad(0, P - BEVEL, front, W, P - BEVEL, front, W, 0, front, 0, 0, front);
  cast.count = solid.count - cast.first;

  rails.first = solid.count;
  buildRails(solid, machine, options);
  rails.count = solid.count - rails.first;

  shades.first = solid.count;
  buildShades(solid, machine);
  shades.count = solid.count - shades.first;

  fittings.first = solid.count;
  buildFittings(solid, machine, options);
  fittings.count = solid.count - fittings.first;

  buildGates(solid, machine, stage, gates, signs);
}

// ── Flat touches ────────────────────────────────────────────────────────────

/** Numbers per corner of a flat touch: where, its colour, how much it hides and how much light it adds, where in its own square, and its shape. */
export const FLAT_STRIDE = 11;
/** A flat touch is even all over, fades from its middle like a spot, or fades to either side of a line. */
export const SHAPE = { even: 0, spot: 1, line: 2 } as const;

/**
 * Glows and shades laid on the surfaces after they are drawn. Each either
 * hides what is under it by some amount (a shade), adds light to it (a
 * glow), or both. Where nothing is drawn under one — over the screen — it
 * shades or lights the page's screen behind the picture just the same.
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

const LAMPS = ['#fff3a8', '#ffd65c'].map((hex) => light(hex));
const PARTY_LAMPS = SPARK_COLORS.map((hex) => light(hex));
const TRAY_LAMPS = ['#ffd65c', '#fff3a8'].map((hex) => light(hex));
const FACE_LAMPS = ['#7df0ff', '#d6fbff'].map((hex) => light(hex));
const STRIP_LAMPS = ['#ff9bd0', '#7df0ff'].map((hex) => light(hex));
const HOLD_LIT = light('#ffd65c');
const HOLD_DARK = light('#6a5cb0');
const TIP_LAMP = light('#7df0ff');
const STUD = light('#ffd98a');
/**
 * Bulbs in each row: across the hood's face, down each strip beside the
 * screen, along each rail of the table, under the front edge, across the
 * pusher's face, and the hold's lamps on the shelf.
 */
export const LAMP_ROWS = { hood: 20, strip: 12, rail: 12, tray: 30, face: 24, hold: 8 } as const;
/** Gold studs: at each end of the shelf and of the hood's face. */
export const STUDS = 4;

/**
 * Every bulb, lamp and stud: across the hood and down both sides of the
 * screen, along both rails of the table, under the front edge and across
 * the pusher's face, each in a row a glow travels along, a third of a cycle
 * from one bulb to the next — `wave` is where it has got to. Then the
 * hold's lamps on the shelf under the screen, as many lit as the machine
 * holds spins; the lamp at the tip of each feed arm, which marks where a
 * medal will leave it; and the studs. Each bulb also lights the surface it
 * is on.
 */
export function buildLamps(beads: Rows, flat: Flat, machine: Machine, front: number, wave: number, partying: boolean, options: DrawOptions): void {
  beads.count = 0;
  const lamps = partying ? PARTY_LAMPS : LAMPS;
  const { hood, out, ledge, shelf } = HOUSING;
  // Across the hood's face, half the row to each side of the hatch.
  const each = LAMP_ROWS.hood / 2;
  const reach = HATCH.x - HATCH.radius - 5;
  for (let i = 0; i < LAMP_ROWS.hood; i++) {
    const x = i < each ? 3 + ((i + 0.5) / each) * (reach - 3) : W - reach + ((i - each + 0.5) / each) * (reach - 3);
    const y = (hood + WALL) / 2 + 1.6;
    const colour = lamps[i % lamps.length];
    const glow = 0.5 + 0.5 * Math.sin(wave - (i * TAU) / 3);
    beadRow(beads, x, y, out + 0.2, 0.7, colour[0], colour[1], colour[2], BEAD.bulb(glow));
    flat.ink(colour, 0, 0.12 + 0.5 * glow).onPanel(x, y, out + 0.06, 3);
  }
  const strips = partying ? PARTY_LAMPS : STRIP_LAMPS;
  for (let i = 0; i < LAMP_ROWS.strip * 2; i++) {
    const down = i >> 1;
    const x = i % 2 === 0 ? (SCREEN.left - 1.1) / 2 : W - (SCREEN.left - 1.1) / 2;
    const y = hood - 3.2 - (down / (LAMP_ROWS.strip - 1)) * (hood - SCREEN.foot - 6.4);
    const colour = strips[down % strips.length];
    const glow = 0.5 + 0.5 * Math.sin(wave - (down * TAU) / 3);
    beadRow(beads, x, y, ledge + 0.22, 0.62, colour[0], colour[1], colour[2], BEAD.bulb(glow));
    flat.ink(colour, 0, 0.1 + 0.45 * glow).onPanel(x, y, ledge + 0.08, 2.4);
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
  // The hold: a lamp for each spin the machine is holding, lit from the left.
  const held = options.stock ?? 0;
  const middle = (shelf + SCREEN.foot) / 2;
  for (let i = 0; i < LAMP_ROWS.hold; i++) {
    const x = HOLD_LAMPS.first + HOLD_LAMPS.step * i;
    const lit = i < held;
    const colour = lit ? HOLD_LIT : HOLD_DARK;
    beadRow(beads, x, middle, ledge + 0.3, HOLD_LAMPS.radius, colour[0], colour[1], colour[2], BEAD.bulb(lit ? 1 : 0.03));
    if (lit) flat.ink(HOLD_LIT, 0, 0.55).onPanel(x, middle, ledge + 0.1, HOLD_LAMPS.radius * 2.6);
  }
  // The lamp at the tip of each arm, on the end of the wall of its channel.
  for (let index = 0; index < 2; index++) {
    const arm = index as Arm;
    const lit = armLit(machine, arm, options.aim);
    hang(arm, armTipAt(machine, arm));
    const far = rail.length + CHANNEL.past;
    const down = R - CHANNEL.wall - CHANNEL.tube - 0.5;
    beadRow(beads, railX(far, down, -CHANNEL.half), railY(far, down, -CHANNEL.half), railZ(far, down, -CHANNEL.half), 0.8, TIP_LAMP[0], TIP_LAMP[1], TIP_LAMP[2], BEAD.bulb(lit));
  }
  for (const x of [1.6, W - 1.6]) {
    beadRow(beads, x, middle, ledge + 0.25, 0.8, STUD[0], STUD[1], STUD[2], BEAD.stud);
    beadRow(beads, x, (hood + WALL) / 2, out + 0.25, 0.9, STUD[0], STUD[1], STUD[2], BEAD.stud);
  }
}

const GLOW_RED = light('#ff5468');
const GLOW_GOLD = light('#ffd65c');
const GLOW_PINK = light('#ff56aa');
const GLOW_CYAN = light('#40e2ff');
const GLOW_LIT = light('#fff496');
const GATE_DARK = light('#06021e');
const ICE = light('#c8f4ff');
/**
 * How far a shadow on the screen lies from what throws it, for each unit
 * the thing is out from the wall: the room's light comes in over the
 * player's left shoulder, so the shadow is down and to the right.
 */
const CAST = { x: 0.3, y: -0.55 } as const;

/**
 * What is only light about the feed arms: the glow of the tube along each
 * rail, and round each slot the light of its ring, which flashes as a medal
 * goes in.
 */
function armTouches(flat: Flat, machine: Machine, options: DrawOptions): void {
  const { half, wall, tube, from, past } = CHANNEL;
  for (let index = 0; index < 2; index++) {
    const arm = index as Arm;
    const lit = armLit(machine, arm, options.aim);
    hang(arm, armTipAt(machine, arm));
    flat.ink(GLOW_CYAN, 0, 0.1 + 0.34 * lit);
    lay(flat, strip(from, rail.length + past, R - wall - tube / 2 - 1.5, -half + 0.03, R - wall - tube / 2 + 1.5, -half + 0.03), SHAPE.line);
    const { x, height: y, depth } = COLLARS[index];
    const busy = taking(machine, arm);
    const glow = busy ? 1 : armFor(options.aim) === arm ? 0.6 : 0.2;
    flat.ink(busy ? GLOW_LIT : GLOW_CYAN, 0, 0.75 * glow).onPanel(x, y, depth + SLOT_BODY.face + 0.4, SLOT.ring * 1.5);
  }
}

/**
 * What is in front of the screen and is seen against it. The page's screen
 * is behind this picture, so each of these shades or lights the screen
 * itself: the shade the hood throws down the top of it, two bands of light
 * across the glass, the glow under the hatch when its door is open, and the
 * shadow of every medal the machine pays and every prize ball as it comes
 * down in front of the picture.
 */
function screenTouches(flat: Flat, machine: Machine): void {
  const left = SCREEN.left + HOUSING.lap;
  const right = SCREEN.right - HOUSING.lap;
  const top = SCREEN.top - HOUSING.lap;
  const foot = SCREEN.foot + HOUSING.lap;
  flat.ink(BLACK, 0.36).fade(BLACK, 0).quad(left, top, 0.04, right, top, 0.04, right, top - 6, 0.04, left, top - 6, 0.04);
  const wide = right - left;
  flat.ink(WHITE, 0, 0.075).fade(WHITE, 0, 0.02);
  flat.quad(left + wide * 0.56, top, 0.05, left + wide * 0.72, top, 0.05, left + wide * 0.5, foot, 0.05, left + wide * 0.34, foot, 0.05);
  flat.ink(WHITE, 0, 0.045).fade(WHITE, 0, 0.01);
  flat.quad(left + wide * 0.79, top, 0.05, left + wide * 0.85, top, 0.05, left + wide * 0.63, foot, 0.05, left + wide * 0.57, foot, 0.05);
  if (hatchOpen(machine)) flat.ink(GLOW_PINK, 0, 0.5).onPanel(HATCH.x, HATCH.height, HOUSING.out + 0.6, HATCH.radius * 2.2);
  for (const medal of machine.falling) {
    if (medal.source !== 'payout') continue;
    const at = airSpot(medal, medal.ball ? P + BALL_RADIUS : LANDED);
    const size = (medal.ball ? BALL_RADIUS : R) * (1.2 + 0.05 * at.depth);
    const x = at.x + CAST.x * at.depth;
    const y = at.height + CAST.y * at.depth;
    // Only on the glass: under the shelf there is the heap, and a medal that low is nearly down.
    if (y < foot || y > top) continue;
    flat.ink(BLACK, Math.max(0.14, (medal.ball ? 0.46 : 0.36) - 0.014 * at.depth));
    flat.onPanel(Math.min(right - size * 0.4, Math.max(left + size * 0.4, x)), y, 0.06, size);
  }
}

/**
 * The flat touches of one frame: the dark where the pusher meets the lower
 * table and where the tables meet the walls, the glow round every lit edge
 * and along the edges of the acrylic, the aim guide, what is only light
 * about the feed arms and the gates, what is seen against the screen, the
 * light a medal leaves on the tray or in a gutter as it goes, and the dark
 * under each ball.
 */
export function buildTouches(flat: Flat, machine: Machine, front: number, stage: Stage, options: DrawOptions): void {
  const calm = options.calm ?? false;
  // Where the pusher's face meets the lower table, and where the tables meet the back wall and the side walls.
  flat.ink(BLACK, 0.62).fade(BLACK, 0).quad(0, 0.03, front, W, 0.03, front, W, 0.03, front + 9, 0, 0.03, front + 9);
  flat.ink(BLACK, 0.4).fade(BLACK, 0).quad(0, P + 0.03, 0, W, P + 0.03, 0, W, P + 0.03, 5, 0, P + 0.03, 5);
  for (let index = 0; index < 2; index++) {
    const x = index === 0 ? 0 : W;
    const inward = index === 0 ? 5 : W - 5;
    flat.ink(BLACK, 0.34).fade(BLACK, 0);
    flat.quad(x, P + 0.03, 0, x, P + 0.03, front - BEVEL, inward, P + 0.03, front - BEVEL, inward, P + 0.03, 0);
    flat.quad(x, 0.03, front, x, 0.03, OPEN, inward, 0.03, OPEN, inward, 0.03, front);
  }
  // The edges of the acrylic: along the lip, and along the foot of the pusher's face.
  flat.ink(ICE, 0, 0.5).quad(0, P + 0.04, front - 2.2, W, P + 0.04, front - 2.2, W, P + 0.04, front + 0.6, 0, P + 0.04, front + 0.6, SHAPE.line);
  flat.ink(ICE, 0, 0.3).quad(0, 1.6, front + 0.05, W, 1.6, front + 0.05, W, -0.2, front + 0.05, 0, -0.2, front + 0.05, SHAPE.line);

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
  // The light of the gap under the hood, on the hood's own face.
  flat.ink(GLOW_GOLD, 0, 0.4).quad(0, HOUSING.hood + 3, HOUSING.out + 0.05, W, HOUSING.hood + 3, HOUSING.out + 0.05, W, HOUSING.hood - 1.6, HOUSING.out + 0.05, 0, HOUSING.hood - 1.6, HOUSING.out + 0.05, SHAPE.line);

  gateTouches(flat, machine, stage, calm);

  // Where a medal that leaves now is let go, and how far from that it can land: from the tip of the
  // arm on the side of the aim, which is over the aim once it has swung there, down to the pusher.
  if (options.showGuide) {
    const over = armTipAt(machine, armFor(options.aim));
    const lands = (LANDING.from + LANDING.to) / 2;
    flat.ink(WHITE, 0.24).fade(WHITE, 0.03);
    flat.wedge(over, ARMS.tip - R, ARMS.depth, Math.max(R, over - LANDING.scatter), P + 0.2, lands, Math.min(W - R, over + LANDING.scatter), P + 0.2, lands);
  }
  armTouches(flat, machine, options);
  screenTouches(flat, machine);

  // A ball rests in the dark it throws on whatever it stands on.
  flat.ink(BLACK, 0.5);
  for (const medal of machine.medals) {
    const dropping = medal.level === 0 && medal.sinceDrop >= 0 && medal.sinceDrop < LIP_FALL;
    if (medal.ball && !dropping) flat.onFloor(medal.x, (medal.level === 1 ? P : 0) + HEIGHT.medal + 0.06, medal.y, BALL_RADIUS * 1.3);
  }
}
