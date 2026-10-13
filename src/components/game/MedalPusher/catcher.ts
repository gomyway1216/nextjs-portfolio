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
 * the slots slides the length of the slide and off its foot.
 *
 * One that has gone down a slot is under the catcher from then on, where the
 * engine has it, out of sight. One that goes off the foot comes down flat on
 * the lower table in front of it, in full view, a slide's length further out
 * than the engine has it: the engine's is at the foot of the pusher's face.
 * It lies where it landed, on the table or on a medal that lies there
 * already. The pusher comes forward, the catcher's foot passes over it, as
 * it passes over every medal that lies there, and the pusher's face comes up
 * to it; and that is where the engine has had it all along, pushed before
 * the face. From then on it is the engine's. If the pusher is not on its way
 * to it, it slips to where the engine has it instead, after a moment. A
 * prize ball does the same, and stands in front of the foot meanwhile.
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
import { CHECKERS, MEDAL_RADIUS, MEDAL_THICKNESS, luckySlot, pusherFront, slotWidthAt, type Medal } from './engine';
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
  /** The foot of the slide: how far out from the lip, and how high above the lower table, which is higher than the medals that lie there, and than a jewel (jewel.ts). */
  foot: { out: 9.3, height: 2.4 },
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
   * How far out past the foot's edge the middle of a medal that has gone off
   * it comes down on the lower table: its own radius, so that the whole of it
   * lies in front of the catcher, its tail at the foot's edge.
   */
  lands: R,
  /**
   * What has come down in front of the foot lies where it landed until the
   * engine has it there, which is when the pusher's face has come up to it.
   * It waits for that `wait` seconds at the most, and then takes `slip`
   * seconds to slip to wherever the engine has it. A medal that comes over
   * in the last fifth of the pusher's way back, as nine in ten do, is met by
   * the face within the wait.
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
  lamp: { out: 0.35, radius: 0.8 },
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
   * `slot`, part of it under the slide; rattling on a slot's `frame`; off
   * the `foot`, in the air between the slide and the lower table; or on the
   * `table`, lying flat where it came down or on its way from there to where
   * the engine has it.
   */
  leg: 'slide' | 'slot' | 'frame' | 'foot' | 'table';
  /** How far it has come down from the foot of the slide to the lower table: 0 until it leaves the foot, and 1 once it lies on the table. */
  landed: number;
}

type Pose = Pick<Caught, 'x' | 'height' | 'depth' | 'tilt' | 'heading'>;

/** Where a prize ball the catcher has is shown, and on which leg of its way it is: rolling down the `slide`, off the `foot` in the air, or standing on the lower `table`. */
export interface Rolled extends Spot {
  leg: 'slide' | 'foot' | 'table';
}

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

/** How high the middle of a medal is where the engine has it on the lower table: on the table itself, or on the medals there. */
const lies = (medal: Medal): number => (medal.tier === 1 ? T * 1.5 : T / 2);

/**
 * How high what lies on the lower table reaches under a medal whose middle
 * is at (x, depth), which is not where the engine has that medal: nothing
 * for the bare table, a medal's thickness for a medal lying there, two for
 * one on another. The pusher sweeps the table in front of its face clear on
 * every stroke, so what comes off the foot mostly comes down on bare steel;
 * but a medal that came over a moment earlier may lie there, or be pushed
 * in under this one, and this one rides up on to it as the two come to
 * overlap: wholly on it by the time they overlap by half. It never stands
 * higher than passes under the catcher's foot.
 */
function pileUnder(pile: readonly Medal[], self: Medal, x: number, depth: number): number {
  let top = 0;
  for (const other of pile) {
    if (other === self || other.level !== 0 || other.ball || other.jewel) continue;
    const apart = Math.hypot(other.x - x, other.y - depth);
    if (apart >= R * 2) continue;
    top = Math.max(top, (other.tier === 1 ? T * 2 : T) * ease(Math.min(1, (R * 2 - apart) / R)));
  }
  return Math.min(top, CATCHER.foot.height - T);
}

/** How long a thing lies in front of the foot at the most before it is the engine's. */
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
 * too: the face has come up to it, or the pile has pushed it that far. Then
 * the two are one and nothing is seen to change. If that has not happened
 * in the time the catcher waits, it slips the rest of the way. Sideways it
 * is the engine's by the time the engine has it within a medal's radius.
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
 * Where a thing that came down at `landing` `since` seconds ago lies, or
 * null if it is the engine's: now, or since some earlier time, which `kept`
 * remembers.
 */
function lyingOut(medal: Medal, kept: CameOver, landing: Landing, since: number): { x: number; depth: number; left: number } | null {
  const at = kept.released ? null : settling(medal, landing, since);
  if (!at) kept.released = true;
  return at;
}

/** How far a medal that has left the foot noses down in the air, in radians, before it comes down flat. */
const NOSE = 0.3;
/** How far a medal that rattles on a slot's frame slides away from the slot while it does. */
const ASIDE = 0.9;

