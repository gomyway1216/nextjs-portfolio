/**
 * The maze as it is drawn, and how the medal moves through it.
 *
 * The glass case is a board of 300 × 420 units (the SVG's viewBox). Four lever cups stand at its walls, right, left,
 * right, left (engine.ts `SIDES`), each under the end of a shelf: a medal rolls down the shelf toward the wall, drops
 * off its end into the cup, and waits. The gate stands across the cup's mouth, with the OUT hole under it. A flick
 * sends the medal through the gate in a low lob across the case, under the shelf it came down, onto the next shelf's
 * high end on the other side; the fourth sends it into the pins over the pockets.
 *
 * A medal's way is a list of segments (`Track`), each a little piece of physics worked out in closed form: a fall
 * under gravity, a lob, a roll down a shelf speeding up as it goes (a solid disc rolling: a = 2/3 g sin θ), a bounce
 * dying away, a wobble on a gate's edge. Each says where the medal is, how far it has turned and how it is tipped, at
 * any moment, so the page only has to ask (`poseAt`). The way is fixed by how the play goes (engine.ts), never by the
 * frame rate: a slow phone drops frames, not physics.
 *
 * With less motion asked for (`calm`), the medal is simply put where each piece ends.
 *
 * Nothing here touches React or the browser.
 */

import { PIN_ROWS, POCKETS, SIDES, STAGES, passed, type StageEnd } from './engine';

// ── The board ───────────────────────────────────────────────────────────────

export const BOARD_W = 300;
export const BOARD_H = 436;
/** The medal's radius. */
export const R = 9;
/** Gravity, in units a second a second. */
const G = 1500;

/** Where the medal sits in each lever's cup. */
export const CUPS: readonly { x: number; y: number }[] = Array.from({ length: STAGES }, (_, s) => ({ x: SIDES[s] === 'right' ? 268 : 32, y: 78 + 74 * s }));
/** The plane of each gate, across its cup's mouth: a medal's width and a little in front of the cup's lip. */
export const GATE_X: readonly number[] = CUPS.map((cup, s) => (SIDES[s] === 'right' ? cup.x - 30 : cup.x + 30));
/** The lip of each cup's floor, on the gate's side: the medal rests over the floor, and drops past its lip. */
export const CUP_LIP: readonly number[] = CUPS.map((cup, s) => (SIDES[s] === 'right' ? cup.x - 7 : cup.x + 7));
/** The gate's hinge, at the foot of the cup's mouth, and its flap's length: shut, the flap stands up across the mouth; open, it lies down flat toward the middle of the case, a drawbridge the medal flies over. */
export const GATE_FOOT = (s: number): number => CUPS[s].y + 12;
export const GATE_LENGTH = 26;
/** The OUT hole under each gate: its middle. */
export const HOLES: readonly { x: number; y: number }[] = CUPS.map((cup, s) => ({ x: (GATE_X[s] + CUP_LIP[s]) / 2, y: cup.y + 30 }));
export const HOLE_W = 32;

/** A shelf: the line a medal rolls on, from its high end to its low end at the wall, over the cup it feeds. */
export interface Shelf {
  from: { x: number; y: number };
  to: { x: number; y: number };
}
/** The shelf over each cup. The first is fed by the slot at the top; each other one by the flick before it. */
export const SHELVES: readonly Shelf[] = CUPS.map((cup, s) => {
  const right = SIDES[s] === 'right';
  const wall = right ? cup.x - 6 : cup.x + 6;
  const high = s === 0 ? (right ? 168 : 132) : right ? 138 : 162;
  return { from: { x: high, y: cup.y - 36 }, to: { x: wall, y: cup.y - 24 } };
});
/** The medal slot at the top, over the first shelf. */
export const SLOT = { x: 196, y: 12 };

