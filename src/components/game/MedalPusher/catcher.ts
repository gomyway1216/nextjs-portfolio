/**
 * The catcher: the one piece of furniture that holds the three START slots,
 * as a thing in the cabinet. It is hung on the front of the pusher, just
 * under its lip, and rides out and back with it.
 *
 * It is a box with most of its top open. Under the lip is a well, as wide as
 * the catcher and a little longer, out from the lip, than a medal is across;
 * and beyond the well is a slide, a sloped board that leans down toward the
 * player to a foot that stops short of the lower table, so the medals that
 * lie there pass under it. In the slide are the three slots, side by side:
 * each an opening with square corners, a medal wide and a hair more, with a
 * frame round it and a dark throat under it, a lamp at its lower end and a
 * wing along either side of its frame. Under each slot, on the last of the
 * slide down to its foot, is the word START.
 *
 * Over the well, from the lip to each slot, runs a tongue: a narrow bridge,
 * the only way across. A tongue is as wide as the play a medal has in its
 * slot, which is twice what the lip's rule allows a medal's middle to be off
 * the slot's (`CHECKERS.halfWidth`). So a medal stays on a tongue exactly
 * when its middle is over it, which is exactly when the rule counts it, and
 * exactly when the whole of it will fit the slot at the tongue's end. That is
 * all the mechanism there is, and it is why nothing that does not count ever
 * reaches a slot: there is nothing under it to carry it there.
 *
 * The engine knows nothing of any of this. Its rule is the lip's: a medal
 * that goes over the lip with its middle inside a slot starts a spin
 * (`CHECKERS` in engine.ts), and everything that goes over the lip lands on
 * the lower table at the foot of the pusher's face. The catcher is what the
 * player is shown of that rule. A medal that counted is seen to come off the
 * lip on to its tongue, lying flat with its face up, ride the length of it
 * out over the well, tip over its end into the slot and go down the throat,
 * out of the light. One that came over with its middle off a tongue but some
 * of it on one has too little under it: it rides out until its tail leaves
 * the lip, hangs there on the tongue's edge, the longer the nearer it was to
 * fitting, and tips off sideways into the well. One that came over clear of
 * the tongues goes over the lip's edge nose first and straight down.
 *
 * Whatever has gone down, a slot or the well, is under the catcher from
 * then on, on the lower table at the foot of the pusher's face, which is
 * where the engine has had it all along: out of sight until the pusher has
 * pushed it out from under the foot. A prize ball is too big for the well.
 * It rolls across it and down the slide, off the foot, and stands on the
 * lower table in front of it until the catcher's foot comes over it.
 *
 * Two things about the slots change. One of them is lit gold at a time, the
 * lucky lamp, which steps along with each stroke of the pusher (`luckySlot`
 * in engine.ts). And during chance time their wings are open: every slot is
 * lit, and each takes medals at a wider width (`CHECKERS.wingWidth`), which
 * its wider tongue and opening, and the wings swung out, show.
 *
 * Everything here is in the cabinet's own measures — across the field, up
 * from the lower table, and out from the back wall — and decides nothing.
 */

import type { Spot } from './arms';
import { droppedThrough, grazed } from './chuckers';
import { CHECKERS, MEDAL_RADIUS, MEDAL_THICKNESS, START_RIDE, luckySlot, pusherFront, slotWidthAt, type Medal } from './engine';
import { HEIGHT, project } from './view';

/** How far it is from one pocket to the next. */
const PITCH = CHECKERS.positions[1] - CHECKERS.positions[0];
const P = HEIGHT.pusher;
const T = MEDAL_THICKNESS;
const R = MEDAL_RADIUS;

/**
 * What the catcher is made of down its length, from the lip to its foot: the
 * well; the upper bar of the slots' frames; the slots' openings; the lower
 * bar; and the strip with the words. The well is a little longer than a
 * medal is across. A medal that has some of a tongue under it lies flat
 * until its tail has left the lip, and by then its nose is a whole medal out
 * from the lip: if the slide began nearer than that, the nose would be on
 * it, and the medal would be carried on down to the slots, counted or not.
 */
