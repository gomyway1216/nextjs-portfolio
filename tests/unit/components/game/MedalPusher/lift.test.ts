import { describe, expect, it } from 'vitest';

import { MEDAL_RADIUS, PUSHER, SETTLE, TOWER, TOWER_SITES, buildTowers, createMachine, medalsOnField, pusherFront, step, type Machine, type Medal } from '@/components/game/MedalPusher/engine';
import { POUR } from '@/components/game/MedalPusher/hopper';
import { LIFT, guardUp, holds, liftAtWork, stands, startLift } from '@/components/game/MedalPusher/lift';

const DT = 1 / 60;
const towerOf = (machine: Machine, id: number): Medal | undefined => machine.medals.find((medal) => medal.id === id);

/** Steps the machine until `done`, adding up the medals that leave the field. */
function run(machine: Machine, done: (machine: Machine) => boolean, most = 20) {
  let gone = 0;
  let toppled = 0;
  let seconds = 0;
  while (!done(machine) && seconds < most) {
    const events = step(machine, DT);
    gone += events.won + events.lost;
    toppled += events.toppled;
    seconds += DT;
  }
  return { gone, toppled, seconds };
}

describe('a tower’s lift', () => {
  it('starts under every tower a prize is paid as: its hatch where the tower stands, its guard still down', () => {
    const machine = createMachine(13);
    const front = pusherFront(machine.time);
    buildTowers(machine, 60);
    expect(machine.lifts).toHaveLength(3);
    for (const lift of machine.lifts) {
      const tower = towerOf(machine, lift.id);
      expect(tower).toMatchObject({ x: lift.x, level: 1, stack: 1, grow: 19, grown: SETTLE.from });
      expect(lift).toMatchObject({ size: 20, wait: LIFT.opens, sunk: -1 });
      expect(lift.behind).toBeCloseTo(front - (tower as Medal).y, 12);
      expect(TOWER.rows).toContain(Math.round(lift.behind));
      expect(holds(lift)).toBe(true);
      expect(guardUp(lift)).toBe(0);
      expect(lift).toEqual(startLift(tower as Medal, front));
    }
  });

  it('takes its time in stages that add up: lamps, doors and guard before the first medal, and the guard and the hatch after the tower has stood', () => {
    // The outermost hatch of a row starts two steps of the ripple after the middle ones, and is ready as the first medal comes.
    const outermost = (TOWER.perRow / 2 - 1) * LIFT.ripple;
    expect(LIFT.lamps + LIFT.doors + LIFT.rises + outermost).toBeCloseTo(LIFT.opens, 12);
    expect(LIFT.sinks + LIFT.shuts).toBeCloseTo(LIFT.closes, 12);
    // A tower stands for less than a second, which is how a lift's clock tells standing from not yet built; for long
    // enough that its last medal is seen to come up flush; and for as long as the ripple takes to cross a row, since
    // the middle guards begin to sink that much before the towers are let go.
    expect(LIFT.stands).toBeLessThan(1);
    expect(LIFT.stands).toBeGreaterThanOrEqual(1 / TOWER.perSecond);
    expect(LIFT.stands).toBeGreaterThanOrEqual(outermost);
    // The show: a tower comes up at five or six medals a second, 22 of them in about four seconds.
    expect(TOWER.perSecond).toBeGreaterThanOrEqual(5);
    expect(TOWER.perSecond).toBeLessThanOrEqual(6);
    expect(22 / TOWER.perSecond).toBeCloseTo(4, 0);
  });

  it('opens its hatch and raises its guard first, brings the tower up a medal at a time, lets it stand a moment, then lets the guard down', () => {
    const machine = createMachine(13);
    const start = medalsOnField(machine);
    buildTowers(machine, 50);
    const [lift] = machine.lifts;
    const { id } = lift;
    // The prize is on the field from the moment it is paid, the medals still under the deck included.
    expect(medalsOnField(machine)).toBe(start + 50);
    // While the hatch opens and the guard rises nothing comes up.
    const rising = run(machine, () => lift.wait === 0);
    expect(rising.seconds).toBeCloseTo(LIFT.opens, 1);
    expect(towerOf(machine, id)).toMatchObject({ stack: 1, grow: 24 });
    expect(guardUp(lift)).toBe(1);
    expect(stands(lift)).toBe(false);
    // Then the tower, slowly: a medal's time for each.
    const building = run(machine, () => stands(lift));
    expect(building.seconds).toBeCloseTo(24 / TOWER.perSecond, 1);
    expect(towerOf(machine, id)).toMatchObject({ stack: 25, grow: 0 });
    expect(machine.growing).toBe(0);
    expect(lift.sunk).toBe(-LIFT.stands);
    // Built, it stands in its guard for a moment, still held.
    expect([holds(lift), guardUp(lift)]).toEqual([true, 1]);
    const standing = run(machine, () => !holds(lift));
    expect(standing.seconds).toBeCloseTo(LIFT.stands, 1);
    expect(lift.sunk).toBeGreaterThanOrEqual(0);
    expect(lift.sunk).toBeLessThan(2 * DT);
    expect(guardUp(lift)).toBeGreaterThan(0.9);
    // Then the guard sinks and the hatch closes, and the lift is done.
    const sinking = run(machine, (m) => m.lifts.length === 0);
    expect(sinking.seconds).toBeCloseTo(LIFT.closes, 1);
    expect(rising.toppled + building.toppled + standing.toppled).toBe(0);
    expect(medalsOnField(machine) + rising.gone + building.gone + standing.gone + sinking.gone).toBe(start + 50);
  });

  it('raises its guard at an even pace over the last of its wait and lets it down at one, each hatch in its turn in the ripple', () => {
    const tower: Medal = { id: 5, x: 43, y: 21, level: 1, tier: 0, sinceDrop: -1, stack: 1, grow: 9, ball: false, grown: 1 };
    const lift = startLift(tower, 30);
    // Down while the lamps come on and the doors open, then up over `rises`.
    expect(guardUp(lift)).toBe(0);
    expect(guardUp({ ...lift, wait: LIFT.rises })).toBe(0);
    expect(guardUp({ ...lift, wait: LIFT.rises / 2 })).toBeCloseTo(0.5, 12);
    expect(guardUp({ ...lift, wait: 0 })).toBe(1);
    // Up for as long as the tower stands, and down over `sinks` from the moment it is let go.
    expect(guardUp({ ...lift, wait: 0, sunk: -LIFT.stands })).toBe(1);
    expect(guardUp({ ...lift, wait: 0, sunk: -0.01 })).toBe(1);
    expect(guardUp({ ...lift, wait: 0, sunk: 0 })).toBe(1);
    expect(guardUp({ ...lift, wait: 0, sunk: LIFT.sinks / 4 })).toBeCloseTo(0.75, 12);
    expect(guardUp({ ...lift, wait: 0, sunk: LIFT.sinks })).toBe(0);
    expect(guardUp({ ...lift, wait: 0, sunk: LIFT.closes })).toBe(0);
    // A hatch that is ahead in the ripple has its guard up that much sooner, and sinking that much sooner, while its tower still stands.
    const ahead = 2 * LIFT.ripple;
    expect(guardUp({ ...lift, wait: LIFT.rises + ahead }, ahead)).toBeCloseTo(0, 12);
    expect(guardUp({ ...lift, wait: ahead }, ahead)).toBe(1);
    expect(guardUp({ ...lift, wait: 0, sunk: -ahead }, ahead)).toBe(1);
    expect(guardUp({ ...lift, wait: 0, sunk: -ahead + LIFT.sinks / 2 }, ahead)).toBeCloseTo(0.5, 12);
    expect([holds({ ...lift, wait: 0, sunk: -ahead / 2 }), stands({ ...lift, wait: 0, sunk: -ahead / 2 })]).toEqual([true, true]);
    expect([holds(lift), stands(lift)]).toEqual([true, false]);
    expect([holds({ ...lift, wait: 0, sunk: 0 }), stands({ ...lift, wait: 0, sunk: 0 })]).toEqual([false, false]);
    // One found already at work has its guard up.
    expect(liftAtWork(tower, 30)).toEqual({ id: 5, x: 43, behind: 9, size: 10, wait: 0, sunk: -1 });
    expect(guardUp(liftAtWork(tower, 30))).toBe(1);
  });

  it('holds its tower where the lift is while the guard is up: the tower rides the pusher and nothing pushes it', () => {
    const machine = createMachine(13);
    buildTowers(machine, 25);
    const [lift] = machine.lifts;
    const tower = towerOf(machine, lift.id) as Medal;
    // A medal thrown down right against it, again and again, as hard as the pile can lean.
    let step_ = 0;
    while (holds(lift) && step_ < 600) {
      if (step_ % 4 === 0) machine.medals.push({ id: machine.nextId++, x: lift.x + 1.5, y: tower.y - 2, level: 1, tier: 0, sinceDrop: -1, stack: 1, grow: 0, ball: false, grown: 1 });
      step(machine, DT);
      step_ += 1;
      if (!holds(lift)) break;
      expect(tower.x).toBeCloseTo(lift.x, 6);
      expect(tower.y).toBeCloseTo(pusherFront(machine.time) - lift.behind, 6);
    }
    expect(step_).toBeGreaterThan(60);
    // And everything that lies beside it keeps the guard's wall away from it: most of its thickness, even in a pile that is leaning on it.
    const machine2 = createMachine(13);
    buildTowers(machine2, 25);
    const [lift2] = machine2.lifts;
    run(machine2, () => lift2.wait === 0 && (towerOf(machine2, lift2.id) as Medal).stack > 6);
    const held = towerOf(machine2, lift2.id) as Medal;
    const nearest = Math.min(...machine2.medals.filter((medal) => medal !== held && medal.level === 1).map((medal) => Math.hypot(medal.x - held.x, medal.y - held.y)));
    expect(nearest).toBeGreaterThan(MEDAL_RADIUS * 2 + LIFT.wall * 0.5);
  });

  it('lets the tower go once it has stood its moment: it is pushed like any tower, and goes over the lip in the end', () => {
    const machine = createMachine(13);
    const start = medalsOnField(machine);
    buildTowers(machine, 25);
    const [lift] = machine.lifts;
    const { id } = lift;
    run(machine, () => !holds(lift));
    const built = towerOf(machine, id) as Medal;
    const stood = pusherFront(machine.time) - built.y;
    // Lean on it from behind: now it gives way.
    for (let i = 0; i < 40; i++) {
      machine.medals.push({ id: machine.nextId++, x: built.x, y: Math.max(MEDAL_RADIUS, built.y - 4), level: 1, tier: 0, sinceDrop: -1, stack: 1, grow: 0, ball: false, grown: 1 });
      step(machine, DT);
    }
    const still = towerOf(machine, id);
    expect(still === undefined || pusherFront(machine.time) - still.y < stood - 0.5).toBe(true);
    expect(medalsOnField(machine)).toBeGreaterThanOrEqual(start + 25);
  });

  it('never has a tower in its guard go over the lip, however far the pusher travels', () => {
    const machine = createMachine(17);
    // At every phase of the stroke.
    for (let n = 0; n < 6; n++) {
      run(machine, () => false, PUSHER.period / 6);
      buildTowers(machine, 50);
      const toppled = run(machine, (m) => m.lifts.every((lift) => !holds(lift))).toppled;
      for (const lift of machine.lifts) expect(lift.behind).toBeGreaterThan(MEDAL_RADIUS * 2);
      // Towers built earlier may go over; the ones still in their guards never do.
      expect(machine.growing).toBe(0);
      expect(toppled).toBeGreaterThanOrEqual(0);
    }
    expect(machine.medals.every((medal) => medal.grow === 0)).toBe(true);
  });

  it('brings up a tower that has no lift under it all the same, as a machine put together by hand may have', () => {
    const machine = createMachine(13);
    machine.medals.push({ id: machine.nextId++, x: 50, y: 12, level: 1, tier: 0, sinceDrop: -1, stack: 3, grow: 9, ball: false, grown: 1 });
    machine.growing = 9;
    expect(machine.lifts).toHaveLength(0);
    run(machine, (m) => m.growing === 0, 2);
    expect(machine.medals.some((medal) => medal.stack === 12 && medal.grow === 0)).toBe(true);
  });

  it('pays what its places cannot hold loose, which is poured when there is enough of it', () => {
    const machine = createMachine(13);
    const start = medalsOnField(machine);
    buildTowers(machine, TOWER_SITES * TOWER.max + POUR.threshold + 4);
    expect(machine.lifts).toHaveLength(TOWER_SITES);
    expect(machine.payoutQueue).toBe(POUR.threshold + 4);
    // With every place taken a further prize has no lift to go up on.
    buildTowers(machine, 40);
    expect(machine.lifts).toHaveLength(TOWER_SITES);
    expect(machine.payoutQueue).toBe(POUR.threshold + 44);
    expect(medalsOnField(machine)).toBe(start + TOWER_SITES * TOWER.max + POUR.threshold + 44);
    const all = run(machine, (m) => m.lifts.length === 0 && m.payoutQueue === 0 && m.falling.length === 0 && m.hopper.phase === 'shut', 30);
    expect(machine.growing).toBe(0);
    expect(medalsOnField(machine) + all.gone).toBe(start + TOWER_SITES * TOWER.max + POUR.threshold + 44);
  });
});