/** The pins: row `r` (0 at the top) has r + 1 pins, 40 units apart, round the middle. */
export const PIN_TOP = 344;
export const PIN_GAP_Y = 12;
export const PIN_GAP_X = 40;
export const PIN_R = 2.6;
export const PINS: readonly { x: number; y: number; row: number }[] = Array.from({ length: PIN_ROWS }, (_, row) =>
  Array.from({ length: row + 1 }, (_, j) => ({ x: BOARD_W / 2 + (j - row / 2) * PIN_GAP_X, y: PIN_TOP + row * PIN_GAP_Y, row })),
).flat();
/** The pockets under the pins, left to right: their middles and the top of their walls. */
export const POCKET_TOP = PIN_TOP + PIN_ROWS * PIN_GAP_Y - 6;
export const POCKET_W = PIN_GAP_X;
export const POCKET_X: readonly number[] = POCKETS.map((_, k) => BOARD_W / 2 + (k - PIN_ROWS / 2) * PIN_GAP_X);
/** Where a medal rests in a pocket. */
export const POCKET_REST_Y = BOARD_H - 5 - R;
/** Where the fourth flick sends the medal: the mouth of the funnel over the pins. */
export const FUNNEL = { x: BOARD_W / 2, y: PIN_TOP - 20 };

// ── Poses and tracks ────────────────────────────────────────────────────────

/** Where the medal is: its middle, how far it has turned (degrees), how it is tipped toward the glass (1 face on), and how much of it shows. */
export interface Pose {
  x: number;
  y: number;
  turn: number;
  tip: number;
  shown: number;
}

/** A piece of the medal's way, `length` seconds long: where it is `t` seconds in. */
export interface Segment {
  length: number;
  at: (t: number) => Pose;
  /** A sound as the piece begins. */
  sound?: CueSound;
  /** What happens as it begins, for the page to show (a clack, the gate passed, a pin). */
  cue?: Cue;
}
export type CueSound = 'spring' | 'roll' | 'clack' | 'pin' | 'pocket' | 'drop';
export type Cue = 'launch' | 'clack' | 'through' | 'out' | 'cup' | 'pins' | 'pocket';

export interface Track {
  segments: Segment[];
  /** The whole way's length, in seconds. */
  length: number;
}

const track = (segments: Segment[]): Track => ({ segments, length: segments.reduce((sum, s) => sum + s.length, 0) });

/** Where the medal is `t` seconds along a track (held at its end after it). */
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
/** How far a medal rolling `distance` units turns, in degrees (signed by the way it rolls). */
const turnFor = (distance: number): number => (distance / R) * DEG;

/** Standing still at `p` for `length` seconds. */
const hold = (p: Pose, length: number, extra: Partial<Segment> = {}): Segment => ({ length, at: () => p, ...extra });

/** A lob from `from` to `to` in `length` seconds under gravity, spinning `spin` degrees a second. */
function lob(from: Pose, to: { x: number; y: number }, length: number, spin: number, extra: Partial<Segment> = {}): Segment {
  const vx = (to.x - from.x) / length;
  const vy = (to.y - from.y - 0.5 * G * length * length) / length;
  return { length, at: (t) => ({ x: from.x + vx * t, y: from.y + vy * t + 0.5 * G * t * t, turn: from.turn + spin * t, tip: 1, shown: from.shown }), ...extra };
}

/** A fall from `from` to `to` under gravity, starting at `vy` (down), its time worked out; `fade` hides it as it goes (into a hole). */
function fall(from: Pose, to: { x: number; y: number }, vy: number, spin: number, fade = false, extra: Partial<Segment> = {}): Segment {
  const dy = Math.max(0.1, to.y - from.y);
  const length = (-vy + Math.sqrt(vy * vy + 2 * G * dy)) / G;
  return {
    length,
    at: (t) => {
      // Exactly where it was going once it gets there.
      if (t >= length) return { x: to.x, y: to.y, turn: from.turn + spin * length, tip: 1, shown: fade ? 0 : from.shown };
      const u = t / length;
      return { x: from.x + (to.x - from.x) * u, y: from.y + vy * t + 0.5 * G * t * t, turn: from.turn + spin * t, tip: 1, shown: fade ? from.shown * (1 - u * u) : from.shown };
    },
    ...extra,
  };
}

