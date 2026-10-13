import { describe, expect, it } from 'vitest';

import {
  AIM,
  ARM_REACH,
  ARM_START,
  ARM_SPEED,
  BALL_SPOTS,
  CHECKERS,
  DROP_INTERVAL,
  FALL_TIME,
  FIELD,
  GAP,
  INITIAL,
  JEWEL_DROP,
  JEWEL_SPOTS,
  LANDING,
  LUCKY,
  MEDAL_RADIUS,
  MEDAL_THICKNESS,
  PUSHER,
  RELEASE,
  ROLL_TIME,
  TOWER,
  TOWER_SITES,
  armFor,
  armGoal,
  aimArm,
  armStart,
  dropMedal,
  ballsOnField,
  buildTowers,
  checkerAt,
  clampAim,
  createMachine,
  dropBall,
  dropJewel,
  jewelsOnField,
  luckySlot,
  medalsOnField,
  pusherFront,
  queuePayout,
  seededRng,
  step,
  tipOf,
  towerSizes,
  worstOverlap,
  type Arm,
  type Machine,
  type Medal,
  type StepEvents,
} from '@/components/game/MedalPusher/engine';
import { LIFT } from '@/components/game/MedalPusher/lift';

import { aimBoth, dropAt } from './feeding';

const DT = 1 / 60;
/** Tests that run the field for a minute or more of its own time get room on a slow machine. */
const LONG = 30_000;

/** Where the medals of a run are aimed: one spot, a spot for the `n`-th medal, or a spot the arms follow as the clock runs. */
type Aim = number | ((n: number) => number) | { follow: (time: number) => number };

/**
 * Runs the machine for `seconds`, dropping a medal at `aim` every `every` seconds
 * when one is given. A medal drops where its arm is pointing as it leaves the tip,
 * so before every step the arms are put where the medal that leaves next was
 * aimed, or where an aim that is followed will be by the end of the step.
 */
