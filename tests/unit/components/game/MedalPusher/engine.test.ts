import { describe, expect, it } from 'vitest';

import {
  AIM,
  BALL_SPOTS,
  CHECKERS,
  DROP_INTERVAL,
  FALL_TIME,
  FIELD,
  GAP,
  INITIAL,
  LANDING,
  MEDAL_RADIUS,
  PUSHER,
  SWEEP,
  TOWER,
  TOWER_SITES,
  ballsOnField,
  buildTowers,
  checkerAt,
  checkerCentres,
  checkerShift,
  clampAim,
  createMachine,
  dropBall,
  dropMedal,
  medalsOnField,
  pusherFront,
  queuePayout,
  seededRng,
  step,
  towerSizes,
  worstOverlap,
  type Machine,
  type Medal,
  type StepEvents,
} from '@/components/game/MedalPusher/engine';

const DT = 1 / 60;
/** Tests that run the field for a minute or more of its own time get room on a slow machine. */
const LONG = 30_000;

/** Runs the machine for `seconds`, dropping a medal at `aim` every `every` seconds when one is given. */
function run(machine: Machine, seconds: number, aim?: number | ((n: number) => number), every = 0.25) {
  const total: StepEvents = { won: 0, lost: 0, checkers: [], landed: 0, toppled: 0, balls: 0 };
  let dropped = 0;
  let clock = every;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (aim !== undefined && clock >= every) {
      clock = 0;
      if (dropMedal(machine, typeof aim === 'function' ? aim(dropped) : aim)) dropped++;
    }
    const events = step(machine, DT);
    total.won += events.won;
    total.lost += events.lost;
    total.landed += events.landed;
    total.toppled += events.toppled;
    total.balls += events.balls;
    total.checkers.push(...events.checkers);
    clock += DT;
  }
  return { ...total, dropped };
}

const snapshot = (machine: Machine) => machine.medals.map((m) => `${m.id}:${m.level}:${m.tier}:${m.x.toFixed(6)}:${m.y.toFixed(6)}:${m.stack}`).join('|');

let nextId = 10_000;
/** A medal lying settled on the lower table, with whatever is different about it. */
const medalAt = (x: number, y: number, over: Partial<Medal> = {}): Medal => ({
  id: nextId++,
  x,
  y,
  level: 0,
  tier: 0,
  sinceDrop: -1,
  stack: 1,
  grow: 0,
  ball: false,
  grown: 1,
  ...over,
});
/** An empty machine with just these medals on it. */
const machineWith = (medals: Medal[]): Machine => {
  const machine = createMachine(1);
  machine.medals = medals;
  return machine;
};

