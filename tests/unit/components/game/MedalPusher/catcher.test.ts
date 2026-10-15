import { describe, expect, it } from 'vitest';

import {
  AT_THE_HOLES,
  CATCHER,
  HOLE_MIDDLE,
  RIM_REACHED,
  SIGN,
  SIGNS,
  SLOPE,
  START_SLOT,
  lampShown,
  lampSpot,
  litSlots,
  mouthOnDrawing,
  mouthSpot,
  nearness,
  plateCorners,
  plateWay,
  ridingAt,
  rolledDown,
  signSpan,
  signSpot,
  slidDown,
  slopeSpot,
  slotCorners,
  slotHalf,
  spilled,
  underCatcher,
  wingCorners,
  type Caught,
} from '@/components/game/MedalPusher/catcher';
import { CHUCKERS, chuckerSpot } from '@/components/game/MedalPusher/chuckers';
import {
  BALL_RADIUS,
  CHECKERS,
  FIELD,
  LUCKY,
  MEDAL_RADIUS,
  MEDAL_SLIDE,
  MEDAL_THICKNESS,
  PLATE,
  PRIZE_CLEAR,
  PRIZE_LANDS,
  PUSHER,
  ROLL_DOWN,
  START_RIDE,
  TEETER,
  TOWER,
  clearOfFoot,
  createMachine,
  luckySlot,
  pusherFront,
  step,
  underPlate,
  type FallingMedal,
  type Machine,
  type Medal,
} from '@/components/game/MedalPusher/engine';
import { JEWEL_CUT, JEWEL_FACETS, pointInCabinet, slidJewel } from '@/components/game/MedalPusher/jewel';
import { SIGN_CAP } from '@/components/game/MedalPusher/render';
import { HEIGHT, VIEW, project } from '@/components/game/MedalPusher/view';

import { dropAt } from './feeding';

const P = HEIGHT.pusher;
const T = MEDAL_THICKNESS;
const R = MEDAL_RADIUS;
const DT = 1 / 60;
const ALL = [0, 1, 2];
/** Moments all through the pusher's stroke: out, back, and on the way. */
const TIMES = [0, 0.75, 1.5, PUSHER.period / 2, 2.2, 4.5, 5.3];
/** How many pixels of a phone's screen a pixel of the drawing is, when the stage is as wide as it is on a 375-pixel page. */
const PHONE = 345 / VIEW.width;
const SIN = Math.sin(SLOPE.angle);
const COS = Math.cos(SLOPE.angle);

/** A medal lying on the pusher just past its lip at `x`, so that the next step takes it over. */
const atTheLip = (machine: Machine, x: number, more: Partial<Medal> = {}): Medal => ({ id: machine.nextId++, x, y: pusherFront(machine.time) + 0.5, level: 1, tier: 0, sinceDrop: -1, stack: 1, ball: false, grown: 1, ...more });
/** A machine with nothing on it, at `time`. */
const emptyAt = (time: number): Machine => {
  const machine = createMachine(3);
  machine.medals = [];
  machine.time = time;
  return machine;
};
/** What the machine makes of a medal (or a ball, a jewel, a tower) that goes over the lip at `x` at `time`: what it settled for it. */
function overAt(x: number, time = 1.1, wings = false, more: Partial<Medal> = {}): { machine: Machine; events: ReturnType<typeof step> } {
  const machine = emptyAt(time);
  machine.medals = [atTheLip(machine, x, more)];
  const events = step(machine, DT, wings);
  return { machine, events };
}
/** The same medal in the air, `elapsed` seconds into its way down, as the machine would have it then. */
const later = (medal: FallingMedal, elapsed: number): FallingMedal => ({ ...medal, remaining: Math.max(0, medal.duration - elapsed) });
/** The moment a medal in the air is at when it has `elapsed` seconds behind it. */
const timeOf = (medal: FallingMedal, now: number, elapsed: number): number => now + elapsed - (medal.duration - medal.remaining);

