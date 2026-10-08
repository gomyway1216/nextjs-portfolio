/**
 * What the centre screen shows at a given moment of a spin or of the roulette.
 * The session has already drawn the result; these only say how far the show
 * has got, so the reels and the lamps can be drawn from the session's clock.
 */

import { ROULETTE } from './lottery';
import { TIMING, type ActiveRoulette, type ActiveSpin } from './session';

/** The digits on a reel, in the order they come round. */
export const REEL_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** When each reel stops, as a share of the spin without its reach: left, then right. The centre goes last. */
const STOP = { left: 0.45, right: 0.75 } as const;
/** Digits a second while a reel runs, and the seconds it takes to ease onto its digit. */
const SPEED = { fast: 15, slow: 6 } as const;
const EASE = { fast: 0.22, slow: 0.7 } as const;

/** The moment each reel stops, in seconds from the start of the spin: left, centre, right. */
export function stopTimes(spin: ActiveSpin): [number, number, number] {
  const plain = spin.duration - (spin.result.reach ? TIMING.reach : 0);
  return [plain * STOP.left, spin.duration, plain * STOP.right];
}

/** Whether the outer reels have stopped alike and the centre is still to decide it. */
export function inReach(spin: ActiveSpin): boolean {
  return spin.result.reach && spin.elapsed >= stopTimes(spin)[2] && spin.elapsed < spin.duration;
}

/** Digits still to go by before a reel that stops in `left` seconds is home. */
function travel(left: number, speed: number, ease: number): number {
  if (left <= 0) return 0;
  // Full speed until the last `ease` seconds, then slowing evenly to a stop.
  return left > ease ? speed * (left - ease / 2) : (speed * left * left) / (2 * ease);
}

/**
 * Where each reel stands, as a position along REEL_DIGITS (0 shows the first
 * digit, 0.5 is halfway to the second), wrapped into the strip.
 */
export function reelPositions(spin: ActiveSpin): [number, number, number] {
  const stops = stopTimes(spin);
  const count = REEL_DIGITS.length;
  return spin.result.digits.map((digit, reel) => {
    // On a reach the centre reel slows down for the suspense.
    const slow = reel === 1 && spin.result.reach;
    const behind = travel(stops[reel] - spin.elapsed, slow ? SPEED.slow : SPEED.fast, slow ? EASE.slow : EASE.fast);
    const home = REEL_DIGITS.indexOf(digit as (typeof REEL_DIGITS)[number]);
    return (((home - behind) % count) + count) % count;
  }) as [number, number, number];
}

/** How many times the light goes round before it settles, and the share of the time it takes to get there. */
const LAPS = 3;
const SETTLE = 0.86;

/** The pocket the roulette's light is on. It slows as it goes and ends on the pocket already drawn. */
export function roulettePocket(roulette: ActiveRoulette): number {
  const count = ROULETTE.length;
  const progress = Math.min(1, Math.max(0, roulette.elapsed / (roulette.duration * SETTLE)));
  const steps = LAPS * count + roulette.pocket;
  return Math.floor(steps * (1 - (1 - progress) ** 3) + 1e-9) % count;
}

/** Whether the light has reached its pocket and is only holding there. */
export const rouletteSettled = (roulette: ActiveRoulette): boolean => roulette.elapsed >= roulette.duration * SETTLE;
