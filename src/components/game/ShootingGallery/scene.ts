/**
 * The shooting gallery as it is drawn, the sight's sway, and how a cork, the gun and a figure move.
 *
 * The stall is 360 × 450 units (the SVG's viewBox), seen from the counter as a player leaning on it sees it: the noren
 * across the top, the three tiers of shelves under red felt in front of a dark curtain, the figures standing on them,
 * and the counter along the bottom with the cork gun on it, pointing up at the shelves. A tier further back stands
 * higher and its figures are drawn smaller (`TIER_PLACES`).
 *
 * Everything that moves is worked out here as a function of time, in closed form: the sight sways up and down over the
 * figure picked, at an even speed (`sightAt`); a cork fired flies from the muzzle to where the sight was, and the
 * figure it hits rocks, slides back or topples off the back of its shelf (`shotScene`), as the play's draw says it
 * does (engine.ts). The page only asks where each thing is at a moment. With less motion asked for (`calm`), every
 * piece is simply put where it ends.
 *
 * Nothing here touches React or the browser.
 */

import { BANDS, FALLEN, PER_TIER, SHELF, tierOf, type CorkPlay, type KindId } from './engine';

// ── The stall ───────────────────────────────────────────────────────────────

export const STAGE_W = 360;
export const STAGE_H = 450;

/** The noren across the top: how far down it hangs. */
export const NOREN_H = 40;

/** A tier of the shelf: where its figures stand (its felt's front edge), its felt's back edge, how far its cloth hangs, its ends, how small its figures are drawn, and where each figure stands across it. */
export interface TierPlace {
  y: number;
  back: number;
  clothTo: number;
  x0: number;
  x1: number;
  scale: number;
  xs: readonly number[];
}

/** The three tiers, top (the back) first. */
export const TIER_PLACES: readonly TierPlace[] = [
  { y: 128, back: 119, clothTo: 154, x0: 56, x1: 304, scale: 0.8, xs: [100, 180, 260] },
  { y: 206, back: 196, clothTo: 232, x0: 36, x1: 324, scale: 0.9, xs: [86, 180, 274] },
  { y: 286, back: 275, clothTo: 311, x0: 16, x1: 344, scale: 1, xs: [70, 180, 290] },
];

/** The counter's top edge. */
export const COUNTER_Y = 312;

/** Each kind of figure's size, as it is drawn on the front tier. */
export const FIGURE_SIZE: Readonly<Record<KindId, { w: number; h: number }>> = {
  box: { w: 34, h: 38 },
  daruma: { w: 40, h: 48 },
  kokeshi: { w: 24, h: 70 },
  manju: { w: 64, h: 30 },
  cat: { w: 66, h: 84 },
};

/** How far back a step of sliding moves a figure, and how much smaller it looks for it. */
export const SLIDE_STEP = 3.6;
export const SLIDE_SHRINK = 0.035;

/** Where figure `target` stands across, the line it stands on, and its size as set up. */
export function figureHome(target: number): { x: number; y: number; w: number; h: number } {
  const place = TIER_PLACES[tierOf(target)];
  const size = FIGURE_SIZE[SHELF[target]];
  return { x: place.xs[target % PER_TIER], y: place.y, w: size.w * place.scale, h: size.h * place.scale };
}

/** Where figure `target` is drawn, standing at `position` (how far it has slid back): its middle across, its top, its foot. */
export function figureAt(target: number, position: number): { x: number; top: number; foot: number; w: number; h: number } {
  const home = figureHome(target);
  const steps = Math.max(0, position);
  const shrink = 1 - SLIDE_SHRINK * steps;
  const foot = home.y - SLIDE_STEP * steps;
  return { x: home.x, top: foot - home.h * shrink, foot, w: home.w * shrink, h: home.h * shrink };
}

