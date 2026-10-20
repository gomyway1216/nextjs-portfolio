/**
 * The smart ball table as it is drawn, the plunger's gauge, and how a marble moves over the board.
 *
 * The board is 300 × 470 units (the SVG's viewBox), seen from above as a player leaning over the table sees it: the
 * far end at the top. The plunger stands at the near right-hand corner, under a lane that runs up the right-hand side
 * to the rail round the top. A shot marble runs up the lane, round the rail, slowing as it climbs, and rolls off the
 * rail where its push gives out; it falls on through two rows of pins onto the square of sixteen holes, and down a
 * column of them to the hole it drops into, or past them all into the OUT gutter along the near end.
 *
 * A marble's way is a list of segments (`Track`), each a little piece of physics worked out in closed form: a run up
 * the lane and round the rail at an even deceleration (the slope and the rail's rub), a fall under the slope's pull, a
 * hop from pin to pin, a rattle over a marble already in a hole, a roll into a hole and round its rim until it settles.
 * Each says where the marble is and how far it has turned at any moment, so the page only has to ask (`poseAt`). The
 * way is fixed by where the play's draw sends the marble (engine.ts), never by the frame rate: a slow phone drops
 * frames, not physics.
 *
 * With less motion asked for (`calm`), the marble is simply put where each piece ends.
 *
 * Nothing here touches React or the browser.
 */

import { SIZE, WINDOWS, type MarblePlay } from './engine';

// ── The board ───────────────────────────────────────────────────────────────

export const BOARD_W = 300;
export const BOARD_H = 470;
/** A marble's radius. */
export const MR = 7.5;
/** The slope's pull on a falling marble, in units a second a second. */
const G = 1300;

/** The lane up the right-hand side: its middle, and the wall between it and the board. */
export const LANE_X = 279;
export const LANE_WALL = 266;
/** Where a marble waits on the plunger's tip, at the foot of the lane. */
export const REST = { x: LANE_X, y: 418 };
/** The plunger's tip at rest, under the marble, and how far it draws back at full strength. */
export const PLUNGER_TIP = REST.y + MR;
export const PLUNGER_DRAW = 18;

/** The rail round the top: a half circle, its middle, and the radius the marble's middle runs at. */
export const ARC = { x: 150, y: 150, r: LANE_X - 150 };
/** Where the marble is at angle `theta` on the rail (0 at the top of the lane, π at the far left). */
export const onArc = (theta: number): { x: number; y: number } => ({ x: ARC.x + ARC.r * Math.cos(theta), y: ARC.y - ARC.r * Math.sin(theta) });


/** The two rows of pins under the rail: their heights, and each pin's place across. */
export const PIN_R = 2.4;
export const PIN_ROWS: readonly { y: number; xs: readonly number[] }[] = [
  { y: 168, xs: Array.from({ length: 15 }, (_, i) => 24 + i * 16) },
  { y: 192, xs: Array.from({ length: 14 }, (_, i) => 32 + i * 16) },
];

/** The square of holes: its columns' and rows' middles, and a hole's radius. */
export const COL_X: readonly number[] = Array.from({ length: SIZE }, (_, c) => 61 + c * 50);
export const ROW_Y: readonly number[] = Array.from({ length: SIZE }, (_, r) => 236 + r * 52);
export const HOLE_R = 10.5;
/** Where a hole is. */
export const holeXY = (hole: number): { x: number; y: number } => ({ x: COL_X[hole % SIZE], y: ROW_Y[Math.floor(hole / SIZE)] });
/** The pins that guard each hole: a pair either side of its top, as a horseshoe over it. */
export const GUARD_DX = 14;
export const GUARD_DY = 10;
/** The gaps between the columns, and at either side of them, a marble that misses every hole runs down. */
export const GAP_X: readonly number[] = Array.from({ length: SIZE + 1 }, (_, i) => 36 + i * 50);
/** Where the columns begin: a marble comes off the pins here, over its column or gap. */
export const CARD_TOP = 212;
/** The OUT gutter along the near end, and where a marble that falls into it rolls away to. */
export const GUTTER_Y = 446;
export const DRAIN = { x: 18, y: GUTTER_Y };

// ── The plunger's gauge ─────────────────────────────────────────────────────

/** How long the plunger takes to draw back from rest to full strength, in ms: it then eases back, and so on, while held. */
export const SWEEP_MS = 1_000;
/** Under this much of full strength the marble does not reach the rail: it rolls back down the lane. */
export const DEAD = 0.1;