const RIM = { wide: 0.4, high: 0.3 } as const;
const WELL = R * 2 + 0.3;
const MOUTH = 4.45;
const WORDS = 3.95;
/**
 * All of it together is a little shorter than the pusher's stroke, and has to
 * be. A medal that goes down the well lies at the foot of the pusher's face,
 * under the catcher, and the next stroke pushes it a stroke's length out from
 * where the face stands when it is back. If the catcher's foot reached
 * further than that, the medal would still be under it when the pusher had
 * gone back, and would stay out of sight until the pile had shoved it
 * further: a quarter of a minute, on a quiet table. Reaching less, the
 * catcher draws back off it at the end of the stroke after the one it fell
 * in, and it is seen again where it lies. The well cannot give, nor the
 * words much, so it is the openings and their frames that are a little
 * shorter than they might be.
 */
const LONG = WELL + RIM.wide + MOUTH + RIM.wide + WORDS;
/** How high the tongues leave the lip, just under the edge of the pusher's top, and how high the foot is: higher than the medals that lie on the lower table, and than a jewel (jewel.ts). */
const DECK = P - 0.3;
const FOOT = 2.4;
/** How far the catcher leans from level, in radians: what its length makes of the height there is between the lip and its foot. */
const LEAN = Math.asin((DECK - FOOT) / LONG);

export const CATCHER = {
  /** Where it begins and ends across the field: half the way to another pocket beyond the outer two. */
  from: CHECKERS.positions[0] - PITCH / 2,
  to: CHECKERS.positions[CHECKERS.positions.length - 1] + PITCH / 2,
  /** How much of its length belongs to each pocket. */
  tile: PITCH,
  /** How high its tongues are where they begin, at the lip: just under the edge of the pusher's top. The slide lies in the same plane, further down. */
  deck: DECK,
  /** How far down from the lip the slide begins: between the lip and it is the well, open from end to end but for the tongues. */
  gap: WELL,
  /** How far down from the lip a slot's opening begins: past the well and the upper bar of the slot's frame. A tongue ends there. */
  back: WELL + RIM.wide,
  /** What stands up round a slot, and how far: its frame. A tongue's top is level with the top of it. */
  rim: RIM,
  /** The foot of the slide: how far out from the lip, and how high above the lower table. */
  foot: { out: LONG * Math.cos(LEAN), height: FOOT },
  /** How high the floor of a throat is: as deep as the catcher goes. */
  throat: FOOT + 0.1,
  /**
   * Seconds a medal the lip's rule counted is shown from the lip to out of
   * sight down its slot: on its tongue for the first `ride` of that, and
   * going over the tongue's end and down the throat for the rest. This is
   * the machine's own number: when it is up the machine takes the medal, and
   * the cabinet says what it came to (`START_RIDE` in engine.ts).
   */
  sink: START_RIDE,
  ride: 0.7,
  /** Seconds such a medal is shown lying in the mouth of its slot, going dark, where nothing may move: it is not seen to ride there. */
  still: 0.3,
  /** Seconds a medal that fits no slot is shown going over the lip's edge and down into the well. */
  fall: 0.3,
  /**
   * A medal that came over with its middle off a tongue but within `reach`
   * of it has some of the tongue under it: a medal's radius. It rides out
   * for `out` seconds, hangs on the tongue's edge for between `least` and
   * `most` seconds, the longest for the one that was nearest to fitting, and
   * then falls into the well as any other does.
   */
  reach: R,
  teeter: { out: 0.2, least: 0.12, most: 0.6 },
  /** Seconds a prize ball takes to roll from the lip across the well, down the slide and off its foot to the lower table. */
  slide: 0.8,
  /**
   * A ball that has come down in front of the foot stands where it landed
   * until the catcher's foot has come over it, or the engine has it there.
   * It waits for that `wait` seconds at the most, and then takes `slip`
   * seconds to roll to wherever the engine has it: which only a ball that
   * came over as the pusher was on its way forward has to do.
   */
  lie: { wait: 1.4, slip: 0.4 },
  /**
   * How high the catcher is taken to be for a prize ball that lies under it.
   * A ball is taller than the catcher. One that has come over the lip there
   * is shown under it all the same, as a medal is, rather than standing up
   * through its slide.
   */
  hood: 9.4,
} as const;