/**
 * A medal off the foot of the slide, in the air, `v` of the way from the
 * foot's edge to the lower table: out over the edge at the pace it left the
 * slide, down faster and faster, its nose dipping a little and then level
 * again, so that it comes down flat at `to`.
 */
function offFoot(x: number, front: number, v: number, to: Pick<Caught, 'x' | 'depth' | 'height'>): Pose & Pick<Caught, 'light' | 'leg' | 'landed'> {
  const edge = lying(x, SLOPE.long, front);
  return {
    x: x + (to.x - x) * ease(v),
    height: edge.height + (to.height - edge.height) * v * v,
    depth: edge.depth + (to.depth - edge.depth) * v,
    tilt: SLOPE.angle * (1 - ease(v)) + NOSE * Math.sin(Math.PI * v),
    heading: 0,
    light: 1,
    leg: 'foot',
    landed: v,
  };
}

/** The longest the catcher has anything: on its slide, and then on the lower table in front of it. */
const LONGEST = Math.max(CATCHER.sink, CATCHER.slide + LIE, CATCHER.rattle + LIE);

/** What is settled about a thing as it comes over the lip: where across the field it came over, and whether the slots' wings were open. And, later, whether the catcher has let go of it. */
interface CameOver {
  x: number;
  wings: boolean;
  /** Set once a thing that came down in front of the foot is where the engine has it: it is the engine's from then on. */
  released?: boolean;
}

/**
 * What the catcher has settled about each thing on its slide, the first time
 * it is asked about it, which is in the step the thing came over the lip or
 * the frame after: where across the field it came over, and whether the
 * wings of the slots were open then. The two of them say which slot took it,
 * or whose frame it caught, or neither.
 *
 * Neither is asked again. The engine has the thing on the lower table from
 * that step on, where the pile shoves it about; and chance time can begin or
 * end while it is still on its way, which opens the wings or shuts them. The
 * catcher shows it coming down from where it came over, to the slot that
 * took it or past the frame that did not, and does not change its mind half
 * way: a medal that began by catching a frame is not seen to turn into a
 * slot because the wings have opened since.
 *
 * For the wings it takes the engine's word, where the engine saw the thing
 * come over: the width the lip's rule had in that piece of its step, which
 * is the width that counted (`slotWidthAt` in engine.ts). A medal the engine
 * did not see come over, one read back from a save in the middle of its way
 * down, is taken as the slots stand when the catcher is first asked.
 *
 * One more thing is kept, for a thing that has come down off the foot and
 * lies in front of it: that the catcher has let go of it, which it does the
 * first time the engine has it where it lies. The pile can push a medal back
 * a little after that, and the catcher does not take it up again.
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

/**
 * How a medal that has come over the lip at the catcher is shown, or null
 * for one that is shown where the engine has it: a ball, a medal that is not
 * on its way down, one that has gone down a slot and out of sight, one that
 * has come down off the foot and is where the engine has it by now, and one
 * that came over the lip beside the catcher.
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
 * slots slides the length of the slide and off its foot.
 *
 * Off the foot it is in the air for a moment, out over the edge and down,
 * and comes down flat on the lower table in front of the catcher, where it
 * is seen to land (`CATCHER.lands`): on the table, or on whatever of `pile`
 * lies there, which is the machine's medals if they are given. There it
 * lies until the engine has it there too, or slips to where the engine has
 * it if that takes too long (`CATCHER.lie`): it ends exactly where the
 * engine has it, at the height the engine has it, so that whoever draws it
 * can go from this to the engine's own medal with nothing seen to move. A
 * jewel is not shown to lie anywhere but where the engine has it.
 *
 * Which it is was decided as the medal came over the lip, and stays decided
 * for as long as it is on its way (see `cameOver`): by where it came over,
 * and by how wide the slots were taking medals then. `wings` says whether
 * their wings are open now, and is only gone by for a medal the engine did
 * not see come over, the first time it is asked about. Where it came over
 * is exact if it is asked in the step the medal comes over, and as near as
 * the pile has left the medal if it is first asked later.
 */