describe('every prize, however it is paid', () => {
  it.each([3, 29, 30, 31, 60, 311])('is exactly %i medals when it is paid loose', (prize) => {
    const machine = createMachine(29);
    const start = medalsOnField(machine);
    machine.payoutQueue += prize;
    let gone = 0;
    for (let i = 0; i < 40 * 60 && (machine.payoutQueue > 0 || machine.falling.length > 0 || machine.hopper.phase !== 'shut'); i++) {
      const events = step(machine, DT);
      gone += events.won + events.lost;
      expect(medalsOnField(machine) + gone).toBe(start + prize);
    }
    expect(machine.payoutQueue).toBe(0);
    expect(machine.hopper.phase).toBe('shut');
    expect(machine.hopper.poured).toBe(prize >= POUR.threshold ? prize : 0);
  });

  it.each([10, 20, 50, 100, 311, 600])('is exactly %i medals when it is paid as towers', (prize) => {
    const machine = createMachine(29);
    const start = medalsOnField(machine);
    buildTowers(machine, prize);
    let gone = 0;
    for (let i = 0; i < 40 * 60 && (machine.lifts.length > 0 || machine.payoutQueue > 0 || machine.falling.length > 0 || machine.hopper.phase !== 'shut'); i++) {
      const events = step(machine, DT);
      gone += events.won + events.lost;
      expect(medalsOnField(machine) + gone).toBe(start + prize);
    }
    expect(machine.growing).toBe(0);
    expect(machine.lifts).toHaveLength(0);
    expect(machine.payoutQueue).toBe(0);
  });
});