/** How far the plunger is drawn back, from 0 to 1, `held` ms after it was taken hold of: back and forth, a sweep each way. */
export function strengthAt(held: number): number {
  const u = Math.max(0, held) / SWEEP_MS;
  const phase = u % 2;
  return phase <= 1 ? phase : 2 - phase;
}

/** The strength a shot at `strength` (0 to 1) goes at, 0 to 6, or -1: too weak to reach the rail. */
export function windowOf(strength: number): number {
  if (strength < DEAD) return -1;
  return Math.min(WINDOWS - 1, Math.floor(((strength - DEAD) / (1 - DEAD)) * WINDOWS));
}

/** The window a plunger let go `held` ms after it was taken hold of shoots at (-1: too weak). */
export const windowAtHeld = (held: number): number => windowOf(strengthAt(held));

// ── Poses and tracks ────────────────────────────────────────────────────────

/** Where the marble is: its middle, how far it has turned (degrees), how much of it shows, and how deep it has sunk into a hole (0 to 1). */
export interface Pose {
  x: number;
  y: number;
  turn: number;
  shown: number;
  sunk: number;
}

/** A piece of the marble's way, `length` seconds long: where it is `t` seconds in. */
export interface Segment {
  length: number;
  at: (t: number) => Pose;
  /** A sound as the piece begins. */
  sound?: CueSound;
  /** What happens as it begins, for the page to show. */
  cue?: Cue;
}
export type CueSound = 'spring' | 'roll' | 'pin' | 'rattle' | 'hole' | 'drop';
/** `hole`: the marble has dropped into its hole (the hole lights); `out`: into the gutter; `back`: rolled back onto the plunger. */
export type Cue = 'launch' | 'rail' | 'pins' | 'hole' | 'out' | 'back' | 'ready';

export interface Track {
  segments: Segment[];
  /** The whole way's length, in seconds. */
  length: number;
}

const track = (segments: Segment[]): Track => ({ segments, length: segments.reduce((sum, s) => sum + s.length, 0) });

/** Where the marble is `t` seconds along a track (held at its end after it). */
export function poseAt(way: Track, t: number): Pose {
  const last = way.segments[way.segments.length - 1];
  if (t >= way.length) return last.at(last.length);
  let left = Math.max(0, t);
  for (const segment of way.segments) {
    if (left <= segment.length) return segment.at(left);
    left -= segment.length;
  }
  return last.at(last.length);
}

/** The cues and sounds of a track, with when each comes (seconds from its start). */
export function cuesOf(way: Track): { at: number; cue?: Cue; sound?: CueSound }[] {
  const out: { at: number; cue?: Cue; sound?: CueSound }[] = [];
  let at = 0;
  for (const segment of way.segments) {
    if (segment.cue || segment.sound) out.push({ at, cue: segment.cue, sound: segment.sound });
    at += segment.length;
  }
  return out;
}

const DEG = 180 / Math.PI;
/** How far a marble rolling `distance` units turns, in degrees. */
const turnFor = (distance: number): number => (distance / MR) * DEG;
const endOf = (segment: Segment): Pose => segment.at(segment.length);
const pose = (x: number, y: number, turn = 0, extra: Partial<Pose> = {}): Pose => ({ x, y, turn, shown: 1, sunk: 0, ...extra });

/** Standing still at `p` for `length` seconds. */
const hold = (p: Pose, length: number, extra: Partial<Segment> = {}): Segment => ({ length, at: () => p, ...extra });

/** A flight from `from` to `to` in `length` seconds under the slope's pull. */
function flight(from: Pose, to: { x: number; y: number }, length: number, extra: Partial<Segment> = {}): Segment {
  const vx = (to.x - from.x) / length;
  const vy = (to.y - from.y - 0.5 * G * length * length) / length;
  const spin = turnFor(Math.hypot(to.x - from.x, to.y - from.y)) / length;
  return {
    length,
    at: (t) => {
      if (t >= length) return pose(to.x, to.y, from.turn + spin * length);
      return pose(from.x + vx * t, from.y + vy * t + 0.5 * G * t * t, from.turn + spin * t);
    },
    ...extra,
  };
}

/** How long a fall from rest (or from `vy`, down the board) takes over `dy` units. */
const fallTime = (dy: number, vy = 0): number => (-vy + Math.sqrt(vy * vy + 2 * G * Math.max(0.1, dy))) / G;

