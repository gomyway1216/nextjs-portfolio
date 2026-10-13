/**
 * The payout works in the 3D scene: the hopper's two doors in the hood's
 * face, with their frames, stays, hinges and lamps, and the tower lifts'
 * rings, sleeves and collars on the pusher. Like works2d.ts it draws what
 * works.ts says is there and decides nothing. The medals that pour out of
 * the doors are medals like any others and are written with the rest, in
 * scene3d.ts, held as works.ts says.
 *
 * `buildWorks` adds its solid surfaces after the cabinet's own moving ones,
 * in the same list, and says where they are in `WORKS_PARTS`; its lamps go
 * among the cabinet's bulbs and its glows among the flat touches. A sleeve is
 * clear, and the scene draws no clear solids, so it is laid on as a flat
 * touch: a little light all the way round the tower, more of it toward the
 * two edges, where a tube of acrylic is seen through most of itself.
 */

import { Flat, SHAPE, Solid, light, type Part, type Rgb } from './cabinet3d';
import type { Machine } from './engine';
import { DOORS, POUR } from './hopper';
import { BEAD, beadRow, type Rows } from './scene3d';
import { HOUSING } from './view';
import { DECK, DOOR, GUARD, chuteShows, doorLampLit, doorSwing, liftViews, onFlap } from './works';

const TAU = Math.PI * 2;
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
const RING_LIT = light('#ffd65c', 1.5);
const RING_DARK = light('#8d97b8');
const ICE = light('#d2f0ff');
/** Flat sides to a sleeve: enough that its collar reads as round. */
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

/** A flat ring lying at height y about (x, z), from radius r0 in to r1. */
function annulus(solid: Solid, x: number, z: number, r0: number, r1: number, y: number): void {
  for (let i = 0; i < SIDES; i++) {
    const c0 = Math.cos((i / SIDES) * TAU);
    const s0 = Math.sin((i / SIDES) * TAU);
    const c1 = Math.cos(((i + 1) / SIDES) * TAU);
    const s1 = Math.sin(((i + 1) / SIDES) * TAU);
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

/** The tower lifts that are at work: the ring in the deck, the clear sleeve, its collar and its lamp. */
function buildLifts(solid: Solid, flat: Flat, beads: Rows, machine: Machine, front: number, calm: boolean): void {
  for (const view of liftViews(machine, front, calm)) {
    const { x, y: z } = view;
    // The ring in the deck round the hatch, lit while the lift is at work.
    solid.finish(view.working ? 0 : 0.6, view.working ? 1 : 0).paint(view.working ? RING_LIT : RING_DARK);
    annulus(solid, x, z, GUARD.radius + GUARD.ring, GUARD.radius, DECK + 0.04);
    if (view.working) flat.ink(RING_LIT, 0, 0.35).onFloor(x, DECK + 0.06, z, (GUARD.radius + GUARD.ring) * 1.7);
    if (view.rim <= 0.05) continue;
    const rim = DECK + view.rim;
    // The sleeve, which is clear: a little light all round, and more toward the edges it is seen through.
    for (let i = 0; i < SIDES; i++) {
      const a0 = (i / SIDES) * TAU;
      const a1 = ((i + 1) / SIDES) * TAU;
      const edge = Math.abs(Math.cos((a0 + a1) / 2)) ** 3;
      flat.ink(ICE, 0.02, 0.05 + 0.24 * edge);
      flat.quad(x + Math.cos(a0) * GUARD.radius, rim, z + Math.sin(a0) * GUARD.radius, x + Math.cos(a1) * GUARD.radius, rim, z + Math.sin(a1) * GUARD.radius, x + Math.cos(a1) * GUARD.radius, DECK, z + Math.sin(a1) * GUARD.radius, x + Math.cos(a0) * GUARD.radius, DECK, z + Math.sin(a0) * GUARD.radius, SHAPE.even);
    }
    // The collar round its top, and the lamp on the front of it.
    const band = Math.min(GUARD.collar, view.rim);
    solid.finish(1).paint(CHROME, CHROME_DEEP);
    tube(solid, x, z, GUARD.radius + 0.14, rim - band, rim);
    solid.finish(0.9).paint(CHROME);
    annulus(solid, x, z, GUARD.radius + 0.14, GUARD.radius - 0.1, rim);
    beadRow(beads, x, rim - band / 2, z + GUARD.radius + 0.3, 0.36, AMBER[0], AMBER[1], AMBER[2], BEAD.bulb(view.working ? 1 : 0.06));
  }
}

/**
 * Everything of the payout works that is drawn this frame. `solid` is the
 * list the cabinet's own moving surfaces are already in: the works' are
 * added after them. `front` is where the pusher's lip is.
 */
export function buildWorks(solid: Solid, flat: Flat, beads: Rows, machine: Machine, front: number, calm: boolean): void {
  const [part] = WORKS_PARTS;
  part.first = solid.count;
  solid.map();
  buildDoors(solid, flat, beads, machine, calm);
  buildLifts(solid, flat, beads, machine, front, calm);
  part.count = solid.count - part.first;
}
