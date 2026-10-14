import { describe, expect, it } from 'vitest';

import { ARMS } from '@/components/game/MedalPusher/arms';
import { CHECKERS, FIELD, MEDAL_RADIUS, MEDAL_THICKNESS, TOWER, buildTowers, checkerAt, createMachine, medalsOnField, pusherFront, step, type Machine } from '@/components/game/MedalPusher/engine';
import {
  CYCLE,
  PHASE_TIME,
  STACK,
  TUBE,
  TUBE_PHASES,
  TUBE_ROOM,
  armSpot,
  busyFor,
  idleStacker,
  medalsInTubes,
  stackTowers,
  stackerBusy,
  towerSizes,
  towersIn,
  type Tube,
} from '@/components/game/MedalPusher/stacker';
import { HEIGHT, SCREEN } from '@/components/game/MedalPusher/view';

const DT = 1 / 60;
const R = MEDAL_RADIUS;

/** Runs a machine until `when` says, or for `most` seconds. */
function runUntil(machine: Machine, when: (machine: Machine) => boolean, most = 30, gather = false): Machine {
  for (let i = 0; i < most * 60 && !when(machine); i++) step(machine, DT, false, gather);
  return machine;
}

/** What is left on the field and in the tubes, and what has left the field, all told: no medal is made or lost. */
const everything = (machine: Machine, gone: { won: number; lost: number }): number => medalsOnField(machine) + gone.won + gone.lost;

describe('the tower tubes', () => {
  it('stand in the screen’s lower corners, a tube’s width in from its sides, behind the face of the wall', () => {
    expect(TUBE.x[0]).toBeGreaterThan(SCREEN.left + R);
    expect(TUBE.x[1]).toBeLessThan(SCREEN.right - R);
    expect(TUBE.x[0] + TUBE.x[1]).toBe(FIELD.width);
    // A tube is behind the wall's face, a medal's radius and the glass back.
    expect(TUBE.back).toBeCloseTo(-(R + 1.2), 9);
    // The top of a stack being built is in the screen, where the count is.
    expect(TUBE.feed).toBeGreaterThan(SCREEN.foot);
  });

  it('leave a tower in the middle of the field, between two START pockets, a little behind the lip', () => {
    for (const site of TUBE.site) {
      expect(checkerAt(site)).toBe(-1);
      expect(Math.min(...CHECKERS.positions.map((x) => Math.abs(site - x)))).toBeGreaterThanOrEqual(7);
    }
    expect(TUBE.site[0] + TUBE.site[1]).toBe(FIELD.width);
    expect(TUBE.behind).toBeGreaterThan(R);
    // A tube's middle is a medal's radius and the glass behind the wall's face, and the arm brings a tower out clear
    // of the window's edges. The engine reads this file before it has a medal's size, so these are numbers of their
    // own, and they are held to the medal's here.
    expect(TUBE.back).toBeCloseTo(-(R + 1.2), 9);
    expect(TUBE.mouth).toBeCloseTo(R + 0.6, 9);
  });

  it('build towers as tall as the feed arms let them stand: under the medal at a tip, four and a half times as tall as a medal is wide', () => {
    expect(TOWER.max).toBe(STACK.most);
    expect(HEIGHT.pusher + STACK.most * MEDAL_THICKNESS).toBeLessThan(ARMS.tip - R);
    // And no shorter than that leaves room for: one medal more would not stand under a tip.
    expect(HEIGHT.pusher + (STACK.most + 2) * MEDAL_THICKNESS).toBeGreaterThan(ARMS.tip - R);
    expect((STACK.most * MEDAL_THICKNESS) / (2 * R)).toBeGreaterThan(4.5);
    // A stack as tall as a tower can be fits the tube with the platform let down, and over it the gate.
    expect(TUBE.feed - STACK.most * MEDAL_THICKNESS).toBeGreaterThan(HEIGHT.pusher);
  });

  it('stack a medal at a time at a pace that can be watched, and take a few seconds over a tower', () => {
    expect(STACK.perSecond).toBeGreaterThanOrEqual(8);
    expect(STACK.perSecond).toBeLessThanOrEqual(15);
    expect(CYCLE).toBeCloseTo(PHASE_TIME.lowering + PHASE_TIME.opening + PHASE_TIME.pushing + PHASE_TIME.returning, 9);
    expect(STACK.most / STACK.perSecond + CYCLE).toBeLessThan(10);
  });
});

