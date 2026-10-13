/**
 * The payout works as things in the cabinet: where the hopper's doors are in
 * the hood and how far they have swung, the way a poured medal takes from a
 * door to the pusher, and where each tower lift's guard stands and how high.
 * The engine owns what happens (hopper.ts, lift.ts); this file only says
 * where that puts things in the cabinet's own measures, across the field, up
 * from the lower table and out from the back wall, so that the canvas and the
 * 3D scene draw the same machinery straight from the machine. It also says
 * what the session reports of it: the doors opening and shutting, the towers
 * coming up and standing free.
 *
 * A door is a flap in the hood's face, hinged along its foot. Shut, it stands
 * upright in the face. Open, it has dropped outward past level and is the
 * chute itself: three channels run down its inner side, and a medal slides
 * out of the dark behind it, down a channel, and off its edge. A lamp beside
 * each door is lit for as long as the hopper is at work.
 *
 * A lift shows as a hatch in the pusher's deck, which is there whether it is
 * at work or not: two doors that meet along a seam, and a collar round them
 * that is a lamp, one ring of light all the way round the mouth. At work, the
 * ring comes on, running round from the back, its doors slide apart over the
 * dark of the shaft, a clear sleeve rises out of the collar, and the tower
 * comes up through the mouth inside the sleeve, each medal lifting the ones
 * above it. Built, the tower stands a moment; the sleeve sinks; the hatch
 * closes round the tower's foot and the ring goes out. A prize's hatches do
 * this as a ripple from the middle of the row outward.
 */

import { FIELD, MEDAL_RADIUS, MEDAL_THICKNESS, TOWER, type FallingMedal, type Machine, type Medal } from './engine';
import { DOORS, POUR, doorsOpen, hopperBusy, type DoorPhase } from './hopper';
import { LIFT, guardUp, holds, stands, type Lift } from './lift';
import { EYE_AT, HEIGHT, HOUSING } from './view';

const R = MEDAL_RADIUS;
const T = MEDAL_THICKNESS;
const smooth = (t: number): number => t * t * (3 - 2 * t);

// ── The hopper's doors ──────────────────────────────────────────────────────

export const DOOR = {
  /** How high its hinge is, along its foot: over the lit lip of the hood. */
  foot: HOUSING.hood + 1.5,
  /** How tall the flap is, which is how long the chute is once it is down. */
  tall: 4.5,
  /** How far it swings from upright when it is open, in radians: past level, so that medals slide off it. */
  swing: 1.95,
  /** How far out from the back wall its hinge is: in the hood's face, and standing a hair proud of it. */
  face: HOUSING.out + 0.08,
  /** How far each of its lamps is from its outer end, and how big the lamp is. */
  lamp: { out: 2.4, radius: 0.9 },
  /** How far in from each end of the flap a hinge is, and how big its knuckle is. */
  hinge: { in: 3, radius: 0.45, long: 2.2 },
  /** How high the walls of a channel stand from the flap. */
  rib: 0.45,
} as const;

/** How far the doors have swung, in radians from upright. With `calm` they are open or shut and nothing between. */
export function doorSwing(machine: Pick<Machine, 'hopper'>, calm = false): number {
  const open = doorsOpen(machine.hopper);
  if (calm) return hopperBusy(machine.hopper) ? DOOR.swing : 0;
  return smooth(open) * DOOR.swing;
}

/** Whether the lamps beside the doors are lit: for as long as the hopper is at work. */
export const doorLampLit = (machine: Pick<Machine, 'hopper'>): boolean => hopperBusy(machine.hopper);

/** A point of a flap that has swung by `swing`: `along` it from the hinge (0) to its free edge (1), and `off` its inner side. */
export function onFlap(swing: number, along: number, off = 0): { height: number; depth: number } {
  const sin = Math.sin(swing);
  const cos = Math.cos(swing);
  // Its inner side faces the wall when it is shut and the roof when it is down.
  return { height: DOOR.foot + DOOR.tall * along * cos + off * sin, depth: DOOR.face + DOOR.tall * along * sin - off * cos };
}