/** Whether a point of the cabinet at `time` is inside the pusher, the START plate or the lower table, and how deep, with a ten-thousandth to spare. */
function inside(x: number, height: number, depth: number, time: number, wings: boolean): number {
  const out = depth - pusherFront(time);
  if (height < -1e-4) return -height;
  if (out < -1e-4 && height < P - 1e-4) return Math.min(-out, P - height);
  const down = out * COS - (height - PLATE.deck) * SIN;
  const up = out * SIN + (height - PLATE.deck) * COS;
  if (up < -1e-4 && up > -PLATE.thick + 1e-4 && down > 1e-4 && out < PLATE.reach - 1e-4) {
    const inHole = CHECKERS.positions.some((at) => Math.abs(x - at) < slotHalf(wings) && down > CATCHER.back && down < CATCHER.back + START_SLOT.long);
    if (!inHole) return Math.min(-up, PLATE.thick + up, down, PLATE.reach - out);
  }
  return 0;
}
/** Points all over a medal held as `held` says: both faces, from the middle out to the rim. Its face looks the way the renderers turn it. */
function pointsOf(held: Pick<Caught, 'x' | 'height' | 'depth' | 'tilt' | 'heading'>): [number, number, number][] {
  const n = [-Math.sin(held.heading) * Math.sin(held.tilt), Math.cos(held.tilt), Math.cos(held.heading) * Math.sin(held.tilt)];
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  const along = a[0] * n[0] + a[1] * n[1] + a[2] * n[2];
  const u0 = [a[0] - along * n[0], a[1] - along * n[1], a[2] - along * n[2]];
  const length = Math.hypot(u0[0], u0[1], u0[2]);
  const u = u0.map((c) => c / length);
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const points: [number, number, number][] = [];
  for (const side of [-0.5, 0.5]) {
    for (const ring of [0, 0.5, 0.85, 1]) {
      for (let i = 0; i < 24; i++) {
        const c = Math.cos((i / 24) * Math.PI * 2) * ring * R;
        const s = Math.sin((i / 24) * Math.PI * 2) * ring * R;
        points.push([held.x + n[0] * side * T + u[0] * c + v[0] * s, held.height + n[1] * side * T + u[1] * c + v[1] * s, held.depth + n[2] * side * T + u[2] * c + v[2] * s]);
      }
    }
  }
  return points;
}
/** How deep the deepest point of a medal held so is inside something solid: nothing, for a medal clear of everything. */
const deepest = (held: Pick<Caught, 'x' | 'height' | 'depth' | 'tilt' | 'heading'>, time: number, wings = false): number => Math.max(0, ...pointsOf(held).map(([x, h, d]) => inside(x, h, d, time, wings)));