export function caught(medal: Medal, time: number, calm = false, wings = false, pile: readonly Medal[] = []): Caught | null {
  if (medal.ball || medal.level !== 0 || medal.sinceDrop < 0 || medal.sinceDrop >= LONGEST) return null;
  const front = pusherFront(time);
  const kept = crossing(medal, wings);
  const { x, wings: open } = kept;
  const asItCame = x === medal.x ? medal : { ...medal, x };
  const chucker = droppedThrough(asItCame, CATCHER.sink, open);
  if (chucker >= 0) {
    const t = medal.sinceDrop / CATCHER.sink;
    const mouth = CHECKERS.positions[chucker];
    // It lies on the slide until its middle is a third of the way down the opening, and its nose all but at the lower edge of it.
    const slide = 0.42;
    const over = CATCHER.back + START_SLOT.long * 0.35;
    if (t < slide) {
      const u = t / slide;
      return { ...lying(x + (mouth - x) * ease(u), over * u, front), light: 1, chucker, near: -1, leg: 'slide', landed: 0 };
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
      landed: 0,
    };
  }
  // One that came through a slot is out of sight once it is down it: only one that came through none slides on.
  if (droppedThrough(asItCame, Infinity, open) >= 0) return null;
  // Only a medal that is wholly behind the catcher comes down its slide: one that hangs past its end is seen beside it, and falls as the engine has it.
  if (x - MEDAL_RADIUS < CATCHER.from || x + MEDAL_RADIUS > CATCHER.to) return null;
  // Whether it caught a frame was settled as it came over, like the rest, and is asked of the whole of its way: it comes off the foot where the frame left it.
  const near = calm ? -1 : grazed(asItCame, Infinity, CATCHER.reach, open);
  const away = near >= 0 ? Math.sign(x - CHECKERS.positions[near]) : 0;
  // Where it leaves the foot, across the field; how long it is from the lip to the lower table; and where it comes down.
  const left = x + away * ASIDE;
  const takes = near >= 0 ? CATCHER.rattle : CATCHER.slide;
  const landing = landingOf(left, time - medal.sinceDrop, takes, CATCHER.lands);
  /** How high its middle is where it lies on the lower table with `at.left` of the way to the engine's place still to go: on what lies where it landed, and at the engine's own height by the end. */
  const lain = (at: { x: number; depth: number; left: number }): number => {
    const landed = T / 2 + pileUnder(pile, medal, at.x, at.depth);
    return at.left < 1 ? lies(medal) + (landed - lies(medal)) * at.left : landed;
  };
  if (medal.sinceDrop >= takes) {
    const at = medal.jewel ? null : lyingOut(medal, kept, landing, medal.sinceDrop - takes);
    return at && { x: at.x, height: lain(at), depth: at.depth, tilt: 0, heading: 0, light: 1, chucker: -1, near, leg: 'table', landed: 1 };
  }
  /** Off the foot, `v` of the way down to where it will lie: a jewel, to where the engine has it. */
  const falling = (v: number): Caught => {
    const down = medal.jewel ? { x: medal.x, depth: medal.y, left: 0 } : touchdown(medal, landing);
    return { ...offFoot(left, front, v, { x: down.x, depth: down.depth, height: lain(down) }), chucker: -1, near };
  };
  if (near >= 0) {
    const t = medal.sinceDrop / CATCHER.rattle;
    // To the frame, on it, on down the slide, and off the foot: when each begins, and where on the slide it rattles from and to.
    const [reached, freed, gone] = [0.14, 0.62, 0.84];
    const from = CATCHER.back + 0.6;
    const to = CATCHER.back + START_SLOT.long * 0.6;
    if (t < reached) return { ...lying(x, (from * t) / reached, front), light: 1, chucker: -1, near, leg: 'slide', landed: 0 };
    if (t < freed) {
      const u = (t - reached) / (freed - reached);
      // Three rocks, each smaller than the last, toward the slot and away from it, riding up on the frame and down off it.
      const rock = 0.42 * Math.sin(Math.PI * 2 * 3 * u) * (1 - u);
      return { ...lying(x + away * ASIDE * u, from + (to - from) * u, front, CATCHER.rim.high * Math.sin(Math.PI * u), rock), light: 1, chucker: -1, near, leg: 'frame', landed: 0 };
    }
    if (t < gone) {
      const u = (t - freed) / (gone - freed);
      return { ...lying(left, to + (SLOPE.long - to) * (0.3 * u + 0.7 * u * u), front), light: 1, chucker: -1, near, leg: 'slide', landed: 0 };
    }
    return falling((t - gone) / (1 - gone));
  }
  const t = medal.sinceDrop / CATCHER.slide;
  const gone = 0.76;
  if (t < gone) return { ...lying(x, slid(t / gone), front), light: 1, chucker: -1, near: -1, leg: 'slide', landed: 0 };
  return falling((t - gone) / (1 - gone));
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
 * came over the lip beside the catcher or hanging past an end of it. No slot
 * takes a ball. It rolls the length of the slide and off its foot, and comes
 * down on the lower table in front of it, standing against the foot's edge
 * (`clearOfFoot`). There it stands, as a medal lies where it landed, until
 * the engine has it there too, or rolls to where the engine has it if that
 * takes too long: it ends exactly where the engine has it.
 */
export function rolling(medal: Medal, radius: number, time: number): Rolled | null {
  if (!medal.ball || medal.level !== 0 || medal.sinceDrop < 0 || medal.sinceDrop >= CATCHER.slide + LIE) return null;
  // No slot takes a ball, wings or no wings: only where it came over is kept, and whether the catcher has let go of it.
  const kept = crossing(medal, false);
  const { x } = kept;
  if (x - radius < CATCHER.from || x + radius > CATCHER.to) return null;
  const landing = landingOf(x, time - medal.sinceDrop, CATCHER.slide, clearOfFoot(radius));
  if (medal.sinceDrop >= CATCHER.slide) {
    const at = lyingOut(medal, kept, landing, medal.sinceDrop - CATCHER.slide);
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
  // It comes off the lip at the height it stood at on the pusher, and is on the slide by the time it has rolled half its radius down it.
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