/** The part of the stall a figure's button covers, so that a tap anywhere on its place on the shelf picks it: its slot across, from over its top to the foot of its tier's cloth. */
export function figureSpot(target: number): { x: number; y: number; w: number; h: number } {
  const tier = tierOf(target);
  const place = TIER_PLACES[tier];
  const width = (place.x1 - place.x0) / PER_TIER;
  const x = place.x0 + width * (target % PER_TIER);
  const top = tier === 0 ? NOREN_H + 4 : TIER_PLACES[tier - 1].clothTo + 2;
  return { x, y: top, w: width, h: place.clothTo - top };
}

/** A layer over the stall: its place and size, in the stall's units. */
export interface LayerBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The layer a figure is drawn in: room round it for all it does (rocking, sliding back, spinning off over a corner of
 * its foot and dropping behind its shelf).
 */
export function figureLayer(target: number): LayerBox {
  const home = figureHome(target);
  const reach = home.h + home.w / 2 + 6;
  return { x: home.x - reach, y: home.y - home.h - 12, w: reach * 2, h: home.h + 12 + home.h * 1.5 + 8 };
}

/** The gun's layer (it turns about `GUN_PIVOT`, under the counter), the sight's, the cork's and the puff's. */
export const GUN_BOX: LayerBox = { x: 120, y: 324, w: 120, h: 132 };
export const SIGHT_BOX: LayerBox = { x: 0, y: 0, w: 40, h: 40 };
export const CORK_BOX: LayerBox = { x: 0, y: 0, w: 22, h: 22 };
export const PUFF_BOX: LayerBox = { x: 0, y: 0, w: 24, h: 24 };

// ── The sight ───────────────────────────────────────────────────────────────

/** How long the sight takes to sway from over a figure's top down to its foot, in ms; then it sways back up, and so on. */
export const SWAY_MS = 1_150;
/** How far the sight wanders across as it sways (it never leaves the figure), and how long a wander takes, in ms. */
const WOBBLE = 1.6;
const WOBBLE_MS = 1_730;

/** Where the sway is `ms` into it: 0 over the figure's top, 1 at its foot. */
export function swayAt(ms: number): number {
  const u = (((Math.max(0, ms) / SWAY_MS) % 2) + 2) % 2;
  return u <= 1 ? u : 2 - u;
}

/** The band of the sway at `sway` (0 to 1): its five bands are each a fifth of it, over the top first. */
export const bandOfSway = (sway: number): number => Math.min(BANDS - 1, Math.max(0, Math.floor(sway * BANDS)));

/**
 * Where the sight is over figure `target`, standing at `position`, `ms` into its sway, and the band it is on. Its sway
 * runs from a quarter of the figure's height over its top down to its foot: the bands are over the top, then each
 * quarter of the figure, top to foot, each as tall, and each as long under the sight.
 */
export function sightAt(target: number, position: number, ms: number): { x: number; y: number; band: number } {
  const { x, top, h } = figureAt(target, position);
  const sway = swayAt(ms);
  return { x: x + WOBBLE * Math.sin((2 * Math.PI * ms) / WOBBLE_MS), y: top - h / 4 + sway * h * 1.25, band: bandOfSway(sway) };
}

/** The sway, in ms, at which the sight is on the middle of band `band` going down: for a test, and for the gun as the sight is first put on a figure. */
export const swayFor = (band: number): number => ((band + 0.5) / BANDS) * SWAY_MS;

// ── The gun ─────────────────────────────────────────────────────────────────

/** Where the gun turns, under the counter (the player's hands), and how far from it the muzzle is. */
export const GUN_PIVOT = { x: 180, y: 540 } as const;
export const MUZZLE_REACH = 206;

/** The angle the gun turns to, in degrees (clockwise from straight up), to point at `at`. */
export const gunAngle = (at: { x: number; y: number }): number => (Math.atan2(at.x - GUN_PIVOT.x, GUN_PIVOT.y - at.y) * 180) / Math.PI;