describe('the START plate', () => {
  it('hangs on the front of the pusher from just under its lip, and leans down toward the player at 35 degrees to a foot clear of the lower table', () => {
    // From just under the edge of the pusher's top, so a medal that comes over the lip is above it.
    expect(CATCHER.deck).toBeLessThan(P);
    expect(CATCHER.deck).toBeGreaterThan(P - 1);
    // Down to a foot that two medals deep, and one more on its way down on to them, pass under: what is under its
    // plumb end, too, which is the board's thickness deep.
    const end = PLATE.thick / Math.cos(PLATE.lean);
    expect(CATCHER.foot.height - end).toBeGreaterThan(T * 2.5);
    expect(SLOPE.angle).toBeCloseTo((35 * Math.PI) / 180, 12);
    // Its top is one plane from the lip to the foot, that long and reaching that far out.
    expect(SLOPE.long * SIN).toBeCloseTo(CATCHER.deck - CATCHER.foot.height, 12);
    expect(SLOPE.long * COS).toBeCloseTo(CATCHER.foot.out, 12);
    for (const time of TIMES) {
      const [lipLeft, lipRight, footRight, footLeft] = plateCorners(time);
      expect([lipLeft.x, lipRight.x, footRight.x, footLeft.x]).toEqual([0, FIELD.width, FIELD.width, 0]);
      expect(lipLeft.height).toBeCloseTo(CATCHER.deck, 12);
      expect(lipLeft.depth).toBeCloseTo(pusherFront(time), 12);
      expect(footLeft.height).toBeCloseTo(CATCHER.foot.height, 12);
      expect(footLeft.depth).toBeCloseTo(pusherFront(time) + CATCHER.foot.out, 12);
      // And the plane is where `slopeSpot` has it, square to it as well.
      const spot = slopeSpot(30, 2, time, 1);
      expect(spot.height).toBeCloseTo(CATCHER.deck - 2 * SIN + COS, 12);
      expect(spot.depth).toBeCloseTo(pusherFront(time) + 2 * COS + SIN, 12);
    }
  });

  it('has a hole for each pocket, a medal long and a medal wide with the play the rule allows, all in the plate and clear of one another', () => {
    expect(CHUCKERS.count).toBe(3);
    // Longer than a medal is across, so one lying along the plate drops through.
    expect(START_SLOT.long).toBeGreaterThan(2 * R);
    expect(START_SLOT.long).toBeLessThan(2 * R + 1);
    // As wide as a medal, and as much again to either side as the lip's rule lets a medal's middle be off the hole's.
    expect(slotHalf()).toBe(R + CHECKERS.halfWidth);
    expect(slotHalf(true)).toBe(R + CHECKERS.wingWidth);
    expect(CHUCKERS.radius).toBe(slotHalf());
    // Its frame and the lamp under it are on the plate, with the frame's lower bar between the opening and the foot.
    expect(CATCHER.back - CATCHER.rim.wide).toBeGreaterThan(0);
    expect(CATCHER.back + START_SLOT.long + START_SLOT.lamp.out + START_SLOT.lamp.radius).toBeLessThan(SLOPE.long);
    expect(CATCHER.back + START_SLOT.long + CATCHER.rim.wide).toBeLessThan(SLOPE.long);
    for (const time of TIMES) {
      ALL.forEach((hole) => {
        // Below its pocket's mouth on the lip, the middle of the opening half way down it.
        const mouth = mouthSpot(hole, time);
        expect(mouth.x).toBe(chuckerSpot(hole, time).x);
        expect(mouth).toEqual(slopeSpot(CHECKERS.positions[hole], HOLE_MIDDLE, time));
        expect(HOLE_MIDDLE).toBe(CATCHER.back + START_SLOT.long / 2);
        const [a, b, c, d] = slotCorners(hole, time);
        expect(b.x - a.x).toBeCloseTo(2 * slotHalf(), 12);
        expect(c.x - d.x).toBeCloseTo(2 * slotHalf(), 12);
        expect(Math.hypot(d.height - a.height, d.depth - a.depth)).toBeCloseTo(START_SLOT.long, 12);
        // The lamp is on the plate in the middle of the lower bar.
        const lamp = lampSpot(hole, time);
        expect(lamp.x).toBe(CHECKERS.positions[hole]);
        expect(lamp).toEqual(slopeSpot(CHECKERS.positions[hole], CATCHER.back + START_SLOT.long + START_SLOT.lamp.out, time));
      });
    }
    // The frames, as wide as the openings are with the flaps open, do not run into each other, and leave room for the signs.
    const frame = slotHalf(true) + CATCHER.rim.wide;
    expect(CHECKERS.positions[1] - CHECKERS.positions[0] - 2 * frame).toBeGreaterThan(1);
    expect(CHECKERS.positions[0] - frame).toBeGreaterThan(FIELD.width / 4);
    expect(CHECKERS.positions[2] + frame).toBeLessThan((FIELD.width * 3) / 4);
  });

  it('has a flap along either side of each opening: shut, flush in the plate; open, during chance time, swung down to hang square under it, which leaves the opening wider', () => {
    for (const time of [0, 1.7]) {
      ALL.forEach((hole) => {
        const x = CHECKERS.positions[hole];
        for (const side of [-1, 1]) {
          // Shut, it lies in the plane of the plate, from the narrower opening's edge out to the wider one's, the length of the opening.
          const shut = wingCorners(hole, side, time, false);
          for (const corner of shut) {
            const out = corner.depth - pusherFront(time);
            expect(out * SIN + (corner.height - CATCHER.deck) * COS).toBeCloseTo(0, 9);
          }
          expect(Math.abs(shut[0].x - x)).toBeCloseTo(slotHalf(true), 12);
          expect(Math.abs(shut[1].x - x)).toBeCloseTo(slotHalf(false), 12);
          // Open, it hangs from the wider opening's edge, under the board, and no part of it is inside the opening.
          const open = wingCorners(hole, side, time, true);
          for (const corner of open) {
            expect(Math.abs(corner.x - x)).toBeCloseTo(slotHalf(true), 12);
            const out = corner.depth - pusherFront(time);
            expect(out * SIN + (corner.height - CATCHER.deck) * COS).toBeLessThanOrEqual(-PLATE.thick + 1e-9);
          }
        }
      });
    }
  });

  it('lights one hole gold at a time, which steps along with every stroke of the pusher, a ride after the lamp itself; and all three while the flaps are open', () => {
    expect(LUCKY.dwell).toBe(PUSHER.period);
    expect(CATCHER.sink).toBe(START_RIDE);
    for (let stroke = 0; stroke < CHUCKERS.count * 2 + 1; stroke++) {
      for (const share of [0, 0.1, 0.25, 0.5, 0.99]) {
        const time = (stroke + share) * LUCKY.dwell;
        const lit = litSlots(time);
        expect(lit).toHaveLength(CHUCKERS.count);
        // One and only one: the one the lamp stood on a ride ago, which is the one a medal dropping now came over.
        expect(lit.filter(Boolean)).toHaveLength(1);
        expect(lit.indexOf(true)).toBe(lampShown(time));
        expect(lampShown(time)).toBe(luckySlot(Math.max(0, time - START_RIDE)));
        const stepped = share * LUCKY.dwell >= START_RIDE || stroke === 0;
        expect(lit.indexOf(true)).toBe((stepped ? stroke : stroke - 1) % CHUCKERS.count);
        expect(litSlots(time, true)).toEqual(ALL.map(() => true));
        // Where nothing is shown moving a medal is taken as it comes over, and the light is where the lamp is.
        expect(lampShown(time, true)).toBe(luckySlot(time));
      }
    }
    // A medal's hole is lit as the medal drops exactly when the lamp was on it as the medal came over.
    for (let came = 0; came < PUSHER.period * 7; came += 1 / 60) {
      for (const slot of ALL) expect(litSlots(came + START_RIDE)[slot]).toBe(slot === luckySlot(came));
    }
  });

  it('shows each hole on the drawing as an opening wider than it is tall, three side by side, big enough to be seen on a phone', () => {
    for (const time of TIMES) {
      const mouths = ALL.map((hole) => mouthOnDrawing(hole, time));
      for (const mouth of mouths) {
        expect(mouth.wide).toBeGreaterThan(mouth.tall);
        // About twenty pixels by fourteen of a phone's screen: a medal going into it is seen to.
        expect(mouth.wide * PHONE).toBeGreaterThan(18);
        expect(mouth.tall * PHONE).toBeGreaterThan(12);
        expect(mouth.x).toBeGreaterThan(0);
        expect(mouth.x).toBeLessThan(VIEW.width);
      }
      expect(mouths[0].x).toBeLessThan(mouths[1].x);
      expect(mouths[1].x).toBeLessThan(mouths[2].x);
      // Wider while the flaps are open.
      expect(mouthOnDrawing(1, time, true).wide).toBeGreaterThan(mouths[1].wide);
    }
  });

  it('has a START sign to either side of the holes, on the plate and clear of the frames, its word tall enough to read on a phone', () => {
    const frame = slotHalf(true) + CATCHER.rim.wide;
    const [left, right] = [signSpan(-1), signSpan(1)];
    expect(left.from).toBeGreaterThan(0);
    expect(left.to).toBeLessThan(CHECKERS.positions[0] - frame);
    expect(right.from).toBeGreaterThan(CHECKERS.positions[2] + frame);
    expect(right.to).toBeLessThan(FIELD.width);
    // The two are alike, one each side of the middle.
    expect(left.to - left.from).toBeCloseTo(right.to - right.from, 12);
    expect(left.from + right.to).toBeCloseTo(FIELD.width, 12);
    expect(SIGN.wide).toBeCloseTo(left.to - left.from, 12);
    expect(SIGN.long).toBeCloseTo(SLOPE.long - 2 * SIGNS.margin, 12);
    expect(SIGN_CAP).toBeLessThan(SIGN.long - 1);
    for (const time of TIMES) {
      for (const side of [-1, 1]) {
        const top = signSpot(side, SIGN.wide / 2, SIGN.long / 2 - SIGN_CAP / 2, time);
        const foot = signSpot(side, SIGN.wide / 2, SIGN.long / 2 + SIGN_CAP / 2, time);
        expect((project(foot.x, foot.height, foot.depth).y - project(top.x, top.height, top.depth).y) * PHONE).toBeGreaterThan(6.5);
      }
    }
  });

  it('says what on the lower table is under it: anything that reaches in under its foot, the whole width of the field', () => {
    for (const time of TIMES) {
      const foot = pusherFront(time) + CATCHER.foot.out;
      for (const x of [R, 20, FIELD.width / 2, FIELD.width - R]) {
        expect(underCatcher(x, foot + R - 0.01, R, time)).toBe(true);
        expect(underCatcher(x, foot + R + 0.01, R, time)).toBe(false);
        expect(underCatcher(x, pusherFront(time) + R, R, time)).toBe(true);
      }
    }
  });
});

