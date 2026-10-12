import { describe, expect, it } from 'vitest';

import { ARMS, armCollar, armGoal, armRest, armTip, letGoAt, rolled, rollingSpot, swing } from '@/components/game/MedalPusher/arms';
import * as engine from '@/components/game/MedalPusher/engine';
import {
  AIM,
  ARM_REACH,
  ARM_REST,
  ARM_SPEED,
  CHECKERS,
  FIELD,
  MEDAL_RADIUS,
  RELEASE,
  ROLL_TIME,
  aimArms,
  createMachine,
  dropMedal,
  step,
  tipOf,
  type Arm,
  type FallingMedal,
} from '@/components/game/MedalPusher/engine';
import { HEIGHT, VIEW, project, rise } from '@/components/game/MedalPusher/view';

const DT = 1 / 60;
const BOTH: Arm[] = [0, 1];

describe('where the arms hang', () => {
  it('hangs one in each upper corner of the back panel, mirror images of each other', () => {
    const [left, right] = [armCollar(0), armCollar(1)];
    expect(left.x).toBe(ARMS.collar.inset);
    expect(right.x).toBe(FIELD.width - ARMS.collar.inset);
    expect(left.height).toBe(right.height);
    expect(left.depth).toBe(right.depth);
    // Near its own side wall, above every place its tip can be, below the top of the panel.
    for (const arm of BOTH) {
      const collar = armCollar(arm);
      expect(Math.min(collar.x, FIELD.width - collar.x)).toBeLessThan(AIM.min);
      expect(collar.height).toBeGreaterThan(ARMS.tip + MEDAL_RADIUS * 2);
      expect(collar.height).toBeLessThan(HEIGHT.wall);
    }
  });

  it('puts a tip over the aim, where a medal is let go', () => {
    for (const arm of BOTH) {
      for (const aim of [AIM.min, 20, 45, 50, 55, 80, AIM.max]) {
        const tip = armTip(arm, aim);
        expect(tip).toEqual({ x: tipOf(arm, aim), height: ARMS.tip, depth: ARMS.depth });
        expect(tip.x).toBeGreaterThanOrEqual(ARM_REACH[arm].min);
        expect(tip.x).toBeLessThanOrEqual(ARM_REACH[arm].max);
      }
    }
    // The engine lets a medal go at the very place the arm's tip is: the machine's own tip, which is what gets drawn.
    const machine = createMachine(4);
    machine.rng = () => 0.5;
    dropMedal(machine, 33);
    step(machine, ROLL_TIME);
    const [medal] = machine.falling;
    expect(machine.tips[0]).toBe(33);
    expect({ x: medal.fromX, depth: medal.fromY }).toEqual({ x: armTip(0, machine.tips[0]).x, depth: armTip(0, machine.tips[0]).depth });
    expect(ARMS.depth).toBe(RELEASE.depth);
  });

  it('leaves the moving of the arms to the engine, and hands its rules on unchanged', () => {
    // How far short of the middle an arm rests and how fast a tip swings are the machine's own numbers.
    expect(ARMS.rest).toBe(ARM_REST);
    expect(ARMS.speed).toBe(ARM_SPEED);
    expect(armGoal).toBe(engine.armGoal);
    expect(armRest).toBe(engine.armRest);
    expect(swing).toBe(engine.swing);
    // A place the arm cannot reach is taken as the end of its reach, so a tip can be handed over as it is.
    expect(armTip(0, 90).x).toBe(ARM_REACH[0].max);
    expect(armTip(1, 5).x).toBe(ARM_REACH[1].min);
    const machine = createMachine(4);
    for (const arm of BOTH) expect(armTip(arm, machine.tips[arm]).x).toBe(machine.tips[arm]);
  });

  it('has a rail long enough to reach from the collar to the tip wherever the tip is', () => {
    for (const arm of BOTH) {
      const collar = armCollar(arm);
      for (const aim of [ARM_REACH[arm].min, ARM_REACH[arm].max]) {
        const tip = armTip(arm, aim);
        expect(Math.hypot(tip.x - collar.x, tip.height - collar.height)).toBeLessThan(ARMS.length);
      }
    }
  });

  it('keeps the tips over the back of the pusher, clear of the gates and their signs', () => {
    // Above the pusher and well below the collar, so the rail slopes down all the way to it.
    expect(ARMS.tip).toBeGreaterThan(HEIGHT.pusher + MEDAL_RADIUS * 4);
    expect(ARMS.tip).toBeLessThan(RELEASE.height);
    // A medal that leaves the tip goes down in front of the gates, never through the sign over one.
    const tip = project(FIELD.width / 2, ARMS.tip - MEDAL_RADIUS, ARMS.depth);
    const sign = project(FIELD.width / 2, HEIGHT.pusher + 11 + 2.4 + 2, 0);
    expect(tip.y).toBeLessThan(sign.y);
  });

  it('rests an arm with its tip short of the middle, inside its own reach and out of the other arm’s way', () => {
    expect(armRest(0)).toBe(FIELD.width / 2 - ARMS.rest);
    expect(armRest(1)).toBe(FIELD.width / 2 + ARMS.rest);
    for (const arm of BOTH) expect(tipOf(arm, armRest(arm))).toBe(armRest(arm));
    // A resting tip is well clear of the column behind the middle chucker, where the other arm is likeliest to be feeding,
    // and of anywhere else the other arm can be.
    expect(armRest(0)).toBeLessThan(CHECKERS.positions[1] - MEDAL_RADIUS * 4);
    expect(armRest(1)).toBeGreaterThan(CHECKERS.positions[1] + MEDAL_RADIUS * 4);
    expect(armRest(0)).toBeLessThan(ARM_REACH[1].min);
    expect(armRest(1)).toBeGreaterThan(ARM_REACH[0].max);
  });

  it('fits the picture: a medal anywhere on either rail is inside the drawing', () => {
    for (const arm of BOTH) {
      for (const aim of [AIM.min, 30, 50, 70, AIM.max]) {
        for (let remaining = ROLL_TIME; remaining >= 0; remaining -= ROLL_TIME / 20) {
          const spot = rollingSpot(arm, aim, remaining);
          const point = project(spot.x, spot.height, spot.depth);
          const across = MEDAL_RADIUS * point.scale;
          const up = MEDAL_RADIUS * rise(point);
          expect(point.x - across).toBeGreaterThanOrEqual(0);
          expect(point.x + across).toBeLessThanOrEqual(VIEW.width);
          expect(point.y - up).toBeGreaterThanOrEqual(0);
          expect(point.y + up).toBeLessThan(VIEW.height / 4);
        }
      }
    }
  });
});