/**
 * Whether the camera sees the inner side of a flap that has swung by
 * `swing`: the side its channels are on, which faces the wall while it is
 * shut and comes into sight as it goes down.
 */
export function chuteShows(swing: number): boolean {
  const hinge = onFlap(swing, 0);
  // Its inner side faces the wall and then the roof: up by the sine of its swing, toward the wall by the cosine.
  return Math.sin(swing) * (EYE_AT.height - hinge.height) - Math.cos(swing) * (EYE_AT.depth - hinge.depth) > 0;
}

/** How steeply an open flap falls away from the hood, in radians below level. */
export const CHUTE_SLOPE = DOOR.swing - Math.PI / 2;

/** How a medal in the air is held, for whatever draws it. */
export interface Pose {
  x: number;
  height: number;
  depth: number;
  /** How far it is tipped forward from lying flat, in radians. */
  tilt: number;
  /** How much of it there is to see yet: it comes out of the dark behind the door. */
  shown: number;
}

/** The shares of a poured medal's way: down the chute, through the air, and the bounce it lands with. */
export const POUR_WAY = { slide: 0.2, bounce: 0.86, hop: 1.5 } as const;

/**
 * Where a poured medal is and how it is held: out of the dark behind its
 * door and down its channel, faster and faster; off the edge of the flap and
 * down to the pusher, turning over once on the way; and one short hop where
 * it lands, flat. `rest` is how high its middle is once it is down. With
 * `calm` it neither turns over nor hops.
 */
export function pourPose(medal: FallingMedal, rest: number, calm = false): Pose {
  const t = Math.min(1, Math.max(0, 1 - medal.remaining / medal.duration));
  if (t < POUR_WAY.slide) {
    const u = t / POUR_WAY.slide;
    const at = onFlap(DOOR.swing, 0.08 + 0.92 * u * u, T * 0.6);
    return { x: medal.fromX, height: at.height, depth: at.depth, tilt: CHUTE_SLOPE, shown: Math.min(1, u / 0.35) };
  }
  const edge = onFlap(DOOR.swing, 1, T * 0.6);
  const lands = calm ? 1 : POUR_WAY.bounce;
  if (t < lands) {
    const f = (t - POUR_WAY.slide) / (lands - POUR_WAY.slide);
    return {
      x: medal.fromX + (medal.x - medal.fromX) * f,
      height: rest + (edge.height - rest) * (1 - f * f),
      depth: edge.depth + (medal.y - edge.depth) * f,
      tilt: calm ? CHUTE_SLOPE * (1 - f) : CHUTE_SLOPE + (Math.PI * 2 - CHUTE_SLOPE) * f,
      shown: 1,
    };
  }
  const g = (t - lands) / (1 - lands || 1);
  return { x: medal.x, height: rest + POUR_WAY.hop * 4 * g * (1 - g), depth: medal.y, tilt: 0.28 * Math.sin(Math.PI * g) * (medal.id % 2 === 0 ? 1 : -1), shown: 1 };
}

/** The door a channel's medals come out of: the left one (0) or the right one (1). */
export const doorOf = (fromX: number): 0 | 1 => (fromX < (DOORS[0].to + DOORS[1].from) / 2 ? 0 : 1);

// ── The tower lifts ─────────────────────────────────────────────────────────

export const GUARD = {
  /** How far out from the middle of its tower the sleeve's wall is. */
  radius: R + LIFT.wall,
  /** How far over the top of the finished tower the sleeve stands. */
  over: 1.4,
  /** How tall the collar round its top is. */
  collar: 0.55,
  /** How wide the ring in the deck is, outside the sleeve. */
  ring: 0.5,
} as const;