describe('the generator and the pusher', () => {
  it('replays the same numbers from the same seed', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const first = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(first);
    expect(first.every((value) => value > 0 && value < 1)).toBe(true);
    expect(Array.from({ length: 5 }, seededRng(43))).not.toEqual(first);
    expect(() => seededRng(Number.NaN)).toThrow();
  });

  it('moves the lip between its two ends once a period', () => {
    expect(pusherFront(0)).toBeCloseTo(PUSHER.min, 9);
    expect(pusherFront(PUSHER.period / 2)).toBeCloseTo(PUSHER.max, 9);
    expect(pusherFront(PUSHER.period)).toBeCloseTo(PUSHER.min, 9);
    expect(pusherFront(PUSHER.period * 0.25)).toBeCloseTo((PUSHER.min + PUSHER.max) / 2, 9);
    expect(pusherFront(1.3 + PUSHER.period * 3)).toBeCloseTo(pusherFront(1.3), 9);
  });

  it('sweeps the three gates from side to side together, once a period', () => {
    const { amplitude, period } = SWEEP;
    // They start in the middle, are furthest right a quarter of a period later, and furthest left at three quarters.
    expect(checkerShift(0)).toBe(0);
    expect(checkerShift(period / 4)).toBeCloseTo(amplitude, 9);
    expect(checkerShift(period / 2)).toBeCloseTo(0, 9);
    expect(checkerShift((period * 3) / 4)).toBeCloseTo(-amplitude, 9);
    expect(checkerShift(1.3 + period * 5)).toBeCloseTo(checkerShift(1.3), 9);
    expect(checkerCentres(0)).toEqual([...CHECKERS.positions]);

    // Never further than the amplitude, and never with a jump: a sine's fastest is 2π × amplitude / period.
    const fastest = (2 * Math.PI * amplitude) / period;
    let left = 0;
    let right = 0;
    for (let time = 0; time < period; time += DT) {
      const shift = checkerShift(time);
      left = Math.min(left, shift);
      right = Math.max(right, shift);
      expect(Math.abs(checkerShift(time + DT) - shift)).toBeLessThanOrEqual(fastest * DT + 1e-9);
      // The three keep their places relative to each other.
      checkerCentres(time).forEach((center, gate) => expect(center - CHECKERS.positions[gate]).toBeCloseTo(shift, 9));
    }
    expect(right).toBeLessThanOrEqual(amplitude);
    expect(right).toBeGreaterThan(amplitude * 0.999);
    expect(left).toBeGreaterThanOrEqual(-amplitude);
    expect(left).toBeLessThan(-amplitude * 0.999);

    // No two gates ever cover the same spot, and even at the end of its sweep the outer
    // gate stays out of reach of a medal let go at the very edge of the field.
    expect(2 * (amplitude + CHECKERS.halfWidth)).toBeLessThan(CHECKERS.positions[1] - CHECKERS.positions[0]);
    expect(CHECKERS.positions[0] - amplitude - CHECKERS.halfWidth).toBeGreaterThan(AIM.min + LANDING.scatter);
    expect(CHECKERS.positions[2] + amplitude + CHECKERS.halfWidth).toBeLessThan(AIM.max - LANDING.scatter);
  });

  it('knows which gate a landing spot is under, wherever the gates are by then', () => {
    // In the middle of the sweep.
    expect(CHECKERS.positions.map((x) => checkerAt(x, 0))).toEqual([0, 1, 2]);
    expect(checkerAt(50 + CHECKERS.halfWidth - 0.01, 0)).toBe(1);
    expect(checkerAt(50 + CHECKERS.halfWidth + 0.01, 0)).toBe(-1);
    expect(checkerAt(37.5, 0)).toBe(-1);
    // A quarter of a period later every gate is as far right as it goes, and the spots they left are empty.
    const right = SWEEP.period / 4;
    expect(CHECKERS.positions.map((x) => checkerAt(x, right))).toEqual([-1, -1, -1]);
    expect(CHECKERS.positions.map((x) => checkerAt(x + SWEEP.amplitude, right))).toEqual([0, 1, 2]);
    expect(checkerAt(50 + SWEEP.amplitude - CHECKERS.halfWidth + 0.01, right)).toBe(1);
    expect(checkerAt(50 + SWEEP.amplitude - CHECKERS.halfWidth - 0.01, right)).toBe(-1);
    // And at three quarters, as far left.
    expect(CHECKERS.positions.map((x) => checkerAt(x - SWEEP.amplitude, (SWEEP.period * 3) / 4))).toEqual([0, 1, 2]);
    expect(clampAim(-5)).toBe(AIM.min);
    expect(clampAim(500)).toBe(AIM.max);
    expect(clampAim(40)).toBe(40);
  });
});

