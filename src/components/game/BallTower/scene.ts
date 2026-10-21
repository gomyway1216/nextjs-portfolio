/**
 * The ball tower as it is drawn, and how the ball and the discs move through a run.
 *
 * The tower is 360 × 520 units (the board's canvas, scaled to its width), seen from a little above as a player at a
 * seat sees it: five turning discs one above another, each wider than the one above it, a glass lift up the right side
 * that carries the ball to the top, and the stage lamps up the left side. Each disc is a flat ring of pockets seen at a
 * slant: a circle squashed to an ellipse (`DISC_PLACES`).
 *
 * A run is played out as a timeline worked out in full the moment it starts (`runScene`): the ball goes up the lift,
 * drops onto the top disc, rolls round it as it turns, slows, and settles in the pocket the draw chose; an UP pocket
 * swallows it and it falls onto the disc below, a "?" pocket lights the disc's lamp roulette, and any other pocket ends
 * the run. Where the ball is, how far each disc has turned and which lamp is lit are closed-form functions of the time
 * since the run began (`ballAt`, `discAngle`, `lampAt`), so the page only asks where things are at a moment, and Skip
 * (or a run shown again) only asks for its end. With less motion asked for (`calm`), the discs stand still and the ball
 * is shown in each pocket in turn, a moment each.
 *
 * Nothing here touches React or the browser.
 */

import { DISCS, LAMP_SETS, LEVELS, POCKETS, type Run, type Stop } from './engine';

// ── The tower ───────────────────────────────────────────────────────────────

export const BOARD_W = 360;
export const BOARD_H = 520;

/** A disc as it is drawn: its centre, its radius across and its squashed radius down (the slant), and its thickness. */
export interface DiscPlace {
  cx: number;
  cy: number;
  r: number;
  ry: number;
  thick: number;
}

/** The five discs, top first: each wider and nearer the player than the one above it. */
export const DISC_PLACES: readonly DiscPlace[] = [
  { cx: 182, cy: 74, r: 78, ry: 22, thick: 7 },
  { cx: 182, cy: 164, r: 104, ry: 30, thick: 8 },
  { cx: 182, cy: 258, r: 120, ry: 35, thick: 8 },
  { cx: 182, cy: 352, r: 132, ry: 39, thick: 9 },
  { cx: 182, cy: 448, r: 142, ry: 43, thick: 10 },
];

/** The ring of pockets round a disc: from this share of its radius to its edge; the ball runs round the middle of it. */
export const RING_IN = 0.72;
export const TRACK = 0.86;
/** The ball's radius, in units. */
export const BALL_R = 8.5;

/** The lift up the right side: the tube's x, and where the ball starts (the seat's launcher) and stops (the top). */
export const LIFT = { x: 340, bottom: 500, top: 22 } as const;
/** The stage lamps up the left side: one a disc, top first, at the height of its disc. */
export const LADDER_X = 22;

/** The angle, in the disc's own turn, of the middle of pocket `pocket` of disc `level`: pocket 0 at 0, the rest round in order. */
export const pocketAngle = (level: number, pocket: number): number => (Math.PI * 2 * pocket) / POCKETS[level];
/** How wide each pocket of disc `level` is, as an angle. */
export const pocketWidth = (level: number): number => (Math.PI * 2) / POCKETS[level];

/** Where a point of disc `level` at angle `angle` (on the screen's turn) and share `rho` of its radius is drawn. */
export function onDisc(level: number, angle: number, rho: number): { x: number; y: number } {
  const d = DISC_PLACES[level];
  return { x: d.cx + Math.cos(angle) * d.r * rho, y: d.cy + Math.sin(angle) * d.ry * rho };
}

/** How fast each disc turns while a run is on, in turns of a radian a second: the discs turn each way in turn. */
export const SPIN: readonly number[] = [0.9, -0.75, 0.62, -0.52, 0.45];

// ── The timeline ────────────────────────────────────────────────────────────

