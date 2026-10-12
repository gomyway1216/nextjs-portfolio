import { describe, expect, it } from 'vitest';

import {
  ARMS,
  HATCH,
  PAYOUT_SLOT,
  SLOT,
  airSpot,
  armCollar,
  armGoal,
  armRest,
  armTip,
  fedSpot,
  leftHeld,
  legOf,
  letGo,
  railFrame,
  railHeading,
  railLength,
  rolled,
  rollingSpot,
  swing,
  type Spot,
} from '@/components/game/MedalPusher/arms';
import * as engine from '@/components/game/MedalPusher/engine';
import {
  AIM,
  ARM_REACH,
  ARM_REST,
  ARM_SPEED,
  CHECKERS,
  FALL_TIME,
  FEED,
  FIELD,
  LANDING,
  MEDAL_RADIUS,
  PUSHER,
  ROLL_TIME,
  TOWER,
  aimArms,
  createMachine,
  dropMedal,
  step,
  tipOf,
  type Arm,
  type FallingMedal,
} from '@/components/game/MedalPusher/engine';
import { HEIGHT, HOUSING, SCREEN, VIEW, project, wallBehind } from '@/components/game/MedalPusher/view';

const DT = 1 / 60;
const BOTH: Arm[] = [0, 1];
const dot = (a: Spot, b: Spot): number => a.x * b.x + a.height * b.height + a.depth * b.depth;
/** The way the face of a medal looks when it is held at these angles, as `attitude` in mat4.ts has it. */
const facing = (tilt: number, heading: number): Spot => ({ x: -Math.sin(heading) * Math.sin(tilt), height: Math.cos(tilt), depth: Math.cos(heading) * Math.sin(tilt) });