/** A roll down a shelf (its middle `R` above the line) from `from` along to `to`, starting at `speed`: speeding up as a solid disc does. */
function roll(from: { x: number; y: number }, to: { x: number; y: number }, speed: number, turn0: number, extra: Partial<Segment> = {}): Segment {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const a = (2 / 3) * G * (dy / distance);
  const length = a > 0 ? (-speed + Math.sqrt(speed * speed + 2 * a * distance)) / a : distance / speed;
  const way = Math.sign(dx) || 1;
  return {
    length,
    at: (t) => {
      const s = Math.min(distance, speed * t + 0.5 * a * t * t);
      const u = s / distance;
      // A little wobble as it rolls, dying away: a real coin is never quite upright.
      const wobble = 1 - 0.08 * Math.abs(Math.sin(t * 22)) * Math.exp(-t * 3);
      return { x: from.x + dx * u, y: from.y + dy * u, turn: turn0 + way * turnFor(s), tip: wobble, shown: 1 };
    },
    ...extra,
  };
}

/** A medal coming to rest at `p`: a few bounces dying away, `height` units the first. */
function settle(p: Pose, height: number, length: number, extra: Partial<Segment> = {}): Segment {
  return {
    length,
    at: (t) => {
      const u = t / length;
      const hop = height * Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u) ** 2;
      const tip = 1 - 0.25 * Math.abs(Math.sin(u * Math.PI * 5)) * (1 - u);
      return { x: p.x, y: p.y - hop, turn: p.turn, tip, shown: p.shown };
    },
    ...extra,
  };
}

/** A medal wobbling on a gate's edge at `p`: tipping back and forth, faster as it gives. */
function wobbleAt(p: Pose, length: number, extra: Partial<Segment> = {}): Segment {
  return {
    length,
    at: (t) => {
      const u = t / length;
      return { x: p.x + Math.sin(u * Math.PI * 7) * 1.6 * (1 - u * 0.5), y: p.y, turn: p.turn + Math.sin(u * Math.PI * 7) * 12, tip: 0.55 + 0.45 * Math.abs(Math.cos(u * Math.PI * 4.5)), shown: 1 };
    },
    ...extra,
  };
}

const endOf = (segment: Segment): Pose => segment.at(segment.length);
const onShelf = (shelf: Shelf, x: number): { x: number; y: number } => {
  const u = (x - shelf.from.x) / (shelf.to.x - shelf.from.x);
  return { x, y: shelf.from.y + (shelf.to.y - shelf.from.y) * u - R };
};
const restIn = (s: number): Pose => ({ x: CUPS[s].x, y: CUPS[s].y, turn: 0, tip: 1, shown: 1 });

/** From the bottom of a shelf's rolling into cup `s`: off the shelf's low end, down into the cup, and at rest. */
function intoCup(s: number, rolled: Segment, speed: number): Segment[] {
  const off = endOf(rolled);
  const drop = fall(off, CUPS[s], 40, (SIDES[s] === 'right' ? 1 : -1) * speed * 2, false, { sound: 'drop' });
  const landed = endOf(drop);
  return [rolled, drop, settle({ ...landed, x: CUPS[s].x, y: CUPS[s].y }, 4, 0.32, { cue: 'cup' })];
}

/** The medal dropped in at the slot: down onto the first shelf, rolling to its low end, and into the first cup. */
export function dropTrack(calm: boolean): Track {
  const shelf = SHELVES[0];
  const start: Pose = { x: SLOT.x, y: SLOT.y + R, turn: 0, tip: 1, shown: 1 };
  if (calm) return track([hold(start, 0.12, { sound: 'drop' }), hold(restIn(0), 0.2, { cue: 'cup' })]);
  const land = onShelf(shelf, SLOT.x);
  const falling = fall(start, land, 0, 0, false, { sound: 'drop' });
  const bounce = settle({ ...endOf(falling), ...land }, 5, 0.18);
  const rolled = roll(land, onShelf(shelf, shelf.to.x), 30, 0, { sound: 'roll' });
  return track([falling, bounce, ...intoCup(0, rolled, 140)]);
}

/** How long after the release the medal meets the gate, in ms: the window then is the one that counts. */
export const CONTACT_MS = 80;
/** How long a medal wobbles on a gate's edge, in seconds. */
const WOBBLE = 0.42;
/** How long the lob across the case takes, in seconds: straight through, and after a graze took some of its push. */
const LOB = 0.3;
const LOB_GRAZED = 0.34;

