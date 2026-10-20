/**
 * The pachinko board as it is drawn, and how a ball moves over it.
 *
 * The board is 300 × 360 units, seen face on through the glass. A ball fired leaves the launcher at the bottom left,
 * runs up the guide rail round the left of the board and over the top, and leaves the rail where the handle's
 * strength gives out: soft shots over the left of the board (左打ち), hard ones over the top to the right (右打ち).
 * It falls on through the nails to the pocket its throw takes it to (engine.ts): the ヘソ under the screen, a side
 * pocket, the 電チュー or the attacker on the right, or OUT at the foot.
 *
 * Every ball's way takes `FLIGHT_MS`, and the machine is shown that much behind the rules (PlayTab.tsx): a ball fired
 * reaches its pocket just as the machine is shown taking it. Its way is worked out in closed form from its strength,
 * pocket and throw, so the page only asks where it is at a moment (`ballAt`). With less motion asked for, a ball is
 * shown only as it comes to its pocket.
 *
 * Nothing here touches React or the browser.
 */

import { FIRST_RIGHT, STRENGTHS, type Pocket } from './engine';

export const BOARD_W = 300;
export const BOARD_H = 360;
/** A ball's radius. */
export const BALL_R = 3.4;
/** How long a ball takes from the launcher to its pocket, in ms: two slots. */
export const FLIGHT_MS = 1_200;

/** The rail: a circle round the board, and the angle each strength leaves it at (in degrees, 0 to the right, 90 up). */
export const RAIL = { x: 150, y: 176, r: 140 };
const LAUNCH_ANGLE = 232;
export const EXIT_ANGLES: readonly number[] = [152, 138, 124, 111, 62, 44, 28];
export const railPoint = (degrees: number, inset = 0): { x: number; y: number } => {
  const a = (degrees * Math.PI) / 180;
  return { x: RAIL.x + (RAIL.r - inset) * Math.cos(a), y: RAIL.y - (RAIL.r - inset) * Math.sin(a) };
};

/** The screen in the middle, and the ledge (ステージ) under it. */
export const SCREEN = { x: 92, y: 86, w: 116, h: 104 };
/** Where each pocket is: its middle. */
export const POCKETS: Readonly<Record<Exclude<Pocket, 'out'>, { x: number; y: number }>> = {
  heso: { x: 150, y: 236 },
  side: { x: 64, y: 270 },
  denchu: { x: 236, y: 250 },
  attacker: { x: 214, y: 302 },
};
export const OUT_HOLE = { x: 150, y: 344 };
/** The gate (スルー) the right-hand balls pass through, the windmill (風車) on the left, and the attacker's width. */
export const GATE = { x: 248, y: 204 };
export const WINDMILL = { x: 58, y: 168, r: 11 };
export const ATTACKER_W = 54;
/** The hold lamps under the screen: the ヘソ's four, then the 電チュー's. */
export const LAMPS = { y: 205, x0: 120, gap: 8, r: 2.6 };

/** The nails: rows of them along the ways the balls take, as a real board's gauge (ゲージ) has them. */
export const NAILS: readonly { x: number; y: number }[] = (() => {
  const nails: { x: number; y: number }[] = [];
  const add = (x: number, y: number) => nails.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  // 天釘: a row over the screen.
  for (let i = 0; i < 9; i++) add(110 + i * 10, 64 + (i % 2) * 4);
  // The left field: a staggered lattice from the rail down to the side pocket, round the windmill.
  for (let row = 0; row < 11; row++) {
    const y = 84 + row * 15;
    for (let col = 0; col < 4; col++) {
      const x = 30 + col * 15 + (row % 2) * 7;
      if (Math.hypot(x - WINDMILL.x, y - WINDMILL.y) < WINDMILL.r + 6) continue;
      if (x > SCREEN.x - 6 && y < SCREEN.y + SCREEN.h + 4) continue;
      add(x, y);
    }
  }
  // 道釘: the road along under the screen's ledge toward the ヘソ, and the 命釘 either side of it.
  for (let i = 0; i < 5; i++) add(96 + i * 9, 208 + i * 3);
  for (let i = 0; i < 5; i++) add(204 - i * 9, 208 + i * 3);
  add(POCKETS.heso.x - 8, POCKETS.heso.y - 9);
  add(POCKETS.heso.x + 8, POCKETS.heso.y - 9);
  // Under the ヘソ: the lower field to OUT.
  for (let row = 0; row < 4; row++) for (let col = 0; col < 7; col++) add(96 + col * 18 + (row % 2) * 9, 262 + row * 16);
  // The right-hand way: down past the gate to the 電チュー and the attacker.
  for (let row = 0; row < 8; row++) add(262 - (row % 2) * 8, 110 + row * 14);
  for (let row = 0; row < 3; row++) add(226 + (row % 2) * 9, 222 + row * 10);
  return nails;
})();

