import { describe, expect, it } from 'vitest';

import { APRON, CATCHER, apronSpot, caught, mouthOnDrawing, mouthSpot, mouthSpots, underCatcher } from '@/components/game/MedalPusher/catcher';
import { CHUCKERS, chuckerSpot, droppedThrough } from '@/components/game/MedalPusher/chuckers';
import { CHECKERS, FIELD, MEDAL_RADIUS, MEDAL_THICKNESS, PUSHER, createMachine, pusherFront, step, type Medal } from '@/components/game/MedalPusher/engine';
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

/** A medal on the lower table that came over the lip `sinceDrop` seconds ago. */
const over = (x: number, y: number, sinceDrop: number, more: Partial<Medal> = {}): Medal => ({ id: 9, x, y, level: 0, tier: 0, sinceDrop, stack: 1, grow: 0, ball: false, grown: 1, ...more });

describe('the catcher for the START pockets', () => {
  it('hangs on the front of the pusher under its lip, with a mouth for each pocket out in front of the lip', () => {
    for (const time of TIMES) {
      const front = pusherFront(time);
      const spots = mouthSpots(time);
      expect(spots).toHaveLength(CHUCKERS.count);
      ALL.forEach((chucker) => {
        const spot = mouthSpot(chucker, time);
        expect(spots[chucker]).toEqual(spot);
        // Straight out from where the engine has the pocket on the lip, by half the mouth and the closed strip behind it.
        expect(spot.x).toBe(chuckerSpot(chucker, time).x);
        expect(spot.x).toBe(CHECKERS.positions[chucker]);
        expect(spot.depth - front).toBeCloseTo(CATCHER.back + CHUCKERS.radius, 9);
        // The whole of the mouth is beyond the lip, where medals fall and none lie, and short of the rail.
        expect(spot.depth - CHUCKERS.radius).toBeGreaterThan(front);
        expect(spot.depth + CHUCKERS.radius).toBeLessThan(front + CATCHER.rail.out - CATCHER.rail.thick);
        expect(spot.height).toBe(CATCHER.deck);
      });
    }
    // The deck is just under the edge of the pusher's top, so a medal that comes over the lip is above it.
    expect(CATCHER.deck).toBeLessThan(P);
    expect(CATCHER.deck).toBeGreaterThan(P - 1);
    for (const chucker of [-1, 3, 0.5, Number.NaN]) expect(() => mouthSpot(chucker, 0)).toThrow();
  });

  it('is one piece, as long as the three pockets take, with every mouth and its rim inside it', () => {
    expect(CATCHER.tile).toBe(CHECKERS.positions[1] - CHECKERS.positions[0]);
    expect(CATCHER.from).toBe(CHECKERS.positions[0] - CATCHER.tile / 2);
    expect(CATCHER.to).toBe(CHECKERS.positions[2] + CATCHER.tile / 2);
    expect(CATCHER.to - CATCHER.from).toBe(CATCHER.tile * CHUCKERS.count);
    expect(CATCHER.from).toBeGreaterThan(0);
    expect(CATCHER.to).toBeLessThan(FIELD.width);
    // A mouth is as wide as its pocket: a medal that just fits. Two rims do not touch, and there is closed deck between them.
    expect(CHUCKERS.radius).toBeCloseTo(R + CHECKERS.halfWidth, 12);
    expect((CHUCKERS.radius + CATCHER.rim.wide) * 2).toBeLessThan(CATCHER.tile);
    expect(CATCHER.tile - CHUCKERS.radius * 2).toBeGreaterThan(R);
    // A rim is a thick one: a good part of a medal's radius wide, standing up out of the deck.
    expect(CATCHER.rim.wide).toBeGreaterThan(R / 4);
    expect(CATCHER.rim.high).toBeGreaterThan(0.3);
    // A throat has depth: a medal lying at the bottom of it would be several of its own thicknesses below the deck.
    expect(CATCHER.deck - CATCHER.throat).toBeGreaterThan(T * 2.5);
    expect(CATCHER.throat).toBeGreaterThanOrEqual(CATCHER.foot.height);
  });

  it('stops short of the lower table, higher than the medals that lie there, and never reaches the front of it', () => {
    // Two medals deep, and one more on its way down onto them, pass under its foot.
    expect(CATCHER.foot.height).toBeGreaterThan(T * 2.5);
    expect(CATCHER.foot.height).toBeLessThan(CATCHER.deck);
    expect(PUSHER.max + CATCHER.foot.out).toBeLessThan(FIELD.sideOpenFrom);
    expect(CATCHER.foot.out).toBeGreaterThan(CATCHER.rail.out);
    // The rail along the front of the deck stands a little higher than the deck, and no higher than hides the mouths from where the player sits.
    expect(CATCHER.rail.top).toBeGreaterThan(CATCHER.deck);
    for (const time of TIMES) {
      const front = pusherFront(time);
      ALL.forEach((chucker) => {
        const mouth = mouthSpot(chucker, time);
        // The line from the player's eye over the back of the rail meets the top of the rim beyond the near edge of the mouth.
        const edge = { height: CATCHER.rail.top, depth: front + CATCHER.rail.out - CATCHER.rail.thick };
        const slope = (EYE_AT.height - edge.height) / (EYE_AT.depth - edge.depth);
        const hidden = edge.depth - (edge.height - CATCHER.deck - CATCHER.rim.high) / slope;
        expect(hidden).toBeGreaterThan(mouth.depth + CHUCKERS.radius);
      });
    }
  });

  it('shows each mouth as a wide oval on the drawing, three side by side, big enough to be seen on a phone', () => {
    for (const time of TIMES) {
      const mouths = ALL.map((chucker) => mouthOnDrawing(chucker, time));
      mouths.forEach((mouth, chucker) => {
        const spot = mouthSpot(chucker, time);
        const at = project(spot.x, spot.height + CATCHER.rim.high, spot.depth);
        expect(mouth.x).toBeCloseTo(at.x, 9);
        expect(mouth.y).toBeCloseTo(at.y, 9);
        expect(mouth.wide).toBeCloseTo(CHUCKERS.radius * 2 * at.scale, 9);
        // Seen from above and in front, a round mouth in a level deck is wider than it is tall, and well over half as tall as wide.
        expect(mouth.tall / mouth.wide).toBeGreaterThan(0.6);
        expect(mouth.tall / mouth.wide).toBeLessThan(0.8);
        // On a phone it is a good twenty pixels across and fifteen down, with its rim outside that.
        expect(mouth.wide * PHONE).toBeGreaterThan(23);
        expect(mouth.tall * PHONE).toBeGreaterThan(15);
        // All of it is on the drawing, in the lower half, below the lip.
        expect(mouth.x - mouth.wide / 2).toBeGreaterThan(0);
        expect(mouth.x + mouth.wide / 2).toBeLessThan(VIEW.width);
        expect(mouth.y).toBeGreaterThan(project(spot.x, P, pusherFront(time)).y);
        expect(mouth.y + mouth.tall / 2).toBeLessThan(VIEW.height);
      });
      // Side by side on one line, evenly, and not touching.
      expect(mouths[1].y).toBeCloseTo(mouths[0].y, 6);
      expect(mouths[2].y).toBeCloseTo(mouths[0].y, 6);
      expect(mouths[1].x - mouths[0].x).toBeCloseTo(mouths[2].x - mouths[1].x, 6);
      expect(mouths[1].x - mouths[0].x).toBeGreaterThan(mouths[0].wide * 1.3);
      expect(mouths[1].x).toBeCloseTo(VIEW.width / 2, 6);
    }
  });

  it('slopes its apron toward the player, so that the words on it are seen nearly square on and tall enough to read on a phone', () => {
    const wide = CATCHER.to - CATCHER.from;
    expect(APRON).toBeCloseTo(Math.hypot(CATCHER.foot.out - CATCHER.rail.out, CATCHER.rail.top - CATCHER.foot.height), 12);
    for (const time of TIMES) {
      const front = pusherFront(time);
      // Its corners: from the rail down to the foot, from one end of the catcher to the other.
      expect(apronSpot(0, 0, time)).toEqual({ x: CATCHER.from, height: CATCHER.rail.top, depth: front + CATCHER.rail.out });
      const foot = apronSpot(wide, APRON, time);
      expect(foot.x).toBeCloseTo(CATCHER.to, 9);
      expect(foot.height).toBeCloseTo(CATCHER.foot.height, 9);
      expect(foot.depth).toBeCloseTo(front + CATCHER.foot.out, 9);
      // How long a unit down the apron is on the drawing, beside a unit across it: the nearer to one, the squarer on it is seen.
      const middle = apronSpot(wide / 2, APRON / 2, time);
      const across = apronSpot(wide / 2 + 1, APRON / 2, time);
      const down = apronSpot(wide / 2, APRON / 2 + 1, time);
      const o = project(middle.x, middle.height, middle.depth);
      const unitAcross = project(across.x, across.height, across.depth).x - o.x;
      const d = project(down.x, down.height, down.depth);
      const unitDown = Math.hypot(d.x - o.x, d.y - o.y);
      expect(unitDown / unitAcross).toBeGreaterThan(0.97);
      // A vertical face there, like the pusher's own, would show three quarters of that.
      const upright = project(middle.x, middle.height - 1, middle.depth);
      expect(Math.hypot(upright.x - o.x, upright.y - o.y) / unitAcross).toBeLessThan(0.78);
      // The capitals are eleven pixels tall or more on a phone, at any point of the stroke.
      expect(APRON_CAP * unitDown * PHONE).toBeGreaterThanOrEqual(11);
      // Under each mouth, a word's middle is straight below the mouth's.
      ALL.forEach((chucker) => {
        const word = apronSpot(CATCHER.tile * (chucker + 0.5), APRON / 2, time);
        expect(word.x).toBe(mouthSpot(chucker, time).x);
        expect(project(word.x, word.height, word.depth).y).toBeGreaterThan(mouthOnDrawing(chucker, time).y + mouthOnDrawing(chucker, time).tall / 2);
      });
    }
    // The words fit the plate, with a little of it over and under them, and each has less than its pocket's share of the length.
    expect(APRON_CAP).toBeLessThan(APRON - 0.6);
    expect(APRON_CAP).toBeGreaterThan(APRON * 0.75);
  });

  it('says what on the lower table is under it', () => {
    const time = 1.2;
    const front = pusherFront(time);
    const middle = (CATCHER.from + CATCHER.to) / 2;
    // At the foot of the pusher's face, anywhere along it.
    expect(underCatcher(middle, front + R, R, time)).toBe(true);
    expect(underCatcher(CATCHER.from + 1, front + 10, R, time)).toBe(true);
    // Beside it, and out in front of it.
    expect(underCatcher(CATCHER.from - R - 0.1, front + R, R, time)).toBe(false);
    expect(underCatcher(CATCHER.to + R + 0.1, front + R, R, time)).toBe(false);
    expect(underCatcher(middle, front + CATCHER.foot.out + R + 0.1, R, time)).toBe(false);
    // Part under counts: a ball half out from under its front, or lapping its end.
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

  it('slides off the lip into the mouth of its pocket and goes down the throat, level, losing the light', () => {
    const x = pocket + CHECKERS.halfWidth * 0.9;
    const mouth = mouthSpot(1, time);
    const first = caught(over(x, front, 0), time);
    if (!first) throw new Error('not caught');
    // In the step it comes over, its middle is on the lip's edge where it was the moment before, at the height it lay at.
    expect(first).toMatchObject({ x, depth: front, light: 1, chucker: 1, tilt: 0 });
    expect(first.height).toBeCloseTo(P + T / 2, 12);
    let last = first;
    let frames = 0;
    for (let sinceDrop = 1 / 60; sinceDrop < CATCHER.sink; sinceDrop += 1 / 60, frames++) {
      const held = caught(over(x, front + R, sinceDrop), time);
      if (!held) throw new Error('not caught');
      expect(held.chucker).toBe(1);
      // Out over the mouth and in toward the middle of it, never back; down, never up; darker, never lighter.
      expect(held.depth).toBeGreaterThanOrEqual(last.depth);
      expect(Math.abs(held.x - mouth.x)).toBeLessThanOrEqual(Math.abs(last.x - mouth.x) + 1e-12);
      expect(held.height).toBeLessThanOrEqual(last.height);
      expect(held.light).toBeLessThanOrEqual(last.light);
      // Nearly level all the way: it fits the mouth and goes down flat.
      expect(Math.abs(held.tilt)).toBeLessThan(0.2);
      // Once it is below the rim it is inside the throat, clear of its wall.
      if (held.height < CATCHER.deck) expect(Math.hypot(held.x - mouth.x, held.depth - mouth.depth) + R).toBeLessThan(CHUCKERS.radius);
      last = held;
    }
    // It is seen going in for a third of a second: twenty frames, where the drop to the table is eleven.
    expect(frames).toBeGreaterThanOrEqual(19);
    expect(CATCHER.sink).toBeGreaterThan(CHUCKERS.drop * 1.5);
    // By the end it is in the middle of the mouth, under the floor of the throat, and all but dark.
    expect(last.x).toBeCloseTo(mouth.x, 6);
    expect(last.depth).toBeCloseTo(mouth.depth, 6);
    expect(last.height + T / 2).toBeLessThan(CATCHER.throat + 0.3);
    expect(last.light).toBeLessThan(0.3);
    expect(last.light).toBeGreaterThan(0);
    // After that it lies where the engine has it, under the catcher, and is shown there like any medal.
    expect(caught(over(x, front + R, CATCHER.sink), time)).toBeNull();
    expect(underCatcher(x, front + R, R, time)).toBe(true);
  });

  it('tips over the lip’s edge and goes down behind the catcher when it does not fit a pocket', () => {
    for (const x of [(CHECKERS.positions[0] + CHECKERS.positions[1]) / 2, pocket + CHECKERS.halfWidth + 0.4, CATCHER.from + R + 0.1, CATCHER.to - R - 0.1]) {
      expect(droppedThrough(over(x, front, 0))).toBe(-1);
      const first = caught(over(x, front, 0), time);
      if (!first) throw new Error('not caught');
      expect(first.chucker).toBe(-1);
      expect(first.x).toBe(x);
      expect(first.height).toBeCloseTo(P + T / 2, 12);
      const half = caught(over(x, front + R, CHUCKERS.drop / 2), time);
      if (!half) throw new Error('not caught');
      // Right at the lip, between the pusher and the mouths, on its edge, and on its way down.
      expect(half.depth - front).toBeLessThan(CATCHER.back);
      expect(half.depth).toBeGreaterThan(front);
      expect(half.tilt).toBeGreaterThan(1.1);
      expect(half.tilt).toBeLessThan(Math.PI / 2);
      expect(half.height).toBeLessThan(P);
      expect(half.height).toBeGreaterThan(T / 2);
      expect(half.light).toBe(1);
      // It is down in the time any medal takes to drop from the lip, and then lies where the engine has it.
      const last = caught(over(x, front + R, CHUCKERS.drop - 1e-6), time);
      expect(last?.height).toBeCloseTo(T / 2, 3);
      expect(caught(over(x, front + R, CHUCKERS.drop), time)).toBeNull();
    }
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

  it('agrees with the machine: every medal the engine counts through a pocket is shown going down that pocket', () => {
    const machine = createMachine(11);
    let counted = 0;
    let behind = 0;
    for (let frame = 0; frame < 60 * 40 && counted < 6; frame++) {
      if (frame % 9 === 0) dropAt(machine, 50 + 9 * Math.sin(frame / 50));
      const events = step(machine, 1 / 60);
      const fresh = machine.medals.filter((medal) => medal.level === 0 && medal.sinceDrop === 0 && !medal.ball);
      const shown = fresh.map((medal) => caught(medal, machine.time));
      expect(shown.filter((held) => held && held.chucker >= 0).map((held) => held?.chucker).sort()).toEqual([...events.checkers].sort());
      counted += events.checkers.length;
      behind += shown.filter((held) => held && held.chucker < 0).length;
      // Whatever is shown on its way down the catcher is over it or under it, never out in front of it.
      for (const medal of machine.medals) {
        const held = caught(medal, machine.time);
        if (held) expect(held.depth).toBeLessThan(pusherFront(machine.time) + CATCHER.rail.out);
      }
    }
    expect(counted).toBeGreaterThanOrEqual(6);
    expect(behind).toBeGreaterThan(0);
  });
});