/**
 * The medal's way from cup `s` after a flick that ended `end`: through the gate to the next cup (or into the pins from
 * the fourth), or against the gate into the OUT hole; a medal left too long falls through its cup into the hole.
 * The pins themselves are `pinsTrack`.
 */
export function flickTrack(s: number, end: StageEnd, calm: boolean): Track {
  const right = SIDES[s] === 'right';
  const inward = right ? -1 : 1;
  const cup = restIn(s);
  const hole = HOLES[s];
  const last = s === STAGES - 1;
  const next = last ? null : s + 1;
  const landing = next === null ? FUNNEL : onShelf(SHELVES[next], SHELVES[next].from.x + (SIDES[next] === 'right' ? 10 : -10));
  if (calm) {
    if (!passed(end)) return track([hold(cup, 0.12, { sound: end === 'timeout' ? 'drop' : 'clack', cue: end === 'timeout' ? 'out' : 'clack' }), hold({ ...cup, x: hole.x, y: hole.y, shown: 0 }, 0.2, { cue: 'out' })]);
    return track([hold(cup, 0.12, { sound: 'spring', cue: 'launch' }), hold(next === null ? { ...cup, ...FUNNEL } : restIn(next), 0.2, next === null ? { cue: 'pins' } : { cue: 'cup' })]);
  }
  // The medal's edge meets the gate.
  const contact = { x: GATE_X[s] - inward * (R + 1), y: cup.y - 1 };
  const spin = inward * 900;
  if (end === 'timeout') {
    // The cup's floor gives: the medal slides out under the gate and drops into the hole.
    const slide: Segment = {
      length: 0.18,
      at: (t) => {
        const u = t / 0.18;
        return { x: cup.x + (contact.x - cup.x) * u * u, y: cup.y + 3 * u * u, turn: inward * 40 * u * u, tip: 1, shown: 1 };
      },
      sound: 'drop',
      cue: 'out',
    };
    return track([slide, fall(endOf(slide), hole, 60, inward * 200, true)]);
  }
  const launchLength = Math.abs(contact.x - cup.x) / 300;
  const launch: Segment = {
    length: launchLength,
    at: (t) => ({ x: cup.x + (contact.x - cup.x) * (t / launchLength), y: cup.y - (t / launchLength), turn: spin * t, tip: 1, shown: 1 }),
    sound: 'spring',
    cue: 'launch',
  };
  const met = endOf(launch);
  if (end === 'shut') {
    // A bonk off the shut gate, back a little, and down into the hole.
    const back: Segment = {
      length: 0.1,
      at: (t) => {
        const u = t / 0.1;
        return { x: met.x - inward * 3 * Math.sin(u * Math.PI * 0.5), y: met.y - 3 * Math.sin(u * Math.PI), turn: met.turn - spin * 0.05 * u, tip: 1 - 0.3 * Math.sin(u * Math.PI), shown: 1 };
      },
      sound: 'clack',
      cue: 'clack',
    };
    return track([launch, back, fall(endOf(back), hole, 20, -spin * 0.3, true, { cue: 'out' })]);
  }
  const graze = end === 'graze-through' || end === 'graze-out';
  const segments: Segment[] = [launch];
  let from = met;
  if (graze) {
    const wobble = wobbleAt(met, WOBBLE, { sound: 'clack', cue: 'clack' });
    segments.push(wobble);
    from = endOf(wobble);
    if (end === 'graze-out') {
      segments.push(fall(from, hole, 0, -spin * 0.2, true, { cue: 'out', sound: 'drop' }));
      return track(segments);
    }
  }
  // Through the gate, and the lob across the case: slower after a graze, which took some of its push.
  const flight = lob(from, landing, graze ? LOB_GRAZED : LOB, spin * (graze ? 0.7 : 1), { cue: 'through' });
  segments.push(flight);
  if (next === null) return track(segments);
  const shelf = SHELVES[next];
  const landed = endOf(flight);
  const speed = Math.abs((landing.x - from.x) / (graze ? LOB_GRAZED : LOB)) * 0.62;
  const bounce = settle({ ...landed, ...landing }, 3, 0.1, { sound: 'clack' });
  const rolled = roll(landing, onShelf(shelf, shelf.to.x), speed, landed.turn, { sound: 'roll' });
  segments.push(bounce, ...intoCup(next, rolled, speed));
  return track(segments);
}

