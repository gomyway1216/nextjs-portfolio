/**
 * The payout works in the 3D scene: the hopper's two doors in the hood's
 * face, with their frames, stays, hinges and lamps, and what moves in the
 * two tower tubes: the platform on its stem, the medals stacked on it and the
 * one dropping onto them, the glass of the tube with its gate, the arm, and
 * the lamps of each window. Like works2d.ts it draws what works.ts says is
 * there and decides nothing. The medals that pour out of the doors are
 * medals like any others and are written with the rest, in scene3d.ts, held
 * as works.ts says, and so is a tower an arm is pushing, which is a tower on
 * the field; the medals stacked in a tube are written here.
 *
 * `buildWorks` adds its solid surfaces after the cabinet's own moving ones,
 * in the same list, and says where they are in `WORKS_PARTS`; its lamps go
 * among the cabinet's bulbs and its glows among the flat touches. Glass is
 * clear, and the scene draws no clear solids, so a tube's glass is laid on as
 * flat touches: a little light all the way round, more of it toward the two
 * edges, where a tube of glass is seen through most of itself. The window
 * each tube stands in, its recess, frame and the plate of its count, never
 * moves and is part of the cabinet (cabinet3d.ts); so is the far side of
 * the tube's glass and the near side above the gate, which are made once
 * and copied in every frame, moved nowhere.
 */

import { FLAT_STRIDE, Flat, MATERIAL, SHAPE, type Part, type Rgb, Solid, light } from './cabinet3d';
import { MEDAL_THICKNESS, type Machine } from './engine';
import { DOORS, POUR } from './hopper';
import { turnOf } from './render';
import { BEAD, beadRow, chance, medalRow, type Rows } from './scene3d';
import { TUBE } from './stacker';
import { HOUSING } from './view';
import { ARM, DECK, DOOR, GATE, GLASS, PLATFORM, WINDOW, chuteShows, doorLampLit, doorSwing, onFlap, tubeViews, type TubeView } from './works';

const TAU = Math.PI * 2;
const T = MEDAL_THICKNESS;
const BLACK: Rgb = [0, 0, 0];
const FRAME = light('#4a3206');
const PLATE_TOP = light('#dfe4f2');
const PLATE_FOOT = light('#6f7896');
const CHUTE_TOP = light('#59627f');
const CHUTE_FOOT = light('#f1f4fb');
const RIB = light('#f7f9ff');
const RIB_SIDE = light('#7f8aad');
const STAY = light('#aab4d0');
const CHROME = light('#e4e8f4');
const CHROME_DEEP = light('#4b5574');
const AMBER = light('#ffc440', 1.6);
const AMBER_GLOW = light('#ffc440');
const ICE = light('#d2f0ff');
/** Flat sides to a round thing: enough that a stem or a platform reads as round. */
const SIDES = 20;
/** Channels to a door. */
const EACH = POUR.channels / DOORS.length;

/** The run of solid surfaces the works add to the moving ones. */
export const WORKS_PARTS: Part[] = [{ art: 'plain', first: 0, count: 0 }];

/** The wall of a tube about an upright axis through (x, z), from height y0 to y1. It shades from the first colour at y1 to the second at y0. */
function tube(solid: Solid, x: number, z: number, radius: number, y0: number, y1: number): void {
  for (let i = 0; i < SIDES; i++) {
    const c0 = Math.cos((i / SIDES) * TAU);
    const s0 = Math.sin((i / SIDES) * TAU);
    const c1 = Math.cos(((i + 1) / SIDES) * TAU);
    const s1 = Math.sin(((i + 1) / SIDES) * TAU);
    solid.quad(x + c0 * radius, y1, z + s0 * radius, x + c1 * radius, y1, z + s1 * radius, x + c1 * radius, y0, z + s1 * radius, x + c0 * radius, y0, z + s0 * radius);
  }
}

/** A flat ring lying at height y about (x, z), from radius r0 in to r1. A ring from nothing in is a disc. */
function annulus(solid: Solid, x: number, z: number, r0: number, r1: number, y: number, sides = SIDES): void {
  for (let i = 0; i < sides; i++) {
    const c0 = Math.cos((i / sides) * TAU);
    const s0 = Math.sin((i / sides) * TAU);
    const c1 = Math.cos(((i + 1) / sides) * TAU);
    const s1 = Math.sin(((i + 1) / sides) * TAU);
    solid.quad(x + c0 * r0, y, z + s0 * r0, x + c1 * r0, y, z + s1 * r0, x + c1 * r1, y, z + s1 * r1, x + c0 * r1, y, z + s0 * r1);
  }
}

