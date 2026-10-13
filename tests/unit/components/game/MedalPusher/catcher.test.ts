import { describe, expect, it } from 'vitest';

import type { Spot } from '@/components/game/MedalPusher/arms';
import {
  APRON,
  CATCHER,
  SLOPE,
  START_SLOT,
  apronSpot,
  caught,
  lampSpot,
  litSlots,
  mouthOnDrawing,
  mouthSpot,
  mouthSpots,
  rolling,
  slopeSpot,
  slotCorners,
  slotHalf,
  underCatcher,
  wingCorners,
  type Caught,
} from '@/components/game/MedalPusher/catcher';
import { CHUCKERS, chuckerSpot, droppedThrough, grazed } from '@/components/game/MedalPusher/chuckers';
import { CHECKERS, FIELD, LUCKY, MEDAL_RADIUS, MEDAL_THICKNESS, PUSHER, createMachine, luckySlot, pusherFront, step, type Medal } from '@/components/game/MedalPusher/engine';
import { APRON_CAP, BALL_RADIUS } from '@/components/game/MedalPusher/render';
import { EYE_AT, HEIGHT, VIEW, project } from '@/components/game/MedalPusher/view';

import { dropAt } from './feeding';

const P = HEIGHT.pusher;
const T = MEDAL_THICKNESS;
const R = MEDAL_RADIUS;
const ALL = [0, 1, 2];
/** Moments all through the pusher's stroke: out, back, and on the way. */
const TIMES = [0, 0.75, 1.5, PUSHER.period / 2, 2.2, 4.5, 5.3];
/** How many pixels of a phone's screen a pixel of the drawing is, when the stage is as wide as it is on a 375-pixel page. */
const PHONE = 345 / VIEW.width;
const SIN = Math.sin(SLOPE.angle);
const COS = Math.cos(SLOPE.angle);
/** Where the strip with the words begins, down the slide from the lip: under the lower bars of the slots' frames. */
const WORDS_FROM = CATCHER.back + START_SLOT.long + CATCHER.rim.wide;

/** A medal on the lower table that came over the lip `sinceDrop` seconds ago. */
const over = (x: number, y: number, sinceDrop: number, more: Partial<Medal> = {}): Medal => ({ id: 9, x, y, level: 0, tier: 0, sinceDrop, stack: 1, grow: 0, ball: false, grown: 1, ...more });
/** Where a spot of the cabinet is against the slide at `time`: how far down it from the lip, and how far clear of it, square to it. */
const onSlide = (spot: Spot, time: number): { down: number; clear: number } => {
  const out = spot.depth - pusherFront(time);
  const up = spot.height - CATCHER.deck;
  return { down: out * COS - up * SIN, clear: up * COS + out * SIN };
};
const seen = (spot: Spot) => project(spot.x, spot.height, spot.depth);