describe('a machine that has just been switched on', () => {
  it('is the same machine for the same seed', () => {
    expect(snapshot(createMachine(7))).toBe(snapshot(createMachine(7)));
    expect(snapshot(createMachine(7))).not.toBe(snapshot(createMachine(8)));
  });

  it('has both tables packed, with no medal on another and every medal inside the walls', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const machine = createMachine(seed);
      const upper = machine.medals.filter((m) => m.level === 1 && m.tier === 0);
      const lower = machine.medals.filter((m) => m.level === 0 && m.tier === 0);
      // A few more lie on top of each pile, every one resting on a medal beneath it.
      const onTop = machine.medals.filter((m) => m.tier === 1);
      expect(onTop.filter((m) => m.level === 1).length).toBeLessThanOrEqual(INITIAL.onTop.upper);
      expect(onTop.filter((m) => m.level === 0).length).toBeLessThanOrEqual(INITIAL.onTop.lower);
      expect(onTop.length).toBeGreaterThan(30);
      for (const medal of onTop) {
        const under = [...upper, ...lower].filter((m) => m.level === medal.level);
        expect(Math.min(...under.map((m) => Math.hypot(m.x - medal.x, m.y - medal.y)))).toBeLessThan(MEDAL_RADIUS * 2 * GAP);
      }
      // A few medals that would not fit are left out, never added.
      expect(upper.length).toBeGreaterThan(INITIAL.upper * 0.8);
      expect(upper.length).toBeLessThanOrEqual(INITIAL.upper);
      expect(lower.length).toBeGreaterThan(INITIAL.lower * 0.8);
      expect(lower.length).toBeLessThanOrEqual(INITIAL.lower);
      expect(worstOverlap(machine)).toBeLessThan(0.005);
      for (const medal of machine.medals) {
        expect(medal.x).toBeGreaterThanOrEqual(MEDAL_RADIUS - 1e-9);
        expect(medal.x).toBeLessThanOrEqual(FIELD.width - MEDAL_RADIUS + 1e-9);
        if (medal.level === 1) expect(medal.y).toBeLessThan(PUSHER.min);
        else expect(medal.y).toBeGreaterThanOrEqual(PUSHER.max + MEDAL_RADIUS - 1e-9);
        expect(medal.y).toBeLessThan(FIELD.depth);
        expect(medal.stack).toBe(1);
      }
    }
  });

  it('stays still until it is fed', () => {
    for (const seed of [1, 2, 3, 99, 12345, 777, 31337]) {
      const machine = createMachine(seed, 2);
      const before = machine.medals.map((m) => `${m.id}:${m.level}`).join();
      const events = run(machine, PUSHER.period * 2);
      expect(events.won + events.lost + events.balls + events.landed).toBe(0);
      expect(machine.medals.map((m) => `${m.id}:${m.level}`).join()).toBe(before);
    }
  });

  it('lays as many balls as it is asked for, in place of medals', () => {
    const plain = createMachine(5);
    expect(ballsOnField(plain)).toBe(0);
    for (let balls = 1; balls <= BALL_SPOTS.length; balls++) {
      const machine = createMachine(5, balls);
      expect(ballsOnField(machine)).toBe(balls);
      // A ball takes the place of a medal of the lower tier; what lies on top keeps clear of it.
      const lowerTier = (m: Machine) => m.medals.filter((medal) => medal.tier === 0).length;
      expect(lowerTier(machine)).toBe(lowerTier(plain));
      expect(medalsOnField(machine)).toBe(machine.medals.length - balls);
      for (const ball of machine.medals.filter((medal) => medal.ball)) {
        expect(ball.tier).toBe(0);
        const onTop = machine.medals.filter((medal) => medal.tier === 1 && medal.level === ball.level);
        expect(Math.min(...onTop.map((medal) => Math.hypot(medal.x - ball.x, medal.y - ball.y)))).toBeGreaterThanOrEqual(MEDAL_RADIUS * 2 * 1.6 - 1e-9);
      }
      const levels = machine.medals.filter((m) => m.ball).map((m) => m.level);
      expect(levels.sort()).toEqual(
        BALL_SPOTS.slice(0, balls)
          .map((spot) => spot.level)
          .sort(),
      );
    }
    expect(() => createMachine(5, BALL_SPOTS.length + 1)).toThrow();
    expect(() => createMachine(5, -1)).toThrow();
    expect(() => createMachine(5, 1.5)).toThrow();
  });
});

describe('dropping a medal', () => {
  it('takes one medal every drop interval and lands it near the aim', () => {
    const machine = createMachine(11);
    expect(dropMedal(machine, 40)).toBe(true);
    expect(dropMedal(machine, 40)).toBe(false);
    step(machine, DROP_INTERVAL / 2);
    expect(dropMedal(machine, 40)).toBe(false);
    step(machine, DROP_INTERVAL / 2 + 1e-6);
    expect(dropMedal(machine, 40)).toBe(true);
    expect(machine.falling).toHaveLength(2);
    for (const medal of machine.falling) {
      expect(Math.abs(medal.x - 40)).toBeLessThanOrEqual(LANDING.scatter);
      expect(medal.y).toBeGreaterThanOrEqual(LANDING.from);
      expect(medal.y).toBeLessThanOrEqual(LANDING.to);
      expect(medal.level).toBe(1);
      expect(medal.source).toBe('player');
    }
    expect(() => dropMedal(machine, Number.NaN)).toThrow();
  });

  it('lands after the fall time, on the pusher', () => {
    const machine = createMachine(11);
    const before = machine.medals.length;
    dropMedal(machine, 60);
    expect(step(machine, FALL_TIME - 0.05).landed).toBe(0);
    expect(step(machine, 0.1).landed).toBe(1);
    expect(machine.falling).toHaveLength(0);
    expect(machine.medals.length).toBe(before + 1);
    expect(machine.medals.some((m) => m.level === 1 && m.grown < 1)).toBe(true);
  });

  it('bunches its landings round the aim', () => {
    const machine = createMachine(3);
    const offsets: number[] = [];
    for (let i = 0; i < 4000; i++) {
      machine.cooldown = 0;
      dropMedal(machine, 50);
      offsets.push(machine.falling[machine.falling.length - 1].x - 50);
    }
    const near = offsets.filter((offset) => Math.abs(offset) <= LANDING.scatter / 2).length / offsets.length;
    // A triangular spread puts three quarters of the landings in the inner half.
    expect(near).toBeGreaterThan(0.72);
    expect(near).toBeLessThan(0.78);
    expect(Math.abs(offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length)).toBeLessThan(0.3);
  });

  it('refuses a time step that is not a non-negative number', () => {
    const machine = createMachine(1);
    expect(() => step(machine, -0.01)).toThrow();
    expect(() => step(machine, Number.NaN)).toThrow();
    expect(() => step(machine, Number.POSITIVE_INFINITY)).toThrow();
    expect(step(machine, 0)).toEqual({ won: 0, lost: 0, checkers: [], landed: 0, toppled: 0, balls: 0 });
  });
});

