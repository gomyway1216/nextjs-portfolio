/**
 * Pure motion model for the three spinning reels.
 *
 * A reel's position `p` is the (fractional) strip index shown in the TOP row;
 * the payline is the middle row, so a reel rests with `p ≡ stop − 1`. Symbols
 * travel downward, i.e. `p` decreases while spinning. Each spin:
 *   wind-up  the reel jerks up a little before letting go
 *   spin     fast, decelerating travel, slightly past the target
 *   settle   springs back onto the target (the mechanical "clunk")
 * The drawn stops come from the engine before the animation starts; this only
 * decides how the reels get there.
 */

import { PHYSICAL_STOPS } from './engine';

export const mod = (x: number, m: number = PHYSICAL_STOPS) => ((x % m) + m) % m;

/** Reel stop times (ms after the spin starts), left to right. */
export const REEL_STOP_MS = [1100, 1500, 1900] as const;
/** Extra time the last reel spins when the first two reels show a 7 (it does not change the odds). */
export const ANTICIPATION_MS = 1400;
/** Full strip revolutions before each reel starts its final approach. */
const TURNS = [1, 2, 3] as const;

const WIND_UP = 0.3; // cells
const OVERSHOOT = 0.28; // cells
const WIND_UP_END = 0.08; // fraction of the reel's duration
const SETTLE_START = 0.9;

export interface ReelPlan {
  /** Position at the start of the spin. */
  from: number;
  /** Total downward travel in cells (> 0), ending with the stop on the payline. */
  travel: number;
  durationMs: number;
}

export function planReels(positions: readonly number[], stops: readonly number[], anticipation: boolean): ReelPlan[] {
  return stops.map((stop, r) => {
    const from = mod(positions[r]);
    const target = mod(stop - 1);
    const travel = mod(from - target) + PHYSICAL_STOPS * TURNS[r];
    const durationMs = REEL_STOP_MS[r] + (anticipation && r === stops.length - 1 ? ANTICIPATION_MS : 0);
    return { from, travel, durationMs };
  });
}

/** Total time until every reel has stopped. */
export const spinDuration = (plans: readonly ReelPlan[]) => Math.max(...plans.map((p) => p.durationMs));

/** Reel position `tMs` after the spin started (clamped to the reel's stop). */
export function reelPosition(plan: ReelPlan, tMs: number): number {
  const x = Math.min(1, Math.max(0, tMs / plan.durationMs));
  if (x < WIND_UP_END) {
    return plan.from + WIND_UP * Math.sin((Math.PI * x) / WIND_UP_END);
  }
  if (x < SETTLE_START) {
    const y = (x - WIND_UP_END) / (SETTLE_START - WIND_UP_END);
    const eased = 1 - (1 - y) * (1 - y);
    return plan.from - (plan.travel + OVERSHOOT) * eased;
  }
  const z = (x - SETTLE_START) / (1 - SETTLE_START);
  const back = (1 - Math.cos(Math.PI * z)) / 2;
  return plan.from - plan.travel - OVERSHOOT * (1 - back);
}

/** Absolute speed in cells per second (drives the motion blur). */
export function reelSpeed(plan: ReelPlan, tMs: number, dtMs = 8): number {
  return (Math.abs(reelPosition(plan, tMs + dtMs) - reelPosition(plan, tMs)) * 1000) / dtMs;
}