describe('the catcher for the START slots', () => {
  it('is a slide hung on the front of the pusher: it starts under the lip and leans down toward the player to a foot clear of the lower table', () => {
    // From just under the edge of the pusher's top, so a medal that comes over the lip is above it.
    expect(CATCHER.deck).toBeLessThan(P);
    expect(CATCHER.deck).toBeGreaterThan(P - 1);
    // Down to a foot that two medals deep, and one more on its way down onto them, pass under.
    expect(CATCHER.foot.height).toBeGreaterThan(T * 2.5);
    expect(CATCHER.foot.height).toBeLessThan(CATCHER.deck);
    // The foot is no further out from the lip than the foot of the level catcher this one replaces was, and never reaches the open sides.
    expect(CATCHER.foot.out).toBeLessThanOrEqual(15.6);
    expect(PUSHER.max + CATCHER.foot.out).toBeLessThan(FIELD.sideOpenFrom);
    // Its lean and its length are those of the line from the one to the other.
    expect(SLOPE.angle).toBeCloseTo(Math.atan2(CATCHER.deck - CATCHER.foot.height, CATCHER.foot.out), 12);
    expect(SLOPE.long).toBeCloseTo(Math.hypot(CATCHER.deck - CATCHER.foot.height, CATCHER.foot.out), 12);
    // It is a slope and not a shelf: it leans by a good many degrees. It is no steeper than leaves it room for a slot and a word.
    expect(SLOPE.angle).toBeGreaterThan((18 * Math.PI) / 180);
    expect(SLOPE.angle).toBeLessThan((50 * Math.PI) / 180);
    expect(SLOPE.long).toBeGreaterThan(WORDS_FROM + APRON_CAP);
    for (const time of TIMES) {
      const front = pusherFront(time);
      // It rides with the pusher: its top edge is on the pusher's face under the lip, and its foot as far out as the catcher says.
      expect(slopeSpot(40, 0, time)).toEqual({ x: 40, height: CATCHER.deck, depth: front });
      const foot = slopeSpot(40, SLOPE.long, time);
      expect(foot.x).toBe(40);
      expect(foot.height).toBeCloseTo(CATCHER.foot.height, 9);
      expect(foot.depth).toBeCloseTo(front + CATCHER.foot.out, 9);
      // Every point of it is on that line, and a thing lifted off it is lifted square to it.
      for (const down of [0, 1.7, 4, SLOPE.long]) {
        const on = slopeSpot(55, down, time);
        expect(onSlide(on, time).down).toBeCloseTo(down, 9);
        expect(onSlide(on, time).clear).toBeCloseTo(0, 9);
        expect(on.height).toBeCloseTo(CATCHER.deck - (CATCHER.deck - CATCHER.foot.height) * (down / SLOPE.long), 9);
        const lifted = slopeSpot(55, down, time, 0.8);
        expect(Math.hypot(lifted.height - on.height, lifted.depth - on.depth)).toBeCloseTo(0.8, 9);
        expect(onSlide(lifted, time).down).toBeCloseTo(down, 9);
        expect(onSlide(lifted, time).clear).toBeCloseTo(0.8, 9);
      }
      // Leaning toward the player, it is seen more nearly square on than a level board there would be: a unit down it is longer on the drawing.
      const middle = slopeSpot(50, SLOPE.long / 2, time);
      const down = seen(slopeSpot(50, SLOPE.long / 2 + 1, time)).y - seen(middle).y;
      const level = project(50, middle.height, middle.depth + 1).y - seen(middle).y;
      expect(down).toBeGreaterThan(level * 1.2);
      // And from where the player sits all of it is seen: the line of sight to it comes down on its upper side.
      const sight = { height: EYE_AT.height - middle.height, depth: EYE_AT.depth - middle.depth };
      expect(sight.height * COS + sight.depth * SIN).toBeGreaterThan(0);
    }
  });

  it('is one piece, as long as the three pockets take, with a slot for each in the slide, its frame and its folded wings inside its own stretch', () => {
    expect(CATCHER.tile).toBe(CHECKERS.positions[1] - CHECKERS.positions[0]);
    expect(CATCHER.from).toBe(CHECKERS.positions[0] - CATCHER.tile / 2);
    expect(CATCHER.to).toBe(CHECKERS.positions[2] + CATCHER.tile / 2);
    expect(CATCHER.to - CATCHER.from).toBe(CATCHER.tile * CHUCKERS.count);
    expect(CATCHER.from).toBeGreaterThan(0);
    expect(CATCHER.to).toBeLessThan(FIELD.width);
    // A slot is as wide as its pocket: a medal that just fits, with as much to either side as the rule lets its middle be off.
    expect(slotHalf()).toBeCloseTo(R + CHECKERS.halfWidth, 12);
    expect(slotHalf()).toBeCloseTo(CHUCKERS.radius, 12);
    expect(slotHalf(false)).toBe(slotHalf());
    // Down the slide it is shorter than a medal is across, since a medal goes into it nose first, and a good deal longer than half of one.
    expect(START_SLOT.long).toBeLessThan(R * 2);
    expect(START_SLOT.long).toBeGreaterThan(R * 1.25);
    // Two slots do not touch, frames and folded wings and all, and there is more closed slide between two openings than a medal's radius.
    expect((slotHalf() + CATCHER.rim.wide + START_SLOT.wing.thick) * 2).toBeLessThan(CATCHER.tile);
    expect(CATCHER.tile - slotHalf() * 2).toBeGreaterThan(R);
    // A frame is narrow beside the medal it frames, and stands out of the slide by less than a medal is thick, so a medal slides over it.
    expect(CATCHER.rim.wide).toBeGreaterThan(0);
    expect(CATCHER.rim.wide).toBeLessThan(R / 2);
    expect(CATCHER.rim.high).toBeGreaterThan(0);
    expect(CATCHER.rim.high).toBeLessThan(T);
    for (const time of TIMES) {
      const front = pusherFront(time);
      const spots = mouthSpots(time);
      expect(spots).toHaveLength(CHUCKERS.count);
      ALL.forEach((chucker) => {
        const spot = mouthSpot(chucker, time);
        expect(spots[chucker]).toEqual(spot);
        // Straight out from where the engine has the pocket on the lip, on the slide, half the opening's length below where the opening begins.
        expect(spot.x).toBe(chuckerSpot(chucker, time).x);
        expect(spot.x).toBe(CHECKERS.positions[chucker]);
        expect(spot).toEqual(slopeSpot(CHECKERS.positions[chucker], CATCHER.back + START_SLOT.long / 2, time));
        expect(onSlide(spot, time).clear).toBeCloseTo(0, 9);
        expect(spot.depth).toBeGreaterThan(front);
        expect(spot.height).toBeLessThan(CATCHER.deck);
        expect(spot.height).toBeGreaterThan(CATCHER.foot.height);
        // Its four corners: the upper edge from the left, then the lower from the right.
        const corners = slotCorners(chucker, time);
        expect(corners).toHaveLength(4);
        [-1, 1, 1, -1].forEach((side, at) => expect(corners[at].x - spot.x).toBeCloseTo(side * slotHalf(), 9));
        corners.forEach((corner, at) => {
          expect(onSlide(corner, time).down).toBeCloseTo(at < 2 ? CATCHER.back : CATCHER.back + START_SLOT.long, 9);
          expect(onSlide(corner, time).clear).toBeCloseTo(0, 9);
        });
        // The same further out all round and clear of the slide: the outer edge of its frame, at the frame's top.
        const frame = slotCorners(chucker, time, false, CATCHER.rim.wide, CATCHER.rim.high);
        for (const corner of frame) expect(Math.abs(corner.x - spot.x)).toBeCloseTo(slotHalf() + CATCHER.rim.wide, 9);
        frame.forEach((corner, at) => {
          expect(onSlide(corner, time).down).toBeCloseTo(at < 2 ? CATCHER.back - CATCHER.rim.wide : WORDS_FROM, 9);
          expect(onSlide(corner, time).clear).toBeCloseTo(CATCHER.rim.high, 9);
        });
        // The whole of it, frame and all, is below the lip and above the strip with the words.
        expect(CATCHER.back - CATCHER.rim.wide).toBeGreaterThan(0);
        expect(WORDS_FROM).toBeLessThan(SLOPE.long);
        // Its lamp is on the lower bar of its frame, in the middle, standing a little out of it; it is a small one.
        const lamp = lampSpot(chucker, time);
        expect(lamp.x).toBe(spot.x);
        expect(onSlide(lamp, time).down).toBeGreaterThan(CATCHER.back + START_SLOT.long);
        expect(onSlide(lamp, time).down).toBeLessThan(WORDS_FROM);
        expect(onSlide(lamp, time).clear).toBeGreaterThan(CATCHER.rim.high);
        expect(onSlide(lamp, time).clear).toBeLessThan(CATCHER.rim.high + START_SLOT.lamp.radius);
        expect(START_SLOT.lamp.radius * 2).toBeLessThan(slotHalf());
        // Under it, a throat with depth: its floor is more than a medal's thickness under the lower end of the opening, and several under the upper.
        expect(corners[2].height - CATCHER.throat).toBeGreaterThan(T);
        expect(corners[0].height - CATCHER.throat).toBeGreaterThan(T * 2.5);
        expect(CATCHER.throat).toBeGreaterThanOrEqual(CATCHER.foot.height);
      });
    }
    for (const chucker of [-1, 3, 0.5, Number.NaN]) expect(() => mouthSpot(chucker, 0)).toThrow();
  });

  it('has a wing along either side of each frame, which swings out at its upper end to funnel medals to a wider opening during chance time', () => {
    expect(slotHalf(true)).toBeCloseTo(R + CHECKERS.wingWidth, 12);
    expect(CHECKERS.wingWidth).toBeGreaterThan(CHECKERS.halfWidth);
    // Wider by exactly what the rule is wider by, on either side.
    expect(slotHalf(true) - slotHalf()).toBeCloseTo(CHECKERS.wingWidth - CHECKERS.halfWidth, 12);
    // Two wide openings, their frames and their open wings still do not meet.
    expect((slotHalf(true) + CATCHER.rim.wide + START_SLOT.wing.out + START_SLOT.wing.thick) * 2).toBeLessThan(CATCHER.tile);
    // An open wing has swung a good deal further out than it is thick, and it stands higher off the slide than the frame does.
    expect(START_SLOT.wing.out).toBeGreaterThan(START_SLOT.wing.thick * 3);
    expect(START_SLOT.wing.high).toBeGreaterThan(CATCHER.rim.high);
    const upper = CATCHER.back - CATCHER.rim.wide;
    for (const time of TIMES) {
      ALL.forEach((chucker) => {
        const { x } = mouthSpot(chucker, time);
        for (const side of [-1, 1]) {
          // Folded, it lies along the side of the frame: against it, as long as it, and as thick as the catcher says.
          const folded = wingCorners(chucker, side, time);
          const hinge = x + side * (slotHalf() + CATCHER.rim.wide);
          [0, 1, 1, 0].forEach((outer, at) => expect(folded[at].x).toBeCloseTo(hinge + side * START_SLOT.wing.thick * outer, 9));
          folded.forEach((corner, at) => {
            expect(onSlide(corner, time).down).toBeCloseTo(at < 2 ? upper : WORDS_FROM, 9);
            expect(onSlide(corner, time).clear).toBeCloseTo(0, 9);
          });
          expect(wingCorners(chucker, side, time, false)).toEqual(folded);
          // Open, it is hinged at its lower end against the wider frame, and its upper end has swung out from the slot.
          const open = wingCorners(chucker, side, time, true);
          const wide = x + side * (slotHalf(true) + CATCHER.rim.wide);
          expect(open[3].x).toBeCloseTo(wide, 12);
          expect(open[2].x).toBeCloseTo(wide + side * START_SLOT.wing.thick, 12);
          expect(open[0].x).toBeCloseTo(wide + side * START_SLOT.wing.out, 12);
          expect(open[1].x).toBeCloseTo(wide + side * (START_SLOT.wing.out + START_SLOT.wing.thick), 12);
          open.forEach((corner, at) => expect(onSlide(corner, time).down).toBeCloseTo(at < 2 ? upper : WORDS_FROM, 9));
          // So the two of a slot stand like a funnel that opens toward the lip: further apart at the top than at the bottom.
          expect((open[0].x - x) * side).toBeGreaterThan((open[3].x - x) * side);
          // Its top is as far off the slide as the catcher says.
          for (const corner of wingCorners(chucker, side, time, true, START_SLOT.wing.high)) expect(onSlide(corner, time).clear).toBeCloseTo(START_SLOT.wing.high, 9);
          // All of it is on the catcher.
          for (const corner of [...folded, ...open]) {
            expect(corner.x).toBeGreaterThan(CATCHER.from);
            expect(corner.x).toBeLessThan(CATCHER.to);
          }
        }
        // The opening is in the same place and as long with the wings open; only wider.
        const closed = mouthOnDrawing(chucker, time);
        const opened = mouthOnDrawing(chucker, time, true);
        expect(opened.x).toBe(closed.x);
        expect(opened.y).toBe(closed.y);
        expect(opened.tall).toBe(closed.tall);
        expect(opened.wide / closed.wide).toBeCloseTo(slotHalf(true) / slotHalf(), 9);
        expect(mouthOnDrawing(chucker, time, false)).toEqual(closed);
        for (const corner of slotCorners(chucker, time, true)) expect(Math.abs(corner.x - x)).toBeCloseTo(slotHalf(true), 9);
      });
    }
  });

  it('lights one slot gold at a time, which steps along with every stroke of the pusher, and all three while the wings are open', () => {
    expect(LUCKY.dwell).toBe(PUSHER.period);
    for (let stroke = 0; stroke < CHUCKERS.count * 2 + 1; stroke++) {
      for (const share of [0, 0.25, 0.5, 0.99]) {
        const time = (stroke + share) * LUCKY.dwell;
        const lit = litSlots(time);
        expect(lit).toHaveLength(CHUCKERS.count);
        // One and only one, the one the engine says, which is the next one along from the stroke before.
        expect(lit.filter(Boolean)).toHaveLength(1);
        expect(lit.indexOf(true)).toBe(luckySlot(time));
        expect(lit.indexOf(true)).toBe(stroke % CHUCKERS.count);
        expect(litSlots(time, false)).toEqual(lit);
        expect(litSlots(time, true)).toEqual(ALL.map(() => true));
      }
    }
  });

  it('shows each slot on the drawing as an opening wider than it is tall, three side by side, big enough to be seen on a phone', () => {
    for (const time of TIMES) {
      const mouths = ALL.map((chucker) => mouthOnDrawing(chucker, time));
      mouths.forEach((mouth, chucker) => {
        const { x } = mouthSpot(chucker, time);
        const [upper, , lower] = slotCorners(chucker, time, false, 0, CATCHER.rim.high);
        const at = seen(slopeSpot(x, CATCHER.back + START_SLOT.long / 2, time, CATCHER.rim.high));
        // Its middle at the top of its frame; as wide as the opening is; as tall as the opening is seen, from its upper edge to its lower.
        expect(mouth.x).toBeCloseTo(at.x, 9);
        expect(mouth.y).toBeCloseTo(at.y, 9);
        expect(mouth.wide).toBeCloseTo(slotHalf() * 2 * at.scale, 9);
        expect(mouth.tall).toBeCloseTo(seen(lower).y - seen(upper).y, 9);
        expect(mouth.tall).toBeLessThan(mouth.wide);
        // The board leans toward the player, so the opening is seen more nearly square on than it would be in a level one.
        expect(mouth.tall).toBeGreaterThan(START_SLOT.long * at.scale * at.tilt * 1.2);
        // On a phone it is twenty pixels across and nine down, or more, with its frame outside that.
        expect(mouth.wide * PHONE).toBeGreaterThan(20);
        expect(mouth.tall * PHONE).toBeGreaterThan(9);
        // All of it is on the drawing, in the lower half, below the lip.
        expect(mouth.x - mouth.wide / 2).toBeGreaterThan(0);
        expect(mouth.x + mouth.wide / 2).toBeLessThan(VIEW.width);
        expect(mouth.y - mouth.tall / 2).toBeGreaterThan(project(x, P, pusherFront(time)).y);
        expect(mouth.y + mouth.tall / 2).toBeLessThan(VIEW.height);
      });
      // Side by side on one line, evenly, and not touching, with the wings open or folded.
      expect(mouths[1].y).toBeCloseTo(mouths[0].y, 6);
      expect(mouths[2].y).toBeCloseTo(mouths[0].y, 6);
      expect(mouths[1].x - mouths[0].x).toBeCloseTo(mouths[2].x - mouths[1].x, 6);
      expect(mouths[1].x - mouths[0].x).toBeGreaterThan(mouths[0].wide * 1.3);
      expect(mouths[1].x - mouths[0].x).toBeGreaterThan(mouthOnDrawing(0, time, true).wide);
      expect(mouths[1].x).toBeCloseTo(VIEW.width / 2, 6);
    }
  });

  it('has the word START under each slot on the last of the slide, down to its foot, tall enough to read on a phone', () => {
    const wide = CATCHER.to - CATCHER.from;
    // The strip with the words is what is left of the slide under the slots' frames.
    expect(APRON).toBeCloseTo(SLOPE.long - WORDS_FROM, 12);
    for (const time of TIMES) {
      const front = pusherFront(time);
      // Its corners: from under the frames down to the foot, from one end of the catcher to the other.
      expect(apronSpot(0, 0, time)).toEqual(slopeSpot(CATCHER.from, WORDS_FROM, time));
      const foot = apronSpot(wide, APRON, time);
      expect(foot.x).toBeCloseTo(CATCHER.to, 9);
      expect(foot.height).toBeCloseTo(CATCHER.foot.height, 9);
      expect(foot.depth).toBeCloseTo(front + CATCHER.foot.out, 9);
      // How long a unit down the strip is on the drawing, beside a unit across it: the nearer to one, the squarer on it is seen.
      const middle = apronSpot(wide / 2, APRON / 2, time);
      const o = seen(middle);
      const unitAcross = seen(apronSpot(wide / 2 + 1, APRON / 2, time)).x - o.x;
      const d = seen(apronSpot(wide / 2, APRON / 2 + 1, time));
      const unitDown = Math.hypot(d.x - o.x, d.y - o.y);
      expect(unitDown / unitAcross).toBeGreaterThan(0.85);
      // On a level board there it would be two thirds of that.
      const level = project(middle.x, middle.height, middle.depth + 1);
      expect(Math.hypot(level.x - o.x, level.y - o.y) / unitAcross).toBeLessThan(0.7);
      // The capitals are seven pixels tall or more on a phone, at any point of the stroke.
      expect(APRON_CAP * unitDown * PHONE).toBeGreaterThanOrEqual(7);
      // Under each slot, a word's middle is straight below the slot's, below its frame.
      ALL.forEach((chucker) => {
        const word = apronSpot(CATCHER.tile * (chucker + 0.5), APRON / 2, time);
        expect(word.x).toBe(mouthSpot(chucker, time).x);
        expect(onSlide(word, time).down).toBeGreaterThan(WORDS_FROM);
        expect(seen(word).y).toBeGreaterThan(mouthOnDrawing(chucker, time).y + mouthOnDrawing(chucker, time).tall / 2);
      });
    }
    // The words fit the strip, with a little of it over and under them, and are no smaller than three quarters of what they were on the apron of the level catcher, which was 4.4.
    expect(APRON_CAP).toBeLessThan(APRON - 0.4);
    expect(APRON_CAP).toBeGreaterThan(APRON * 0.75);
    expect(APRON_CAP).toBeGreaterThanOrEqual(4.4 * 0.75);
  });

  it('says what on the lower table is under it', () => {
    const time = 1.2;
    const front = pusherFront(time);
    const middle = (CATCHER.from + CATCHER.to) / 2;
    // At the foot of the pusher's face, anywhere along it.
    expect(underCatcher(middle, front + R, R, time)).toBe(true);
    expect(underCatcher(CATCHER.from + 1, front + CATCHER.foot.out - 1, R, time)).toBe(true);
    // Beside it, and out in front of it.
    expect(underCatcher(CATCHER.from - R - 0.1, front + R, R, time)).toBe(false);
    expect(underCatcher(CATCHER.to + R + 0.1, front + R, R, time)).toBe(false);
    expect(underCatcher(middle, front + CATCHER.foot.out + R + 0.1, R, time)).toBe(false);
    // Part under counts: a ball half out from under its foot, or lapping its end.
    expect(underCatcher(middle, front + CATCHER.foot.out + BALL_RADIUS - 0.1, BALL_RADIUS, time)).toBe(true);
    expect(underCatcher(CATCHER.to + BALL_RADIUS - 0.1, front + R, BALL_RADIUS, time)).toBe(true);
    // It rides with the pusher: what it was over at the front of the stroke it is not over at the back.
    const out = PUSHER.max + CATCHER.foot.out - 1;
    expect(underCatcher(middle, out, R, PUSHER.period / 2)).toBe(true);
    expect(underCatcher(middle, out, R, 0)).toBe(false);
    // A ball is taller than the catcher, which is why it has to be said; a medal is not.
    expect(BALL_RADIUS * 2).toBeGreaterThan(CATCHER.deck);
    expect(CATCHER.hood).toBeGreaterThan(BALL_RADIUS * 2);
    expect(T * 2).toBeLessThan(CATCHER.foot.height);
  });
});

