import { describe, expect, it } from 'vitest';

import {
  AIM,
  BALL_SPOTS,
  CHECKERS,
  DROP_INTERVAL,
  FALL_TIME,
  FIELD,
  INITIAL,
  LANDING,
  MEDAL_RADIUS,
  PUSHER,
  TOWER,
  ballsOnField,
  buildTowers,
  checkerAt,
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
  type StepEvents,
} from '@/components/game/MedalPusher/engine';

const DT = 1 / 60;

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

const snapshot = (machine: Machine) => machine.medals.map((m) => `${m.id}:${m.level}:${m.x.toFixed(6)}:${m.y.toFixed(6)}:${m.stack}`).join('|');

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

  it('knows which gate a landing spot is under', () => {
    expect(CHECKERS.positions.map(checkerAt)).toEqual([0, 1, 2]);
    expect(checkerAt(50 + CHECKERS.halfWidth)).toBe(1);
    expect(checkerAt(50 + CHECKERS.halfWidth + 0.01)).toBe(-1);
    expect(checkerAt(37.5)).toBe(-1);
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
      const upper = machine.medals.filter((m) => m.level === 1);
      const lower = machine.medals.filter((m) => m.level === 0);
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
      expect(machine.medals.length).toBe(plain.medals.length);
      expect(medalsOnField(machine)).toBe(medalsOnField(plain) - balls);
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
    expect(machine.medals[machine.medals.length - 1].level).toBe(1);
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
  });

  it('neither makes nor loses a medal', () => {
    const machine = createMachine(8);
    const start = medalsOnField(machine);
    queuePayout(machine, 40);
    buildTowers(machine, 50);
    const events = run(machine, 120, (n) => 10 + ((n * 37) % 80), 0.2);
    expect(events.won).toBeGreaterThan(100);
    expect(events.lost).toBeGreaterThan(10);
    expect(start + 40 + 50 + events.dropped).toBe(medalsOnField(machine) + events.won + events.lost);
  });

  it('keeps every medal inside the walls and clear of the pusher', () => {
    const machine = createMachine(21, 2);
    const slack = 1e-6;
    const inside = (x: number, margin: number) => x >= margin - slack && x <= FIELD.width - margin + slack;
    let clock = 1;
    let dropped = 0;
    let checked = 0;
    const strays: string[] = [];
    for (let i = 0; i < 60 * 40; i++) {
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
    expect(checked).toBeGreaterThan(400_000);
    expect(strays).toEqual([]);
  });

  it('counts a medal the player dropped through a gate, and no other', () => {
    const aimed = createMachine(5);
    const hits = run(aimed, 80, 50, 0.25).checkers;
    expect(hits.length).toBeGreaterThan(30);
    expect(hits.every((gate) => gate === 1)).toBe(true);

    // Aimed between two gates, a medal would have to stray 11.1 to reach one, of the 12 it can.
    const between = createMachine(5);
    const stray = run(between, 80, 37.5, 0.25);
    expect(stray.checkers.length).toBeLessThan(hits.length / 8);

    // From the edge the nearest gate is out of reach altogether.
    const edge = createMachine(5);
    expect(run(edge, 80, AIM.min, 0.25).checkers).toEqual([]);

    // Medals the machine pays out fall across every gate and start nothing.
    const paid = createMachine(5);
    queuePayout(paid, 400);
    const payout = run(paid, 60);
    expect(payout.landed).toBe(400);
    expect(payout.checkers).toEqual([]);
    expect(() => queuePayout(paid, 1.5)).toThrow();
    expect(() => queuePayout(paid, -1)).toThrow();
  });
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
    const sites = TOWER.perRow * TOWER.rows.length;
    // More than every site can hold: the towers are full and the rest is paid loose.
    expect(towerSizes(sites * TOWER.max + 70)).toEqual(Array.from({ length: sites }, () => TOWER.max));
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
  });
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
    for (const seed of [6, 60, 600]) {
      const machine = createMachine(seed, 3);
      const start = medalsOnField(machine);
      const events = run(machine, 240, (n) => [25, 50, 75, 12, 88][n % 5], 0.2);
      expect(events.balls).toBeGreaterThan(0);
      expect(events.balls + ballsOnField(machine)).toBe(3);
      expect(start + events.dropped).toBe(medalsOnField(machine) + events.won + events.lost);
    }
  });
});