describe('a medal that comes over the lip', () => {
  it('drops through the hole it came over in line with: the machine counts it at the lip and has it come down under the plate a ride later', () => {
    for (const time of [0, 1.1, 2.5]) {
      ALL.forEach((hole) => {
        for (const off of [0, CHECKERS.halfWidth - 0.01, -(CHECKERS.halfWidth - 0.01)]) {
          const { machine, events } = overAt(CHECKERS.positions[hole] + off, time);
          expect(events.checkers).toEqual([hole]);
          expect(machine.medals).toEqual([]);
          const [medal] = machine.falling;
          expect(medal).toMatchObject({ source: 'slide', level: 0, duration: START_RIDE, ball: false });
          expect(plateWay(medal, machine.time)).toEqual({ kind: 'hole', hole });
          expect(medal.y - pusherFront(machine.time + medal.remaining)).toBeCloseTo(PLATE.through, 9);
          // It comes down there, under the plate, a hair clear of the pusher's face.
          for (let i = 0; i < Math.round(START_RIDE / DT); i++) step(machine, DT);
          expect(machine.falling).toEqual([]);
          const [down] = machine.medals;
          expect(down.y - pusherFront(machine.time)).toBeCloseTo(PLATE.through, 9);
          expect(down.y - R).toBeGreaterThan(pusherFront(machine.time));
          expect(underCatcher(down.x, down.y, R, machine.time)).toBe(true);
        }
      });
    }
  });

  it('slides down past the holes and off the foot when it came over anywhere else, and rocks on a hole’s frame first if its middle was over the opening', () => {
    for (const x of [R, 10, 20, (CHECKERS.positions[0] + CHECKERS.positions[1]) / 2, 60, FIELD.width - R]) {
      const { machine, events } = overAt(x);
      expect(events.checkers).toEqual([]);
      const [medal] = machine.falling;
      expect(medal).toMatchObject({ source: 'slide', duration: MEDAL_SLIDE });
      expect(plateWay(medal, machine.time)).toEqual({ kind: 'slide' });
      expect(medal.y - pusherFront(machine.time + medal.remaining)).toBeCloseTo(PLATE.reach + R, 9);
    }
    // Its middle over the opening but not in line: a near miss. The nearer it was to fitting, the longer it rocks.
    ALL.forEach((hole) => {
      for (const side of [-1, 1]) {
        let longer = Infinity;
        for (const off of [CHECKERS.halfWidth + 0.05, CHECKERS.halfWidth + R / 2, CHECKERS.halfWidth + R - 0.05]) {
          const { machine, events } = overAt(CHECKERS.positions[hole] + side * off);
          expect(events.checkers).toEqual([]);
          const [medal] = machine.falling;
          const way = plateWay(medal, machine.time);
          expect(way?.kind).toBe('rim');
          if (way?.kind !== 'rim') continue;
          expect(way.hole).toBe(hole);
          expect(way.hang).toBeGreaterThanOrEqual(TEETER.least - 1e-9);
          expect(way.hang).toBeLessThanOrEqual(TEETER.most + 1e-9);
          expect(way.hang).toBeLessThan(longer);
          longer = way.hang;
          expect(medal.duration).toBeCloseTo(MEDAL_SLIDE + way.hang, 12);
          expect(nearness(medal, machine.time)).toBe(way.nearness);
        }
      }
    });
  });

  it('drops through a hole whose flaps are open from further to the side than it could with them shut', () => {
    ALL.forEach((hole) => {
      for (const side of [-1, 1]) {
        const x = CHECKERS.positions[hole] + side * (CHECKERS.halfWidth + CHECKERS.wingWidth) / 2;
        expect(overAt(x, 1.1, false).events.checkers).toEqual([]);
        const open = overAt(x, 1.1, true);
        expect(open.events.checkers).toEqual([hole]);
        expect(plateWay(open.machine.falling[0], open.machine.time)).toEqual({ kind: 'hole', hole });
      }
    });
  });

  it('is shown off the lip, down the plate and off its foot to where the machine has it come down, and never inside the pusher, the plate or the table', () => {
    for (const time of [0.2, 1.1, 2.4]) {
      for (const x of [R, 15, CHECKERS.positions[0] + CHECKERS.halfWidth + 1, 33.5, CHECKERS.positions[1], CHECKERS.positions[2] - 0.6, 66, FIELD.width - R]) {
        for (const wings of [false, true]) {
          for (const calm of [false, true]) {
            const { machine } = overAt(x, time, wings);
            const [medal] = machine.falling;
            const way = plateWay(medal, machine.time);
            let last: Caught | null = null;
            for (let k = 0; k <= 60; k++) {
              const elapsed = (medal.duration * k) / 60;
              const now = timeOf(medal, machine.time, elapsed);
              const held = slidDown(later(medal, elapsed), now, calm, wings);
              expect(held).not.toBeNull();
              if (!held) continue;
              expect(held.x).toBeCloseTo(way?.kind === 'rim' ? held.x : x, 9);
              expect(deepest(held, now, wings)).toBe(0);
              // It moves on smoothly: no jump from one sixtieth of its way to the next.
              if (last && !calm) expect(Math.hypot(held.height - last.height, held.depth - last.depth)).toBeLessThan(1.6);
              last = held;
            }
            if (!last) continue;
            // It starts level at the lip, lying on the pusher as it lay there, unless nothing is shown moving and it went down a hole.
            const start = slidDown(medal, machine.time, calm, wings);
            if (!(calm && way?.kind === 'hole')) {
              expect(start?.height).toBeCloseTo(P + T / 2, 6);
              expect(start?.depth).toBeCloseTo(pusherFront(machine.time), 6);
              expect(start?.tilt).toBeCloseTo(0, 6);
            }
            // And ends lying flat where the machine has it come down.
            const end = timeOf(medal, machine.time, medal.duration);
            expect(last.height).toBeCloseTo(T / 2, 6);
            expect(last.tilt).toBeCloseTo(0, 6);
            expect(last.depth).toBeCloseTo(medal.y, 6);
            expect(end).toBeCloseTo(machine.time + medal.remaining, 9);
          }
        }
      }
    }
  });

  it('is seen going down into its hole and darkening under the plate, and a near miss rocks on the frame toward the hole and back', () => {
    const { machine } = overAt(CHECKERS.positions[1] + 0.4);
    const [medal] = machine.falling;
    const legs = new Set<string>();
    let darkest = 1;
    for (let k = 0; k <= 60; k++) {
      const elapsed = (START_RIDE * k) / 60;
      const held = slidDown(later(medal, elapsed), timeOf(medal, machine.time, elapsed));
      if (!held) continue;
      legs.add(held.leg);
      darkest = Math.min(darkest, held.light);
      expect(held.chucker).toBe(1);
      expect(held.leg === 'slot').toBe(elapsed / START_RIDE >= CATCHER.ride);
    }
    expect([...legs]).toEqual(['plate', 'slot']);
    expect(darkest).toBeCloseTo(CATCHER.shade, 9);

    // A near miss: down to the hole's level, rocking there for as long as it hangs, and on down and off the foot.
    const near = overAt(CHECKERS.positions[1] + CHECKERS.halfWidth + 0.3);
    const [missed] = near.machine.falling;
    const way = plateWay(missed, near.machine.time);
    expect(way?.kind).toBe('rim');
    if (way?.kind !== 'rim') return;
    expect(RIM_REACHED).toBeCloseTo(MEDAL_SLIDE * AT_THE_HOLES, 12);
    let most = 0;
    const seen = new Set<string>();
    for (let k = 0; k <= 120; k++) {
      const elapsed = (missed.duration * k) / 120;
      const held = slidDown(later(missed, elapsed), timeOf(missed, near.machine.time, elapsed));
      if (!held) continue;
      seen.add(held.leg);
      expect(held.near).toBe(1);
      const rocking = elapsed > RIM_REACHED && elapsed < RIM_REACHED + way.hang;
      expect(held.leg === 'rim').toBe(rocking);
      if (rocking) most = Math.max(most, held.tilt - SLOPE.angle);
      // It rocks toward the hole: the side of it over the opening, which is to its left, goes down.
      if (rocking && elapsed > RIM_REACHED + way.hang * 0.2 && elapsed < RIM_REACHED + way.hang * 0.8) expect(held.heading).toBeGreaterThan(0);
    }
    expect([...seen]).toEqual(['plate', 'rim', 'plate', 'off'].filter((leg, i, all) => all.indexOf(leg) === i));
    expect(most).toBeGreaterThan(0.05);
    // With less motion asked for it does not rock.
    for (let k = 0; k <= 60; k++) {
      const elapsed = (missed.duration * k) / 60;
      expect(slidDown(later(missed, elapsed), timeOf(missed, near.machine.time, elapsed), true)?.leg).not.toBe('rim');
    }
  });

  it('agrees with the machine: every medal the engine counts is shown going down that hole, and no other is', { timeout: 30_000 }, () => {
    for (const wings of [false, true]) {
      const machine = createMachine(12);
      let counted = 0;
      let shown = 0;
      for (let i = 0; i < 60 * 60; i++) {
        if (i % 20 === 0) dropAt(machine, FIELD.width / 2 + ((i / 20) % 7) - 3);
        const before = new Set(machine.falling.map((medal) => medal.id));
        const events = step(machine, DT, wings);
        const fresh = machine.falling.filter((medal) => !before.has(medal.id) && medal.source === 'slide' && !medal.ball && !medal.jewel);
        const holes = fresh.flatMap((medal) => {
          const way = plateWay(medal, machine.time);
          return way?.kind === 'hole' ? [way.hole] : [];
        });
        // No tower is on this machine, so every entry is a single medal.
        expect(holes.sort()).toEqual([...events.checkers].sort());
        counted += events.checkers.length;
        shown += holes.length;
      }
      expect(counted).toBeGreaterThan(10);
      expect(shown).toBe(counted);
    }
  });

  it('is left alone by the plate when it is not on its way down it', () => {
    const machine = emptyAt(1);
    const fed: FallingMedal = { id: 5, x: 30, y: 20, level: 1, fromX: 30, fromY: 3, rank: 0, ball: false, remaining: 0.2, duration: 0.4, source: 'player' };
    expect(plateWay(fed, machine.time)).toBeNull();
    expect(slidDown(fed, machine.time)).toBeNull();
    expect(rolledDown(fed, BALL_RADIUS, machine.time)).toBeNull();
    expect(spilled(fed, machine.time)).toBeNull();
  });
});