/**
 * A lift's hatch in the pusher's deck. Its mouth is a little wider than a
 * medal, so a tower coming up through it has the dark of the shaft all round
 * its foot. Its doors meet along a seam that runs from the back of the deck
 * to the front, and slide apart to either side.
 *
 * Its collar is its lamp: one ring of light, from the edge of the mouth out
 * to the edge of the collar, 8.4 across, which is some 21 pixels of a phone
 * and 27 with the light it throws. It was eight bulbs in the collar once,
 * each a pixel and a half of a phone, and nobody saw them come on. The ring
 * is lit an arc at a time, and it throws its light on whatever lies over it
 * and round it, so that it is seen to come on under a deck that is covered.
 * The sleeve stands in it: what lies round a tower in its guard covers the
 * part of the ring outside the sleeve and leaves the part inside it, and the
 * light it throws, to be seen.
 */
export const DECK_HATCH = {
  /** How far out from its middle the mouth reaches, and how far the collar round it. */
  radius: R + 0.15,
  collar: GUARD.radius + GUARD.ring,
  /** Arcs to the ring of light in the collar: they come on one after another, the first from the back of the deck round toward the right. */
  lamps: 12,
  /** How far beyond the collar, and inside the mouth's edge, the ring's light reaches on what lies over the hatch and round it. */
  glow: 1.3,
  /** How far below the deck the first medal waits while the doors open: it comes up out of the dark of the shaft as the guard rises. */
  down: 0.9,
  /** Turns a second the light makes round the ring while a tower is coming up. */
  chase: 1.5,
} as const;

/** Every hatch there is: how far across the field, and how far behind the pusher's lip. They are the places `buildTowers` puts towers. */
export const HATCHES: readonly { x: number; behind: number }[] = TOWER.rows.flatMap((behind) =>
  Array.from({ length: TOWER.perRow }, (_, place) => ({ x: FIELD.width / 2 + (place - (TOWER.perRow - 1) / 2) * TOWER.spacing, behind })),
);

/** How many places out from the middle of its row a hatch at `x` is: 0 for the two in the middle. */
const outFromMiddle = (x: number): number => Math.min(Math.floor(TOWER.perRow / 2) - 1, Math.max(0, Math.floor(Math.abs(x - FIELD.width / 2) / TOWER.spacing)));

/**
 * How many seconds ahead of the outermost hatch of a row the one at `x` is:
 * the ripple runs from the middle outward, so the middle two are furthest
 * ahead and the outermost not at all.
 */
export const rippleLead = (x: number): number => (Math.floor(TOWER.perRow / 2) - 1 - outFromMiddle(x)) * LIFT.ripple;

/** The furthest ahead any hatch is: the outermost one starts this long after its prize is paid. */
export const RIPPLE = rippleLead(FIELD.width / 2);

/** A lift as it is drawn. */
export interface LiftView {
  id: number;
  /** Where its hatch is on the field now: across, and from the back wall. */
  x: number;
  y: number;
  /** How high its sleeve's rim stands above the deck now, and how high it stands when it is all the way up. */
  rim: number;
  full: number;
  /** Whether it is at work, which lights the lamp on its sleeve's collar: from the moment its prize is paid until the tower is let go. */
  working: boolean;
  /** Its tower, while the lift still holds it. */
  tower: Medal | undefined;
  /** How many medals the tower will have when it is built. */
  size: number;
  /** How far its doors have slid apart: 0 shut, 1 all the way. */
  doors: number;
  /** How much of the ring of light in its collar is lit, as a share of its arcs: they come on one after another round the ring, and go out as the hatch closes. */
  lamps: number;
  /**
   * How high the top of its tower is above the deck. While the hatch opens
   * the first medal waits below it, in the shaft, and this is less than
   * nothing; it is level with the deck once the guard is up; then the tower
   * rises at an even pace, a medal's thickness for every medal it gains, and
   * the last medal comes up flush while the tower stands.
   */
  top: number;
  /** How much light is on the top of its tower: none while it waits down the shaft, more as it comes up it, all of it once it is level with the deck. */
  light: number;
  /** Whether the tower is coming up now, which sets the light running round the ring. */
  building: boolean;
}

