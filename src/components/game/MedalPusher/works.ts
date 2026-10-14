/**
 * The payout works as things in the cabinet: where the hopper's doors are in
 * the hood and how far they have swung, the way a poured medal takes from a
 * door to the pusher, and the two tower tubes in their windows, with the
 * platform, the gate and the arm of each. The engine owns what happens
 * (hopper.ts, stacker.ts); this file only says where that puts things in the
 * cabinet's own measures, across the field, up from the lower table and out
 * from the back wall, so that the canvas and the 3D scene draw the same
 * machinery straight from the machine. It also says what the session reports
 * of it: the doors opening and shutting, the medals dropping into a tube, and
 * a tower let down, pushed out and set in its place.
 *
 * A door is a flap in the hood's face, hinged along its foot. Shut, it stands
 * upright in the face. Open, it has dropped outward past level and is the
 * chute itself: three channels run down its inner side, and a medal slides
 * out of the dark behind it, down a channel, and off its edge. A lamp beside
 * each door is lit for as long as the hopper is at work.
 *
 * A tube stands in a window cut in the back wall at one of the screen's lower
 * corners, from the pusher's deck up into the corner of the screen: a recess
 * dark at the back, a glass tube standing in it, and over the window a count
 * of the medals in the tube. The lower part of the tube's front is its gate,
 * a curved pane that slides aside into the wall. A medal drops in through a
 * slot in the top of the window and lands on the stack, and the platform the
 * stack stands on sinks a medal's thickness, so the top of the stack stays at
 * the top of the window. Built, the tower is let down to the deck on its
 * platform, the gate slides aside, and the arm pushes it out: a ram straight
 * out of the tube, and from the ram's head a boom that pushes it on across
 * the pusher to its place.
 */

import { MEDAL_RADIUS, MEDAL_THICKNESS, type FallingMedal, type Machine, type Medal } from './engine';
import { DOORS, POUR, doorsOpen, hopperBusy, type DoorPhase } from './hopper';
import { PHASE_TIME, STACK, TUBE, TUBE_PHASES, armSpot, type Tube, type TubePhase } from './stacker';
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

// ── The tower tubes ─────────────────────────────────────────────────────────

/** The height of the pusher's deck, which a tube's window comes down to and a tower is pushed out onto. */
export const DECK = HEIGHT.pusher;

/**
 * A tube's window in the back wall, about the tube's own place across the
 * field (`TUBE.x`): how far its opening reaches to either side, how high it
 * goes, how far back its recess goes behind the wall's face, how wide the
 * chrome frame round it is, and the count over it, which is a plate of lamps
 * that stands a little out from the wall.
 */
export const WINDOW = {
  half: R + 0.8,
  /** Its top: over the top of a stack that is being built, with room for a medal to drop in. */
  top: TUBE.feed + 3.4,
  /** How far behind the wall's face the back of the recess is. */
  recess: TUBE.back - R - 1.2,
  frame: 0.45,
  count: { height: 3.6, half: R + 0.4, out: 0.3 },
} as const;

/** The glass tube in a window: how far out from its middle the glass is. */
export const GLASS = { radius: R + 0.35 } as const;

/**
 * The gate: the lower part of the tube's front, a curved pane from the deck
 * up to over the tallest tower, which slides aside into the wall toward the
 * cabinet's side. Over it, a chrome band round the tube. It slides open in
 * `STACK.opens`, and shut in `shuts` seconds once the arm is back in.
 */
export const GATE = { tall: MEDAL_THICKNESS * STACK.most + 1.4, band: 0.5, shuts: 0.2 } as const;

/** The platform a stack stands on, how far out from the middle its disc reaches, and the slot in the top of the window a medal drops in through. */
export const PLATFORM = { radius: R + 0.15, thick: 0.45 } as const;

/**
 * The arm: a ram that comes straight out of the tube, and a boom on the ram's
 * head that reaches across the pusher. Both are chrome rods this thick, this
 * high over the deck, which is over the medals lying there and under the
 * middle of the shortest tower that is pushed; its head is a plate as wide
 * as `head`.
 */
export const ARM = { radius: 0.42, height: 1.6, head: 2.4 } as const;

/** The share of the time the arm takes to draw back that the boom takes to fold; the ram withdraws in the rest. */
const FOLD = 0.6;

/** Where the boom pivots on the ram's head: over the deck, at the mouth of the tube. */
export const pivotOf = (index: 0 | 1): { x: number; y: number } => ({ x: TUBE.x[index], y: TUBE.mouth - R });