/** How long each piece of a run takes, in ms, with motion; and with less (`CALM_*`). */
export const LIFT_MS = 1_400;
export const ENTER_MS = 520;
export const ROLL_MS: readonly number[] = [1_700, 2_000, 2_300, 2_600, 3_000];
export const SETTLE_MS = 420;
export const ROULETTE_MS = 1_700;
export const SINK_MS = 220;
export const FALL_MS = 380;
/** How long the discs take to get up to speed as a run starts, and to come to rest after it ends. */
export const RAMP_MS = 700;
/** With less motion: the ball at the top, then in each pocket in turn, a moment each, and a "?" pocket's lamp a moment more. */
export const CALM_LIFT_MS = 600;
export const CALM_STEP_MS = 460;
export const CALM_LAMP_MS = 420;

/** A stretch of the run: what the ball is doing, on which disc, from when (ms since the run began) and for how long. */
export type Piece =
  | { kind: 'lift'; at: number; ms: number }
  | { kind: 'enter'; at: number; ms: number }
  | { kind: 'roll'; level: number; at: number; ms: number; from: number; rho: number; to: number }
  | { kind: 'settle'; level: number; at: number; ms: number }
  | { kind: 'roulette'; level: number; at: number; ms: number; from: number; steps: number }
  | { kind: 'sink'; level: number; at: number; ms: number }
  | { kind: 'fall'; level: number; at: number; ms: number; angle: number }
  | { kind: 'rest'; level: number; at: number; ms: number };

/** A moment of the run the page acts on: what it shows and says, and the sound it makes. */
export type CueName = 'launch' | 'top' | 'land' | 'pocket' | 'lamp' | 'end';
export interface Cue {
  at: number;
  cue: CueName;
  level: number;
}

export interface Timeline {
  calm: boolean;
  pieces: Piece[];
  cues: Cue[];
  /** When the ball comes to rest for good: the run's end. */
  end: number;
  /** When Skip can be pressed: once the ball is at the top of the tower. */
  skipFrom: number;
  /** Where each disc stood as the run began, in radians. */
  start: readonly number[];
  stops: readonly Stop[];
}

/** The amount a disc has turned `ms` into a run, in ms at full speed: up to speed over `RAMP_MS`, and down again after `end`. */
export function spunFor(ms: number, end: number): number {
  const t = Math.max(0, ms);
  const r = RAMP_MS;
  const e = Math.max(end, r);
  if (t < r) return (t * t) / (2 * r);
  if (t <= e) return r / 2 + (t - r);
  if (t < e + r) return r / 2 + (e - r) + (t - e) - ((t - e) * (t - e)) / (2 * r);
  return e;
}

/** Where disc `level` stands `ms` into the run, in radians: still, with less motion. */
export const discAngle = (timeline: Timeline, level: number, ms: number): number => timeline.start[level] + (timeline.calm ? 0 : (SPIN[level] * spunFor(ms, timeline.end)) / 1000);

/** Whether the discs are still turning `ms` into the run (they come to rest `RAMP_MS` after its end). */
export const turning = (timeline: Timeline, ms: number): boolean => !timeline.calm && ms < Math.max(timeline.end, RAMP_MS) + RAMP_MS;

/** How many laps of its disc the ball runs, relative to it, before it settles: more on the discs further down. */
const LAPS: readonly number[] = [0.5, 0.6, 0.7, 0.8, 0.9];

/** The angle `to` brought to within a turn after `from`, going the way `way` (+1 or −1), at least `least` round. */
function onward(from: number, to: number, way: number, least: number): number {
  const tau = Math.PI * 2;
  let d = (way * (to - from)) % tau;
  if (d < 0) d += tau;
  while (d < least) d += tau;
  return from + way * d;
}

/** Where the ball drops onto the top disc from the lift: its angle on the screen's turn, and the share of the radius. */
export const ENTRY = { angle: -0.25, rho: 0.5 } as const;

/**
 * A run's timeline, worked out in full: `start`, where each disc stands as it begins. The ball's angle on each disc,
 * relative to the disc, goes from where it lands to the middle of the pocket the draw chose, the long way round, slowing
 * as it goes: it settles there just as its speed comes to the disc's own.
 */