describe('a machine in play', () => {
  it('plays out the same way from the same seed', () => {
    const a = createMachine(2024, 2);
    const b = createMachine(2024, 2);
    const eventsA = run(a, 30, (n) => [25, 50, 75][n % 3]);
    const eventsB = run(b, 30, (n) => [25, 50, 75][n % 3]);
    expect(eventsA).toEqual(eventsB);
    expect(snapshot(a)).toBe(snapshot(b));
  }, LONG);

  it('neither makes nor loses a medal', () => {
    const machine = createMachine(8);
    const start = medalsOnField(machine);
    queuePayout(machine, 40);
    buildTowers(machine, 50);
    const events = run(machine, 80, (n) => 10 + ((n * 37) % 80), 0.2);
    expect(events.won).toBeGreaterThan(100);
    expect(events.lost).toBeGreaterThan(10);
    expect(start + 40 + 50 + events.dropped).toBe(medalsOnField(machine) + events.won + events.lost);
  }, LONG);

  it('keeps every medal inside the walls and clear of the pusher', () => {
    const machine = createMachine(21, 2);
    const slack = 1e-6;
    const inside = (x: number, margin: number) => x >= margin - slack && x <= FIELD.width - margin + slack;
    let clock = 1;
    let dropped = 0;
    let checked = 0;
    const strays: string[] = [];
    for (let i = 0; i < 60 * 30; i++) {
      if (clock >= 0.2) {
        clock = 0;
        dropMedal(machine, 8 + ((dropped++ * 53) % 84));
      }
      step(machine, DT);
      clock += DT;
      const front = pusherFront(machine.time);
      for (const medal of machine.medals) {
        checked++;
        let ok: boolean;
        if (medal.level === 1) {
          ok = medal.y >= MEDAL_RADIUS - slack && medal.y <= front + slack && inside(medal.x, MEDAL_RADIUS);
        } else {
          // A medal is clear of the pusher's face from the step after the one it came over the lip in.
          const clear = medal.sinceDrop === 0 || medal.y >= front + MEDAL_RADIUS - slack;
          // Only where the sides are open can a medal hang over them; a ball never does.
          const walled = medal.ball || medal.y < FIELD.sideOpenFrom;
          ok = clear && medal.y <= FIELD.depth + slack && inside(medal.x, walled ? MEDAL_RADIUS : 0);
        }
        if (!ok && strays.length < 5) strays.push(`${medal.level}:${medal.x.toFixed(3)},${medal.y.toFixed(3)} (front ${front.toFixed(3)})`);
      }
    }
    expect(checked).toBeGreaterThan(300_000);
    expect(strays).toEqual([]);
  }, LONG);

  it('counts a medal only where a gate is at the moment it lands', () => {
    /** Drops one medal `at` seconds into a machine's life, with no scatter, and says which gates it came through. */
    const land = (at: number, aim: number, wait = FALL_TIME + DT) => {
      const machine = createMachine(9);
      step(machine, at);
      // Both draws of the scatter in the middle: the medal lands exactly where it is aimed.
      machine.rng = () => 0.5;
      expect(dropMedal(machine, aim)).toBe(true);
      const before = step(machine, FALL_TIME - 2 * DT).checkers;
      expect(before).toEqual([]);
      return step(machine, wait - (FALL_TIME - 2 * DT)).checkers;
    };
    // Let go over the centre gate, it misses: by the time it is down the gate has moved on.
    expect(Math.abs(checkerShift(FALL_TIME))).toBeGreaterThan(CHECKERS.halfWidth);
    expect(land(0, checkerCentres(0)[1])).toEqual([]);
    // Let go where the gate will be, it goes through. So for each gate, and anywhere in the sweep.
    expect(land(0, checkerCentres(FALL_TIME)[1])).toEqual([1]);
    expect(land(0, checkerCentres(FALL_TIME)[0])).toEqual([0]);
    expect(land(0, checkerCentres(FALL_TIME)[2])).toEqual([2]);
    expect(land(2.3, checkerCentres(2.3 + FALL_TIME)[1])).toEqual([1]);
    expect(land(SWEEP.period / 4 - FALL_TIME, 50 + SWEEP.amplitude)).toEqual([1]);
    // What counts is where the gate is when the medal touches down, to the edge of the gate,
    // however long the step that brings it down.
    const centre = checkerCentres(1 + FALL_TIME)[1];
    expect(land(1, centre + CHECKERS.halfWidth - 0.02)).toEqual([1]);
    expect(land(1, centre + CHECKERS.halfWidth + 0.02)).toEqual([]);
    expect(land(1, centre - CHECKERS.halfWidth + 0.02, 3)).toEqual([1]);
    expect(land(1, centre - CHECKERS.halfWidth - 0.02, 3)).toEqual([]);
  });

  it('counts a medal the player dropped through a gate, and no other', () => {
    // Followed, the centre gate takes about one medal in five: each is let go where the gate will be when it lands.
    const followed = createMachine(5);
    const hits = run(followed, 100, () => checkerCentres(followed.time + FALL_TIME)[1], 0.25).checkers;
    expect(hits.length).toBeGreaterThan(50);
    expect(hits.every((gate) => gate === 1)).toBe(true);

    // Aimed at the middle of its sweep and left there, it takes fewer: the gate is somewhere else most of the time.
    const still = createMachine(5);
    const fixed = run(still, 100, 50, 0.25).checkers;
    expect(fixed.length).toBeGreaterThan(0);
    expect(fixed.length).toBeLessThan(hits.length);

    // From the edge the nearest gate is out of reach altogether, even at the end of its sweep.
    const edge = createMachine(5);
    expect(run(edge, 50, AIM.min, 0.25).checkers).toEqual([]);

    // Medals the machine pays out fall across every gate and start nothing.
    const paid = createMachine(5);
    queuePayout(paid, 400);
    const payout = run(paid, 60);
    expect(payout.landed).toBe(400);
    expect(payout.checkers).toEqual([]);
    expect(() => queuePayout(paid, 1.5)).toThrow();
    expect(() => queuePayout(paid, -1)).toThrow();
  }, LONG);
});