/** A roll in a straight line from `from` to `to` under the slope's pull, starting at `vy` down the board. */
function rollDown(from: Pose, to: { x: number; y: number }, vy: number, extra: Partial<Segment> = {}): Segment {
  const dy = to.y - from.y;
  const length = fallTime(dy, vy);
  return {
    length,
    at: (t) => {
      if (t >= length) return pose(to.x, to.y, from.turn + turnFor(Math.hypot(to.x - from.x, dy)));
      const s = vy * t + 0.5 * G * t * t;
      const u = Math.min(1, s / Math.max(0.1, dy));
      return pose(from.x + (to.x - from.x) * u, from.y + dy * u, from.turn + turnFor(Math.hypot(to.x - from.x, dy) * u));
    },
    ...extra,
  };
}

// ── Up the lane and round the rail ──────────────────────────────────────────

/** The lane's length from the marble at rest to the foot of the rail, and how fast the slope and the rail slow a marble. */
const LANE = REST.y - ARC.y;
const SLOWING = 2_100;
/** How fast a marble is still going as it rolls off the rail. */
const LEAVING = 50;

/** How fast a shot at `window` leaves the plunger: enough to reach its point on the rail, slowing all the way. */
export const launchSpeed = (window: number): number => Math.sqrt(LEAVING * LEAVING + 2 * SLOWING * (LANE + ARC.r * LEAVE[window]));

/** Where the marble is along the lane and the rail, `s` units from rest. */
function alongRail(s: number): { x: number; y: number } {
  if (s <= LANE) return { x: REST.x, y: REST.y - s };
  return onArc((s - LANE) / ARC.r);
}

/** Up the lane and round the rail to the point where a shot at `window` rolls off it. */
function railRun(window: number): Segment {
  const v0 = launchSpeed(window);
  const distance = LANE + ARC.r * LEAVE[window];
  const length = (v0 - LEAVING) / SLOWING;
  return {
    length,
    at: (t) => {
      const u = Math.min(t, length);
      const s = Math.min(distance, v0 * u - 0.5 * SLOWING * u * u);
      const p = alongRail(s);
      return pose(p.x, p.y, -turnFor(s));
    },
    sound: 'spring',
    cue: 'launch',
  };
}

/** The direction a marble rolling round the rail is going at angle `theta`. */
const railHeading = (theta: number): { x: number; y: number } => ({ x: -Math.sin(theta), y: -Math.cos(theta) });

/** Where a marble that rolls off the rail at angle `theta` comes down on the first row of pins, across: under that point, carried on a little the way it was going. */
export function landingX(theta: number): number {
  const from = onArc(theta);
  const heading = railHeading(theta);
  const t = fallTime(PIN_ROWS[0].y - PIN_R - MR - from.y, heading.y * LEAVING);
  return from.x + heading.x * LEAVING * t;
}

/**
 * Where each strength's marble comes down on the pins, across: softly over the right-hand column of holes, hard over
 * the left-hand one, the middle strength over the middle of the square (its chances are the same either side). Each
 * lies over the columns its chances favour (engine.ts `COLUMN_WEIGHTS`).
 */
export const DROP_X: readonly number[] = [222, 200, 166, 136, 106, 72, 50];