describe('where the arms hang', () => {
  it('hangs one at each front corner of the cabinet, mirror images of each other', () => {
    const [left, right] = [armCollar(0), armCollar(1)];
    expect(left).toEqual({ x: ARMS.collar.inset, height: ARMS.collar.height, depth: ARMS.collar.depth });
    expect(right.x).toBe(FIELD.width - ARMS.collar.inset);
    expect(left.height).toBe(right.height);
    expect(left.depth).toBe(right.depth);
    for (const arm of BOTH) {
      const collar = armCollar(arm);
      // By the player's hands: nearer than the front edge of the table, close to its own side, higher than its tip.
      expect(collar.depth).toBeGreaterThan(FIELD.depth);
      expect(Math.min(collar.x, FIELD.width - collar.x)).toBeLessThan(FIELD.width / 6);
      expect(collar.height).toBeGreaterThan(ARMS.tip);
      // The whole ring of the slot is inside the picture, and large in it: a tenth of its width across or more.
      const mouth = project(collar.x, collar.height, collar.depth);
      const ring = SLOT.ring * mouth.scale;
      expect(mouth.x - ring).toBeGreaterThan(0);
      expect(mouth.x + ring).toBeLessThan(VIEW.width);
      expect(ring * 2).toBeGreaterThan(VIEW.width / 10);
      // And it hides nothing that leaves the table: it is over the end of the side wall, above where the side opens.
      expect(mouth.y + ring).toBeLessThan(project(arm === 0 ? 0 : FIELD.width, 0, FIELD.sideOpenFrom).y);
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
    // The engine lets a medal go where the arm's tip is across the field: the machine's own tip, which is what gets drawn.
    const machine = createMachine(4);
    machine.rng = () => 0.5;
    dropMedal(machine, 33);
    step(machine, ROLL_TIME);
    const [medal] = machine.falling;
    expect(machine.tips[0]).toBe(33);
    expect(medal.fromX).toBe(33);
    expect(letGo(medal)).toEqual(armTip(0, machine.tips[0]));
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

  it('is one straight rail from the slot to the tip, away from the player and gently downhill', () => {
    for (const arm of BOTH) {
      for (const aim of [ARM_REACH[arm].min, armRest(arm), ARM_REACH[arm].max]) {
        const collar = armCollar(arm);
        const tip = armTip(arm, aim);
        const length = railLength(arm, aim);
        expect(length).toBeCloseTo(Math.hypot(tip.x - collar.x, tip.height - collar.height, tip.depth - collar.depth), 9);
        // Most of the length of the field, and all of it away from the player.
        expect(length).toBeGreaterThan(FIELD.depth * 0.85);
        expect(tip.depth).toBeLessThan(collar.depth);
        // Downhill, by a slope a medal would roll down and the eye would still call level: between 4 and 12 degrees.
        const slope = (Math.asin((collar.height - tip.height) / length) * 180) / Math.PI;
        expect(slope).toBeGreaterThan(4);
        expect(slope).toBeLessThan(12);
      }
    }
  });

  it('keeps the tips over the pusher, above the tallest tower and short of where medals land', () => {
    expect(ARMS.depth).toBeLessThan(PUSHER.min);
    expect(ARMS.depth).toBeGreaterThan(LANDING.to);
    // A medal at a tip clears a tower of the most medals a tower can have.
    expect(ARMS.tip - MEDAL_RADIUS).toBeGreaterThan(HEIGHT.pusher + TOWER.max * HEIGHT.medal);
  });

  it('is never in front of the screen or the lamps under it, rail or medal, wherever it points', () => {
    for (const arm of BOTH) {
      for (const aim of [ARM_REACH[arm].min, armRest(arm), FIELD.width / 2, ARM_REACH[arm].max]) {
        for (let remaining = FEED.arm; remaining >= 0; remaining -= FEED.arm / 40) {
          const spot = rollingSpot(arm, aim, remaining);
          // The highest point of a medal there, and the point of the back wall the camera sees it against.
          const behind = wallBehind(spot.x, spot.height + MEDAL_RADIUS, spot.depth);
          expect(behind.height).toBeLessThan(HOUSING.shelf);
        }
      }
    }
    expect(HOUSING.shelf).toBeLessThan(SCREEN.foot);
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

  it('fits the picture: a medal anywhere on its way in is inside the drawing, from the slot to the tip', () => {
    for (const arm of BOTH) {
      for (const aim of [AIM.min, 30, 50, 70, AIM.max]) {
        for (let remaining = ROLL_TIME; remaining >= 0; remaining -= ROLL_TIME / 30) {
          const spot = fedSpot(arm, aim, remaining);
          const point = project(spot.x, spot.height, spot.depth);
          const reach = MEDAL_RADIUS * point.scale;
          expect(point.x - reach).toBeGreaterThanOrEqual(0);
          expect(point.x + reach).toBeLessThanOrEqual(VIEW.width);
          expect(point.y - reach).toBeGreaterThanOrEqual(0);
          expect(point.y + reach).toBeLessThanOrEqual(VIEW.height);
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
    // From rest to the far side of the field in well under the time a medal takes to get to the tip.
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
  it('goes from the collar to the tip in the time it is on the rail, a little faster as it goes', () => {
    expect(rolled(FEED.arm)).toBe(0);
    expect(rolled(0)).toBe(1);
    expect(rolled(FEED.arm * 2)).toBe(0);
    expect(rolled(-1)).toBe(1);
    let last = 0;
    let lastGain = 0;
    let firstGain = 0;
    for (let remaining = FEED.arm - DT; remaining >= -1e-9; remaining -= DT) {
      const share = rolled(Math.max(0, remaining));
      expect(share).toBeGreaterThan(last);
      // Each step takes it further than the one before.
      expect(share - last).toBeGreaterThan(lastGain - 1e-12);
      if (firstGain === 0) firstGain = share - last;
      lastGain = share - last;
      last = share;
    }
    expect(last).toBeCloseTo(1, 9);
    // It comes out of the slot already moving, and leaves the tip no more than half as fast again: it does not shoot off the end.
    expect(rolled(FEED.arm * 0.8)).toBeGreaterThan(0.12);
    expect(lastGain / firstGain).toBeLessThan(1.6);
  });

  it('is on the line from its arm’s collar to its tip, further from the player and lower all the way', () => {
    for (const arm of BOTH) {
      for (const aim of [AIM.min, 28, 50, 77, AIM.max]) {
        const collar = armCollar(arm);
        const tip = armTip(arm, aim);
        expect(rollingSpot(arm, aim, FEED.arm)).toMatchObject(collar);
        expect(rollingSpot(arm, aim, 0)).toMatchObject({ x: expect.closeTo(tip.x, 9), height: expect.closeTo(tip.height, 9), depth: expect.closeTo(tip.depth, 9) });
        let last = rollingSpot(arm, aim, FEED.arm);
        for (const remaining of [0.6, 0.4, 0.25, 0.1]) {
          const spot = rollingSpot(arm, aim, remaining);
          const share = rolled(remaining);
          expect(spot.x).toBeCloseTo(collar.x + (tip.x - collar.x) * share, 9);
          expect(spot.height).toBeCloseTo(collar.height + (tip.height - collar.height) * share, 9);
          expect(spot.depth).toBeCloseTo(collar.depth + (tip.depth - collar.depth) * share, 9);
          expect(spot.height).toBeLessThan(last.height);
          expect(spot.depth).toBeLessThan(last.depth);
          last = spot;
        }
      }
    }
  });

  it('turns as far as it has rolled, and the right arm is the left one in a mirror', () => {
    for (const aim of [20, 50]) {
      const length = railLength(0, aim);
      expect(rollingSpot(0, aim, FEED.arm).turned).toBe(0);
      // A wheel that does not slip turns through its path over its radius.
      expect(rollingSpot(0, aim, 0).turned).toBeCloseTo(length / MEDAL_RADIUS, 9);
      expect(rollingSpot(0, aim, 0.2).turned).toBeCloseTo((rolled(0.2) * length) / MEDAL_RADIUS, 9);
    }
    // Several whole turns on the way, so it is seen to roll.
    expect(rollingSpot(0, 50, 0).turned).toBeGreaterThan(4 * Math.PI);
    for (const [aim, remaining] of [
      [30, 0.4],
      [50, 0.2],
      [58, 0],
    ]) {
      const left = rollingSpot(0, aim, remaining);
      const right = rollingSpot(1, FIELD.width - aim, remaining);
      expect(right.x).toBeCloseTo(FIELD.width - left.x, 9);
      expect(right.height).toBeCloseTo(left.height, 9);
      expect(right.depth).toBeCloseTo(left.depth, 9);
      expect(right.turned).toBeCloseTo(left.turned, 9);
      expect(railHeading(1, FIELD.width - aim)).toBeCloseTo(-railHeading(0, aim), 9);
    }
  });

  it('rides with its arm when the arm swings', () => {
    // The same share of the way along, wherever the tip is.
    const near = rollingSpot(0, 20, 0.2);
    const far = rollingSpot(0, 55, 0.2);
    const share = rolled(0.2);
    expect((near.x - armCollar(0).x) / (20 - armCollar(0).x)).toBeCloseTo(share, 9);
    expect((far.x - armCollar(0).x) / (55 - armCollar(0).x)).toBeCloseTo(share, 9);
    expect(far.height).toBeCloseTo(near.height, 9);
    expect(far.depth).toBeCloseTo(near.depth, 9);
  });

  it('rolls in a channel: an edge to stand on, a wall to lean back on, its face turned up toward the middle', () => {
    for (const arm of BOTH) {
      for (const aim of [ARM_REACH[arm].min, armRest(arm), ARM_REACH[arm].max]) {
        const frame = railFrame(arm, aim);
        expect(frame.from).toEqual(armCollar(arm));
        expect(frame.to).toEqual(armTip(arm, aim));
        expect(frame.length).toBe(railLength(arm, aim));
        // Three directions of length one. The face and the foot are square to each other; the rail is square to
        // the face, and nearly so to the foot, which is plumb in the medal while the rail slopes a little.
        for (const way of [frame.along, frame.face, frame.foot]) expect(Math.hypot(way.x, way.height, way.depth)).toBeCloseTo(1, 9);
        expect(dot(frame.face, frame.foot)).toBeCloseTo(0, 9);
        expect(Math.abs(dot(frame.along, frame.face))).toBeLessThan(0.12);
        expect(Math.abs(dot(frame.along, frame.foot))).toBeLessThan(0.2);
        // The foot is the low side, and the face looks up and in toward the middle of the cabinet.
        expect(frame.foot.height).toBeCloseTo(-Math.cos(ARMS.lean), 9);
        expect(frame.face.height).toBeCloseTo(Math.sin(ARMS.lean), 9);
        expect(frame.face.x * (arm === 0 ? 1 : -1)).toBeGreaterThan(0.6);
        // It is the way a medal rolling there is held.
        const held = fedSpot(arm, aim, FEED.arm / 2);
        const face = facing(held.tilt, held.heading);
        expect(face.x).toBeCloseTo(frame.face.x, 9);
        expect(face.height).toBeCloseTo(frame.face.height, 9);
        expect(face.depth).toBeCloseTo(frame.face.depth, 9);
      }
    }
    // Leaning back, but still on its edge: nearer upright than flat.
    expect(ARMS.lean).toBeGreaterThan(0.3);
    expect(ARMS.lean).toBeLessThan(Math.PI / 4);
  });
});

describe('the way in: a slot, then the rail', () => {
  it('takes most of a second in two legs, the second of them longer than the whole way used to be', () => {
    expect(FEED.slot + FEED.arm).toBeCloseTo(ROLL_TIME, 12);
    // Long enough to see the medal go in and roll the length of the cabinet, short enough that a press is answered.
    expect(ROLL_TIME).toBeGreaterThanOrEqual(0.8);
    expect(ROLL_TIME).toBeLessThanOrEqual(0.9);
    expect(FEED.slot).toBeGreaterThanOrEqual(0.1);
    expect(FEED.slot).toBeLessThanOrEqual(0.2);
    // The whole way was half a second when the arms were short. A medal saved then with any of that left is on its rail now.
    expect(FEED.arm).toBeGreaterThanOrEqual(0.5);
    expect(legOf(0.5)).toBe('arm');
    // Each leg is a whole number of the machine's steps, so a medal changes leg on a step and not between two.
    for (const leg of [FEED.slot, FEED.arm]) expect(leg / DT).toBeCloseTo(Math.round(leg / DT), 9);
    expect(legOf(ROLL_TIME)).toBe('slot');
    expect(legOf(ROLL_TIME - FEED.slot / 2)).toBe('slot');
    expect(legOf(FEED.arm)).toBe('arm');
    expect(legOf(0)).toBe('arm');
    // What the machine keeps is one number per medal, as before: the legs are only where it is drawn.
    const machine = createMachine(3);
    dropMedal(machine, 30);
    expect(machine.rolling).toEqual([{ id: expect.any(Number), arm: 0, remaining: ROLL_TIME }]);
  });

  it('shows a medal to its slot face on, turns it edge on and takes it in, with no jump where the rail begins', () => {
    // The mouth takes a medal: the ring round it is wider than one.
    expect(SLOT.ring).toBeGreaterThan(MEDAL_RADIUS);
    for (const arm of BOTH) {
      for (const tip of [AIM.min, 40, 60, AIM.max]) {
        const collar = armCollar(arm);
        const along = railHeading(arm, tipOf(arm, tip));
        // Fed: in front of the mouth, nearer the player, standing on its edge with its face to the player.
        const fed = fedSpot(arm, tip, ROLL_TIME);
        expect(fed).toMatchObject({ leg: 'slot', x: collar.x, height: collar.height, depth: collar.depth + SLOT.out });
        expect(fed.tilt).toBeCloseTo(Math.PI / 2, 12);
        expect(facing(fed.tilt, fed.heading)).toMatchObject({ x: expect.closeTo(0, 9), height: expect.closeTo(0, 9), depth: expect.closeTo(1, 9) });
        // Taken in: at the collar, still on its edge, turned to stand along the rail. And there the rail has it.
        const taken = fedSpot(arm, tip, FEED.arm + 1e-12);
        const start = fedSpot(arm, tip, FEED.arm);
        expect(taken.leg).toBe('slot');
        expect(start.leg).toBe('arm');
        expect(taken.depth).toBeCloseTo(collar.depth, 6);
        expect(taken.heading).toBeCloseTo(along, 6);
        expect(start).toMatchObject({ x: collar.x, height: collar.height, depth: collar.depth, heading: along });
        expect(start.tilt).toBeCloseTo(taken.tilt, 9);
        expect(start.turn).toBeCloseTo(taken.turn, 9);
        // Edge on to the player by then: what the player sees of its face is a sliver.
        expect(Math.abs(facing(taken.tilt, taken.heading).depth)).toBeLessThan(0.5);
        // Nearer the mouth at every step of the way in.
        let last = fed.depth;
        for (let remaining = ROLL_TIME - DT; remaining > FEED.arm; remaining -= DT) {
          const depth = fedSpot(arm, tip, remaining).depth;
          expect(depth).toBeLessThan(last);
          last = depth;
        }
      }
    }
  });

  it('leans a medal back as it comes out onto the rail, and brings it to the tip turned the way it will lie', () => {
    for (const arm of BOTH) {
      for (const tip of [AIM.min, 40, 60, AIM.max]) {
        // On the rail it is where `rollingSpot` has it, turned by what it still has to roll.
        const whole = rollingSpot(arm, tip, 0).turned;
        for (const remaining of [FEED.arm, 0.6, 0.3, 0.1, 0]) {
          const held = fedSpot(arm, tip, remaining);
          const spot = rollingSpot(arm, tip, remaining);
          expect(held).toMatchObject({ leg: 'arm', x: spot.x, height: spot.height, depth: spot.depth });
          expect(held.turn).toBeCloseTo(whole - spot.turned, 9);
          expect(held.heading).toBe(railHeading(arm, tipOf(arm, tip)));
        }
        expect(fedSpot(arm, tip, 0).turn).toBe(0);
        // Upright at the collar, leaning all the way back within the first tenth of the rail, and so to the tip.
        expect(fedSpot(arm, tip, FEED.arm).tilt).toBeCloseTo(Math.PI / 2, 12);
        let last = Math.PI / 2;
        for (let remaining = FEED.arm; remaining >= 0; remaining -= DT) {
          const held = fedSpot(arm, tip, Math.max(0, remaining));
          expect(held.tilt).toBeLessThanOrEqual(last + 1e-12);
          if (rolled(Math.max(0, remaining)) >= 0.1) expect(held.tilt).toBeCloseTo(Math.PI / 2 - ARMS.lean, 12);
          last = held.tilt;
        }
      }
    }
  });
});

describe('what is in the air', () => {
  const falling = (source: FallingMedal['source'], more: Partial<FallingMedal> = {}): FallingMedal => ({ id: 1, x: 40, y: 9, level: 1, fromX: 36, fromY: 1.2, rank: 0, ball: false, remaining: FALL_TIME, duration: FALL_TIME, source, ...more });

  it('was let go at an arm’s tip if the player fed it, out of the slot under the hood if the machine paid it, and out of the hatch if it is a ball', () => {
    expect(letGo(falling('player'))).toEqual({ x: 36, height: ARMS.tip, depth: ARMS.depth });
    // A medal the machine pays: straight over where the machine has it, inside the hood, where the hood hides it.
    const paid = letGo(falling('payout'));
    expect(paid).toEqual({ x: 36, height: PAYOUT_SLOT.height, depth: PAYOUT_SLOT.depth });
    // Its lowest point is above the line of sight under the hood's lip, which runs from the lip back to the wall.
    const seenFrom = wallBehind(paid.x, HOUSING.hood, HOUSING.out).height;
    expect(paid.height - MEDAL_RADIUS).toBeGreaterThan(seenFrom + ((HOUSING.hood - seenFrom) * paid.depth) / HOUSING.out);
    expect(paid.height + MEDAL_RADIUS).toBeLessThan(HEIGHT.top);
    // It stands on its edge there, across the cabinet, with the wall behind it and the hood's face in front.
    expect(paid.depth).toBeGreaterThan(MEDAL_RADIUS / 2);
    expect(paid.depth + MEDAL_RADIUS / 2).toBeLessThan(HOUSING.out);
    // A ball: in the hatch, wherever the machine means it to land, its middle just behind the door.
    const ball = letGo(falling('payout', { ball: true, fromX: 71 }));
    expect(ball).toEqual({ x: HATCH.x, height: HATCH.height, depth: HATCH.depth - 1 });
    // The hatch is a round door in the middle of the hood's face, all of it on the face.
    expect(HATCH.x).toBe(FIELD.width / 2);
    expect(HATCH.depth).toBe(HOUSING.out);
    expect(HATCH.height - HATCH.radius).toBeGreaterThan(HOUSING.hood);
    expect(HATCH.height + HATCH.radius).toBeLessThan(HEIGHT.top);
  });

  it('comes down from where it was let go to where it lands, faster and faster, and never back up', () => {
    for (const medal of [falling('player'), falling('payout'), falling('payout', { ball: true })]) {
      const rest = 7.5;
      const from = letGo(medal);
      expect(airSpot(medal, rest)).toEqual(from);
      const down = airSpot({ ...medal, remaining: 0 }, rest);
      expect(down.x).toBeCloseTo(medal.x, 9);
      expect(down.height).toBeCloseTo(rest, 9);
      expect(down.depth).toBeCloseTo(medal.y, 9);
      let last = from;
      let lastDrop = 0;
      for (let remaining = FALL_TIME - DT; remaining >= -1e-9; remaining -= DT) {
        const at = airSpot({ ...medal, remaining: Math.max(0, remaining) }, rest);
        const drop = last.height - at.height;
        expect(drop).toBeGreaterThan(lastDrop - 1e-9);
        // Out from the wall, or back toward it, one way all the time: most of it early on.
        expect(Math.sign(at.depth - last.depth)).toBe(Math.sign(medal.y - from.depth));
        lastDrop = drop;
        last = at;
      }
    }
    // A time outside the fall is taken as its nearer end.
    expect(airSpot(falling('player', { remaining: FALL_TIME * 2 }), 7.5)).toEqual(letGo(falling('player')));
    expect(airSpot(falling('player', { remaining: -1 }), 7.5).height).toBeCloseTo(7.5, 9);
  });

  it('leaves an arm held as it rolled, on the arm it is said to have left, or else the arm of the side it left from', () => {
    for (const arm of BOTH) {
      const from = arm === 0 ? 30 : 70;
      const medal = falling('player', { fromX: from });
      const atTip = fedSpot(arm, from, 0);
      expect(leftHeld(medal)).toEqual({ tilt: atTip.tilt, heading: atTip.heading });
      expect(leftHeld(medal, arm)).toEqual(leftHeld(medal));
    }
    // An arm can let a medal go past the middle. Told which arm it was, the medal leaves as that arm held it.
    const past = falling('player', { fromX: 58 });
    expect(leftHeld(past, 0).heading).toBe(railHeading(0, 58));
    expect(leftHeld(past).heading).toBe(railHeading(1, 58));
    expect(leftHeld(past, 0).heading).not.toBeCloseTo(leftHeld(past).heading, 1);
  });
});