describe('where an arm’s tip belongs', () => {
  it('is over the aim for the arm on that side, and at rest for the other', () => {
    const machine = createMachine(4);
    aimArms(machine, 30);
    expect([armGoal(machine, 0), armGoal(machine, 1)]).toEqual([30, armRest(1)]);
    aimArms(machine, 72);
    expect([armGoal(machine, 0), armGoal(machine, 1)]).toEqual([armRest(0), 72]);
    // A new machine's arms point at the middle, which is the right arm's side.
    expect(armGoal(createMachine(4), 1)).toBe(FIELD.width / 2);
    expect(armGoal(createMachine(4), 0)).toBe(armRest(0));
  });

  it('stays over the aim while a medal is on its rail, as far as it reaches, and goes to rest when the rail is empty', () => {
    const machine = createMachine(4);
    machine.rng = () => 0.5;
    dropMedal(machine, 30);
    step(machine, 0.1);
    // The aim crosses to the other side: the left arm, with a medal on it, follows as far as it can.
    aimArms(machine, 56);
    expect([armGoal(machine, 0), armGoal(machine, 1)]).toEqual([56, 56]);
    aimArms(machine, 80);
    expect([armGoal(machine, 0), armGoal(machine, 1)]).toEqual([ARM_REACH[0].max, 80]);
    // That is where the medal is let go.
    step(machine, ROLL_TIME);
    expect(machine.falling[0].fromX).toBe(ARM_REACH[0].max);
    expect(armGoal(machine, 0)).toBe(armRest(0));
  });

  it('swings there at its own speed and stops, and is over the middle long before a medal fed there is', () => {
    expect(swing(40, 40, DT)).toBe(40);
    expect(swing(40, 90, DT)).toBeCloseTo(40 + ARMS.speed * DT, 9);
    expect(swing(40, 10, DT)).toBeCloseTo(40 - ARMS.speed * DT, 9);
    expect(swing(40, 41, DT)).toBe(41);
    expect(swing(40, 39.5, DT)).toBe(39.5);
    expect(swing(40, 90, 0)).toBe(40);
    // From rest to the far side of the field in well under the time a medal takes to roll down.
    let tip = armRest(0);
    let steps = 0;
    while (tip !== AIM.min && steps < 100) {
      tip = swing(tip, AIM.min, DT);
      steps++;
    }
    expect(steps * DT).toBeLessThan(ROLL_TIME / 2);
    // From its rest to the column behind the middle chucker is a few steps: either arm is there before its medal has rolled a quarter of the way.
    for (const arm of BOTH) expect(Math.abs(armRest(arm) - CHECKERS.positions[1]) / ARMS.speed).toBeLessThan(ROLL_TIME / 4);
  });
});

