import { describe, expect, it } from 'vitest';

import { HATCH } from '@/components/game/MedalPusher/arms';
import { FLAT_STRIDE, Flat, SHAPE, SOLID_STRIDE, Solid } from '@/components/game/MedalPusher/cabinet3d';
import {
  FIELD,
  MEDAL_RADIUS,
  MEDAL_THICKNESS,
  PUSHER,
  TOWER,
  buildTowers,
  createMachine,
  jewelsOnField,
  medalsOnField,
  pusherFront,
  queuePayout,
  step,
  towerSizes,
  type FallingMedal,
  type Machine,
  type Medal,
} from '@/components/game/MedalPusher/engine';
import { DOORS, POUR, channelX, shutHopper } from '@/components/game/MedalPusher/hopper';
import { LIFT, holds, stands, startLift, type Lift } from '@/components/game/MedalPusher/lift';
import { BOARD, CHAIN_GOAL, CHESTS, FEVER_SQUARE, JACKPOT_START, JEWEL, pouredOf } from '@/components/game/MedalPusher/lottery';
import { bowlPrizeUp } from '@/components/game/MedalPusher/PlayTab';
import { BEAD, BEAD_STRIDE, LANDED, MEDAL_STRIDE, createRows, writeMedals } from '@/components/game/MedalPusher/scene3d';
import { BOWL_TIMES, TIMING, advance, bowlShowTime, createSession, isBusy, sugorokuDuration, type Session, type SessionEvent } from '@/components/game/MedalPusher/session';
import { HEIGHT, HOUSING, VIEW, project, type Projected } from '@/components/game/MedalPusher/view';
import {
  CHUTE_SLOPE,
  DECK,
  DECK_HATCH,
  DOOR,
  GUARD,
  HATCHES,
  POUR_WAY,
  RIPPLE,
  chuteShows,
  doorLampLit,
  doorOf,
  doorSwing,
  hatchViews,
  lampGlow,
  liftView,
  liftViews,
  offLifts,
  onFlap,
  onLift,
  pourPose,
  pourTime,
  rippleLead,
  watchWorks,
  worksEvents,
} from '@/components/game/MedalPusher/works';
import { drawHatches, drawHopper, drawLifts, roundness } from '@/components/game/MedalPusher/works2d';
import { WORKS_PARTS, buildWorks, hatchSteel } from '@/components/game/MedalPusher/works3d';
import { getWorksStrings } from '@/components/game/MedalPusher/worksStrings';

const DT = 1 / 60;

/** A machine that has been run until `when` says. */
function runUntil(machine: Machine, when: (machine: Machine) => boolean, most = 20): Machine {
  for (let i = 0; i < most * 60 && !when(machine); i++) step(machine, DT);
  return machine;
}

/** A machine in the middle of pouring a prize. */
const pouring = (prize = 90): Machine => {
  const machine = createMachine(7);
  queuePayout(machine, prize);
  return runUntil(machine, (m) => m.hopper.phase === 'pouring' && m.hopper.poured >= 30);
};

/** A poured medal `t` of its way down: from the first channel to the middle of its part of the band. */
const pouredAt = (t: number, more: Partial<FallingMedal> = {}): FallingMedal => ({
  id: 4,
  x: 22,
  y: 9,
  level: 1,
  fromX: channelX(0),
  fromY: 1.2,
  rank: 0,
  ball: false,
  remaining: POUR.fall * (1 - t),
  duration: POUR.fall,
  source: 'pour',
  ...more,
});

describe('the hopper’s doors in the cabinet', () => {
  it('are in the hood’s face, over its lit lip and under its bulbs, clear of the ball hatch', () => {
    expect(DOOR.foot).toBeGreaterThan(HOUSING.hood + 1);
    expect(DOOR.foot + DOOR.tall).toBeLessThan((HOUSING.hood + HEIGHT.top) / 2 + 1.6 - 0.8);
    expect(DOOR.face).toBeGreaterThan(HOUSING.out);
    expect(DOOR.face).toBeLessThan(HOUSING.out + 0.2);
    for (const door of DOORS) {
      const nearest = Math.min(Math.abs(door.from - HATCH.x), Math.abs(door.to - HATCH.x));
      expect(nearest).toBeGreaterThan(HATCH.radius);
    }
  });

  it('swing down from upright about the hinge along their foot, past level, so that a medal slides off', () => {
    // Shut: upright in the face.
    expect(onFlap(0, 0)).toEqual({ height: DOOR.foot, depth: DOOR.face });
    expect(onFlap(0, 1).height).toBeCloseTo(DOOR.foot + DOOR.tall, 12);
    expect(onFlap(0, 1).depth).toBeCloseTo(DOOR.face, 12);
    // Open: the hinge has not moved, and the free edge is out over the field and lower than the hinge.
    expect(onFlap(DOOR.swing, 0)).toEqual({ height: DOOR.foot, depth: DOOR.face });
    const edge = onFlap(DOOR.swing, 1);
    expect(edge.depth).toBeGreaterThan(DOOR.face + 3.5);
    expect(edge.height).toBeLessThan(DOOR.foot - 1);
    expect(Math.hypot(edge.height - DOOR.foot, edge.depth - DOOR.face)).toBeCloseTo(DOOR.tall, 9);
    expect(CHUTE_SLOPE).toBeGreaterThan(0.25);
    expect(CHUTE_SLOPE).toBeLessThan(0.6);
    // The inner side, which the channels are on, is off the flap toward the wall while it is shut and upward once it is down.
    expect(onFlap(0, 0.5, 1).depth).toBeLessThan(DOOR.face);
    expect(onFlap(DOOR.swing, 0.5, 1).height).toBeGreaterThan(onFlap(DOOR.swing, 0.5).height);
    // The camera sees the plate while the door is up and the chute once it is down.
    expect(chuteShows(0)).toBe(false);
    expect(chuteShows(0.6)).toBe(false);
    expect(chuteShows(DOOR.swing)).toBe(true);
  });

  it('are as far open as the hopper says, eased; with reduced motion they are open or shut', () => {
    const machine = createMachine(7);
    expect(doorSwing(machine)).toBe(0);
    expect(doorLampLit(machine)).toBe(false);
    queuePayout(machine, 60);
    runUntil(machine, (m) => m.hopper.phase === 'opening' && m.hopper.clock >= POUR.opens / 2);
    const half = doorSwing(machine);
    expect(half).toBeGreaterThan(DOOR.swing * 0.35);
    expect(half).toBeLessThan(DOOR.swing * 0.75);
    expect(doorSwing(machine, true)).toBe(DOOR.swing);
    expect(doorLampLit(machine)).toBe(true);
    runUntil(machine, (m) => m.hopper.phase === 'pouring');
    expect(doorSwing(machine)).toBe(DOOR.swing);
    runUntil(machine, (m) => m.hopper.phase === 'closing' && m.hopper.clock >= POUR.closes / 2);
    expect(doorSwing(machine)).toBeGreaterThan(0);
    expect(doorSwing(machine)).toBeLessThan(DOOR.swing);
    expect(doorLampLit(machine)).toBe(true);
    runUntil(machine, (m) => m.hopper.phase === 'shut');
    expect(doorSwing(machine)).toBe(0);
    expect(doorSwing(machine, true)).toBe(0);
    expect(doorLampLit(machine)).toBe(false);
  });
});

describe('the way a poured medal takes', () => {
  it('starts in the mouth of its door, slides down its channel and leaves by the edge of the flap', () => {
    const start = pourPose(pouredAt(0), LANDED);
    expect(start.x).toBe(channelX(0));
    expect(start.depth).toBeGreaterThan(DOOR.face);
    expect(start.depth).toBeLessThan(DOOR.face + 1);
    expect(start.height).toBeGreaterThan(DOOR.foot - 0.5);
    expect(start.shown).toBe(0);
    expect(start.tilt).toBe(CHUTE_SLOPE);
    // It comes out of the dark, and it goes faster and faster down the chute.
    const early = pourPose(pouredAt(POUR_WAY.slide * 0.25), LANDED);
    const mid = pourPose(pouredAt(POUR_WAY.slide * 0.5), LANDED);
    const late = pourPose(pouredAt(POUR_WAY.slide * 0.75), LANDED);
    expect(early.shown).toBeGreaterThan(0);
    expect(mid.shown).toBe(1);
    expect(late.depth - mid.depth).toBeGreaterThan(mid.depth - early.depth);
    expect([early.x, mid.x, late.x]).toEqual([channelX(0), channelX(0), channelX(0)]);
    // Off the edge, where the fall begins.
    const edge = onFlap(DOOR.swing, 1, MEDAL_THICKNESS * 0.6);
    const off = pourPose(pouredAt(POUR_WAY.slide), LANDED);
    expect(off.height).toBeCloseTo(edge.height, 9);
    expect(off.depth).toBeCloseTo(edge.depth, 9);
    expect(doorOf(channelX(0))).toBe(0);
    expect(doorOf(channelX(5))).toBe(1);
  });

  it('falls to where it lands, turning over once, and lands flat with one short hop', () => {
    let last = Infinity;
    for (let i = 0; i <= 20; i++) {
      const t = POUR_WAY.slide + ((POUR_WAY.bounce - POUR_WAY.slide) * i) / 20;
      const pose = pourPose(pouredAt(t), LANDED);
      expect(pose.height).toBeLessThanOrEqual(last);
      last = pose.height;
    }
    const down = pourPose(pouredAt(POUR_WAY.bounce), LANDED);
    expect(down).toMatchObject({ x: 22, depth: 9, shown: 1 });
    expect(down.height).toBeCloseTo(LANDED, 9);
    // One whole turn in the air: flat again as it touches.
    expect(pourPose(pouredAt(POUR_WAY.bounce - 1e-9), LANDED).tilt).toBeCloseTo(Math.PI * 2, 6);
    const top = pourPose(pouredAt((POUR_WAY.bounce + 1) / 2), LANDED);
    expect(top.height).toBeCloseTo(LANDED + POUR_WAY.hop, 6);
    expect(Math.abs(top.tilt)).toBeLessThan(0.3);
    const end = pourPose(pouredAt(1), LANDED);
    expect(end.height).toBeCloseTo(LANDED, 9);
    expect(end.tilt).toBeCloseTo(0, 9);
    expect(end).toMatchObject({ x: 22, depth: 9 });
  });

  it('with reduced motion comes straight down: no turn and no hop, and it arrives at the same moment', () => {
    for (let i = 0; i <= 10; i++) {
      const t = POUR_WAY.slide + ((1 - POUR_WAY.slide) * i) / 10;
      const pose = pourPose(pouredAt(t), LANDED, true);
      expect(pose.height).toBeGreaterThanOrEqual(LANDED - 1e-9);
      expect(pose.tilt).toBeLessThanOrEqual(CHUTE_SLOPE + 1e-9);
      expect(pose.tilt).toBeGreaterThanOrEqual(-1e-9);
    }
    const end = pourPose(pouredAt(1), LANDED, true);
    expect(end.height).toBeCloseTo(LANDED, 9);
    expect(end.tilt).toBeCloseTo(0, 9);
    expect(end).toMatchObject({ x: 22, depth: 9 });
  });
});