const clamp = (t: number): number => Math.min(1, Math.max(0, t));

/**
 * One lift as it is drawn. `clock` is the machine's `towerClock`: how much of
 * the next medal the towers that are going up have gained. With `calm`
 * nothing slides, rises or ripples: each part is where it was or where it is
 * going, in the same order, and the tower gains a whole medal at a time.
 */
export function liftView(lift: Lift, tower: Medal | undefined, clock: number, front: number, calm = false): LiftView {
  const full = lift.size * T + GUARD.over;
  const held = holds(lift);
  const lead = calm ? 0 : rippleLead(lift.x);
  // Seconds since its own turn in the ripple came, for as long as the lift says: until the first medal comes up.
  const since = LIFT.opens - lift.wait - (calm ? 0 : RIPPLE - lead);
  // Seconds since its guard began to sink, which for all but the outermost is while the tower still stands.
  const sinking = lift.sunk > -1 ? lift.sunk + lead : -1;
  const rising = guardUp(lift, lead);
  const up = calm ? (rising >= 1 ? 1 : 0) : smooth(rising);
  let doors = 1;
  let lamps = 1;
  if (sinking >= 0) {
    const shut = clamp((sinking - LIFT.sinks) / LIFT.shuts);
    doors = calm ? (shut >= 1 ? 0 : 1) : 1 - smooth(shut);
    lamps = calm ? (held ? 1 : 0) : 1 - shut;
  } else if (lift.wait > 0) {
    doors = calm ? (since >= LIFT.lamps ? 1 : 0) : smooth(clamp((since - LIFT.lamps) / LIFT.doors));
    lamps = calm ? 1 : clamp(since / LIFT.lamps);
  }
  // The tower: waiting in the shaft, coming level as the guard rises, going up, and seated while it stands.
  let top = 0;
  let light = 1;
  if (tower && held) {
    if (lift.wait > 0) {
      // With `calm` the open shaft stays dark until the guard is up: the first medal is seen as the tower begins.
      top = calm ? 0 : -DECK_HATCH.down * (1 - up);
      light = doors * up;
    } else if (calm) {
      top = tower.stack * T;
    } else if (stands(lift)) {
      top = (tower.stack - 1 + clamp((lift.sunk + LIFT.stands) * TOWER.perSecond)) * T;
    } else {
      top = (tower.stack - 1 + clamp(clock)) * T;
    }
  }
  const building = held && lift.wait === 0 && !stands(lift);
  return { id: lift.id, x: lift.x, y: Math.max(R, front - lift.behind), rim: up * full, full, working: held, tower: held ? tower : undefined, size: lift.size, doors, lamps, top, light, building };
}

/**
 * The lifts that are at work, from the back of the pusher forward. `front`
 * is where the pusher's lip is. With `calm` a sleeve is up or it is not.
 */
export function liftViews(machine: Pick<Machine, 'lifts' | 'medals'> & Partial<Pick<Machine, 'towerClock'>>, front: number, calm = false): LiftView[] {
  if (machine.lifts.length === 0) return [];
  const views = machine.lifts.map((lift: Lift): LiftView => liftView(lift, holds(lift) ? machine.medals.find((medal) => medal.id === lift.id) : undefined, machine.towerClock ?? 0, front, calm));
  return views.sort((a, b) => a.y - b.y);
}

/** A hatch as it is drawn: where it is on the field now, how far its doors have slid apart, and how much of its ring of light is lit. */
export interface HatchView {
  x: number;
  y: number;
  doors: number;
  lamps: number;
  /** Whether the light is running round its ring: a tower is coming up through it. */
  chase: boolean;
}