/** Down through the pins from the funnel, left or right at each row as drawn, into the pocket `bin`. */
export function pinsTrack(pins: readonly boolean[], calm: boolean): Track {
  const bin = pins.filter(Boolean).length;
  const rest: Pose = { x: POCKET_X[bin], y: POCKET_REST_Y, turn: 0, tip: 1, shown: 1 };
  if (calm) return track([hold({ ...rest, x: FUNNEL.x, y: FUNNEL.y }, 0.1, { cue: 'pins' }), hold(rest, 0.2, { sound: 'pocket', cue: 'pocket' })]);
  const segments: Segment[] = [];
  let at: Pose = { x: FUNNEL.x, y: FUNNEL.y, turn: 0, tip: 1, shown: 1 };
  // Down onto the top pin.
  const first = fall(at, { x: FUNNEL.x, y: PIN_TOP - R - PIN_R }, 60, 0, false, { cue: 'pins' });
  segments.push(first);
  at = endOf(first);
  let x = FUNNEL.x;
  for (let row = 0; row < PIN_ROWS; row++) {
    const way = pins[row] ? 1 : -1;
    x += way * (PIN_GAP_X / 2);
    const below = row + 1 < PIN_ROWS ? PIN_TOP + (row + 1) * PIN_GAP_Y - R - PIN_R : POCKET_TOP;
    const hop = lob(at, { x, y: below }, 0.17, way * 520, { sound: 'pin' });
    segments.push(hop);
    at = endOf(hop);
  }
  const drop = fall(at, rest, 120, 0, false);
  segments.push(drop, settle({ ...endOf(drop), ...rest }, 5, 0.35, { sound: 'pocket', cue: 'pocket' }));
  return track(segments);
}

/** Where the medal rests at the end of a play: in the OUT hole under gate `outAt` (hidden), or in its pocket. */
export function restingPose(outAt: number | null, bin: number | null): Pose | null {
  if (outAt !== null) return { x: HOLES[outAt].x, y: HOLES[outAt].y, turn: 0, tip: 1, shown: 0 };
  if (bin !== null) return { x: POCKET_X[bin], y: POCKET_REST_Y, turn: 0, tip: 1, shown: 1 };
  return null;
}
/** Where the medal waits in cup `s`. */
export const cupPose = (s: number): Pose => restIn(s);

// ── The gates ───────────────────────────────────────────────────────────────

/**
 * How open a gate looks, from 0 to 1, `elapsed` ms into its turns, given how open it truly stands in each window
 * (`levels`, window by window, starting at `phase`). It never looks more open than it is: it starts to close in the
 * last fifth of an open window, and only finishes opening in the first fifth of the next. A flick is judged by the
 * window, not by the look.
 */
export function gateLook(levels: readonly number[], phase: number, elapsed: number, windowMs: number, calm: boolean): number {
  const n = levels.length;
  const steps = elapsed / windowMs;
  const index = Math.floor(steps);
  const u = steps - index;
  const level = (k: number) => levels[(((phase + k) % n) + n) % n];
  const here = level(index);
  if (calm) return here;
  const EASE = 0.2;
  const ease = (v: number) => v * v * (3 - 2 * v);
  const after = level(index + 1);
  if (after < here && u > 1 - EASE) return here + (after - here) * ease((u - (1 - EASE)) / EASE);
  const before = level(index - 1);
  if (before < here && u < EASE) return before + (here - before) * ease(u / EASE);
  return here;
}

/** The angle a gate's flap is swung down to for how open it looks: from standing up (0) to lying flat toward the middle of the case. */
export const gateAngle = (s: number, look: number): number => (SIDES[s] === 'right' ? -1 : 1) * 90 * look;