/** Where the muzzle is, the gun turned to `angle`. */
export function muzzleAt(angle: number): { x: number; y: number } {
  const a = (angle * Math.PI) / 180;
  return { x: GUN_PIVOT.x + MUZZLE_REACH * Math.sin(a), y: GUN_PIVOT.y - MUZZLE_REACH * Math.cos(a) };
}

/** How long loading a cork takes, in ms: the lever pulled back and let in, then a cork pushed into the muzzle. With less motion, a short beat. */
export const LOAD_MS = 560;
export const CALM_LOAD_MS = 260;
/** Where the lever is `ms` into loading, 0 at rest to 1 pulled back; and how far the cork is in the muzzle, 0 (not there) to 1 (pushed in). */
export function loadPose(ms: number, calm: boolean): { lever: number; cork: number } {
  if (calm) return { lever: 0, cork: ms >= CALM_LOAD_MS ? 1 : 0 };
  const u = Math.min(1, Math.max(0, ms / LOAD_MS));
  const lever = u < 0.3 ? u / 0.3 : u < 0.55 ? 1 - (u - 0.3) / 0.25 : 0;
  const cork = u < 0.55 ? 0 : Math.min(1, (u - 0.55) / 0.35);
  return { lever, cork };
}

// ── A shot ──────────────────────────────────────────────────────────────────

/** The cork as it flies: where it is, how big it looks (smaller further off), how far it has turned, how much of it shows. */
export interface CorkPose {
  x: number;
  y: number;
  scale: number;
  turn: number;
  shown: number;
}

/**
 * A figure as it moves, from where it stood: how far it has gone across and back (negative: back, up the picture),
 * how far it has turned (degrees, clockwise) about its foot's middle or a corner of it, how squashed it looks as it
 * tips back, how small, how much of it shows, and whether it has gone behind its shelf (drawn only above the shelf's
 * back edge).
 */
export interface FigurePose {
  dx: number;
  dy: number;
  turn: number;
  squash: number;
  scale: number;
  shown: number;
  behind: boolean;
  /** What it turns about: its foot's middle, or the corner it tips over. */
  pivot: 'foot' | 'left' | 'right';
}

/** A figure standing at `position`, still: where it is drawn from its home. */
export const restPose = (position: number): FigurePose =>
  position === FALLEN ? { dx: 0, dy: 0, turn: 0, squash: 1, scale: 1, shown: 0, behind: true, pivot: 'foot' } : { dx: 0, dy: -SLIDE_STEP * position, turn: 0, squash: 1, scale: 1 - SLIDE_SHRINK * position, shown: 1, behind: false, pivot: 'foot' };

export type ShotSound = 'cork' | 'thud' | 'topple' | 'whiff';
/** `hit`: the cork has got there (a figure hit, or the cloth behind it); `down`: the figure is off the shelf; `still`: it has settled. */
export type ShotCue = 'hit' | 'down' | 'still';

/** How a shot plays out: the cork's flight, the figure's answer, the gun's kick and the puff at the muzzle, and the moments in it. */
export interface ShotScene {
  /** How long it all takes, in ms from the press. */
  length: number;
  /** When the cork gets there, in ms from the press. */
  hitAt: number;
  cork: (ms: number) => CorkPose | null;
  /** The figure fired at, `ms` from the press. */
  figure: (ms: number) => FigurePose;
  /** How far the gun has kicked back, 0 to 1. */
  kick: (ms: number) => number;
  /** The puff of air at the muzzle: how big, and how much of it shows; null once it has gone. */
  puff: (ms: number) => { scale: number; shown: number } | null;
  cues: { at: number; sound?: ShotSound; cue?: ShotCue }[];
}

const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));
const easeOut = (u: number): number => 1 - (1 - u) * (1 - u);
const easeIn = (u: number): number => u * u;
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/** How long the cork takes from the muzzle to the shelf, in ms. */
export const FLIGHT_MS = 240;
/** How long each answer of a figure takes, in ms from the cork's arrival (a cat's fall is slower). */
const ROCK_MS = 760;
const SLIDE_MS = 620;
const FALL_MS = 860;
const MISS_MS = 520;
/** With less motion: how long the shot's end is held, so that it is seen before the next cork. */
export const CALM_HOLD_MS = 380;

