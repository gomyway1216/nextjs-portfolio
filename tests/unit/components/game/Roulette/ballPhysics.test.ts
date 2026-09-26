import { describe, expect, it } from 'vitest';

import {
  INITIAL_POSE,
  SLICE_DEG,
  WHEEL_GEOMETRY,
  frameAt,
  mod360,
  planSpin,
  pocketAtDeg,
  pocketCenterDeg,
  type WheelPose,
} from '@/components/game/Roulette/ballPhysics';
import { WHEEL_ORDER } from '@/components/game/Roulette/engine';

/** Deterministic Park–Miller generator so every run explores the same spins. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Smallest angular distance between two compass angles. */
const angleDiff = (a: number, b: number) => {
  const d = mod360(a - b);
  return Math.min(d, 360 - d);
};

const SAMPLES = 800;

describe('pocket geometry', () => {
  it('maps every pocket centre back to the same pocket', () => {
    for (const n of WHEEL_ORDER) {
      expect(pocketAtDeg(pocketCenterDeg(n))).toBe(n);
      // Anywhere inside the pocket (not on the fret) resolves to it too.
      expect(pocketAtDeg(pocketCenterDeg(n) + SLICE_DEG * 0.45)).toBe(n);
      expect(pocketAtDeg(pocketCenterDeg(n) - SLICE_DEG * 0.45 + 720)).toBe(n);
    }
  });

  it('puts 0 at the top of an unrotated wheel', () => {
    expect(pocketCenterDeg(0)).toBe(0);
    expect(pocketAtDeg(0)).toBe(0);
  });

  it('rejects numbers that are not on the wheel', () => {
    expect(() => pocketCenterDeg(37)).toThrow(RangeError);
  });
});