describe('splitting a prize into towers', () => {
  it('makes as few towers as hold it, as even as they can be, for as many as the tubes take on', () => {
    expect(towerSizes(0)).toEqual([]);
    expect(towerSizes(30)).toEqual([30]);
    expect(towerSizes(STACK.most)).toEqual([STACK.most]);
    expect(towerSizes(STACK.most + 1)).toEqual([33, 32]);
    expect(towerSizes(70)).toEqual([35, 35]);
    expect(towerSizes(130)).toEqual([44, 43, 43]);
    expect(towerSizes(1000)).toEqual(Array.from({ length: TUBE_ROOM }, () => STACK.most));
    expect(towerSizes(100, 1)).toEqual([STACK.most]);
    expect(() => towerSizes(-1)).toThrow();
    expect(() => towerSizes(1.5)).toThrow();
  });

  it('puts each tower in the tube that will be free soonest, by turns when they are equal, and no more than a tube holds', () => {
    const stacker = idleStacker();
    expect(stackTowers(stacker, 90)).toBe(90);
    expect(stacker.tubes.map((tube) => [tube.size, tube.waiting])).toEqual([
      [45, []],
      [45, []],
    ]);
    // One more: it goes to whichever is done sooner. They are level, so the one whose turn it is takes it.
    expect(stackTowers(stacker, 20)).toBe(20);
    expect(stacker.tubes[0].waiting).toEqual([20]);
    // A jackpot's worth: the tubes take as many towers as they have room for, and what they do not take is left.
    const taken = stackTowers(stacker, 500);
    expect(stacker.tubes.map(towersIn)).toEqual([STACK.queue, STACK.queue]);
    expect(taken).toBe((2 * STACK.queue - 3) * STACK.most);
    expect(medalsInTubes(stacker)).toBe(90 + 20 + taken);
  });

  it('with `gather`, goes on top of an open tower first, the taller of two, and only then makes new ones', () => {
    const stacker = idleStacker();
    stackTowers(stacker, 10, true);
    expect(stacker.tubes.map((tube) => tube.size)).toEqual([10, 0]);
    stackTowers(stacker, 20, true);
    expect(stacker.tubes.map((tube) => tube.size)).toEqual([30, 0]);
    // As tall as a tower can be, and the rest a tower of its own in the other tube.
    stackTowers(stacker, 50, true);
    expect(stacker.tubes.map((tube) => tube.size)).toEqual([STACK.most, 16]);
    // Without it, a prize is towers of its own.
    stackTowers(stacker, 10);
    expect(stacker.tubes[1].waiting).toEqual([10]);
  });

  it('says how long a tube is busy for, and whether either is', () => {
    const tube: Tube = { phase: 'stacking', clock: 0, stacked: 0, size: 20, waiting: [10], tower: 0 };
    expect(busyFor(tube)).toBeCloseTo(20 / STACK.perSecond + CYCLE + 10 / STACK.perSecond + CYCLE, 9);
    expect(busyFor({ ...tube, phase: 'pushing', size: 0, waiting: [], clock: 1 })).toBeCloseTo(PHASE_TIME.pushing - 1 + PHASE_TIME.returning, 9);
    expect(stackerBusy(idleStacker())).toBe(false);
    const stacker = idleStacker();
    stacker.tubes[1] = { ...tube };
    expect(stackerBusy(stacker)).toBe(true);
  });
});