/** How hard a hit rocks a figure, in degrees, by band (over the top first), and how much more a kind rocks. */
const ROCK_TURN = [0, 9, 7, 5, 3];
const ROCK_KIND: Readonly<Record<KindId, number>> = { box: 1, daruma: 2, kokeshi: 1.2, manju: 0.5, cat: 0.35 };

/**
 * How cork `cork` (engine.ts: what it did) plays out, fired from `muzzle` at `sight` (where the sight was as FIRE was
 * pressed). A hit gets to the sight; a miss over the top flies on above the figure, and any other miss passes beside
 * it (the side from the slot drawn), to the cloth behind. A figure that falls spins off over a corner of its foot (the
 * corner, too, from the slot) and tips back off its shelf.
 */
export function shotScene(cork: CorkPlay, muzzle: { x: number; y: number }, sight: { x: number; y: number }, calm: boolean): ShotScene {
  const { target, position, outcome, band, slot } = cork;
  const kind = SHELF[target];
  const tier = TIER_PLACES[tierOf(target)];
  const figure = figureAt(target, position);
  const side = slot % 2 === 0 ? -1 : 1;
  const rest = restPose(position);
  const far = 0.55 + 0.13 * tierOf(target);
  // Where the cork gets to: the sight on a hit; over the top, or beside the figure, on a miss.
  const to =
    outcome !== 'miss'
      ? sight
      : band === 0
        ? { x: sight.x + side * 3, y: sight.y - 6 }
        : { x: figure.x + side * (figure.w / 2 + 7), y: sight.y };
  const answer = outcome === 'rock' ? ROCK_MS : outcome === 'slide' ? SLIDE_MS : outcome === 'fall' ? FALL_MS * (kind === 'cat' ? 1.25 : 1) : MISS_MS;
  if (calm) {
    const after = outcome === 'fall' ? restPose(FALLEN) : outcome === 'slide' ? restPose(position + 1) : rest;
    return {
      length: CALM_HOLD_MS,
      hitAt: 0,
      cork: (ms) => (ms < CALM_HOLD_MS ? { x: to.x, y: to.y, scale: far, turn: 0, shown: outcome === 'fall' ? 0 : 1 } : null),
      figure: () => after,
      kick: () => 0,
      puff: () => null,
      cues: [
        { at: 0, sound: 'cork' },
        { at: 0, cue: 'hit', sound: outcome === 'miss' ? 'whiff' : outcome === 'fall' ? 'topple' : 'thud' },
        ...(outcome === 'fall' ? [{ at: 0, cue: 'down' as const }] : []),
        { at: CALM_HOLD_MS, cue: 'still' as const },
      ],
    };
  }
  const hitAt = FLIGHT_MS;
  const length = hitAt + answer;
  const corkPose = (ms: number): CorkPose | null => {
    if (ms <= hitAt) {
      const u = ms / hitAt;
      // A little rise and fall on the way, as a cork's flight has.
      return { x: lerp(muzzle.x, to.x, u), y: lerp(muzzle.y, to.y, u) - 10 * Math.sin(Math.PI * u), scale: lerp(1, far, u), turn: 280 * u, shown: 1 };
    }
    const t = ms - hitAt;
    if (outcome === 'miss') {
      // On into the cloth behind, then down it.
      if (t > MISS_MS) return null;
      const u = t / MISS_MS;
      return { x: to.x + side * 4 * u, y: to.y - 4 + 30 * easeIn(clamp01((u - 0.25) / 0.75)), scale: far * (1 - 0.15 * u), turn: 280 + 90 * u, shown: 1 - clamp01((u - 0.7) / 0.3) };
    }
    // Back off the figure, and down onto the felt in front of it.
    const bounce = 380;
    if (t > bounce + 160) return null;
    const u = clamp01(t / bounce);
    return { x: to.x - side * 9 * u, y: lerp(to.y, tier.y + 3, easeIn(u)) - 8 * Math.sin(Math.PI * Math.min(1, u * 1.4)), scale: far * (1 + 0.25 * u), turn: 280 - 200 * u, shown: 1 - clamp01((t - bounce) / 160) };
  };
  const figurePose = (ms: number): FigurePose => {
    const t = ms - hitAt;
    if (t <= 0 || outcome === 'miss') return rest;
    if (outcome === 'rock') {
      const turn = side * ROCK_TURN[band] * ROCK_KIND[kind] * Math.exp(-t / 210) * Math.sin((2 * Math.PI * t) / 300);
      return { ...rest, turn };
    }
    if (outcome === 'slide') {
      const u = easeOut(clamp01(t / 240));
      const turn = side * 4 * Math.exp(-t / 160) * Math.sin((2 * Math.PI * t) / 260);
      return { ...rest, dy: lerp(rest.dy, -SLIDE_STEP * (position + 1), u), scale: lerp(rest.scale, 1 - SLIDE_SHRINK * (position + 1), u), turn };
    }
    // A fall: tipped over a corner of its foot, back to the shelf's edge, and down behind it.
    const pivot = side < 0 ? 'left' : 'right';
    const f = answer;
    const u = t / f;
    const edge = tier.back - figure.foot;
    if (u < 0.18) {
      const v = easeOut(u / 0.18);
      return { ...rest, turn: side * 14 * v, squash: 1 - 0.1 * v, dy: rest.dy - v, pivot };
    }
    if (u < 0.5) {
      const v = (u - 0.18) / 0.32;
      return { ...rest, turn: side * lerp(14, 40, v), squash: lerp(0.9, 0.45, v), dy: rest.dy + lerp(-1, edge, easeOut(v)), pivot };
    }
    const v = clamp01((u - 0.5) / 0.5);
    return { ...rest, turn: side * lerp(40, 70, v), squash: 0.45, dy: rest.dy + edge + figure.h * 1.3 * easeIn(v), shown: 1 - clamp01((v - 0.7) / 0.3), behind: true, pivot };
  };
  const cues: ShotScene['cues'] = [
    { at: 0, sound: 'cork' },
    { at: hitAt, cue: 'hit', sound: outcome === 'miss' ? 'whiff' : 'thud' },
    ...(outcome === 'fall' ? [{ at: hitAt + answer * 0.5, cue: 'down' as const, sound: 'topple' as const }] : []),
    { at: length, cue: 'still' },
  ];
  return {
    length,
    hitAt,
    cork: corkPose,
    figure: (ms) => (ms >= length ? (outcome === 'fall' ? restPose(FALLEN) : outcome === 'slide' ? restPose(position + 1) : rest) : figurePose(ms)),
    kick: (ms) => (ms < 50 ? ms / 50 : Math.max(0, 1 - (ms - 50) / 220)),
    puff: (ms) => (ms < 320 ? { scale: 0.5 + 1.6 * easeOut(ms / 320), shown: 1 - ms / 320 } : null),
    cues,
  };
}

/** The cues of a shot still to come after `ms`, in order. */
export const cuesAfter = (scene: ShotScene, ms: number): ShotScene['cues'] => scene.cues.filter((cue) => cue.at > ms);

// ── The machine's clock ─────────────────────────────────────────────────────

/**
 * The clock the machine runs on: the real time, less every moment the machine was not on show (its Odds tab or its
 * help in front of it). Paused, it stands still: the sight's sway and a cork's flight wait, and go on from the same
 * point when the machine is shown again.
 */
export function createMachineClock(real: () => number) {
  let away = 0;
  let pausedAt: number | null = null;
  return {
    /** The machine's time, in ms: the real time less every pause so far. */
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