describe('planSpin / frameAt', () => {
  it('always seats the ball in the drawn pocket, carried to 12 o\'clock', () => {
    const rng = seeded(7);
    let pose: WheelPose = INITIAL_POSE;
    for (let trial = 0; trial < 400; trial++) {
      const result = WHEEL_ORDER[trial % WHEEL_ORDER.length];
      const plan = planSpin(result, pose, rng);
      const end = frameAt(plan, 1);

      expect(pocketAtDeg(end.ball - end.wheel)).toBe(result);
      expect(angleDiff(end.ball - end.wheel, pocketCenterDeg(result))).toBeLessThan(1e-6);
      // The winning pocket (and the ball in it) finishes under the top marker.
      expect(angleDiff(end.wheel + pocketCenterDeg(result), 0)).toBeLessThan(1e-6);
      expect(angleDiff(end.ball, 0)).toBeLessThan(1e-6);
      expect(end.ballR).toBeCloseTo(WHEEL_GEOMETRY.ballPocket, 12);
      expect(end.lift).toBe(0);

      pose = end;
    }
  });

  it('starts exactly where the previous spin left the wheel and ball', () => {
    const start: WheelPose = { wheel: 1234.5, ball: -987.25, ballR: WHEEL_GEOMETRY.ballPocket };
    const plan = planSpin(17, start, seeded(3));
    const first = frameAt(plan, 0);
    expect(angleDiff(first.wheel, start.wheel)).toBeLessThan(1e-9);
    expect(angleDiff(first.ball, start.ball)).toBeLessThan(1e-9);
    expect(first.ballR).toBe(start.ballR);
  });

  it('keeps the ball in the pocket (riding the wheel) once it has landed', () => {
    const plan = planSpin(26, INITIAL_POSE, seeded(11));
    for (let i = 0; i <= 50; i++) {
      const u = plan.uLand + ((1 - plan.uLand) * i) / 50;
      const f = frameAt(plan, u);
      expect(pocketAtDeg(f.ball - f.wheel)).toBe(26);
      expect(angleDiff(f.ball - f.wheel, pocketCenterDeg(26))).toBeLessThan(1e-6);
      expect(f.ballR).toBeCloseTo(WHEEL_GEOMETRY.ballPocket, 12);
    }
  });

  it('moves like a real wheel: head clockwise and slowing, ball counter-clockwise on the track', () => {
    const rng = seeded(42);
    const T = 5.6; // seconds, matches SPIN_DURATION_MS order of magnitude
    let pose: WheelPose = INITIAL_POSE;
    for (let trial = 0; trial < 150; trial++) {
      const plan = planSpin(Math.floor(rng() * 37), pose, rng);
      let prev = frameAt(plan, 0);
      let prevWheelVel = Infinity;
      for (let i = 1; i <= SAMPLES; i++) {
        const u = i / SAMPLES;
        const f = frameAt(plan, u);
        const dt = T / SAMPLES;
        const wheelVel = (f.wheel - prev.wheel) / dt;
        const ballVel = (f.ball - prev.ball) / dt;

        expect(wheelVel).toBeGreaterThanOrEqual(0);
        expect(wheelVel).toBeLessThanOrEqual(prevWheelVel + 1e-6);
        if (u > plan.uLaunch && u <= plan.uDrop) expect(ballVel).toBeLessThan(0);

        // No teleporting: the ball never jumps more than a few pockets per frame
        // (even at 30fps), and never leaves the bowl.
        expect(Math.abs(f.ball - prev.ball)).toBeLessThan(SLICE_DEG * 4);
        expect(f.ballR).toBeGreaterThanOrEqual(WHEEL_GEOMETRY.ballPocket - 1e-9);
        expect(f.ballR).toBeLessThanOrEqual(WHEEL_GEOMETRY.ballTrack + 1e-9);
        expect(f.lift).toBeGreaterThanOrEqual(0);
        expect(f.lift).toBeLessThanOrEqual(1);

        prev = f;
        prevWheelVel = wheelVel;
      }
      pose = frameAt(plan, 1);
    }
  });

  it('follows the choreography: track, drop, bounce, then seated', () => {
    const plan = planSpin(5, INITIAL_POSE, seeded(99));
    expect(plan.uLaunch).toBeLessThan(plan.uDrop);
    expect(plan.uDrop).toBeLessThan(plan.uHit);
    expect(plan.uHit).toBeLessThan(plan.uLand);
    expect(plan.uLand).toBeLessThan(1);

    const onTrack = frameAt(plan, (plan.uLaunch + plan.uDrop) / 2);
    expect(onTrack.ballR).toBe(WHEEL_GEOMETRY.ballTrack);

    const falling = frameAt(plan, (plan.uDrop + plan.uHit) / 2);
    expect(falling.ballR).toBeLessThan(WHEEL_GEOMETRY.ballTrack);
    expect(falling.ballR).toBeGreaterThan(WHEEL_GEOMETRY.ballPocket);

    let maxLift = 0;
    for (let i = 0; i <= 200; i++) {
      const u = plan.uHit + ((plan.uLand - plan.uHit) * i) / 200;
      maxLift = Math.max(maxLift, frameAt(plan, u).lift);
    }
    expect(maxLift).toBeGreaterThan(0.3);
  });

  it('varies the look of the spin but not where it ends', () => {
    const a = planSpin(32, INITIAL_POSE, seeded(1));
    const b = planSpin(32, INITIAL_POSE, seeded(2));
    expect(a.uDrop).not.toBe(b.uDrop);
    const endA = frameAt(a, 1);
    const endB = frameAt(b, 1);
    expect(pocketAtDeg(endA.ball - endA.wheel)).toBe(32);
    expect(pocketAtDeg(endB.ball - endB.wheel)).toBe(32);
  });

  it('clamps time outside 0..1', () => {
    const plan = planSpin(8, INITIAL_POSE, seeded(5));
    expect(frameAt(plan, -1)).toEqual(frameAt(plan, 0));
    expect(frameAt(plan, 2)).toEqual(frameAt(plan, 1));
  });
});
