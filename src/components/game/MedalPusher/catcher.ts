/**
 * The catcher: the one piece of furniture that holds the three START slots,
 * as a thing in the cabinet. It is hung on the front of the pusher, just
 * under its lip, and rides out and back with it. Its top is a slide: one
 * sloped board that starts under the lip's edge and leans down toward the
 * player to a foot that stops short of the lower table, so the medals that
 * lie there pass under it. In the slide are the three slots, side by side:
 * each an opening with square corners, a medal wide and a hair more, with a
 * frame round it and a dark throat under it, a lamp at its lower end and a
 * wing along either side of its frame. Under each slot, on the last of the
 * slide down to its foot, is the word START.
 *
 * The engine knows nothing of it. Its rule is the lip's: a medal that goes
 * over the lip with its middle inside a slot starts a spin (`CHECKERS` in
 * engine.ts), and everything that goes over the lip lands on the lower table
 * at the foot of the pusher's face. The catcher is what the player is shown
 * of that rule. A medal that counted is seen to come off the lip on to the
 * slide, lying flat with its face up, slide down to its slot and go into it
 * nose first, down the throat. One that came over a little to one side of
 * fitting catches the slot's frame: it rattles there for a moment, and then
 * slides on down beside the slot and off the foot. One that came over between
 * the slots slides the length of the slide and off its foot. Whichever, it
 * then lies on the lower table under the catcher, out of sight, and comes out
 * from under its foot as the pusher draws back.
 *
 * Two things about the slots change. One of them is lit gold at a time, the
 * lucky lamp, which steps along with each stroke of the pusher (`luckySlot`
 * in engine.ts). And during chance time their wings are open: every slot is
 * lit, and each takes medals at a wider width (`CHECKERS.wingWidth`), which
 * the wider opening and the wings, swung out to funnel medals to it, show.
 *
 * Everything here is in the cabinet's own measures — across the field, up
 * from the lower table, and out from the back wall — and decides nothing.
 */

import type { Spot } from './arms';
import { droppedThrough, grazed } from './chuckers';
import { CHECKERS, MEDAL_RADIUS, MEDAL_THICKNESS, luckySlot, pusherFront, type Medal } from './engine';
import { HEIGHT, project } from './view';

/** How far it is from one pocket to the next. */
const PITCH = CHECKERS.positions[1] - CHECKERS.positions[0];
const P = HEIGHT.pusher;
const T = MEDAL_THICKNESS;
const R = MEDAL_RADIUS;

export const CATCHER = {
  /** Where it begins and ends across the field: half the way to another pocket beyond the outer two. */
  from: CHECKERS.positions[0] - PITCH / 2,
  to: CHECKERS.positions[CHECKERS.positions.length - 1] + PITCH / 2,
  /** How much of its length belongs to each pocket. */
  tile: PITCH,
  /** How high its slide is where it begins, at the lip: just under the edge of the pusher's top. */
  deck: P - 0.3,
  /** How far down the slide from the lip a slot's opening begins. Above it the slide is closed, but for the upper bar of the slot's frame. */
  back: 0.85,
  /** What stands up round a slot, and how far: its frame. */
  rim: { wide: 0.5, high: 0.3 },
  /** The foot of the slide: how far out from the lip, and how high above the lower table, which is higher than the medals that lie there. */
  foot: { out: 9.3, height: 2.3 },
  /** How high the floor of a throat is: nearly as deep as the catcher goes. */
  throat: 2.6,
  /** Seconds a medal that drops through a slot is shown sliding to it and going down it. */
  sink: 0.45,
  /** Seconds a medal that fits no slot is shown sliding the length of the slide and going off its foot. A prize ball takes as long to roll down it. */
  slide: 0.5,
  /** Seconds a medal that catches a slot's frame is shown sliding to it, rattling on it, sliding on down and going off the foot; and how far to the side of fitting its middle may have come over and still catch it. */
  rattle: 0.65,
  reach: 2.2,
  /**
   * How high the catcher is taken to be for a prize ball that lies under it.
   * A ball is taller than the catcher. One that has come over the lip there
   * is shown under it all the same, as a medal is, rather than standing up
   * through its slide.
   */
  hood: 9.4,
} as const;

const DROP = CATCHER.deck - CATCHER.foot.height;

/**
 * The slide itself: how far it leans from level, in radians, down toward the
 * player, and how long it is from the lip to its foot. It is as steep as
 * leaves room on it, in the height there is between the lip and the medals
 * on the lower table, for a slot a medal goes into and the word under it.
 */