/** A tube as it is drawn. */
export interface TubeView {
  index: 0 | 1;
  /** Where the tube stands across the field. */
  x: number;
  /** How high the top of the platform is above the lower table. */
  platform: number;
  /** Medals standing on the platform, in the tube. */
  stacked: number;
  /** The medal on its way down onto the stack: how far it has dropped, from 0 at the slot to 1 on the stack. Less than nothing when none is. */
  dropping: number;
  /** How far the gate has slid aside: 0 shut, 1 all the way. */
  gate: number;
  /** How far out from the wall's face the head of the ram is: less than nothing while it is still in the tube; null while it is in. */
  ram: number | null;
  /** Where the head of the boom is on the deck, across and out from the wall, or null while it is folded on the ram. */
  boom: { x: number; y: number } | null;
  /** The tower the arm is pushing, while it is. */
  tower: Medal | undefined;
  /** What the count over the window shows: nothing (null) while the tube is empty. */
  count: number | null;
  /** Whether the tube is at work, which lights the lamps of its window. */
  working: boolean;
}

const clamp = (t: number): number => Math.min(1, Math.max(0, t));

/** Where a boom's head is that pushes a tower standing at `at`: against the tower's back, on the line from the pivot. */
function boomHead(index: 0 | 1, at: { x: number; y: number }): { x: number; y: number } | null {
  const pivot = pivotOf(index);
  const dx = at.x - pivot.x;
  const dy = at.y - pivot.y;
  const length = Math.hypot(dx, dy) - R;
  if (length <= 0.05) return null;
  const reach = length / (length + R);
  return { x: pivot.x + dx * reach, y: pivot.y + dy * reach };
}

/**
 * One tube as it is drawn. `tower` is the medal its arm is pushing, if it is
 * pushing one, and `front` where the pusher's lip is. With `calm` nothing
 * slides or drops: the platform and the gate are where they were until the
 * phase that moves them is over, and the count goes up a medal at a time.
 * The arm moves with its tower, which is pushed as the pusher moves, calm or
 * not.
 */
export function tubeView(tube: Tube, index: 0 | 1, tower: Medal | undefined, front: number, calm = false): TubeView {
  const top = TUBE.feed;
  const x = TUBE.x[index];
  const view: TubeView = { index, x, platform: top, stacked: 0, dropping: -1, gate: 0, ram: null, boom: null, tower: undefined, count: null, working: tube.phase !== 'stacking' || tube.size > 0 };
  const ease = (t: number): number => (calm ? (t >= 1 ? 1 : 0) : smooth(clamp(t)));
  switch (tube.phase) {
    case 'stacking':
      view.stacked = tube.stacked;
      view.platform = top - tube.stacked * T;
      view.dropping = tube.stacked < tube.size && !calm ? tube.clock : -1;
      view.count = tube.size > 0 ? tube.stacked : null;
      break;
    case 'lowering':
      view.stacked = tube.size;
      view.platform = top - tube.size * T + (DECK - (top - tube.size * T)) * ease(tube.clock / STACK.lowers);
      view.count = tube.size;
      break;
    case 'opening':
      view.stacked = tube.size;
      view.platform = DECK;
      view.gate = calm ? 1 : smooth(clamp(tube.clock / STACK.opens));
      view.count = tube.size;
      break;
    case 'pushing': {
      view.platform = DECK;
      view.gate = 1;
      view.tower = tower;
      view.count = tower ? tower.stack : null;
      const at = tower ?? armSpot(index, tube.clock, front);
      if (tube.clock / STACK.pushes <= STACK.out) view.ram = at.y - R;
      else {
        view.ram = TUBE.mouth - R;
        view.boom = boomHead(index, at);
      }
      break;
    }
    case 'returning': {
      const back = STACK.back * STACK.returns;
      const t = tube.clock;
      view.platform = DECK;
      view.gate = 1;
      if (t < back * FOLD) {
        // The boom folds back from where it let the tower go onto the ram's head.
        const from = boomHead(index, armSpot(index, STACK.pushes, front));
        const pivot = pivotOf(index);
        const left = 1 - ease(t / (back * FOLD));
        view.ram = TUBE.mouth - R;
        view.boom = from && left > 0 ? { x: pivot.x + (from.x - pivot.x) * left, y: pivot.y + (from.y - pivot.y) * left } : null;
      } else if (t < back) {
        // Then the ram draws back into the tube.
        const left = 1 - ease((t - back * FOLD) / (back * (1 - FOLD)));
        view.ram = left > 0 ? TUBE.back - R + (TUBE.mouth - TUBE.back) * left : null;
      } else {
        // The gate slides shut behind it, and the platform rises to the top of the window for the next.
        view.gate = 1 - ease((t - back) / GATE.shuts);
        view.platform = DECK + (top - DECK) * ease((t - back - GATE.shuts) / (STACK.returns - back - GATE.shuts));
      }
      break;
    }
  }
  return view;
}

