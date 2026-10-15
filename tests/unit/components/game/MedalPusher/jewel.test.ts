import { describe, expect, it } from 'vitest';

import { HATCH } from '@/components/game/MedalPusher/arms';
import { CATCHER } from '@/components/game/MedalPusher/catcher';
import { FALL_TIME, FIELD, JEWEL_DROP, MEDAL_RADIUS, MEDAL_THICKNESS, PLATE, PRIZE_LANDS, PUSHER, RELEASE, ROLL_DOWN, pusherFront, type FallingMedal, type Medal } from '@/components/game/MedalPusher/engine';
import {
  CROWN_FACETS,
  JEWEL_CUT,
  JEWEL_FACETS,
  JEWEL_GIRDLE,
  JEWEL_HEIGHT,
  JEWEL_LAMPS,
  JEWEL_PLATE,
  JEWEL_SHOW,
  LAMP_OUTLINE,
  collectedJewel,
  facetInCabinet,
  fallingJewel,
  jewelGlint,
  jewelLampX,
  lampLight,
  lyingJewel,
  pointInCabinet,
  slidJewel,
  type JewelSpot,
} from '@/components/game/MedalPusher/jewel';
import { JEWEL } from '@/components/game/MedalPusher/lottery';
import type { Vec3 } from '@/components/game/MedalPusher/mat4';
import { HEIGHT, VIEW, project } from '@/components/game/MedalPusher/view';

const P = HEIGHT.pusher;
const T = MEDAL_THICKNESS;
const TAU = Math.PI * 2;
/** How many pixels of a phone's screen a pixel of the drawing is, when the stage is as wide as it is on a 375-pixel page. */
const PHONE = 345 / VIEW.width;

const jewel = (id: number, x: number, y: number, level: 0 | 1, more: Partial<Medal> = {}): Medal => ({ id, x, y, level, tier: 0, sinceDrop: -1, stack: 1, ball: false, grown: 1, jewel: true, ...more });
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** The lowest point of a stone held as `spot` says: how high it is above the lower table. */
const lowest = (spot: JewelSpot): number => Math.min(...JEWEL_FACETS.flatMap((face) => face.corners.map((corner) => pointInCabinet(spot, corner)[1])));

describe('the cut of a jewel', () => {
  it('is a round stone about a medal across, taller than two medals and than the START plate’s foot is high', () => {
    expect(JEWEL_CUT.girdle).toBeLessThan(MEDAL_RADIUS);
    expect(JEWEL_CUT.girdle).toBeGreaterThan(MEDAL_RADIUS * 0.9);
    expect(JEWEL_CUT.table).toBeLessThan(JEWEL_CUT.girdle);
    expect(JEWEL_HEIGHT).toBe(JEWEL_CUT.crown + JEWEL_CUT.pavilion);
    expect(JEWEL_HEIGHT).toBeGreaterThan(T * 2);
    // The plate's foot is this far above the lower table: the foot pushes a stone as the face pushes a medal, and no stone is ever under the plate.
    expect(JEWEL_HEIGHT).toBeGreaterThan(CATCHER.foot.height);
    // The pavilion is the deeper half, as on a cut stone.
    expect(JEWEL_CUT.pavilion).toBeGreaterThan(JEWEL_CUT.crown);
  });

  it('has a table, a crown of twice as many triangles as it has sides, and a pavilion that comes to a point', () => {
    const { sides, table, crown, pavilion, girdle } = JEWEL_CUT;
    expect(JEWEL_FACETS).toHaveLength(1 + sides * 3);
    expect(CROWN_FACETS).toBe(1 + sides * 2);
    const [top, ...rest] = JEWEL_FACETS;
    expect(top.corners).toHaveLength(sides);
    expect(top.normal[0]).toBeCloseTo(0, 9);
    expect(top.normal[1]).toBeCloseTo(1, 9);
    expect(top.normal[2]).toBeCloseTo(0, 9);
    for (const corner of top.corners) {
      expect(corner[1]).toBeCloseTo(crown, 9);
      expect(Math.hypot(corner[0], corner[2])).toBeCloseTo(table, 9);
    }
    rest.forEach((face, index) => {
      expect(face.corners).toHaveLength(3);
      // The crown looks up and out, the pavilion down and out.
      if (index < sides * 2) expect(face.normal[1]).toBeGreaterThan(0.2);
      else {
        expect(face.normal[1]).toBeLessThan(-0.2);
        expect(face.corners.some((corner) => corner[0] === 0 && corner[1] === -pavilion && corner[2] === 0)).toBe(true);
      }
    });
    // The girdle is its outline from above: as many corners as it has sides, all as far out as it is wide.
    expect(JEWEL_GIRDLE).toHaveLength(sides);
    for (const corner of JEWEL_GIRDLE) {
      expect(corner[1]).toBe(0);
      expect(Math.hypot(corner[0], corner[2])).toBeCloseTo(girdle, 9);
    }
  });

  it('is closed, every face flat and looking outward, its corners anticlockwise seen from outside', () => {
    const edges = new Map<string, number>();
    // A corner is named by where it is to a millionth, with nothing made of the sign of a zero.
    const name = (corner: Vec3) => corner.map((value) => (Math.round(value * 1e6) / 1e6 + 0).toFixed(6)).join(',');
    for (const face of JEWEL_FACETS) {
      expect(Math.hypot(...face.normal)).toBeCloseTo(1, 9);
      const [a, b, c] = face.corners;
      // The way round its corners agrees with the way it faces.
      expect(dot(cross(minus(b, a), minus(c, a)), face.normal)).toBeGreaterThan(0);
      // Every corner lies in its plane, and the middle of the stone is behind it.
      for (const corner of face.corners) expect(dot(minus(corner, a), face.normal)).toBeCloseTo(0, 9);
      expect(dot(a, face.normal)).toBeGreaterThan(0);
      face.corners.forEach((corner, index) => {
        const next = face.corners[(index + 1) % face.corners.length];
        const key = [name(corner), name(next)].sort().join(' ');
        edges.set(key, (edges.get(key) ?? 0) + 1);
      });
    }
    // Every edge is the meeting of two faces: there is no hole in it.
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
    expect(edges.size).toBe(JEWEL_CUT.sides * 5);
  });

  it('has no two faces of its crown looking the same way, which is what makes it flash', () => {
    const ways = JEWEL_FACETS.slice(0, CROWN_FACETS).map((face) => face.normal.map((value) => value.toFixed(4)).join(','));
    expect(new Set(ways).size).toBe(CROWN_FACETS);
  });
});