/**
 * The plane the catcher's top lies in: how far it leans from level, in
 * radians, down toward the player, and how long it is from the lip to the
 * foot. The first `CATCHER.gap` of that is the well, and the rest the slide.
 */
export const SLOPE = { angle: LEAN, long: LONG } as const;

const SIN = Math.sin(SLOPE.angle);
const COS = Math.cos(SLOPE.angle);

/**
 * A START slot: how long its opening is, down the slide, which is less than
 * a medal is across, since a medal goes into it nose first, over the end of
 * its tongue; the lamp on the lower bar of its frame, by how far below the
 * opening its middle is and how big it is; and its wings, which lie along
 * the sides of its frame: how far out the upper end of one swings when it is
 * open, how thick one is, and how high it stands off the slide.
 */
export const START_SLOT = {
  long: MOUTH,
  lamp: { out: 0.35, radius: 0.8 },
  wing: { out: 1.2, thick: 0.35, high: 0.7 },
} as const;

/**
 * A tongue: how deep the web under its top is, which is what is seen of its
 * side; and how far a medal that goes over the end of one has tipped, in
 * radians, by the time it is gone.
 */
export const TONGUE = { deep: 0.55, dip: 1 } as const;

/** Half the width of a slot's opening: a medal's radius and the rule's width, which is wider while the wings are open. */
export const slotHalf = (wings = false): number => MEDAL_RADIUS + (wings ? CHECKERS.wingWidth : CHECKERS.halfWidth);

/** Half the width of a tongue: the rule's width, so that a medal's middle is over it exactly when the rule counts the medal. It is wider while the wings are open. */
export const tongueHalf = (wings = false): number => (wings ? CHECKERS.wingWidth : CHECKERS.halfWidth);

/**
 * The slot the lucky lamp is shown on at `time`, from the left.
 *
 * The lamp itself steps as the pusher comes to the back of its stroke, by
 * the machine's clock, and a medal's slot was lit or was not as the medal
 * came over the lip (`luckySlot` in engine.ts; the session keeps that with
 * the medal). But the medal drops into its slot a ride later, and medals come
 * over the lip late in the pusher's way back: for most of them the lamp
 * steps while they are on their tongues. Shown where the lamp stands, a slot
 * would be dark as a medal that came over it lit dropped in, and gold as one
 * that did not: six entries in ten, on a quiet table. So the light is shown
 * where the lamp stood a ride ago. It is then on a medal's slot as the medal
 * drops exactly when it was as the medal came over, for every medal, and it
 * is seen to step a ride after the pusher turns. Where nothing is shown
 * moving (`still`) a medal is taken as it comes over, and the light is where
 * the lamp is.
 */
export const lampShown = (time: number, still = false): number => luckySlot(Math.max(0, time - (still ? 0 : START_RIDE)));

/** Which slots are lit gold at `time`, from the left: the one the lucky lamp is shown on (`lampShown`), or all of them while the wings are open. */
export const litSlots = (time: number, wings = false, still = false): boolean[] => CHECKERS.positions.map((_x, slot) => wings || slot === lampShown(time, still));

/** How far down the slide from the lip the strip with the words begins: under the lower bars of the slots' frames. */
const WORDS_FROM = CATCHER.back + START_SLOT.long + CATCHER.rim.wide;

/** How long the strip of the slide with the words on is, from under the slots' frames down to the foot. */
export const APRON = SLOPE.long - WORDS_FROM;

/**
 * A point of the catcher's top at `time`: `x` across the field and `down`
 * from the lip, both in field units, and `lift` clear of it, square to it.
 * The foot is `SLOPE.long` down.
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
 * The corners of a slot's tongue at `time`, `lift` clear of the catcher's
 * top: its end at the lip first, from the left, and then its end at the
 * slot, from the right. Its own top is the height of the slot's frame clear,
 * which is what `lift` is unless something else is asked for; its foot is
 * `TONGUE.deep` under that. With `wings` it is as wide as it is while they
 * are open.
 */