// ── A ball's way ────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}
/** A ball's way: points, each with the moment (0 to 1 of `FLIGHT_MS`) it is there. */
export interface Way {
  points: readonly (Point & { t: number })[];
}

/** A number in [0, 1) from a ball's throw and an index: the same ball always takes the same way. */
const jitter = (seed: number, i: number): number => {
  let z = (seed * 2654435761 + i * 40503) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x2c1b3c6d) >>> 0;
  z = Math.imul(z ^ (z >>> 12), 0x297a2d39) >>> 0;
  return ((z ^ (z >>> 15)) >>> 0) / 2 ** 32;
};

/**
 * The way of a ball shot at `strength` to `pocket` (OUT: down past the pockets to the foot), its throw `fate` and a
 * ball number `n` shaking it from the next one's.
 */
export function wayOf(strength: number, pocket: Pocket, fate: number, n: number): Way {
  const seed = fate * 131 + n * 7 + strength;
  const exit = EXIT_ANGLES[Math.min(STRENGTHS - 1, Math.max(0, strength))];
  const right = strength >= FIRST_RIGHT;
  const points: (Point & { t: number })[] = [];
  // Up the rail: from the launcher round to where the strength gives out (a third of the way's time).
  const railSteps = 10;
  for (let i = 0; i <= railSteps; i++) {
    const a = LAUNCH_ANGLE + ((exit - LAUNCH_ANGLE) * i) / railSteps;
    points.push({ ...railPoint(a, 5), t: (0.32 * i) / railSteps });
  }
  const from = railPoint(exit, 12);
  const to: Point = pocket === 'out' ? (right ? { x: 246, y: 330 } : { x: 92 + jitter(seed, 9) * 30, y: 330 }) : POCKETS[pocket];
  const end: Point = pocket === 'out' ? OUT_HOLE : to;
  // Down through the nails: a zigzag from the rail to the pocket, a hop a nail.
  const hops = 6;
  for (let i = 1; i <= hops; i++) {
    const k = i / hops;
    const ease = k * k * 0.35 + k * 0.65;
    const sway = (jitter(seed, i) - 0.5) * 14 * (1 - k * 0.7) * (i % 2 === 0 ? 1 : -1);
    const x = from.x + (to.x - from.x) * ease + sway;
    const y = from.y + (to.y - from.y) * (k * k * 0.55 + k * 0.45);
    points.push({ x, y, t: 0.32 + (pocket === 'out' ? 0.5 : 0.68) * k });
  }
  if (pocket === 'out') points.push({ ...end, t: 1 });
  return { points };
}

/** Where a ball on its way is at `t` (0 to 1 of its way's time). */
export function ballAt(way: Way, t: number): Point {
  const pts = way.points;
  if (t <= 0) return pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const a = pts[i - 1];
      const b = pts[i];
      const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  return pts[pts.length - 1];
}

// ── The clock ───────────────────────────────────────────────────────────────

/** The machine's clock: real time less every pause (the Odds tab or help in front of it, the page hidden). */
export function createMachineClock(real: () => number) {
  let away = 0;
  let pausedAt: number | null = null;
  return {
    now: (): number => (pausedAt ?? real()) - away,
    pause: (): void => {
      if (pausedAt === null) pausedAt = real();
    },
    resume: (): void => {
      if (pausedAt === null) return;
      away += real() - pausedAt;
      pausedAt = null;
    },
    paused: (): boolean => pausedAt !== null,
  };
}
export type MachineClock = ReturnType<typeof createMachineClock>;

// ── The lanterns on the screen ──────────────────────────────────────────────

/** The three lanterns a spin stops on: a hit's three alike (7 for 10 rounds, odd for ST, even for 時短), a reach's outer two alike. */
export function reelFaces(seed: number, hit: { rounds: number; after: 'st' | 'jitan' } | null, reach: boolean): [number, number, number] {
  const pickOf = (i: number, of: readonly number[]) => of[Math.floor(jitter(seed, 20 + i) * of.length)];
  if (hit) {
    const face = hit.rounds === 10 ? 7 : hit.after === 'st' ? pickOf(0, [1, 3, 5, 9]) : pickOf(0, [2, 4, 6, 8]);
    return [face, face, face];
  }
  const left = 1 + Math.floor(jitter(seed, 21) * 9);
  // A reach's middle stops one past its pair; a plain spin's outer two never match.
  if (reach) return [left, (left % 9) + 1, left];
  const right = ((left + Math.floor(jitter(seed, 22) * 8)) % 9) + 1;
  return [left, 1 + Math.floor(jitter(seed, 23) * 9), right];
}