describe('a jewel in the cabinet', () => {
  it('lies on its point where the engine has it, on either table, leaning a little its own way', () => {
    for (const [level, floor] of [
      [0, 0],
      [1, P],
    ] as const) {
      const spot = lyingJewel(jewel(7, 40, level === 1 ? 20 : 70, level));
      expect([spot.id, spot.x, spot.depth]).toEqual([7, 40, level === 1 ? 20 : 70]);
      expect(spot.height).toBe(floor + JEWEL_CUT.pavilion);
      expect(spot.tilt).toBeGreaterThanOrEqual(0.05);
      expect(spot.tilt).toBeLessThanOrEqual(0.14);
      expect(spot.light).toBe(1);
      // Its point is on the table, and no part of it is in the table.
      expect(lowest(spot) - floor).toBeGreaterThanOrEqual(0);
      expect(lowest(spot) - floor).toBeLessThan(0.03);
      // And it is no wider than it is: every corner within its girdle of its middle.
      for (const face of JEWEL_FACETS) for (const corner of face.corners) expect(Math.hypot(pointInCabinet(spot, corner)[0] - spot.x, pointInCabinet(spot, corner)[2] - spot.depth)).toBeLessThanOrEqual(JEWEL_CUT.girdle + 0.25);
    }
  });

  it('is turned and leant by its id alone: the same every frame, and no two alike', () => {
    const one = lyingJewel(jewel(11, 30, 60, 0));
    expect(lyingJewel(jewel(11, 30, 60, 0))).toEqual(one);
    expect(lyingJewel(jewel(11, 55, 80, 0))).toMatchObject({ turn: one.turn, tilt: one.tilt, heading: one.heading });
    const others = [12, 13, 14, 15, 16].map((id) => lyingJewel(jewel(id, 30, 60, 0)));
    expect(new Set([one, ...others].map((spot) => spot.turn.toFixed(3))).size).toBe(6);
    expect(new Set([one, ...others].map((spot) => spot.tilt.toFixed(4))).size).toBe(6);
    for (const spot of others) {
      expect(spot.turn).toBeGreaterThanOrEqual(0);
      expect(spot.turn).toBeLessThan(TAU);
    }
  });

  it('is shown tumbling down the START plate only while the machine has it on its way down, and lies as any jewel does once it is down', () => {
    const time = 2;
    const front = pusherFront(time);
    // On the plate: from the lip, where it stood on its point on the pusher.
    const sliding = (remaining: number): FallingMedal => ({ id: 23, x: 30, y: pusherFront(time + remaining) + PLATE.reach + PRIZE_LANDS.jewel, level: 0, fromX: 30, fromY: front, rank: 0, ball: false, remaining, duration: ROLL_DOWN, source: 'slide', jewel: true });
    const start = slidJewel(sliding(ROLL_DOWN), time);
    expect(start?.height).toBeCloseTo(P + JEWEL_CUT.pavilion, 6);
    expect(start?.depth).toBeCloseTo(front, 6);
    // Down, every corner of it is where the jewel lying there has it: nothing jumps as it lands.
    const end = slidJewel(sliding(0), time);
    expect(end).not.toBeNull();
    if (!end) return;
    const lying = lyingJewel(jewel(23, 30, end.depth, 0));
    for (const face of JEWEL_FACETS) {
      for (const corner of face.corners) {
        const [a, b] = [pointInCabinet(end, corner), pointInCabinet(lying, corner)];
        for (let axis = 0; axis < 3; axis++) expect(a[axis]).toBeCloseTo(b[axis], 6);
      }
    }
    // Anything else is not on the plate.
    expect(slidJewel({ ...sliding(0.2), source: 'payout' }, time)).toBeNull();
    expect(slidJewel({ ...sliding(0.2), jewel: undefined }, time)).toBeNull();
  });

  it('lands on the lower table, where the hatch throws it, in front of the START plate wherever the pusher is', () => {
    const thrown = (remaining: number): FallingMedal => ({ id: 32, x: 52, y: JEWEL_DROP.near, level: 0, fromX: 52, fromY: RELEASE.depth, rank: 0, ball: false, remaining, duration: JEWEL_DROP.time, source: 'payout', jewel: true });
    // The nearest it can land to the pusher is clear of the plate's foot at the front of the stroke, by more than its own girdle.
    expect(JEWEL_DROP.near - JEWEL_CUT.girdle).toBeGreaterThan(PUSHER.max + CATCHER.foot.out);
    expect(fallingJewel(thrown(JEWEL_DROP.time)).height).toBeCloseTo(HATCH.height, 6);
    // It ends as the stone that lies there from then on, on the lower table: nothing jumps when it lands.
    expect(fallingJewel(thrown(0))).toEqual(lyingJewel(jewel(32, 52, JEWEL_DROP.near, 0)));
    expect(fallingJewel(thrown(0)).height).toBe(JEWEL_CUT.pavilion);
    // Half way through its throw it is already out over the pusher, and high above it.
    const midway = fallingJewel(thrown(JEWEL_DROP.time / 2));
    expect(midway.depth).toBeGreaterThan(PUSHER.min);
    expect(midway.height).toBeGreaterThan(P + 30);
  });

  it('comes out of the hatch, tumbles on its way down in front of the screen, and lands on its point', () => {
    const falling = (remaining: number): FallingMedal => ({ id: 31, x: 48, y: 9, level: 1, fromX: 48, fromY: RELEASE.depth, rank: 0, ball: false, remaining, duration: FALL_TIME, source: 'payout', jewel: true });
    const start = fallingJewel(falling(FALL_TIME));
    // The middle of its girdle is in the hatch, a little behind the door, whatever spot it is bound for.
    expect(start.x).toBeCloseTo(HATCH.x, 6);
    expect(start.height).toBeCloseTo(HATCH.height, 6);
    expect(start.depth).toBeLessThan(HATCH.depth);
    expect(JEWEL_CUT.girdle).toBeLessThan(HATCH.radius);
    const midway = fallingJewel(falling(FALL_TIME / 2));
    expect(midway.height).toBeLessThan(start.height);
    expect(midway.height).toBeGreaterThan(P + JEWEL_HEIGHT);
    expect(midway.tilt).toBeGreaterThan(0.5);
    expect(midway.turn).not.toBeCloseTo(start.turn, 1);
    const end = fallingJewel(falling(0));
    // Down, it is exactly the stone that lies there from then on: nothing jumps when it lands.
    expect(end).toEqual(lyingJewel(jewel(31, 48, 9, 1)));
  });

  it('tips forward and drops into the tray when it has gone over the front', () => {
    const at = (age: number) => collectedJewel(41, 60, FIELD.depth + 0.1, age);
    expect(at(0)).toMatchObject({ id: 41, x: 60, depth: FIELD.depth + 0.1, height: JEWEL_CUT.pavilion, light: 1 });
    const ages = [0, 0.1, 0.2, 0.3, 0.4];
    for (let i = 1; i < ages.length; i++) {
      expect(at(ages[i]).height).toBeLessThan(at(ages[i - 1]).height);
      expect(at(ages[i]).depth).toBeGreaterThan(at(ages[i - 1]).depth);
      expect(at(ages[i]).tilt).toBeGreaterThanOrEqual(at(ages[i - 1]).tilt);
    }
    // It turns right over and no further, and by then it is below the table.
    expect(at(2).tilt).toBe(Math.PI);
    expect(at(0.3).height).toBeLessThan(0);
    // The turn about its own axis is the one it had on the table: it does not snap round as it goes.
    expect(at(0.2).turn).toBe(lyingJewel(jewel(41, 60, 99, 0)).turn);
  });

  it('has a glint on its table that comes and goes, each stone in its own time, and is steady with reduced motion', () => {
    const over = (id: number) => Array.from({ length: 300 }, (_, frame) => jewelGlint(id, frame / 60, false));
    for (const id of [3, 4, 5]) {
      const glints = over(id);
      for (const glint of glints) {
        expect(glint).toBeGreaterThanOrEqual(0);
        expect(glint).toBeLessThanOrEqual(1);
      }
      // Dark more often than not, and now and then at its brightest.
      expect(glints.filter((glint) => glint === 0).length).toBeGreaterThan(glints.length * 0.4);
      expect(Math.max(...glints)).toBeGreaterThan(0.95);
      // It swells and fades: no frame is far from the one before it.
      for (let i = 1; i < glints.length; i++) expect(Math.abs(glints[i] - glints[i - 1])).toBeLessThan(0.15);
      expect(jewelGlint(id, 1.23, true)).toBe(0.35);
      expect(jewelGlint(id, 4.56, true)).toBe(0.35);
    }
    // Two stones do not flash together.
    expect(over(3).indexOf(Math.max(...over(3)))).not.toBe(over(4).indexOf(Math.max(...over(4))));
  });

  it('puts every corner and every face where the stone is, turned as the stone is turned', () => {
    const level: JewelSpot = { id: 1, x: 30, height: 5, depth: 40, turn: 0, tilt: 0, heading: 0, light: 1 };
    const [table] = JEWEL_FACETS;
    expect(pointInCabinet(level, [1, 2, 3])).toEqual([31, 7, 43]);
    expect(facetInCabinet(level, table).corners).toEqual(table.corners.map((corner) => [30 + corner[0], 5 + corner[1], 40 + corner[2]]));
    // Tipped a quarter turn forward, its table looks at the player and its point is toward the back wall.
    const tipped = facetInCabinet({ ...level, tilt: Math.PI / 2 }, table);
    expect(tipped.normal[0]).toBeCloseTo(0, 6);
    expect(tipped.normal[1]).toBeCloseTo(0, 6);
    expect(tipped.normal[2]).toBeCloseTo(1, 6);
    expect(pointInCabinet({ ...level, tilt: Math.PI / 2 }, [0, -JEWEL_CUT.pavilion, 0])[2]).toBeCloseTo(40 - JEWEL_CUT.pavilion, 6);
    // Turned about its own axis it stays where it is and as tall as it is.
    for (const face of JEWEL_FACETS) {
      const turned = facetInCabinet({ ...level, turn: 1.1 }, face);
      turned.corners.forEach((corner, index) => expect(corner[1]).toBeCloseTo(5 + face.corners[index][1], 6));
      expect(Math.hypot(...turned.normal)).toBeCloseTo(1, 6);
    }
  });
});

