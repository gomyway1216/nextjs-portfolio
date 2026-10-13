import { describe, expect, it } from 'vitest';

import type { Spot } from '@/components/game/MedalPusher/arms';
import {
  APRON,
  CATCHER,
  SLOPE,
  START_SLOT,
  TONGUE,
  apronSpot,
  caught,
  clearOfFoot,
  lampSpot,
  litSlots,
  mouthOnDrawing,
  mouthSpot,
  mouthSpots,
  rolling,
  slopeSpot,
  slotCorners,
  slotHalf,
  tongueCorners,
  tongueHalf,
  underCatcher,
  wellCorners,
  wingCorners,
  type Caught,
  type Rolled,
} from '@/components/game/MedalPusher/catcher';
import { CHUCKERS, chuckerSpot, droppedThrough, grazed } from '@/components/game/MedalPusher/chuckers';
import { CHECKERS, FIELD, JEWEL_DROP, LUCKY, MEDAL_RADIUS, MEDAL_THICKNESS, PUSHER, createMachine, luckySlot, pusherFront, slotWidthAt, step, type Medal } from '@/components/game/MedalPusher/engine';
import { APRON_CAP, BALL_RADIUS, SLOT_SHAPE } from '@/components/game/MedalPusher/render';
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
/** Where a spot of the cabinet is against the catcher's top at `time`: how far down it from the lip, and how far clear of it, square to it. */
const onSlide = (spot: Spot, time: number): { down: number; clear: number } => {
  const out = spot.depth - pusherFront(time);
  const up = spot.height - CATCHER.deck;
  return { down: out * COS - up * SIN, clear: up * COS + out * SIN };
};
const seen = (spot: Spot) => project(spot.x, spot.height, spot.depth);
/** Points all over a medal that is held tipped: its middle, and rings of them out to its rim. They are the ones `attitude` in mat4.ts would put there. */
const pointsOf = (held: Caught): Spot[] => {
  const [ch, sh, ct, st] = [Math.cos(held.heading), Math.sin(held.heading), Math.cos(held.tilt), Math.sin(held.tilt)];
  const points: Spot[] = [{ x: held.x, height: held.height, depth: held.depth }];
  for (const ring of [0.25, 0.5, 0.75, 1]) {
    for (let i = 0; i < 48; i++) {
      const u = Math.cos((i / 48) * Math.PI * 2) * ring * R;
      const v = Math.sin((i / 48) * Math.PI * 2) * ring * R;
      points.push({ x: held.x + ch * u - ct * sh * v, height: held.height - st * v, depth: held.depth + sh * u + ct * ch * v });
    }
  }
  return points;
};
/** How far down the catcher's top the furthest part of a medal is that is over the top and not under it: where its nose is, as long as its nose is in the open. */
const reachOver = (held: Caught, time: number): number => Math.max(-Infinity, ...pointsOf(held).map((point) => onSlide(point, time)).filter(({ clear }) => clear >= 0).map(({ down }) => down));