/** The two doors of the hopper, as far open as they are, and the lamp beside each. */
function buildDoors(solid: Solid, flat: Flat, beads: Rows, machine: Machine, calm: boolean): void {
  const swing = doorSwing(machine, calm);
  const lit = doorLampLit(machine);
  const inner = chuteShows(swing);
  const top = DOOR.foot + DOOR.tall;
  const wall = HOUSING.out;
  const tip = onFlap(swing, 1);
  for (let index = 0; index < DOORS.length; index++) {
    const { from, to } = DOORS[index];
    const wide = to - from;
    // The frame the door shuts into, and the dark of the mouth behind it.
    solid.finish(0.35).paint(FRAME);
    solid.quad(from - 0.45, top + 0.4, wall + 0.02, to + 0.45, top + 0.4, wall + 0.02, to + 0.45, DOOR.foot - 0.4, wall + 0.02, from - 0.45, DOOR.foot - 0.4, wall + 0.02);
    solid.finish(0).paint(BLACK, lit ? light('#3a2606') : BLACK);
    solid.quad(from, top, wall + 0.04, to, top, wall + 0.04, to, DOOR.foot, wall + 0.04, from, DOOR.foot, wall + 0.04);
    // The flap: its outer side while it is up, its inner side, which is the chute, once it is down.
    solid.finish(0.6).paint(inner ? CHUTE_TOP : PLATE_TOP, inner ? CHUTE_FOOT : PLATE_FOOT);
    solid.quad(from, DOOR.foot, DOOR.face, to, DOOR.foot, DOOR.face, to, tip.height, tip.depth, from, tip.height, tip.depth);
    // The walls of its channels and the cheeks at its ends: a strip along the top of each, and its two sides.
    const a = onFlap(swing, 0.04);
    const b = onFlap(swing, 1);
    const a2 = onFlap(swing, 0.04, DOOR.rib);
    const b2 = onFlap(swing, 1, DOOR.rib);
    for (let rib = 0; rib <= EACH; rib++) {
      const x = from + (wide * rib) / EACH;
      const half = 0.14;
      solid.finish(0.8).paint(RIB);
      solid.quad(x - half, a2.height, a2.depth, x + half, a2.height, a2.depth, x + half, b2.height, b2.depth, x - half, b2.height, b2.depth);
      solid.finish(0.4).paint(RIB_SIDE);
      for (const side of [x - half, x + half]) solid.quad(side, a2.height, a2.depth, side, b2.height, b2.depth, side, b.height, b.depth, side, a.height, a.depth);
    }
    // The stays it is let down on, from the corners of its frame to its free edge.
    if (swing > 0.05) {
      solid.finish(0.7).paint(STAY);
      for (const x of [from + 0.3, to - 0.3]) solid.quad(x - 0.13, top, DOOR.face, x + 0.13, top, DOOR.face, x + 0.13, tip.height, tip.depth, x - 0.13, tip.height, tip.depth);
    } else {
      // Shut, it shows an arrow for each channel, pointing the way the medals will come.
      flat.ink(BLACK, 0.5);
      for (let channel = 0; channel < EACH; channel++) {
        const x = from + (wide * (channel + 0.5)) / EACH;
        flat.wedge(x, DOOR.foot + DOOR.tall * 0.3, DOOR.face + 0.03, x - 1.5, DOOR.foot + DOOR.tall * 0.7, DOOR.face + 0.03, x + 1.5, DOOR.foot + DOOR.tall * 0.7, DOOR.face + 0.03);
      }
    }
    // Its hinges, along its foot.
    solid.finish(1).paint(CHROME, CHROME_DEEP);
    for (const x of [from + DOOR.hinge.in, to - DOOR.hinge.in]) {
      solid.box(x - DOOR.hinge.long / 2, DOOR.foot - DOOR.hinge.radius, DOOR.face, x + DOOR.hinge.long / 2, DOOR.foot + DOOR.hinge.radius, DOOR.face + DOOR.hinge.radius * 2);
    }
    // Its lamp, at its outer end: lit for as long as the hopper is at work.
    const x = index === 0 ? from - DOOR.lamp.out : to + DOOR.lamp.out;
    const y = DOOR.foot + DOOR.tall / 2;
    beadRow(beads, x, y, wall + DOOR.lamp.radius * 0.5, DOOR.lamp.radius, AMBER[0], AMBER[1], AMBER[2], BEAD.bulb(lit ? 1 : 0.06));
    if (lit) flat.ink(AMBER_GLOW, 0, 0.55).onPanel(x, y, wall + DOOR.lamp.radius * 1.6, DOOR.lamp.radius * 4);
  }
}

// ── The tower tubes ─────────────────────────────────────────────────────────