export function tongueCorners(chucker: number, time: number, wings = false, lift: number = CATCHER.rim.high): Spot[] {
  const { x } = mouthSpot(chucker, time);
  const half = tongueHalf(wings);
  return [slopeSpot(x - half, 0, time, lift), slopeSpot(x + half, 0, time, lift), slopeSpot(x + half, CATCHER.back, time, lift), slopeSpot(x - half, CATCHER.back, time, lift)];
}

/**
 * The corners of the well's mouth at `time`: its edge along the lip first,
 * from the left, and then the upper edge of the slide, from the right.
 */
export function wellCorners(time: number): Spot[] {
  const { from, to, gap } = CATCHER;
  return [slopeSpot(from, 0, time), slopeSpot(to, 0, time), slopeSpot(to, gap, time), slopeSpot(from, gap, time)];
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
  /** Which way it is tipped: 0 is forward, toward the player, as the catcher leans, and a quarter turn is sideways, about the line out from the lip. */
  heading: number;
  /** How much light it still gets, from 1 in the open to nearly none at the bottom of a throat or of the well. */
  light: number;
  /** The slot it is on its way to, or −1 if it is on its way to none. */
  chucker: number;
  /** The slot whose tongue it has some of under it without fitting, or −1. */
  near: number;
  /**
   * Where on its way it is: on a `tongue`, lying on it or hanging on its
   * edge; going over the tongue's end into its `slot`, part of it under the
   * slide; or going down into the `gap`, the well under the lip, off the
   * lip's edge or off the side of a tongue.
   */
  leg: 'tongue' | 'slot' | 'gap';
}

type Pose = Pick<Caught, 'x' | 'height' | 'depth' | 'tilt' | 'heading'>;

/** Where a prize ball the catcher has is shown, and on which leg of its way it is: rolling down the `slide`, off the `foot` in the air, or standing on the lower `table`. */
export interface Rolled extends Spot {
  leg: 'slide' | 'foot' | 'table';
}

/**
 * A medal lying on the catcher's top with its middle `down` it from the lip,
 * `lift` clear of it, and rocked to one side by `rock` about the line down
 * the slope: to the left for a rock that is more than nothing. As it comes
 * off the lip it is still level, at the height it lay at on the pusher; by
 * the time its middle is half its radius out it has tipped on to the slope.
 */
function lying(x: number, down: number, front: number, lift = 0, rock = 0): Pose {
  const share = ease(Math.min(1, down / (R / 2)));
  const lean = SLOPE.angle * share;
  const off = T / 2 + lift;
  const height = (P + T / 2) * (1 - share) + (CATCHER.deck - down * SIN + off * COS) * share;
  const depth = front + down * COS + off * SIN * share;
  if (rock === 0) return { x, height, depth, tilt: lean, heading: 0 };
  // Leaning with the slope and rocked across it, it is tipped by one angle about one level line: these are they.
  return { x, height, depth, tilt: Math.acos(Math.cos(lean) * Math.cos(rock)), heading: Math.atan2(Math.sin(rock), Math.sin(lean) * Math.cos(rock)) };
}

/** How far down the slide a ball that rolls the length of it has got, `u` of the way through: it comes off the lip at a pace and gathers more. */
const slid = (u: number): number => SLOPE.long * (0.4 * u + 0.6 * u * u);

/** How long a ball stands in front of the foot at the most before it is the engine's. */
const LIE = CATCHER.lie.wait + CATCHER.lie.slip;

/** Where something that has gone off the foot of the slide comes down, across the field and out from the back wall. It does not move with the pusher: the thing has left it. */
interface Landing {
  x: number;
  depth: number;
}

/**
 * Where a thing that came over the lip at `came` and reaches the lower table
 * `takes` seconds later comes down: straight out from where it left the
 * slide, `out` past where the foot's edge is at that moment.
 */
function landingOf(x: number, came: number, takes: number, out: number): Landing {
  return { x, depth: pusherFront(came + takes) + CATCHER.foot.out + out };
}