describe('medals two deep', () => {
  const D = MEDAL_RADIUS * 2;

  it('lands a medal on the table where there is room and on the pile where there is not', () => {
    const machine = machineWith([medalAt(50, 9, { level: 1 })]);
    // One comes down right on top of the medal that is there, one well clear of it.
    machine.falling.push(
      { id: nextId++, x: 50.5, y: 9, level: 1, fromX: 50, fromY: 1, rank: 0, ball: false, remaining: 0.01, duration: 0.4, source: 'payout' },
      { id: nextId++, x: 70, y: 9, level: 1, fromX: 70, fromY: 1, rank: 0, ball: false, remaining: 0.01, duration: 0.4, source: 'payout' },
    );
    expect(step(machine, DT).landed).toBe(2);
    const [, onPile, onTable] = machine.medals;
    expect(onPile.tier).toBe(1);
    expect(onTable.tier).toBe(0);
    // A ball always makes room for itself on the table.
    machine.falling.push({ id: nextId++, x: 50, y: 9, level: 1, fromX: 50, fromY: 1, rank: 0, ball: true, remaining: 0.01, duration: 0.4, source: 'payout' });
    step(machine, DT);
    expect(machine.medals.find((m) => m.ball)?.tier).toBe(0);
  });

  it('carries a medal along with the one it lies on', () => {
    // A medal on the lower table with one lying on its far half, and a third pressed in behind that pushes the first forward.
    const under = medalAt(50, 70);
    const rider = medalAt(50.4, 72, { tier: 1 });
    const behind = medalAt(50, 64.4);
    const machine = machineWith([under, rider, behind]);
    const before = { under: under.y, rider: rider.y };
    for (let i = 0; i < 5; i++) step(machine, DT);
    expect(under.y - before.under).toBeGreaterThan(0.3);
    expect(rider.tier).toBe(1);
    expect(rider.y - before.rider).toBeCloseTo(under.y - before.under, 6);
    expect(rider.x).toBeCloseTo(50.4, 6);
  });

  it('stays put on two medals that are pushed apart beneath it', () => {
    // It rests on both, and they move the same distance in opposite directions.
    const rider = medalAt(50, 68, { tier: 1 });
    const machine = machineWith([medalAt(50, 70), rider, medalAt(50, 66)]);
    for (let i = 0; i < 5; i++) step(machine, DT);
    expect(rider.y).toBeCloseTo(68, 6);
    expect(rider.tier).toBe(1);
  });

  it('lets a medal slide over the pile when another on top pushes it', () => {
    const base = [medalAt(40, 70), medalAt(46.4, 70), medalAt(52.8, 70)];
    const pushed = medalAt(46.4, 70.2, { tier: 1 });
    const pusher = medalAt(44, 70.2, { tier: 1 });
    const machine = machineWith([...base, pushed, pusher]);
    for (let i = 0; i < 3; i++) step(machine, DT);
    // The two on top have parted; the three under them have not moved.
    expect(Math.hypot(pushed.x - pusher.x, pushed.y - pusher.y)).toBeGreaterThanOrEqual(D - 1e-6);
    expect(base.map((m) => m.x)).toEqual([40, 46.4, 52.8]);
    expect(pushed.tier).toBe(1);
  });

  it('drops a medal into the lower tier when a gap opens beneath it', () => {
    const under = medalAt(50, 70);
    const rider = medalAt(50.5, 70, { tier: 1 });
    const machine = machineWith([under, rider]);
    step(machine, DT);
    expect(rider.tier).toBe(1);
    // The medal under it is taken away; a neighbour too far off to hold it up does not count.
    machine.medals = [rider, medalAt(50.5 + D * GAP + 0.3, 70)];
    step(machine, DT);
    expect(rider.tier).toBe(0);
    expect(rider.grown).toBeLessThan(1);
    // In the hollow between three touching medals it stays where it is.
    const hollow = medalAt(50, 60 + D / Math.sqrt(3), { tier: 1 });
    const three = machineWith([medalAt(50, 60), medalAt(50 - D / 2, 60 + (D * Math.sqrt(3)) / 2), medalAt(50 + D / 2, 60 + (D * Math.sqrt(3)) / 2), hollow]);
    for (let i = 0; i < 30; i++) step(three, DT);
    expect(hollow.tier).toBe(1);
  });

  it('keeps a medal on top of the pile off a tower and off a ball', () => {
    const tower = medalAt(50, 15, { level: 1, stack: 20 });
    const ball = medalAt(70, 15, { level: 1, ball: true });
    const nearTower = medalAt(52, 15, { level: 1, tier: 1 });
    const nearBall = medalAt(72, 15, { level: 1, tier: 1 });
    // Something for the two on top to lie on, so they do not simply drop.
    const floor = [medalAt(56.5, 15, { level: 1 }), medalAt(76.5, 15, { level: 1 })];
    const machine = machineWith([tower, ball, nearTower, nearBall, ...floor]);
    for (let i = 0; i < 20; i++) step(machine, DT);
    expect(Math.hypot(nearTower.x - tower.x, nearTower.y - tower.y)).toBeGreaterThan(D * 0.95);
    expect(Math.hypot(nearBall.x - ball.x, nearBall.y - ball.y)).toBeGreaterThan(D * 0.95);
  });

  it('takes a medal on top over the lip with the one beneath it', () => {
    // Both are past the lip of a pusher that is fully back, so the next step drops them.
    const under = medalAt(50, PUSHER.min + 0.5, { level: 1 });
    const rider = medalAt(50.3, PUSHER.min + 0.6, { level: 1, tier: 1 });
    const machine = machineWith([under, rider]);
    const events = step(machine, DT);
    expect(events.won + events.lost + events.toppled).toBe(0);
    expect(under.level).toBe(0);
    expect(rider.level).toBe(0);
    // The first lands on the empty table and the second on top of it.
    expect(under.tier).toBe(0);
    expect(rider.tier).toBe(1);
    expect(under.sinceDrop).toBe(0);
    expect(rider.sinceDrop).toBe(0);
  });

  it('lands them the same way round whichever the list holds first', () => {
    // The one on top comes earlier in the list than the one it lies on, as it can after medals have slid about.
    const under = medalAt(50, PUSHER.min + 0.5, { level: 1 });
    const rider = medalAt(50.3, PUSHER.min + 0.6, { level: 1, tier: 1 });
    const beside = medalAt(70, PUSHER.min + 0.4, { level: 1, tier: 1 });
    const machine = machineWith([rider, beside, under]);
    step(machine, DT);
    expect([under.level, rider.level, beside.level]).toEqual([0, 0, 0]);
    expect(under.tier).toBe(0);
    expect(rider.tier).toBe(1);
    // With nothing under it where it lands, a medal that was on top lies on the table.
    expect(beside.tier).toBe(0);
    // The same three in every other order end up the same way.
    for (const order of [[0, 1, 2], [2, 0, 1], [1, 2, 0], [2, 1, 0]]) {
      const three = [medalAt(50, PUSHER.min + 0.5, { level: 1 }), medalAt(50.3, PUSHER.min + 0.6, { level: 1, tier: 1 }), medalAt(70, PUSHER.min + 0.4, { level: 1, tier: 1 })];
      step(machineWith(order.map((index) => three[index])), DT);
      expect(three.map((medal) => medal.tier)).toEqual([0, 1, 0]);
    }
  });

  it('has a pile two deep on both tables once it has been played', () => {
    const machine = createMachine(31);
    run(machine, 120, (n) => [25, 50, 75, 40, 60][n % 5], 0.3);
    const onTop = (level: number) => machine.medals.filter((m) => m.level === level && m.tier === 1).length;
    expect(onTop(1)).toBeGreaterThan(15);
    expect(onTop(0)).toBeGreaterThan(3);
    // Whatever lies on top has something under it.
    for (const medal of machine.medals.filter((m) => m.tier === 1)) {
      const under = machine.medals.filter((m) => m.level === medal.level && m.tier === 0);
      expect(Math.min(...under.map((m) => Math.hypot(m.x - medal.x, m.y - medal.y)))).toBeLessThan(D);
    }
  }, LONG);
});

