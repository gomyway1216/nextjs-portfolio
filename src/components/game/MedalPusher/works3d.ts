/**
 * The payout works in the 3D scene: the hopper's two doors in the hood's
 * face, with their frames, stays, hinges and lamps, and the tower lifts'
 * hatches in the pusher's deck with their rings of light, their sleeves and
 * collars and the towers coming up inside them. Like works2d.ts it draws
 * what works.ts says is there and decides nothing. The medals that pour out
 * of the doors are medals like any others and are written with the rest, in
 * scene3d.ts, held as works.ts says; the medals of a tower that a lift still
 * holds are written here, as far up through its hatch as the lift has
 * brought them.
 *
 * `buildWorks` adds its solid surfaces after the cabinet's own moving ones,
 * in the same list, and says where they are in `WORKS_PARTS`; its lamps go
 * among the cabinet's bulbs and its glows among the flat touches. A sleeve is
 * clear, and the scene draws no clear solids, so it is laid on as a flat
 * touch: a little light all the way round the tower, more of it toward the
 * two edges, where a tube of acrylic is seen through most of itself. The
 * deck is one sheet with no hole in it, so the mouth of a hatch is a black
 * surface a hair over the deck, and a tower coming up through it is medals
 * that stand part of the way out of the sheet.
 *
 * There are eighteen hatches in the deck and nearly always every one of them
 * is shut. A shut hatch is the same steel and the same seam every frame, and
 * only rides with the pusher, so the whole deck of them is made once, as it
 * is with the pusher's lip at the back wall, and every frame a copy of it is
 * moved out to where the lip is: nothing of it is worked out again. Only a
 * hatch at work is built, as far open and as brightly lit as it is that
 * frame, and the shut ones beside it are still their part of the copy.
 */

import { FLAT_STRIDE, Flat, MATERIAL, SHAPE, SOLID_STRIDE, Solid, light, type Part, type Rgb } from './cabinet3d';
import { MEDAL_RADIUS, MEDAL_THICKNESS, type Machine } from './engine';
import { DOORS, POUR } from './hopper';
import { turnOf } from './render';
import { BEAD, beadRow, chance, medalRow, type Rows } from './scene3d';
import { HOUSING } from './view';
import { DECK, DOOR, GUARD, DECK_HATCH, HATCHES, chuteShows, doorLampLit, doorSwing, hatchViews, lampGlow, liftViews, onFlap, type HatchView, type LiftView } from './works';

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
const RING_LIT = light('#ffd65c', 1.5);
const ICE = light('#d2f0ff');
const DOOR_STEEL = light('#7f9cc2');
const COLLAR_STEEL = light('#3d5680');
const SHAFT: Rgb = [0, 0, 0];
const SEAM = light('#0a1c34');
/** How far to either side of the seam between a hatch's doors its dark reaches. */
const SEAM_HALF = 0.45;
/** Flat sides to a sleeve: enough that its collar reads as round. */
const SIDES = 20;
/** Flat sides to a hatch's collar, one to each arc of its ring of light, and strips to each of its doors: there are eighteen hatches, and each is a few pixels of a phone. */
const HATCH_SIDES = DECK_HATCH.lamps;
const DOOR_STRIPS = 4;
/** How far over the deck a hatch's doors and collar lie, the mouth of its shaft, the seam, and the lit arcs of its ring: a hair each, and under the dark a medal leaves on what it lies on. */
const OVER = { doors: 0.02, shaft: 0.03, seam: 0.035, lamp: 0.045 } as const;
/**
 * The light a hatch's ring throws: on the deck round it, and on whatever
 * lies over the hatch or against it. That second light is laid two medals up,
 * over the heap, so that the ring is seen to come on under a deck that is
 * covered. `shine` is how much light each adds at its brightest, which is
 * along the middle of the ring.
 */
const THROWN = [
  { up: 0.06, shine: 0.6 },
  { up: T * 2 + 0.2, shine: 0.7 },
] as const;
/** How far a tower's top medal stands out of the deck at the least, once there is light on it: the deck has no hole for it to be down in. */
const PROUD = 0.1;
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

