/**
 * Pure trajectory model for the roulette wheel + ball animation.
 *
 * The result is decided up front by `spin()`; this module only choreographs a
 * physically plausible path that is guaranteed to end with the ball resting in
 * that pocket, and with that pocket carried to 12 o'clock under the marker.
 *
 * Conventions:
 * - Angles are "compass" degrees: 0 = 12 o'clock, increasing clockwise (the
 *   same direction as SVG / CSS `rotate()`).
 * - Radii are fractions of the wheel radius (1 = outer rim).
 * - The wheel head spins clockwise; the ball is launched counter-clockwise.
 *
 * Choreography (u = normalized time 0..1):
 *   launch  [0, uLaunch)   ball is flicked from where it lay out onto the track
 *   track   [uLaunch, uDrop) ball rolls around the outer track, slowing down
 *   drop    [uDrop, uHit)    ball spirals down the apron into the pocket ring
 *   bounce  [uHit, uLand)    ball clatters over frets, hopping between pockets
 *   ride    [uLand, 1]       ball sits in its pocket and rides the wheel to the top
 */

import { POCKET_COUNT, WHEEL_ORDER } from './engine';

export const SLICE_DEG = 360 / POCKET_COUNT;

/** Radii (fractions of the wheel radius) shared by the renderer and the model. */
export const WHEEL_GEOMETRY = {
  /** Outer edge of the static wooden rim. */
  rim: 1,
  /** Ball track (static bowl) band. */
  trackOuter: 0.965,
  trackInner: 0.855,
  /** Radius the ball rolls at while on the track. */
  ballTrack: 0.91,
  /** Diamond deflectors sit on the apron between the track and the head. */
  deflector: 0.828,
  /** Rotating wheel head: number ring, then pocket ring, then the cone. */
  headOuter: 0.8,
  numberInner: 0.685,
  pocketInner: 0.56,
  /** Ball centre when seated in a pocket. */
  ballPocket: 0.622,
  /** Ball radius. */
  ball: 0.041,
} as const;

/** Where the wheel and ball are at one instant. */
export interface WheelPose {
  /** Wheel-head rotation, compass degrees (clockwise). */
  wheel: number;
  /** Ball angle in the static frame, compass degrees. */
  ball: number;
  /** Ball distance from the centre, fraction of the wheel radius. */
  ballR: number;
}

export interface BallFrame extends WheelPose {
  /** 0..1 — how high the ball is hopping (drives its scale / shadow). */
  lift: number;
}

export interface SpinPlan {
  result: number;
  start: WheelPose;
  /** Total clockwise wheel rotation over the whole spin (always > 0). */
  wheelDelta: number;
  /** Ball angle relative to the wheel head at u = 0. */
  relStart: number;
  /** How far (degrees) the ball travels backwards relative to the head before it is seated. */
  relTravel: number;
  uLaunch: number;
  uDrop: number;
  uHit: number;
  uLand: number;
  /** Signed angular amplitude (degrees) of the fret bounces. */
  bounceAmp: number;
  /** Number of back-and-forth swings during the bounce phase. */
  bounceSwings: number;
  /** Number of radial hops during the bounce phase. */
  hops: number;
  /** Peak outward hop, fraction of the wheel radius. */
  hopHeight: number;
}

/** Resting pose before the first spin: ball held on the track, 0 at the top. */
export const INITIAL_POSE: WheelPose = { wheel: 0, ball: -24, ballR: WHEEL_GEOMETRY.ballTrack };

const WHEEL_EXTRA_TURNS = 1;
const REL_EASE_POWER = 2;

export const mod360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** Compass angle of a pocket's centre in the wheel head's own frame. */
export function pocketCenterDeg(pocket: number): number {
  const index = WHEEL_ORDER.indexOf(pocket);
  if (index < 0) throw new RangeError(`Unknown pocket ${pocket}`);
  return index * SLICE_DEG;
}

/** Which pocket lies under a given angle in the wheel head's own frame. */
export function pocketAtDeg(relDeg: number): number {
  const index = Math.round(mod360(relDeg) / SLICE_DEG) % POCKET_COUNT;
  return WHEEL_ORDER[index];
}