/** Both tubes as they are drawn, the left one's first. `front` is where the pusher's lip is. */
export function tubeViews(machine: Pick<Machine, 'stacker' | 'medals'>, front: number, calm = false): [TubeView, TubeView] {
  const [left, right] = machine.stacker.tubes;
  const pushed = (tube: Tube): Medal | undefined => (tube.phase === 'pushing' ? machine.medals.find((medal) => medal.id === tube.tower) : undefined);
  return [tubeView(left, 0, pushed(left), front, calm), tubeView(right, 1, pushed(right), front, calm)];
}

/** Whether an arm is pushing this tower, so that whoever draws the towers leaves it to the arm's drawing, which draws it with the arm. */
export const onArm = (machine: Pick<Machine, 'stacker'>, medal: Pick<Medal, 'id'>): boolean => machine.stacker.tubes.some((tube) => tube.phase === 'pushing' && tube.tower === medal.id);

/** The medals of a list that no arm is pushing: the list itself while no arm is out. */
export const offArms = <M extends Pick<Medal, 'id'>>(machine: Pick<Machine, 'stacker'>, medals: M[]): M[] =>
  machine.stacker.tubes.some((tube) => tube.phase === 'pushing') ? medals.filter((medal) => !onArm(machine, medal)) : medals;

/**
 * How the count over a tube's window reads, as the lamps of its digits show
 * it: the number, at most two digits, or nothing.
 */
export const countText = (count: number | null): string => (count === null ? '' : String(Math.min(99, Math.max(0, count))));

// ── What the session reports ────────────────────────────────────────────────

/** What the payout works did in a step of the session. */
export type WorksEvent =
  /** The hopper's doors began to drop open, from shut or from part of the way shut, with this many medals waiting to be poured. */
  | { type: 'pourStart'; medals: number }
  /** The last medal has gone and the doors began to shut, this many having been poured since they began to open. */
  | { type: 'pourEnd'; medals: number }
  /** This many medals dropped into tube `tube` (0 the left, 1 the right) and landed on its stack. */
  | { type: 'stacked'; tube: 0 | 1; medals: number }
  /** A tower of this many medals is built, and its platform began to let it down to the deck. */
  | { type: 'towerDown'; tube: 0 | 1; medals: number }
  /** The tube's gate began to slide aside. */
  | { type: 'gateOpen'; tube: 0 | 1 }
  /** The arm began to push the tower out of the tube: it is on the field from now. */
  | { type: 'towerOut'; tube: 0 | 1; medals: number }
  /** The arm let the tower go in its place, where it stands free. */
  | { type: 'towerSet'; tube: 0 | 1; medals: number }
  /** The arm is back in the tube and the gate began to slide shut. */
  | { type: 'gateShut'; tube: 0 | 1 };

/** What of a tube is remembered across a step, to tell what changed in it. */
interface TubeWatch {
  phase: TubePhase;
  clock: number;
  stacked: number;
  size: number;
  tower: number;
}

/** What of the payout works is remembered across a step, to tell what changed in it. */
export interface WorksWatch {
  /** The pours the hopper had begun, and whether it was in the middle of one: its doors dropping open, or open with medals coming. */
  pours: number;
  pouring: boolean;
  /** Towers the arms had begun to push out, and what each tube was doing. */
  made: number;
  tubes: readonly [TubeWatch, TubeWatch];
}

const NOTHING: WorksEvent[] = [];
/** The doors are out while they are dropping open or pouring: from the moment a pour begins until the last medal has gone. */
const out = (phase: DoorPhase): boolean => phase === 'opening' || phase === 'pouring';
/** Seconds into a tube's return that its gate begins to slide shut: the arm is back in. */
const GATE_SHUTS_AT = STACK.back * STACK.returns;

const watchTube = (tube: Tube): TubeWatch => ({ phase: tube.phase, clock: tube.clock, stacked: tube.stacked, size: tube.size, tower: tube.tower });

export const watchWorks = (machine: Pick<Machine, 'hopper' | 'stacker'>): WorksWatch => ({
  pours: machine.hopper.pours,
  pouring: out(machine.hopper.phase),
  made: machine.stacker.made,
  tubes: [watchTube(machine.stacker.tubes[0]), watchTube(machine.stacker.tubes[1])],
});