describe('a medal that comes over the lip at the catcher', () => {
  const time = 1.3;
  const front = pusherFront(time);
  const pocket = CHECKERS.positions[1];
  /** A step fine enough to follow a medal that rocks several times in a third of a second. */
  const FINE = 1 / 480;
  /** The legs a medal was on, in the order it was on them, each once. */
  const legs = (poses: Caught[]): Caught['leg'][] => poses.map((pose) => pose.leg).filter((leg, at, all) => at === 0 || leg !== all[at - 1]);
  /** Every pose a medal that came over at `x` is shown in, a fine step apart, until it is shown no more. */
  const walk = (x: number, calm = false, wings = false): Caught[] => {
    const poses: Caught[] = [];
    for (let sinceDrop = 0; sinceDrop < 2; sinceDrop += FINE) {
      const held = caught(over(x, sinceDrop === 0 ? front : front + R, sinceDrop), time, calm, wings);
      if (!held) break;
      poses.push(held);
    }
    return poses;
  };
  /** That a medal is lying on the slide: leaning as it leans and no other way, and half its thickness clear of it. */
  const lying = (held: Caught): void => {
    expect(held.heading).toBe(0);
    expect(held.tilt).toBeCloseTo(SLOPE.angle, 12);
    expect(onSlide(held, time).clear).toBeCloseTo(T / 2, 9);
    expect(held.light).toBe(1);
  };
  /** That a medal goes off the foot of the slide and out of sight, from the pose it left the slide in. */
  const offTheFoot = (poses: Caught[], last: Caught): void => {
    expect(poses.length).toBeGreaterThan(8);
    let before = last;
    for (const held of poses) {
      // Over the edge nose first, on out and down, losing some of the light, and no other way.
      expect(held.heading).toBe(0);
      expect(held.x).toBe(last.x);
      expect(held.tilt).toBeGreaterThanOrEqual(before.tilt - 1e-12);
      expect(held.height).toBeLessThanOrEqual(before.height + 1e-9);
      expect(held.depth).toBeGreaterThanOrEqual(before.depth - 1e-9);
      expect(held.depth).toBeGreaterThan(front + CATCHER.foot.out);
      expect(held.light).toBeLessThanOrEqual(before.light);
      expect(held.light).toBeGreaterThanOrEqual(0.5);
      before = held;
    }
    // It ends on its edge, or nearly, and wholly under the level the lower table's medals lie on: gone.
    expect(before.tilt).toBeGreaterThan(1.1);
    expect(before.tilt).toBeLessThan(Math.PI / 2);
    expect(before.height + R).toBeLessThan(0.3);
  };

  it('comes off the lip on to the slide lying flat with its face up, slides to its slot, and goes into it nose first, down the throat, losing the light', () => {
    const x = pocket + CHECKERS.halfWidth * 0.9;
    const mouth = mouthSpot(1, time);
    const poses = walk(x);
    const [first] = poses;
    // In the step it comes over, its middle is on the lip's edge where it was the moment before, at the height it lay at, level.
    expect(first).toMatchObject({ x, depth: front, light: 1, chucker: 1, near: -1, tilt: 0, heading: 0, leg: 'slide' });
    expect(first.height).toBeCloseTo(P + T / 2, 12);
    // On the slide, and then into the slot: never back out of it.
    expect(legs(poses)).toEqual(['slide', 'slot']);
    let last = first;
    for (const held of poses) {
      expect(held.chucker).toBe(1);
      expect(held.near).toBe(-1);
      // Tipped forward only, with the slide, and never back; in toward the middle of the slot across; down, never up; darker, never lighter.
      expect(held.heading).toBe(0);
      expect(held.tilt).toBeGreaterThanOrEqual(last.tilt - 1e-12);
      expect(Math.abs(held.x - mouth.x)).toBeLessThanOrEqual(Math.abs(last.x - mouth.x) + 1e-12);
      expect(held.height).toBeLessThanOrEqual(last.height + 1e-12);
      expect(held.light).toBeLessThanOrEqual(last.light);
      expect(onSlide(held, time).down).toBeGreaterThanOrEqual(onSlide(last, time).down - 1e-9);
      if (held.leg === 'slide') {
        // Lying on the slide, in full light, tipping on to it as it comes off the lip and leaning with it from then on.
        expect(held.light).toBe(1);
        expect(held.tilt).toBeLessThanOrEqual(SLOPE.angle + 1e-12);
        if (onSlide(held, time).down > R / 2) lying(held);
      } else {
        // In the slot: in the middle of it across, its middle inside the opening, its nose dipped under the slide and going further under.
        expect(held.x).toBe(mouth.x);
        expect(held.tilt).toBeGreaterThanOrEqual(SLOPE.angle);
        expect(onSlide(held, time).down).toBeGreaterThan(CATCHER.back);
        expect(onSlide(held, time).down).toBeLessThan(CATCHER.back + START_SLOT.long);
        expect(onSlide(held, time).clear).toBeLessThanOrEqual(onSlide(last, time).clear + 1e-9);
        expect(Math.abs(held.x - mouth.x) + R).toBeLessThan(slotHalf());
      }
      last = held;
    }
    // It is on the slide, lying flat in full view, for a good part of the time, and in the slot for more.
    const sliding = poses.filter((held) => held.leg === 'slide');
    expect(sliding.length * FINE * 60).toBeGreaterThan(8);
    expect(sliding[sliding.length - 1].tilt).toBeCloseTo(SLOPE.angle, 12);
    expect((poses.length - sliding.length) * FINE * 60).toBeGreaterThan(12);
    // It is seen for as long as the catcher says: half a second or so, where the old drop to the table was a fifth of one.
    expect(poses.length * FINE).toBeCloseTo(CATCHER.sink, 2);
    expect(CATCHER.sink).toBeGreaterThanOrEqual(0.4);
    expect(CATCHER.sink).toBeLessThanOrEqual(0.6);
    expect(CATCHER.sink).toBeGreaterThan(CHUCKERS.drop * 1.5);
    // By the end it is well tipped, nose down; the whole of it, tail and all, is under the slide; and it is all but dark.
    expect(last.tilt - SLOPE.angle).toBeGreaterThan(0.6);
    expect(last.tilt).toBeLessThan(Math.PI / 2);
    expect(onSlide(last, time).clear + R * Math.sin(last.tilt - SLOPE.angle)).toBeLessThan(0);
    expect(last.light).toBeLessThan(0.3);
    expect(last.light).toBeGreaterThan(0);
    // After that it lies where the engine has it, under the catcher, and is shown there like any medal.
    expect(caught(over(x, front + R, CATCHER.sink), time)).toBeNull();
    expect(underCatcher(x, front + R, R, time)).toBe(true);
    // It goes down the same with motion reduced: only the rattle of a near miss is left out.
    expect(walk(x, true)).toEqual(poses);
  });

  it('goes down a slot whose wings are open from further to the side than it could with them folded', () => {
    for (const side of [-1, 1]) {
      // Between the two widths: too far off to fit the slot as it is, and inside it once the wings are open.
      const x = pocket + side * (CHECKERS.halfWidth + CHECKERS.wingWidth) * 0.5;
      const medal = over(x, front + R, CATCHER.sink / 2);
      expect(droppedThrough(medal, CATCHER.sink)).toBe(-1);
      expect(droppedThrough(medal, CATCHER.sink, true)).toBe(1);
      expect(caught(medal, time)?.chucker).toBe(-1);
      const open = walk(x, false, true);
      expect(legs(open)).toEqual(['slide', 'slot']);
      for (const held of open) expect(held).toMatchObject({ chucker: 1, near: -1 });
      // And it is inside the wider opening as it goes in: clear of the sides of it.
      for (const held of open) if (held.leg === 'slot') expect(Math.abs(held.x - pocket) + R).toBeLessThan(slotHalf(true));
      // Just past the wider width it does not fit even so.
      expect(caught(over(pocket + side * (CHECKERS.wingWidth + 0.05), front, 0), time, false, true)?.chucker).toBe(-1);
    }
  });

  it('catches the frame of a slot it came over a little to one side of: it slides to it, rattles on it less and less, sliding away from the slot, and then slides on down beside the slot and off the foot', () => {
    // A slot can be caught from no further off than leaves a medal between two slots clear of both.
    expect(CATCHER.reach).toBeGreaterThan(0);
    expect(CHECKERS.halfWidth + CATCHER.reach).toBeLessThan(CATCHER.tile / 2);
    expect(CATCHER.rattle).toBeGreaterThan(CATCHER.slide);
    for (const side of [-1, 1]) {
      for (const beyond of [0.05, CATCHER.reach / 2, CATCHER.reach - 0.05]) {
        const x = pocket + side * (CHECKERS.halfWidth + beyond);
        expect(droppedThrough(over(x, front, 0))).toBe(-1);
        expect(grazed(over(x, front, 0), CATCHER.rattle, CATCHER.reach)).toBe(1);
        const poses = walk(x);
        const [first] = poses;
        // In the step it comes over it is on the lip's edge, level, where it came over: bound for the frame, not the slot.
        expect(first).toMatchObject({ x, depth: front, chucker: -1, near: 1, heading: 0, tilt: 0, light: 1, leg: 'slide' });
        expect(first.height).toBeCloseTo(P + T / 2, 12);
        for (const held of poses) expect(held).toMatchObject({ chucker: -1, near: 1 });
        // Down the slide to the frame, on the frame, on down the slide, and off the foot, in that order.
        expect(legs(poses)).toEqual(['slide', 'frame', 'slide', 'foot']);
        const reached = poses.findIndex((held) => held.leg === 'frame');
        const freed = poses.findIndex((held, at) => at > reached && held.leg !== 'frame');
        const gone = poses.findIndex((held) => held.leg === 'foot');
        const rocking = poses.slice(reached, freed);
        // It gets to the frame quickly, beside the upper end of the opening, where it came over.
        expect(reached * FINE).toBeLessThan(CATCHER.rattle / 4);
        for (const held of poses.slice(0, reached)) expect(held.x).toBe(x);
        // On the frame it is beside the opening, riding on the frame or just off it, in full light, and it slides away from the slot, never back toward it.
        const sways: number[] = [];
        let last = poses[reached - 1];
        for (const held of rocking) {
          expect(held.light).toBe(1);
          expect(onSlide(held, time).down).toBeGreaterThan(CATCHER.back);
          expect(onSlide(held, time).down).toBeLessThan(CATCHER.back + START_SLOT.long);
          expect(onSlide(held, time).down).toBeGreaterThanOrEqual(onSlide(last, time).down - 1e-9);
          expect(onSlide(held, time).clear).toBeGreaterThan(T / 2 - 0.05);
          expect(onSlide(held, time).clear).toBeLessThanOrEqual(T / 2 + CATCHER.rim.high + 1e-9);
          expect((held.x - pocket) * side).toBeGreaterThanOrEqual((last.x - pocket) * side - 1e-12);
          // It still leans forward with the slide, or nearly; what changes is how far it is rocked to one side or the other.
          expect(Math.cos(held.heading) * Math.sin(held.tilt)).toBeGreaterThan(SIN * 0.85);
          expect(Math.cos(held.heading) * Math.sin(held.tilt)).toBeLessThanOrEqual(SIN + 1e-12);
          sways.push(Math.sin(held.heading) * Math.sin(held.tilt));
          last = held;
        }
        expect((last.x - pocket) * side).toBeGreaterThan((x - pocket) * side + 0.5);
        // It rocks both ways, several times, each rock smaller than the one before, and never far: it is a rattle, not a tumble.
        const turns = sways.filter((sway, at) => at > 0 && sway * sways[at - 1] < 0).length;
        expect(turns).toBeGreaterThanOrEqual(4);
        const third = Math.floor(sways.length / 3);
        const swing = (from: number, to: number) => Math.max(...sways.slice(from, to).map(Math.abs));
        expect(swing(0, third)).toBeGreaterThan(swing(third, third * 2));
        expect(swing(third, third * 2)).toBeGreaterThan(swing(third * 2, sways.length));
        expect(swing(0, sways.length)).toBeLessThan(Math.sin(Math.PI / 6));
        expect(swing(0, sways.length)).toBeGreaterThan(Math.sin(0.2));
        expect(Math.abs(sways[sways.length - 1])).toBeLessThan(0.05);
        // It is seen rattling for a good many frames.
        expect(rocking.length * FINE * 60).toBeGreaterThan(15);
        // Then it lies on the slide again and slides on down it to the foot, as far from the slot as it had slid and no nearer.
        const beside = poses[freed].x;
        expect((beside - pocket) * side).toBeGreaterThanOrEqual((last.x - pocket) * side - 1e-12);
        for (const held of poses.slice(freed, gone)) {
          lying(held);
          expect(held.x).toBe(beside);
          expect(onSlide(held, time).down).toBeGreaterThanOrEqual(onSlide(last, time).down - 1e-9);
          last = held;
        }
        expect(onSlide(last, time).down).toBeGreaterThan(SLOPE.long - 0.5);
        expect(onSlide(last, time).down).toBeLessThanOrEqual(SLOPE.long + 1e-9);
        offTheFoot(poses.slice(gone), last);
        // After that it lies where the engine has it, under the catcher.
        expect(poses.length * FINE).toBeCloseTo(CATCHER.rattle, 2);
        expect(caught(over(x, front + R, CATCHER.rattle), time)).toBeNull();
      }
    }
  });

  it('does not rattle with motion reduced: a near miss slides straight down the slide and off its foot, as one between the slots does', () => {
    for (const side of [-1, 1]) {
      const x = pocket + side * (CHECKERS.halfWidth + CATCHER.reach / 2);
      const calm = walk(x, true);
      // Never on a frame, never rocked sideways, and where it came over all the way down.
      expect(legs(calm)).toEqual(['slide', 'foot']);
      for (const held of calm) expect(held).toMatchObject({ x, chucker: -1, near: -1, heading: 0 });
      // It is gone in the time a medal takes to slide down, not in the longer time a rattle takes.
      expect(calm.length * FINE).toBeCloseTo(CATCHER.slide, 2);
      expect(caught(over(x, front + R, CATCHER.slide), time, true)).toBeNull();
      expect(caught(over(x, front + R, CATCHER.slide), time)?.near).toBe(1);
      // With motion it is on the frame a moment after it comes over.
      expect(walk(x).some((held) => held.leg === 'frame')).toBe(true);
    }
  });

  it('catches a frame from the wider width while the wings are open', () => {
    for (const side of [-1, 1]) {
      // Past where a slot with folded wings can be caught, and within reach of one whose wings are open.
      const x = pocket + side * (CHECKERS.halfWidth + CATCHER.reach + (CHECKERS.wingWidth - CHECKERS.halfWidth) / 2);
      expect(caught(over(x, front, 0), time)?.near).toBe(-1);
      expect(legs(walk(x))).toEqual(['slide', 'foot']);
      expect(caught(over(x, front, 0), time, false, true)).toMatchObject({ chucker: -1, near: 1 });
      expect(legs(walk(x, false, true))).toEqual(['slide', 'frame', 'slide', 'foot']);
      // And past that reach too it slides straight down whatever the wings do.
      const far = pocket + side * (CHECKERS.wingWidth + CATCHER.reach + 0.05);
      expect(caught(over(far, front, 0), time, false, true)).toMatchObject({ chucker: -1, near: -1 });
      expect(legs(walk(far, false, true))).toEqual(['slide', 'foot']);
    }
  });

  it('slides the length of the slide and off its foot when it comes over between the slots', () => {
    for (const x of [(CHECKERS.positions[0] + CHECKERS.positions[1]) / 2, pocket + CHECKERS.halfWidth + CATCHER.reach + 0.4, CATCHER.from + R + 0.1, CATCHER.to - R - 0.1]) {
      expect(droppedThrough(over(x, front, 0))).toBe(-1);
      expect(grazed(over(x, front, 0), CATCHER.rattle, CATCHER.reach)).toBe(-1);
      const poses = walk(x);
      const [first] = poses;
      // Through no slot and on no frame; where it came over, at the height it lay at.
      expect(first).toMatchObject({ x, depth: front, chucker: -1, near: -1, heading: 0, tilt: 0, light: 1, leg: 'slide' });
      expect(first.height).toBeCloseTo(P + T / 2, 12);
      for (const held of poses) expect(held).toMatchObject({ x, chucker: -1, near: -1, heading: 0 });
      expect(legs(poses)).toEqual(['slide', 'foot']);
      const gone = poses.findIndex((held) => held.leg === 'foot');
      // It tips on to the slide as it comes off the lip, and then lies on it all the way down, faster and faster, to the foot.
      let last = first;
      let pace = 0;
      for (const held of poses.slice(1, gone)) {
        const moved = onSlide(held, time).down - onSlide(last, time).down;
        expect(moved).toBeGreaterThan(0);
        expect(held.tilt).toBeGreaterThanOrEqual(last.tilt - 1e-12);
        if (onSlide(last, time).down > R / 2) {
          lying(held);
          expect(moved).toBeGreaterThanOrEqual(pace - 1e-9);
          pace = moved;
        }
        last = held;
      }
      expect(onSlide(last, time).down).toBeGreaterThan(SLOPE.long - 0.5);
      expect(onSlide(last, time).down).toBeLessThanOrEqual(SLOPE.long + 1e-9);
      // It is seen on the slide for a third of a second or more: twenty frames and over.
      expect(gone * FINE * 60).toBeGreaterThan(20);
      offTheFoot(poses.slice(gone), last);
      // It is down in the time the catcher says, and then lies where the engine has it.
      expect(poses.length * FINE).toBeCloseTo(CATCHER.slide, 2);
      expect(CATCHER.slide).toBeGreaterThanOrEqual(0.4);
      expect(CATCHER.slide).toBeLessThanOrEqual(0.6);
      expect(caught(over(x, front + R, CATCHER.slide), time)).toBeNull();
    }
  });

  it('does not change its mind when the pile shoves the medal about on the lower table: it comes down from where it came over', () => {
    const between = (CHECKERS.positions[1] + CHECKERS.positions[2]) / 2;
    const beside = pocket + CHECKERS.halfWidth + CATCHER.reach / 2;
    for (const [came, pushed] of [
      [pocket + CHECKERS.halfWidth * 0.5, between],
      [beside, pocket],
      [between, pocket],
    ]) {
      // The catcher is asked about it in the step it comes over.
      const medal = over(came, front, 0);
      const first = caught(medal, time);
      if (!first) throw new Error('not caught');
      for (const sinceDrop of [0.1, 0.25, 0.4]) {
        // The engine has it on the lower table, where the pile pushes it off to where another kind of medal would have come over.
        medal.sinceDrop = sinceDrop;
        medal.x = pushed;
        medal.y = front + R + 1;
        const later = caught(medal, time);
        // It is shown as one that came over where it did would be, and still for the slot, the frame or the foot it was for.
        expect(later).toEqual(caught(over(came, front + R, sinceDrop), time));
        expect(later).toMatchObject({ chucker: first.chucker, near: first.near });
        // A medal that did come over there is another matter.
        expect(caught(over(pushed, front + R, sinceDrop), time)).not.toMatchObject({ chucker: first.chucker, near: first.near });
      }
    }
    // The same with a ball: it rolls straight down from where it came over.
    const ball = over(pocket, front, 0, { ball: true });
    expect(rolling(ball, BALL_RADIUS, time)?.x).toBe(pocket);
    ball.sinceDrop = 0.2;
    ball.x = pocket + 6;
    expect(rolling(ball, BALL_RADIUS, time)).toEqual(rolling(over(pocket, front + R, 0.2, { ball: true }), BALL_RADIUS, time));
  });

  it('is left alone beside the catcher, and so is everything that is not a medal coming over the lip', () => {
    // Past either end of the catcher, or hanging past it: it falls where the engine has it, in full view.
    for (const x of [10, 90, CATCHER.from - 0.5, CATCHER.from + R - 0.1, CATCHER.to - R + 0.1, CATCHER.to + 2]) expect(caught(over(x, front + R, 0.05), time)).toBeNull();
    // A ball, a medal still on the pusher, one that never came over the lip.
    expect(caught(over(pocket, front + R, 0.05, { ball: true }), time)).toBeNull();
    expect(caught(over(pocket, front - 2, -1, { level: 1 }), time)).toBeNull();
    expect(caught(over(pocket, front + 20, -1), time)).toBeNull();
    expect(caught(over(50, 70, 3), time)).toBeNull();
  });

  it('agrees with the machine: every medal the engine counts through a pocket is shown going down that slot', () => {
    const machine = createMachine(11);
    let counted = 0;
    let beside = 0;
    for (let frame = 0; frame < 60 * 40 && counted < 6; frame++) {
      if (frame % 9 === 0) dropAt(machine, 50 + 9 * Math.sin(frame / 50));
      const events = step(machine, 1 / 60);
      const fresh = machine.medals.filter((medal) => medal.level === 0 && medal.sinceDrop === 0 && !medal.ball);
      const shown = fresh.map((medal) => caught(medal, machine.time));
      expect(shown.filter((held) => held && held.chucker >= 0).map((held) => held?.chucker).sort()).toEqual([...events.checkers].sort());
      counted += events.checkers.length;
      beside += shown.filter((held) => held && held.chucker < 0).length;
      // One that is shown bound for a frame was not counted: it is on the frame of a slot it did not go down.
      for (const held of shown) if (held && held.near >= 0) expect(held.chucker).toBe(-1);
      // Whatever the catcher has is on its slide, in a slot of it, or just off its foot: never far out in front of it.
      for (const medal of machine.medals) {
        const held = caught(medal, machine.time);
        if (held) expect(held.depth).toBeLessThan(pusherFront(machine.time) + CATCHER.foot.out + R);
      }
    }
    expect(counted).toBeGreaterThanOrEqual(6);
    expect(beside).toBeGreaterThan(0);
  });

  it('agrees with the machine while the wings are open too: what the wider rule counts is shown going down a slot', () => {
    for (const side of [-1, 1]) {
      for (const open of [false, true]) {
        // A medal lying on the pusher just short of the lip, further to one side of a slot than fits it with its wings folded.
        const machine = createMachine(11);
        machine.time = time;
        const medal: Medal = over(pocket + side * (CHECKERS.halfWidth + CHECKERS.wingWidth) * 0.5, front + 0.5, -1, { level: 1 });
        machine.medals = [medal];
        const events = step(machine, 1 / 60, open);
        expect(medal.level).toBe(0);
        expect(medal.sinceDrop).toBe(0);
        // The engine counts it only while the wings are open, and it is shown bound for the slot only then; otherwise it is bound for the frame.
        expect(events.checkers).toEqual(open ? [1] : []);
        const held = caught(medal, machine.time, false, open);
        expect(held?.chucker).toBe(open ? 1 : -1);
        expect(held?.near).toBe(open ? -1 : 1);
      }
    }
  });
});

