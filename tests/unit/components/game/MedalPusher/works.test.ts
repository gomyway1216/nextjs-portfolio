import { describe, expect, it } from 'vitest';

import { HATCH } from '@/components/game/MedalPusher/arms';
import { Flat, SOLID_STRIDE, Solid } from '@/components/game/MedalPusher/cabinet3d';
import { MEDAL_RADIUS, MEDAL_THICKNESS, TOWER, buildTowers, createMachine, medalsOnField, pusherFront, queuePayout, step, type FallingMedal, type Machine, type Medal } from '@/components/game/MedalPusher/engine';
import { DOORS, POUR, channelX } from '@/components/game/MedalPusher/hopper';
import { LIFT, holds } from '@/components/game/MedalPusher/lift';
import { BOARD, CHESTS, FEVER_SQUARE } from '@/components/game/MedalPusher/lottery';
import { BEAD, BEAD_STRIDE, LANDED, MEDAL_STRIDE, createRows, writeMedals } from '@/components/game/MedalPusher/scene3d';
import { TIMING, advance, createSession, isBusy, sugorokuDuration, type SessionEvent } from '@/components/game/MedalPusher/session';
import { HEIGHT, HOUSING, project, type Projected } from '@/components/game/MedalPusher/view';
import { CHUTE_SLOPE, DECK, DOOR, GUARD, POUR_WAY, chuteShows, doorLampLit, doorOf, doorSwing, liftViews, onFlap, pourPose, pourTime, watchWorks, worksEvents } from '@/components/game/MedalPusher/works';
import { drawHopper, drawLifts, roundness } from '@/components/game/MedalPusher/works2d';
import { WORKS_PARTS, buildWorks } from '@/components/game/MedalPusher/works3d';
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
  it('has a sleeve as high as its tower will be and a little over, up while it holds the tower', () => {
    const machine = createMachine(13);
    expect(liftViews(machine, pusherFront(machine.time))).toEqual([]);
    buildTowers(machine, 60);
    const front = () => pusherFront(machine.time);
    const start = liftViews(machine, front());
    expect(start).toHaveLength(3);
    for (const view of start) {
      expect(view).toMatchObject({ rim: 0, working: true, full: 20 * MEDAL_THICKNESS + GUARD.over });
      expect(view.tower).toMatchObject({ id: view.id, x: view.x, y: view.y, stack: 1 });
    }
    // Back to front.
    expect(start.map((view) => view.y)).toEqual([...start.map((view) => view.y)].sort((a, b) => a - b));
    runUntil(machine, (m) => m.lifts[0].wait === 0);
    const up = liftViews(machine, front());
    for (const view of up) {
      expect(view.rim).toBeCloseTo(view.full, 9);
      expect(view.full).toBeGreaterThan(TOWER.max * MEDAL_THICKNESS * 0.7);
      expect(view.y).toBeCloseTo((view.tower as Medal).y, 6);
    }
    runUntil(machine, (m) => m.lifts.every((lift) => !holds(lift)) && m.lifts[0].sunk > LIFT.closes / 2);
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

  it('with reduced motion has its sleeve all the way up from the first moment', () => {
    const machine = createMachine(13);
    buildTowers(machine, 25);
    const [view] = liftViews(machine, pusherFront(machine.time), true);
    expect(view.rim).toBe(view.full);
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

  it('says when towers start up on their lifts and when they stand built', () => {
    const session = createSession(5, { balls: 0 });
    const events: SessionEvent[] = [];
    // A prize is paid in the middle of a step, so the lifts are told by looking before and after.
    const before = watchWorks(session.machine);
    buildTowers(session.machine, 50);
    expect(worksEvents(before, session.machine)).toEqual([{ type: 'towersRise', towers: 2, medals: 50 }]);
    // The machine is busy for as long as a lift is at work, the guards' way down included.
    for (let i = 0; i < 600 && session.machine.lifts.length > 0; i++) {
      expect(isBusy(session)).toBe(true);
      advance(session, DT, events);
    }
    expect(session.machine.lifts).toEqual([]);
    // They were at work already when the first of these steps began, so they are not said to start again.
    expect(of(events, 'towersRise')).toEqual([]);
    expect(of(events, 'towersReady')).toEqual([{ type: 'towersReady', towers: 2 }]);
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

  it('draws nothing of the lifts while none is at work, and a guard for each one that is', () => {
    const idle = recorder();
    drawLifts(idle.g, 1, createMachine(13), 40, false, 0, () => {
      throw new Error('no tower to draw again');
    });
    expect(idle.calls).toEqual([]);

    const machine = createMachine(13);
    buildTowers(machine, 60);
    runUntil(machine, (m) => m.lifts[0].wait === 0);
    const { g, count } = recorder();
    const again: number[] = [];
    drawLifts(g, 1, machine, pusherFront(machine.time), false, 0, (tower) => again.push(tower.id));
    // The ring, the sleeve and its two edges, the far rim, the collar and the lamp, for each of the three.
    expect(count('fill')).toBe(3 * 3);
    expect(count('stroke')).toBe(3 * 3);
    // The three stand side by side in one row: none is in front of another.
    expect(again).toEqual([]);
  });

  it('draws a tower that stands nearer than a guard, and across it, again over the guard', () => {
    const machine = createMachine(13);
    buildTowers(machine, 25);
    runUntil(machine, (m) => m.lifts[0].wait === 0);
    const [lift] = machine.lifts;
    const front = pusherFront(machine.time);
    const near: Medal = { id: 9001, x: lift.x + 2, y: front - lift.behind + 5, level: 1, tier: 0, sinceDrop: -1, stack: 12, grow: 0, ball: false, grown: 1 };
    const aside: Medal = { ...near, id: 9002, x: lift.x + 30 };
    const behind: Medal = { ...near, id: 9003, y: front - lift.behind - 5 };
    const flat: Medal = { ...near, id: 9004, stack: 1 };
    machine.medals.push(near, aside, behind, flat);
    const again: number[] = [];
    drawLifts(recorder().g, 1, machine, front, false, 0, (tower) => again.push(tower.id));
    expect(again).toEqual([9001]);
  });
});

describe('the payout works in the 3D scene', () => {
  const build = (machine: Machine, calm = false) => {
    const solid = new Solid(64);
    solid.quad(0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0);
    const flat = new Flat(64);
    const beads = createRows(BEAD_STRIDE, 8);
    buildWorks(solid, flat, beads, machine, pusherFront(machine.time), calm);
    const bulbs = Array.from({ length: beads.count }, (_, i) => ({ x: beads.data[i * BEAD_STRIDE], y: beads.data[i * BEAD_STRIDE + 1], z: beads.data[i * BEAD_STRIDE + 2], kind: beads.data[i * BEAD_STRIDE + 7] }));
    return { solid, flat, bulbs };
  };

  it('adds its surfaces after the cabinet’s own, and a lamp beside each door, dark while the hopper rests', () => {
    const { solid, flat, bulbs } = build(createMachine(7));
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
    // Shut, each plate shows its three arrows and nothing glows.
    expect(flat.count).toBe(2 * 3 * 3);
  });

  it('lights the lamps and lets the stays out while the hopper is at work', () => {
    const rest = build(createMachine(7));
    const atWork = build(pouring());
    expect(atWork.bulbs.map((bulb) => bulb.kind)).toEqual([BEAD.bulb(1), BEAD.bulb(1)].map(Math.fround));
    // Two stays to a door, and a glow for each lamp in place of the arrows.
    expect(atWork.solid.count).toBe(rest.solid.count + 2 * 2 * 6);
    expect(atWork.flat.count).toBe(2 * 6);
  });

  it('stands a ring, a sleeve, a collar and a lamp at every lift that is at work', () => {
    const machine = createMachine(13);
    const none = build(machine);
    buildTowers(machine, 60);
    // Before the guards are up there is only the lit ring in the deck at each.
    const rings = build(machine);
    expect(rings.bulbs).toHaveLength(2);
    expect(rings.solid.count).toBeGreaterThan(none.solid.count);
    runUntil(machine, (m) => m.lifts[0].wait === 0);
    const up = build(machine);
    expect(up.bulbs).toHaveLength(2 + 3);
    const views = liftViews(machine, pusherFront(machine.time));
    for (const [index, view] of views.entries()) {
      const lamp = up.bulbs[2 + index];
      expect(lamp.x).toBeCloseTo(view.x, 4);
      expect(lamp.z).toBeGreaterThan(view.y + GUARD.radius);
      expect(lamp.y).toBeGreaterThan(DECK + view.rim - GUARD.collar - 1e-3);
      expect(lamp.kind).toBe(Math.fround(BEAD.bulb(1)));
    }
    expect(up.solid.count).toBeGreaterThan(rings.solid.count);
    expect(up.flat.count).toBeGreaterThan(rings.flat.count);
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