describe('a tower from its tube to its place', () => {
  it('is stacked a medal at a time, let down, pushed out and set in its place, in that order and at those paces', () => {
    const machine = createMachine(3);
    buildTowers(machine, 30);
    const tube = machine.stacker.tubes[0];
    const seen: { phase: string; at: number }[] = [];
    let last = '';
    for (let i = 0; i < 20 * 60; i++) {
      step(machine, DT);
      if (tube.phase !== last) {
        seen.push({ phase: tube.phase, at: (i + 1) * DT });
        last = tube.phase;
      }
      if (seen.length === 6) break;
    }
    expect(seen.map((one) => one.phase)).toEqual(['stacking', 'lowering', 'opening', 'pushing', 'returning', 'stacking']);
    const at = (phase: string, nth = 0) => seen.filter((one) => one.phase === phase)[nth].at;
    expect(at('lowering')).toBeCloseTo(30 / STACK.perSecond, 1);
    expect(at('opening') - at('lowering')).toBeCloseTo(STACK.lowers, 1);
    expect(at('pushing') - at('opening')).toBeCloseTo(STACK.opens, 1);
    expect(at('returning') - at('pushing')).toBeCloseTo(STACK.pushes, 1);
    expect(at('stacking', 1) - at('returning')).toBeCloseTo(STACK.returns, 1);
    expect(machine.stacker.made).toBe(1);
  });

  it('is on the field from the moment the arm takes it, at the mouth of its tube, and where the arm has it all the way', () => {
    const fresh = createMachine(3);
    buildTowers(fresh, 30);
    runUntil(fresh, (m) => m.stacker.tubes[0].phase === 'opening');
    // While its gate opens the tower is still in its tube, and not on the field.
    expect(fresh.medals.some((medal) => medal.stack > 1)).toBe(false);
    expect(medalsInTubes(fresh.stacker)).toBe(30);
    runUntil(fresh, (m) => m.stacker.tubes[0].phase === 'pushing');
    const tube = fresh.stacker.tubes[0];
    const tower = fresh.medals.find((medal) => medal.id === tube.tower);
    expect(tower).toBeDefined();
    expect(tower?.stack).toBe(30);
    expect(medalsInTubes(fresh.stacker)).toBe(0);
    let furthest = -Infinity;
    while (tube.phase === 'pushing') {
      const spot = armSpot(0, tube.clock, pusherFront(fresh.time));
      expect(tower?.x).toBeCloseTo(spot.x, 6);
      expect(tower?.y).toBeCloseTo(spot.y, 6);
      furthest = Math.max(furthest, tower?.y ?? 0);
      step(fresh, DT);
    }
    // It was let go a little behind the lip, in the middle of the field.
    expect(Math.abs((tower?.x ?? 0) - TUBE.site[0])).toBeLessThan(0.5);
    expect(pusherFront(fresh.time) - (tower?.y ?? 0)).toBeGreaterThan(TUBE.behind - 1.5);
    expect(furthest).toBeLessThan(PUSHER_MAX);
  });

  it('first comes straight out of its tube, clear of the window’s edges, and then goes across to its place', () => {
    const front = 38;
    const out = armSpot(0, STACK.pushes * STACK.out, front);
    expect(out.x).toBe(TUBE.x[0]);
    expect(out.y).toBeCloseTo(TUBE.mouth, 9);
    expect(armSpot(0, 0, front)).toEqual({ x: TUBE.x[0], y: TUBE.back });
    const end = armSpot(1, STACK.pushes, front);
    expect(end.x).toBeCloseTo(TUBE.site[1], 9);
    expect(end.y).toBeCloseTo(front - TUBE.behind, 9);
    // Every point of the way is on the pusher or in the tube, and between the side walls.
    for (let t = 0; t <= STACK.pushes; t += 0.05) {
      for (const index of [0, 1] as const) {
        const spot = armSpot(index, t, front);
        expect(spot.x).toBeGreaterThan(R);
        expect(spot.x).toBeLessThan(FIELD.width - R);
        expect(spot.y).toBeLessThan(front - TUBE.behind + 1e-9);
      }
    }
  });

  it('is pushed by nothing while the arm has it: it pushes through what lies in its way', () => {
    const machine = createMachine(8);
    for (let i = 0; i < 600; i++) step(machine, DT);
    buildTowers(machine, 40);
    runUntil(machine, (m) => m.stacker.tubes[0].phase === 'pushing');
    const tube = machine.stacker.tubes[0];
    const tower = machine.medals.find((medal) => medal.id === tube.tower);
    while (tube.phase === 'pushing') {
      step(machine, DT);
      if (tube.phase !== 'pushing') break;
      const spot = armSpot(0, tube.clock, pusherFront(machine.time));
      expect(Math.hypot((tower?.x ?? 0) - spot.x, (tower?.y ?? 0) - spot.y)).toBeLessThan(1e-6);
    }
    // And once it is let go it is a tower like any other.
    const before = { x: tower?.x ?? 0, y: tower?.y ?? 0 };
    for (let i = 0; i < 120; i++) step(machine, DT);
    expect(Math.hypot((tower?.x ?? 0) - before.x, (tower?.y ?? 0) - before.y)).toBeGreaterThan(0);
  });

  it('with `gather`, a built tower that has room on top waits in its tube, and goes out when there is no more to gather', () => {
    const machine = createMachine(4);
    buildTowers(machine, 20, true);
    runUntil(machine, () => false, 5, true);
    expect(machine.stacker.tubes[0]).toMatchObject({ phase: 'stacking', stacked: 20, size: 20 });
    buildTowers(machine, 10, true);
    runUntil(machine, () => false, 3, true);
    expect(machine.stacker.tubes[0]).toMatchObject({ phase: 'stacking', stacked: 30, size: 30 });
    runUntil(machine, (m) => m.stacker.tubes[0].phase === 'pushing', 5, false);
    expect(machine.medals.find((medal) => medal.id === machine.stacker.tubes[0].tower)?.stack).toBe(30);
  });

  it('pays every medal of every prize exactly once: stacked, pushed out, over the lip and off the field, or poured', () => {
    const machine = createMachine(12);
    const gone = { won: 0, lost: 0 };
    const start = everything(machine, gone);
    let paid = 0;
    for (const [at, prize, gather] of [
      [0, 30, false],
      [1, 70, false],
      [2, 10, true],
      [3, 20, true],
      [4, 500, false],
    ] as const) {
      for (let i = 0; i < at * 60; i++) {
        const events = step(machine, DT, false, gather);
        gone.won += events.won;
        gone.lost += events.lost;
      }
      buildTowers(machine, prize, gather);
      paid += prize;
      expect(everything(machine, gone)).toBe(start + paid);
    }
    for (let i = 0; i < 90 * 60; i++) {
      const events = step(machine, DT);
      gone.won += events.won;
      gone.lost += events.lost;
      expect(everything(machine, gone)).toBe(start + paid);
    }
    expect(stackerBusy(machine.stacker)).toBe(false);
    expect(machine.stacker.made).toBeGreaterThanOrEqual(TUBE_ROOM);
  });

  it('runs its phases in the order listed, and holds none of them for longer than it lasts', () => {
    expect(TUBE_PHASES).toEqual(['stacking', 'lowering', 'opening', 'pushing', 'returning']);
    for (const phase of TUBE_PHASES.slice(1)) expect(PHASE_TIME[phase as Exclude<typeof phase, 'stacking'>]).toBeGreaterThan(0);
  });
});

const PUSHER_MAX = 46;