describe('the catcher for the START slots', () => {
  it('is a box hung on the front of the pusher: a well under the lip, and beyond it a slide that leans down toward the player to a foot clear of the lower table', () => {
    // From just under the edge of the pusher's top, so a medal that comes over the lip is above it.
    expect(CATCHER.deck).toBeLessThan(P);
    expect(CATCHER.deck).toBeGreaterThan(P - 1);
    // Down to a foot that two medals deep, and one more on its way down onto them, pass under.
    expect(CATCHER.foot.height).toBeGreaterThan(T * 2.5);
    expect(CATCHER.foot.height).toBeLessThan(CATCHER.deck);
    // The foot never reaches the open sides, and where the hatch throws a jewel is clear of it wherever the pusher is.
    expect(PUSHER.max + CATCHER.foot.out).toBeLessThan(FIELD.sideOpenFrom);
    expect(PUSHER.max + CATCHER.foot.out).toBeLessThan(JEWEL_DROP.near - R);
    // Its lean and its length are those of the line from the lip to the foot.
    expect(SLOPE.angle).toBeCloseTo(Math.atan2(CATCHER.deck - CATCHER.foot.height, CATCHER.foot.out), 12);
    expect(SLOPE.long).toBeCloseTo(Math.hypot(CATCHER.deck - CATCHER.foot.height, CATCHER.foot.out), 12);
    // It is a slope and not a shelf: it leans by a good ten degrees. It is no steeper than leaves it room for a well, a slot and a word.
    expect(SLOPE.angle).toBeGreaterThan((10 * Math.PI) / 180);
    expect(SLOPE.angle).toBeLessThan((50 * Math.PI) / 180);
    expect(SLOPE.long).toBeGreaterThan(WORDS_FROM + APRON_CAP);
    // The well is the first of it: a little longer than a medal is across, and no more. A medal that lies flat with
    // its tail still on the lip has its nose short of the slide, so nothing is carried on to the slots that a
    // tongue does not carry. Past it are the upper bar of the frames and then the openings.
    expect(CATCHER.gap).toBeGreaterThan(R * 2);
    expect(CATCHER.gap).toBeLessThan(R * 2 + 0.5);
    expect(CATCHER.back).toBeCloseTo(CATCHER.gap + CATCHER.rim.wide, 12);
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
      // The well's mouth: along the lip from one end of the catcher to the other, and out to the upper edge of the slide.
      const well = wellCorners(time);
      expect(well).toEqual([slopeSpot(CATCHER.from, 0, time), slopeSpot(CATCHER.to, 0, time), slopeSpot(CATCHER.to, CATCHER.gap, time), slopeSpot(CATCHER.from, CATCHER.gap, time)]);
      // Leaning toward the player, it is seen more nearly square on than a level board there would be: a unit down it is longer on the drawing.
      const middle = slopeSpot(50, SLOPE.long / 2, time);
      const down = seen(slopeSpot(50, SLOPE.long / 2 + 1, time)).y - seen(middle).y;
      const level = project(50, middle.height, middle.depth + 1).y - seen(middle).y;
      expect(down).toBeGreaterThan(level * 1.15);
      // And from where the player sits all of it is seen: the line of sight to it comes down on its upper side.
      const sight = { height: EYE_AT.height - middle.height, depth: EYE_AT.depth - middle.depth };
      expect(sight.height * COS + sight.depth * SIN).toBeGreaterThan(0);
      // The well is as much of the picture as a medal: twelve pixels of a phone's screen from the lip to the slide, or more.
      expect((seen(well[3]).y - seen(well[0]).y) * PHONE).toBeGreaterThan(12);
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
    // A frame is narrow beside the medal it frames, and stands out of the slide by less than a medal is thick.
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
        // The whole of it, frame and all, is on the slide: past the well, and above the strip with the words.
        expect(CATCHER.back - CATCHER.rim.wide).toBeCloseTo(CATCHER.gap, 12);
        expect(WORDS_FROM).toBeLessThan(SLOPE.long);
        // Its lamp is on the lower bar of its frame, in the middle, standing a little out of it; it is a small one.
        const lamp = lampSpot(chucker, time);
        expect(lamp.x).toBe(spot.x);
        expect(onSlide(lamp, time).down).toBeGreaterThan(CATCHER.back + START_SLOT.long);
        expect(onSlide(lamp, time).down).toBeLessThan(WORDS_FROM);
        expect(onSlide(lamp, time).clear).toBeGreaterThan(CATCHER.rim.high);
        expect(onSlide(lamp, time).clear).toBeLessThan(CATCHER.rim.high + START_SLOT.lamp.radius);
        expect(START_SLOT.lamp.radius * 2).toBeLessThan(slotHalf());
        // Small, but a mark of the slot that is seen on a phone: four pixels across or more while it waits, and five
        // while it is lit, which is when it is a quarter bigger. It is wider than the bar it is on, and laps the lower
        // end of the opening and the top of the strip of words under it.
        expect(START_SLOT.lamp.radius * 2 * seen(lamp).scale * PHONE).toBeGreaterThanOrEqual(4);
        expect(START_SLOT.lamp.radius * 2 * 1.25 * seen(lamp).scale * PHONE).toBeGreaterThanOrEqual(5);
        expect(START_SLOT.lamp.radius * 2).toBeGreaterThan(CATCHER.rim.wide);
        expect(START_SLOT.lamp.radius).toBeLessThan(START_SLOT.long / 4);
        // Under it, a throat with depth: its floor is more than a medal's thickness under the lower end of the opening, and several under the upper.
        expect(corners[2].height - CATCHER.throat).toBeGreaterThan(T);
        expect(corners[0].height - CATCHER.throat).toBeGreaterThan(T * 2.5);
        expect(CATCHER.throat).toBeGreaterThanOrEqual(CATCHER.foot.height);
      });
    }
    for (const chucker of [-1, 3, 0.5, Number.NaN]) expect(() => mouthSpot(chucker, 0)).toThrow();
  });

  it('has a tongue to each slot, the only way over the well: a bridge from the lip to the opening, as wide as the play a medal has in the slot', () => {
    // As wide as the rule lets a medal's middle be off the slot's, to either side. So a medal's middle is over it
    // exactly when the rule counts the medal, and a medal that is on it fits the slot at the end of it whole.
    expect(tongueHalf()).toBe(CHECKERS.halfWidth);
    expect(tongueHalf(false)).toBe(tongueHalf());
    expect(tongueHalf(true)).toBe(CHECKERS.wingWidth);
    expect(tongueHalf() * 2).toBeCloseTo(slotHalf() * 2 - R * 2, 12);
    expect(tongueHalf(true) * 2).toBeCloseTo(slotHalf(true) * 2 - R * 2, 12);
    expect(tongueHalf() + R).toBeCloseTo(slotHalf(), 12);
    // It is a good deal narrower than a medal, which rides it with a side out over the well to either hand; and there
    // is far more open well between two tongues than a medal is across.
    expect(tongueHalf(true)).toBeLessThan(R / 2);
    expect(CATCHER.tile - tongueHalf(true) * 2).toBeGreaterThan(R * 3);
    // Its web is deep enough to be seen from the side, and does not hang as low as the catcher's floor.
    expect(TONGUE.deep).toBeGreaterThan(CATCHER.rim.high);
    expect(TONGUE.deep).toBeLessThan(1);
    for (const time of TIMES) {
      const front = pusherFront(time);
      ALL.forEach((chucker) => {
        const { x } = mouthSpot(chucker, time);
        for (const wings of [false, true]) {
          const top = tongueCorners(chucker, time, wings);
          expect(top).toHaveLength(4);
          // Its end at the lip from the left, then its end at the slot from the right: straight out from the pocket, the rule's width to either side.
          [-1, 1, 1, -1].forEach((side, at) => expect(top[at].x - x).toBeCloseTo(side * tongueHalf(wings), 12));
          top.forEach((corner, at) => {
            expect(onSlide(corner, time).down).toBeCloseTo(at < 2 ? 0 : CATCHER.back, 9);
            // Its top is level with the top of the slot's frame, which it runs on to.
            expect(onSlide(corner, time).clear).toBeCloseTo(CATCHER.rim.high, 9);
          });
          // It leaves the lip no lower than a medal's thickness under the pusher's top, and ends exactly at the upper edge of its slot's opening.
          expect(top[0].depth - front).toBeLessThan(0.1);
          expect(P - top[0].height).toBeLessThan(T);
          const opening = slotCorners(chucker, time, wings, 0, CATCHER.rim.high);
          expect(top[3].depth).toBeCloseTo(opening[0].depth, 9);
          expect(top[3].height).toBeCloseTo(opening[0].height, 9);
          // Any other height can be asked for: the foot of its web.
          for (const corner of tongueCorners(chucker, time, wings, CATCHER.rim.high - TONGUE.deep)) expect(onSlide(corner, time).clear).toBeCloseTo(CATCHER.rim.high - TONGUE.deep, 9);
        }
        expect(tongueCorners(chucker, time, false)).toEqual(tongueCorners(chucker, time));
        // On a phone it is five pixels across and thirteen long, or more: a rail, and seen as one.
        const [a, b, , d] = tongueCorners(chucker, time).map(seen);
        expect((b.x - a.x) * PHONE).toBeGreaterThan(5);
        expect((d.y - a.y) * PHONE).toBeGreaterThan(13);
      });
    }
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
          // All of it is on the slide: on the catcher, and none of it over the well.
          for (const corner of [...folded, ...open]) {
            expect(corner.x).toBeGreaterThan(CATCHER.from);
            expect(corner.x).toBeLessThan(CATCHER.to);
            expect(onSlide(corner, time).down).toBeGreaterThanOrEqual(CATCHER.gap - 1e-9);
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

  it('shows each slot on the drawing as an opening wider than it is tall, three side by side, big enough to be seen on a phone and clear of the lip', () => {
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
        expect(mouth.tall).toBeGreaterThan(START_SLOT.long * at.scale * at.tilt * 1.15);
        // On a phone it is twenty-two pixels across and ten down, or more, with its frame outside that.
        expect(mouth.wide * PHONE).toBeGreaterThan(22);
        expect(mouth.tall * PHONE).toBeGreaterThan(10);
        // Down it the floor of its throat is seen, under the foot of the far wall, which is what is black in a slot that
        // waits and gold in the lucky one: twenty pixels of a phone's screen across and five down, or more. Its lamp
        // stands up into the lower end of that by no more than two and a half.
        const throat = slotCorners(chucker, time, false, -SLOT_SHAPE.ring.in, -SLOT_SHAPE.ring.down).map((corner) => project(corner.x, CATCHER.throat, corner.depth));
        expect((throat[1].x - throat[0].x) * PHONE).toBeGreaterThan(20);
        expect((seen(lower).y - throat[0].y) * PHONE).toBeGreaterThan(5);
        const lamp = seen(lampSpot(chucker, time));
        expect((seen(lower).y - (lamp.y - START_SLOT.lamp.radius * lamp.scale)) * PHONE).toBeLessThan(2.5);
        // All of it is on the drawing, in the lower half, below the lip.
        expect(mouth.x - mouth.wide / 2).toBeGreaterThan(0);
        expect(mouth.x + mouth.wide / 2).toBeLessThan(VIEW.width);
        expect(mouth.y - mouth.tall / 2).toBeGreaterThan(project(x, P, pusherFront(time)).y);
        expect(mouth.y + mouth.tall / 2).toBeLessThan(VIEW.height);
        // And it is out from under the heap. A medal on the pusher hangs over the lip by its radius at the most, and
        // one lying on another by as much again in height; the line of sight that grazes the edge of either comes
        // down on the well, a long way short of the opening. The whole of the mouth is past it.
        for (const high of [P + T, P + T * 2 + 1]) {
          const edge = { height: high, depth: pusherFront(time) + R };
          const sight = (EYE_AT.height - edge.height) / (EYE_AT.depth - edge.depth);
          // Where that line meets the catcher's top, out from the lip.
          const out = (edge.height - CATCHER.deck + sight * R) / (sight + SIN / COS);
          expect(out / COS).toBeLessThan(CATCHER.gap - 1);
          expect(out / COS).toBeLessThan(CATCHER.back - 1.5);
        }
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
      expect(unitDown / unitAcross).toBeGreaterThan(0.78);
      // On a level board there it would be seven tenths of that at the most.
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
  /** A step fine enough to follow a medal that rocks several times in half a second. */
  const FINE = 1 / 480;
  /** The legs a medal was on, in the order it was on them, each once. */
  const legs = (poses: Caught[]): Caught['leg'][] => poses.map((pose) => pose.leg).filter((leg, at, all) => at === 0 || leg !== all[at - 1]);
  /** Every pose a medal that came over at `x` is shown in on the catcher, a fine step apart: until it is down a slot or down the well. */
  const walk = (x: number, calm = false, wings = false, more: Partial<Medal> = {}): Caught[] => {
    const poses: Caught[] = [];
    for (let sinceDrop = 0; sinceDrop < 2; sinceDrop += FINE) {
      const held = caught(over(x, sinceDrop === 0 ? front : front + R, sinceDrop, more), time, calm, wings);
      if (!held) break;
      poses.push(held);
    }
    return poses;
  };
  /** That a medal is lying on a tongue: leaning as the catcher leans and no other way, half its thickness clear of the tongue's top, in full light. */
  const lying = (held: Caught): void => {
    expect(held.heading).toBe(0);
    expect(held.tilt).toBeCloseTo(SLOPE.angle, 12);
    expect(onSlide(held, time).clear).toBeCloseTo(CATCHER.rim.high + T / 2, 9);
    expect(held.light).toBe(1);
  };
  /** That no part of a medal that was not counted is over the slide: all of it that is not under the catcher's top is short of the well's edge. */
  const shortOfTheSlide = (held: Caught): void => {
    expect(reachOver(held, time)).toBeLessThan(CATCHER.gap);
  };

  it('comes off the lip on to its tongue lying flat with its face up, rides the length of it out over the well, tips over its end into the slot and goes down the throat, losing the light', () => {
    for (const off of [0, CHECKERS.halfWidth * 0.9, -CHECKERS.halfWidth * 0.9]) {
      const x = pocket + off;
      const poses = walk(x);
      const [first] = poses;
      // In the step it comes over, its middle is on the lip's edge where it was the moment before, at the height it lay at, level.
      expect(first).toMatchObject({ x, depth: front, light: 1, chucker: 1, near: -1, tilt: 0, heading: 0, leg: 'tongue' });
      expect(first.height).toBeCloseTo(P + T / 2, 12);
      // On the tongue, and then into the slot: never back out of it.
      expect(legs(poses)).toEqual(['tongue', 'slot']);
      let last = first;
      let pace = Infinity;
      for (const held of poses) {
        expect(held.chucker).toBe(1);
        expect(held.near).toBe(-1);
        // Tipped forward only, with the catcher, and never back; where across it came over, all the way; down, never up; darker, never lighter.
        expect(held.heading).toBe(0);
        expect(held.tilt).toBeGreaterThanOrEqual(last.tilt - 1e-12);
        expect(held.x).toBe(x);
        expect(held.height).toBeLessThanOrEqual(last.height + 1e-12);
        expect(held.light).toBeLessThanOrEqual(last.light);
        expect(onSlide(held, time).down).toBeGreaterThanOrEqual(onSlide(last, time).down - 1e-9);
        if (held.leg === 'tongue') {
          // Lying on the tongue, in full light, tipping on to it as it comes off the lip and leaning with it from then on.
          expect(held.light).toBe(1);
          expect(held.tilt).toBeLessThanOrEqual(SLOPE.angle + 1e-12);
          // Its middle is over the tongue, which is all that holds it up out there.
          expect(Math.abs(held.x - pocket)).toBeLessThanOrEqual(tongueHalf());
          if (onSlide(last, time).down > R / 2) {
            lying(held);
            // It comes off the lip at the pace it was pushed and loses a little of it on the way: it never hurries.
            const moved = onSlide(held, time).down - onSlide(last, time).down;
            expect(moved).toBeGreaterThan(0);
            expect(moved).toBeLessThanOrEqual(pace + 1e-9);
            pace = moved;
          }
        } else {
          // In the slot: its middle inside the opening, the whole of it clear of the opening's sides, its nose dipped under the slide and going further under.
          expect(held.tilt).toBeGreaterThanOrEqual(SLOPE.angle);
          expect(onSlide(held, time).down).toBeGreaterThan(CATCHER.back);
          expect(onSlide(held, time).down).toBeLessThan(CATCHER.back + START_SLOT.long);
          expect(onSlide(held, time).clear).toBeLessThanOrEqual(onSlide(last, time).clear + 1e-9);
          expect(Math.abs(held.x - pocket) + R).toBeLessThan(slotHalf());
        }
        last = held;
      }
      // It is on the tongue, lying flat in full view, for half a second and more, and going into the slot for a good many frames after that.
      const riding = poses.filter((held) => held.leg === 'tongue');
      expect(riding.length * FINE).toBeCloseTo(CATCHER.sink * CATCHER.ride, 2);
      expect(riding.length * FINE).toBeGreaterThan(0.5);
      expect(riding[riding.length - 1].tilt).toBeCloseTo(SLOPE.angle, 12);
      // It rides to the very end of the tongue: its middle is past the upper edge of the opening as it starts to tip.
      expect(onSlide(riding[riding.length - 1], time).down).toBeGreaterThan(CATCHER.back);
      expect((poses.length - riding.length) * FINE * 60).toBeGreaterThan(12);
      // From the lip to out of sight is what the catcher says: seven to nine tenths of a second, which is long enough to follow.
      expect(poses.length * FINE).toBeCloseTo(CATCHER.sink, 2);
      expect(CATCHER.sink).toBeGreaterThanOrEqual(0.7);
      expect(CATCHER.sink).toBeLessThanOrEqual(0.9);
      expect(CATCHER.sink).toBeGreaterThan(CHUCKERS.drop * 3);
      // By the end it is well tipped, nose down; the whole of it, tail and all, is under the slide; and it is all but dark.
      expect(last.tilt - SLOPE.angle).toBeGreaterThan(0.6);
      expect(last.tilt).toBeLessThan(Math.PI / 2);
      expect(onSlide(last, time).clear + R * Math.sin(last.tilt - SLOPE.angle)).toBeLessThan(0);
      expect(last.light).toBeLessThan(0.3);
      expect(last.light).toBeGreaterThan(0);
      // After that it lies where the engine has it, under the catcher, and is shown there like any medal.
      expect(caught(over(x, front + R, CATCHER.sink), time)).toBeNull();
      expect(underCatcher(x, front + R, R, time)).toBe(true);
    }
  });

  it('is not seen to ride where nothing may move: it lies in the mouth of its slot, still, and goes dark', () => {
    const x = pocket + CHECKERS.halfWidth * 0.5;
    const still = walk(x, true);
    const [first] = still;
    // At the end of its tongue from the first, its middle just past the upper edge of the opening, lying as the tongue lies.
    expect(first).toMatchObject({ x, chucker: 1, near: -1, heading: 0, light: 1, leg: 'tongue' });
    expect(first.tilt).toBeCloseTo(SLOPE.angle, 12);
    expect(onSlide(first, time).down).toBeGreaterThan(CATCHER.back);
    expect(onSlide(first, time).down).toBeLessThan(CATCHER.back + 1);
    expect(onSlide(first, time).clear).toBeCloseTo(CATCHER.rim.high + T / 2, 9);
    let last = first;
    for (const held of still) {
      // It does not move at all. Only the light on it goes.
      expect(held).toMatchObject({ x, height: first.height, depth: first.depth, tilt: first.tilt, heading: 0, chucker: 1, near: -1, leg: 'tongue' });
      expect(held.light).toBeLessThanOrEqual(last.light);
      last = held;
    }
    expect(last.light).toBeLessThan(0.15);
    expect(last.light).toBeGreaterThan(0);
    // For a third of a second, which is a good deal less than the ride it is not seen to take.
    expect(still.length * FINE).toBeCloseTo(CATCHER.still, 2);
    expect(CATCHER.still).toBeLessThan(CATCHER.sink / 2);
    expect(caught(over(x, front + R, CATCHER.still), time, true)).toBeNull();
  });

  it('rides the wider tongue of a slot whose wings are open from further to the side than it could with them folded', () => {
    for (const side of [-1, 1]) {
      // Between the two widths: too far off to be on the tongue as it is, and on it once the wings are open.
      const x = pocket + side * (CHECKERS.halfWidth + CHECKERS.wingWidth) * 0.5;
      const medal = over(x, front + R, CATCHER.sink / 2);
      expect(droppedThrough(medal, CATCHER.sink)).toBe(-1);
      expect(droppedThrough(medal, CATCHER.sink, true)).toBe(1);
      expect(caught(medal, time)?.chucker).toBe(-1);
      const open = walk(x, false, true);
      expect(legs(open)).toEqual(['tongue', 'slot']);
      for (const held of open) expect(held).toMatchObject({ x, chucker: 1, near: -1 });
      // Its middle is over the wider tongue, and it is inside the wider opening as it goes in: clear of the sides of it.
      expect(Math.abs(x - pocket)).toBeLessThanOrEqual(tongueHalf(true));
      for (const held of open) if (held.leg === 'slot') expect(Math.abs(held.x - pocket) + R).toBeLessThan(slotHalf(true));
      // Just past the wider width it is on no tongue even so.
      expect(caught(over(pocket + side * (CHECKERS.wingWidth + 0.05), front, 0), time, false, true)?.chucker).toBe(-1);
    }
  });

  it('hangs on the edge of a tongue it has some of under it and not enough, the longer the nearer it was to fitting, tips off away from the slot and falls into the well on its side', () => {
    // A medal has some of a tongue under it if its middle is within its own radius of the tongue's edge, and no medal has some of two.
    expect(CATCHER.reach).toBe(R);
    expect(CHECKERS.wingWidth + CATCHER.reach).toBeLessThan(CATCHER.tile / 2);
    const { out, least, most } = CATCHER.teeter;
    expect(least).toBeGreaterThan(0);
    expect(most).toBeGreaterThan(least * 3);
    const hung: number[] = [];
    for (const side of [-1, 1]) {
      for (const beyond of [0.05, CATCHER.reach / 2, CATCHER.reach - 0.05]) {
        const x = pocket + side * (CHECKERS.halfWidth + beyond);
        expect(droppedThrough(over(x, front, 0))).toBe(-1);
        expect(grazed(over(x, front, 0), Infinity, CATCHER.reach)).toBe(1);
        const poses = walk(x);
        const [first] = poses;
        // In the step it comes over it is on the lip's edge, level, where it came over: bound for no slot.
        expect(first).toMatchObject({ x, depth: front, chucker: -1, near: 1, heading: 0, tilt: 0, light: 1, leg: 'tongue' });
        expect(first.height).toBeCloseTo(P + T / 2, 12);
        for (const held of poses) expect(held).toMatchObject({ chucker: -1, near: 1 });
        // On the tongue, and then down into the well: it is never on the slide and never in a slot.
        expect(legs(poses)).toEqual(['tongue', 'gap']);
        const gone = poses.findIndex((held) => held.leg === 'gap');
        const on = poses.slice(0, gone);
        // It rides out flat, slowing, until its tail has left the lip, and no further: its nose is still short of the slide.
        const flat = on.filter((held) => held.heading === 0);
        const reached = onSlide(flat[flat.length - 1], time).down;
        expect(reached).toBeGreaterThan(R);
        expect(reached + R).toBeLessThan(CATCHER.gap);
        let last = first;
        let rocked = 0;
        const sways: number[] = [];
        for (const held of on) {
          // Where across it came over, in full light, never further out than that, and never rocked toward the slot.
          expect(held.x).toBe(x);
          expect(held.light).toBe(1);
          expect(onSlide(held, time).down).toBeGreaterThanOrEqual(onSlide(last, time).down - 1e-9);
          expect(onSlide(held, time).down).toBeLessThanOrEqual(reached + 1e-9);
          // How far it is rocked over the tongue's edge: its outer side, the one with nothing under it, is the low one.
          const sway = -Math.sin(held.heading) * Math.sin(held.tilt) * side;
          expect(sway).toBeGreaterThanOrEqual(-1e-12);
          sways.push(sway);
          rocked = Math.max(rocked, sway);
          // Once it has tipped on to the tongue its middle sags with that side, and never rises off the tongue.
          if (onSlide(held, time).down > R / 2) expect(onSlide(held, time).clear).toBeLessThanOrEqual(CATCHER.rim.high + T / 2 + 1e-9);
          shortOfTheSlide(held);
          last = held;
        }
        // By the time it lets go it has rocked well over: more than half way to standing on its edge.
        expect(rocked).toBeGreaterThan(Math.sin(1));
        expect(sways[sways.length - 1]).toBeCloseTo(rocked, 2);
        // The nearest of misses rocks back before it goes: it makes up its mind. One that only clips the tongue goes straight over.
        const backs = sways.filter((sway, at) => at > 1 && sway < sways[at - 1] - 1e-9 && sways[at - 1] >= sways[at - 2]).length;
        if (beyond < 0.1) expect(backs).toBeGreaterThanOrEqual(2);
        if (beyond > CATCHER.reach - 0.1) expect(backs).toBe(0);
        hung.push(on.length * FINE - out);
        // Then it falls: on its side, further from the slot, straight down, and out of the light.
        const falling = poses.slice(gone);
        for (const held of falling) {
          expect((held.x - last.x) * side).toBeGreaterThanOrEqual(-1e-12);
          expect(held.height).toBeLessThan(last.height + 1e-12);
          expect(held.light).toBeLessThanOrEqual(last.light);
          expect(-Math.sin(held.heading) * Math.sin(held.tilt) * side).toBeGreaterThan(Math.sin(1));
          expect(onSlide(held, time).down - onSlide(on[on.length - 1], time).down).toBeLessThan(1.5);
          shortOfTheSlide(held);
          last = held;
        }
        expect((last.x - x) * side).toBeGreaterThan(0.5);
        expect(last.light).toBeLessThan(0.1);
        // It ends wholly under the catcher's floor, where it is the engine's.
        expect(last.height + R).toBeLessThan(CATCHER.foot.height + 0.2);
        expect(falling.length * FINE).toBeCloseTo(CATCHER.fall, 2);
        expect(caught(over(x, front + R, poses.length * FINE + FINE), time)).toBeNull();
      }
    }
    // It hangs the longer the nearer its middle was to the tongue: over half a second for the nearest, and hardly at all for one that only clips it.
    for (const at of [0, 3]) {
      expect(hung[at]).toBeGreaterThan(hung[at + 1]);
      expect(hung[at + 1]).toBeGreaterThan(hung[at + 2]);
      expect(hung[at]).toBeGreaterThan(0.5);
      expect(hung[at]).toBeLessThanOrEqual(most + 0.01);
      expect(hung[at + 2]).toBeLessThan(least + 0.02);
    }
    // The longest any medal is seen at the catcher is such a one: a second and a little more.
    expect(out + most + CATCHER.fall).toBeGreaterThan(CATCHER.sink);
    expect(out + most + CATCHER.fall).toBeLessThan(1.3);
  });

  it('does not hang there with motion reduced: a near miss goes over the lip’s edge nose first, as one clear of the tongues does', () => {
    for (const side of [-1, 1]) {
      const x = pocket + side * (CHECKERS.halfWidth + CATCHER.reach / 2);
      const calm = walk(x, true);
      // Never on a tongue, never rocked sideways, and where it came over all the way down.
      expect(legs(calm)).toEqual(['gap']);
      for (const held of calm) expect(held).toMatchObject({ x, chucker: -1, near: -1, heading: 0 });
      // It is down in the time a medal takes to go into the well, not in the longer time a hang takes.
      expect(calm.length * FINE).toBeCloseTo(CATCHER.fall, 2);
      expect(caught(over(x, front + R, CATCHER.fall), time, true)).toBeNull();
      expect(caught(over(x, front + R, CATCHER.fall), time)).toMatchObject({ leg: 'tongue', near: 1 });
    }
  });

  it('has some of a wider tongue under it while the wings are open', () => {
    for (const side of [-1, 1]) {
      // Past where a tongue with folded wings reaches under a medal, and within reach of one whose wings are open.
      const x = pocket + side * (CHECKERS.halfWidth + CATCHER.reach + (CHECKERS.wingWidth - CHECKERS.halfWidth) / 2);
      expect(caught(over(x, front, 0), time)?.near).toBe(-1);
      expect(legs(walk(x))).toEqual(['gap']);
      expect(caught(over(x, front, 0), time, false, true)).toMatchObject({ chucker: -1, near: 1 });
      expect(legs(walk(x, false, true))).toEqual(['tongue', 'gap']);
      // And past that reach too it goes straight down whatever the wings do.
      const far = pocket + side * (CHECKERS.wingWidth + CATCHER.reach + 0.05);
      expect(caught(over(far, front, 0), time, false, true)).toMatchObject({ chucker: -1, near: -1 });
      expect(legs(walk(far, false, true))).toEqual(['gap']);
    }
  });

  it('goes over the lip’s edge nose first and straight down into the well when it comes over clear of the tongues, and so does a jewel wherever it comes over', () => {
    const clear = [(CHECKERS.positions[0] + CHECKERS.positions[1]) / 2, pocket + CHECKERS.halfWidth + CATCHER.reach + 0.4, pocket - CHECKERS.halfWidth - CATCHER.reach - 0.4, (CHECKERS.positions[1] + CHECKERS.positions[2]) / 2];
    for (const [x, more] of [...clear.map((at): [number, Partial<Medal>] => [at, {}]), [pocket, { jewel: true }] as [number, Partial<Medal>], [pocket + CHECKERS.halfWidth + 0.3, { jewel: true }] as [number, Partial<Medal>]]) {
      expect(droppedThrough(over(x, front, 0, more))).toBe(-1);
      expect(grazed(over(x, front, 0, more), Infinity, CATCHER.reach)).toBe(-1);
      const poses = walk(x, false, false, more);
      const [first] = poses;
      // On no tongue and for no slot; where it came over, at the height it lay at.
      expect(first).toMatchObject({ x, depth: front, chucker: -1, near: -1, heading: 0, tilt: 0, light: 1, leg: 'gap' });
      expect(first.height).toBeCloseTo(P + T / 2, 12);
      expect(legs(poses)).toEqual(['gap']);
      let last = first;
      for (const held of poses) {
        // Straight down the field: it tips about the lip's edge, nose down and never back, and slides off it, lower and darker all the time.
        expect(held).toMatchObject({ x, chucker: -1, near: -1, heading: 0 });
        expect(held.tilt).toBeGreaterThanOrEqual(last.tilt - 1e-12);
        expect(held.height).toBeLessThanOrEqual(last.height + 1e-12);
        expect(held.depth).toBeGreaterThanOrEqual(front - 1e-12);
        expect(held.light).toBeLessThanOrEqual(last.light);
        // The whole of it stays in the well: its nose never reaches the slide.
        expect(held.depth + R * Math.cos(held.tilt)).toBeLessThan(front + CATCHER.gap * COS);
        shortOfTheSlide(held);
        last = held;
      }
      // It ends standing all but on its nose, wholly under the catcher's floor, and all but dark.
      expect(last.tilt).toBeGreaterThan(1.2);
      expect(last.tilt).toBeLessThan(Math.PI / 2);
      expect(last.height + R * Math.sin(last.tilt)).toBeLessThan(CATCHER.foot.height + 0.2);
      expect(last.light).toBeLessThan(0.1);
      // It is down in the time the catcher says, which is a little longer than a medal beside the catcher takes to drop to the table; and then it is the engine's, under the catcher.
      expect(poses.length * FINE).toBeCloseTo(CATCHER.fall, 2);
      expect(CATCHER.fall).toBeGreaterThan(CHUCKERS.drop);
      expect(CATCHER.fall).toBeLessThan(0.4);
      expect(caught(over(x, front + R, CATCHER.fall, more), time)).toBeNull();
      expect(underCatcher(x, front + R, R, time)).toBe(true);
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
      for (const sinceDrop of [0.1, 0.2, 0.28]) {
        // The engine has it on the lower table, where the pile pushes it off to where another kind of medal would have come over.
        medal.sinceDrop = sinceDrop;
        medal.x = pushed;
        medal.y = front + R + 1;
        const later = caught(medal, time);
        // It is shown as one that came over where it did would be, and still for the slot, the tongue's edge or the well it was for.
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

  it('agrees with the machine: every medal the engine counts is shown riding a tongue to that slot, and nothing it does not count is ever over the slide', { timeout: 30_000 }, () => {
    const machine = createMachine(11);
    let counted = 0;
    let beside = 0;
    let hung = 0;
    for (let frame = 0; frame < 60 * 40 && counted < 6; frame++) {
      if (frame % 9 === 0) dropAt(machine, 50 + 9 * Math.sin(frame / 50));
      const events = step(machine, 1 / 60);
      const fresh = machine.medals.filter((medal) => medal.level === 0 && medal.sinceDrop === 0 && !medal.ball);
      const shown = fresh.map((medal) => caught(medal, machine.time));
      expect(shown.filter((held) => held && held.chucker >= 0).map((held) => held?.chucker).sort()).toEqual([...events.checkers].sort());
      counted += events.checkers.length;
      beside += shown.filter((held) => held && held.chucker < 0).length;
      hung += shown.filter((held) => held && held.near >= 0).length;
      // One that has some of a tongue under it and not enough was not counted: it is bound for no slot.
      for (const held of shown) if (held && held.near >= 0) expect(held.chucker).toBe(-1);
      for (const medal of machine.medals) {
        const held = caught(medal, machine.time);
        if (!held) continue;
        // Whatever the catcher has is over the catcher, and nowhere else.
        expect(held.depth).toBeLessThan(pusherFront(machine.time) + CATCHER.foot.out);
        // And the law of it: a medal is over the slide, where the slots are, only if the engine counted it.
        if (held.chucker < 0) expect(reachOver(held, machine.time)).toBeLessThan(CATCHER.gap);
      }
    }
    expect(counted).toBeGreaterThanOrEqual(6);
    expect(beside).toBeGreaterThan(0);
    expect(hung).toBeGreaterThan(0);
  });

  it('agrees with the machine while the wings are open too: what the wider rule counts is shown riding to a slot', () => {
    for (const side of [-1, 1]) {
      for (const open of [false, true]) {
        // A medal lying on the pusher just short of the lip, further to one side of a slot than its tongue reaches with the wings folded.
        const machine = createMachine(11);
        machine.time = time;
        const medal: Medal = over(pocket + side * (CHECKERS.halfWidth + CHECKERS.wingWidth) * 0.5, front + 0.5, -1, { level: 1 });
        machine.medals = [medal];
        const events = step(machine, 1 / 60, open);
        expect(medal.level).toBe(0);
        expect(medal.sinceDrop).toBe(0);
        // The engine counts it only while the wings are open, and it is shown bound for the slot only then; otherwise it hangs on the tongue's edge.
        expect(events.checkers).toEqual(open ? [1] : []);
        const held = caught(medal, machine.time, false, open);
        expect(held?.chucker).toBe(open ? 1 : -1);
        expect(held?.near).toBe(open ? -1 : 1);
      }
    }
  });

  it('keeps what was decided as the medal came over the lip for the whole of its way down, though the wings open or shut meanwhile', () => {
    // Further to one side of a slot than its tongue reaches with the wings folded, and on the tongue with them open.
    const beside = pocket + (CHECKERS.halfWidth + CHECKERS.wingWidth) * 0.5;
    const moments = Array.from({ length: 80 }, (_unused, frame) => (frame + 1) / 60).filter((sinceDrop) => caught(over(beside, front, sinceDrop), time, false, false) !== null);
    expect(moments.length).toBeGreaterThan(50);

    // It came over with the wings folded, so it hangs on the tongue's edge. Chance time begins while it hangs there and
    // the wings open: it is still a medal the tongue did not carry, all the way over the edge and down the well. At
    // no moment is it seen to ride on to the slot.
    const missed = over(beside, front, 0);
    expect(caught(missed, time, false, false)).toMatchObject({ chucker: -1, near: 1 });
    const way: Caught[] = [];
    for (const sinceDrop of moments) {
      missed.sinceDrop = sinceDrop;
      const held = caught(missed, time, false, true);
      if (!held) throw new Error('not caught');
      // It is shown exactly as one that the wings never opened for.
      expect(held).toEqual(caught(over(beside, front, sinceDrop), time, false, false));
      expect(held).toMatchObject({ chucker: -1, near: 1 });
      way.push(held);
    }
    expect(legs(way)).toEqual(['tongue', 'gap']);
    // A medal that comes over there once the wings are open is another matter: it rides to the slot.
    expect(caught(over(beside, front, 0.2), time, false, true)).toMatchObject({ chucker: 1, near: -1 });

    // And the other way about. It came over with the wings open and rode its tongue; chance time ends while it is on
    // its way and the wings shut. It still goes down the slot, and once it is down it is out of sight: it is not
    // seen again, hanging on the edge of a tongue that carried it.
    const taken = over(beside, front, 0);
    expect(caught(taken, time, false, true)).toMatchObject({ chucker: 1, near: -1 });
    for (const sinceDrop of moments) {
      taken.sinceDrop = sinceDrop;
      const held = caught(taken, time, false, false);
      expect(held).toEqual(caught(over(beside, front, sinceDrop), time, false, true));
      if (sinceDrop < CATCHER.sink) expect(held).toMatchObject({ chucker: 1, near: -1 });
      else expect(held).toBeNull();
    }
    // One that comes over there once they are shut hangs on the tongue's edge.
    expect(caught(over(beside, front, 0.2), time, false, false)).toMatchObject({ chucker: -1, near: 1 });
  });

  it('takes the engine’s word for how wide the slots were as the medal came over, whatever it is told of the wings afterwards', () => {
    const beside = pocket + (CHECKERS.halfWidth + CHECKERS.wingWidth) * 0.5;
    for (const open of [false, true]) {
      const machine = createMachine(11);
      machine.time = time;
      const medal = over(beside, front + 0.5, -1, { level: 1 });
      // A medal that has not come over has no such word.
      expect(slotWidthAt(medal)).toBeUndefined();
      machine.medals = [medal];
      const events = step(machine, 1 / 60, open);
      expect(events.checkers).toEqual(open ? [1] : []);
      expect(slotWidthAt(medal)).toBe(open ? CHECKERS.wingWidth : CHECKERS.halfWidth);
      // The cabinet draws once the session has dealt with the step, and by then the wings may stand the other way:
      // the medal that found the hold full has opened them, or the last gold spin has shut them. Asked for the
      // first time with the wings like that, the catcher still shows what was counted.
      const held = caught(medal, machine.time, false, !open);
      expect(held).toMatchObject({ chucker: open ? 1 : -1, near: open ? -1 : 1 });
      // And it goes on showing it, as the machine runs on.
      step(machine, 6 / 60, !open);
      expect(medal.sinceDrop).toBeCloseTo(0.1, 9);
      expect(caught(medal, machine.time, false, !open)).toMatchObject({ chucker: open ? 1 : -1, near: open ? -1 : 1 });
      // A medal the engine did not see come over, one read back from a save in the middle of its way down, has no
      // word of the engine's: it is taken as the slots stand when the catcher is first asked, and stays so.
      const read: Medal = { ...medal };
      expect(slotWidthAt(read)).toBeUndefined();
      expect(caught(read, machine.time, false, !open)).toMatchObject({ chucker: open ? -1 : 1 });
      expect(caught(read, machine.time, false, open)).toMatchObject({ chucker: open ? -1 : 1 });
    }
  });

  it('gives a tower no word of its own: what goes over as a tower comes down across the table, not down the catcher', () => {
    const machine = createMachine(11);
    machine.time = time;
    const tower = over(pocket, front + 0.5, -1, { level: 1, stack: 5 });
    machine.medals = [tower];
    const events = step(machine, 1 / 60, true);
    expect([events.toppled, events.checkers]).toEqual([1, [1, 1, 1, 1, 1]]);
    expect(slotWidthAt(tower)).toBeUndefined();
    expect(machine.medals).toEqual([]);
  });
});

describe('a prize ball that comes over the lip at the catcher', () => {
  const time = 1.3;
  const front = pusherFront(time);
  const r = BALL_RADIUS;
  const ball = (x: number, sinceDrop: number, more: Partial<Medal> = {}): Medal => over(x, front + R, sinceDrop, { ball: true, ...more });

  it('is too big for the well: it rolls across it and down the slide, which no slot of takes it, off its foot and down on to the lower table in front of it', () => {
    // It is a good deal bigger across than the well is long, and than a slot's opening.
    expect(r * 2).toBeGreaterThan(CATCHER.gap + 1.5);
    expect(r * 2).toBeGreaterThan(START_SLOT.long + 3);
    for (const x of [CHECKERS.positions[1], CHECKERS.positions[0] + 2, CATCHER.to - r - 0.1]) {
      const first = rolling(ball(x, 0), r, time);
      if (!first) throw new Error('not rolling');
      // In the step it comes over, it stands on the lip's edge at the height it stood at on the pusher.
      expect(first.x).toBe(x);
      expect(first.depth).toBeCloseTo(front, 9);
      expect(first.height).toBeCloseTo(P + r, 9);
      expect(first.leg).toBe('slide');
      let last = first;
      let onIt = 0;
      let off = 0;
      const legs: Rolled['leg'][] = [];
      for (let sinceDrop = 1 / 240; sinceDrop < CATCHER.slide; sinceDrop += 1 / 240) {
        const at = rolling(ball(x, sinceDrop), r, time);
        if (!at) throw new Error('not rolling');
        if (at.leg !== legs[legs.length - 1]) legs.push(at.leg);
        // Straight down the field, out and down, never back and never up; never a slot's, wherever across it came over.
        expect(at.x).toBe(x);
        expect(at.depth).toBeGreaterThanOrEqual(last.depth - 1e-9);
        expect(at.height).toBeLessThanOrEqual(last.height + 1e-9);
        const { down, clear } = onSlide(at, time);
        if (at.depth <= slopeSpot(x, SLOPE.long, time, r).depth + 1e-9) {
          // On the catcher's top, well and slide alike: once it is off the lip its middle is its own radius clear of it.
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
      expect(legs).toEqual(['slide', 'foot']);
      expect(onIt).toBeGreaterThan(off * 2);
      expect(off).toBeGreaterThan(10);
      expect(last.height).toBeCloseTo(r, 1);
      expect(last.depth - r).toBeLessThan(front + CATCHER.foot.out);
      // After that it stands on the lower table where it came down: against the foot's edge, its middle well out past it, in view.
      const down = rolling(ball(x, CATCHER.slide), r, time);
      expect(down).toMatchObject({ x, height: r, leg: 'table' });
      expect(down?.depth).toBeCloseTo(front + CATCHER.foot.out + clearOfFoot(r), 9);
      expect(last.depth).toBeCloseTo(down?.depth ?? 0, 1);
      // The engine has it at the foot of the pusher's face meanwhile, under the catcher, where the hood would hide it.
      expect(underCatcher(x, front + R, r, time)).toBe(true);
    }
    // It takes as long over it as the catcher says: a little longer than a medal takes to ride its tongue.
    expect(CATCHER.slide).toBeGreaterThanOrEqual(0.6);
    expect(CATCHER.slide).toBeLessThanOrEqual(1);
  });

  it('stands against the foot of the slide where it comes down: a ball is taller than the foot is high, and does not go under', () => {
    const { height } = CATCHER.foot;
    expect(r).toBeGreaterThan(height);
    // Its middle is its own radius above the table, and exactly its radius from the foot's edge: it touches the edge and no more.
    expect(Math.hypot(clearOfFoot(r), r - height)).toBeCloseTo(r, 12);
    expect(clearOfFoot(r)).toBeLessThan(r);
    expect(clearOfFoot(r)).toBeGreaterThan(r * 0.8);
    // The bigger the ball, the further out it stands; and a thing no taller than the foot is high stands its own radius out, as a medal lies.
    expect(clearOfFoot(r + 1)).toBeGreaterThan(clearOfFoot(r));
    expect(clearOfFoot(height)).toBeCloseTo(height, 12);
    expect(clearOfFoot(1)).toBe(1);
  });

  it('stands where it came down until the catcher’s foot has come over the whole of it, and is the engine’s from then on, out of sight; or rolls to where the engine has it', () => {
    const FRAME = 1 / 60;
    const x = CHECKERS.positions[1] + 3;
    // The catcher reaches further out from the lip than the pusher's stroke is long: the face never comes up to a ball that stands in front of the foot.
    expect(CATCHER.foot.out).toBeGreaterThan(PUSHER.max - PUSHER.min);
    /** A ball that came over at `came`, followed as the machine would run it alone: the pusher's face pushes it when it comes forward. */
    const follow = (came: number) => {
      const medal = over(x, pusherFront(came) + R, 0, { ball: true });
      const moments: { time: number; y: number; at: Rolled | null }[] = [];
      for (let frame = 0; frame * FRAME <= CATCHER.slide + CATCHER.lie.wait + CATCHER.lie.slip + 0.2; frame++) {
        const now = came + frame * FRAME;
        medal.sinceDrop = frame * FRAME;
        medal.y = Math.max(medal.y, pusherFront(now) + R);
        moments.push({ time: now, y: medal.y, at: rolling(medal, r, now) });
      }
      return moments;
    };
    // Coming over late in the pusher's way back, as most things do: the pusher turns and brings the catcher forward over it.
    for (const share of [0.8, 0.9, 0.99]) {
      const came = PUSHER.period * share;
      const moments = follow(came);
      const standing = moments.filter((moment) => moment.at?.leg === 'table');
      const spot = pusherFront(came + CATCHER.slide) + CATCHER.foot.out + clearOfFoot(r);
      // It stands exactly where it came down, and does not move, for as long as any of it shows.
      for (const { at } of standing) {
        expect(at).toMatchObject({ x, height: r, leg: 'table' });
        expect(at?.depth).toBeCloseTo(spot, 9);
      }
      expect(standing.length * FRAME).toBeGreaterThan(0.3);
      expect(standing.length * FRAME).toBeLessThan(CATCHER.lie.wait);
      // As it comes down it stands in front of the foot, the middle of it clear: in full view.
      expect(underCatcher(x, spot, 0, standing[0].time)).toBe(false);
      // The catcher lets go once its foot has come over the whole of the ball, which is then out of sight, and so is where the engine has it.
      const last = standing[standing.length - 1];
      const after = moments[moments.indexOf(last) + 1];
      expect(after.at).toBeNull();
      expect(spot + r).toBeLessThan(pusherFront(after.time) + CATCHER.foot.out);
      expect(spot + r).toBeGreaterThanOrEqual(pusherFront(last.time) + CATCHER.foot.out);
      expect(after.y).toBeLessThan(spot);
      expect(after.y + r).toBeLessThan(pusherFront(after.time) + CATCHER.foot.out);
      // And never has it again.
      expect(moments.slice(moments.indexOf(after)).every((moment) => moment.at === null)).toBe(true);
    }
    // Coming over as the pusher gets to the front, the foot is going back and never comes over it: it waits, and then rolls back to where the engine has it, a little in each frame.
    const came = PUSHER.period / 2 - CATCHER.slide;
    const moments = follow(came);
    const standing = moments.filter((moment): moment is { time: number; y: number; at: Rolled } => moment.at?.leg === 'table');
    const engine = PUSHER.max + R;
    expect(standing[0].at.depth).toBeCloseTo(PUSHER.max + CATCHER.foot.out + clearOfFoot(r), 6);
    expect(standing.length * FRAME).toBeCloseTo(CATCHER.lie.wait + CATCHER.lie.slip, 1);
    let last = standing[0].at.depth;
    for (const { at } of standing) {
      expect(at).toMatchObject({ x, height: r });
      expect(at.depth).toBeLessThanOrEqual(last);
      expect(last - at.depth).toBeLessThan(1.4);
      expect(at.depth).toBeGreaterThan(engine);
      last = at.depth;
    }
    expect(last - engine).toBeLessThan(0.2);
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