describe('a medal coming down the plate, how near it was', () => {
  it('runs from nothing, for one whose middle was only just over the opening, to all of the way, for one that all but fitted; and is nothing for any other', () => {
    const x = CHECKERS.positions[2];
    const nearOf = (off: number) => {
      const { machine } = overAt(x + off);
      return nearness(machine.falling[0], machine.time);
    };
    expect(nearOf(CHECKERS.halfWidth + 0.001)).toBeGreaterThan(0.99);
    expect(nearOf(CHECKERS.halfWidth + R - 0.001)).toBeLessThan(0.01);
    expect(nearOf(0)).toBe(0);
    expect(nearOf(CHECKERS.halfWidth + R + 1)).toBe(0);
    // The nearer half rock a quarter of a second or more: long enough to be seen and heard to.
    const { machine } = overAt(x + CHECKERS.halfWidth + R / 2 - 0.001);
    const way = plateWay(machine.falling[0], machine.time);
    expect(way?.kind === 'rim' && way.hang).toBeGreaterThan(0.24);
  });
});

describe('a prize ball and the plate', () => {
  it('fits no hole: the machine has it roll down the plate, over the holes and the foot’s edge, and down against the foot', () => {
    for (const x of [R + 1, CHECKERS.positions[0], CHECKERS.positions[1], 45, FIELD.width - BALL_RADIUS]) {
      const { machine, events } = overAt(x, 0.9, false, { ball: true });
      expect(events.checkers).toEqual([]);
      const [ball] = machine.falling;
      expect(ball).toMatchObject({ source: 'slide', ball: true, duration: ROLL_DOWN });
      expect(plateWay(ball, machine.time)).toEqual({ kind: 'roll' });
      expect(ball.y - pusherFront(machine.time + ball.remaining)).toBeCloseTo(PLATE.reach + PRIZE_LANDS.ball, 9);
      expect(PRIZE_LANDS.ball).toBe(clearOfFoot(BALL_RADIUS));
      let last = null as ReturnType<typeof rolledDown>;
      for (let k = 0; k <= 80; k++) {
        const elapsed = (ROLL_DOWN * k) / 80;
        const now = timeOf(ball, machine.time, elapsed);
        const at = rolledDown(later(ball, elapsed), BALL_RADIUS, now);
        expect(at).not.toBeNull();
        if (!at) continue;
        // Nothing of it inside anything: points all over it.
        for (let i = 0; i < 200; i++) {
          const a = Math.acos(1 - (2 * (i + 0.5)) / 200);
          const b = i * 2.399963;
          expect(inside(at.x + BALL_RADIUS * Math.sin(a) * Math.cos(b), at.height + BALL_RADIUS * Math.cos(a), at.depth + BALL_RADIUS * Math.sin(a) * Math.sin(b), now, false)).toBe(0);
        }
        if (last) expect(Math.hypot(at.height - last.height, at.depth - last.depth)).toBeLessThan(1.2);
        last = at;
      }
      // From standing on the pusher at the lip to standing on the table against the foot, where the machine has it.
      const start = rolledDown(ball, BALL_RADIUS, machine.time);
      expect(start?.height).toBeCloseTo(P + BALL_RADIUS, 9);
      expect(start?.depth).toBeCloseTo(pusherFront(machine.time), 9);
      expect(last?.height).toBeCloseTo(BALL_RADIUS, 9);
      const end = timeOf(ball, machine.time, ROLL_DOWN);
      expect(last?.depth).toBeCloseTo(pusherFront(end) + PLATE.reach + PRIZE_LANDS.ball, 9);
    }
  });

  it('is pushed ahead by the plate’s foot as the pusher comes forward, as the face pushes a medal, and is never under it', () => {
    const machine = emptyAt(0);
    const ball: Medal = { id: 7, x: 30, y: PUSHER.min + PLATE.reach + PRIZE_CLEAR.ball + 0.5, level: 0, tier: 0, sinceDrop: -1, stack: 1, ball: true, grown: 1 };
    machine.medals = [ball];
    machine.nextId = 8;
    for (let i = 0; i < Math.round(PUSHER.period / DT); i++) {
      step(machine, DT);
      expect(underPlate(ball, pusherFront(machine.time))).toBe(false);
    }
    // It was pushed out as far as the foot came.
    expect(ball.y).toBeGreaterThanOrEqual(PUSHER.max + PLATE.reach + PRIZE_CLEAR.ball - 1e-6);
  });
});