export function runScene(run: Run, start: readonly number[], calm: boolean): Timeline {
  const pieces: Piece[] = [];
  const cues: Cue[] = [{ at: 0, cue: 'launch', level: 0 }];
  const stops = run.stops;
  if (calm) {
    let at = CALM_LIFT_MS;
    pieces.push({ kind: 'lift', at: 0, ms: CALM_LIFT_MS });
    cues.push({ at, cue: 'top', level: 0 });
    stops.forEach((stop, i) => {
      cues.push({ at, cue: 'land', level: stop.level });
      cues.push({ at, cue: 'pocket', level: stop.level });
      const ms = stop.kind === 'mystery' ? CALM_STEP_MS + CALM_LAMP_MS : CALM_STEP_MS;
      if (stop.kind === 'mystery') cues.push({ at: at + CALM_STEP_MS, cue: 'lamp', level: stop.level });
      pieces.push({ kind: 'rest', level: stop.level, at, ms: i === stops.length - 1 ? 0 : ms });
      at += i === stops.length - 1 ? (stop.kind === 'mystery' ? ms : 0) : ms;
    });
    cues.push({ at, cue: 'end', level: stops[stops.length - 1].level });
    return { calm, pieces, cues, end: at, skipFrom: CALM_LIFT_MS, start, stops };
  }
  const base = { calm, start, end: 0 } as Timeline;
  const angleAt = (level: number, ms: number) => discAngle({ ...base, end: Infinity } as Timeline, level, ms);
  pieces.push({ kind: 'lift', at: 0, ms: LIFT_MS });
  pieces.push({ kind: 'enter', at: LIFT_MS, ms: ENTER_MS });
  cues.push({ at: LIFT_MS, cue: 'top', level: 0 });
  let at = LIFT_MS + ENTER_MS;
  let landAngle: number = ENTRY.angle;
  let landRho: number = ENTRY.rho;
  stops.forEach((stop, i) => {
    const { level } = stop;
    const ms = ROLL_MS[level];
    cues.push({ at, cue: 'land', level });
    // Relative to the disc: from where the ball lands to its pocket, the opposite way to the disc's turn, laps and all.
    const from = landAngle - angleAt(level, at);
    const way = SPIN[level] > 0 ? -1 : 1;
    const to = onward(from, pocketAngle(level, stop.pocket), way, LAPS[level] * Math.PI * 2);
    pieces.push({ kind: 'roll', level, at, ms, from, rho: landRho, to });
    at += ms;
    cues.push({ at, cue: 'pocket', level });
    pieces.push({ kind: 'settle', level, at, ms: SETTLE_MS });
    at += SETTLE_MS;
    if (stop.kind === 'mystery') {
      const lamps = LAMP_SETS[level].length;
      const first = (stop.pocket * 7) % lamps;
      const steps = lamps * 3 + ((((stop.lamp ?? 0) - first) % lamps) + lamps) % lamps;
      pieces.push({ kind: 'roulette', level, at, ms: ROULETTE_MS, from: first, steps });
      at += ROULETTE_MS;
      cues.push({ at, cue: 'lamp', level });
    }
    if (stop.kind === 'up' && i < stops.length - 1) {
      pieces.push({ kind: 'sink', level, at, ms: SINK_MS });
      at += SINK_MS;
      // It falls straight down from the pocket, through the hole, onto the wider disc below.
      const angle = angleAt(level, at) + pocketAngle(level, stop.pocket);
      pieces.push({ kind: 'fall', level, at, ms: FALL_MS, angle });
      at += FALL_MS;
      landAngle = angle;
      landRho = Math.min(TRACK, (TRACK * DISC_PLACES[level].r) / DISC_PLACES[level + 1].r);
    }
  });
  cues.push({ at, cue: 'end', level: stops[stops.length - 1].level });
  return { calm, pieces, cues, end: at, skipFrom: LIFT_MS, start, stops };
}