/**
 * The part of a round plate of `radius` about (x, z) that lies between
 * `from` and `to` across from its middle, at height y: strips from the one
 * to the other, each as long as the circle is there.
 */
function plate(solid: Solid, x: number, z: number, radius: number, from: number, to: number, y: number, strips: number): void {
  const half = (across: number): number => Math.sqrt(Math.max(0, radius * radius - across * across));
  for (let i = 0; i < strips; i++) {
    const a = from + ((to - from) * i) / strips;
    const b = from + ((to - from) * (i + 1)) / strips;
    // The longer side first: the strip at the rim comes to a point.
    const [near, far] = Math.abs(a) < Math.abs(b) ? [a, b] : [b, a];
    solid.quad(x + near, y, z - half(near), x + far, y, z - half(far), x + far, y, z + half(far), x + near, y, z + half(near));
  }
}

/**
 * The steel of a hatch about (x, z) whose doors have slid `doors` of the way
 * apart: its collar, what is seen of its two doors, and the mouth of the
 * shaft between them.
 */
export function hatchSteel(solid: Solid, x: number, z: number, doors: number): void {
  const open = DECK_HATCH.radius * doors;
  solid.as(MATERIAL.enamel).paint(COLLAR_STEEL);
  annulus(solid, x, z, DECK_HATCH.collar, DECK_HATCH.radius, DECK + OVER.doors, HATCH_SIDES);
  if (doors < 0.99) {
    solid.as(MATERIAL.enamel).paint(DOOR_STEEL);
    plate(solid, x, z, DECK_HATCH.radius, -open, -DECK_HATCH.radius, DECK + OVER.doors, DOOR_STRIPS);
    plate(solid, x, z, DECK_HATCH.radius, open, DECK_HATCH.radius, DECK + OVER.doors, DOOR_STRIPS);
  }
  if (doors > 0.01) {
    solid.finish(0).paint(SHAFT);
    plate(solid, x, z, DECK_HATCH.radius, -open, open, DECK + OVER.shaft, DOOR_STRIPS * 2);
  }
}

/** The seam a shut hatch's doors meet along, from the back of the deck to the front: a line that is dark down its middle and fades to either side. */
function hatchSeam(flat: Flat, x: number, z: number): void {
  const y = DECK + OVER.seam;
  flat.ink(SEAM, 0.8).quad(x - SEAM_HALF, y, z - DECK_HATCH.radius, x - SEAM_HALF, y, z + DECK_HATCH.radius, x + SEAM_HALF, y, z + DECK_HATCH.radius, x + SEAM_HALF, y, z - DECK_HATCH.radius, SHAPE.line);
}

/** Whether a hatch's doors are shut, as near as is seen: it is then as every shut hatch is. */
const isShut = (hatch: HatchView): boolean => hatch.doors <= 0.01;

/**
 * Every hatch in the deck, shut, as it is with the pusher's lip at the back
 * wall: the steel of them all, and the seams of them all, and each hatch's
 * own part of the two. `places` is how many hatches it was made for, and
 * `deepest` how far behind the lip the furthest of them is.
 */
interface StillDeck {
  places: number;
  deepest: number;
  steel: Float32Array;
  seams: Float32Array;
  steelOf: Float32Array[];
  seamOf: Float32Array[];
}

let still: StillDeck | null = null;