/**
 * Where a thing that came down at `landing` is shown `since` seconds later,
 * and how much of the way from there to where the engine has it is still to
 * go, from 1 to 0; or null once it is where the engine has it.
 *
 * The engine has it nearer the pusher than it landed, at the foot of the
 * pusher's face, and it stays where it landed until the engine has it there
 * too: the pile has pushed it that far. Then the two are one and nothing is
 * seen to change. If that has not happened in the time the catcher waits,
 * and the catcher has not let go of it meanwhile (`lyingOut`), it slips the
 * rest of the way. Sideways it is the engine's by the time the engine has
 * it within a medal's radius.
 */
function settling(medal: Medal, landing: Landing, since: number): { x: number; depth: number; left: number } | null {
  const short = landing.depth - medal.y;
  if (short <= 0 || since >= LIE) return null;
  const held = 1 - ease(Math.min(1, Math.max(0, (since - CATCHER.lie.wait) / CATCHER.lie.slip)));
  const left = held * Math.min(1, short / R);
  // Where it landed, to the number, for as long as none of the way has been gone.
  return { x: left < 1 ? medal.x + (landing.x - medal.x) * left : landing.x, depth: held < 1 ? medal.y + short * held : landing.depth, left };
}

/** Where a thing that is about to come down at `landing` touches down: there, or where the engine has it if that is further out already. */
function touchdown(medal: Medal, landing: Landing): { x: number; depth: number; left: number } {
  return settling(medal, landing, 0) ?? { x: medal.x, depth: medal.y, left: 0 };
}

/**
 * Where a ball of this `radius` that came down at `landing` `since` seconds
 * ago stands at `time`, or null if it is the engine's: now, or since some
 * earlier time, which `kept` remembers.
 *
 * The catcher reaches further out from the lip than the pusher's stroke is
 * long, so the face does not come up to a ball that stands in front of the
 * foot: the foot comes over it first. A ball under the catcher is out of
 * sight, where it stands and where the engine has it alike, and so that is
 * where the catcher lets go of it: once the foot has come over the whole of
 * it, it is the engine's. When the pusher goes back it is seen where the
 * engine has it, and nothing was seen to move.
 */
function lyingOut(medal: Medal, kept: CameOver, landing: Landing, since: number, time: number, radius: number): { x: number; depth: number; left: number } | null {
  const covered = landing.depth + radius < pusherFront(time) + CATCHER.foot.out;
  const at = kept.released || covered ? null : settling(medal, landing, since);
  if (!at) kept.released = true;
  return at;
}

/** The longest the catcher has a medal: one that all but fitted, out on its tongue, hanging on its edge and down into the well. */
const LONGEST = Math.max(CATCHER.sink, CATCHER.still, CATCHER.teeter.out + CATCHER.teeter.most + CATCHER.fall);

/** What is settled about a thing as it comes over the lip: where across the field it came over, and whether the slots' wings were open. And, later, for a ball, whether the catcher has let go of it. */
interface CameOver {
  x: number;
  wings: boolean;
  /** Set once a ball that came down in front of the foot is where the engine has it: it is the engine's from then on. */
  released?: boolean;
}

/**
 * What the catcher has settled about each thing that comes over the lip at
 * it, the first time it is asked about it, which is in the step the thing
 * came over or the frame after: where across the field it came over, and
 * whether the wings of the slots were open then. The two of them say which
 * tongue carried it, or whose edge it hung on, or neither.
 *
 * Neither is asked again. The engine has the thing on the lower table from
 * that step on, where the pile shoves it about; and chance time can begin or
 * end while it is still on its way, which opens the wings or shuts them. The
 * catcher shows it coming down from where it came over, along the tongue
 * that carried it or off the one that did not, and does not change its mind
 * half way: a medal that began by hanging on a tongue's edge is not seen to
 * ride on to the slot because the wings have opened since.
 *
 * For the wings it takes the engine's word, where the engine saw the thing
 * come over: the width the lip's rule had in that piece of its step, which
 * is the width that counted (`slotWidthAt` in engine.ts). A medal the engine
 * did not see come over, one read back from a save in the middle of its way
 * down, is taken as the slots stand when the catcher is first asked.
 *
 * One more thing is kept, for a ball that has come down off the foot and
 * stands in front of it: that the catcher has let go of it, which it does
 * the first time its foot has come over the whole of the ball, or the engine
 * has the ball where it stands. The catcher does not take it up again.
 */