describe('a jewel and the plate', () => {
  it('fits no hole: it tumbles down the plate, never into anything, and lands on its point a little clear of the foot, where the machine has it', () => {
    for (const x of [CHECKERS.positions[1], 20]) {
      const { machine, events } = overAt(x, 0.6, false, { jewel: true });
      expect(events.checkers).toEqual([]);
      const [jewel] = machine.falling;
      expect(jewel).toMatchObject({ source: 'slide', jewel: true, duration: ROLL_DOWN });
      expect(plateWay(jewel, machine.time)).toEqual({ kind: 'roll' });
      expect(PRIZE_LANDS.jewel).toBeGreaterThan(PRIZE_CLEAR.jewel);
      expect(PRIZE_CLEAR.jewel).toBe(JEWEL_CUT.girdle);
      for (let k = 0; k <= 60; k++) {
        const elapsed = (ROLL_DOWN * k) / 60;
        const now = timeOf(jewel, machine.time, elapsed);
        const spot = slidJewel(later(jewel, elapsed), now);
        expect(spot).not.toBeNull();
        if (!spot) continue;
        for (const face of JEWEL_FACETS) {
          for (const corner of face.corners) {
            const [px, ph, pd] = pointInCabinet(spot, corner);
            expect(inside(px, ph, pd, now, false)).toBeLessThan(2e-3);
          }
        }
      }
      // It lands as it will lie: on its point on the table, where the machine puts it.
      const end = timeOf(jewel, machine.time, ROLL_DOWN);
      const last = slidJewel(later(jewel, ROLL_DOWN), end);
      expect(last?.height).toBeCloseTo(JEWEL_CUT.pavilion, 6);
      expect(last?.depth).toBeCloseTo(pusherFront(end) + PLATE.reach + PRIZE_LANDS.jewel, 6);
    }
  });
});