/**
 * What one tube did since `before` was taken, in the order it happened. Its
 * phases come round in one order, and a step of the session is far shorter
 * than any of them but stacking, so the phases it went through are the ones
 * between where it was and where it is. `medals` finds the tower an arm had,
 * which is a medal on the field.
 */
function tubeEvents(before: TubeWatch, tube: Tube, index: 0 | 1, medals: readonly Medal[], events: WorksEvent[]): void {
  const from = TUBE_PHASES.indexOf(before.phase);
  const to = TUBE_PHASES.indexOf(tube.phase);
  const stackOf = (id: number): number => medals.find((medal) => medal.id === id)?.stack ?? 0;
  // The tower that was in the tube or came into it in the step, as tall as it was built: where it is now says so.
  const built = before.size > 0 ? before.size : tube.phase === 'lowering' || tube.phase === 'opening' ? tube.size : tube.phase === 'pushing' ? stackOf(tube.tower) : 0;
  // Medals that landed on the stack: while it went on stacking, or before it went on to let the tower down.
  const landed = from === 0 ? (to === 0 ? tube.stacked - before.stacked : built - before.stacked) : 0;
  if (landed > 0) events.push({ type: 'stacked', tube: index, medals: landed });
  if (from === to) {
    if (tube.phase === 'returning' && before.clock < GATE_SHUTS_AT && tube.clock >= GATE_SHUTS_AT) events.push({ type: 'gateShut', tube: index });
    return;
  }
  for (let phase = (from + 1) % TUBE_PHASES.length; ; phase = (phase + 1) % TUBE_PHASES.length) {
    const entered = TUBE_PHASES[phase];
    if (entered === 'lowering') events.push({ type: 'towerDown', tube: index, medals: built });
    else if (entered === 'opening') events.push({ type: 'gateOpen', tube: index });
    else if (entered === 'pushing') events.push({ type: 'towerOut', tube: index, medals: built || stackOf(tube.tower) });
    else if (entered === 'returning') events.push({ type: 'towerSet', tube: index, medals: stackOf(before.tower) || built });
    else if (before.phase === 'returning' ? before.clock < GATE_SHUTS_AT : true) events.push({ type: 'gateShut', tube: index });
    if (phase === to) break;
  }
  if (tube.phase === 'returning' && tube.clock >= GATE_SHUTS_AT && !(before.phase === 'returning' && before.clock >= GATE_SHUTS_AT)) events.push({ type: 'gateShut', tube: index });
}

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
 * whose count is no longer written anywhere. The tubes are told phase by
 * phase, each tube's in the order it went through them.
 */
export function worksEvents(before: WorksWatch, machine: Pick<Machine, 'hopper' | 'stacker' | 'payoutQueue' | 'medals'>): readonly WorksEvent[] {
  const { hopper, stacker } = machine;
  const began = hopper.pours !== before.pours;
  const pouring = out(hopper.phase);
  const still = (index: 0 | 1): boolean => {
    const was = before.tubes[index];
    const tube = stacker.tubes[index];
    return was.phase === tube.phase && was.stacked === tube.stacked && (tube.phase === 'stacking' || tube.phase !== 'returning' || (was.clock < GATE_SHUTS_AT) === (tube.clock < GATE_SHUTS_AT));
  };
  if (!began && pouring === before.pouring && still(0) && still(1)) return NOTHING;
  const events: WorksEvent[] = [];
  if (began) events.push({ type: 'pourStart', medals: hopper.poured + (pouring ? machine.payoutQueue : 0) });
  if ((began || before.pouring) && !pouring) events.push({ type: 'pourEnd', medals: hopper.poured });
  tubeEvents(before.tubes[0], stacker.tubes[0], 0, machine.medals, events);
  tubeEvents(before.tubes[1], stacker.tubes[1], 1, machine.medals, events);
  return events;
}

/** Seconds a tube takes over a tower of `medals`, from the first medal dropping in until it can take the next: stacking it, letting it down, the gate, the arm, and back. */
export const towerTime = (medals: number): number => medals / STACK.perSecond + PHASE_TIME.lowering + PHASE_TIME.opening + PHASE_TIME.pushing + PHASE_TIME.returning;

/** How long the doors take over a pour of `medals`, from the moment they begin to open until they are shut again, in seconds. */
export const pourTime = (medals: number): number => POUR.opens + medals / POUR.perSecond + POUR.closes;