const cameOver = new WeakMap<Medal, CameOver>();

function crossing(medal: Medal, wings: boolean): CameOver {
  const known = cameOver.get(medal);
  if (known) return known;
  const width = slotWidthAt(medal);
  const settled = { x: medal.x, wings: width === undefined ? wings : width > CHECKERS.halfWidth };
  cameOver.set(medal, settled);
  return settled;
}

/** How far over a medal that goes into the well has turned by the time it is out of sight, in radians: off the lip's edge nose first, or off a tongue's edge sideways. */
const OVER = { nose: 1.35, side: 1.5 } as const;
/** How far a medal slides off the lip's edge along its own length on its way down into the well, and how far it drops off the side of a tongue: far enough, either way, to be wholly under the catcher. */
const DOWN = { nose: 7.2, side: DECK + R - FOOT };
/** How far a medal that hangs on a tongue's edge has rocked over when it lets go of it, in radians, and how far a near miss rocks back and forth before it goes, as a share of that. */
const ROCK = { over: 1.2, shake: 0.16 } as const;

/**
 * A medal going over the lip's edge into the well, `v` of the way down: it
 * tips about the edge, nose down, and slides off it along its own length,
 * faster and faster, out of the light.
 */
function overLip(x: number, front: number, v: number): Pose & Pick<Caught, 'light'> {
  const turned = OVER.nose * ease(Math.min(1, v / 0.6));
  const gone = DOWN.nose * v * v;
  return { x, height: P + T / 2 - gone * Math.sin(turned), depth: front + gone * Math.cos(turned), tilt: turned, heading: 0, light: 1 - 0.95 * v * v };
}

/**
 * How a medal that has come over the lip at the catcher is shown, or null
 * for one that is shown where the engine has it: a ball, a medal that is not
 * on its way down, one that has gone down a slot or the well and is out of
 * sight, and one that came over the lip beside the catcher.
 *
 * A medal starts with its middle on the lip's edge, where it was the moment
 * before. One the lip's rule counted has its middle over a tongue. It tips
 * on to the tongue, lying flat on it with its face up, and rides the length
 * of it at the place across where it came over, gathering pace; at the
 * tongue's end it tips over into the slot, nose first, and slides down the
 * throat, losing the light. `CATCHER.sink` after it came over the lip it is
 * gone. With `calm` it is not seen to ride: it is shown lying in the mouth
 * of its slot, still, going dark, for `CATCHER.still`.
 *
 * One that came over with its middle within `CATCHER.reach` of a tongue's
 * edge has some of the tongue under it, and the lip under its tail. It rides
 * out, slowing, until its tail has left the lip, and then there is too
 * little under it: it hangs on the tongue's edge, rocking, the longer the
 * nearer its middle was to the tongue, tips over the edge away from the
 * slot, and falls into the well on its side. Its nose never gets as far as
 * the slide. With `calm` it does not hang there: it goes over the lip's
 * edge as one that came over clear of the tongues does, which is nose first
 * and straight down.
 *
 * Which it is was decided as the medal came over the lip, and stays decided
 * for as long as it is on its way (see `cameOver`): by where it came over,
 * and by how wide the slots were taking medals then. `wings` says whether
 * their wings are open now, and is only gone by for a medal the engine did
 * not see come over, the first time it is asked about. Where it came over
 * is exact if it is asked in the step the medal comes over, and as near as
 * the pile has left the medal if it is first asked later.
 *
 * A jewel fits no slot, and goes into the well as a medal clear of the
 * tongues does, wherever it came over.
 */