/**
 * Plans a spin that starts from `start` and finishes with the ball seated in
 * `result`'s pocket at 12 o'clock. `rng` only varies the look of the spin
 * (timings, turns, bounces) — never where it ends.
 */
export function planSpin(result: number, start: WheelPose, rng: () => number = Math.random): SpinPlan {
  const target = pocketCenterDeg(result);
  const wheel0 = mod360(start.wheel);
  const ball0 = mod360(start.ball);

  // The head must finish with the result pocket at the top: wheel ≡ -target.
  const wheelDelta = mod360(-target - wheel0) + WHEEL_EXTRA_TURNS * 360;

  // Relative to the head the ball only ever moves backwards (counter-clockwise)
  // until it is seated at `target`.
  const relStart = ball0 - wheel0;
  const relTurns = 3 + Math.floor(rng() * 2);
  const relTravel = mod360(relStart - target) + relTurns * 360;

  const uLaunch = 0.05;
  const uDrop = 0.36 + rng() * 0.08;
  const uHit = uDrop + 0.12 + rng() * 0.04;
  const uLand = uHit + 0.17 + rng() * 0.05;

  return {
    result,
    start: { wheel: wheel0, ball: ball0, ballR: start.ballR },
    wheelDelta,
    relStart,
    relTravel,
    uLaunch,
    uDrop,
    uHit,
    uLand,
    bounceAmp: (rng() < 0.5 ? -1 : 1) * SLICE_DEG * (0.9 + rng() * 0.7),
    bounceSwings: 1.5 + rng(),
    hops: 3 + Math.floor(rng() * 2),
    hopHeight: 0.06 + rng() * 0.035,
  };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Wheel rotation at normalized time u: quadratic ease-out to a dead stop. */
function wheelAt(plan: SpinPlan, u: number): number {
  const k = 1 - (1 - u) * (1 - u);
  return plan.start.wheel + plan.wheelDelta * k;
}

/** Ball angle relative to the wheel head at normalized time u. */
function relAt(plan: SpinPlan, u: number): number {
  if (u >= plan.uLand) return plan.relStart - plan.relTravel;
  const s = u / plan.uLand;
  const base = plan.relStart - plan.relTravel * (1 - Math.pow(1 - s, REL_EASE_POWER));
  if (u < plan.uHit) return base;
  // Fret bounces: a decaying swing that is exactly zero (with zero slope) at uLand,
  // so the ball comes to rest precisely on the pocket centre.
  const x = (u - plan.uHit) / (plan.uLand - plan.uHit);
  const decay = (1 - x) * (1 - x);
  return base + plan.bounceAmp * Math.sin(2 * Math.PI * plan.bounceSwings * x) * decay;
}

function radiusAt(plan: SpinPlan, u: number): { ballR: number; lift: number } {
  const g = WHEEL_GEOMETRY;
  if (u < plan.uLaunch) {
    const x = u / plan.uLaunch;
    const ease = 1 - (1 - x) * (1 - x);
    return { ballR: plan.start.ballR + (g.ballTrack - plan.start.ballR) * ease, lift: 0 };
  }
  if (u < plan.uDrop) return { ballR: g.ballTrack, lift: 0 };
  if (u < plan.uHit) {
    // Falling down the apron: accelerates inward.
    const x = (u - plan.uDrop) / (plan.uHit - plan.uDrop);
    return { ballR: g.ballTrack - (g.ballTrack - g.ballPocket) * x * x, lift: 0 };
  }
  if (u < plan.uLand) {
    const x = (u - plan.uHit) / (plan.uLand - plan.uHit);
    const hop = Math.abs(Math.sin(Math.PI * plan.hops * x)) * Math.pow(1 - x, 1.6);
    return { ballR: g.ballPocket + plan.hopHeight * hop, lift: hop };
  }
  return { ballR: g.ballPocket, lift: 0 };
}

/** Pose of the wheel and ball at normalized time `u` (clamped to 0..1). */
export function frameAt(plan: SpinPlan, u: number): BallFrame {
  const t = clamp01(u);
  const wheel = wheelAt(plan, t);
  const { ballR, lift } = radiusAt(plan, t);
  return { wheel, ball: wheel + relAt(plan, t), ballR, lift };
}