/** Where the discs stand once a run is over and they have come to rest: where the next run starts them. */
export const restAngles = (timeline: Timeline): number[] => Array.from({ length: LEVELS }, (_, level) => discAngle(timeline, level, Number.POSITIVE_INFINITY));

/** The angles the discs stand at before any run: each turned a little, so that their pockets do not line up. */
export const FIRST_ANGLES: readonly number[] = [0.35, 1.1, 0.6, 2.2, 1.45];

// ── Where things are ────────────────────────────────────────────────────────

const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));
const easeInOut = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2);
const easeOutCubic = (u: number): number => 1 - (1 - u) ** 3;
/**
 * The ball's way round a disc, relative to it, from 0 to 1: its speed rising evenly from rest to its fastest a fifth of
 * the way in, then falling evenly back to rest, so that it settles just as it comes to go round with the disc.
 */
export const rollEase = (u: number): number => {
  const k = 0.2;
  const v = Math.min(1, Math.max(0, u));
  return v <= k ? (v * v) / k : 1 - ((1 - v) * (1 - v)) / (1 - k);
};

/** The ball as it is drawn: where, how big (1 on the disc it is on), how much of it shows, and on (or over) which disc. */
export interface BallPose {
  x: number;
  y: number;
  scale: number;
  shown: number;
  level: number;
  /** In a pocket: the pocket, on `level`. */
  pocket: number | null;
}

/** The ball at the bottom of the lift, waiting for a run. */
export const BALL_HOME: BallPose = { x: LIFT.x, y: LIFT.bottom, scale: 1, shown: 1, level: -1, pocket: null };

/** The piece of the timeline under way `ms` into the run: the last to have begun. */
function pieceAt(timeline: Timeline, ms: number): Piece {
  let found = timeline.pieces[0];
  for (const piece of timeline.pieces) if (piece.at <= ms) found = piece;
  return found;
}

/** The ball in pocket `stop` of its disc, `ms` into the run. */
function inPocket(timeline: Timeline, stop: Stop, ms: number, sink = 0): BallPose {
  const angle = discAngle(timeline, stop.level, ms) + pocketAngle(stop.level, stop.pocket);
  const { x, y } = onDisc(stop.level, angle, TRACK);
  return { x, y: y + sink * 4, scale: 1 - 0.35 * sink, shown: 1 - sink, level: stop.level, pocket: stop.pocket };
}

/** Where the ball is `ms` into a run. */
export function ballAt(timeline: Timeline, ms: number): BallPose {
  const piece = pieceAt(timeline, ms);
  const stopOn = (level: number) => timeline.stops.find((stop) => stop.level === level)!;
  const u = piece.ms > 0 ? clamp01((ms - piece.at) / piece.ms) : 1;
  switch (piece.kind) {
    case 'lift': {
      if (timeline.calm) return { ...BALL_HOME, y: LIFT.top + 8, level: -1 };
      return { ...BALL_HOME, y: LIFT.bottom + (LIFT.top - LIFT.bottom) * easeInOut(u) };
    }
    case 'enter': {
      // Over the lift's top and along the chute, then down onto the top disc.
      const land = onDisc(0, ENTRY.angle, ENTRY.rho);
      if (u < 0.6) {
        const v = u / 0.6;
        const x = LIFT.x + (land.x - LIFT.x) * easeInOut(v);
        const y = LIFT.top + (land.y - 34 - LIFT.top) * v + Math.sin(Math.PI * v) * -6;
        return { x, y, scale: 1, shown: 1, level: -1, pocket: null };
      }
      const v = (u - 0.6) / 0.4;
      return { x: land.x, y: land.y - 34 + 34 * v * v, scale: 1, shown: 1, level: -1, pocket: null };
    }
    case 'roll': {
      // Picked up from rest as it lands, round fastest a little after, and slowing to the disc's own speed as it settles.
      const e = rollEase(u);
      const relative = piece.from + (piece.to - piece.from) * e;
      const angle = discAngle(timeline, piece.level, ms) + relative;
      // Out to the track as it lands, with a little hop, and round it.
      const rho = piece.rho + (TRACK - piece.rho) * easeOutCubic(clamp01(u / 0.3));
      const hop = u < 0.12 ? Math.sin((Math.PI * u) / 0.12) * 5 : 0;
      const { x, y } = onDisc(piece.level, angle, rho);
      return { x, y: y - hop, scale: 1, shown: 1, level: piece.level, pocket: null };
    }
    case 'settle':
    case 'roulette':
    case 'rest':
      return inPocket(timeline, stopOn(piece.level), ms);
    case 'sink':
      return inPocket(timeline, stopOn(piece.level), ms, u);
    case 'fall': {
      // Straight down from under the pocket, faster and faster, onto the disc below.
      const level = piece.level;
      const from = onDisc(level, piece.angle, TRACK);
      const rho = Math.min(TRACK, (TRACK * DISC_PLACES[level].r) / DISC_PLACES[level + 1].r);
      const to = onDisc(level + 1, piece.angle, rho);
      const y = from.y + DISC_PLACES[level].thick + (to.y - from.y - DISC_PLACES[level].thick) * u * u;
      return { x: from.x, y, scale: 1, shown: clamp01(u * 4), level: level + 1, pocket: null };
    }
  }
}