/**
 * How bright arc `index` of a hatch's ring of light is, from 0 to 1, at
 * `time` on the machine's clock: lit once the arcs before it are, and
 * brighter and dimmer by turns as the light runs round while a tower comes
 * up. With `calm` a lit arc is simply lit.
 */
export function lampGlow(hatch: Pick<HatchView, 'lamps' | 'chase'>, index: number, time: number, calm = false): number {
  const lit = Math.min(1, Math.max(0, hatch.lamps * DECK_HATCH.lamps - index));
  // An arc that is lit by a millionth is the drift of the sums, and is dark.
  if (lit < 1e-6) return 0;
  if (calm || !hatch.chase) return lit;
  return lit * (0.6 + 0.4 * Math.cos(2 * Math.PI * (time * DECK_HATCH.chase - index / DECK_HATCH.lamps)));
}

/** How near a lift has to be to a hatch to be the lift under it: nearer than any two hatches are, and further than the sums drift. */
const SAME_HATCH = 0.01;

/**
 * Every hatch in the deck, the ones at rest as well as the ones `views` are
 * at work under, and a hatch for any lift that is at work somewhere else,
 * which a machine put together by hand may have. `front` is where the
 * pusher's lip is. The deck's own hatches come first, in the order of
 * `HATCHES`, and any other after them.
 */
export function hatchViews(views: readonly LiftView[], front: number): HatchView[] {
  const hatches: HatchView[] = HATCHES.map(({ x, behind }) => ({ x, y: Math.max(R, front - behind), doors: 0, lamps: 0, chase: false }));
  for (const view of views) {
    const at = hatches.find((hatch) => Math.abs(hatch.x - view.x) < SAME_HATCH && Math.abs(hatch.y - view.y) < SAME_HATCH);
    // Where a tower has been pushed off a hatch that is still closing and the next has started there, the further open of the two is the one seen.
    if (at) {
      at.doors = Math.max(at.doors, view.doors);
      at.lamps = Math.max(at.lamps, view.lamps);
      at.chase ||= view.building;
    } else {
      hatches.push({ x: view.x, y: view.y, doors: view.doors, lamps: view.lamps, chase: view.building });
    }
  }
  return hatches;
}

/** Whether a lift still holds this tower, so that whoever draws the towers leaves it to the lift: it is drawn where the lift has it, part of the way up through its hatch. */
export const onLift = (machine: Pick<Machine, 'lifts'>, medal: Pick<Medal, 'id'>): boolean => machine.lifts.length > 0 && machine.lifts.some((lift) => lift.id === medal.id && holds(lift));

/** The medals of a list that no lift holds: the list itself when no lift is at work. */
export const offLifts = <M extends Pick<Medal, 'id'>>(machine: Pick<Machine, 'lifts'>, medals: M[]): M[] => (machine.lifts.some(holds) ? medals.filter((medal) => !onLift(machine, medal)) : medals);

/** The height of the pusher's deck, which the lifts are in. */
export const DECK = HEIGHT.pusher;

// ── What the session reports ────────────────────────────────────────────────

/** What the payout works did in a step of the session. */
export type WorksEvent =
  /** The hopper's doors began to drop open, from shut or from part of the way shut, with this many medals waiting to be poured. */
  | { type: 'pourStart'; medals: number }
  /** The last medal has gone and the doors began to shut, this many having been poured since they began to open. */
  | { type: 'pourEnd'; medals: number }
  /** This many lifts started on towers, which will hold this many medals between them: their rings of light come on and their hatches begin to open. */
  | { type: 'towersRise'; towers: number; medals: number }
  /** The guards of this many lifts began to rise out of their collars. */
  | { type: 'guardsRise'; towers: number }
  /** This many towers are built and have stood their moment: their guards began to sink, and they stand free. */
  | { type: 'towersReady'; towers: number };