/** The deck of shut hatches, made the first time it is wanted and kept: made again only if the list of places is not the one it was made for. */
function stillDeck(): StillDeck {
  if (still && still.places === HATCHES.length) return still;
  const places = HATCHES.length;
  const solid = new Solid(Math.max(1, places) * (HATCH_SIDES + DOOR_STRIPS * 2) * 6);
  const flat = new Flat(Math.max(1, places) * 6);
  for (const { x, behind } of HATCHES) {
    hatchSteel(solid, x, -behind, 0);
    hatchSeam(flat, x, -behind);
  }
  const steel = solid.data.slice(0, solid.count * SOLID_STRIDE);
  const seams = flat.data.slice(0, flat.count * FLAT_STRIDE);
  const part = (all: Float32Array, index: number): Float32Array => all.subarray((all.length / places) * index, (all.length / places) * (index + 1));
  still = {
    places,
    deepest: HATCHES.reduce((most, { behind }) => Math.max(most, behind), 0),
    steel,
    seams,
    steelOf: HATCHES.map((_, index) => part(steel, index)),
    seamOf: HATCHES.map((_, index) => part(seams, index)),
  };
  return still;
}

/**
 * Adds corners that were made once to a list of surfaces or of flat touches,
 * `stride` numbers to a corner, each moved `out` from the back wall. The
 * list is made longer first if it has no room, as it makes itself longer.
 */
function lay(list: { data: Float32Array; count: number }, stride: number, made: Float32Array, out: number): void {
  const first = list.count * stride;
  const end = first + made.length;
  if (end > list.data.length) {
    let length = Math.max(list.data.length, stride) * 2;
    while (length < end) length *= 2;
    const longer = new Float32Array(length);
    longer.set(list.data.subarray(0, first));
    list.data = longer;
  }
  const { data } = list;
  data.set(made, first);
  // How far from the back wall a corner is is the third of its numbers.
  for (let at = first + 2; at < end; at += stride) data[at] += out;
  list.count += made.length / stride;
}

/** The colour of an arc of the ring that is lit by `glow`: the collar's own steel while it is dark, the lamp's gold when it is fully lit. */
const ARC: [number, number, number] = [0, 0, 0];

/**
 * The ring of light in a hatch's collar, as much of it as is lit: each arc
 * a side of the collar, as bright as works.ts says, and the light it throws
 * on the deck round it and on whatever lies over it. The first arc begins at
 * the back of the deck and they run round toward the right.
 */
function buildRing(solid: Solid, flat: Flat, hatch: HatchView, time: number, calm: boolean): void {
  const { x, y: z } = hatch;
  const inner = DECK_HATCH.radius;
  const outer = DECK_HATCH.collar;
  const near = inner - DECK_HATCH.glow;
  const far = outer + DECK_HATCH.glow;
  let c0 = 0;
  let s0 = -1;
  for (let index = 0; index < DECK_HATCH.lamps; index++) {
    const angle = -Math.PI / 2 + ((index + 1) / DECK_HATCH.lamps) * TAU;
    const c1 = Math.cos(angle);
    const s1 = Math.sin(angle);
    const glow = lampGlow(hatch, index, time, calm);
    if (glow > 0) {
      for (let channel = 0; channel < 3; channel++) ARC[channel] = COLLAR_STEEL[channel] + (RING_LIT[channel] - COLLAR_STEEL[channel]) * glow;
      solid.finish(0, glow).paint(ARC);
      const y = DECK + OVER.lamp;
      solid.quad(x + c0 * outer, y, z + s0 * outer, x + c1 * outer, y, z + s1 * outer, x + c1 * inner, y, z + s1 * inner, x + c0 * inner, y, z + s0 * inner);
      for (const { up, shine } of THROWN) {
        const at = DECK + up;
        flat.ink(AMBER_GLOW, 0, shine * glow).quad(x + c0 * near, at, z + s0 * near, x + c1 * near, at, z + s1 * near, x + c1 * far, at, z + s1 * far, x + c0 * far, at, z + s0 * far, SHAPE.line);
      }
    }
    c0 = c1;
    s0 = s1;
  }
}

/**
 * The medals of the tower a lift still holds, counted down from its top:
 * each is the medal it will be in the finished tower, so the tower is the
 * same tower from the moment it is let go. Only the ones that stand out of
 * the deck are written, and the deck hides what of the lowest is under it.
 */