/** Where each strength rolls off the rail, as an angle (0 at the top of the lane): the one that brings it down at its `DROP_X`. The lamps on the rail stand there. */
export const LEAVE: readonly number[] = DROP_X.map((x) => {
  let lo = 0.3;
  let hi = Math.PI - 0.05;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (landingX(mid) > x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
});

/** Off the rail: a fall from where it rolled off, keeping its way a little, to the first row of pins at `x`. */
function offRail(window: number, from: Pose, x: number): Segment {
  const heading = railHeading(LEAVE[window]);
  const vy = heading.y * LEAVING;
  const target = { x, y: PIN_ROWS[0].y - PIN_R - MR };
  const length = fallTime(target.y - from.y, vy);
  return flight(from, target, length, { cue: 'rail', sound: 'roll' });
}

// ── Through the pins and down the square ────────────────────────────────────

/** The pin of row `row` nearest to `x`. */
const pinNear = (row: number, x: number): number => PIN_ROWS[row].xs.reduce((best, pin) => (Math.abs(pin - x) < Math.abs(best - x) ? pin : best), PIN_ROWS[row].xs[0]);

/** The pin of the first row a shot at `window` comes down on: the one under where it falls. */
export const firstPin = (window: number): number => pinNear(0, landingX(LEAVE[window]));

/** A little hop from one pin onto the next, `length` seconds long. */
const HOP = 0.13;

/**
 * From the first pin to the top of the square, over the column (or the gap) `x`: a hop onto a pin of the second row,
 * on the way, and down off it.
 */
function throughPins(from: Pose, x: number, extra: number): Segment[] {
  const toward = from.x + (x - from.x) * 0.55 + extra;
  const second = pinNear(1, Math.min(240, Math.max(32, toward)));
  const onSecond = { x: second, y: PIN_ROWS[1].y - PIN_R - MR };
  const hop1 = flight(from, onSecond, HOP + Math.abs(onSecond.x - from.x) / 900, { sound: 'pin', cue: 'pins' });
  const atTop = { x, y: CARD_TOP };
  const hop2 = flight(endOf(hop1), atTop, HOP + Math.abs(atTop.x - onSecond.x) / 900, { sound: 'pin' });
  return [hop1, hop2];
}

/** How long a marble takes to pass a row of holes, thrown round one it does not drop into, or rattling over a lit one. */
const PAST = 0.1;
const RATTLE = 0.14;

/** Thrown past a hole (it never meets it): round it, off one of its guard pins, and on down the column. */
function pastHole(from: Pose, hole: { x: number; y: number }, side: number): Segment[] {
  const beside = { x: hole.x + side * (HOLE_R + MR + 1), y: hole.y };
  const below = { x: hole.x, y: hole.y + 26 };
  const round: Segment = {
    length: PAST,
    at: (t) => {
      const u = t / PAST;
      // Out to the side of the hole and back in under it: a curve, not a corner.
      const e = Math.sin(u * Math.PI);
      const x = from.x + (below.x - from.x) * u + (beside.x - hole.x) * e;
      const y = from.y + (below.y - from.y) * u;
      return pose(x, y, from.turn + turnFor(Math.hypot(below.x - from.x, below.y - from.y) * u));
    },
    sound: 'pin',
  };
  return [round];
}

/** Over a hole a marble already sits in: a little bump up and over it, with a click of glass on glass. */
function overMarble(from: Pose, hole: { x: number; y: number }): Segment {
  const below = { x: hole.x, y: hole.y + 26 };
  return {
    length: RATTLE,
    at: (t) => {
      const u = t / RATTLE;
      const bump = Math.sin(u * Math.PI) * 3;
      return pose(from.x + (below.x - from.x) * u + bump * 0.6, from.y + (below.y - from.y) * u, from.turn + turnFor(Math.hypot(below.x - from.x, below.y - from.y) * u) + bump * 10);
    },
    sound: 'rattle',
  };
}

/** Into a hole: over its lip, round its rim a turn or so, and down into it, settling. */
function intoHole(from: Pose, hole: { x: number; y: number }): Segment[] {
  const toLip = flight(from, { x: hole.x, y: hole.y - 3 }, 0.09, {});
  const lip = endOf(toLip);
  const SETTLE = 0.34;
  const settle: Segment = {
    length: SETTLE,
    at: (t) => {
      const u = t / SETTLE;
      // Round the rim, the circle tightening as it sinks.
      const radius = 3 * (1 - u) * (1 - u);
      const angle = -Math.PI / 2 + u * Math.PI * 3.2;
      return pose(hole.x + radius * Math.cos(angle), hole.y + radius * Math.sin(angle), lip.turn + u * 300, { sunk: Math.min(1, u * 1.4) });
    },
    sound: 'hole',
    cue: 'hole',
  };
  return [toLip, settle];
}

/** Down the gutter to the drain, and out of sight. */
function intoGutter(from: Pose): Segment[] {
  const down = rollDown(from, { x: from.x, y: GUTTER_Y }, 60, { sound: 'drop', cue: 'out' });
  const landed = endOf(down);
  const length = 0.35;
  const away: Segment = {
    length,
    at: (t) => {
      const u = t / length;
      return pose(landed.x + (DRAIN.x - landed.x) * u * u, GUTTER_Y, landed.turn - turnFor((landed.x - DRAIN.x) * u * u), { shown: 1 - u * u });
    },
  };
  return [down, away];
}

/** A small, fixed sway for a marble, from the slot the pins threw it by: no two shots take quite the same way. */
const swayOf = (slot: number): number => ((slot * 37) % 11) - 5;

/**
 * A marble's whole way, shot at the strength its play says (`marble`): up the lane and round the rail, off it onto
 * the pins, down to its column (or a gap), past the holes above where the pins drop it, over any lit one, into its
 * hole or down into the gutter. The cue `hole` is when it drops in (the hole lights then).
 */
export function shotTrack(marble: MarblePlay, slot: number, calm: boolean, drawn = 0): Track {
  const { window, entry, hole, over } = marble;
  const holeAt = hole === null ? null : holeXY(hole);
  if (calm) {
    const segments: Segment[] = [hold(pose(REST.x, REST.y), 0.08, { sound: 'spring', cue: 'launch' })];
    if (holeAt) segments.push(hold(pose(holeAt.x, holeAt.y, 0, { sunk: 1 }), 0.25, { sound: 'hole', cue: 'hole' }));
    else segments.push(hold(pose(DRAIN.x, GUTTER_Y, 0, { shown: 0 }), 0.25, { sound: 'drop', cue: 'out' }));
    return track(segments);
  }
  const run = railRun(window);
  const off = offRail(window, endOf(run), firstPin(window));
  const sway = swayOf(slot);
  // From where the plunger was drawn back to, the marble riding down with its tip: the spring snaps it up to the foot of
  // the lane in a moment, and the run begins.
  const snap: Segment = { length: 0.03, at: (t) => pose(REST.x, REST.y + Math.max(0, drawn) * PLUNGER_DRAW * (1 - Math.min(1, t / 0.03))) };
  // The column the pins send it down, or, for a marble that misses every hole, the gap nearest its way.
  const x = entry ? COL_X[entry.col] : GAP_X.reduce((best, gap) => (Math.abs(gap - (endOf(off).x + sway)) < Math.abs(best - (endOf(off).x + sway)) ? gap : best), GAP_X[0]);
  const segments: Segment[] = [snap, run, off, ...throughPins(endOf(off), x, sway)];
  let at = endOf(segments[segments.length - 1]);
  if (!entry) {
    // Down a gap between the columns, clear of every hole, and into the gutter.
    segments.push(...intoGutter(at));
    return track(segments);
  }
  for (let row = 0; row < SIZE; row++) {
    const spot = { x: COL_X[entry.col], y: ROW_Y[row] };
    let piece: Segment[];
    if (row < entry.row) piece = pastHole(at, spot, (row + slot) % 2 === 0 ? 1 : -1);
    else if (over.includes(row * SIZE + entry.col)) piece = [overMarble(at, spot)];
    else if (hole !== null && row === Math.floor(hole / SIZE)) {
      segments.push(...intoHole(at, spot));
      return track(segments);
    } else piece = [];
    segments.push(...piece);
    if (piece.length) at = endOf(piece[piece.length - 1]);
  }
  // Over every hole of its column, all lit: on down into the gutter.
  segments.push(...intoGutter(at));
  return track(segments);
}

/** A shot too weak to reach the rail: a little way up the lane, and back down onto the plunger. */
export function weakTrack(calm: boolean): Track {
  const start = pose(REST.x, REST.y);
  if (calm) return track([hold(start, 0.15, { sound: 'spring', cue: 'back' })]);
  const rise = 60;
  const up = Math.sqrt(2 * SLOWING * rise);
  const length = (2 * up) / SLOWING;
  return track([
    {
      length,
      at: (t) => {
        const s = Math.max(0, up * t - 0.5 * SLOWING * t * t);
        return pose(REST.x, REST.y - s, -turnFor(s));
      },
      sound: 'spring',
    },
    hold(start, 0.05, { cue: 'back' }),
  ]);
}

/** The next marble rolling out of the tray onto the plunger. */
export function loadTrack(calm: boolean): Track {
  const from = pose(REST.x + 2, REST.y + 30, 0, { shown: 0 });
  if (calm) return track([hold(pose(REST.x, REST.y), 0.05, { cue: 'ready' })]);
  const length = 0.22;
  return track([
    {
      length,
      at: (t) => {
        const u = t / length;
        const e = 1 - (1 - u) * (1 - u);
        return pose(from.x + (REST.x - from.x) * e, from.y + (REST.y - from.y) * e, -turnFor(30 * e), { shown: Math.min(1, u * 2) });
      },
      sound: 'roll',
    },
    hold(pose(REST.x, REST.y), 0.02, { cue: 'ready' }),
  ]);
}

/** Where a marble waits on the plunger. */
export const restPose = (): Pose => pose(REST.x, REST.y);

// ── The machine's clock ─────────────────────────────────────────────────────

/**
 * The clock a play runs on: the plunger's sweep and the marble's way. It stops while the machine is not on show (its
 * Odds tab is open, or its help is), and goes on from where it stopped, so that a look at the odds never moves a
 * marble or the plunger. A page that is hidden or left is not paused: it gives up the medals, and the play is
 * finished (medalTable.ts).
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