describe('medal towers', () => {
  it('splits a prize into as few towers as will hold it, as even as they can be', () => {
    expect(towerSizes(20)).toEqual([20]);
    expect(towerSizes(25)).toEqual([25]);
    expect(towerSizes(30)).toEqual([15, 15]);
    expect(towerSizes(50)).toEqual([25, 25]);
    expect(towerSizes(100)).toEqual([25, 25, 25, 25]);
    expect(towerSizes(300)).toHaveLength(12);
    expect(towerSizes(312)).toEqual(Array.from({ length: 13 }, () => 24));
    expect(towerSizes(0)).toEqual([]);
    const sites = TOWER_SITES;
    expect(sites).toBe(TOWER.perRow * TOWER.rows.length);
    // More than every site can hold: the towers are full and the rest is paid loose.
    expect(towerSizes(sites * TOWER.max + 70)).toEqual(Array.from({ length: sites }, () => TOWER.max));
    // With fewer places free, fewer towers; with none, no tower at all.
    expect(towerSizes(100, 2)).toEqual([25, 25]);
    expect(towerSizes(30, 1)).toEqual([25]);
    expect(towerSizes(100, 0)).toEqual([]);
    expect(() => towerSizes(10, -1)).toThrow();
    for (const medals of [1, 19, 26, 51, 137, 449]) {
      const sizes = towerSizes(medals);
      expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(medals);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(TOWER.max);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
    expect(() => towerSizes(-1)).toThrow();
    expect(() => towerSizes(2.5)).toThrow();
  });

  it('stacks a prize on the pusher, a medal at a time', () => {
    const machine = createMachine(13);
    const start = medalsOnField(machine);
    buildTowers(machine, 100);
    const towers = () => machine.medals.filter((m) => m.stack > 1 || m.grow > 0);
    expect(towers()).toHaveLength(4);
    expect(machine.growing).toBe(96);
    // The prize is on the field from the moment it is paid, though the towers are still going up.
    expect(medalsOnField(machine)).toBe(start + 100);
    expect(towers().every((tower) => tower.level === 1 && tower.y < pusherFront(machine.time))).toBe(true);
    // Going up, a tower shoulders its neighbours aside, and some of them leave the field.
    const early = step(machine, 0.5);
    expect(towers().every((tower) => tower.stack > 3 && tower.stack < 25)).toBe(true);
    const late = step(machine, 25 / TOWER.perSecond);
    expect(machine.growing).toBe(0);
    expect(
      towers()
        .map((tower) => tower.stack)
        .sort(),
    ).toEqual([25, 25, 25, 25]);
    expect(early.toppled + late.toppled).toBe(0);
    expect(medalsOnField(machine) + early.won + early.lost + late.won + late.lost).toBe(start + 100);
  });

  it('never stands a tower where one already stands, however often it pays', () => {
    const machine = createMachine(13);
    const start = medalsOnField(machine);
    const apart = () => {
      const towers = machine.medals.filter((m) => m.stack + m.grow > 1);
      let nearest = Infinity;
      for (let i = 0; i < towers.length; i++) {
        for (let j = i + 1; j < towers.length; j++) nearest = Math.min(nearest, Math.hypot(towers[i].x - towers[j].x, towers[i].y - towers[j].y));
      }
      return { count: towers.length, nearest };
    };
    // Six numbers of a run, one after another with no time passing, then a jackpot on top.
    let paid = 0;
    for (const medals of [10, 20, 30, 50, 10, 20]) {
      buildTowers(machine, medals);
      paid += medals;
    }
    expect(apart()).toMatchObject({ count: 8 });
    expect(apart().nearest).toBeGreaterThanOrEqual(MEDAL_RADIUS * 2);
    buildTowers(machine, 300);
    paid += 300;
    // Ten places were left for the jackpot's twelve towers: ten go up and the rest is thrown on loose.
    expect(apart().count).toBe(TOWER_SITES);
    expect(apart().nearest).toBeGreaterThanOrEqual(MEDAL_RADIUS * 2);
    expect(machine.payoutQueue).toBe(50);
    expect(medalsOnField(machine)).toBe(start + paid);
    // With every place taken, a further prize is thrown on loose in full.
    buildTowers(machine, 40);
    expect(apart().count).toBe(TOWER_SITES);
    expect(machine.payoutQueue).toBe(90);
    expect(() => buildTowers(machine, 1.5)).toThrow();
  });

  it('pays what its towers cannot hold as loose medals', () => {
    const machine = createMachine(13);
    const sites = TOWER.perRow * TOWER.rows.length;
    buildTowers(machine, sites * TOWER.max + 33);
    expect(machine.medals.filter((m) => m.grow > 0)).toHaveLength(sites);
    expect(machine.payoutQueue).toBe(33);
  });

  it('comes down across the lower table when it is pushed over the lip', () => {
    const machine = createMachine(17);
    const start = medalsOnField(machine);
    buildTowers(machine, 20);
    let toppled = 0;
    let spilled = 0;
    let won = 0;
    let lost = 0;
    let dropped = 0;
    let clock = 1;
    for (let i = 0; i < 60 * 90 && toppled === 0; i++) {
      if (clock >= 0.25) {
        clock = 0;
        if (dropMedal(machine, 50)) dropped++;
      }
      const events = step(machine, DT);
      clock += DT;
      won += events.won;
      lost += events.lost;
      if (events.toppled > 0) {
        toppled = events.toppled;
        const tumbling = machine.falling.filter((m) => m.source === 'spill');
        spilled = tumbling.length;
        expect(tumbling.every((m) => m.level === 0 && m.y > pusherFront(machine.time) && m.y <= FIELD.depth - MEDAL_RADIUS)).toBe(true);
        // The top of the tower lands furthest out and last.
        const byRank = [...tumbling].sort((a, b) => a.rank - b.rank);
        expect(byRank[byRank.length - 1].duration).toBeGreaterThan(byRank[0].duration);
        expect(byRank.map((m) => m.rank)).toEqual(Array.from({ length: 20 }, (_, rank) => rank));
      }
    }
    expect(toppled).toBe(1);
    expect(spilled).toBe(20);
    expect(machine.medals.some((m) => m.stack > 1)).toBe(false);
    expect(start + 20 + dropped).toBe(medalsOnField(machine) + won + lost);
    // Its medals land as ordinary medals of the lower table.
    const before = machine.medals.length;
    const landed = step(machine, TOWER.fall.last + 0.05).landed;
    expect(landed).toBeGreaterThanOrEqual(20);
    expect(machine.medals.length).toBeGreaterThanOrEqual(before);
  }, LONG);
});

describe('prize balls', () => {
  it('comes down onto the pusher and is not counted as a medal', () => {
    const machine = createMachine(4);
    const medals = medalsOnField(machine);
    dropBall(machine);
    expect(ballsOnField(machine)).toBe(1);
    expect(medalsOnField(machine)).toBe(medals);
    expect(step(machine, FALL_TIME + 0.05).checkers).toEqual([]);
    const ball = machine.medals.find((m) => m.ball);
    expect(ball?.level).toBe(1);
  });

  it('goes over the front as a ball, never as a medal, and never out of a side', () => {
    for (const seed of [6, 60]) {
      const machine = createMachine(seed, 3);
      const start = medalsOnField(machine);
      const events = run(machine, 120, (n) => [25, 50, 75, 12, 88][n % 5], 0.2);
      expect(events.balls).toBeGreaterThan(0);
      expect(events.balls + ballsOnField(machine)).toBe(3);
      expect(start + events.dropped).toBe(medalsOnField(machine) + events.won + events.lost);
    }
  }, LONG);
});