describe('a lift as it is drawn', () => {
  const T = MEDAL_THICKNESS;
  /** A tower of 20 going up over the hatch at `x`, a middle one unless told, with `stack` of its medals up. */
  const towerAt = (stack: number, x = 43): Medal => ({ id: 5, x, y: 21, level: 1, tier: 0, sinceDrop: -1, stack, grow: 20 - stack, ball: false, grown: 1 });
  /** Its lift, at a moment of its own: `wait` seconds from its first medal, or `sunk` on its second clock. */
  const liftAt = (more: Partial<Lift>, x = 43): Lift => ({ ...startLift(towerAt(1, x), 30), ...more });
  const FULL = 20 * T + GUARD.over;

  it('has a sleeve as high as its tower will be and a little over: down while the hatch opens, up while it holds the tower, sinking once it has let it go', () => {
    const machine = createMachine(13);
    expect(liftViews(machine, pusherFront(machine.time))).toEqual([]);
    buildTowers(machine, 60);
    const front = () => pusherFront(machine.time);
    const start = liftViews(machine, front());
    expect(start).toHaveLength(3);
    for (const view of start) {
      expect(view).toMatchObject({ rim: 0, working: true, full: FULL, size: 20, doors: 0, lamps: 0, light: 0, building: false });
      expect(view.tower).toMatchObject({ id: view.id, x: view.x, y: view.y, stack: 1 });
      // The first medal waits down the shaft.
      expect(view.top).toBeCloseTo(-DECK_HATCH.down, 12);
    }
    // Back to front.
    expect(start.map((view) => view.y)).toEqual([...start.map((view) => view.y)].sort((a, b) => a - b));
    runUntil(machine, (m) => m.lifts[0].wait === 0);
    const up = liftViews(machine, front());
    for (const view of up) {
      expect(view.rim).toBeCloseTo(view.full, 9);
      expect(view.full).toBeGreaterThan(TOWER.max * MEDAL_THICKNESS * 0.7);
      expect(view.y).toBeCloseTo((view.tower as Medal).y, 6);
      expect(view).toMatchObject({ doors: 1, lamps: 1, light: 1 });
      // Its first medal is level with the deck, in the mouth of the hatch.
      expect(view.top).toBeCloseTo(0, 9);
    }
    // While it is built the tower's top rises a medal's thickness for every medal, and never goes back.
    let last = 0;
    while (!stands(machine.lifts[0])) {
      step(machine, DT);
      const [view] = liftViews(machine, front());
      expect(view.top).toBeGreaterThanOrEqual(last - 1e-9);
      expect(view.top - last).toBeLessThan(T * TOWER.perSecond * DT * 1.5 + 1e-9);
      expect(view.top).toBeLessThanOrEqual((view.tower as Medal).stack * T + 1e-9);
      last = view.top;
    }
    // Its last medal comes up flush while it stands, and it is let go standing on the deck.
    runUntil(machine, (m) => m.lifts.every((lift) => !holds(lift) || lift.sunk > -2 * DT));
    for (const view of liftViews(machine, front())) if (view.tower) expect(view.top).toBeCloseTo(20 * T, 9);
    runUntil(machine, (m) => m.lifts.every((lift) => !holds(lift)) && m.lifts[0].sunk > LIFT.sinks / 2 && m.lifts[0].sunk < LIFT.sinks - RIPPLE);
    const sinking = liftViews(machine, front());
    for (const view of sinking) {
      expect(view.working).toBe(false);
      expect(view.tower).toBeUndefined();
      expect(view.rim).toBeGreaterThan(0);
      expect(view.rim).toBeLessThan(view.full);
    }
    // With reduced motion a sleeve is up or it is not.
    expect(liftViews(machine, front(), true).every((view) => view.rim === 0)).toBe(true);
    runUntil(machine, (m) => m.lifts.length === 0);
    expect(liftViews(machine, front())).toEqual([]);
    expect(GUARD.radius).toBe(MEDAL_RADIUS + LIFT.wall);
    expect(DECK).toBe(HEIGHT.pusher);
  });

  it('goes through its stages in order: lamps, doors, guard and the first medal coming up into the light, each hatch in its turn', () => {
    // A middle hatch is the first of its row, and its turn comes the moment the prize is paid.
    expect([rippleLead(43), rippleLead(57), rippleLead(29), rippleLead(71), rippleLead(15), rippleLead(85)]).toEqual([RIPPLE, RIPPLE, LIFT.ripple, LIFT.ripple, 0, 0]);
    expect(RIPPLE).toBeCloseTo(2 * LIFT.ripple, 12);
    const at = (since: number, x = 43) => liftView(liftAt({ wait: LIFT.opens - since }, x), towerAt(1, x), 0, 30);
    // The ring of light comes on, round from the back.
    expect(at(LIFT.lamps / 2)).toMatchObject({ doors: 0, rim: 0, light: 0 });
    expect(at(LIFT.lamps / 2).lamps).toBeCloseTo(0.5, 9);
    // Then the doors slide apart.
    const parting = at(LIFT.lamps + LIFT.doors / 2);
    expect(parting.lamps).toBe(1);
    expect(parting.doors).toBeCloseTo(0.5, 9);
    expect([parting.rim, parting.light]).toEqual([0, 0]);
    // Then the guard rises, and the first medal comes up the shaft into the light with it.
    const rising = at(LIFT.lamps + LIFT.doors + LIFT.rises / 2);
    expect(rising.doors).toBeCloseTo(1, 9);
    expect(rising.rim).toBeCloseTo(FULL / 2, 9);
    expect(rising.top).toBeCloseTo(-DECK_HATCH.down / 2, 9);
    expect(rising.light).toBeCloseTo(0.5, 9);
    const ready = at(LIFT.lamps + LIFT.doors + LIFT.rises);
    expect(ready.rim).toBeCloseTo(FULL, 9);
    expect(ready.top).toBeCloseTo(0, 9);
    expect(ready.light).toBeCloseTo(1, 9);
    expect(ready.building).toBe(false);
    // The outermost hatch of the row does the same things two steps of the ripple later, and is ready as the first medal comes.
    expect(at(RIPPLE, 15)).toMatchObject({ lamps: 0, doors: 0, rim: 0 });
    expect(at(RIPPLE + LIFT.lamps / 2, 15).lamps).toBeCloseTo(0.5, 9);
    expect(at(RIPPLE + LIFT.lamps + LIFT.doors / 2, 15).doors).toBeCloseTo(0.5, 9);
    expect(at(LIFT.opens, 15).rim).toBeCloseTo(FULL, 9);
    expect(at(LIFT.opens - LIFT.rises / 2, 15).rim).toBeCloseTo(FULL / 2, 9);
    // Each place of a row is one step behind the one inside it.
    expect(at(LIFT.ripple + LIFT.lamps / 2, 71).lamps).toBeCloseTo(0.5, 9);
    expect(at(LIFT.ripple + LIFT.lamps / 2, 29).lamps).toBeCloseTo(0.5, 9);
  });

  it('brings the tower up at an even pace, a medal lifting the ones above it, seats the last one while it stands, then sinks and shuts', () => {
    // Seven medals up and a quarter of the eighth: the top is where six and a quarter would stand, since the first began level with the deck.
    const building = liftView(liftAt({ wait: 0 }), towerAt(7), 0.25, 30);
    expect(building).toMatchObject({ doors: 1, lamps: 1, light: 1, building: true, working: true, rim: FULL });
    expect(building.top).toBeCloseTo(6.25 * T, 12);
    expect(liftView(liftAt({ wait: 0 }), towerAt(7), 0, 30).top).toBeCloseTo(6 * T, 12);
    expect(liftView(liftAt({ wait: 0 }), towerAt(8), 0, 30).top).toBeCloseTo(7 * T, 12);
    // Standing: the last medal comes up over a medal's time, and the tower then stands as tall as it is.
    const standing = (since: number) => liftView(liftAt({ wait: 0, sunk: -LIFT.stands + since }), towerAt(20), 0, 30);
    expect(standing(0).top).toBeCloseTo(19 * T, 12);
    expect(standing(0.5 / TOWER.perSecond).top).toBeCloseTo(19.5 * T, 9);
    expect(standing(1 / TOWER.perSecond).top).toBeCloseTo(20 * T, 9);
    expect(standing(LIFT.stands - 0.001).top).toBeCloseTo(20 * T, 9);
    expect(standing(0)).toMatchObject({ building: false, working: true, doors: 1, lamps: 1 });
    // A middle guard begins to sink while its tower still stands, the ripple's reach before it is let go; the outermost as it is let go.
    expect(standing(LIFT.stands - RIPPLE).rim).toBeCloseTo(FULL, 9);
    expect(standing(LIFT.stands - RIPPLE / 2).rim).toBeLessThan(FULL);
    expect(liftView(liftAt({ wait: 0, sunk: -RIPPLE / 2 }, 15), towerAt(20, 15), 0, 30).rim).toBeCloseTo(FULL, 9);
    // Let go, the lift no longer has the tower: the guard goes down, then the hatch closes and its lamps go out.
    const after = (sunk: number, x = 15) => liftView(liftAt({ wait: 0, sunk }, x), undefined, 0, 30);
    expect(after(LIFT.sinks / 2)).toMatchObject({ working: false, tower: undefined, doors: 1, lamps: 1 });
    expect(after(LIFT.sinks / 2).rim).toBeCloseTo(FULL / 2, 9);
    expect(after(LIFT.sinks).rim).toBeCloseTo(0, 9);
    const shutting = after(LIFT.sinks + LIFT.shuts / 2);
    expect([shutting.rim, shutting.doors, shutting.lamps].map((n) => Number(n.toFixed(9)))).toEqual([0, 0.5, 0.5]);
    expect(after(LIFT.closes)).toMatchObject({ rim: 0, doors: 0, lamps: 0 });
    // The middle ones are that much ahead all the way down.
    expect(after(LIFT.sinks / 2 - RIPPLE, 43).rim).toBeCloseTo(FULL / 2, 9);
    expect(after(LIFT.closes - RIPPLE, 43).doors).toBeCloseTo(0, 9);
  });

  it('with reduced motion moves nothing: each part is where it was or where it is going, in the same order, and the tower gains whole medals', () => {
    const calm = (more: Partial<Lift>, stack = 1, x = 43) => liftView(liftAt(more, x), towerAt(stack, x), 0.6, 30, true);
    // Lamps at once; the doors open on the dark shaft when the lamps' time is up; the guard is up, and the first
    // medal seen in the mouth, when their time is up; no ripple.
    expect(calm({})).toMatchObject({ lamps: 1, doors: 0, rim: 0, light: 0 });
    expect(calm({ wait: LIFT.opens - LIFT.lamps - 0.01 })).toMatchObject({ doors: 1, rim: 0, light: 0, top: 0 });
    expect(calm({ wait: LIFT.opens - LIFT.lamps - 0.01 }, 1, 15)).toMatchObject({ doors: 1, rim: 0, light: 0 });
    expect(calm({ wait: 0.01 })).toMatchObject({ doors: 1, rim: 0, light: 0 });
    expect(calm({ wait: 0 })).toMatchObject({ doors: 1, rim: FULL, light: 1, building: true });
    // The tower stands on the deck as many medals high as it has, whatever part of the next has come.
    expect(calm({ wait: 0 }, 7).top).toBe(7 * T);
    expect(calm({ wait: 0, sunk: -LIFT.stands }, 20).top).toBe(20 * T);
    // The guard is up for as long as the tower is held, down at once when it is let go, and the hatch shut when its time is up.
    expect(calm({ wait: 0, sunk: -0.01 }, 20).rim).toBe(FULL);
    const after = (sunk: number) => liftView(liftAt({ wait: 0, sunk }), undefined, 0, 30, true);
    expect(after(0.01)).toMatchObject({ rim: 0, doors: 1, lamps: 0 });
    expect(after(LIFT.sinks + LIFT.shuts / 2)).toMatchObject({ rim: 0, doors: 1 });
    expect(after(LIFT.closes)).toMatchObject({ rim: 0, doors: 0 });
  });

  it('has a hatch in the deck under every place a tower can stand, at rest or at work', () => {
    // The hatches are where the machine puts towers: fill every place and there is a lift at each.
    const machine = createMachine(13);
    const front = pusherFront(machine.time);
    buildTowers(machine, HATCHES.length * TOWER.max);
    const places = (list: readonly { x: number; behind: number }[]) => list.map(({ x, behind }) => `${x.toFixed(6)}:${behind.toFixed(6)}`).sort();
    expect(HATCHES).toHaveLength(TOWER.perRow * TOWER.rows.length);
    expect(places(machine.lifts)).toEqual(places(HATCHES));
    // At rest every one is shut and dark.
    const rest = hatchViews([], front);
    expect(rest).toHaveLength(HATCHES.length);
    expect(rest.every((hatch) => hatch.doors === 0 && hatch.lamps === 0 && !hatch.chase)).toBe(true);
    expect(rest.map((hatch) => hatch.y)).toEqual(HATCHES.map(({ behind }) => front - behind));
    // At work, the hatch a lift is under is as far open as the lift has it, and no hatch is added for it.
    const some = createMachine(13);
    buildTowers(some, 60);
    runUntil(some, (m) => m.lifts[0].wait === 0 && (m.medals.find((medal) => medal.id === m.lifts[0].id) as Medal).stack > 3);
    const now = pusherFront(some.time);
    const views = liftViews(some, now);
    const hatches = hatchViews(views, now);
    expect(hatches).toHaveLength(HATCHES.length);
    const open = hatches.filter((hatch) => hatch.doors === 1);
    expect(open.map((hatch) => hatch.x).sort((a, b) => a - b)).toEqual(views.map((view) => view.x).sort((a, b) => a - b));
    expect(open.every((hatch) => hatch.lamps === 1 && hatch.chase)).toBe(true);
    // A lift that is at work anywhere else, as a machine put together by hand may have, has a hatch where it is.
    const odd = liftView({ id: 9, x: 50, behind: 12.5, size: 10, wait: 0, sunk: -1 }, undefined, 0, now);
    expect(hatchViews([odd], now)).toHaveLength(HATCHES.length + 1);
    // The deck's own hatches come first, in the order of their places, whatever else is in the list: the 3D scene counts on it.
    for (const list of [rest, hatches, hatchViews([odd], now)]) {
      const at = list === rest ? front : now;
      expect(list.slice(0, HATCHES.length).map(({ x, y }) => [x, y])).toEqual(HATCHES.map(({ x, behind }) => [x, at - behind]));
    }
    // The mouth is a little wider than a medal and inside the sleeve. The collar round it is the lamp, and the sleeve
    // stands in it: what lies against a guard covers the outer part of the ring and leaves the inner part lit.
    expect(DECK_HATCH.radius).toBeGreaterThan(MEDAL_RADIUS);
    expect(DECK_HATCH.radius).toBeLessThan(GUARD.radius);
    expect(DECK_HATCH.collar).toBe(GUARD.radius + GUARD.ring);
    expect(GUARD.radius - DECK_HATCH.radius).toBeGreaterThan(0.3);
  });

  it('has a ring of light that is seen on a phone: about twenty pixels across and two wide, wherever its hatch rides', () => {
    // On a page 375 px wide the field is 345 px wide, so a pixel of the drawing is a little over half a pixel of the phone.
    const phone = 345 / VIEW.width;
    for (const { x, behind } of HATCHES) {
      for (const front of [PUSHER.min, PUSHER.max]) {
        const at = project(x, DECK, front - behind);
        const across = 2 * DECK_HATCH.collar * at.scale * phone;
        const band = (DECK_HATCH.collar - DECK_HATCH.radius) * at.scale * phone;
        expect(across).toBeGreaterThan(19.5);
        expect(across).toBeLessThan(22);
        expect(across * at.tilt).toBeGreaterThan(10.5);
        expect(band).toBeGreaterThan(1.9);
        // With the light it throws it is some 26 across. One of the eight bulbs it took the place of was a pixel and a half.
        expect(2 * (DECK_HATCH.collar + DECK_HATCH.glow) * at.scale * phone).toBeGreaterThan(25.5);
        expect(0.6 * at.scale * phone).toBeLessThan(1.6);
      }
    }
  });

  it('lights its ring an arc at a time, from the back round, and runs the light round it while a tower comes up', () => {
    // The ring is drawn in halves, the far one and the near one, and in quarters from the back.
    expect(DECK_HATCH.lamps % 4).toBe(0);
    const half = { lamps: 0.5, chase: false };
    expect(Array.from({ length: DECK_HATCH.lamps }, (_, index) => lampGlow(half, index, 3))).toEqual([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
    expect(lampGlow({ lamps: 6.5 / DECK_HATCH.lamps, chase: false }, 6, 3)).toBeCloseTo(0.5, 12);
    // Running: every arc stays lit, each brightest in its turn, and the light is back where it began after a turn.
    const running = { lamps: 1, chase: true };
    for (let index = 0; index < DECK_HATCH.lamps; index++) {
      const glow = lampGlow(running, index, 0.37);
      expect(glow).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(glow).toBeLessThanOrEqual(1 + 1e-9);
      expect(lampGlow(running, index, 0.37 + 1 / DECK_HATCH.chase)).toBeCloseTo(glow, 9);
      expect(lampGlow(running, index, index / DECK_HATCH.lamps / DECK_HATCH.chase)).toBeCloseTo(1, 9);
      // With reduced motion a lit arc is simply lit.
      expect(lampGlow(running, index, 0.37, true)).toBe(1);
    }
    expect(lampGlow({ lamps: 0, chase: true }, 0, 1)).toBe(0);
  });

  it('says which towers a lift still holds, so that whoever draws the towers leaves those to it', () => {
    const machine = createMachine(13);
    const lying = machine.medals.filter((medal) => medal.level === 1);
    // No lift at work: the list itself.
    expect(offLifts(machine, lying)).toBe(lying);
    buildTowers(machine, 60);
    const upper = machine.medals.filter((medal) => medal.level === 1);
    const held = machine.lifts.map((lift) => lift.id);
    expect(upper.filter((medal) => onLift(machine, medal)).map((medal) => medal.id)).toEqual(held);
    expect(offLifts(machine, upper)).toHaveLength(upper.length - 3);
    // Let go, they are towers like any other.
    runUntil(machine, (m) => m.lifts.length > 0 && m.lifts.every((lift) => !holds(lift)));
    const after = machine.medals.filter((medal) => medal.level === 1);
    expect(machine.lifts.length).toBe(3);
    expect(after.some((medal) => onLift(machine, medal))).toBe(false);
    expect(offLifts(machine, after)).toBe(after);
  });
});

describe('what the session reports of the payout works', () => {
  const of = <T extends SessionEvent['type']>(events: SessionEvent[], type: T) => events.filter((event): event is Extract<SessionEvent, { type: T }> => event.type === type);

  it('says when the doors open and when the last medal has gone, once each, with how many', () => {
    const session = createSession(5, { balls: 0 });
    const events: SessionEvent[] = [];
    queuePayout(session.machine, 60);
    advance(session, DT, events);
    expect(of(events, 'pourStart')).toEqual([{ type: 'pourStart', medals: 60 }]);
    expect(isBusy(session)).toBe(true);
    for (let i = 0; i < 600 && session.machine.hopper.phase !== 'shut'; i++) advance(session, DT, events);
    expect(of(events, 'pourStart')).toHaveLength(1);
    expect(of(events, 'pourEnd')).toEqual([{ type: 'pourEnd', medals: 60 }]);
    expect(events.findIndex((event) => event.type === 'pourEnd')).toBeGreaterThan(events.findIndex((event) => event.type === 'pourStart'));
    // The doors take the time a pour of sixty takes.
    expect(session.machine.time).toBeGreaterThan(pourTime(60) - 0.1);
    // A small win is thrown from the slot and reports nothing.
    events.length = 0;
    queuePayout(session.machine, POUR.threshold - 1);
    for (let i = 0; i < 600 && session.machine.payoutQueue > 0; i++) advance(session, DT, events);
    expect(of(events, 'pourStart')).toEqual([]);
    expect(of(events, 'pourEnd')).toEqual([]);
  });

  it('reports a whole pour that happens within one long step, by what was poured', () => {
    const session = createSession(5, { balls: 0 });
    const events: SessionEvent[] = [];
    queuePayout(session.machine, 45);
    advance(session, 4, events);
    expect(of(events, 'pourStart')).toEqual([{ type: 'pourStart', medals: 45 }]);
    expect(of(events, 'pourEnd')).toEqual([{ type: 'pourEnd', medals: 45 }]);
  });

  it('reports a second whole pour within one long step, though it is exactly as big as the one before it', () => {
    const session = createSession(5, { balls: 0 });
    const first: SessionEvent[] = [];
    queuePayout(session.machine, 45);
    advance(session, 4, first);
    expect(session.machine.hopper).toEqual({ phase: 'shut', clock: 0, pours: 1, poured: 45 });
    // The doors stand shut having poured forty-five, before this step and after it. Only the hopper's count of its pours has moved.
    const second: SessionEvent[] = [];
    queuePayout(session.machine, 45);
    const before = watchWorks(session.machine);
    advance(session, 4, second);
    expect(session.machine.hopper).toEqual({ phase: 'shut', clock: 0, pours: 2, poured: 45 });
    expect(of(second, 'pourStart')).toEqual([{ type: 'pourStart', medals: 45 }]);
    expect(of(second, 'pourEnd')).toEqual([{ type: 'pourEnd', medals: 45 }]);
    expect(second.findIndex((event) => event.type === 'pourEnd')).toBeGreaterThan(second.findIndex((event) => event.type === 'pourStart'));
    expect(worksEvents(before, session.machine)).toEqual([
      { type: 'pourStart', medals: 45 },
      { type: 'pourEnd', medals: 45 },
    ]);
    // A long step in which nothing is poured still says nothing.
    const third: SessionEvent[] = [];
    advance(session, 4, third);
    expect(of(third, 'pourStart')).toEqual([]);
    expect(of(third, 'pourEnd')).toEqual([]);
  });

  it('says how many are waiting, and no more, when another big prize comes as the doors are being drawn shut', () => {
    const session = createSession(5, { balls: 0 });
    const events: SessionEvent[] = [];
    queuePayout(session.machine, POUR.threshold);
    for (let i = 0; i < 600 && !(session.machine.hopper.phase === 'closing' && session.machine.hopper.clock >= POUR.closes / 3); i++) advance(session, DT, events);
    expect(session.machine.hopper.phase).toBe('closing');
    expect(events.filter((event) => event.type === 'pourStart' || event.type === 'pourEnd')).toEqual([
      { type: 'pourStart', medals: POUR.threshold },
      { type: 'pourEnd', medals: POUR.threshold },
    ]);
    // Thirty more: thirty are waiting, not the thirty that have gone and these thirty.
    events.length = 0;
    queuePayout(session.machine, POUR.threshold);
    advance(session, DT, events);
    expect(session.machine.hopper.phase).toBe('opening');
    expect(of(events, 'pourStart')).toEqual([{ type: 'pourStart', medals: POUR.threshold }]);
    expect(of(events, 'pourEnd')).toEqual([]);
    for (let i = 0; i < 600 && session.machine.hopper.phase !== 'shut'; i++) advance(session, DT, events);
    expect(of(events, 'pourStart')).toHaveLength(1);
    expect(of(events, 'pourEnd')).toEqual([{ type: 'pourEnd', medals: POUR.threshold }]);
    // Sixty were paid and sixty were said to be poured, thirty at a time.
    expect(session.machine.hopper).toEqual({ phase: 'shut', clock: 0, pours: 2, poured: POUR.threshold });
  });

  it('says the same of a prize that comes as the doors are being drawn shut and is poured within one long step', () => {
    const session = createSession(5, { balls: 0 });
    queuePayout(session.machine, POUR.threshold);
    for (let i = 0; i < 600 && session.machine.hopper.phase !== 'closing'; i++) advance(session, DT);
    expect(session.machine.hopper.phase).toBe('closing');
    const events: SessionEvent[] = [];
    queuePayout(session.machine, POUR.threshold + 6);
    advance(session, 4, events);
    expect(session.machine.hopper.phase).toBe('shut');
    expect(events.filter((event) => event.type === 'pourStart' || event.type === 'pourEnd')).toEqual([
      { type: 'pourStart', medals: POUR.threshold + 6 },
      { type: 'pourEnd', medals: POUR.threshold + 6 },
    ]);
  });

  it('counts what is paid while the doors are out with the pour it joins', () => {
    const session = createSession(5, { balls: 0 });
    const events: SessionEvent[] = [];
    queuePayout(session.machine, 40);
    for (let i = 0; i < 600 && session.machine.hopper.phase !== 'pouring'; i++) advance(session, DT, events);
    queuePayout(session.machine, 5);
    for (let i = 0; i < 600 && session.machine.hopper.phase !== 'shut'; i++) advance(session, DT, events);
    expect(of(events, 'pourStart')).toEqual([{ type: 'pourStart', medals: 40 }]);
    expect(of(events, 'pourEnd')).toEqual([{ type: 'pourEnd', medals: 45 }]);
  });

  it('says when towers start up on their lifts and when they stand built', () => {
    const session = createSession(5, { balls: 0 });
    const events: SessionEvent[] = [];
    // A prize is paid in the middle of a step, so the lifts are told by looking before and after.
    const before = watchWorks(session.machine);
    buildTowers(session.machine, 50);
    expect(worksEvents(before, session.machine)).toEqual([{ type: 'towersRise', towers: 2, medals: 50 }]);
    // The machine is busy for as long as a lift is at work, the guards' way down included.
    const told: { type: string; at: number }[] = [];
    for (let i = 0; i < 900 && session.machine.lifts.length > 0; i++) {
      expect(isBusy(session)).toBe(true);
      const step: SessionEvent[] = [];
      advance(session, DT, step);
      for (const event of step) if (event.type === 'guardsRise' || event.type === 'towersReady') told.push({ type: event.type, at: (i + 1) * DT });
      events.push(...step);
    }
    expect(session.machine.lifts).toEqual([]);
    // They were at work already when the first of these steps began, so they are not said to start again.
    expect(of(events, 'towersRise')).toEqual([]);
    // Their guards are said to rise once, both together since both are middle hatches, when the lamps and the doors have had their time.
    expect(of(events, 'guardsRise')).toEqual([{ type: 'guardsRise', towers: 2 }]);
    expect(of(events, 'towersReady')).toEqual([{ type: 'towersReady', towers: 2 }]);
    expect(told.map((one) => one.type)).toEqual(['guardsRise', 'towersReady']);
    expect(Math.abs(told[0].at - (LIFT.lamps + LIFT.doors))).toBeLessThanOrEqual(2 * DT);
    // And they stand built, and are let go, a medal's time for each medal and a moment's standing after the first came up.
    expect(Math.abs(told[1].at - (LIFT.opens + 24 / TOWER.perSecond + LIFT.stands))).toBeLessThanOrEqual(3 * DT);
  });

  it('says the guards of a whole row rise in the ripple: the middle two, then the next two, then the outermost', () => {
    const session = createSession(5, { balls: 0 });
    buildTowers(session.machine, 150);
    const told: { towers: number; at: number }[] = [];
    for (let i = 0; i < 120; i++) {
      const step: SessionEvent[] = [];
      advance(session, DT, step);
      for (const event of step) if (event.type === 'guardsRise') told.push({ towers: event.towers, at: (i + 1) * DT });
    }
    expect(told.map((one) => one.towers)).toEqual([2, 2, 2]);
    told.forEach((one, place) => expect(Math.abs(one.at - (LIFT.lamps + LIFT.doors + place * LIFT.ripple))).toBeLessThanOrEqual(2 * DT));
  });

  it('says a lift that starts and has its guard up within one long step has done both, and one found at work has done neither', () => {
    const session = createSession(5, { balls: 0 });
    const before = watchWorks(session.machine);
    buildTowers(session.machine, 50);
    for (let i = 0; i < 60 * 2; i++) step(session.machine, DT);
    expect(worksEvents(before, session.machine)).toEqual([
      { type: 'towersRise', towers: 2, medals: 50 },
      { type: 'guardsRise', towers: 2 },
    ]);
    // Watched from here, they are at work with their guards up: nothing more is said until they are built.
    const during = watchWorks(session.machine);
    step(session.machine, DT);
    expect(worksEvents(during, session.machine)).toEqual([]);
  });

  it('reports nothing when nothing of the works has moved', () => {
    const machine = createMachine(3);
    const before = watchWorks(machine);
    step(machine, DT);
    expect(worksEvents(before, machine)).toEqual([]);
  });

  it('pours a fever square: the board pays its thirty, the doors open for exactly that, and the purse balances', () => {
    const session = createSession(5, { balls: 0 });
    const start = medalsOnField(session.machine);
    const roll = 6;
    session.square = FEVER_SQUARE - roll;
    session.bonus = { kind: 'sugoroku', roll, from: session.square, elapsed: 0, duration: sugorokuDuration(roll), payout: -1 };
    const events: SessionEvent[] = [];
    // Until the doors have opened for it and shut again. What its medals set going after that is another matter.
    for (let i = 0; i < 60 * 30 && of(events, 'pourEnd').length === 0; i++) advance(session, DT, events);
    for (let i = 0; i < 120 && session.machine.hopper.phase !== 'shut'; i++) advance(session, DT, events);
    expect(BOARD[FEVER_SQUARE]).toBeGreaterThanOrEqual(POUR.threshold);
    expect(of(events, 'sugorokuEnd')[0]).toEqual({ type: 'sugorokuEnd', square: FEVER_SQUARE, payout: BOARD[FEVER_SQUARE], fever: true });
    expect(of(events, 'pourStart')[0]).toEqual({ type: 'pourStart', medals: BOARD[FEVER_SQUARE] });
    expect(of(events, 'pourEnd')[0]).toEqual({ type: 'pourEnd', medals: BOARD[FEVER_SQUARE] });
    expect(events.findIndex((event) => event.type === 'pourStart')).toBeGreaterThan(events.findIndex((event) => event.type === 'sugorokuEnd'));
    expect(session.paidOut).toBeGreaterThanOrEqual(BOARD[FEVER_SQUARE]);
    expect(medalsOnField(session.machine) + session.won + session.lost).toBe(start + session.paidOut);
  });

  it('brings a big chest up as towers on their lifts, exactly what the chest held', () => {
    const session = createSession(5, { balls: 0, quickPick: true });
    const start = medalsOnField(session.machine);
    const prize = Math.max(...CHESTS);
    session.bonus = { kind: 'chest', prizes: [prize, prize, prize], fallback: 0, picked: -1, elapsed: 0, pickedAt: -1, told: false, payout: -1 };
    const events: SessionEvent[] = [];
    // Until its towers stand built. What they set going once they are pushed over is another matter.
    for (let i = 0; i < 60 * (TIMING.choose + 30) && of(events, 'towersReady').length === 0; i++) advance(session, DT, events);
    expect(of(events, 'chestEnd')).toMatchObject([{ payout: prize }]);
    const rise = of(events, 'towersRise');
    expect(rise).toHaveLength(1);
    expect(rise[0].medals).toBe(prize);
    expect(events.findIndex((event) => event.type === 'towersRise')).toBeGreaterThan(events.findIndex((event) => event.type === 'chestEnd'));
    expect(of(events, 'towersReady')).toEqual([{ type: 'towersReady', towers: rise[0].towers }]);
    expect(of(events, 'pourStart')).toEqual([]);
    expect(session.paidOut).toBe(prize);
    expect(medalsOnField(session.machine) + session.won + session.lost).toBe(start + prize);
  });
});

describe('the payout works and the three bowls', () => {
  /** The three ends: the way down to each, whether it is the jackpot, and what it pays on a new machine. */
  const ENDS = [
    ['the jackpot', [0, 0, 0], true, JACKPOT_START],
    ['the hundred of the middle bowl', [0, 1], false, 100],
    ['the fifty of the top bowl', [2], false, 50],
  ] as const;
  /**
   * A machine with a full run behind it and the ball a fifth of a second from dropping into the last hole of `way`.
   * No ball and no jewel lies on it: what the prize's medals push over the front would be paid for, and this is
   * about the prize.
   */
  const nearTheDrop = (way: readonly number[]): Session => {
    const session = createSession(7, { balls: 0, jewels: 0 });
    const stage = way.length - 1;
    session.roulettes = 1;
    session.roulette = {
      pocket: 1,
      from: 1,
      elapsed: TIMING.roulette + TIMING.step,
      duration: TIMING.roulette,
      landed: true,
      level: CHAIN_GOAL,
      total: 40,
      gain: 0,
      over: false,
      jackpot: false,
      bowl: { holes: [...way], stage, elapsed: BOWL_TIMES[stage] - 0.2, duration: BOWL_TIMES[stage], payout: -1 },
    };
    return session;
  };

  it.each(ENDS)('deliver %s as its announcement says: that many poured while the prize is still on the screen, and the rest up as towers', { timeout: 30_000 }, (_name, way, jackpot, payout) => {
    const session = nearTheDrop(way);
    const start = medalsOnField(session.machine);
    const said: { step: number; event: SessionEvent; up: boolean }[] = [];
    let gone = 0;
    let thrown = 0;
    let poured = 0;
    const inAir = new Set<number>();
    let freed = -1;
    for (let step = 1; step <= 60 * 12; step++) {
      const events: SessionEvent[] = [];
      const busy = session.roulette !== null;
      advance(session, DT, events);
      for (const event of events) {
        if (event.type === 'won' || event.type === 'lost') gone += event.count;
        if (event.type === 'bowlEnd' || event.type === 'pourStart' || event.type === 'pourEnd' || event.type === 'towersRise' || event.type === 'towersReady') said.push({ step, event, up: bowlPrizeUp(session.roulette) });
      }
      for (const medal of session.machine.falling) {
        if (inAir.has(medal.id) || (medal.source !== 'payout' && medal.source !== 'pour')) continue;
        inAir.add(medal.id);
        if (medal.source === 'pour') poured += 1;
        else thrown += 1;
      }
      // The cabinet says a prize from the bowls is up for exactly as long as the ball lies in its hole, paid.
      expect(bowlPrizeUp(session.roulette)).toBe((session.roulette?.bowl?.payout ?? -1) >= 0);
      if (busy && session.roulette === null) freed = step;
      // Every medal the prize put on the field is a medal there, or one that has left it since.
      expect(medalsOnField(session.machine) + gone).toBe(start + session.paidOut);
    }
    expect(bowlPrizeUp(null)).toBe(false);
    // The bowls say how the prize is split: the share that is always loose, with every place for a tower free.
    const loose = pouredOf(payout);
    const towers = towerSizes(payout - loose);
    const [end, ...works] = said;
    expect(end.event).toEqual({ type: 'bowlEnd', bowl: way.length - 1, hole: way[way.length - 1], payout, poured: loose, total: 40 + payout, jackpot });
    expect(session.paidOut).toBe(payout);
    // The rest starts up on its lifts in that very step.
    expect(works[0]).toMatchObject({ step: end.step, event: { type: 'towersRise', towers: towers.length, medals: payout - loose } });
    const built = works.filter(({ event }) => event.type === 'towersReady');
    expect(built.reduce((sum, { event }) => sum + (event.type === 'towersReady' ? event.towers : 0), 0)).toBe(towers.length);
    const pours = works.filter(({ event }) => event.type === 'pourStart' || event.type === 'pourEnd');
    if (loose >= POUR.threshold) {
      // What is said to be poured is what the hopper pours: its doors drop open in the next step for exactly that
      // many, nothing having been waiting, and they are the medals that come out of them.
      expect(pours.map(({ event }) => event)).toEqual([
        { type: 'pourStart', medals: loose },
        { type: 'pourEnd', medals: loose },
      ]);
      expect(pours[0].step).toBe(end.step + 1);
      expect([poured, thrown]).toEqual([loose, 0]);
      expect(session.machine.hopper).toEqual({ phase: 'shut', clock: 0, pours: 1, poured: loose });
    } else {
      // Fifteen are too few to open the doors for. They are paid loose all the same, out of the slot under the hood.
      expect(loose).toBe(15);
      expect(pours).toEqual([]);
      expect([poured, thrown]).toEqual([0, loose]);
      expect(session.machine.hopper).toEqual(shutHopper());
    }
    // The pour is over while the prize is still up, so the doors add no announcement of their own to the prize's.
    expect(pours.every(({ up }) => up)).toBe(true);
    for (const pour of pours) expect((pour.step - end.step) * DT).toBeLessThan(bowlShowTime(jackpot) - 1);
    // The towers are built slowly: a medal's time for each medal of the tallest, after the hatches have opened, and
    // a moment's standing. The jackpot is counted out for longer than that and its towers stand built while it is
    // still up. A prize from one of the upper bowls has left the screen by then, and its towers are read out as built
    // when they are, as any towers are.
    const last = built[built.length - 1].step;
    expect(Math.abs((last - end.step) * DT - (LIFT.opens + (Math.max(...towers) - 1) / TOWER.perSecond + LIFT.stands))).toBeLessThanOrEqual(3 * DT);
    expect(built.every(({ up }) => up)).toBe(jackpot);
    if (jackpot) expect(freed).toBeGreaterThan(last);
    else expect(freed).toBeLessThan(last);
    expect(Math.abs((freed - end.step) * DT - bowlShowTime(jackpot))).toBeLessThanOrEqual(2 * DT);
    expect([session.machine.payoutQueue, session.machine.growing]).toEqual([0, 0]);
  });

  it('pour what the towers have no place for along with the share that is always loose, and say that number', () => {
    // Every place for a tower is taken, so a hundred medals have nowhere to go up.
    const session = nearTheDrop([0, 1]);
    buildTowers(session.machine, 18 * TOWER.max);
    for (let i = 0; i < 6; i++) advance(session, DT);
    const events: SessionEvent[] = [];
    for (let i = 0; i < 60 * 6 && !events.some((event) => event.type === 'pourEnd'); i++) advance(session, DT, events);
    const end = events.find((event) => event.type === 'bowlEnd');
    expect(end).toMatchObject({ payout: 100, poured: 100 });
    expect(events.filter((event) => event.type === 'pourStart' || event.type === 'pourEnd')).toEqual([
      { type: 'pourStart', medals: 100 },
      { type: 'pourEnd', medals: 100 },
    ]);
  });
});

describe('the payout works and the jewels', () => {
  it('bring the jewel bonus up through a hatch like any tower: three medals, in a guard as tall as three, free a little over two seconds on', () => {
    const session = createSession(5, { balls: 0, jewels: 1 });
    const start = medalsOnField(session.machine);
    session.jewels = JEWEL.lamps - 1;
    const jewel = session.machine.medals.find((medal) => medal.jewel) as Medal;
    expect(jewel.level).toBe(0);
    // The last of the set goes over the front edge.
    jewel.y = FIELD.depth + 0.1;
    const events: SessionEvent[] = [];
    advance(session, DT, events);
    expect(events).toContainEqual({ type: 'jewelBonus', payout: JEWEL.bonus });
    expect(events).toContainEqual({ type: 'towersRise', towers: 1, medals: JEWEL.bonus });
    expect([session.jewels, session.jewelBonuses, jewelsOnField(session.machine)]).toEqual([0, 1, 0]);
    // One lift, on a tower of three: its guard stands as high as three medals and the margin over them.
    expect(session.machine.lifts).toHaveLength(1);
    const [lift] = session.machine.lifts;
    expect(lift).toMatchObject({ size: JEWEL.bonus, wait: LIFT.opens, sunk: -1 });
    expect(liftViews(session.machine, pusherFront(session.machine.time), true)[0].full).toBeCloseTo(JEWEL.bonus * MEDAL_THICKNESS + GUARD.over, 9);
    const tower = session.machine.medals.find((medal) => medal.id === lift.id) as Medal;
    expect([tower.stack, tower.grow, tower.level, tower.tier]).toEqual([1, JEWEL.bonus - 1, 1, 0]);
    // It is held while it comes up, and let go once its guard is up, its two medals have come and it has stood its moment.
    let steps = 0;
    while (!events.some((event) => event.type === 'towersReady') && steps < 240) {
      advance(session, DT, events);
      steps += 1;
      if (session.machine.lifts.some(holds)) {
        expect(tower.x).toBeCloseTo(lift.x, 6);
        expect(tower.y).toBeCloseTo(pusherFront(session.machine.time) - lift.behind, 6);
      }
    }
    expect(events).toContainEqual({ type: 'towersReady', towers: 1 });
    expect(tower).toMatchObject({ stack: JEWEL.bonus, grow: 0 });
    expect(Math.abs(steps * DT - (LIFT.opens + (JEWEL.bonus - 1) / TOWER.perSecond + LIFT.stands))).toBeLessThanOrEqual(3 * DT);
    expect(steps * DT).toBeLessThan(2.5);
    for (let i = 0; i < 90 && session.machine.lifts.length > 0; i++) advance(session, DT, events);
    expect(session.machine.lifts).toEqual([]);
    // Nothing was poured for it, and its three medals are on the field or have left it since.
    expect(events.some((event) => event.type === 'pourStart')).toBe(false);
    const gone = events.reduce((sum, event) => sum + (event.type === 'won' || event.type === 'lost' ? event.count : 0), 0);
    expect(session.paidOut).toBe(JEWEL.bonus);
    expect(medalsOnField(session.machine) + gone).toBe(start + JEWEL.bonus);
  });

  it('pour past a jewel on the lower table without taking it for a medal: it is neither poured nor counted', () => {
    const session = createSession(5, { balls: 0 });
    const lying = jewelsOnField(session.machine);
    expect(lying).toBe(2);
    const start = medalsOnField(session.machine);
    queuePayout(session.machine, 60);
    session.paidOut += 60;
    const events: SessionEvent[] = [];
    for (let i = 0; i < 60 * 4; i++) {
      advance(session, DT, events);
      expect(session.machine.falling.every((medal) => medal.source !== 'pour' || !medal.jewel)).toBe(true);
    }
    const collected = events.filter((event) => event.type === 'jewel').length;
    expect(jewelsOnField(session.machine) + collected).toBe(lying);
    const gone = events.reduce((sum, event) => sum + (event.type === 'won' || event.type === 'lost' ? event.count : 0), 0);
    expect(medalsOnField(session.machine) + gone).toBe(start + session.paidOut);
    expect(session.paidOut).toBe(60 + collected * JEWEL.prize);
  });
});

/** A canvas that only writes down what is asked of it. */
function recorder() {
  const calls: { name: string; args: unknown[] }[] = [];
  const gradient = { addColorStop: () => undefined };
  const store: Record<string, unknown> = {};
  const g = new Proxy(store, {
    get: (target, key: string) => {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push({ name: key, args });
        return key.startsWith('create') ? gradient : undefined;
      };
    },
    set: (target, key: string, value: unknown) => {
      target[key] = value;
      calls.push({ name: `=${key}`, args: [value] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const count = (name: string) => calls.filter((call) => call.name === name).length;
  return { g, calls, count };
}

describe('the payout works on the canvas', () => {
  it('draws both doors shut, their lamps dark, and no medal, on a machine at rest', () => {
    const { g, count } = recorder();
    const stamped: number[] = [];
    drawHopper(g, 1, createMachine(7), false, 0, LANDED, (_point, _round, id) => stamped.push(id));
    expect(stamped).toEqual([]);
    // A frame and a plate for each door, the arrows on each plate, two hinges and a lamp each; no dark mouth.
    expect(count('fill')).toBe(2 * (1 + 1 + 3 + 2 + 1 + 1));
    // Only the bulbs: no lamp glows.
    expect(count('createRadialGradient')).toBe(2);
  });

  it('draws the doors down with a medal for every one that is on its way out of them, the furthest first', () => {
    const machine = pouring();
    const { g, calls, count } = recorder();
    const stamped: { id: number; point: Projected; round: number }[] = [];
    drawHopper(g, 1, machine, false, 0, LANDED, (point, round, id) => stamped.push({ id, point, round }));
    const out = machine.falling.filter((medal) => medal.source === 'pour');
    const seen = out.filter((medal) => pourPose(medal, LANDED).shown > 0);
    expect(seen.length).toBeGreaterThan(10);
    expect(stamped.map((stamp) => stamp.id).sort()).toEqual(seen.map((medal) => medal.id).sort());
    // Each where works.ts has it, as round as a medal tipped that far looks from here.
    for (const stamp of stamped) {
      const pose = pourPose(out.find((medal) => medal.id === stamp.id) as FallingMedal, LANDED);
      const point = project(pose.x, pose.height, pose.depth);
      expect(stamp.point).toEqual(point);
      expect(stamp.round).toBeCloseTo(roundness(point.tilt, pose.tilt), 12);
    }
    const depths = stamped.map((stamp) => pourPose(out.find((medal) => medal.id === stamp.id) as FallingMedal, LANDED).depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    // The lamps glow, and the picture is left as it was found: nothing stays see-through.
    expect(count('createRadialGradient')).toBe(4);
    expect(calls.filter((call) => call.name === '=globalAlpha').pop()?.args).toEqual([1]);
    // The stays are out and the channels' walls show.
    expect(count('stroke')).toBeGreaterThan(2 * (2 + 2 + 8));
  });

  it('says a medal lying flat looks as round as the place makes it, and rounder tipped toward the player', () => {
    expect(roundness(0.5, 0)).toBeCloseTo(0.5, 12);
    expect(roundness(0.5, 0.3)).toBeGreaterThan(0.5);
    expect(roundness(0.5, -Math.asin(0.5))).toBe(0.12);
    expect(roundness(0.5, Math.PI * 2)).toBeCloseTo(0.5, 9);
  });

  it('draws every hatch in the deck of a machine at rest: shut, its seam showing and its ring dark', () => {
    const { g, count } = recorder();
    drawHatches(g, 1, createMachine(13), 40, false, 0);
    // To a hatch: the collar and the two doors as one plate, and nothing for a ring that is not lit; the collar's edge, the seam, and the mouth's rim.
    expect(count('fill')).toBe(HATCHES.length * 2);
    expect(count('stroke')).toBe(HATCHES.length * 3);
    // No door has moved: no shaft shows.
    expect(count('fillRect')).toBe(0);
    expect(count('clip')).toBe(0);
  });

  it('draws the hatch of a lift at work with its ring lit and its doors apart over the dark of the shaft', () => {
    const machine = createMachine(13);
    buildTowers(machine, 50);
    const rest = HATCHES.length - 2;
    // Half way through the doors' time: both are middle hatches, whose turn comes at once.
    runUntil(machine, (m) => m.lifts[0].wait <= LIFT.opens - LIFT.lamps - LIFT.doors / 2);
    const parting = recorder();
    drawHatches(parting.g, 1, machine, pusherFront(machine.time), false, 0);
    // The shaft between the doors, clipped to the mouth; the ring, all of it lit and still, as one band; the doors' bright edges in place of the seam.
    expect(parting.count('fillRect')).toBe(2);
    expect(parting.count('clip')).toBe(2);
    expect(parting.count('save')).toBe(parting.count('restore'));
    expect(parting.count('fill')).toBe(rest * 2 + 2 * (2 + 1));
    expect(parting.count('stroke')).toBe(rest * 3 + 2 * 3);
    // The band is the collar itself: from the collar's edge in to the mouth's, all the way round, the first arc beginning at the back.
    const bands = parting.calls.filter((call, index) => call.name === 'ellipse' && parting.calls[index + 1]?.name === 'ellipse').map((call) => call.args as number[]);
    expect(bands).toHaveLength(2);
    for (const view of liftViews(machine, pusherFront(machine.time))) {
      const at = project(view.x, DECK, view.y);
      const [x, y, rx, ry, , from, to] = bands.find((band) => band[0] === at.x) as number[];
      expect([x, y]).toEqual([at.x, at.y]);
      expect(rx).toBeCloseTo(DECK_HATCH.collar * at.scale, 9);
      expect(ry).toBeCloseTo(DECK_HATCH.collar * at.scale * at.tilt, 9);
      expect(from).toBeCloseTo(-Math.PI / 2, 12);
      expect(to - from).toBeCloseTo(Math.PI * 2, 12);
    }
    const widths = parting.calls.filter((call) => call.name === 'fillRect').map((call) => call.args[2] as number);
    for (const [index, view] of liftViews(machine, pusherFront(machine.time)).entries()) {
      expect(view.doors).toBeGreaterThan(0.3);
      expect(view.doors).toBeLessThan(0.7);
      expect(widths[index]).toBeCloseTo(2 * DECK_HATCH.radius * project(view.x, DECK, view.y).scale * view.doors, 9);
    }
    // All the way open: the whole mouth is shaft, and no door's edge is left in it.
    runUntil(machine, (m) => m.lifts[0].wait === 0);
    const open = recorder();
    drawHatches(open.g, 1, machine, pusherFront(machine.time), false, 0);
    expect(open.count('fillRect')).toBe(2);
    expect(open.count('stroke')).toBe(rest * 3 + 2 * 2);
    // A tower is coming up, so the light runs round the ring: its arcs' colours change with the clock. With reduced
    // motion they do not: the same colours whatever the clock says.
    const colours = (calm: boolean, later: number): unknown[] => {
      const { g, calls } = recorder();
      drawHatches(g, 1, { ...machine, time: machine.time + later }, pusherFront(machine.time), calm, 0);
      return calls.filter((call) => call.name === '=fillStyle' && typeof call.args[0] === 'string').map((call) => call.args[0]);
    };
    step(machine, DT);
    expect(liftViews(machine, pusherFront(machine.time)).every((view) => view.building)).toBe(true);
    expect(colours(false, 0.2)).not.toEqual(colours(false, 0));
    expect(colours(true, 0.2)).toEqual(colours(true, 0));
    // Running, a ring is as many arcs as are differently bright; still, it is one band again.
    const lit = (calm: boolean): number => colours(calm, 0.137).filter((colour) => String(colour).startsWith('rgba(255, 228, 130')).length;
    expect(lit(false)).toBeGreaterThan(2 * (DECK_HATCH.lamps / 2));
    expect(lit(false)).toBeLessThanOrEqual(2 * DECK_HATCH.lamps);
    expect(lit(true)).toBe(2);
  });

  it('draws nothing of the lifts while none is at work, and for each one that is its tower as far up as it has come with its guard over it', () => {
    const idle = recorder();
    drawLifts(
      idle.g,
      1,
      createMachine(13),
      40,
      false,
      0,
      () => {
        throw new Error('no tower to draw again');
      },
      () => {
        throw new Error('no tower to draw');
      },
    );
    expect(idle.calls).toEqual([]);

    const machine = createMachine(13);
    buildTowers(machine, 60);
    const shot = (calm = false) => {
      const { g, calls, count } = recorder();
      const again: number[] = [];
      const faces: { id: number; point: Projected }[] = [];
      const front = pusherFront(machine.time);
      drawLifts(
        g,
        1,
        machine,
        front,
        calm,
        0,
        (tower) => again.push(tower.id),
        (point, id) => faces.push({ id, point }),
      );
      // The light a ring throws on what lies round its hatch is laid on in strokes of its own colour.
      const light = calls.filter((call) => call.name === '=strokeStyle' && String(call.args[0]).startsWith('rgba(255, 214, 92')).length;
      return { calls, count, again, faces, light, views: liftViews(machine, front, calm) };
    };
    // The moment the prize is paid there is no tower to see, no sleeve, and no ring lit yet: nothing at all.
    const dark = shot();
    expect([dark.count('fill'), dark.count('stroke'), dark.faces.length]).toEqual([0, 0, 0]);
    // The rings come on: nothing but their light on what lies round each hatch, the far half and the near half, each
    // as much of it as is lit. Half lit, that is the first quarter and the last: the far half's right, the near half's right.
    runUntil(machine, (m) => m.lifts[0].wait <= LIFT.opens - LIFT.lamps * 0.6);
    const lighting = shot();
    expect([lighting.count('fill'), lighting.faces.length]).toEqual([0, 0]);
    expect(lighting.light).toBeGreaterThanOrEqual(2);
    expect(lighting.count('stroke')).toBe(lighting.light);
    const [middle] = lighting.views.filter((view) => view.lamps > 0.5);
    const arcs = lighting.calls.filter((call) => call.name === 'ellipse');
    const at = project(middle.x, DECK + 0.05, middle.y);
    const mine = arcs.filter((call) => call.args[0] === at.x && call.args[1] === at.y).map((call) => call.args as number[]);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    for (const [, , rx, ry, , from, to] of mine) {
      // Along the middle of the collar's band, and no arc of it reaches from the far half into the near one.
      expect(rx).toBeCloseTo(((DECK_HATCH.collar + DECK_HATCH.radius) / 2) * at.scale, 9);
      expect(ry).toBeCloseTo(rx * at.tilt, 9);
      expect(to).toBeGreaterThan(from);
      expect(Math.sin(from + 1e-6) * Math.sin(to - 1e-6)).toBeGreaterThan(0);
    }
    // Lit from the back round toward the right: the far half's arcs end at the right, where the near half's begin.
    expect(mine.some(([, , , , , , to]) => Math.abs(to - Math.PI * 2) < 1e-9)).toBe(true);
    expect(mine.some(([, , , , , from]) => Math.abs(from) < 1e-9)).toBe(true);
    // The guards up, and each tower's first medal level with the deck in the mouth of its hatch.
    runUntil(machine, (m) => m.lifts[0].wait === 0);
    const level = shot();
    // The sleeve, the collar and the lamp; the sleeve's two edges and the far rim; for each of the three. And the
    // light of each ring, which is running: as many strokes as it has arcs that are differently bright.
    expect(level.count('fill')).toBe(3 * 3);
    expect(level.light).toBeGreaterThan(3 * 2);
    expect(level.light).toBeLessThanOrEqual(3 * DECK_HATCH.lamps);
    expect(level.count('stroke')).toBe(3 * 2 + level.light);
    // With reduced motion a lit ring is lit and still: one stroke to each half of it. (And the first medal stands
    // whole on the deck already, so each tower is a column, which is one stroke more.)
    const still = shot(true);
    expect(still.light).toBe(3 * 2);
    expect(still.count('stroke')).toBe(3 * (2 + 1) + 3 * 2);
    expect(level.count('clip')).toBe(3);
    expect(level.faces.map((face) => face.id)).toEqual(level.views.map((view) => view.id));
    for (const [index, view] of level.views.entries()) {
      expect(view.top).toBeCloseTo(0, 9);
      expect(level.faces[index].point).toEqual(project(view.x, DECK + view.top, view.y));
    }
    // The three stand side by side in one row: none is in front of another.
    expect(level.again).toEqual([]);
    // Some medals up: under each sleeve a shadow and a column from the deck to the tower's top, with a line under every medal, and the top medal's face on it.
    runUntil(machine, (m) => (m.medals.find((medal) => medal.id === m.lifts[0].id) as Medal).stack >= 6);
    const rising = shot();
    expect(rising.count('fill')).toBe(3 * (3 + 2));
    expect(rising.count('stroke')).toBe(3 * (2 + 1) + rising.light);
    expect(rising.count('clip')).toBe(0);
    for (const [index, view] of rising.views.entries()) {
      expect(view.top).toBeGreaterThan(5 * MEDAL_THICKNESS - 1e-9);
      expect(rising.faces[index]).toEqual({ id: view.id, point: project(view.x, DECK + view.top, view.y) });
    }
    expect(rising.again).toEqual([]);
    // Let go, a tower is drawn with the other towers, before any lift is, and it stands in front of the far half of
    // its ring: only the near half's light is laid on, from the right, round the front, to the left.
    runUntil(machine, (m) => m.lifts.every((lift) => !holds(lift)));
    const free = shot();
    expect(free.views.every((view) => !view.working && view.lamps === 1 && !view.building)).toBe(true);
    expect(free.light).toBe(3);
    expect(free.faces).toEqual([]);
    const halves = free.calls.filter((call, index) => call.name === 'ellipse' && free.calls[index + 1]?.name === 'stroke' && free.calls[index - 1]?.name === 'beginPath' && free.calls[index - 2]?.name === '=shadowColor');
    expect(halves).toHaveLength(3);
    for (const half of halves) {
      expect(half.args[5]).toBeCloseTo(0, 12);
      expect(half.args[6]).toBeCloseTo(Math.PI, 12);
    }
  });

  it('draws a free tower that stands nearer than a guard, and across it, again over the guard, and leaves a held one to its own lift', () => {
    const machine = createMachine(13);
    buildTowers(machine, 25);
    runUntil(machine, (m) => m.lifts[0].wait === 0);
    const [lift] = machine.lifts;
    const front = pusherFront(machine.time);
    const near: Medal = { id: 9001, x: lift.x + 2, y: front - lift.behind + 5, level: 1, tier: 0, sinceDrop: -1, stack: 12, grow: 0, ball: false, grown: 1 };
    const aside: Medal = { ...near, id: 9002, x: lift.x + 30 };
    const behind: Medal = { ...near, id: 9003, y: front - lift.behind - 5 };
    const flat: Medal = { ...near, id: 9004, stack: 1 };
    // One more that stands nearer and across, in a guard of its own: its lift draws it, when its turn comes.
    const held: Medal = { ...near, id: 9005, x: lift.x - 2, grow: 3 };
    machine.medals.push(near, aside, behind, flat, held);
    machine.lifts.push({ id: 9005, x: held.x, behind: front - held.y, size: 15, wait: 0, sunk: -1 });
    const again: number[] = [];
    const faces: number[] = [];
    drawLifts(
      recorder().g,
      1,
      machine,
      front,
      false,
      0,
      (tower) => again.push(tower.id),
      (_point, id) => faces.push(id),
    );
    expect(again).toEqual([9001]);
    // Each lift draws its own tower once, the further first.
    expect(faces).toEqual([lift.id, 9005]);
  });
});

describe('the payout works in the 3D scene', () => {
  const T = MEDAL_THICKNESS;
  /** Corners to the steel of a shut hatch: a side of the collar for every arc of its ring, and four strips to each door. */
  const SHUT = (DECK_HATCH.lamps + 2 * 4) * 6;
  /** How far over the deck the lit arcs of a ring lie. */
  const ARC_UP = 0.045;
  const build = (machine: Machine, calm = false, front = pusherFront(machine.time)) => {
    const solid = new Solid(64);
    solid.quad(0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0);
    const flat = new Flat(64);
    const beads = createRows(BEAD_STRIDE, 8);
    const medals = createRows(MEDAL_STRIDE, 8);
    buildWorks(solid, flat, beads, machine, front, calm, medals);
    const all = Array.from({ length: beads.count }, (_, i) => ({ x: beads.data[i * BEAD_STRIDE], y: beads.data[i * BEAD_STRIDE + 1], z: beads.data[i * BEAD_STRIDE + 2], kind: beads.data[i * BEAD_STRIDE + 7] }));
    const rows = Array.from({ length: medals.count }, (_, i) => ({ x: medals.data[i * MEDAL_STRIDE], y: medals.data[i * MEDAL_STRIDE + 1], z: medals.data[i * MEDAL_STRIDE + 2], contact: medals.data[i * MEDAL_STRIDE + 9], light: medals.data[i * MEDAL_STRIDE + 10] }));
    const corners = Array.from({ length: solid.count }, (_, i) => {
      const d = solid.data.subarray(i * SOLID_STRIDE, (i + 1) * SOLID_STRIDE);
      return { x: d[0], y: d[1], z: d[2], colour: [d[8], d[9], d[10]], glow: d[12] };
    });
    const touches = Array.from({ length: flat.count }, (_, i) => {
      const d = flat.data.subarray(i * FLAT_STRIDE, (i + 1) * FLAT_STRIDE);
      return { x: d[0], y: d[1], z: d[2], cover: d[6], shine: d[7], across: d[9], shape: d[10] };
    });
    // The doors' two lamps come first, then the lamp on the collar of each guard that is up: a hatch has no bulb in it.
    // The lit arcs of the rings are the surfaces that lie that hair over the deck.
    return { solid, flat, bulbs: all.slice(0, 2), collarLamps: all.slice(2), rows, medals, corners, touches, arcs: corners.filter((corner) => Math.abs(corner.y - (DECK + ARC_UP)) < 1e-4) };
  };
  /** The numbers of a list from corner `first` on, for `count` corners. */
  const numbers = (list: { data: Float32Array }, stride: number, first: number, count: number): number[] => Array.from(list.data.subarray(first * stride, (first + count) * stride));
  /** The most any two lists of numbers differ by. */
  const apart = (a: readonly number[], b: readonly number[]): number => a.reduce((most, value, index) => Math.max(most, Math.abs(value - b[index])), a.length === b.length ? 0 : Infinity);

  it('adds its surfaces after the cabinet’s own, a lamp beside each door, dark while the hopper rests, and every hatch in the deck, shut and dark', () => {
    const machine = createMachine(7);
    const { solid, flat, bulbs, collarLamps, rows, corners, touches, arcs } = build(machine);
    const [part] = WORKS_PARTS;
    expect(part).toMatchObject({ art: 'plain', first: 6 });
    expect(part.count).toBeGreaterThan(0);
    expect(part.count % 6).toBe(0);
    expect(part.first + part.count).toBe(solid.count);
    expect(Number.isFinite(solid.data[(solid.count - 1) * SOLID_STRIDE])).toBe(true);
    expect(bulbs).toHaveLength(2);
    expect(bulbs.map((bulb) => bulb.kind)).toEqual([BEAD.bulb(0.06), BEAD.bulb(0.06)].map(Math.fround));
    expect(bulbs[0].x).toBeLessThan(DOORS[0].from);
    expect(bulbs[1].x).toBeGreaterThan(DOORS[1].to);
    // No bulb in any hatch, and no guard up.
    expect(collarLamps).toEqual([]);
    expect(rows).toEqual([]);
    // The steel of every hatch comes last: in the deck, a hair over it, within its collar's reach of its own middle, and no arc of any ring lit.
    const front = pusherFront(machine.time);
    const steel = corners.slice(solid.count - HATCHES.length * SHUT);
    HATCHES.forEach(({ x, behind }, index) => {
      for (const corner of steel.slice(index * SHUT, (index + 1) * SHUT)) {
        expect(Math.hypot(corner.x - x, corner.z - (front - behind))).toBeLessThanOrEqual(DECK_HATCH.collar + 1e-4);
        expect(corner.y).toBeGreaterThan(DECK);
        expect(corner.y).toBeLessThan(DECK + 0.03);
        expect(corner.glow).toBe(0);
      }
    });
    expect(arcs).toEqual([]);
    // Shut, each plate of the hopper shows its three arrows, each hatch its seam, and nothing glows.
    expect(flat.count).toBe(2 * 3 * 3 + HATCHES.length * 6);
    expect(touches.every((touch) => touch.shine === 0)).toBe(true);
    // A seam runs from the back of its mouth to the front, dark down the middle and fading to either side of it, not along it.
    HATCHES.forEach(({ x, behind }, index) => {
      const seam = touches.slice(2 * 3 * 3 + index * 6, 2 * 3 * 3 + (index + 1) * 6);
      expect(seam.every((touch) => touch.shape === SHAPE.line && touch.cover > 0.5)).toBe(true);
      expect([...new Set(seam.map((touch) => Number((touch.z - (front - behind)).toFixed(4))))].sort((a, b) => a - b)).toEqual([-DECK_HATCH.radius, DECK_HATCH.radius].map((n) => Number(n.toFixed(4))));
      for (const touch of seam) {
        expect(Math.abs(touch.x - x)).toBeLessThan(0.5);
        expect(Math.sign(touch.x - x)).toBe(touch.across);
      }
    });
  });

  it('lays the shut hatches as the deck of them that was made once, moved to where the lip is: the very steel each would be if it were built there', () => {
    const machine = createMachine(7);
    const afresh = (front: number) => {
      const solid = new Solid(64);
      for (const { x, behind } of HATCHES) hatchSteel(solid, x, Math.max(MEDAL_RADIUS, front - behind), 0);
      expect(solid.count).toBe(HATCHES.length * SHUT);
      return numbers(solid, SOLID_STRIDE, 0, solid.count);
    };
    // All the way back, all the way out, and between: each time the same numbers as building every hatch afresh, to the last place a list holds.
    const laid = (front: number, from: Machine = machine) => {
      const { solid, flat } = build(from, false, front);
      return { steel: numbers(solid, SOLID_STRIDE, solid.count - HATCHES.length * SHUT, HATCHES.length * SHUT), seams: numbers(flat, FLAT_STRIDE, 2 * 3 * 3, HATCHES.length * 6) };
    };
    for (const front of [PUSHER.min, 37.3, PUSHER.max]) expect(apart(laid(front).steel, afresh(front))).toBeLessThan(1e-5);
    // From one frame to the next nothing of it changes but how far out it all is: the lip's own move, and the same for every corner.
    const back = laid(PUSHER.min);
    const out = laid(PUSHER.max);
    for (const [list, stride] of [
      ['steel', SOLID_STRIDE],
      ['seams', FLAT_STRIDE],
    ] as const) {
      expect(back[list]).toHaveLength(out[list].length);
      let moved = 0;
      let other = 0;
      for (let at = 0; at < back[list].length; at++) {
        if (at % stride === 2) moved = Math.max(moved, Math.abs(out[list][at] - back[list][at] - (PUSHER.max - PUSHER.min)));
        else other = Math.max(other, Math.abs(out[list][at] - back[list][at]));
      }
      expect(moved).toBeLessThan(1e-5);
      expect(other).toBe(0);
    }
    // Beside lifts at work the shut ones are still their own part of it: with a prize just paid, when nothing has moved yet, the deck is number for number what it was.
    const paid = createMachine(7);
    buildTowers(paid, 60);
    expect(paid.lifts).toHaveLength(3);
    const front = pusherFront(paid.time);
    expect(laid(front, paid)).toEqual(laid(front));
    // A pusher that could carry a hatch into the back wall would leave it standing clear of the wall: then each is built where it stands.
    const near = PUSHER.min - 10;
    expect(near - TOWER.rows[TOWER.rows.length - 1]).toBeLessThan(MEDAL_RADIUS);
    expect(apart(laid(near).steel, afresh(near))).toBe(0);
  });

  it('lights the lamps and lets the stays out while the hopper is at work', () => {
    const rest = build(createMachine(7));
    const atWork = build(pouring());
    expect(atWork.bulbs.map((bulb) => bulb.kind)).toEqual([BEAD.bulb(1), BEAD.bulb(1)].map(Math.fround));
    // Two stays to a door, and a glow for each lamp in place of the arrows. The hatches are as they were.
    expect(atWork.solid.count).toBe(rest.solid.count + 2 * 2 * 6);
    expect(atWork.flat.count).toBe(2 * 6 + HATCHES.length * 6);
  });

  it('opens the hatch of every lift at work: its ring lit an arc at a time, its doors apart over a black mouth, and a sleeve, a collar and a lamp over it', () => {
    const machine = createMachine(13);
    const none = build(machine);
    buildTowers(machine, 60);
    // The moment the prize is paid nothing has moved: the deck is as it was.
    const paid = build(machine);
    expect([paid.solid.count, paid.flat.count, paid.collarLamps.length, paid.rows.length, paid.arcs.length]).toEqual([none.solid.count, none.flat.count, 0, 0, 0]);
    // As the rings come on, each arc is as bright as works.ts says: the middle hatches' first, the next one's a step behind.
    runUntil(machine, (m) => m.lifts[0].wait <= LIFT.opens - LIFT.lamps * 0.75);
    const lighting = build(machine);
    const hatches = hatchViews(liftViews(machine, pusherFront(machine.time)), pusherFront(machine.time));
    expect(hatches).toHaveLength(HATCHES.length);
    const glows = hatches.flatMap((hatch) => Array.from({ length: DECK_HATCH.lamps }, (_, arc) => ({ hatch, arc, glow: lampGlow(hatch, arc, machine.time) })).filter(({ glow }) => glow > 0));
    const lit = glows.length;
    expect(lit).toBeGreaterThan(DECK_HATCH.lamps);
    expect(lit).toBeLessThan(3 * DECK_HATCH.lamps);
    // A surface to each lit arc, in the collar from the mouth's edge to its own, giving off its light; and two glows: on the deck round it, and over the heap.
    expect(lighting.arcs).toHaveLength(lit * 6);
    expect(lighting.solid.count).toBe(none.solid.count + lit * 6);
    expect(lighting.flat.count).toBe(none.flat.count + lit * 2 * 6);
    glows.forEach(({ hatch, arc, glow }, index) => {
      const from = -Math.PI / 2 + (arc / DECK_HATCH.lamps) * Math.PI * 2;
      const to = -Math.PI / 2 + ((arc + 1) / DECK_HATCH.lamps) * Math.PI * 2;
      for (const corner of lighting.arcs.slice(index * 6, (index + 1) * 6)) {
        const out = Math.hypot(corner.x - hatch.x, corner.z - hatch.y);
        const round = Math.atan2(corner.z - hatch.y, corner.x - hatch.x);
        expect(Math.min(Math.abs(out - DECK_HATCH.radius), Math.abs(out - DECK_HATCH.collar))).toBeLessThan(1e-4);
        // At one end of its arc or the other, whichever way round the angle is counted.
        expect(Math.min(...[from, to].map((angle) => Math.abs(Math.sin((round - angle) / 2))))).toBeLessThan(1e-4);
        expect(corner.glow).toBe(Math.fround(glow));
        // The collar's steel while it is dark, gold when it is lit: brighter the more it glows.
        expect(corner.colour[0]).toBeGreaterThan(0.04);
      }
    });
    const thrown = lighting.touches.filter((touch) => touch.shine > 0);
    expect(thrown).toHaveLength(lit * 2 * 6);
    expect(thrown.every((touch) => touch.shape === SHAPE.line && touch.cover === 0)).toBe(true);
    // Half of that light is on the deck and half is laid two medals up, over whatever lies on the hatch.
    expect(thrown.filter((touch) => touch.y < DECK + 0.1)).toHaveLength(lit * 6);
    expect(thrown.filter((touch) => touch.y > DECK + 2 * T)).toHaveLength(lit * 6);
    // It reaches from inside the mouth's edge to beyond the collar's.
    const [first] = glows;
    const reach = thrown.slice(0, 6).map((touch) => Math.hypot(touch.x - first.hatch.x, touch.z - first.hatch.y));
    expect(Math.min(...reach)).toBeCloseTo(DECK_HATCH.radius - DECK_HATCH.glow, 4);
    expect(Math.max(...reach)).toBeCloseTo(DECK_HATCH.collar + DECK_HATCH.glow, 4);
    expect(lighting.collarLamps).toEqual([]);
    // The guards up: the mouths are open, so three seams are gone; and a collar lamp stands on each sleeve.
    runUntil(machine, (m) => m.lifts[0].wait === 0);
    const up = build(machine);
    expect(up.collarLamps).toHaveLength(3);
    const views = liftViews(machine, pusherFront(machine.time));
    for (const [index, view] of views.entries()) {
      const lamp = up.collarLamps[index];
      expect(lamp.x).toBeCloseTo(view.x, 4);
      expect(lamp.z).toBeGreaterThan(view.y + GUARD.radius);
      expect(lamp.y).toBeGreaterThan(DECK + view.rim - GUARD.collar - 1e-3);
      expect(lamp.kind).toBe(Math.fround(BEAD.bulb(1)));
    }
    // Every arc of the three rings is lit, brighter and dimmer by turns as the light runs round them.
    expect(up.arcs).toHaveLength(3 * DECK_HATCH.lamps * 6);
    expect(up.arcs.every((corner) => corner.glow >= Math.fround(0.2) - 1e-6 && corner.glow <= 1)).toBe(true);
    expect(new Set(up.arcs.map((corner) => corner.glow)).size).toBeGreaterThan(DECK_HATCH.lamps / 2);
    expect(up.solid.count).toBeGreaterThan(lighting.solid.count);
    expect(up.flat.count).toBeGreaterThan(lighting.flat.count);
    // Each tower's first medal is in the mouth of its hatch, a hair proud of the deck, in full light.
    expect(up.rows).toHaveLength(3);
    for (const [index, view] of views.entries()) {
      const row = up.rows[index];
      // It is the medal that will be the top of the finished tower, which stands a hair out of line with the ones under it.
      expect(Math.abs(row.x - view.x)).toBeLessThanOrEqual(0.1 + 1e-6);
      expect(Math.abs(row.z - view.y)).toBeLessThanOrEqual(0.1 + 1e-6);
      expect(row.y + T / 2).toBeGreaterThan(DECK);
      expect(row.y + T / 2).toBeLessThan(DECK + 0.2);
      expect([row.contact, row.light]).toEqual([0, 1]);
    }
    // With reduced motion the rings are lit and still.
    const still = build(machine, true);
    expect(still.arcs).toHaveLength(3 * DECK_HATCH.lamps * 6);
    expect(still.arcs.every((corner) => corner.glow === 1)).toBe(true);
  });

  it('writes the tower a lift holds as far up through its hatch as it has come: only the medals that stand out of the deck, the top one where works.ts has it', () => {
    const machine = createMachine(13);
    buildTowers(machine, 25);
    const [lift] = machine.lifts;
    const tower = machine.medals.find((medal) => medal.id === lift.id) as Medal;
    // Down the shaft, behind its doors, there is nothing of it to write.
    expect(build(machine).rows).toEqual([]);
    // scene3d.ts leaves a held tower out, whatever it has gained.
    runUntil(machine, () => tower.stack >= 9);
    const lying = createRows(MEDAL_STRIDE, 8);
    writeMedals(lying, machine, []);
    const without = createRows(MEDAL_STRIDE, 8);
    writeMedals(without, { ...machine, medals: machine.medals.filter((medal) => medal !== tower) }, []);
    expect(lying.count).toBe(without.count);
    // The lift writes it: the top medal at the tower's top, the rest a medal's thickness apart under it, down to the deck.
    const [view] = liftViews(machine, pusherFront(machine.time));
    const { rows } = build(machine);
    expect(view.top).toBeGreaterThan(8 * T - 1e-9);
    expect(view.top).toBeLessThan(9 * T);
    expect(rows).toHaveLength(Math.ceil((view.top - 0.01) / T));
    rows.forEach((row, down) => {
      expect(row.y).toBeCloseTo(DECK + view.top - T * (down + 0.5), 4);
      expect(Math.abs(row.x - view.x)).toBeLessThanOrEqual(0.1 + 1e-6);
      expect(Math.abs(row.z - view.y)).toBeLessThanOrEqual(0.1 + 1e-6);
      expect(row.light).toBe(1);
    });
    // The lowest stands part of the way out of the deck: its middle is under the deck's top, or less than a medal over it.
    expect(rows[rows.length - 1].y).toBeLessThan(DECK + T);
  });

  it('writes a held tower, the moment before it is let go, as the very tower scene3d.ts writes once it is free: nothing jumps', () => {
    const machine = createMachine(13);
    buildTowers(machine, 25);
    const [lift] = machine.lifts;
    runUntil(machine, () => stands(lift) && lift.sunk > -2 * DT);
    const tower = machine.medals.find((medal) => medal.id === lift.id) as Medal;
    expect([holds(lift), tower.stack, tower.grow]).toEqual([true, 25, 0]);
    const held = build(machine).medals;
    const free = createRows(MEDAL_STRIDE, 8);
    writeMedals(free, { ...machine, medals: [tower], lifts: [], falling: [], rolling: [] }, []);
    expect([held.count, free.count]).toEqual([25, 25]);
    // The lift counts down from the top and the scene up from the bottom: the same medal each time, in the same place, turned the same way.
    for (let rank = 0; rank < 25; rank++) {
      const mine = (24 - rank) * MEDAL_STRIDE;
      const theirs = rank * MEDAL_STRIDE;
      for (let at = 0; at < 8; at++) expect(held.data[mine + at]).toBeCloseTo(free.data[theirs + at], 5);
      expect(held.data[mine + 10]).toBe(1);
    }
  });

  it('writes a poured medal among the medals, where works.ts has it and as dark as it still is', () => {
    const machine = createMachine(7);
    machine.medals = [];
    const medal = pouredAt(POUR_WAY.slide * 0.2);
    const hopping = pouredAt((POUR_WAY.bounce + 1) / 2, { id: 6 });
    const unseen = pouredAt(0, { id: 8 });
    machine.falling = [medal, hopping, unseen];
    const rows = createRows(MEDAL_STRIDE, 8);
    writeMedals(rows, machine, []);
    // The one that has not come out of the dark yet is left out.
    expect(rows.count).toBe(2);
    const first = pourPose(medal, LANDED);
    expect([rows.data[0], rows.data[1], rows.data[2]]).toEqual([first.x, first.height, first.depth].map(Math.fround));
    expect(rows.data[10]).toBe(Math.fround(first.shown));
    expect(first.shown).toBeLessThan(1);
    const second = pourPose(hopping, LANDED);
    expect(rows.data[MEDAL_STRIDE + 1]).toBe(Math.fround(second.height));
    expect(second.height).toBeGreaterThan(LANDED + 1);
    // With reduced motion the same medal is where works.ts has it without the flourish: still on its one way down.
    writeMedals(rows, machine, [], undefined, true);
    expect(rows.data[MEDAL_STRIDE + 1]).toBe(Math.fround(pourPose(hopping, LANDED, true).height));
    expect(pourPose(hopping, LANDED, true).height).not.toBeCloseTo(second.height, 1);
  });
});

describe('what the game says about the payout works', () => {
  it('says the same things in both languages, with the numbers in them', () => {
    for (const language of ['en', 'ja'] as const) {
      const t = getWorksStrings(language);
      expect(t.sayPoured(60)).toContain('60');
      expect(t.sayTowers(3)).toContain('3');
      expect(t.sayTowers(1).length).toBeGreaterThan(0);
      const lines = t.howItPays(POUR.threshold);
      expect(lines).toHaveLength(3);
      expect(lines[1]).toContain(String(POUR.threshold));
    }
    expect(getWorksStrings('ja').sayPoured(60)).not.toBe(getWorksStrings('en').sayPoured(60));
    expect(getWorksStrings('en').sayTowers(1)).not.toContain('1 medal towers');
  });
});