export const SLOPE = { angle: Math.atan2(DROP, CATCHER.foot.out), long: Math.hypot(DROP, CATCHER.foot.out) } as const;

const SIN = Math.sin(SLOPE.angle);
const COS = Math.cos(SLOPE.angle);

/**
 * A START slot: how long its opening is, down the slide, which is less than
 * a medal is across, since a medal goes into it nose first; the lamp on the
 * lower bar of its frame, by how far below the opening its middle is and how
 * big it is; and its wings, which lie along the sides of its frame: how far
 * out the upper end of one swings when it is open, how thick one is, and how
 * high it stands off the slide.
 */
export const START_SLOT = {
  long: 4.5,
  lamp: { out: 0.35, radius: 0.4 },
  wing: { out: 1.2, thick: 0.35, high: 0.7 },
} as const;

/** Half the width of a slot's opening: a medal's radius and the rule's width, which is wider while the wings are open. */
export const slotHalf = (wings = false): number => MEDAL_RADIUS + (wings ? CHECKERS.wingWidth : CHECKERS.halfWidth);

/** Which slots are lit gold at `time`, from the left: the one the lucky lamp is on, or all of them while the wings are open. */
export const litSlots = (time: number, wings = false): boolean[] => CHECKERS.positions.map((_x, slot) => wings || slot === luckySlot(time));

/** How far down the slide from the lip the strip with the words begins: under the lower bars of the slots' frames. */
const WORDS_FROM = CATCHER.back + START_SLOT.long + CATCHER.rim.wide;

/** How long the strip of the slide with the words on is, from under the slots' frames down to the foot. */
export const APRON = SLOPE.long - WORDS_FROM;

/**
 * A point of the slide at `time`: `x` across the field and `down` the slide
 * from the lip, both in field units, and `lift` clear of it, square to it.
 * The slide is `SLOPE.long` down.
 */
export function slopeSpot(x: number, down: number, time: number, lift = 0): Spot {
  return { x, height: CATCHER.deck - down * SIN + lift * COS, depth: pusherFront(time) + down * COS + lift * SIN };
}

/** The middle of a slot's opening at `time`: across the field where the engine has its pocket, on the slide. */
export function mouthSpot(chucker: number, time: number): Spot {
  if (!Number.isInteger(chucker) || chucker < 0 || chucker >= CHECKERS.positions.length) throw new Error('there is no such chucker');
  return slopeSpot(CHECKERS.positions[chucker], CATCHER.back + START_SLOT.long / 2, time);
}

/** The middles of all the slots at `time`, from the left. */
export const mouthSpots = (time: number): Spot[] => CHECKERS.positions.map((_x, chucker) => mouthSpot(chucker, time));

/**
 * The corners of a slot at `time`: of its opening in the slide, or of
 * something round the opening or inside it — `grow` further out all round,
 * and `lift` clear of the slide. Its upper edge first, from the left, and
 * then its lower, from the right. The opening itself, at the top of its
 * frame, is `lift` the frame's height; the frame's outer edge is `grow` the
 * frame's width as well. With `wings` it is as wide as it is while they are
 * open.
 */
export function slotCorners(chucker: number, time: number, wings = false, grow = 0, lift = 0): Spot[] {
  const { x } = mouthSpot(chucker, time);
  const half = slotHalf(wings) + grow;
  const upper = CATCHER.back - grow;
  const lower = CATCHER.back + START_SLOT.long + grow;
  return [slopeSpot(x - half, upper, time, lift), slopeSpot(x + half, upper, time, lift), slopeSpot(x + half, lower, time, lift), slopeSpot(x - half, lower, time, lift)];
}

/**
 * The corners of one of a slot's wings at `time`, `lift` clear of the slide:
 * the left one (`side` −1) or the right (1). Its upper end first, the corner
 * against the frame and then the outer one, and then its lower end, the outer
 * corner and the one against the frame. Folded, it lies along the side of the
 * frame, as long as the frame. Open, which `wings` says, it is hinged at its
 * lower end and its upper end has swung out from the slot, so that the two of
 * them stand like the cheeks of a funnel that opens toward the lip.
 */