function run(machine: Machine, seconds: number, aim?: Aim, every = 0.25) {
  const total: StepEvents = { won: 0, lost: 0, checkers: [], landed: 0, toppled: 0, balls: 0, jewels: 0 };
  let dropped = 0;
  let clock = every;
  const meant: number[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const followed = typeof aim === 'object' ? aim.follow(machine.time + DT) : undefined;
    if (aim !== undefined && clock >= every) {
      clock = 0;
      const spot = followed ?? (typeof aim === 'function' ? aim(dropped) : (aim as number));
      if (dropAt(machine, spot)) {
        dropped++;
        meant.push(spot);
      }
    }
    meant.splice(0, meant.length - machine.rolling.length);
    if (followed !== undefined) aimBoth(machine, followed);
    else if (meant.length > 0) aimBoth(machine, meant[0]);
    const events = step(machine, DT);
    total.won += events.won;
    total.lost += events.lost;
    total.landed += events.landed;
    total.toppled += events.toppled;
    total.balls += events.balls;
    total.jewels += events.jewels;
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

  it('has three chuckers side by side in the middle of the lip, with the towers’ places between them', () => {
    const [left, centre, right] = CHECKERS.positions;
    expect(CHECKERS.positions).toHaveLength(3);
    // The middle one is in the middle of the field, and the other two as far from it to either side.
    expect(centre).toBe(FIELD.width / 2);
    expect(centre - left).toBe(right - centre);
    // They are as far apart as the towers are, and the towers go up to either side of the middle:
    // so a tower's place is halfway between two chuckers, or outside all three.
    expect(centre - left).toBe(TOWER.spacing);
    for (let i = 0; i < TOWER.perRow; i++) {
      const site = FIELD.width / 2 + (i - (TOWER.perRow - 1) / 2) * TOWER.spacing;
      expect(checkerAt(site)).toBe(-1);
      expect(Math.min(...CHECKERS.positions.map((x) => Math.abs(site - x)))).toBeGreaterThanOrEqual(TOWER.spacing / 2);
    }
    // A chucker's mouth is a medal wide and `halfWidth` to spare on either side. The three mouths do
    // not run into each other, and together they keep to the middle of the lip.
    const mouth = MEDAL_RADIUS + CHECKERS.halfWidth;
    expect(2 * mouth).toBeLessThan(centre - left);
    expect(left - mouth).toBeGreaterThan(FIELD.width * 0.3);
    expect(right + mouth).toBeLessThan(FIELD.width * 0.7);
    // The room to spare is a good deal less than half a medal's radius: a medal has to come over square on.
    expect(CHECKERS.halfWidth).toBe(1.13);
    expect(CHECKERS.halfWidth).toBeGreaterThan(0);
    expect(CHECKERS.halfWidth).toBeLessThan(MEDAL_RADIUS / 2);
    // With their wings open the slots take medals from a little further to the side: more than a tenth as wide
    // again, and well short of the 1.7 they took before they were narrowed, which paid fast play too well. Even
    // so they do not run into each other, and keep to the middle of the lip.
    expect(CHECKERS.wingWidth).toBe(1.25);
    expect(CHECKERS.wingWidth).toBeGreaterThan(CHECKERS.halfWidth * 1.1);
    expect(CHECKERS.wingWidth).toBeLessThan(1.7);
    expect(CHECKERS.wingWidth).toBeLessThan(MEDAL_RADIUS);
    const winged = MEDAL_RADIUS + CHECKERS.wingWidth;
    expect(2 * winged).toBeLessThan(centre - left);
    expect(left - winged).toBeGreaterThan(FIELD.width * 0.3);
    expect(right + winged).toBeLessThan(FIELD.width * 0.7);
    // A medal let go at the very edge of the field cannot come down in line with one: it has to be pushed there.
    expect(left - CHECKERS.wingWidth).toBeGreaterThan(AIM.min + LANDING.scatter);
    expect(right + CHECKERS.wingWidth).toBeLessThan(AIM.max - LANDING.scatter);
  });

  it('knows which chucker a medal going over the lip is in line with', () => {
    expect(CHECKERS.positions.map((x) => checkerAt(x))).toEqual([0, 1, 2]);
    CHECKERS.positions.forEach((x, chucker) => {
      expect(checkerAt(x + CHECKERS.halfWidth - 0.01)).toBe(chucker);
      expect(checkerAt(x - CHECKERS.halfWidth + 0.01)).toBe(chucker);
      expect(checkerAt(x + CHECKERS.halfWidth + 0.01)).toBe(-1);
      expect(checkerAt(x - CHECKERS.halfWidth - 0.01)).toBe(-1);
    });
    // Between two of them, beside all three, and out at the walls: none.
    for (const x of [43, 57, 25, 75, AIM.min, AIM.max, 0, FIELD.width]) expect(checkerAt(x)).toBe(-1);
    expect(clampAim(-5)).toBe(AIM.min);
    expect(clampAim(500)).toBe(AIM.max);
    expect(clampAim(40)).toBe(40);
  });

  it('takes a medal from further to the side at the wing width, and at the narrow width when it is given none', () => {
    CHECKERS.positions.forEach((x, chucker) => {
      for (const side of [-1, 1]) {
        // Up to the wing width and no further.
        expect(checkerAt(x + side * (CHECKERS.wingWidth - 0.01), CHECKERS.wingWidth)).toBe(chucker);
        expect(checkerAt(x + side * (CHECKERS.wingWidth + 0.01), CHECKERS.wingWidth)).toBe(-1);
        // Between the two widths a medal is in line with the slot only at the wider one.
        const between = x + (side * (CHECKERS.halfWidth + CHECKERS.wingWidth)) / 2;
        expect(checkerAt(between)).toBe(-1);
        expect(checkerAt(between, CHECKERS.halfWidth)).toBe(-1);
        expect(checkerAt(between, CHECKERS.wingWidth)).toBe(chucker);
        // Inside the narrow width it is in line with it at either.
        expect(checkerAt(x + side * (CHECKERS.halfWidth - 0.01), CHECKERS.wingWidth)).toBe(chucker);
      }
    });
    // Where the towers go up, and beside all three, no width that a slot has reaches.
    for (const x of [43, 57, 25, 75, AIM.min, AIM.max, 0, FIELD.width]) expect(checkerAt(x, CHECKERS.wingWidth)).toBe(-1);
    expect(checkerAt(50, 0)).toBe(1);
    expect(checkerAt(50.001, 0)).toBe(-1);
  });

  it('lights one slot at a time and steps the light along with every stroke of the pusher', () => {
    expect(LUCKY.dwell).toBe(PUSHER.period);
    expect(luckySlot(0)).toBe(0);
    // From the left, one slot a stroke, and round again.
    expect(Array.from({ length: 7 }, (_, stroke) => luckySlot((stroke + 0.5) * PUSHER.period))).toEqual([0, 1, 2, 0, 1, 2, 0]);
    for (let stroke = 0; stroke < 9; stroke++) {
      const back = stroke * PUSHER.period;
      const lit = stroke % CHECKERS.positions.length;
      // It stays on its slot for the whole of a stroke, out and back.
      for (const part of [0, 0.01, 0.25, 0.5, 0.75, 0.99]) expect(luckySlot(back + part * PUSHER.period)).toBe(lit);
      // It moves at the moment the pusher is fully back: a step before, it was still on the slot before.
      expect(pusherFront(back)).toBeCloseTo(PUSHER.min, 9);
      if (stroke > 0) expect(luckySlot(back - DT)).toBe((stroke - 1) % CHECKERS.positions.length);
    }
    // On a machine's own clock, which gets there a sixtieth of a second at a time, it moves once a stroke, in the
    // step that brings the pusher back, whatever the sums of all those sixtieths have come to.
    const machine = machineWith([]);
    const moves: { step: number; to: number }[] = [];
    let lit = luckySlot(machine.time);
    const perStroke = Math.round(PUSHER.period / DT);
    for (let i = 1; i <= 4 * perStroke + 2; i++) {
      step(machine, DT);
      const now = luckySlot(machine.time);
      if (now === lit) continue;
      moves.push({ step: i, to: now });
      lit = now;
      expect(pusherFront(machine.time)).toBeCloseTo(PUSHER.min, 6);
    }
    expect(moves).toEqual([
      { step: perStroke, to: 1 },
      { step: 2 * perStroke, to: 2 },
      { step: 3 * perStroke, to: 0 },
      { step: 4 * perStroke, to: 1 },
    ]);
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
    expect(dropAt(machine, 40)).toBe(true);
    expect(dropAt(machine, 40)).toBe(false);
    step(machine, DROP_INTERVAL / 2);
    expect(dropAt(machine, 40)).toBe(false);
    step(machine, DROP_INTERVAL / 2 + 1e-6);
    expect(dropAt(machine, 40)).toBe(true);
    // Both are on the left arm's rail, the first a drop interval further down it. Neither is in the air yet.
    expect(machine.falling).toHaveLength(0);
    expect(machine.rolling.map((medal) => medal.arm)).toEqual([0, 0]);
    expect(machine.rolling[1].remaining).toBe(ROLL_TIME);
    expect(machine.rolling[0].remaining).toBeCloseTo(ROLL_TIME - DROP_INTERVAL, 5);
    expect(machine.rolling[0].id).toBeLessThan(machine.rolling[1].id);
    // By the time the second has rolled down, the first has dropped off as well and is still in the air.
    step(machine, ROLL_TIME);
    expect(machine.rolling).toHaveLength(0);
    expect(machine.falling).toHaveLength(2);
    for (const medal of machine.falling) {
      expect(Math.abs(medal.x - 40)).toBeLessThanOrEqual(LANDING.scatter);
      expect(medal.y).toBeGreaterThanOrEqual(LANDING.from);
      expect(medal.y).toBeLessThanOrEqual(LANDING.to);
      expect(medal.level).toBe(1);
      expect(medal.source).toBe('player');
      expect(medal.fromX).toBe(40);
      expect(medal.fromY).toBe(RELEASE.depth);
      expect(medal.duration).toBe(FALL_TIME);
    }
    expect(machine.falling[0].remaining).toBeCloseTo(FALL_TIME - DROP_INTERVAL, 5);
    expect(machine.falling[1].remaining).toBeCloseTo(FALL_TIME, 9);
    expect(machine.falling[1].remaining).toBeLessThanOrEqual(FALL_TIME);
    expect(() => dropAt(machine, Number.NaN)).toThrow();
  });

  it('lands a roll and a fall after it is fed, on the pusher', () => {
    const machine = createMachine(11);
    const before = machine.medals.length;
    dropAt(machine, 60);
    expect(step(machine, ROLL_TIME + FALL_TIME - 0.05).landed).toBe(0);
    expect(machine.falling).toHaveLength(1);
    expect(step(machine, 0.1).landed).toBe(1);
    expect(machine.rolling).toHaveLength(0);
    expect(machine.falling).toHaveLength(0);
    expect(machine.medals.length).toBe(before + 1);
    expect(machine.medals.some((m) => m.level === 1 && m.grown < 1)).toBe(true);
  });

  it('bunches its landings round the aim', () => {
    const machine = createMachine(3);
    for (let i = 0; i < 4000; i++) {
      machine.waits = [0, 0];
      dropAt(machine, 50);
    }
    // All of them drop off the tip together, each a little to one side of it.
    step(machine, ROLL_TIME);
    const offsets = machine.falling.map((medal) => medal.x - 50);
    expect(offsets).toHaveLength(4000);
    const near = offsets.filter((offset) => Math.abs(offset) <= LANDING.scatter / 2).length / offsets.length;
    // A triangular spread puts three quarters of the landings in the inner half.
    expect(near).toBeGreaterThan(0.72);
    expect(near).toBeLessThan(0.78);
    expect(Math.abs(offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length)).toBeLessThan(0.3);
  });

  it('feeds the arm it is told to, and each arm’s slot waits on its own', () => {
    const machine = createMachine(11);
    // A new machine's arms each point a little to their own side of the middle, and both slots are free.
    expect(machine.aims).toEqual([armStart(0), armStart(1)]);
    expect(machine.waits).toEqual([0, 0]);
    expect(machine.rolling).toEqual([]);
    // Both arms take a medal in the same instant. Feeding moves neither arm's aim.
    expect(dropMedal(machine, 0)).toBe(true);
    expect(dropMedal(machine, 1)).toBe(true);
    expect(machine.rolling).toEqual([
      { id: expect.any(Number), arm: 0, remaining: ROLL_TIME },
      { id: expect.any(Number), arm: 1, remaining: ROLL_TIME },
    ]);
    expect(machine.aims).toEqual([armStart(0), armStart(1)]);
    expect(machine.waits).toEqual([DROP_INTERVAL, DROP_INTERVAL]);
    // Neither takes another until its own wait is over.
    expect(dropMedal(machine, 0)).toBe(false);
    expect(dropMedal(machine, 1)).toBe(false);
    expect(machine.rolling).toHaveLength(2);
    // The two waits run side by side, and one arm's wait is nothing to the other: the left arm, fed again a
    // moment after the right, is still waiting when the right arm's slot is free.
    step(machine, DROP_INTERVAL - 0.05);
    machine.waits[0] = DROP_INTERVAL;
    step(machine, 0.05 + 1e-6);
    expect(machine.waits[1]).toBe(0);
    expect(machine.waits[0]).toBeCloseTo(DROP_INTERVAL - 0.05, 5);
    expect(dropMedal(machine, 0)).toBe(false);
    expect(dropMedal(machine, 1)).toBe(true);
    step(machine, DROP_INTERVAL - 0.05);
    expect(dropMedal(machine, 0)).toBe(true);
    expect(dropMedal(machine, 1)).toBe(false);
    expect(machine.rolling.map((medal) => medal.arm)).toEqual([0, 1, 1, 0]);
    // Flat out, two arms feed twice what one does: a medal each, every wait.
    const both = createMachine(11);
    let fed = 0;
    for (let i = 0; i < 120; i++) {
      for (const arm of [0, 1] as const) if (dropMedal(both, arm)) fed++;
      step(both, DT);
    }
    expect(fed).toBe(2 * Math.ceil(2 / (Math.ceil(DROP_INTERVAL / DT - 1e-6) * DT)));
    // There is a left arm and a right arm, and no other.
    expect(() => dropMedal(machine, 2 as Arm)).toThrow();
    expect(() => dropMedal(machine, Number.NaN as Arm)).toThrow();
    // The arm on a side of the field is the one whose half that is.
    expect(armFor(AIM.min)).toBe(0);
    expect(armFor(FIELD.width / 2 - 0.01)).toBe(0);
    expect(armFor(FIELD.width / 2)).toBe(1);
    expect(armFor(AIM.max)).toBe(1);
  });

  it('points each arm on its own, within its reach, and never past the other', () => {
    const machine = createMachine(11);
    aimArm(machine, 0, 20);
    expect(machine.aims).toEqual([20, armStart(1)]);
    aimArm(machine, 1, 80);
    expect(machine.aims).toEqual([20, 80]);
    // An aim is held inside the arm's own reach.
    aimArm(machine, 0, -40);
    expect(machine.aims[0]).toBe(ARM_REACH[0].min);
    aimArm(machine, 1, 400);
    expect(machine.aims[1]).toBe(ARM_REACH[1].max);
    aimArm(machine, 0, 400);
    expect(machine.aims).toEqual([ARM_REACH[0].max, ARM_REACH[1].max]);
    // The rails do not cross: an arm can be brought up to the other's aim and no further, from either side.
    aimArm(machine, 1, -40);
    expect(machine.aims).toEqual([ARM_REACH[0].max, ARM_REACH[0].max]);
    aimArm(machine, 0, 45);
    aimArm(machine, 1, 42);
    expect(machine.aims).toEqual([45, 45]);
    aimArm(machine, 1, 70);
    aimArm(machine, 0, 90);
    expect(machine.aims).toEqual([ARM_REACH[0].max, 70]);
    aimArm(machine, 1, 52);
    expect(machine.aims).toEqual([ARM_REACH[0].max, ARM_REACH[0].max]);
    aimArm(machine, 0, 58);
    expect(machine.aims).toEqual([58, ARM_REACH[0].max]);
    // Both can point down the middle at once.
    aimArm(machine, 0, 10);
    aimArm(machine, 1, 50);
    aimArm(machine, 0, 50);
    expect(machine.aims).toEqual([50, 50]);
    // An aim has to be a number, and one that is not changes nothing.
    expect(() => aimArm(machine, 0, Number.NaN)).toThrow();
    expect(() => aimArm(machine, 1, Number.POSITIVE_INFINITY)).toThrow();
    expect(machine.aims).toEqual([50, 50]);
  });

  it('gives each arm its own side and a little of the other, enough for the column behind the centre chucker', () => {
    const middle = FIELD.width / 2;
    expect(ARM_REACH[0].min).toBe(AIM.min);
    expect(ARM_REACH[1].max).toBe(AIM.max);
    expect(ARM_REACH[0].max).toBeGreaterThan(middle);
    expect(ARM_REACH[1].min).toBeLessThan(middle);
    // The two reach as far past the middle as each other: either can feed the column behind the centre
    // chucker, with room to spare, and neither reaches the column behind the other's outer one.
    expect(ARM_REACH[0].max - middle).toBe(middle - ARM_REACH[1].min);
    expect(ARM_REACH[0].max).toBeGreaterThan(CHECKERS.positions[1] + MEDAL_RADIUS + CHECKERS.halfWidth);
    expect(ARM_REACH[1].min).toBeLessThan(CHECKERS.positions[1] - MEDAL_RADIUS - CHECKERS.halfWidth);
    expect(ARM_REACH[0].max).toBeLessThan(CHECKERS.positions[2]);
    expect(ARM_REACH[1].min).toBeGreaterThan(CHECKERS.positions[0]);
    // A tip is over the aim as far as its arm reaches, and at the end of its reach beyond that.
    expect(tipOf(0, 30)).toBe(30);
    expect(tipOf(0, 55)).toBe(55);
    expect(tipOf(0, 90)).toBe(ARM_REACH[0].max);
    expect(tipOf(1, 70)).toBe(70);
    expect(tipOf(1, 45)).toBe(45);
    expect(tipOf(1, 10)).toBe(ARM_REACH[1].min);
    // Wherever a medal is aimed, the arm it goes into reaches there.
    for (let aim = AIM.min; aim <= AIM.max; aim += 0.37) expect(tipOf(armFor(aim), aim)).toBe(aim);
  });

  it('lets a medal go where its arm is pointing when it gets to the tip, not where it was fed', () => {
    /** Feeds a medal at `fed` with no scatter, moves the arms to `then` halfway down the rail, and says where it was let go and where it lands. */
    const letGo = (fed: number, then: number) => {
      const machine = createMachine(11);
      // The scatter is not drawn when the medal goes in: the generator is not touched until it leaves.
      machine.rng = () => {
        throw new Error('nothing is drawn while a medal is on its rail');
      };
      dropAt(machine, fed);
      step(machine, ROLL_TIME / 2);
      expect(machine.rolling).toHaveLength(1);
      aimBoth(machine, then);
      machine.rng = () => 0.5;
      step(machine, ROLL_TIME / 2);
      expect(machine.rolling).toHaveLength(0);
      const [medal] = machine.falling;
      return { from: medal.fromX, x: medal.x };
    };
    expect(letGo(30, 30)).toEqual({ from: 30, x: 30 });
    expect(letGo(30, 45)).toEqual({ from: 45, x: 45 });
    expect(letGo(70, 88)).toEqual({ from: 88, x: 88 });
    // Past the middle an arm still follows, as far as it reaches.
    expect(letGo(30, 57)).toEqual({ from: 57, x: 57 });
    expect(letGo(70, 43)).toEqual({ from: 43, x: 43 });
    // Beyond its reach it stops at the end of it, and the medal drops there.
    expect(letGo(30, 90)).toEqual({ from: ARM_REACH[0].max, x: ARM_REACH[0].max });
    expect(letGo(70, 8)).toEqual({ from: ARM_REACH[1].min, x: ARM_REACH[1].min });
  });

  it('has its arms over their aims when it is switched on, and swings a tip to a new aim at the arms’ own speed', () => {
    const machine = createMachine(11);
    // Each arm points a little to its own side of the middle, and its tip is there already.
    expect(armStart(0)).toBe(FIELD.width / 2 - ARM_START);
    expect(armStart(1)).toBe(FIELD.width / 2 + ARM_START);
    expect(machine.tips).toEqual([armStart(0), armStart(1)]);
    expect([armGoal(machine, 0), armGoal(machine, 1)]).toEqual(machine.tips);
    step(machine, 1);
    expect(machine.tips).toEqual([armStart(0), armStart(1)]);
    // Pointing an arm moves nothing by itself: it swings as the machine runs, a step's worth at a time.
    // The other arm has not been pointed anywhere new, and stays.
    aimArm(machine, 0, 10);
    expect(machine.tips).toEqual([armStart(0), armStart(1)]);
    expect([armGoal(machine, 0), armGoal(machine, 1)]).toEqual([10, armStart(1)]);
    step(machine, DT);
    expect(machine.tips[0]).toBeCloseTo(armStart(0) - ARM_SPEED * DT, 9);
    expect(machine.tips[1]).toBe(armStart(1));
    // It gets there and stops, not a hair past it.
    step(machine, 0.2);
    expect(machine.tips).toEqual([10, armStart(1)]);
    // An aim that moves no faster than the arms is followed to the digit, step by step.
    for (let i = 1; i <= 20; i++) {
      aimArm(machine, 0, 10 + i);
      step(machine, DT);
      expect(machine.tips[0]).toBe(10 + i);
    }
    // One long step takes a tip as far as the short ones it is cut into. The left arm, with nothing on its
    // rail and nobody moving its aim, stays where it is pointed: an arm has no other place to go back to.
    expect(machine.tips).toEqual([30, armStart(1)]);
    aimArm(machine, 1, 90);
    step(machine, 0.05);
    expect(machine.tips[1]).toBeCloseTo(armStart(1) + ARM_SPEED * 0.05, 9);
    expect(machine.tips[0]).toBe(30);
    step(machine, 5);
    expect(machine.tips).toEqual([30, 90]);
    // No time, no movement.
    const before = [...machine.tips];
    step(machine, 0);
    expect(machine.tips).toEqual(before);
  });

  it('keeps each arm on its own aim, whatever the other does and whether or not a medal is on its rail', () => {
    const machine = createMachine(11);
    machine.rng = () => 0.5;
    dropAt(machine, 30);
    step(machine, 0.1);
    expect(machine.tips).toEqual([30, armStart(1)]);
    // The right arm is swung away. The left arm, with the medal on it, is not moved by that.
    aimArm(machine, 1, 80);
    step(machine, 0.1);
    expect(machine.tips[0]).toBe(30);
    // The left arm is pointed further than it reaches: it stops at the end of its reach, and its medal leaves
    // from there when it has come all its way. This is all of that but the last tenth of a second.
    aimArm(machine, 0, 80);
    step(machine, ROLL_TIME - 0.3);
    expect(machine.tips).toEqual([ARM_REACH[0].max, 80]);
    expect(machine.falling).toEqual([]);
    step(machine, 0.1);
    expect(machine.falling[0].fromX).toBe(ARM_REACH[0].max);
    // Its rail empty, it stays where it is pointed.
    step(machine, 0.5);
    expect(machine.tips).toEqual([ARM_REACH[0].max, 80]);
  });

  it('crosses an arm’s whole reach in less than its slot’s wait, so a medal’s arm can always be over its spot in time', () => {
    for (const arm of [0, 1] as const) expect((ARM_REACH[arm].max - ARM_REACH[arm].min) / ARM_SPEED).toBeLessThan(DROP_INTERVAL);
    // The most a stream can ask of an arm: medals as fast as its slot feeds them, meant by turns for the two
    // ends of its reach. Each arm is asked that with the other out of its way, and then both are at once, each
    // over its own half of the field.
    const asked: { spots: [(n: number) => number, (n: number) => number]; feed: Arm[] }[] = [
      { spots: [(n) => (n % 2 === 0 ? ARM_REACH[0].min : ARM_REACH[0].max), () => AIM.max], feed: [0] },
      { spots: [() => AIM.min, (n) => (n % 2 === 0 ? ARM_REACH[1].max : ARM_REACH[1].min)], feed: [1] },
      { spots: [(n) => (n % 2 === 0 ? AIM.min : FIELD.width / 2), (n) => (n % 2 === 0 ? AIM.max : FIELD.width / 2)], feed: [0, 1] },
    ];
    for (const { spots, feed } of asked) {
      const machine = createMachine(11);
      machine.rng = () => 0.5;
      aimArm(machine, 0, spots[0](0));
      aimArm(machine, 1, spots[1](0));
      const meant: [number[], number[]] = [[], []];
      const fed: [number[], number[]] = [[], []];
      const letGo: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
      for (let i = 0; i < 60 * 6; i++) {
        for (const arm of feed) {
          if (dropMedal(machine, arm)) {
            meant[arm].push(spots[arm](fed[arm].length));
            fed[arm].push(spots[arm](fed[arm].length));
          }
          // Each arm is held where the medal that leaves it next is meant to drop.
          meant[arm].splice(0, meant[arm].length - machine.rolling.filter((medal) => medal.arm === arm).length);
          aimArm(machine, arm, meant[arm][0]);
        }
        const onRail = new Map(machine.rolling.map((medal) => [medal.id, medal.arm]));
        step(machine, DT);
        for (const medal of machine.falling) {
          const arm = onRail.get(medal.id);
          if (arm !== undefined) letGo[arm].set(medal.id, medal.fromX);
        }
      }
      for (const arm of feed) {
        // One medal every eleven steps, and each left its arm exactly over its own spot.
        expect(fed[arm].length).toBeGreaterThan(30);
        // All but the few still on their way in at the end.
        expect(letGo[arm].size).toBeGreaterThanOrEqual(fed[arm].length - Math.ceil(ROLL_TIME / DROP_INTERVAL));
        expect([...letGo[arm].values()]).toEqual(fed[arm].slice(0, letGo[arm].size));
      }
    }
  });

  it('lets a medal go from where its arm’s tip has got to when the aim jumps as it reaches the tip', () => {
    /** The left arm is over 10 with a medal on it, and the aim jumps to 90 `early` steps before the medal gets to the tip. */
    const jump = (early: number) => {
      const machine = createMachine(11);
      machine.rng = () => 0.5;
      aimBoth(machine, 10);
      step(machine, 0.5);
      dropAt(machine, 10);
      for (let i = 0; i < Math.round(ROLL_TIME / DT) - early; i++) step(machine, DT);
      expect(machine.tips[0]).toBe(10);
      aimBoth(machine, 90);
      for (let i = 0; i < early; i++) step(machine, DT);
      expect(machine.rolling).toEqual([]);
      const [medal] = machine.falling;
      // Wherever the tip is, that is where the medal left, and with no scatter where it will land.
      expect(medal.fromX).toBe(machine.tips[0]);
      expect(medal.x).toBe(machine.tips[0]);
      return machine;
    };
    // In the very step it leaves: the arm has one step's swing behind it, nowhere near the end of its reach.
    const late = jump(1);
    expect(late.tips[0]).toBeCloseTo(10 + ARM_SPEED * DT, 9);
    expect(late.tips[0]).toBeLessThan(tipOf(0, 90) - 40);
    // A few steps before: that much further along.
    expect(jump(4).tips[0]).toBeCloseTo(10 + 4 * ARM_SPEED * DT, 9);
    // Given the time, the arm is at the end of its reach before the medal is at the tip.
    expect(jump(12).tips[0]).toBe(ARM_REACH[0].max);
    // Its rail empty, the arm carries on to where it is pointed, and stays there.
    step(late, 0.2);
    expect(late.tips).toEqual([ARM_REACH[0].max, 90]);
    step(late, 2);
    expect(late.tips).toEqual([ARM_REACH[0].max, 90]);
  });

  it('never lets the two tips pass each other or leave their reach, wherever each arm is pointed', () => {
    const machine = createMachine(11);
    const random = seededRng(3);
    const anywhere = () => AIM.min + random() * (AIM.max - AIM.min);
    const either = (): Arm => (random() < 0.5 ? 0 : 1);
    let apart = 0;
    let together = 0;
    for (let i = 0; i < 2500; i++) {
      if (random() < 0.25) aimArm(machine, either(), anywhere());
      if (random() < 0.15) dropMedal(machine, either());
      step(machine, random() < 0.2 ? random() * 0.1 : DT);
      // The aims are held that way round, and so are the tips, which only ever swing towards them.
      expect(machine.aims[0]).toBeLessThanOrEqual(machine.aims[1]);
      const [left, right] = machine.tips;
      expect(left).toBeLessThanOrEqual(right);
      expect(left).toBeGreaterThanOrEqual(ARM_REACH[0].min);
      expect(left).toBeLessThanOrEqual(ARM_REACH[0].max);
      expect(right).toBeGreaterThanOrEqual(ARM_REACH[1].min);
      expect(right).toBeLessThanOrEqual(ARM_REACH[1].max);
      if (left < right) apart++;
      else together++;
    }
    // Most of the time they are apart; now and then one has been brought right up to the other.
    expect(apart).toBeGreaterThan(1500);
    expect(together).toBeGreaterThan(0);
  }, LONG);

  it('makes a medal that leaves the tip the very medal the machine without arms dropped there at that moment', () => {
    // A seed, when the medal leaves, where it is aimed, and where the aim jumps to two steps before it leaves, if it does.
    const cases: [number, number, number, number?][] = [[5, 0.4, 50], [6, 1.7, 23], [7, 2.9, 81], [8, 5.2, 57], [9, 0.9, 12, 88], [10, 3.3, 70, 45]];
    for (const [seed, at, aim, jumpTo] of cases) {
      // Two machines alike. One has arms and is fed a roll before the moment; the other is left alone until then.
      const [armed, bare] = [createMachine(seed, 2), createMachine(seed, 2)];
      for (const machine of [armed, bare]) step(machine, at);
      expect(dropAt(armed, aim)).toBe(true);
      const steps = Math.round(ROLL_TIME / DT);
      for (let i = 0; i < steps; i++) {
        if (jumpTo !== undefined && i === steps - 2) aimBoth(armed, jumpTo);
        for (const machine of [armed, bare]) step(machine, DT);
      }
      // The medal left from where its arm's tip was: over the aim if the arm had got there, and on the way if the aim had just jumped.
      const from = armed.tips[armFor(aim)];
      if (jumpTo === undefined) expect(from).toBe(aim);
      else expect(Math.abs(from - aim)).toBeCloseTo(2 * ARM_SPEED * DT, 9);
      // Before the arms, a drop put a medal in the air there and then: two draws for the scatter, one for the depth, a whole fall to go.
      const offset = (bare.rng() + bare.rng() - 1) * LANDING.scatter;
      const x = Math.min(FIELD.width - MEDAL_RADIUS, Math.max(MEDAL_RADIUS, clampAim(from) + offset));
      const y = LANDING.from + bare.rng() * (LANDING.to - LANDING.from);
      bare.falling.push({ id: bare.nextId++, x, y, level: 1, fromX: clampAim(from), fromY: RELEASE.depth, rank: 0, ball: false, remaining: FALL_TIME, duration: FALL_TIME, source: 'player' });
      expect(armed.rolling).toEqual([]);
      expect(armed.falling).toEqual(bare.falling);
      // From here on the two cannot be told apart: the same landing, the same medals pushed the same way and through the same chuckers.
      const chuckers: number[][] = [[], []];
      [armed, bare].forEach((machine, index) => {
        for (let i = 0; i < 240; i++) chuckers[index].push(...step(machine, DT).checkers);
      });
      expect(chuckers[0]).toEqual(chuckers[1]);
      expect(snapshot(armed)).toBe(snapshot(bare));
      expect(armed.time).toBe(bare.time);
    }
  });

  it('lands a medal a fall after it leaves the tip, however the time is cut into steps', () => {
    // Before its arm a medal is in the slot and the track, which is the time `more` here.
    const more = ROLL_TIME - 0.5;
    const cuts = [[ROLL_TIME + FALL_TIME], [0.013, more, 0.2, 0.3, 0.1, 0.337], [0.05, 0.05, 0.4, 0.007, more, 0.443], [ROLL_TIME, FALL_TIME], [0.31 + more, 0.64]];
    for (const pieces of cuts) {
      expect(pieces.reduce((sum, piece) => sum + piece, 0)).toBeCloseTo(ROLL_TIME + FALL_TIME, 9);
      const machine = createMachine(11);
      dropAt(machine, 60);
      // An instant short of its roll and its fall it is still in the air, and at the end of them it is down.
      let landed = 0;
      for (const piece of pieces.slice(0, -1)) landed += step(machine, piece).landed;
      landed += step(machine, pieces[pieces.length - 1] - 1e-6).landed;
      expect(landed).toBe(0);
      expect(machine.falling).toHaveLength(1);
      expect(machine.falling[0].remaining).toBeCloseTo(1e-6, 9);
      expect(step(machine, 2e-6).landed).toBe(1);
    }
  });

  it('refuses a time step that is not a non-negative number', () => {
    const machine = createMachine(1);
    expect(() => step(machine, -0.01)).toThrow();
    expect(() => step(machine, Number.NaN)).toThrow();
    expect(() => step(machine, Number.POSITIVE_INFINITY)).toThrow();
    expect(step(machine, 0)).toEqual({ won: 0, lost: 0, checkers: [], landed: 0, toppled: 0, balls: 0, jewels: 0 });
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
        dropAt(machine, 8 + ((dropped++ * 53) % 84));
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

  it('sends a medal that goes over the lip in line with a chucker through it, and no other', () => {
    /** One medal on the pusher just past its lip at `x`, so that the next step takes it over: the chuckers it drops through. */
    const over = (x: number, medal: Partial<Medal> = {}) => {
      const machine = machineWith([medalAt(x, PUSHER.min + 0.5, { level: 1, ...medal })]);
      const events = step(machine, DT);
      expect(machine.medals.map((m) => m.level)).toEqual([0]);
      // It is on the lower table now, a medal like any other, and does not count again.
      expect(step(machine, 1).checkers).toEqual([]);
      return events.checkers;
    };
    CHECKERS.positions.forEach((x, chucker) => {
      expect(over(x)).toEqual([chucker]);
      expect(over(x + CHECKERS.halfWidth - 0.02)).toEqual([chucker]);
      expect(over(x - CHECKERS.halfWidth + 0.02)).toEqual([chucker]);
      expect(over(x + CHECKERS.halfWidth + 0.02)).toEqual([]);
      expect(over(x - CHECKERS.halfWidth - 0.02)).toEqual([]);
    });
    // Between two chuckers, beside all three, hard against a wall: over the lip and through nothing.
    for (const x of [43, 57, 22, 78, MEDAL_RADIUS, FIELD.width - MEDAL_RADIUS]) expect(over(x)).toEqual([]);
    // A medal that was lying on top of the pile counts like one on the table.
    expect(over(50, { tier: 1 })).toEqual([1]);
    // A ball does not fit a chucker.
    expect(over(50, { ball: true })).toEqual([]);
    expect(over(36, { ball: true })).toEqual([]);
  });

  it('counts a medal that goes over a little to the side of a slot while the wings are open, and only then', () => {
    /** One medal, or a tower, just past the lip at `x`: the slots it drops through in the step that takes it over, with the wings as they are said to be. */
    const over = (x: number, wings?: boolean, medal: Partial<Medal> = {}) => {
      const machine = machineWith([medalAt(x, PUSHER.min + 0.5, { level: 1, ...medal })]);
      const events = wings === undefined ? step(machine, DT) : step(machine, DT, wings);
      // Counted or not, it has gone over the lip all the same.
      expect(machine.medals.filter((m) => m.level === 1)).toEqual([]);
      return events.checkers;
    };
    // Halfway between the two widths from a slot's middle is outside the slot and inside its wings.
    const beside = (CHECKERS.halfWidth + CHECKERS.wingWidth) / 2;
    expect(beside).toBeGreaterThan(CHECKERS.halfWidth + 0.02);
    expect(beside).toBeLessThan(CHECKERS.wingWidth - 0.02);
    CHECKERS.positions.forEach((x, slot) => {
      for (const side of [-1, 1]) {
        expect(over(x + side * beside)).toEqual([]);
        expect(over(x + side * beside, false)).toEqual([]);
        expect(over(x + side * beside, true)).toEqual([slot]);
        // The wings reach as far as their width and no further.
        expect(over(x + side * (CHECKERS.wingWidth - 0.02), true)).toEqual([slot]);
        expect(over(x + side * (CHECKERS.wingWidth + 0.02), true)).toEqual([]);
        // A medal that fits the slot counts once, wings or no wings.
        expect(over(x + side * (CHECKERS.halfWidth - 0.02), true)).toEqual([slot]);
        expect(over(x + side * (CHECKERS.halfWidth - 0.02), false)).toEqual([slot]);
      }
    });
    // Every medal of a tower that goes over inside the wings counts, and a ball still does not fit.
    expect(over(50 + beside, true, { stack: 6 })).toEqual([1, 1, 1, 1, 1, 1]);
    expect(over(50 + beside, false, { stack: 6 })).toEqual([]);
    expect(over(50 + beside, true, { ball: true })).toEqual([]);
    // Halfway between two slots, where the towers go up, no wing reaches.
    expect(over(43, true)).toEqual([]);

    // The wings change what is counted and nothing else: two machines fed alike are the same field to the last
    // digit, and the one with its wings open counts every medal the other does, and some more.
    const [shut, open] = [createMachine(12), createMachine(12)];
    const counted = { shut: 0, open: 0 };
    const moved = { shut: { won: 0, lost: 0 }, open: { won: 0, lost: 0 } };
    for (let i = 0; i < 40 * 60; i++) {
      if (i % 12 === 0) for (const machine of [shut, open]) dropAt(machine, 44 + ((i / 12) % 13));
      const [a, b] = [step(shut, DT, false), step(open, DT, true)];
      counted.shut += a.checkers.length;
      counted.open += b.checkers.length;
      expect(b.checkers.length).toBeGreaterThanOrEqual(a.checkers.length);
      moved.shut.won += a.won;
      moved.shut.lost += a.lost;
      moved.open.won += b.won;
      moved.open.lost += b.lost;
    }
    expect(snapshot(open)).toBe(snapshot(shut));
    expect(moved.open).toEqual(moved.shut);
    expect(counted.shut).toBeGreaterThan(0);
    expect(counted.open).toBeGreaterThan(counted.shut);
  }, LONG);

  it('sends every medal of a tower through the chucker it goes over at', () => {
    /** A tower of `stack` medals just past the lip at `x`: the chuckers its medals drop through as it goes over. */
    const tower = (x: number, stack: number) => {
      const machine = machineWith([medalAt(x, PUSHER.min + 0.5, { level: 1, stack })]);
      const events = step(machine, DT);
      expect(events.toppled).toBe(1);
      expect(machine.falling.filter((medal) => medal.source === 'spill')).toHaveLength(stack);
      // They count as they leave the pusher, and not again when they come down on the lower table.
      const landing = step(machine, TOWER.fall.last + 0.1);
      expect(landing.landed).toBe(stack);
      expect(landing.checkers).toEqual([]);
      return events.checkers;
    };
    expect(tower(50, 20)).toEqual(Array.from({ length: 20 }, () => 1));
    expect(tower(36, 3)).toEqual([0, 0, 0]);
    expect(tower(64 + CHECKERS.halfWidth - 0.02, TOWER.max)).toEqual(Array.from({ length: TOWER.max }, () => 2));
    // Where the towers go up, halfway between two chuckers, a tower goes over and through neither.
    expect(tower(43, 20)).toEqual([]);
    expect(tower(57, TOWER.max)).toEqual([]);
    expect(tower(50 + CHECKERS.halfWidth + 0.02, 20)).toEqual([]);
    // Of a tower that is still going up, the medals it has are the ones that go through. The rest are thrown on loose.
    const growing = machineWith([medalAt(50, PUSHER.min + 0.5, { level: 1, stack: 4, grow: 6 })]);
    growing.growing = 6;
    expect(step(growing, DT).checkers).toEqual([1, 1, 1, 1]);
    expect(growing.payoutQueue).toBe(6);
    expect(growing.growing).toBe(0);
  });

  it('makes a medal as thin as a real one, and lays a tower that goes over down across the lower table as far as it stood tall', () => {
    // A real arcade medal is 25 mm across and 1.8 mm thick, a fourteenth. The machine's is within a hair of that: it was a seventh once.
    const share = MEDAL_THICKNESS / (MEDAL_RADIUS * 2);
    expect(share).toBeGreaterThan(0.06);
    expect(share).toBeLessThan(0.09);
    for (const stack of [3, 12, TOWER.max]) {
      const machine = machineWith([medalAt(22, PUSHER.min + 0.5, { level: 1, stack })]);
      expect(step(machine, DT).toppled).toBe(1);
      const lip = pusherFront(machine.time);
      // As tall as its medals are thick, and a tenth more for the way it goes over.
      const reach = stack * MEDAL_THICKNESS * 1.1;
      const down = machine.falling.filter((medal) => medal.source === 'spill').sort((a, b) => a.rank - b.rank);
      expect(down).toHaveLength(stack);
      for (const medal of down) {
        // The bottom ones nearest and the top ones furthest, each within a unit of its own share of the way.
        const out = MEDAL_RADIUS + ((medal.rank + 0.5) / stack) * reach;
        expect(Math.abs(medal.y - (lip + out))).toBeLessThanOrEqual(1);
        // And no further to either side than it has fanned out by then.
        expect(Math.abs(medal.x - 22)).toBeLessThanOrEqual(MEDAL_RADIUS + out * 0.35);
        expect(medal.fromY).toBe(lip);
      }
      // So the tallest tower there is comes down within three medals' widths of the foot of the pusher's face, and not half way to the front.
      expect(Math.max(...down.map((medal) => medal.y))).toBeLessThan(lip + MEDAL_RADIUS + TOWER.max * MEDAL_THICKNESS * 1.1 + 1);
      expect(lip + MEDAL_RADIUS + TOWER.max * MEDAL_THICKNESS * 1.1 + 1).toBeLessThan(lip + MEDAL_RADIUS * 6);
    }
  });

  it('starts nothing when a medal lands: only the lip counts', () => {
    // Let go with no scatter right behind each chucker in turn, it lands at the back of the pusher, and that is all.
    for (const aim of CHECKERS.positions) {
      const machine = createMachine(9);
      machine.rng = () => 0.5;
      dropAt(machine, aim);
      const events = step(machine, ROLL_TIME + FALL_TIME + DT);
      expect(events.landed).toBe(1);
      expect(events.checkers).toEqual([]);
      const landed = machine.medals[machine.medals.length - 1];
      expect(landed.level).toBe(1);
      expect(landed.y).toBeLessThan(PUSHER.min - MEDAL_RADIUS);
    }
  });

  it('sends more medals through the chuckers the nearer the middle they are fed, and counts the ones the machine pays', () => {
    // Fed down the middle: every chucker takes some, the middle one the most.
    const middle = createMachine(5);
    const fed = run(middle, 100, FIELD.width / 2, 0.25);
    const through = (chucker: number) => fed.checkers.filter((one) => one === chucker).length;
    expect(fed.dropped).toBeGreaterThan(350);
    // About one medal in eight once the machine has been fed for a while, and fewer from a machine that is new.
    expect(fed.checkers.length).toBeGreaterThan(fed.dropped / 16);
    expect(fed.checkers.length).toBeLessThan(fed.dropped / 5);
    expect(Math.min(through(0), through(1), through(2))).toBeGreaterThan(3);
    expect(through(1)).toBe(Math.max(through(0), through(1), through(2)));

    // Fed at an edge, the pile has to carry a medal a third of the way across first: far fewer get there.
    const edge = createMachine(5);
    const atEdge = run(edge, 100, AIM.min, 0.25).checkers;
    expect(atEdge.length).toBeLessThan(fed.checkers.length / 2);
    // And of those, most through the chucker on that side.
    expect(atEdge.filter((one) => one === 0).length).toBeGreaterThan(atEdge.filter((one) => one === 2).length);

    // Medals the machine pays out count like any others: nobody feeds this machine, and its payout alone sends medals through.
    const paid = createMachine(5);
    queuePayout(paid, 400);
    const payout = run(paid, 60);
    expect(payout.landed).toBe(400);
    expect(payout.dropped).toBe(0);
    expect(payout.checkers.length).toBeGreaterThan(15);
    expect(payout.checkers.length).toBeLessThan(100);
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
    // Each stands on the hatch of its lift, one medal high, until the hatch is open and the guard is up.
    const opening = step(machine, LIFT.opens - 0.05);
    expect(towers().every((tower) => tower.stack === 1)).toBe(true);
    expect(machine.growing).toBe(96);
    // Going up, a tower shoulders its neighbours aside, and some of them leave the field.
    const early = step(machine, 0.55);
    expect(towers().every((tower) => tower.stack > 3 && tower.stack < 25)).toBe(true);
    early.won += opening.won;
    early.lost += opening.lost;
    early.toppled += opening.toppled;
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
    // Six prizes, one after another with no time passing, then a jackpot on top.
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
        if (dropAt(machine, 50)) dropped++;
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
      // Two jewels lie on it as well: they go the same way, and are counted as neither a ball nor a medal.
      const machine = createMachine(seed, 3, 2);
      const start = medalsOnField(machine);
      const events = run(machine, 120, (n) => [25, 50, 75, 12, 88][n % 5], 0.2);
      expect(events.balls).toBeGreaterThan(0);
      expect(events.balls + ballsOnField(machine)).toBe(3);
      expect(events.jewels).toBeGreaterThan(0);
      expect(events.jewels + jewelsOnField(machine)).toBe(2);
      expect(start + events.dropped).toBe(medalsOnField(machine) + events.won + events.lost);
    }
  }, LONG);
});

describe('jewels', () => {
  const D = MEDAL_RADIUS * 2;

  it('lie on a new machine in place of medals, as many as it is asked for, and are neither balls nor medals', () => {
    expect(jewelsOnField(createMachine(5))).toBe(0);
    for (let jewels = 1; jewels <= JEWEL_SPOTS.length; jewels++) {
      const machine = createMachine(5, BALL_SPOTS.length, jewels);
      expect(jewelsOnField(machine)).toBe(jewels);
      expect(ballsOnField(machine)).toBe(BALL_SPOTS.length);
      expect(medalsOnField(machine)).toBe(machine.medals.length - BALL_SPOTS.length - jewels);
      expect(worstOverlap(machine)).toBeLessThan(0.005);
      const lying = machine.medals.filter((medal) => medal.jewel);
      expect(lying).toHaveLength(jewels);
      JEWEL_SPOTS.slice(0, jewels).forEach((spot) => {
        // Both lie on the lower table. Each took the place of the medal that lay nearest its spot, and nothing lies on it.
        expect(spot.level).toBe(0);
        const [jewel] = [...lying].sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y));
        expect([jewel.level, jewel.ball, jewel.tier, jewel.stack, jewel.grow]).toEqual([0, false, 0, 1, 0]);
        expect(Math.hypot(jewel.x - spot.x, jewel.y - spot.y)).toBeLessThan(D * 1.5);
        const onTop = machine.medals.filter((medal) => medal.tier === 1 && medal.level === jewel.level);
        expect(Math.min(...onTop.map((medal) => Math.hypot(medal.x - jewel.x, medal.y - jewel.y)))).toBeGreaterThanOrEqual(D * 1.6 - 1e-9);
      });
    }
    // The two are two medals' places apart or more, and neither is on the pusher, where the medals are fed.
    expect(Math.hypot(JEWEL_SPOTS[0].x - JEWEL_SPOTS[1].x, JEWEL_SPOTS[0].y - JEWEL_SPOTS[1].y)).toBeGreaterThan(D * 3);
    expect(createMachine(5, 2, 2).medals.filter((medal) => medal.jewel && medal.level === 1)).toEqual([]);
    // What is not a jewel does not say so: a medal is stored as it always was.
    expect(createMachine(5, 2, 2).medals.filter((medal) => 'jewel' in medal)).toHaveLength(2);
    expect(() => createMachine(5, 0, JEWEL_SPOTS.length + 1)).toThrow();
    expect(() => createMachine(5, 0, -1)).toThrow();
    expect(() => createMachine(5, 0, 0.5)).toThrow();
  });

  it('is thrown from the hatch onto the middle of the lower table, clear of the pusher, and is not counted as a medal', () => {
    for (const seed of [4, 40, 400]) {
      const machine = createMachine(seed);
      const medals = medalsOnField(machine);
      dropJewel(machine);
      expect(jewelsOnField(machine)).toBe(1);
      expect(ballsOnField(machine)).toBe(0);
      expect(medalsOnField(machine)).toBe(medals);
      const [falling] = machine.falling;
      // It is bound for the lower table: it never lies on the pusher, where the medals are fed and the START pockets are.
      expect([falling.jewel, falling.ball, falling.level, falling.source]).toEqual([true, false, 0, 'payout']);
      // In the middle of the table: nowhere near a wall, in front of anything the pusher carries, and behind where the sides open.
      expect(falling.x).toBeGreaterThanOrEqual(JEWEL_DROP.from);
      expect(falling.x).toBeLessThanOrEqual(JEWEL_DROP.to);
      expect(JEWEL_DROP.from + JEWEL_DROP.to).toBe(FIELD.width);
      expect(falling.y).toBeGreaterThanOrEqual(JEWEL_DROP.near);
      expect(falling.y).toBeLessThanOrEqual(JEWEL_DROP.far);
      expect(JEWEL_DROP.near).toBeGreaterThan(PUSHER.max + MEDAL_RADIUS * 2);
      expect(JEWEL_DROP.far + MEDAL_RADIUS).toBeLessThan(FIELD.sideOpenFrom);
      // The throw is a longer way than a medal's fall, and takes longer.
      expect([falling.remaining, falling.duration]).toEqual([JEWEL_DROP.time, JEWEL_DROP.time]);
      expect(JEWEL_DROP.time).toBeGreaterThan(FALL_TIME);
      expect(step(machine, JEWEL_DROP.time - 0.05).landed).toBe(0);
      const events = step(machine, 0.1);
      expect([events.landed, events.jewels, events.won, events.checkers.length]).toEqual([1, 0, 0, 0]);
      const jewel = machine.medals.find((medal) => medal.jewel);
      // It makes room for itself on the table, as a ball does.
      expect([jewel?.level, jewel?.tier, jewel?.ball]).toEqual([0, 0, false]);
      expect(jewelsOnField(machine)).toBe(1);
      expect(medalsOnField(machine)).toBe(medals);
    }
  });

  it('fits no START pocket: over the lip at one it starts nothing, and is a jewel on the lower table', () => {
    for (const x of CHECKERS.positions) {
      const machine = machineWith([medalAt(x, PUSHER.min + 0.5, { level: 1, jewel: true })]);
      expect(step(machine, DT).checkers).toEqual([]);
      expect(machine.medals.map((medal) => [medal.level, medal.tier, medal.jewel])).toEqual([[0, 0, true]]);
      expect(step(machine, 1).checkers).toEqual([]);
    }
  });

  it('is collected over the front, as a jewel and nothing else, and does not fit through an open side', () => {
    const over = machineWith([medalAt(40, FIELD.depth + 0.1, { jewel: true }), medalAt(60, FIELD.depth + 0.1), medalAt(70, FIELD.depth + 0.1, { ball: true })]);
    expect(step(over, DT)).toEqual({ won: 1, lost: 0, checkers: [], landed: 0, toppled: 0, balls: 1, jewels: 1 });
    expect(over.medals).toEqual([]);
    // Where the sides are open a medal that is pushed out is lost. A jewel there is held, as a ball is: the slot is only a medal high.
    const open = (FIELD.sideOpenFrom + FIELD.depth) / 2;
    const side = machineWith([medalAt(-0.5, open, { jewel: true }), medalAt(FIELD.width + 0.5, open, { jewel: true }), medalAt(-0.5, open + D), medalAt(FIELD.width + 0.5, open - D)]);
    expect(step(side, DT)).toEqual({ won: 0, lost: 2, checkers: [], landed: 0, toppled: 0, balls: 0, jewels: 0 });
    expect(side.medals.map((medal) => [medal.jewel, medal.x])).toEqual([
      [true, MEDAL_RADIUS],
      [true, FIELD.width - MEDAL_RADIUS],
    ]);
    // So nothing a machine does loses one: however long it is left lying by a side, it is still on the field.
    for (let i = 0; i < 120; i++) step(side, DT);
    expect(jewelsOnField(side)).toBe(2);
  });

  it('never has a medal on it or under it', () => {
    const jewel = medalAt(70, 15, { level: 1, jewel: true });
    const near = medalAt(72, 15, { level: 1, tier: 1 });
    // Something for the one on top to lie on, so it does not simply drop.
    const machine = machineWith([jewel, near, medalAt(76.5, 15, { level: 1 })]);
    for (let i = 0; i < 20; i++) step(machine, DT);
    expect(Math.hypot(near.x - jewel.x, near.y - jewel.y)).toBeGreaterThan(D * 0.95);
    // One that comes down right where a medal lies makes room for itself on the table.
    const landing = machineWith([medalAt(50, 9, { level: 1 })]);
    landing.falling.push({ id: nextId++, x: 50.5, y: 9, level: 1, fromX: 50, fromY: 1, rank: 0, ball: false, remaining: 0.01, duration: 0.4, source: 'payout', jewel: true });
    step(landing, DT);
    expect(landing.medals.find((medal) => medal.jewel)?.tier).toBe(0);
    // And it is pushed like a medal: the pusher's face takes it forward with the rest.
    const pushed = machineWith([medalAt(50, PUSHER.max + MEDAL_RADIUS - 2, { jewel: true })]);
    step(pushed, DT);
    expect(pushed.medals[0].y).toBeGreaterThanOrEqual(pusherFront(pushed.time) + MEDAL_RADIUS - 1e-9);
  });
});