function towerRows(medals: Rows, view: LiftView): void {
  const { tower } = view;
  if (!tower || view.light <= 0.01) return;
  const { id } = tower;
  const top = DECK + Math.max(PROUD, view.top);
  for (let down = 0; down < view.size; down++) {
    const middle = top - T * (down + 0.5);
    if (middle + T / 2 <= DECK + 0.01) break;
    // Its place in the finished tower, from the bottom: the bottom medal is the tower's own, and every other a hair out of line with the one below.
    const rank = view.size - 1 - down;
    if (rank === 0) {
      medalRow(medals, id, view.x, middle, view.y, turnOf(id), 0, 0, 0, 0, view.light);
      continue;
    }
    const dx = (chance(id, rank * 2 + 5) - 0.5) * 0.2;
    const dz = (chance(id, rank * 2 + 6) - 0.5) * 0.2;
    medalRow(medals, id + rank * 31, view.x + dx, middle, view.y + dz, turnOf(id + rank * 7), 0, 0, 0, 0, view.light);
  }
}

/** A lift at work over its hatch: the clear sleeve, its collar and its lamp. The ring of light it stands in is its hatch's. */
function buildGuard(solid: Solid, flat: Flat, beads: Rows, view: LiftView): void {
  const { x, y: z } = view;
  if (view.rim <= 0.05) return;
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

/**
 * Every hatch in the deck: its collar, its two doors and their seam or the
 * mouth of the shaft where they have slid apart, and its ring of light if
 * any of it is lit. The shut ones are the ones that were made once, moved to
 * where the pusher has carried them; with no lift at work that is all of
 * them, and they are laid in one piece.
 */
function buildHatches(solid: Solid, flat: Flat, views: readonly LiftView[], time: number, front: number, calm: boolean): void {
  const deck = stillDeck();
  // A hatch rides with the lip unless that would take it into the back wall, which the pusher's stroke never does.
  const rides = front - deck.deepest >= MEDAL_RADIUS;
  if (views.length === 0 && rides) {
    lay(solid, SOLID_STRIDE, deck.steel, front);
    lay(flat, FLAT_STRIDE, deck.seams, front);
    return;
  }
  const hatches = hatchViews(views, front);
  for (let index = 0; index < hatches.length; index++) {
    const hatch = hatches[index];
    if (!isShut(hatch)) {
      hatchSteel(solid, hatch.x, hatch.y, hatch.doors);
    } else if (rides && index < deck.places) {
      // The hatches of the deck come first in the list, in the order of their places.
      lay(solid, SOLID_STRIDE, deck.steelOf[index], front);
      lay(flat, FLAT_STRIDE, deck.seamOf[index], front);
    } else {
      hatchSteel(solid, hatch.x, hatch.y, 0);
      hatchSeam(flat, hatch.x, hatch.y);
    }
    if (hatch.lamps > 0) buildRing(solid, flat, hatch, time, calm);
  }
}

/** The tower lifts: every hatch in the deck, and over the ones at work the tower as far up as it has come, and its guard. */
function buildLifts(solid: Solid, flat: Flat, beads: Rows, medals: Rows | undefined, machine: Machine, front: number, calm: boolean): void {
  const views = liftViews(machine, front, calm);
  buildHatches(solid, flat, views, machine.time, front, calm);
  for (const view of views) {
    if (medals) towerRows(medals, view);
    buildGuard(solid, flat, beads, view);
  }
}

/**
 * Everything of the payout works that is drawn this frame. `solid` is the
 * list the cabinet's own moving surfaces are already in: the works' are
 * added after them. `front` is where the pusher's lip is. `medals` is the
 * list the frame's medals are already in (scene3d.ts leaves out the towers a
 * lift still holds): theirs are added to it.
 */
export function buildWorks(solid: Solid, flat: Flat, beads: Rows, machine: Machine, front: number, calm: boolean, medals?: Rows): void {
  const [part] = WORKS_PARTS;
  part.first = solid.count;
  solid.map();
  buildDoors(solid, flat, beads, machine, calm);
  buildLifts(solid, flat, beads, medals, machine, front, calm);
  part.count = solid.count - part.first;
}