/** Where the ball stands once the run is over: in its last pocket. */
export const ballAtEnd = (timeline: Timeline): BallPose => ballAt(timeline, timeline.end);

/** The lamp a disc's roulette has lit `ms` into the run, and whether it has stopped: null while no roulette is lit. */
export function lampAt(timeline: Timeline, ms: number): { level: number; lamp: number; stopped: boolean } | null {
  const lamped = timeline.stops.find((stop) => stop.kind === 'mystery');
  if (!lamped || lamped.lamp === null) return null;
  if (timeline.calm) {
    const shown = timeline.cues.find((cue) => cue.cue === 'lamp');
    return shown && ms >= shown.at ? { level: lamped.level, lamp: lamped.lamp, stopped: true } : null;
  }
  const piece = timeline.pieces.find((p): p is Extract<Piece, { kind: 'roulette' }> => p.kind === 'roulette');
  if (!piece || ms < piece.at) return null;
  const lamps = LAMP_SETS[piece.level].length;
  if (ms >= piece.at + piece.ms) return { level: piece.level, lamp: lamped.lamp, stopped: true };
  const steps = Math.floor(piece.steps * easeOutCubic(clamp01((ms - piece.at) / piece.ms)));
  return { level: piece.level, lamp: (piece.from + steps) % lamps, stopped: false };
}

/** The deepest disc the ball has reached `ms` into the run (-1 while it is on its way up): the stage lamps lit up to it. */
export function levelAt(timeline: Timeline, ms: number): number {
  let level = -1;
  for (const cue of timeline.cues) if (cue.cue === 'land' && cue.at <= ms) level = Math.max(level, cue.level);
  return level;
}

/** The pocket the ball has settled in on disc `level` by `ms` into the run, or null. */
export function settledAt(timeline: Timeline, ms: number): Stop | null {
  let settled: Stop | null = null;
  for (const cue of timeline.cues) if (cue.cue === 'pocket' && cue.at <= ms) settled = timeline.stops.find((stop) => stop.level === cue.level) ?? null;
  return settled;
}

/** Each disc's pockets, as the canvas colours and labels them: what is printed on each. */
export const pocketLabel = (level: number, pocket: number): string => {
  const p = DISCS[level][pocket];
  if (p.kind === 'up') return level >= 2 ? 'CHANCE' : 'UP';
  if (p.kind === 'out') return 'OUT';
  if (p.kind === 'mystery') return '?';
  if (p.kind === 'jackpot') return 'JP';
  return `×${p.pays}`;
};

// ── The machine's clock ─────────────────────────────────────────────────────

/**
 * The clock the machine runs on: the real time, less every moment the machine was not on show (its Odds tab or its
 * help in front of it). Paused, it stands still: the ball and the discs wait, and go on from the same point when the
 * machine is shown again.
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