export function caught(medal: Medal, time: number, calm = false, wings = false): Caught | null {
  if (medal.ball || medal.level !== 0 || medal.sinceDrop < 0 || medal.sinceDrop >= LONGEST) return null;
  const front = pusherFront(time);
  const { x, wings: open } = crossing(medal, wings);
  const asItCame = x === medal.x ? medal : { ...medal, x };
  const chucker = droppedThrough(asItCame, Infinity, open);
  if (chucker >= 0) {
    // Where its middle is as it starts to go over the tongue's end: a little past the upper edge of the opening.
    const end = CATCHER.back + 0.4;
    if (calm) {
      if (medal.sinceDrop >= CATCHER.still) return null;
      const dark = medal.sinceDrop / CATCHER.still;
      return { ...lying(x, end, front, CATCHER.rim.high), light: 1 - 0.9 * dark, chucker, near: -1, leg: 'tongue' };
    }
    // It is gone in the step the machine takes it, which is the step its ride is up to within a billionth of a second (session.ts).
    if (medal.sinceDrop >= CATCHER.sink - 1e-9) return null;
    const t = medal.sinceDrop / CATCHER.sink;
    if (t < CATCHER.ride) {
      const u = t / CATCHER.ride;
      return { ...lying(x, end * u * (1.2 - 0.2 * u), front, CATCHER.rim.high), light: 1, chucker, near: -1, leg: 'tongue' };
    }
    // Then it tips about the end of the tongue, by `TONGUE.dip`, and slides in along its own length: its middle goes on down the slide a little, and under it far enough to take its tail under too.
    const u = (t - CATCHER.ride) / (1 - CATCHER.ride);
    const down = end + START_SLOT.long * 0.3 * u;
    const clear = T / 2 + CATCHER.rim.high;
    const under = -clear + (R * Math.sin(TONGUE.dip) + 0.3 + clear) * u * u;
    return {
      x,
      height: CATCHER.deck - down * SIN - under * COS,
      depth: front + down * COS - under * SIN,
      tilt: SLOPE.angle + TONGUE.dip * ease(Math.min(1, u / 0.6)),
      heading: 0,
      light: 1 - 0.9 * u * u,
      chucker,
      near: -1,
      leg: 'slot',
    };
  }
  // Only a medal that is wholly behind the catcher goes down into it: one that hangs past its end is seen beside it, and falls as the engine has it.
  if (x - MEDAL_RADIUS < CATCHER.from || x + MEDAL_RADIUS > CATCHER.to) return null;
  // Whether it had some of a tongue under it was settled as it came over, like the rest.
  const near = calm ? -1 : grazed(asItCame, Infinity, CATCHER.reach, open);
  if (near < 0) {
    if (medal.sinceDrop >= CATCHER.fall) return null;
    return { ...overLip(x, front, medal.sinceDrop / CATCHER.fall), chucker: -1, near: -1, leg: 'gap' };
  }
  // The edge of the tongue it has under it, which side of that its middle is, and how far off: no way at all for the nearest of misses.
  const half = tongueHalf(open);
  const away = Math.sign(x - CHECKERS.positions[near]);
  const edge = CHECKERS.positions[near] + away * half;
  const off = Math.abs(x - edge);
  const nearly = 1 - off / CATCHER.reach;
  const { out, least, most } = CATCHER.teeter;
  // It lies flat for as long as its tail is on the lip, and hangs where the tail has just left it: its nose is not yet over the slide.
  const hangs = R + 0.1;
  const hung = least + (most - least) * nearly * nearly;
  const since = medal.sinceDrop;
  if (since < out) {
    const u = since / out;
    return { ...lying(x, hangs * u * (1.6 - 0.6 * u), front, CATCHER.rim.high), light: 1, chucker: -1, near, leg: 'tongue' };
  }
  /** Hanging on the tongue's edge, rocked `rock` over it: the side of it that has nothing under it sags, and its middle with it. */
  const hanging = (rock: number): Pose => lying(x, hangs, front, CATCHER.rim.high - off * Math.sin(rock), -away * rock);
  if (since < out + hung) {
    const u = (since - out) / hung;
    // It rocks a little, over the edge and back level, as it makes up its mind; and goes over slowly at first and then all at once.
    const rock = ROCK.over * (u * u * u + ROCK.shake * nearly * nearly * Math.sin(Math.PI * 7 * u) * (1 - u));
    return { ...hanging(Math.max(0, rock)), light: 1, chucker: -1, near, leg: 'tongue' };
  }
  const v = (since - out - hung) / CATCHER.fall;
  if (v >= 1) return null;
  // Off the edge it falls on its side, a little further from the tongue, straight down past the slide and out of the light.
  const pose = hanging(ROCK.over + (OVER.side - ROCK.over) * ease(v));
  return { ...pose, x: pose.x + away * 0.8 * ease(v), height: pose.height - DOWN.side * v * v, light: 1 - 0.95 * v * v, chucker: -1, near, leg: 'gap' };
}

