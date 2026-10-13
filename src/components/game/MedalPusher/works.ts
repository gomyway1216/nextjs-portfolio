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
 * A lift shows as a ring in the pusher's deck round the foot of its tower,
 * lit while it works, and a clear sleeve standing in the ring with a collar
 * round its top: rising before the tower comes, up while it is built, sinking
 * when it is done.
 */

import { MEDAL_RADIUS, MEDAL_THICKNESS, type FallingMedal, type Machine, type Medal } from './engine';
import { DOORS, POUR, doorsOpen, hopperBusy, type DoorPhase } from './hopper';
import { LIFT, guardUp, holds, type Lift } from './lift';
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

/** A lift as it is drawn. */
export interface LiftView {
  id: number;
  /** Where its hatch is on the field now: across, and from the back wall. */
  x: number;
  y: number;
  /** How high its sleeve's rim stands above the deck now, and how high it stands when it is all the way up. */
  rim: number;
  full: number;
  /** Whether it is at work, which lights its ring and its lamp: from the hatch opening until the tower is built. */
  working: boolean;
  /** Its tower, while it is still where the lift is. */
  tower: Medal | undefined;
}

/**
 * The lifts that are at work, from the back of the pusher forward. `front`
 * is where the pusher's lip is. With `calm` a sleeve is up or it is not.
 */
export function liftViews(machine: Pick<Machine, 'lifts' | 'medals'>, front: number, calm = false): LiftView[] {
  if (machine.lifts.length === 0) return [];
  const views = machine.lifts.map((lift: Lift): LiftView => {
    const full = lift.size * T + GUARD.over;
    const up = calm ? (holds(lift) ? 1 : 0) : smooth(Math.min(1, Math.max(0, guardUp(lift))));
    return { id: lift.id, x: lift.x, y: front - lift.behind, rim: up * full, full, working: holds(lift), tower: holds(lift) ? machine.medals.find((medal) => medal.id === lift.id) : undefined };
  });
  return views.sort((a, b) => a.y - b.y);
}

/** The height of the pusher's deck, which the lifts are in. */
export const DECK = HEIGHT.pusher;

// ── What the session reports ────────────────────────────────────────────────

/** What the payout works did in a step of the session. */
export type WorksEvent =
  /** The hopper's doors began to drop open, from shut or from part of the way shut, with this many medals waiting to be poured. */
  | { type: 'pourStart'; medals: number }
  /** The last medal has gone and the doors began to shut, this many having been poured since they began to open. */
  | { type: 'pourEnd'; medals: number }
  /** This many lifts started on towers, which will hold this many medals between them. */
  | { type: 'towersRise'; towers: number; medals: number }
  /** This many towers are built: their guards began to sink, and they stand free. */
  | { type: 'towersReady'; towers: number };

/** What of the payout works is remembered across a step, to tell what changed in it. */
export interface WorksWatch {
  /** The pours the hopper had begun, and whether it was in the middle of one: its doors dropping open, or open with medals coming. */
  pours: number;
  pouring: boolean;
  lifting: ReadonlySet<number>;
}

const NONE: ReadonlySet<number> = new Set();
const NOTHING: WorksEvent[] = [];
/** The doors are out while they are dropping open or pouring: from the moment a pour begins until the last medal has gone. */
const out = (phase: DoorPhase): boolean => phase === 'opening' || phase === 'pouring';

export const watchWorks = (machine: Pick<Machine, 'hopper' | 'lifts'>): WorksWatch => ({
  pours: machine.hopper.pours,
  pouring: out(machine.hopper.phase),
  lifting: machine.lifts.length > 0 ? new Set(machine.lifts.filter(holds).map((lift) => lift.id)) : NONE,
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
 * within one step is not told at all.
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
  const holding = new Set(lifts.filter(holds).map((lift) => lift.id));
  let ready = 0;
  for (const id of before.lifting) if (!holding.has(id)) ready += 1;
  if (ready > 0) events.push({ type: 'towersReady', towers: ready });
  return events;
}

/** How long the doors take over a pour of `medals`, from the moment they begin to open until they are shut again, in seconds. */
export const pourTime = (medals: number): number => POUR.opens + medals / POUR.perSecond + POUR.closes;