describe('a medal on a rail', () => {
  it('goes from the collar to the tip in the time it rolls, faster and faster', () => {
    expect(rolled(ROLL_TIME)).toBe(0);
    expect(rolled(0)).toBe(1);
    expect(rolled(ROLL_TIME * 2)).toBe(0);
    expect(rolled(-1)).toBe(1);
    let last = 0;
    let lastGain = 0;
    for (let remaining = ROLL_TIME - DT; remaining >= -1e-9; remaining -= DT) {
      const share = rolled(Math.max(0, remaining));
      expect(share).toBeGreaterThan(last);
      // Each step takes it further than the one before.
      expect(share - last).toBeGreaterThan(lastGain - 1e-12);
      lastGain = share - last;
      last = share;
    }
    expect(last).toBeCloseTo(1, 9);
    // It does not start from a standstill: it is well clear of the collar a fifth of the way through.
    expect(rolled(ROLL_TIME * 0.8)).toBeGreaterThan(0.08);
  });

  it('is on the line from its arm’s collar to its tip', () => {
    for (const arm of BOTH) {
      for (const aim of [AIM.min, 28, 50, 77, AIM.max]) {
        const collar = armCollar(arm);
        const tip = armTip(arm, aim);
        expect(rollingSpot(arm, aim, ROLL_TIME)).toMatchObject(collar);
        expect(rollingSpot(arm, aim, 0)).toMatchObject(tip);
        for (const remaining of [0.4, 0.25, 0.1]) {
          const spot = rollingSpot(arm, aim, remaining);
          const share = rolled(remaining);
          expect(spot.x).toBeCloseTo(collar.x + (tip.x - collar.x) * share, 9);
          expect(spot.height).toBeCloseTo(collar.height + (tip.height - collar.height) * share, 9);
          expect(spot.depth).toBe(ARMS.depth);
          // Downhill all the way.
          expect(spot.height).toBeLessThan(collar.height);
          expect(spot.height).toBeGreaterThan(tip.height);
        }
      }
    }
  });

  it('turns as far as it has rolled: clockwise down the left arm, the other way down the right', () => {
    for (const aim of [20, 50]) {
      const collar = armCollar(0);
      const tip = armTip(0, aim);
      const length = Math.hypot(tip.x - collar.x, tip.height - collar.height);
      expect(rollingSpot(0, aim, ROLL_TIME).turned).toBe(0);
      // A wheel that does not slip turns through its path over its radius.
      expect(rollingSpot(0, aim, 0).turned).toBeCloseTo(length / MEDAL_RADIUS, 9);
      expect(rollingSpot(0, aim, 0.2).turned).toBeCloseTo((rolled(0.2) * length) / MEDAL_RADIUS, 9);
    }
    // More than a whole turn on the way to the middle, so it is seen to roll.
    expect(rollingSpot(0, 50, 0).turned).toBeGreaterThan(2 * Math.PI);
    // The right arm is the left one in a mirror.
    for (const [aim, remaining] of [[30, 0.4], [50, 0.2], [58, 0]]) {
      const left = rollingSpot(0, aim, remaining);
      const right = rollingSpot(1, FIELD.width - aim, remaining);
      expect(right.x).toBeCloseTo(FIELD.width - left.x, 9);
      expect(right.height).toBeCloseTo(left.height, 9);
      expect(right.turned).toBeCloseTo(-left.turned, 9);
    }
  });

  it('rides with its arm when the arm swings', () => {
    // The same share of the way down, wherever the tip is.
    const near = rollingSpot(0, 20, 0.2);
    const far = rollingSpot(0, 55, 0.2);
    const share = rolled(0.2);
    expect((near.x - armCollar(0).x) / (20 - armCollar(0).x)).toBeCloseTo(share, 9);
    expect((far.x - armCollar(0).x) / (55 - armCollar(0).x)).toBeCloseTo(share, 9);
    expect(far.height).toBeCloseTo(near.height, 9);
  });
});

describe('a medal in the air', () => {
  const falling = (source: FallingMedal['source']): FallingMedal => ({ id: 1, x: 50, y: 9, level: 1, fromX: 50, fromY: RELEASE.depth, rank: 0, ball: false, remaining: 0.2, duration: 0.45, source });

  it('was let go at an arm’s tip if the player fed it, and at the top of the panel if the machine paid it', () => {
    expect(letGoAt(falling('player'))).toBe(ARMS.tip);
    expect(letGoAt(falling('payout'))).toBe(RELEASE.height);
    expect(letGoAt({ ...falling('payout'), ball: true })).toBe(RELEASE.height);
  });
});