describe('a tower that goes over the lip', () => {
  /** A tower of `stack` going over at `x`, and its medals in the air. */
  const topple = (x: number, stack = 24) => {
    const { machine, events } = overAt(x, 1.3, false, { stack });
    return { machine, events, medals: machine.falling.filter((medal) => medal.source === 'spill') };
  };

  it('sends every one of its medals down the hole it went over at, and each comes down under the plate', () => {
    const { machine, events, medals } = topple(CHECKERS.positions[2] + 0.3);
    expect(events.toppled).toBe(1);
    expect(events.checkers).toEqual(Array(24).fill(2));
    expect(medals).toHaveLength(24);
    for (const medal of medals) expect(medal.y - pusherFront(machine.time + medal.remaining)).toBeCloseTo(PLATE.through, 9);
  });

  it('is thrown out over the plate when it goes over anywhere else, and comes down past its foot', () => {
    const { machine, events, medals } = topple(20);
    expect(events.checkers).toEqual([]);
    for (const medal of medals) expect(medal.y - pusherFront(machine.time + medal.remaining)).toBeGreaterThanOrEqual(PLATE.reach + 2 * R - 1e-9);
  });

  it('comes down on the plate and never through it, and ends its way exactly where the machine has each medal come down', { timeout: 30_000 }, () => {
    for (const x of [CHECKERS.positions[1], CHECKERS.positions[1] - 0.8, 20, 60]) {
      const { machine, medals } = topple(x, TOWER.max);
      for (const medal of medals) {
        for (let k = 0; k <= 30; k++) {
          const elapsed = (medal.duration * k) / 30;
          const now = timeOf(medal, machine.time, elapsed);
          const held = spilled(later(medal, elapsed), now);
          expect(held).not.toBeNull();
          if (held) expect(deepest(held, now)).toBe(0);
        }
        const end = timeOf(medal, machine.time, medal.duration);
        const last = spilled(later(medal, medal.duration), end);
        expect(last?.height).toBeCloseTo(T / 2, 6);
        expect(last?.depth).toBeCloseTo(medal.y, 6);
        expect(last?.x).toBeCloseTo(medal.x, 9);
      }
    }
  });
});

describe('what has gone down a hole', () => {
  it('is out from under the plate once the pusher is back: the plate’s foot stops short of where the face has pushed it', () => {
    // Under the plate at the foot of the face when the pusher is out; out in front of the foot when it is back.
    expect(PUSHER.max + PLATE.through + R).toBeGreaterThan(PUSHER.min + PLATE.reach);
  });

  it('is shown lying on the lower table where it came down, as any medal is: the plate shows nothing of it once it is down', () => {
    const { machine } = overAt(CHECKERS.positions[0]);
    for (let i = 0; i < Math.round(START_RIDE / DT); i++) step(machine, DT);
    expect(machine.falling).toEqual([]);
    expect(machine.medals).toHaveLength(1);
    const [medal] = machine.medals;
    expect(ridingAt(PLATE.reach + R)).toEqual({ out: PLATE.reach + R, height: T / 2, tilt: 0 });
    expect(medal.level).toBe(0);
  });
});