/** Strips of glass round a tube: as many as a stem or a platform has sides. */
const PANES = SIDES;

/**
 * Lays a band of glass round a tube about (x, z), from height y0 to y1, as
 * flat touches: the near half only, the far half only, or both. A pane is
 * lit more toward the edges of the tube as the eye sees them, where the eye
 * looks through more of the glass. `slide` moves the panes sideways, as the
 * gate is slid aside.
 */
function glassBand(flat: Flat, x: number, z: number, y0: number, y1: number, half: 'near' | 'far', slide = 0): void {
  for (let i = 0; i < PANES; i++) {
    const a0 = (i / PANES) * TAU;
    const a1 = ((i + 1) / PANES) * TAU;
    const middle = (a0 + a1) / 2;
    // Toward the player is +z: the near half is where the sine is positive.
    if ((half === 'near') !== Math.sin(middle) > 0) continue;
    const edge = Math.abs(Math.cos(middle)) ** 3;
    flat.ink(ICE, 0.02, (half === 'near' ? 0.05 : 0.03) + (half === 'near' ? 0.24 : 0.12) * edge);
    const r = GLASS.radius;
    flat.quad(x + slide + Math.cos(a0) * r, y1, z + Math.sin(a0) * r, x + slide + Math.cos(a1) * r, y1, z + Math.sin(a1) * r, x + slide + Math.cos(a1) * r, y0, z + Math.sin(a1) * r, x + slide + Math.cos(a0) * r, y0, z + Math.sin(a0) * r, SHAPE.even);
  }
}

/**
 * The glass of both tubes that never moves: the far half of each tube all the
 * way up, and the near half over the gate. Made the first time it is wanted
 * and kept, and copied into every frame's touches.
 */
let stillGlass: Float32Array | null = null;
function fixedGlass(): Float32Array {
  if (stillGlass) return stillGlass;
  const flat = new Flat(PANES * 6 * 4);
  for (const x of TUBE.x) {
    glassBand(flat, x, TUBE.back, DECK, WINDOW.top, 'far');
    glassBand(flat, x, TUBE.back, DECK + GATE.tall + GATE.band, WINDOW.top, 'near');
  }
  stillGlass = flat.data.slice(0, flat.count * FLAT_STRIDE);
  return stillGlass;
}

/**
 * Adds corners that were made once to a list of flat touches. The list is
 * made longer first if it has no room, as it makes itself longer.
 */
function lay(list: { data: Float32Array; count: number }, made: Float32Array): void {
  const first = list.count * FLAT_STRIDE;
  const end = first + made.length;
  if (end > list.data.length) {
    let length = Math.max(list.data.length, FLAT_STRIDE) * 2;
    while (length < end) length *= 2;
    const longer = new Float32Array(length);
    longer.set(list.data.subarray(0, first));
    list.data = longer;
  }
  list.data.set(made, first);
  list.count += made.length / FLAT_STRIDE;
}

/**
 * The medals stacked on a tube's platform, counted up from it, and the one
 * dropping onto them. Each is a hair out of line with the one below, as the
 * medals of a tower are.
 */
function stackRows(medals: Rows, view: TubeView, made: number): void {
  const id = 900_000 + made * 2 + view.index;
  for (let i = 0; i < view.stacked; i++) {
    const dx = (chance(id, i * 2 + 5) - 0.5) * 0.2;
    const dz = (chance(id, i * 2 + 6) - 0.5) * 0.2;
    medalRow(medals, id + i * 31, view.x + dx, view.platform + T * (i + 0.5), TUBE.back + dz, turnOf(id + i * 7), 0, 0, 0, 0, 0.85);
  }
  if (view.dropping >= 0) {
    const top = view.platform + view.stacked * T;
    const from = WINDOW.top - 0.4;
    const height = from + (top + T / 2 - from) * view.dropping * view.dropping;
    medalRow(medals, id + view.stacked * 31, view.x, height, TUBE.back, turnOf(id + view.stacked * 7), 0.25 * (1 - view.dropping), 0, 0, 0, 0.85);
  }
}

/** A rod from one point to another, both at height y: a square bar, as thick as `radius` is, on its edge. */
function rod(solid: Solid, from: { x: number; y: number }, to: { x: number; y: number }, y: number, radius: number): void {
  const dx = to.x - from.x;
  const dz = to.y - from.y;
  const length = Math.hypot(dx, dz);
  if (length < 0.01) return;
  const sx = (-dz / length) * radius;
  const sz = (dx / length) * radius;
  // Its top, and its two sides.
  solid.quad(from.x - sx, y + radius, from.y - sz, from.x + sx, y + radius, from.y + sz, to.x + sx, y + radius, to.y + sz, to.x - sx, y + radius, to.y - sz);
  for (const side of [-1, 1]) {
    solid.quad(from.x + side * sx, y + radius, from.y + side * sz, to.x + side * sx, y + radius, to.y + side * sz, to.x + side * sx, y - radius, to.y + side * sz, from.x + side * sx, y - radius, from.y + side * sz);
  }
}

