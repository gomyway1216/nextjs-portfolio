import { describe, expect, it } from 'vitest';

import { drawDice, seeded, type Dice, type Face } from '@/components/game/SicBo/engine';
import {
  AXES,
  CUBE_TURNS,
  DOME,
  FIRST_DICE,
  FRAME_RATE,
  LABELS,
  REACH,
  ROLL_TIME,
  SHAKE_TIME,
  angleOf,
  cubeTurn,
  depthOf,
  lyingOn,
  planShake,
  poseAt,
  poseAtTime,
  restPoses,
  restsWell,
  rotate,
  upFace,
  type Pose,
} from '@/components/game/SicBo/physics';

// The dome's physics (physics.ts): every roll, chained one after another from where the last left the dice, comes to
// rest on the faces drawn, flat, inside the dome and clear of the other dice, in the time a real roll takes to watch;
// and the dice never go through the felt, the glass or each other on the way.

const sorted = (faces: readonly number[]) => [...faces].sort((a, b) => a - b).join('');

describe('the die', () => {
  it('has opposite faces that add up to 7, and the cube’s 24 turns', () => {
    for (let i = 0; i < 6; i += 2) expect(LABELS[i] + LABELS[i + 1]).toBe(7);
    expect(CUBE_TURNS).toHaveLength(24);
    for (const face of [1, 2, 3, 4, 5, 6] as Face[]) {
      const q = lyingOn(face, 0.7);
      expect(upFace(q)).toBe(face);
      expect(depthOf(q)).toBeCloseTo(0.5, 12);
    }
  });

  it('turns a face to where another was by the smallest of the cube’s turns', () => {
    for (let from = 0; from < 6; from++)
      for (let to = 0; to < 6; to++) {
        const turn = cubeTurn(from, to);
        const moved = rotate(turn, AXES[from]);
        expect(moved.x * AXES[to].x + moved.y * AXES[to].y + moved.z * AXES[to].z).toBeCloseTo(1, 9);
        const expected = from === to ? 0 : (from ^ 1) === to ? Math.PI : Math.PI / 2;
        expect(angleOf(turn)).toBeCloseTo(expected, 9);
      }
  });
});

describe('a roll', () => {
  it('ends on the faces drawn, chained over 300 rolls from where the last one left the dice', () => {
    const rng = seeded(2026);
    let start: Pose[] = restPoses(FIRST_DICE, 1);
    const worst = { overlap: 0, outside: 0, sunk: 0 };
    let shortest = Infinity;
    let longest = 0;
    for (let i = 0; i < 300; i++) {
      const dice = drawDice(rng);
      const plan = planShake(start, dice, Math.floor(rng() * 2 ** 32));
      expect(sorted(plan.faces)).toBe(sorted(dice));
      expect(sorted(plan.end.map((pose) => upFace(pose.q)))).toBe(sorted(dice));
      expect(restsWell(plan.end)).toBe(true);
      // The first frame is where the dice lay; the last is where they rest.
      for (let die = 0; die < 3; die++) {
        const first = poseAt(plan, 0, die);
        expect(Math.hypot(first.x - start[die].x, first.y - start[die].y)).toBeLessThan(1e-6);
        expect(upFace(first.q)).toBe(upFace(start[die].q));
        expect(upFace(poseAt(plan, plan.count - 1, die).q)).toBe(plan.faces[die]);
      }
      for (let f = 0; f < plan.count; f++) {
        const poses = [0, 1, 2].map((die) => poseAt(plan, f, die));
        for (let a = 0; a < 3; a++) {
          const p = poses[a];
          worst.sunk = Math.max(worst.sunk, depthOf(p.q) - p.z);
          worst.outside = Math.max(worst.outside, Math.hypot(p.x, p.y, p.z) - (DOME - REACH));
          for (let b = a + 1; b < 3; b++) worst.overlap = Math.max(worst.overlap, 2 * REACH - Math.hypot(p.x - poses[b].x, p.y - poses[b].y, p.z - poses[b].z));
        }
      }
      shortest = Math.min(shortest, plan.duration);
      longest = Math.max(longest, plan.duration);
      expect(plan.shakeEnd).toBe(SHAKE_TIME);
      expect(plan.count).toBe(Math.round(plan.duration * FRAME_RATE) + 1);
      start = plan.end;
    }
    // Never into the felt; at most a few hundredths of an edge into the glass or another die's reach for a frame.
    expect(worst.sunk).toBeLessThan(1e-6);
    expect(worst.outside).toBeLessThan(0.06);
    expect(worst.overlap).toBeLessThan(0.08);
    expect(shortest).toBeGreaterThanOrEqual(ROLL_TIME.least);
    expect(longest).toBeLessThanOrEqual(ROLL_TIME.most);
  });

  it('is the same roll for the same start, dice and seed, and tumbles while the platter shakes', () => {
    const start = restPoses([6, 6, 6] as Dice, 9);
    const a = planShake(start, [2, 3, 2], 12345);
    const b = planShake(start, [2, 3, 2], 12345);
    expect(Array.from(a.frames)).toEqual(Array.from(b.frames));
    // The dice leave the felt while it shakes, turning fast, and stop turning by the end.
    let highest = 0;
    let fastest = 0;
    for (let f = 1; f < a.count; f++) {
      for (let die = 0; die < 3; die++) {
        const p = poseAt(a, f, die);
        const q0 = poseAt(a, f - 1, die).q;
        if (f / FRAME_RATE < SHAKE_TIME) highest = Math.max(highest, p.z);
        fastest = Math.max(fastest, angleOf({ w: q0.w * p.q.w + q0.x * p.q.x + q0.y * p.q.y + q0.z * p.q.z, x: 0, y: 0, z: 0 }) * FRAME_RATE);
      }
    }
    expect(highest).toBeGreaterThan(1.2);
    expect(fastest).toBeGreaterThan(10);
    const end = poseAtTime(a, a.duration + 1, 0);
    expect(end).toEqual(poseAt(a, a.count - 1, 0));
    // The dome is shaken while the platter shakes, and still after.
    expect(Math.max(...Array.from(a.jolt).map(Math.abs))).toBeGreaterThan(0.02);
    expect(a.jolt[a.count - 1]).toBeCloseTo(0, 6);
  });

  it('lays out a roll from before the page opened flat, apart and on its faces', () => {
    for (let seed = 0; seed < 200; seed++) {
      const poses = restPoses([4, 1, 6], seed);
      expect(restsWell(poses)).toBe(true);
      expect(poses.map((pose) => upFace(pose.q))).toEqual([4, 1, 6]);
    }
    // A start that is not dice at rest (overlapping) is laid out afresh, and the roll still ends on its faces.
    const bad: Pose[] = [0, 1, 2].map(() => ({ x: 0, y: 0, z: 0.5, q: lyingOn(1, 0) }));
    expect(restsWell(bad)).toBe(false);
    const plan = planShake(bad, [5, 5, 1], 4);
    expect(sorted(plan.faces)).toBe('155');
  });
});