describe('the jewel lamps', () => {
  const D = FIELD.depth;

  it('are five in a row, a lamp for each jewel of a set, in the middle of the front of the lower table', () => {
    expect(JEWEL_LAMPS.count).toBe(JEWEL.lamps);
    expect(JEWEL_LAMPS.count).toBe(5);
    const xs = Array.from({ length: JEWEL_LAMPS.count }, (_, lamp) => jewelLampX(lamp));
    expect(xs[2]).toBe(FIELD.width / 2);
    for (let lamp = 1; lamp < xs.length; lamp++) expect(xs[lamp] - xs[lamp - 1]).toBeCloseTo(JEWEL_LAMPS.step, 9);
    expect(xs[0] + xs[4]).toBeCloseTo(FIELD.width, 9);
    // They do not touch one another.
    expect(JEWEL_LAMPS.step).toBeGreaterThan(JEWEL_LAMPS.radius * 2 + 1);
    // Below the edge the medals go over, and on the picture.
    expect(JEWEL_LAMPS.height + JEWEL_LAMPS.radius).toBeLessThan(0);
    expect(project(FIELD.width / 2, JEWEL_PLATE.foot, D).y).toBeLessThan(VIEW.height);
    expect(project(JEWEL_PLATE.from, JEWEL_PLATE.foot, D).x).toBeGreaterThan(0);
    expect(project(JEWEL_PLATE.to, JEWEL_PLATE.foot, D).x).toBeLessThan(VIEW.width);
  });

  it('sit in a plate that reaches a little beyond them every way', () => {
    expect(JEWEL_PLATE.from).toBeCloseTo(jewelLampX(0) - JEWEL_LAMPS.radius - JEWEL_LAMPS.margin.across, 9);
    expect(JEWEL_PLATE.to).toBeCloseTo(jewelLampX(JEWEL_LAMPS.count - 1) + JEWEL_LAMPS.radius + JEWEL_LAMPS.margin.across, 9);
    expect(JEWEL_PLATE.top).toBeGreaterThan(JEWEL_LAMPS.height + JEWEL_LAMPS.radius);
    expect(JEWEL_PLATE.foot).toBeLessThan(JEWEL_LAMPS.height - JEWEL_LAMPS.radius);
    expect(JEWEL_PLATE.top).toBeLessThan(0);
    expect(JEWEL_PLATE.from + JEWEL_PLATE.to).toBeCloseTo(FIELD.width, 9);
    // It is in the middle of the front, between the pusher's two ends, and takes a third of the width or so.
    expect(JEWEL_PLATE.to - JEWEL_PLATE.from).toBeLessThan(FIELD.width * 0.45);
    expect(PUSHER.max).toBeLessThan(D);
  });

  it('are the shape of a cut stone seen from the side, and large enough to count on a phone', () => {
    expect(LAMP_OUTLINE).toHaveLength(5);
    const [topLeft, topRight, right, point, left] = LAMP_OUTLINE;
    // A flat table on top, the girdle its widest, and a point underneath, the same on both sides.
    expect(topLeft[1]).toBe(topRight[1]);
    expect(topLeft[0]).toBe(-topRight[0]);
    expect([left[0], right[0]]).toEqual([-1, 1]);
    expect(left[1]).toBe(right[1]);
    expect(point).toEqual([0, -1]);
    expect(topRight[0]).toBeLessThan(1);
    expect(right[1]).toBeLessThan(topRight[1]);
    for (const [across, up] of LAMP_OUTLINE) {
      expect(Math.abs(across)).toBeLessThanOrEqual(1);
      expect(Math.abs(up)).toBeLessThanOrEqual(1);
    }
    // On a 375-pixel page each lamp is drawn this many pixels wide, and they are this far apart.
    const wide = (project(jewelLampX(0) + JEWEL_LAMPS.radius, JEWEL_LAMPS.height, D).x - project(jewelLampX(0) - JEWEL_LAMPS.radius, JEWEL_LAMPS.height, D).x) * PHONE;
    const apart = (project(jewelLampX(1), JEWEL_LAMPS.height, D).x - project(jewelLampX(0), JEWEL_LAMPS.height, D).x) * PHONE;
    expect(wide).toBeGreaterThanOrEqual(12);
    expect(apart - wide).toBeGreaterThanOrEqual(4);
  });

  it('light from the left, one for each jewel collected, and all together for a bonus', () => {
    for (let lit = 0; lit < JEWEL.lamps; lit++) {
      const lamps = Array.from({ length: JEWEL_LAMPS.count }, (_, lamp) => lampLight(lamp, lit, 0, 1.23, false));
      expect(lamps).toEqual(Array.from({ length: JEWEL_LAMPS.count }, (_, lamp) => (lamp < lit ? 1 : 0)));
      // Reduced motion changes nothing about which are lit.
      expect(Array.from({ length: JEWEL_LAMPS.count }, (_, lamp) => lampLight(lamp, lit, 0, 1.23, true))).toEqual(lamps);
    }
    // The bonus has put them out, and its show lights all five: steadily with reduced motion, flashing together without.
    expect(JEWEL_SHOW).toBeGreaterThan(1);
    const seen = new Set<number>();
    for (let clock = 0; clock < 1; clock += 1 / 60) {
      const lamps = Array.from({ length: JEWEL_LAMPS.count }, (_, lamp) => lampLight(lamp, 0, JEWEL_SHOW / 2, clock, false));
      expect(new Set(lamps).size).toBe(1);
      expect(lamps[0]).toBeGreaterThan(0);
      seen.add(Number(lamps[0].toFixed(2)));
      expect(Array.from({ length: JEWEL_LAMPS.count }, (_, lamp) => lampLight(lamp, 0, JEWEL_SHOW / 2, clock, true))).toEqual([1, 1, 1, 1, 1]);
    }
    expect(Math.max(...seen)).toBe(1);
    expect(Math.min(...seen)).toBeLessThan(0.2);
  });
});