/**
 * How near a medal that hangs on a tongue's edge was to fitting its slot:
 * from 0, for one that had no more than its rim on the tongue, to 1, for one
 * whose middle was on the tongue's very edge; and 0 for any that is not such
 * a medal. The nearer it was, the longer it hangs there and the more it is
 * seen to rock. `wings` says whether the slots' wings are open, which is how
 * wide the tongue is taken to be.
 */
export function nearness(held: Pick<Caught, 'x' | 'near'>, wings = false): number {
  if (held.near < 0) return 0;
  const off = Math.abs(held.x - CHECKERS.positions[held.near]) - tongueHalf(wings);
  return Math.min(1, Math.max(0, 1 - off / CATCHER.reach));
}

/**
 * How far out past the foot's edge the middle of a ball of this `radius`
 * stands when it stands on the lower table against the foot: it is taller
 * than the foot is high, so it does not go under.
 */
export function clearOfFoot(radius: number): number {
  const over = radius - CATCHER.foot.height;
  return over > 0 ? Math.sqrt(radius * radius - over * over) : radius;
}

/**
 * Where the middle of a prize ball of this `radius` that has come over the
 * lip at the catcher is shown, or null for one that is shown where the
 * engine has it: a medal, a ball that is not on its way down, one that has
 * come down off the foot and is where the engine has it by now, and one that
 * came over the lip beside the catcher or hanging past an end of it. A ball
 * is too big for the well, and no slot takes one. It rolls from the lip
 * across the well, the length of the slide and off its foot, and comes down
 * on the lower table in front of it, standing against the foot's edge
 * (`clearOfFoot`). There it stands until the catcher's foot has come over
 * the whole of it, or the engine has it there too, and is the engine's from
 * then on; or it rolls to where the engine has it if neither has happened
 * in the time the catcher waits. It ends exactly where the engine has it.
 */
export function rolling(medal: Medal, radius: number, time: number): Rolled | null {
  if (!medal.ball || medal.level !== 0 || medal.sinceDrop < 0 || medal.sinceDrop >= CATCHER.slide + LIE) return null;
  // No slot takes a ball, wings or no wings: only where it came over is kept, and whether the catcher has let go of it.
  const kept = crossing(medal, false);
  const { x } = kept;
  if (x - radius < CATCHER.from || x + radius > CATCHER.to) return null;
  const landing = landingOf(x, time - medal.sinceDrop, CATCHER.slide, clearOfFoot(radius));
  if (medal.sinceDrop >= CATCHER.slide) {
    const at = lyingOut(medal, kept, landing, medal.sinceDrop - CATCHER.slide, time, radius);
    return at && { x: at.x, height: radius, depth: at.depth, leg: 'table' };
  }
  const front = pusherFront(time);
  const t = medal.sinceDrop / CATCHER.slide;
  const gone = 0.75;
  const foot = slopeSpot(x, SLOPE.long, time, radius);
  if (t >= gone) {
    const v = (t - gone) / (1 - gone);
    const down = touchdown(medal, landing);
    return { x: x + (down.x - x) * ease(v), height: foot.height - (foot.height - radius) * v * v, depth: foot.depth + (down.depth - foot.depth) * v, leg: 'foot' };
  }
  // It comes off the lip at the height it stood at on the pusher, and is on the slope by the time it has rolled half its radius down it.
  const down = slid(t / gone);
  const share = ease(Math.min(1, down / (radius / 2)));
  const on = slopeSpot(x, down, time, radius);
  return { x, height: (P + radius) * (1 - share) + on.height * share, depth: (front + down * COS) * (1 - share) + on.depth * share, leg: 'slide' };
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