/** One tube: its platform and stem, the gate's glass as far aside as it has slid, the band over it, the arm, and the lamps of its window. */
function buildTube(solid: Solid, flat: Flat, beads: Rows, medals: Rows | undefined, view: TubeView, made: number): void {
  const { x } = view;
  const z = TUBE.back;
  // The stem, while the platform is up, and the platform: a chrome disc with its rim.
  solid.as(MATERIAL.chrome).paint(CHROME, CHROME_DEEP);
  if (view.platform > DECK + 0.05) tube(solid, x, z, 0.7, DECK, view.platform - PLATFORM.thick);
  tube(solid, x, z, PLATFORM.radius, view.platform - PLATFORM.thick, view.platform);
  solid.paint(CHROME);
  annulus(solid, x, z, 0, PLATFORM.radius, view.platform);
  if (medals) stackRows(medals, view, made);
  // The gate: the near half of the tube under the band, slid aside toward the cabinet's side as far as it has gone.
  if (view.gate < 0.999) glassBand(flat, x, z, DECK, DECK + GATE.tall, 'near', view.gate * GLASS.radius * 2.2 * (view.index === 0 ? -1 : 1));
  // The band over the gate, round the tube.
  solid.as(MATERIAL.chrome).paint(CHROME, CHROME_DEEP);
  tube(solid, x, z, GLASS.radius + 0.12, DECK + GATE.tall, DECK + GATE.tall + GATE.band);
  // The arm: the ram out of the tube, and the boom from its head.
  if (view.ram !== null) {
    const height = DECK + ARM.height;
    const head = { x, y: view.ram };
    solid.as(MATERIAL.chrome).paint(CHROME, CHROME_DEEP);
    rod(solid, { x, y: WINDOW.recess }, head, height, ARM.radius * 1.4);
    let push = head;
    if (view.boom) {
      rod(solid, head, view.boom, height, ARM.radius);
      push = view.boom;
    }
    // The plate on the head of whichever is out furthest, square to the way it pushes.
    const dx = push.x - head.x;
    const dz = push.y - head.y || 1;
    const length = Math.hypot(dx, dz) || 1;
    const back = { x: push.x - (dx / length) * 0.3, y: push.y - (dz / length) * 0.3 };
    solid.paint(CHROME);
    rod(solid, { x: back.x - (dz / length) * (ARM.head / 2), y: back.y + (dx / length) * (ARM.head / 2) }, { x: back.x + (dz / length) * (ARM.head / 2), y: back.y - (dx / length) * (ARM.head / 2) }, height, ARM.radius * 1.2);
  }
  // The lamps at the top corners of the window's frame: lit while the tube is at work.
  for (const side of [-1, 1]) {
    const lx = x + side * (WINDOW.half + WINDOW.frame / 2);
    const ly = WINDOW.top + WINDOW.frame / 2;
    beadRow(beads, lx, ly, HOUSING.ledge + 0.35, 0.42, AMBER[0], AMBER[1], AMBER[2], BEAD.bulb(view.working ? 1 : 0.06));
    if (view.working) flat.ink(AMBER_GLOW, 0, 0.5).onPanel(lx, ly, HOUSING.ledge + 0.6, 1.6);
  }
}

/** The two tubes, and the glass of them that never moves. */
function buildTubes(solid: Solid, flat: Flat, beads: Rows, medals: Rows | undefined, machine: Machine, front: number, calm: boolean): void {
  lay(flat, fixedGlass());
  for (const view of tubeViews(machine, front, calm)) buildTube(solid, flat, beads, medals, view, machine.stacker.made);
}

/**
 * Everything of the payout works that is drawn this frame. `solid` is the
 * list the cabinet's own moving surfaces are already in: the works' are
 * added after them. `front` is where the pusher's lip is. `medals` is the
 * list the frame's medals are already in: the medals stacked in the tubes
 * are added to it.
 */
export function buildWorks(solid: Solid, flat: Flat, beads: Rows, machine: Machine, front: number, calm: boolean, medals?: Rows): void {
  const [part] = WORKS_PARTS;
  part.first = solid.count;
  solid.map();
  buildDoors(solid, flat, beads, machine, calm);
  buildTubes(solid, flat, beads, medals, machine, front, calm);
  part.count = solid.count - part.first;
}