describe('a prize ball that comes over the lip at the catcher', () => {
  const time = 1.3;
  const front = pusherFront(time);
  const r = BALL_RADIUS;
  const ball = (x: number, sinceDrop: number, more: Partial<Medal> = {}): Medal => over(x, front + R, sinceDrop, { ball: true, ...more });

  it('rolls down the slide, which no slot of takes it, off its foot and down on to the lower table in front of it', () => {
    for (const x of [CHECKERS.positions[1], CHECKERS.positions[0] + 2, CATCHER.to - r - 0.1]) {
      const first = rolling(ball(x, 0), r, time);
      if (!first) throw new Error('not rolling');
      // In the step it comes over, it stands on the lip's edge at the height it stood at on the pusher.
      expect(first.x).toBe(x);
      expect(first.depth).toBeCloseTo(front, 9);
      expect(first.height).toBeCloseTo(P + r, 9);
      let last = first;
      let onIt = 0;
      let off = 0;
      for (let sinceDrop = 1 / 240; sinceDrop < CATCHER.slide; sinceDrop += 1 / 240) {
        const at = rolling(ball(x, sinceDrop), r, time);
        if (!at) throw new Error('not rolling');
        // Straight down the field, out and down, never back and never up; never a slot's, wherever across it came over.
        expect(at.x).toBe(x);
        expect(at.depth).toBeGreaterThanOrEqual(last.depth - 1e-9);
        expect(at.height).toBeLessThanOrEqual(last.height + 1e-9);
        const { down, clear } = onSlide(at, time);
        if (at.depth <= slopeSpot(x, SLOPE.long, time, r).depth + 1e-9) {
          // On the slide: once it is off the lip it stands on it, its middle its own radius clear of it.
          if (down > r / 2) expect(clear).toBeCloseTo(r, 9);
          expect(clear).toBeGreaterThan(r - 1e-9);
          onIt++;
        } else {
          // Off the foot: out in front of it, coming down to stand on the lower table.
          expect(at.depth).toBeGreaterThan(front + CATCHER.foot.out);
          expect(at.height).toBeGreaterThanOrEqual(r - 1e-9);
          off++;
        }
        last = at;
      }
      // Most of the time is the roll down the slide; the rest is the drop off its foot, which ends on the table in front of the catcher.
      expect(onIt).toBeGreaterThan(off * 2);
      expect(off).toBeGreaterThan(10);
      expect(last.height).toBeCloseTo(r, 1);
      expect(last.depth - r).toBeLessThan(front + CATCHER.foot.out);
      // After that it is where the engine has it: under the catcher, where the hood hides it.
      expect(rolling(ball(x, CATCHER.slide), r, time)).toBeNull();
      expect(underCatcher(x, front + R, r, time)).toBe(true);
    }
  });

  it('is shown where the engine has it when it is not coming down the slide', () => {
    const pocket = CHECKERS.positions[1];
    // A medal is the catcher's another way; a ball is never a medal's.
    expect(rolling(over(pocket, front + R, 0.05), r, time)).toBeNull();
    expect(caught(ball(pocket, 0.05), time)).toBeNull();
    // A ball still on the pusher, one that never came over the lip, and one that hangs past an end of the catcher or came over beside it.
    expect(rolling(ball(pocket, -1, { level: 1 }), r, time)).toBeNull();
    expect(rolling(ball(pocket, -1), r, time)).toBeNull();
    expect(rolling(ball(CATCHER.from + r - 0.1, 0.05), r, time)).toBeNull();
    expect(rolling(ball(CATCHER.to - r + 0.1, 0.05), r, time)).toBeNull();
    expect(rolling(ball(10, 0.05), r, time)).toBeNull();
    expect(rolling(ball(pocket, 0.05), r, time)).not.toBeNull();
  });
});
