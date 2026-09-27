import { describe, expect, it } from 'vitest';

import { DIE_SIZE, MIN_REST_GAP, TABLE_H, WALL_Y, dieFrameAt, planThrow } from '@/components/game/Craps/diceMotion';

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const faces = [1, 2, 3, 4, 5, 6];

describe('planThrow / dieFrameAt', () => {
  it('always lands on the drawn faces, apart from each other, inside the table', () => {
    const rng = seeded(21);
    // Track worst cases and assert once: ~400k per-frame expect() calls would
    // blow vitest's 5s timeout on a loaded CI runner.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxStep = 0;
    let minGap = Infinity;
    const wrongEnds: string[] = [];
    for (let trial = 0; trial < 500; trial++) {
      const result: [number, number] = [faces[trial % 6], faces[(trial * 5) % 6]];
      const plans = planThrow(result, rng);
      const ends = plans.map((p) => dieFrameAt(p, 1));
      ends.forEach((end, i) => {
        if (end.face !== result[i] || end.z !== 0 || end.x !== plans[i].rest.x || end.y !== plans[i].rest.y) {
          wrongEnds.push(`trial ${trial} die ${i}`);
        }
      });
      minGap = Math.min(minGap, Math.hypot(ends[0].x - ends[1].x, ends[0].y - ends[1].y));

      for (const plan of plans) {
        let prev = dieFrameAt(plan, 0);
        for (let k = 1; k <= 400; k++) {
          const f = dieFrameAt(plan, k / 400);
          minX = Math.min(minX, f.x);
          maxX = Math.max(maxX, f.x);
          minY = Math.min(minY, f.y);
          maxY = Math.max(maxY, f.y);
          minZ = Math.min(minZ, f.z);
          maxStep = Math.max(maxStep, Math.hypot(f.x - prev.x, f.y - prev.y));
          prev = f;
        }
      }
    }
    expect(wrongEnds).toEqual([]);
    expect(minGap).toBeGreaterThanOrEqual(MIN_REST_GAP - 1e-9);
    // On the felt, below the wall, never under the table.
    expect(minX).toBeGreaterThanOrEqual(DIE_SIZE / 2);
    expect(maxX).toBeLessThanOrEqual(100 - DIE_SIZE / 2);
    expect(minY).toBeGreaterThanOrEqual(WALL_Y + DIE_SIZE / 2 - 1e-9);
    expect(maxY).toBeLessThanOrEqual(TABLE_H - DIE_SIZE / 2);
    expect(minZ).toBeGreaterThanOrEqual(0);
    // No teleporting between frames (≈ 4 ms apart).
    expect(maxStep).toBeLessThan(2);
  });

  it('hits the back wall, then tumbles through several faces before locking', () => {
    const [plan] = planThrow([6, 1], seeded(4));
    const atWall = dieFrameAt(plan, plan.wall.u);
    expect(atWall.y).toBeCloseTo(WALL_Y + DIE_SIZE / 2, 9);

    const seen: number[] = [];
    for (let k = 0; k < 1000; k++) {
      const u = (k / 1000) * plan.uLock;
      const f = dieFrameAt(plan, u).face;
      if (seen[seen.length - 1] !== f) seen.push(f);
    }
    expect(seen.length).toBeGreaterThanOrEqual(8);
    for (let k = 0; k <= 50; k++) {
      const u = plan.uLock + ((1 - plan.uLock) * k) / 50;
      expect(dieFrameAt(plan, u).face).toBe(6);
    }
  });

  it('is airborne on the way to the wall and still at the end', () => {
    const [plan] = planThrow([3, 3], seeded(8));
    expect(dieFrameAt(plan, plan.wall.u / 2).z).toBeGreaterThan(8);
    expect(dieFrameAt(plan, plan.uSettle).z).toBe(0);
    expect(dieFrameAt(plan, 2)).toEqual(dieFrameAt(plan, 1));
  });
});