export function wingCorners(chucker: number, side: number, time: number, wings = false, lift = 0): Spot[] {
  const { x } = mouthSpot(chucker, time);
  const { out, thick } = START_SLOT.wing;
  const hinge = x + side * (slotHalf(wings) + CATCHER.rim.wide);
  const swung = wings ? side * out : 0;
  const upper = CATCHER.back - CATCHER.rim.wide;
  const lower = CATCHER.back + START_SLOT.long + CATCHER.rim.wide;
  return [
    slopeSpot(hinge + swung, upper, time, lift),
    slopeSpot(hinge + swung + side * thick, upper, time, lift),
    slopeSpot(hinge + side * thick, lower, time, lift),
    slopeSpot(hinge, lower, time, lift),
  ];
}

/** Where the lamp of a slot is at `time`: on the lower bar of its frame, in the middle, standing a little out of it. */
export function lampSpot(chucker: number, time: number): Spot {
  const { x } = mouthSpot(chucker, time);
  return slopeSpot(x, CATCHER.back + START_SLOT.long + START_SLOT.lamp.out, time, CATCHER.rim.high + START_SLOT.lamp.radius * 0.6);
}

/**
 * A point of the strip with the words at `time`: `across` from its left end,
 * and `down` the slide from where the strip begins, both in field units. The
 * strip is `CATCHER.to − CATCHER.from` across and `APRON` down, and ends at
 * the foot.
 */
export function apronSpot(across: number, down: number, time: number): Spot {
  return slopeSpot(CATCHER.from + across, WORDS_FROM + down, time);
}

/**
 * Whether something `radius` across lying on the lower table at (x, depth)
 * is under the catcher at `time`, wholly or in part.
 */