/** What of the payout works is remembered across a step, to tell what changed in it. */
export interface WorksWatch {
  /** The pours the hopper had begun, and whether it was in the middle of one: its doors dropping open, or open with medals coming. */
  pours: number;
  pouring: boolean;
  lifting: ReadonlySet<number>;
  /** The lifts whose guards had begun to rise. */
  guarded: ReadonlySet<number>;
}

const NONE: ReadonlySet<number> = new Set();
const NOTHING: WorksEvent[] = [];
/** The doors are out while they are dropping open or pouring: from the moment a pour begins until the last medal has gone. */
const out = (phase: DoorPhase): boolean => phase === 'opening' || phase === 'pouring';
/** Whether a lift's guard has begun to rise, or has risen: each in its turn in the ripple. */
const guarded = (lift: Lift): boolean => lift.wait <= LIFT.rises + rippleLead(lift.x);

export const watchWorks = (machine: Pick<Machine, 'hopper' | 'lifts'>): WorksWatch => ({
  pours: machine.hopper.pours,
  pouring: out(machine.hopper.phase),
  lifting: machine.lifts.length > 0 ? new Set(machine.lifts.filter(holds).map((lift) => lift.id)) : NONE,
  guarded: machine.lifts.length > 0 ? new Set(machine.lifts.filter(guarded).map((lift) => lift.id)) : NONE,
});

/**
 * What the payout works have done since `before` was taken, in the order it
 * happened. It is told by what they were doing then and what they are doing
 * now, and by the hopper's own count of the pours it has begun. So a pour is
 * told however long the step: one that begins, empties and begins to shut all
 * within it, which takes some two seconds, is told whole, and so is a second
 * one that happens to be as big as the one before it. A pour that began in
 * this step began with what it has poured since and what is still waiting.
 *
 * A prize is paid between two steps of the field, so the doors begin at most
 * one pour in a step, at its start, and no pour ends in a step in which the
 * next begins. A machine that is handed medals while it runs could do that;
 * of such a step the pour that began is told, and not the one that ended,
 * whose count is no longer written anywhere. A lift that starts and finishes
 * within one step is not told at all. A guard is told as it begins to rise,
 * which is some way into its lift's wait and a little sooner for a hatch
 * nearer the middle of its row; a lift found already at work has its guard
 * up, and is not told.
 */
export function worksEvents(before: WorksWatch, machine: Pick<Machine, 'hopper' | 'lifts' | 'payoutQueue'>): readonly WorksEvent[] {
  const { hopper, lifts } = machine;
  const began = hopper.pours !== before.pours;
  const pouring = out(hopper.phase);
  if (!began && pouring === before.pouring && lifts.length === 0 && before.lifting.size === 0) return NOTHING;
  const events: WorksEvent[] = [];
  if (began) events.push({ type: 'pourStart', medals: hopper.poured + (pouring ? machine.payoutQueue : 0) });
  if ((began || before.pouring) && !pouring) events.push({ type: 'pourEnd', medals: hopper.poured });
  const started = lifts.filter((lift) => holds(lift) && !before.lifting.has(lift.id));
  if (started.length > 0) events.push({ type: 'towersRise', towers: started.length, medals: started.reduce((sum, lift) => sum + lift.size, 0) });
  let rising = 0;
  for (const lift of lifts) if (holds(lift) && guarded(lift) && !before.guarded.has(lift.id) && (before.lifting.has(lift.id) || started.includes(lift))) rising += 1;
  if (rising > 0) events.push({ type: 'guardsRise', towers: rising });
  const holding = new Set(lifts.filter(holds).map((lift) => lift.id));
  let ready = 0;
  for (const id of before.lifting) if (!holding.has(id)) ready += 1;
  if (ready > 0) events.push({ type: 'towersReady', towers: ready });
  return events;
}

/** How long the doors take over a pour of `medals`, from the moment they begin to open until they are shut again, in seconds. */
export const pourTime = (medals: number): number => POUR.opens + medals / POUR.perSecond + POUR.closes;
