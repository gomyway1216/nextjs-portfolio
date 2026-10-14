import { describe, expect, it } from 'vitest';

import { ARMS, HATCH } from '@/components/game/MedalPusher/arms';
import { FLAT_STRIDE, Flat, SOLID_STRIDE, Solid } from '@/components/game/MedalPusher/cabinet3d';
import {
  FIELD,
  MEDAL_RADIUS,
  MEDAL_THICKNESS,
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
import { BOARD, CHAIN_GOAL, CHESTS, FEVER_SQUARE, JACKPOT_START, JEWEL, pouredOf } from '@/components/game/MedalPusher/lottery';
import { bowlPrizeUp } from '@/components/game/MedalPusher/PlayTab';
import { BEAD, BEAD_STRIDE, LANDED, MEDAL_STRIDE, createRows, writeMedals } from '@/components/game/MedalPusher/scene3d';
import { BOWL_TIMES, TIMING, advance, bowlShowTime, createSession, isBusy, sugorokuDuration, type Session, type SessionEvent } from '@/components/game/MedalPusher/session';
import { CYCLE, PHASE_TIME, STACK, TUBE, TUBE_ROOM, armSpot, idleTube, medalsInTubes, type Tube } from '@/components/game/MedalPusher/stacker';
import { HEIGHT, HOUSING, SCREEN, project, type Projected } from '@/components/game/MedalPusher/view';
import {
  ARM,
  CHUTE_SLOPE,
  DECK,
  DOOR,
  GATE,
  GLASS,
  PLATFORM,
  POUR_WAY,
  WINDOW,
  chuteShows,
  countText,
  doorLampLit,
  doorOf,
  doorSwing,
  offArms,
  onArm,
  onFlap,
  pivotOf,
  pourPose,
  pourTime,
  towerTime,
  tubeView,
  tubeViews,
  watchWorks,
  worksEvents,
} from '@/components/game/MedalPusher/works';
import { countsShown, drawArms, drawHopper, drawTubeCounts, drawTubes, paintWindows, roundness } from '@/components/game/MedalPusher/works2d';
import { WORKS_PARTS, buildWorks } from '@/components/game/MedalPusher/works3d';
import { getWorksStrings } from '@/components/game/MedalPusher/worksStrings';

const DT = 1 / 60;
const R = MEDAL_RADIUS;
const T = MEDAL_THICKNESS;

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

/** A machine given a prize of `medals` as towers and run until its left tube is in `phase`, a share `into` of the way through it. */
const tubeAt = (medals: number, phase: Tube['phase'], into = 0): Machine => {
  const machine = createMachine(13);
  buildTowers(machine, medals);
  runUntil(machine, (m) => m.stacker.tubes[0].phase === phase, 30);
  if (phase !== 'stacking' && into > 0) runUntil(machine, (m) => m.stacker.tubes[0].phase !== phase || m.stacker.tubes[0].clock >= PHASE_TIME[phase] * into, 5);
  return machine;
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

describe('a tube and its window', () => {
  it('stands in a window cut in a lower corner of the screen, from the deck up, clear of the hold’s lamps and the rails’ slots', () => {
    for (const x of TUBE.x) {
      // Within the screen across, with its frame, and from the deck up into the screen.
      expect(x - WINDOW.half - WINDOW.frame).toBeGreaterThanOrEqual(SCREEN.left);
      expect(x + WINDOW.half + WINDOW.frame).toBeLessThanOrEqual(SCREEN.right);
      expect(WINDOW.top).toBeGreaterThan(SCREEN.foot);
      // The count's plate over it is in the screen's corner too, and the screen's lower quarter at the most.
      expect(WINDOW.top + WINDOW.frame + 0.3 + WINDOW.count.height).toBeLessThan(SCREEN.foot + (SCREEN.top - SCREEN.foot) / 4);
      expect(Math.abs(x - FIELD.width / 2)).toBeGreaterThan(FIELD.width / 2 - SCREEN.left - 2 * (WINDOW.half + WINDOW.frame));
    }
    // The glass and the stack fit the window: a medal and the glass inside the opening, a tower as tall as there are let down under the band.
    expect(GLASS.radius).toBeGreaterThan(R);
    expect(GLASS.radius).toBeLessThan(WINDOW.half);
    expect(PLATFORM.radius).toBeLessThan(GLASS.radius);
    expect(GATE.tall).toBeGreaterThan(STACK.most * T);
    expect(DECK + GATE.tall + GATE.band).toBeLessThan(TUBE.feed);
    expect(WINDOW.top - TUBE.feed).toBeGreaterThan(T * 4);
    // The recess goes back past the tube, which stands behind the wall's face.
    expect(WINDOW.recess).toBeLessThan(TUBE.back - GLASS.radius);
    expect(TUBE.back + GLASS.radius).toBeLessThan(0);
    // The arm is over the medals lying on the deck and under the top of the shortest tower worth pushing.
    expect(ARM.height - ARM.radius * 1.4).toBeGreaterThan(T * 2);
    expect(ARM.height + ARM.radius * 1.4).toBeLessThan(T * 6);
    // The tower comes out of the window through its opening: the mouth is clear of the wall's face by a medal and more.
    expect(TUBE.mouth - R).toBeGreaterThan(0);
    expect(pivotOf(0)).toEqual({ x: TUBE.x[0], y: TUBE.mouth - R });
    // A rail's tip never hangs over a window.
    expect(ARMS.tip - R).toBeGreaterThan(DECK + STACK.most * T);
  });

  it('is at rest with its platform up at the top of the window, its gate shut, no arm out and no count', () => {
    const view = tubeView(idleTube(), 0, undefined, 40);
    expect(view).toEqual({ index: 0, x: TUBE.x[0], platform: TUBE.feed, stacked: 0, dropping: -1, gate: 0, ram: null, boom: null, tower: undefined, count: null, working: false });
    expect(countText(view.count)).toBe('');
    expect(countText(7)).toBe('7');
    expect(countText(123)).toBe('99');
  });

  it('stacks: the platform sinks a medal’s thickness for each, so the top of the stack stays at the top of the window, and the next medal drops onto it', () => {
    const tube: Tube = { ...idleTube(), size: 30, stacked: 12, clock: 0.4 };
    const view = tubeView(tube, 1, undefined, 40);
    expect(view).toMatchObject({ index: 1, x: TUBE.x[1], stacked: 12, dropping: 0.4, gate: 0, ram: null, count: 12, working: true });
    expect(view.platform).toBeCloseTo(TUBE.feed - 12 * T, 9);
    expect(view.platform + view.stacked * T).toBeCloseTo(TUBE.feed, 9);
    // Built, the stack waits for nothing more to drop: none is on its way down.
    expect(tubeView({ ...tube, stacked: 30, clock: 0 }, 1, undefined, 40)).toMatchObject({ dropping: -1, count: 30 });
    // With reduced motion the count goes up a medal at a time and no medal is seen dropping.
    expect(tubeView(tube, 1, undefined, 40, true)).toMatchObject({ dropping: -1, count: 12 });
  });

  it('lets a built tower down to the deck, opens its gate, and pushes it out with its arm: the ram straight out, then the boom across', () => {
    const lowering: Tube = { ...idleTube(), phase: 'lowering', size: 30, stacked: 30, clock: STACK.lowers / 2 };
    const half = tubeView(lowering, 0, undefined, 40);
    expect(half.platform).toBeCloseTo((TUBE.feed - 30 * T + DECK) / 2, 9);
    expect(half).toMatchObject({ stacked: 30, gate: 0, count: 30 });
    expect(tubeView({ ...lowering, phase: 'opening', clock: STACK.opens / 2 }, 0, undefined, 40)).toMatchObject({ platform: DECK, gate: 0.5, count: 30 });
    // The ram brings the tower straight out of the tube; its head is against the tower's back.
    const front = 40;
    const tower = (clock: number): Medal => ({ id: 77, ...armSpot(0, clock, front), level: 1, tier: 0, sinceDrop: -1, stack: 30, ball: false, grown: 1 });
    const out = STACK.pushes * STACK.out * 0.5;
    const ramming = tubeView({ ...idleTube(), phase: 'pushing', clock: out, tower: 77 }, 0, tower(out), front);
    expect(ramming).toMatchObject({ gate: 1, platform: DECK, boom: null, count: 30 });
    expect(ramming.ram).toBeCloseTo(armSpot(0, out, front).y - R, 9);
    // Then the boom from the ram's head pushes it across, its head against the tower's back, on the line from the pivot.
    const across = STACK.pushes * 0.8;
    const pushing = tubeView({ ...idleTube(), phase: 'pushing', clock: across, tower: 77 }, 0, tower(across), front);
    expect(pushing.ram).toBeCloseTo(TUBE.mouth - R, 9);
    const at = armSpot(0, across, front);
    const pivot = pivotOf(0);
    expect(pushing.boom).not.toBeNull();
    const boom = pushing.boom as { x: number; y: number };
    expect(Math.hypot(at.x - boom.x, at.y - boom.y)).toBeCloseTo(R, 6);
    expect((boom.x - pivot.x) * (at.y - pivot.y) - (boom.y - pivot.y) * (at.x - pivot.x)).toBeCloseTo(0, 6);
  });

  it('draws back: the boom folds, the ram withdraws, the gate shuts and the platform rises to the top again', () => {
    const at = (share: number) => tubeView({ ...idleTube(), phase: 'returning', clock: STACK.returns * share }, 0, undefined, 40);
    expect(at(0.1).boom).not.toBeNull();
    expect(at(0.1).gate).toBe(1);
    const ram = at(STACK.back * 0.8);
    expect(ram.boom).toBeNull();
    expect(ram.ram).not.toBeNull();
    expect(ram.ram ?? 0).toBeLessThan(TUBE.mouth - R);
    expect(at(STACK.back + 0.01).ram).toBeNull();
    expect(at(STACK.back + 0.01).gate).toBeGreaterThan(0.9);
    expect(at(0.999).gate).toBe(0);
    expect(at(0.999).platform).toBeGreaterThan(TUBE.feed - 0.1);
    // With reduced motion each part is where it was until its turn is over, and then where it is going.
    const calm = (share: number) => tubeView({ ...idleTube(), phase: 'returning', clock: STACK.returns * share }, 0, undefined, 40, true);
    expect(calm(STACK.back * 0.3).boom).not.toBeNull();
    expect(calm(STACK.back + 0.01)).toMatchObject({ gate: 1, platform: DECK });
    expect(calm(0.999)).toMatchObject({ gate: 0, platform: DECK });
  });

  it('says which tower an arm is pushing, so that whoever draws the towers leaves that one to the arm', () => {
    const machine = tubeAt(30, 'pushing', 0.5);
    const pushed = machine.stacker.tubes[0].tower;
    const tower = machine.medals.find((medal) => medal.id === pushed) as Medal;
    expect(onArm(machine, tower)).toBe(true);
    expect(offArms(machine, machine.medals)).toHaveLength(machine.medals.length - 1);
    expect(offArms(machine, machine.medals).some((medal) => medal.id === pushed)).toBe(false);
    const views = tubeViews(machine, pusherFront(machine.time));
    expect(views[0].tower).toBe(tower);
    expect(views[1].tower).toBeUndefined();
    const idle = createMachine(13);
    expect(offArms(idle, idle.medals)).toBe(idle.medals);
  });

  it('takes a prize from paid to out as the works say: stacking, then the cycle', () => {
    expect(towerTime(30)).toBeCloseTo(30 / STACK.perSecond + CYCLE, 9);
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

  it('says each medal that drops into a tube, and the tower let down, its gate open, pushed out, set in its place, and the gate shut, at their times', () => {
    const session = createSession(5, { balls: 0 });
    const events: { event: SessionEvent; at: number }[] = [];
    buildTowers(session.machine, 30);
    for (let i = 0; i < 60 * 12; i++) {
      if (i < 60 * towerTime(30) - 1) expect(isBusy(session)).toBe(true);
      const step: SessionEvent[] = [];
      advance(session, DT, step);
      for (const event of step) events.push({ event, at: (i + 1) * DT });
    }
    const works = events.filter(({ event }) => ['stacked', 'towerDown', 'gateOpen', 'towerOut', 'towerSet', 'gateShut'].includes(event.type));
    const stacked = works.filter(({ event }) => event.type === 'stacked');
    // Every medal dropping in is told, a step at a time, and they add up to the tower.
    expect(stacked.reduce((sum, { event }) => sum + (event.type === 'stacked' ? event.medals : 0), 0)).toBe(30);
    expect(stacked.every(({ event }) => event.type === 'stacked' && event.tube === 0 && event.medals === 1)).toBe(true);
    const rest = works.filter(({ event }) => event.type !== 'stacked');
    expect(rest.map(({ event }) => event)).toEqual([
      { type: 'towerDown', tube: 0, medals: 30 },
      { type: 'gateOpen', tube: 0 },
      { type: 'towerOut', tube: 0, medals: 30 },
      { type: 'towerSet', tube: 0, medals: 30 },
      { type: 'gateShut', tube: 0 },
    ]);
    const at = rest.map((one) => one.at);
    const near = (seen: number, meant: number) => expect(Math.abs(seen - meant)).toBeLessThanOrEqual(3 * DT);
    near(at[0], 30 / STACK.perSecond);
    near(at[1] - at[0], STACK.lowers);
    near(at[2] - at[1], STACK.opens);
    near(at[3] - at[2], STACK.pushes);
    near(at[4] - at[3], STACK.back * STACK.returns);
  });

  it('says it all within one long step too, in order, and a tube found at work says only what it does from then on', () => {
    const machine = createMachine(5);
    const before = watchWorks(machine);
    buildTowers(machine, 20);
    for (let i = 0; i < 60 * 3.5; i++) step(machine, DT);
    const told = worksEvents(before, machine);
    expect(told[0]).toEqual({ type: 'stacked', tube: 0, medals: 20 });
    expect(told.slice(1)).toEqual([
      { type: 'towerDown', tube: 0, medals: 20 },
      { type: 'gateOpen', tube: 0 },
      { type: 'towerOut', tube: 0, medals: 20 },
    ]);
    const during = watchWorks(machine);
    step(machine, DT);
    expect(worksEvents(during, machine)).toEqual([]);
  });

  it('stacks a big chest in a tube, exactly what the chest held, and pushes it out as one tower', () => {
    const session = createSession(5, { balls: 0, quickPick: true });
    const start = medalsOnField(session.machine);
    const prize = Math.max(...CHESTS);
    session.bonus = { kind: 'chest', prizes: [prize, prize, prize], fallback: 0, picked: -1, elapsed: 0, pickedAt: -1, told: false, payout: -1 };
    const events: SessionEvent[] = [];
    for (let i = 0; i < 60 * (TIMING.choose + 30) && of(events, 'towerSet').length === 0; i++) advance(session, DT, events);
    expect(of(events, 'chestEnd')).toMatchObject([{ payout: prize }]);
    expect(towerSizes(prize)).toEqual([prize]);
    expect(of(events, 'towerOut')).toEqual([{ type: 'towerOut', tube: 0, medals: prize }]);
    expect(of(events, 'towerSet')).toEqual([{ type: 'towerSet', tube: 0, medals: prize }]);
    expect(events.findIndex((event) => event.type === 'towerOut')).toBeGreaterThan(events.findIndex((event) => event.type === 'chestEnd'));
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

  it.each(ENDS)('deliver %s as its announcement says: that many poured while the prize is still on the screen, and the rest stacked and pushed out', { timeout: 60_000 }, (_name, way, jackpot, payout) => {
    const session = nearTheDrop(way);
    const start = medalsOnField(session.machine);
    const said: { step: number; event: SessionEvent; up: boolean }[] = [];
    let gone = 0;
    let thrown = 0;
    let poured = 0;
    const inAir = new Set<number>();
    let freed = -1;
    for (let step = 1; step <= 60 * 45; step++) {
      const events: SessionEvent[] = [];
      const busy = session.roulette !== null;
      advance(session, DT, events);
      // Nothing else is paid meanwhile: what the towers push through a pocket starts no spin. This is about the prize.
      session.riding.length = 0;
      session.stock = 0;
      session.gold = 0;
      for (const event of events) {
        if (event.type === 'won' || event.type === 'lost') gone += event.count;
        if (event.type === 'bowlEnd' || event.type === 'pourStart' || event.type === 'pourEnd' || event.type === 'towerOut' || event.type === 'towerSet') said.push({ step, event, up: bowlPrizeUp(session.roulette) });
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
    // The bowls say how the prize is split: the share that is always loose, and what the tubes have no room for.
    const loose = pouredOf(payout);
    const towers = towerSizes(payout - loose);
    const stacked = towers.reduce((sum, size) => sum + size, 0);
    const [end, ...works] = said;
    expect(end.event).toEqual({ type: 'bowlEnd', bowl: way.length - 1, hole: way[way.length - 1], payout, poured: payout - stacked, total: 40 + payout, jackpot });
    expect(session.paidOut).toBe(payout);
    // Every tower comes out of a tube and is set in its place, each as tall as it was stacked.
    const out = works.filter(({ event }) => event.type === 'towerOut');
    expect(out.map(({ event }) => (event.type === 'towerOut' ? event.medals : 0)).sort((a, b) => a - b)).toEqual([...towers].sort((a, b) => a - b));
    expect(works.filter(({ event }) => event.type === 'towerSet')).toHaveLength(towers.length);
    // The first is out some seconds on: stacked, let down and its gate opened.
    expect(Math.abs((out[0].step - end.step) * DT - (Math.max(...towers.slice(0, 2)) / STACK.perSecond + STACK.lowers + STACK.opens))).toBeLessThanOrEqual(3 * DT + 1 / STACK.perSecond);
    const pours = works.filter(({ event }) => event.type === 'pourStart' || event.type === 'pourEnd');
    if (payout - stacked >= POUR.threshold) {
      // What is said to be poured is what the hopper pours: its doors drop open in the next step for exactly that
      // many, nothing having been waiting, and they are the medals that come out of them.
      expect(pours.map(({ event }) => event)).toEqual([
        { type: 'pourStart', medals: payout - stacked },
        { type: 'pourEnd', medals: payout - stacked },
      ]);
      expect(pours[0].step).toBe(end.step + 1);
      expect([poured, thrown]).toEqual([payout - stacked, 0]);
      expect(session.machine.hopper).toEqual({ phase: 'shut', clock: 0, pours: 1, poured: payout - stacked });
      // The pour is over while the prize is still up, so the doors add no announcement of their own to the prize's.
      expect(pours.every(({ up }) => up)).toBe(true);
      for (const pour of pours) expect((pour.step - end.step) * DT).toBeLessThan(bowlShowTime(jackpot) - 1);
    } else {
      // Fifteen are too few to open the doors for. They are paid loose all the same, out of the slot under the hood.
      expect(payout - stacked).toBe(15);
      expect(pours).toEqual([]);
      expect([poured, thrown]).toEqual([0, payout - stacked]);
      expect(session.machine.hopper).toEqual(shutHopper());
    }
    expect(Math.abs((freed - end.step) * DT - bowlShowTime(jackpot))).toBeLessThanOrEqual(2 * DT);
    expect(session.machine.payoutQueue).toBe(0);
    expect(medalsInTubes(session.machine.stacker)).toBe(0);
  });

  it('pour what the tubes have no room for along with the share that is always loose, and say that number', () => {
    // The tubes are full, so a hundred medals have nowhere to be stacked.
    const session = nearTheDrop([0, 1]);
    buildTowers(session.machine, TUBE_ROOM * TOWER.max);
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
  it('stack the jewel bonus in a tube like any tower, three medals, and push it out a few seconds on', () => {
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
    expect([session.jewels, session.jewelBonuses, jewelsOnField(session.machine)]).toEqual([0, 1, 0]);
    expect(session.machine.stacker.tubes[0]).toMatchObject({ phase: 'stacking', size: JEWEL.bonus });
    let steps = 0;
    while (!events.some((event) => event.type === 'towerSet') && steps < 600) {
      advance(session, DT, events);
      steps += 1;
    }
    expect(events).toContainEqual({ type: 'towerOut', tube: 0, medals: JEWEL.bonus });
    expect(events).toContainEqual({ type: 'towerSet', tube: 0, medals: JEWEL.bonus });
    expect(Math.abs(steps * DT - (JEWEL.bonus / STACK.perSecond + STACK.lowers + STACK.opens + STACK.pushes))).toBeLessThanOrEqual(4 * DT);
    const tower = session.machine.medals.find((medal) => medal.stack === JEWEL.bonus);
    expect(tower).toBeDefined();
    // Nothing was poured for it, and its three medals are on the field or have left it since.
    expect(events.some((event) => event.type === 'pourStart')).toBe(false);
    const gone = events.reduce((sum, event) => sum + (event.type === 'won' || event.type === 'lost' ? event.count : 0), 0);
    expect(session.paidOut).toBe(JEWEL.bonus);
    expect(medalsOnField(session.machine) + gone).toBe(start + JEWEL.bonus);
  });

  it('pour past a jewel on the lower table without taking it for a medal: it is neither poured nor counted', () => {
    const session = createSession(5, { balls: 0, jewels: 2 });
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

  it('lays the windows on the background once: a recess, the far side of the glass, a frame and the count’s plate for each', () => {
    const { g, calls, count } = recorder();
    paintWindows(g, 1);
    // For each: the recess, its top and two jambs, its floor, the glass, four bars of frame and the top bar, the slot, and the plate.
    expect(count('fill')).toBe(2 * (1 + 1 + 2 + 1 + 5 + 1 + 1));
    expect(count('fillRect')).toBe(2);
    expect(count('stroke')).toBe(2);
    // Each window is drawn about its own tube: the first of its points is to the left of its tube and the right of the screen's edge.
    const moves = calls.filter((call) => call.name === 'moveTo').map((call) => call.args[0] as number);
    const left = project(TUBE.x[0] - WINDOW.half, WINDOW.top, 0).x;
    expect(moves[0]).toBeCloseTo(left, 6);
    expect(project(SCREEN.left, WINDOW.top, 0).x).toBeLessThan(left);
  });

  it('draws in each window the platform, the stack on it and the medal dropping onto it, and the glass in front, the gate as far aside as it has slid', () => {
    const machine = tubeAt(80, 'stacking');
    runUntil(machine, (m) => m.stacker.tubes[0].stacked >= 12 && m.stacker.tubes[0].clock > 0.2);
    const { g, count } = recorder();
    const columns: { x: number; depth: number; floor: number; stacked: number }[] = [];
    const stamped: number[] = [];
    drawTubes(g, 1, machine, pusherFront(machine.time), false, 0, (x, depth, floor, stacked) => columns.push({ x, depth, floor, stacked }), (_point, _round, id) => stamped.push(id));
    const [left, right] = machine.stacker.tubes;
    expect(columns).toEqual([
      { x: TUBE.x[0], depth: TUBE.back, floor: TUBE.feed - left.stacked * T, stacked: left.stacked },
      { x: TUBE.x[1], depth: TUBE.back, floor: TUBE.feed - right.stacked * T, stacked: right.stacked },
    ]);
    // A medal is on its way down into each.
    expect(stamped).toHaveLength(2);
    // Each window is clipped to, and its glass is two panes: over the gate, and the gate, which is shut.
    expect(count('clip')).toBe(2);
    expect(count('fillRect')).toBe(2 * (1 + 2 + 1));
    // With reduced motion no medal is seen dropping.
    const calm: number[] = [];
    drawTubes(recorder().g, 1, machine, pusherFront(machine.time), true, 0, () => undefined, (_point, _round, id) => calm.push(id));
    expect(calm).toEqual([]);
    // At rest, a window is its platform at the top and its glass: no stack, nothing dropping.
    const idle = recorder();
    const none: number[] = [];
    drawTubes(idle.g, 1, createMachine(3), 40, false, 0, () => none.push(1), () => none.push(2));
    expect(none).toEqual([]);
  });

  it('draws no arm at rest, and an arm out of its window with the tower it pushes, over the medals', () => {
    const idle = recorder();
    const drawn: Medal[] = [];
    drawArms(idle.g, 1, createMachine(3), 40, false, 0, (tower) => drawn.push(tower));
    expect(idle.calls).toEqual([{ name: 'setTransform', args: [1, 0, 0, 1, 0, 0] }]);
    expect(drawn).toEqual([]);
    const machine = tubeAt(30, 'pushing', 0.7);
    const { g, count } = recorder();
    drawArms(g, 1, machine, pusherFront(machine.time), false, 0, (tower) => drawn.push(tower));
    const pushed = machine.medals.find((medal) => medal.id === machine.stacker.tubes[0].tower) as Medal;
    expect(drawn[0]).toBe(pushed);
    // The ram and the boom, each a dark rod with a bright one along it, and the plate on the boom's head.
    expect(count('stroke')).toBe(2 * 2 + 1);
  });

  it('lights the counts over the windows, over a plate whose digits are unlit at rest', () => {
    const idle = recorder();
    drawTubeCounts(idle.g, 1, createMachine(3), 40, false, 0);
    expect(idle.calls.filter((call) => call.name === 'fillText').map((call) => call.args[0])).toEqual(['88', '88']);
    expect(countsShown(createMachine(3), 40, false)).toBe('|');
    const machine = tubeAt(80, 'stacking');
    runUntil(machine, (m) => m.stacker.tubes[0].stacked >= 12);
    const { g, calls } = recorder();
    drawTubeCounts(g, 1, machine, pusherFront(machine.time), false, 0);
    const [left, right] = machine.stacker.tubes;
    expect(calls.filter((call) => call.name === 'fillText').map((call) => call.args[0])).toEqual(['88', String(left.stacked), '88', String(right.stacked)]);
    expect(countsShown(machine, pusherFront(machine.time), false)).toBe(`${left.stacked}|${right.stacked}`);
  });
});

describe('the payout works in the 3D scene', () => {
  const build = (machine: Machine, calm = false, front = pusherFront(machine.time)) => {
    const solid = new Solid(64);
    solid.quad(0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0);
    const flat = new Flat(64);
    const beads = createRows(BEAD_STRIDE, 8);
    const medals = createRows(MEDAL_STRIDE, 8);
    buildWorks(solid, flat, beads, machine, front, calm, medals);
    const all = Array.from({ length: beads.count }, (_, i) => ({ x: beads.data[i * BEAD_STRIDE], y: beads.data[i * BEAD_STRIDE + 1], z: beads.data[i * BEAD_STRIDE + 2], kind: beads.data[i * BEAD_STRIDE + 7] }));
    const rows = Array.from({ length: medals.count }, (_, i) => ({ x: medals.data[i * MEDAL_STRIDE], y: medals.data[i * MEDAL_STRIDE + 1], z: medals.data[i * MEDAL_STRIDE + 2], light: medals.data[i * MEDAL_STRIDE + 10] }));
    const corners = Array.from({ length: solid.count }, (_, i) => {
      const d = solid.data.subarray(i * SOLID_STRIDE, (i + 1) * SOLID_STRIDE);
      return { x: d[0], y: d[1], z: d[2], glow: d[12] };
    });
    const touches = Array.from({ length: flat.count }, (_, i) => {
      const d = flat.data.subarray(i * FLAT_STRIDE, (i + 1) * FLAT_STRIDE);
      return { x: d[0], y: d[1], z: d[2], shine: d[7] };
    });
    // The doors' two lamps come first, then the lamps at the corners of the windows: two to each.
    return { solid, flat, bulbs: all.slice(0, 2), windowLamps: all.slice(2), rows, corners, touches };
  };

  it('adds its surfaces after the cabinet’s own: a lamp beside each door and two at the top of each window, all dark at rest, and the glass of the tubes', () => {
    const machine = createMachine(7);
    const { solid, bulbs, windowLamps, rows, touches } = build(machine);
    const [part] = WORKS_PARTS;
    expect(part).toMatchObject({ art: 'plain', first: 6 });
    expect(part.count % 6).toBe(0);
    expect(part.first + part.count).toBe(solid.count);
    expect(bulbs.map((bulb) => bulb.kind)).toEqual([BEAD.bulb(0.06), BEAD.bulb(0.06)].map(Math.fround));
    expect(bulbs[0].x).toBeLessThan(DOORS[0].from);
    expect(bulbs[1].x).toBeGreaterThan(DOORS[1].to);
    expect(windowLamps).toHaveLength(4);
    expect(windowLamps.every((lamp) => lamp.kind === Math.fround(BEAD.bulb(0.06)))).toBe(true);
    expect(windowLamps.every((lamp) => lamp.y > WINDOW.top)).toBe(true);
    // No medal in an empty tube.
    expect(rows).toEqual([]);
    // The glass: the far half of each tube all the way up and the near half over the gate, and the gate itself, each
    // a little light; and nothing else glows. Every pane is round its tube, behind the wall's face.
    const glass = touches.slice(2 * 3 * 3);
    expect(glass.length).toBeGreaterThan(0);
    for (const pane of glass) {
      expect(Math.min(...TUBE.x.map((x) => Math.abs(pane.x - x)))).toBeLessThanOrEqual(GLASS.radius + 1e-4);
      expect(pane.z).toBeLessThan(0);
      expect(pane.y).toBeGreaterThanOrEqual(DECK - 1e-4);
      expect(pane.y).toBeLessThanOrEqual(WINDOW.top + 1e-4);
    }
  });

  it('copies the glass that never moves into every frame as it was made once: the same numbers whatever the machine is doing', () => {
    const atRest = build(createMachine(7));
    const atWork = build(tubeAt(40, 'stacking'));
    const fixed = (flat: Flat) => Array.from(flat.data.subarray(2 * 3 * 3 * FLAT_STRIDE, (2 * 3 * 3 + 40) * FLAT_STRIDE));
    expect(fixed(atWork.flat)).toEqual(fixed(atRest.flat));
  });

  it('writes the stack in a tube medal by medal, from the platform up, a little darker in the recess, and the medal dropping onto it', () => {
    const machine = tubeAt(80, 'stacking');
    runUntil(machine, (m) => m.stacker.tubes[0].stacked >= 12 && m.stacker.tubes[0].clock > 0.2);
    const { rows, windowLamps } = build(machine);
    const [left, right] = machine.stacker.tubes;
    expect(rows).toHaveLength(left.stacked + right.stacked + 2);
    const inLeft = rows.filter((row) => Math.abs(row.x - TUBE.x[0]) < 0.2);
    const platform = TUBE.feed - left.stacked * T;
    const heights = inLeft.map((row) => row.y).sort((a, b) => a - b);
    expect(heights[0]).toBeCloseTo(platform + T / 2, 4);
    expect(heights[left.stacked - 1]).toBeCloseTo(platform + (left.stacked - 0.5) * T, 4);
    // The one dropping is over the stack and under the top of the window.
    expect(heights[left.stacked]).toBeGreaterThan(TUBE.feed);
    expect(heights[left.stacked]).toBeLessThan(WINDOW.top);
    expect(rows.every((row) => row.light < 1 && Math.abs(row.z - TUBE.back) < 0.2)).toBe(true);
    // The tubes are at work: their windows' lamps are lit.
    expect(windowLamps.every((lamp) => lamp.kind === Math.fround(BEAD.bulb(1)))).toBe(true);
  });

  it('builds the arm out of its window, the ram and the boom, over the medals lying on the deck', () => {
    const machine = tubeAt(30, 'pushing', 0.7);
    const { solid, corners } = build(machine);
    const arm = corners.filter((corner) => corner.y > DECK + ARM.height - ARM.radius * 1.5 - 1e-3 && corner.y < DECK + ARM.height + ARM.radius * 1.5 + 1e-3 && corner.z > WINDOW.recess - 1e-3);
    expect(arm.length).toBeGreaterThan(0);
    const reach = Math.max(...arm.map((corner) => corner.z));
    expect(reach).toBeGreaterThan(TUBE.mouth);
    // Reduced motion moves nothing the arm does: it is where its tower is.
    expect(build(machine, true).solid.count).toBe(solid.count);
  });

  it('lights the lamps and lets the stays out while the hopper is at work', () => {
    const rest = build(createMachine(7));
    const atWork = build(pouring());
    expect(atWork.bulbs.map((bulb) => bulb.kind)).toEqual([BEAD.bulb(1), BEAD.bulb(1)].map(Math.fround));
    // Two stays to a door, and a glow for each lamp in place of the arrows. The tubes are as they were.
    expect(atWork.solid.count).toBe(rest.solid.count + 2 * 2 * 6);
    expect(atWork.flat.count).toBe(rest.flat.count - 2 * 3 * 3 + 2 * 6);
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
      expect(t.sayTowerOut(37, 0)).toContain('37');
      expect(t.sayTowerOut(37, 0)).not.toBe(t.sayTowerOut(37, 1));
      const lines = t.howItPays(POUR.threshold);
      expect(lines).toHaveLength(3);
      expect(lines[1]).toContain(String(POUR.threshold));
    }
    expect(getWorksStrings('ja').sayPoured(60)).not.toBe(getWorksStrings('en').sayPoured(60));
    expect(getWorksStrings('en').sayTowerOut(1, 0)).toContain('1 medal ');
    // Nothing is said of hatches or lifts any more: a tower is stacked in a window and pushed out.
    for (const language of ['en', 'ja'] as const) {
      const said = getWorksStrings(language).howItPays(POUR.threshold).join(' ');
      expect(said).not.toMatch(/hatch|lift|guard|ハッチ|ガード|せり上/);
      expect(said).toMatch(language === 'en' ? /window/ : /窓/);
    }
  });
});