export function underCatcher(x: number, depth: number, radius: number, time: number): boolean {
  return x + radius > CATCHER.from && x - radius < CATCHER.to && depth - radius < pusherFront(time) + CATCHER.foot.out;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

/** Where a medal on its way out of sight at the catcher is shown, and how. */
export interface Caught extends Spot {
  /** How far it is tipped out of level, in radians. */
  tilt: number;
  /** Which way it is tipped: 0 is forward, toward the player, as the slide is, and a quarter turn is sideways, about the line out from the lip. */
  heading: number;
  /** How much light it still gets, from 1 in the open to nearly none at the bottom of a throat. */
  light: number;
  /** The slot it is going down, or −1 if it is not going down one. */
  chucker: number;
  /** The slot whose frame it has caught, or −1. */
  near: number;
  /**
   * Where on its way it is: on the `slide`, lying on it; nosing into its
   * `slot`, part of it under the slide; rattling on a slot's `frame`; or off
   * the `foot`, on its way down past the medals on the lower table.
   */
  leg: 'slide' | 'slot' | 'frame' | 'foot';
}

type Pose = Pick<Caught, 'x' | 'height' | 'depth' | 'tilt' | 'heading'>;

/**
 * A medal lying on the slide with its middle `down` it from the lip, `lift`
 * clear of it, and rocked to one side by `rock` about the line down the
 * slide. As it comes off the lip it is still level, at the height it lay at
 * on the pusher; by the time its middle is half its radius down the slide it
 * has tipped on to it.
 */
function lying(x: number, down: number, front: number, lift = 0, rock = 0): Pose {
  const share = ease(Math.min(1, down / (R / 2)));
  const lean = SLOPE.angle * share;
  const off = T / 2 + lift;
  const height = (P + T / 2) * (1 - share) + (CATCHER.deck - down * SIN + off * COS) * share;
  const depth = front + down * COS + off * SIN * share;
  if (rock === 0) return { x, height, depth, tilt: lean, heading: 0 };
  // Leaning with the slide and rocked across it, it is tipped by one angle about one level line: these are they.
  return { x, height, depth, tilt: Math.acos(Math.cos(lean) * Math.cos(rock)), heading: Math.atan2(Math.sin(rock), Math.sin(lean) * Math.cos(rock)) };
}

/** How far down the slide a thing that slides the length of it has got, `u` of the way through: it comes off the lip at a pace and gathers more. */
const slid = (u: number): number => SLOPE.long * (0.4 * u + 0.6 * u * u);

/**
 * A medal going off the foot of the slide, `v` of the way: over the edge
 * nose first, into the shadow the catcher throws, down among the medals on
 * the lower table and out of sight.
 */
function offFoot(x: number, front: number, v: number): Pose & Pick<Caught, 'light' | 'leg'> {
  const edge = lying(x, SLOPE.long, front);
  return {
    x,
    height: edge.height - (edge.height + R + T) * v * v,
    depth: edge.depth + 1.1 * v,
    tilt: SLOPE.angle + (1.35 - SLOPE.angle) * ease(Math.min(1, v / 0.6)),
    heading: 0,
    light: 1 - 0.5 * v,
    leg: 'foot',
  };
}

/** The longest the catcher has anything on its slide. */
const LONGEST = Math.max(CATCHER.sink, CATCHER.slide, CATCHER.rattle);

/**
 * Where across the field each thing the catcher has on its slide came over
 * the lip: where it was when the catcher was first asked about it, which is
 * in the step it came over or the frame after. The engine has it on the
 * lower table from that step on, where the pile shoves it about. The catcher
 * shows it coming down from where it came over, whatever becomes of it down
 * there, and does not change its mind half way about which slot it is for.
 */
const cameOver = new WeakMap<Medal, number>();

function crossing(medal: Medal): number {
  const known = cameOver.get(medal);
  if (known !== undefined) return known;
  cameOver.set(medal, medal.x);
  return medal.x;
}

/**
 * How a medal that has just come over the lip at the catcher is shown, or
 * null for one that is shown where the engine has it: a ball, a medal that is
 * not on its way down, one that has gone out of sight, and one that came over
 * the lip beside the catcher.
 *
 * A medal starts with its middle on the lip's edge, where it was the moment
 * before, and tips on to the slide, lying flat on it with its face up. One
 * that came through a slot slides to it, to the middle of it across, and goes
 * into it nose first: its nose dips under the slide, the rest follows it down
 * the throat, and it loses the light as it goes. One that came over within
 * `CATCHER.reach` of fitting slides to the slot's frame and catches it: it
 * lies on it, rocking from side to side less and less, sliding away from the
 * slot, and then slides on down beside the slot and off the foot. With `calm`
 * it does not rock: it slides straight down. One that came over between the
 * slots slides the length of the slide and off its foot. With `wings` the
 * slots are taking medals at their wider width. Which it is goes by where
 * the medal came over the lip, which is exact if it is asked in the step the
 * medal comes over, and as near as the pile has left the medal if it is first
 * asked later.
 */
export function caught(medal: Medal, time: number, calm = false, wings = false): Caught | null {
  if (medal.ball || medal.level !== 0 || medal.sinceDrop < 0 || medal.sinceDrop >= LONGEST) return null;
  const front = pusherFront(time);
  const x = crossing(medal);
  const asItCame = x === medal.x ? medal : { ...medal, x };
  const chucker = droppedThrough(asItCame, CATCHER.sink, wings);
  if (chucker >= 0) {
    const t = medal.sinceDrop / CATCHER.sink;
    const mouth = CHECKERS.positions[chucker];
    // It lies on the slide until its middle is a third of the way down the opening, and its nose all but at the lower edge of it.
    const slide = 0.42;
    const over = CATCHER.back + START_SLOT.long * 0.35;
    if (t < slide) {
      const u = t / slide;
      return { ...lying(x + (mouth - x) * ease(u), over * u, front), light: 1, chucker, near: -1, leg: 'slide' };
    }
    // Then it tips about the upper edge of the opening, by `dip`, and slides in along its own length: its middle goes on down the slide a little, and under it far enough to take its tail under too.
    const u = (t - slide) / (1 - slide);
    const dip = 0.85;
    const down = over + START_SLOT.long * 0.27 * u;
    const under = -T / 2 + (R * Math.sin(dip) + 0.2 + T / 2) * u * u;
    return {
      x: mouth,
      height: CATCHER.deck - down * SIN - under * COS,
      depth: front + down * COS - under * SIN,
      tilt: SLOPE.angle + dip * ease(Math.min(1, u / 0.6)),
      heading: 0,
      light: 1 - 0.85 * u * u,
      chucker,
      near: -1,
      leg: 'slot',
    };
  }
  // One that came through a slot is out of sight once it is down it: only one that came through none slides on.
  if (droppedThrough(asItCame, Infinity, wings) >= 0) return null;
  // Only a medal that is wholly behind the catcher comes down its slide: one that hangs past its end is seen beside it, and falls as the engine has it.
  if (x - MEDAL_RADIUS < CATCHER.from || x + MEDAL_RADIUS > CATCHER.to) return null;
  const near = calm ? -1 : grazed(asItCame, CATCHER.rattle, CATCHER.reach, wings);
  if (near >= 0) {
    const t = medal.sinceDrop / CATCHER.rattle;
    const away = Math.sign(x - CHECKERS.positions[near]);
    // To the frame, on it, on down the slide, and off the foot: when each begins, and where on the slide it rattles from and to.
    const [reached, freed, gone] = [0.14, 0.62, 0.88];
    const from = CATCHER.back + 0.6;
    const to = CATCHER.back + START_SLOT.long * 0.6;
    if (t < reached) return { ...lying(x, (from * t) / reached, front), light: 1, chucker: -1, near, leg: 'slide' };
    if (t < freed) {
      const u = (t - reached) / (freed - reached);
      // Three rocks, each smaller than the last, toward the slot and away from it, riding up on the frame and down off it.
      const rock = 0.42 * Math.sin(Math.PI * 2 * 3 * u) * (1 - u);
      return { ...lying(x + away * 0.9 * u, from + (to - from) * u, front, CATCHER.rim.high * Math.sin(Math.PI * u), rock), light: 1, chucker: -1, near, leg: 'frame' };
    }
    if (t < gone) {
      const u = (t - freed) / (gone - freed);
      return { ...lying(x + away * 0.9, to + (SLOPE.long - to) * (0.3 * u + 0.7 * u * u), front), light: 1, chucker: -1, near, leg: 'slide' };
    }
    return { ...offFoot(x + away * 0.9, front, (t - gone) / (1 - gone)), chucker: -1, near };
  }
  if (medal.sinceDrop >= CATCHER.slide) return null;
  const t = medal.sinceDrop / CATCHER.slide;
  const gone = 0.8;
  if (t < gone) return { ...lying(x, slid(t / gone), front), light: 1, chucker: -1, near: -1, leg: 'slide' };
  return { ...offFoot(x, front, (t - gone) / (1 - gone)), chucker: -1, near: -1 };
}

/**
 * Where the middle of a prize ball of this `radius` that has just come over
 * the lip at the catcher is shown, or null for one that is shown where the
 * engine has it: a medal, a ball that is not on its way down, one whose time
 * on the slide is up, and one that came over the lip beside the catcher or
 * hanging past an end of it. No slot takes a ball. It rolls the length of the
 * slide, off its foot, and down on to the lower table in front of it; after
 * that it is under the catcher, where the engine has it.
 */
export function rolling(medal: Medal, radius: number, time: number): Spot | null {
  if (!medal.ball || medal.level !== 0 || medal.sinceDrop < 0 || medal.sinceDrop >= CATCHER.slide) return null;
  const x = crossing(medal);
  if (x - radius < CATCHER.from || x + radius > CATCHER.to) return null;
  const front = pusherFront(time);
  const t = medal.sinceDrop / CATCHER.slide;
  const gone = 0.75;
  const foot = slopeSpot(x, SLOPE.long, time, radius);
  if (t >= gone) {
    const v = (t - gone) / (1 - gone);
    return { x, height: foot.height - (foot.height - radius) * v * v, depth: foot.depth + radius * 0.4 * v };
  }
  // It comes off the lip at the height it stood at on the pusher, and is on the slide by the time it has rolled half its radius down it.
  const down = slid(t / gone);
  const share = ease(Math.min(1, down / (radius / 2)));
  const on = slopeSpot(x, down, time, radius);
  return { x, height: (P + radius) * (1 - share) + on.height * share, depth: (front + down * COS) * (1 - share) + on.depth * share };
}

/**
 * Where a slot is on the drawing at `time`: the middle of its opening, at the
 * top of its frame, and how wide and how tall the opening is there, in pixels
 * of the drawing. An opening in a board that leans toward the player is seen
 * more nearly square on than one in a level board would be. With `wings` it
 * is as wide as it is while they are open.
 */
export function mouthOnDrawing(chucker: number, time: number, wings = false): { x: number; y: number; wide: number; tall: number } {
  const spot = mouthSpot(chucker, time);
  const middle = slopeSpot(spot.x, CATCHER.back + START_SLOT.long / 2, time, CATCHER.rim.high);
  const upper = slopeSpot(spot.x, CATCHER.back, time, CATCHER.rim.high);
  const lower = slopeSpot(spot.x, CATCHER.back + START_SLOT.long, time, CATCHER.rim.high);
  const at = project(middle.x, middle.height, middle.depth);
  return { x: at.x, y: at.y, wide: slotHalf(wings) * 2 * at.scale, tall: project(lower.x, lower.height, lower.depth).y - project(upper.x, upper.height, upper.depth).y };
}
