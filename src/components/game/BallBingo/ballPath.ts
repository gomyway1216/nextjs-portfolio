/**
 * The flight of a ball, from the plunger to the pocket drawn for it.
 *
 * The pocket is drawn when the game is bet (engine.ts); this only works out a
 * flight that ends there, by the field's own physics: the ball is shot up the
 * lane, runs round the inside of the arch until it is too slow to hold to it
 * (a ball on the inside of a curve stays on it while v²/R ≥ g cos θ), comes
 * away and falls under gravity through the pins, bouncing off each pin, wall
 * and post it meets, until it drops into a pocket. A ball in a numbered
 * pocket stays there, standing a little over the posts, and the balls after
 * it bounce off it; a cup whose lamp has gone out is shut.
 *
 * How hard the ball is shot decides where it comes away from the arch, and
 * from there everything follows, as on the real field: two shots a hair
 * apart can end pockets apart. So `planFlight` shoots the ball again and
 * again at strengths drawn from a seeded random number generator, working
 * each flight out to its end without drawing it, until one ends in the
 * pocket drawn, and keeps that one. Nothing about the flight is invented:
 * every frame of it is the physics, and only the strength of the shot was
 * chosen. For the rare pocket no shot reaches in that many tries (a pocket
 * walled in by the balls in its neighbours, say), the ball is given a gentle
 * pull toward it as it falls, no more than a fraction of gravity; and if that
 * fails too, the last stretch of its fall is guided into the pocket. Both are
 * counted (`steered`, `guided`), and the tests hold them to a few flights in
 * a hundred.
 *
 * Everything is pure arithmetic, and the same seed gives the same flight.
 */

import { POCKETS, type GameState, FREE_MOST } from './engine';
import { ARCH, BALL_R, CUPS, CUP_WALL, FIELD, FLAP, FOOT_POCKETS, FOOT_ROW, LANE, PINS, PIN_R, POSTS, POST_HALF, cupOf, footOf, lidOf, restOf } from './field';

/** Gravity, in the drawing's units a second squared (a field 436 tall). */
export const GRAVITY = 1500;
/** How much of its speed into a pin, wall or post a ball keeps out of it, and how much of its speed along the surface. */
const BOUNCE = { pin: 0.45, wall: 0.42, post: 0.36, ball: 0.3, along: 0.97 } as const;
/** The physics' steps a second, and the frames a second the flight is drawn at. */
const STEPS = 360;
/** Below this speed into a surface (units a second) a touch is a roll, not a knock. */
const KNOCK = 25;
export const FPS = 60;
/** The longest a flight is let run, in seconds, before it is given up as stuck. */
const LONGEST = 9;
/** A ball moving slower than this (units a second) for this long (seconds) has stuck. */
const STUCK = { speed: 6, for: 0.45 } as const;

/** How hard a ball can be shot: where it comes away from the arch, as cos θ (θ from the top, 1 = it goes right round). */
const SHOT = { least: 0.26, most: 1.08 } as const;

/** What a flight needs to know of the field: which pockets hold a ball, and which cups are shut. */
export interface FieldState {
  /** The numbered pockets with a ball in them, by their place in `POCKETS`. */
  filled: readonly number[];
  /** Whether the FREE cups are open (their lamps lit). */
  freeOpen: boolean;
  /** Whether the CHANCE cup is open. Once a ball is in it, it holds the ball and is shut. */
  chanceOpen: boolean;
}

/** The field as a game stands. */
export function fieldOf(state: GameState): FieldState {
  return {
    filled: POCKETS.flatMap((p, i) => (p.kind === 'number' && (state.marks & (1 << (p.number - 1))) !== 0 ? [i] : [])),
    freeOpen: state.frees < FREE_MOST,
    chanceOpen: !state.chance,
  };
}

export interface Flight {
  /** The pocket it was planned for, and the pocket it ends in: always the same. */
  target: number;
  landed: number;
  /** The ball's centre at every frame, x and y in turn (`FPS` a second). */
  frames: Float32Array;
  /** The frame it comes away from the arch, and the frame it drops into its pocket. */
  release: number;
  land: number;
  /** The frames at which it strikes a pin hard enough to hear. */
  hits: number[];
  /** How hard it was shot, 0 to 1. */
  power: number;
  /** Shots tried before this one. */
  tries: number;
  /** Whether it was given a pull toward its pocket as it fell, and whether the end of its fall was guided in. */
  steered: boolean;
  guided: boolean;
}

/** A seeded random number generator (mulberry32): the strengths of the shots tried. */
function shots(seed: number): () => number {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── The shot: up the lane and round the arch ────────────────────────────────

interface Shot {
  /** The ball's centre at each frame from the plunger to the moment it comes away. */
  frames: number[];
  /** Where it comes away, and how fast in each direction. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** How long after its last frame it comes away, in seconds: the fall's first frame is due a frame after that last one. */
  lead: number;
}

/**
 * The ball shot at `power`: up the lane (slowed by gravity) and round the
 * arch, until it comes away. A ball that would hold to the arch right over
 * the top runs down its far side to the left wall, and comes away there.
 */
export function shotAt(power: number): Shot {
  const g = GRAVITY;
  const R = ARCH.run;
  const c = SHOT.least + Math.min(1, Math.max(0, power)) * (SHOT.most - SHOT.least);
  // Its speed where the lane opens into the arch, from where it comes away: v² = 3gRc.
  const vTop = Math.sqrt(3 * g * R * c);
  const climb = LANE.bottom - LANE.top;
  const v0 = Math.sqrt(vTop * vTop + 2 * g * climb);
  const frames: number[] = [];
  const dt = 1 / FPS;
  // Up the lane, a frame every `dt`, and on into the arch with what is left of the frame the lane's top falls in, so that
  // the frames stay evenly spaced in time where the one meets the other.
  const laneTime = (v0 - vTop) / g;
  let t = 0;
  for (; t < laneTime; t += dt) frames.push(LANE.x, LANE.bottom - (v0 * t - 0.5 * g * t * t));
  // How long before the lane's top its last frame was.
  let since = laneTime - (t - dt);
  // From the lane's top into the arch, which it meets at θ = 90°, the arch's right end: there, round the arch until it
  // comes away (cos θ = c), or, if it never would, right round to θ = −90° at the left wall.
  const away = c >= 1 ? -Math.PI / 2 : Math.acos(c);
  let theta = Math.PI / 2;
  // The lane's centre line is a little inside the arch's run: the ball eases out to the arch over its first few degrees.
  const laneR = LANE.x - ARCH.cx;
  const speedAt = (at: number) => Math.sqrt(Math.max(1, vTop * vTop - 2 * g * R * Math.cos(at)));
  // Round the arch in small steps of time, a frame kept every `dt`.
  const tiny = dt / 8;
  let lead = 0;
  for (;;) {
    const step = (speedAt(theta) * tiny) / R;
    if (theta - step <= away) {
      lead = since + ((theta - away) * R) / speedAt(theta);
      break;
    }
    theta -= step;
    since += tiny;
    if (since >= dt - 1e-12) {
      since -= dt;
      const ease = Math.min(1, (Math.PI / 2 - theta) / 0.35);
      const r = laneR + (R - laneR) * ease;
      frames.push(ARCH.cx + r * Math.sin(theta), ARCH.cy - r * Math.cos(theta));
    }
  }
  const v = speedAt(away);
  return { frames, x: ARCH.cx + R * Math.sin(away), y: ARCH.cy - R * Math.cos(away), vx: -v * Math.cos(away), vy: -v * Math.sin(away), lead };
}

// ── The fall: through the pins ──────────────────────────────────────────────

/** The pins by the cells of a grid, so that a step looks only at the pins near the ball. */
const CELL = 16;
const GRID_W = Math.ceil(300 / CELL);
const GRID_H = Math.ceil(480 / CELL);
const PIN_GRID: number[][] = (() => {
  const grid: number[][] = Array.from({ length: GRID_W * GRID_H }, () => []);
  PINS.forEach((pin, i) => {
    const reach = PIN_R + BALL_R;
    for (let cx = Math.floor((pin.x - reach) / CELL); cx <= Math.floor((pin.x + reach) / CELL); cx++)
      for (let cy = Math.floor((pin.y - reach) / CELL); cy <= Math.floor((pin.y + reach) / CELL); cy++)
        if (cx >= 0 && cy >= 0 && cx < GRID_W && cy < GRID_H) grid[cy * GRID_W + cx].push(i);
  });
  return grid;
})();

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Pushes the ball out of a round obstacle at (ox, oy) of radius `r`, and bounces it off. Returns its speed into it, or 0 for no touch. */
function offCircle(b: Ball, ox: number, oy: number, r: number, keep: number): number {
  const dx = b.x - ox;
  const dy = b.y - oy;
  const reach = r + BALL_R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  b.x = ox + nx * reach;
  b.y = oy + ny * reach;
  const into = b.vx * nx + b.vy * ny;
  if (into >= 0) return 0;
  const tx = -ny;
  const ty = nx;
  // A knock costs a little of the speed along the surface; a ball rolling round a pin keeps it (rolling is not a knock).
  const along = (b.vx * tx + b.vy * ty) * (-into > KNOCK ? BOUNCE.along : 1);
  // A ball that only rests against the surface stays on it: nothing to bounce back.
  const out = -into > KNOCK ? -into * keep : 0;
  b.vx = nx * out + tx * along;
  b.vy = ny * out + ty * along;
  return -into;
}

/** The same off a stick from (x0, y0) to (x1, y1) of half-thickness `half`, rounded at its ends. */
function offStick(b: Ball, x0: number, y0: number, x1: number, y1: number, half: number, keep: number): number {
  const sx = x1 - x0;
  const sy = y1 - y0;
  const length2 = sx * sx + sy * sy;
  const along = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((b.x - x0) * sx + (b.y - y0) * sy) / length2));
  return offCircle(b, x0 + sx * along, y0 + sy * along, half, keep);
}

/** Where a fall ends: the pocket it dropped into, or null if it stuck or ran too long. */
interface Fall {
  pocket: number | null;
  frames: number[];
  hits: number[];
}

interface Pull {
  /** Where the ball is pulled toward, across the field. */
  x: number;
  /** From how far down the field the pull starts. */
  from: number;
  /** How strong, as a share of gravity at its most. */
  strength: number;
}

/**
 * The ball's fall from where it came away, through the pins, to a pocket: a
 * fixed step of the physics at a time (`STEPS` a second), a frame kept every
 * 1/`FPS` of a second on from the shot's own frames. `pull`, when given,
 * draws the ball sideways toward a point as it falls (the fallback, below).
 */
function fall(field: FieldState, from: Shot, firstFrame: number, pull: Pull | null): Fall {
  const b: Ball = { x: from.x, y: from.y, vx: from.vx, vy: from.vy };
  const dt = 1 / STEPS;
  let nextFrame = Math.max(dt, 1 / FPS - from.lead);
  const frames: number[] = [];
  const hits: number[] = [];
  const filled = new Set(field.filled);
  const caps = FOOT_POCKETS.filter((p) => filled.has(p.pocket));
  const shutCups = CUPS.filter((cup) => (POCKETS[cup.pocket].kind === 'free' ? !field.freeOpen : !field.chanceOpen));
  let slow = 0;
  let lastHit = -10;
  for (let step = 0; step < LONGEST * STEPS; step++) {
    b.vy += GRAVITY * dt;
    if (pull && b.y > pull.from) {
      const ramp = Math.min(1, (b.y - pull.from) / 60);
      const ax = Math.max(-1, Math.min(1, (pull.x - b.x) / 40)) * pull.strength * GRAVITY * ramp;
      b.vx += ax * dt;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    let struck = 0;
    // The arch over the field and the lane, which the ball is inside.
    if (b.y < ARCH.cy) {
      const dx = b.x - ARCH.cx;
      const dy = b.y - ARCH.cy;
      const d = Math.hypot(dx, dy);
      if (d > ARCH.run) {
        const nx = dx / d;
        const ny = dy / d;
        b.x = ARCH.cx + nx * ARCH.run;
        b.y = ARCH.cy + ny * ARCH.run;
        const into = b.vx * nx + b.vy * ny;
        if (into > 0) {
          const along = (b.vx * -ny + b.vy * nx) * BOUNCE.along;
          b.vx = -nx * into * BOUNCE.wall + -ny * along;
          b.vy = -ny * into * BOUNCE.wall + nx * along;
        }
      }
    }
    // The left wall; on the right, the flap over the lane's top (sloping down into the field, so that a ball that comes
    // down on it rolls off into the field: it lets a ball up the lane, never back down it) and the field's wall under it.
    if (b.x < FIELD.left + BALL_R) {
      b.x = FIELD.left + BALL_R;
      if (b.vx < 0) b.vx = -b.vx * BOUNCE.wall;
    }
    if (b.x > FIELD.right - 2 * BALL_R && b.y > ARCH.cy - 3 * BALL_R) {
      offStick(b, FLAP.x0, FLAP.y0, FLAP.x1, FLAP.y1, 1, BOUNCE.wall);
      offStick(b, FIELD.right, FLAP.y1, FIELD.right, FOOT_ROW.bottom + 40, 1, BOUNCE.wall);
    }
    // The pins near it.
    const cell = Math.floor(b.y / CELL) * GRID_W + Math.floor(b.x / CELL);
    const near = cell >= 0 && cell < PIN_GRID.length ? PIN_GRID[cell] : [];
    for (const i of near) struck = Math.max(struck, offCircle(b, PINS[i].x, PINS[i].y, PIN_R, BOUNCE.pin));
    // The cups' walls, and the lids of those shut.
    for (const cup of CUPS) {
      if (Math.abs(b.x - cup.cx) > cup.half + 12 || Math.abs(b.y - (cup.top + cup.depth / 2)) > cup.depth + 12) continue;
      offStick(b, cup.cx - cup.half, cup.top, cup.cx - cup.half, cup.top + cup.depth, CUP_WALL, BOUNCE.post);
      offStick(b, cup.cx + cup.half, cup.top, cup.cx + cup.half, cup.top + cup.depth, CUP_WALL, BOUNCE.post);
      offStick(b, cup.cx - cup.half, cup.top + cup.depth, cup.cx + cup.half, cup.top + cup.depth, CUP_WALL, BOUNCE.post);
      if (shutCups.includes(cup)) {
        const lid = lidOf(cup);
        offCircle(b, lid.cx, lid.cy, lid.r, BOUNCE.post);
      }
    }
    // The posts at the foot, and the balls standing in the pockets.
    if (b.y > FOOT_ROW.postTop - 2 * BALL_R) {
      for (const x of POSTS) if (Math.abs(b.x - x) < BALL_R + 3) offStick(b, x, FOOT_ROW.postTop, x, FOOT_ROW.bottom + 40, POST_HALF, BOUNCE.post);
      for (const cap of caps) offCircle(b, cap.cx, FOOT_ROW.restY, BALL_R, BOUNCE.ball);
    }

    // Into a cup that is open: in once it is inside its walls and below its rim.
    for (const cup of CUPS) {
      if (shutCups.includes(cup)) continue;
      if (Math.abs(b.x - cup.cx) < cup.half - CUP_WALL && b.y > cup.top + 2 && b.y < cup.top + cup.depth) return { pocket: cup.pocket, frames, hits };
    }
    // Into a pocket at the foot: in once it is below the posts' tops between two of them. A pocket with a ball standing
    // in it takes no other (the ball in it stands in the way).
    if (b.y > FOOT_ROW.inLine) {
      const at = FOOT_POCKETS.find((p) => b.x >= p.x0 && b.x < p.x1);
      if (!at || filled.has(at.pocket)) return { pocket: null, frames, hits };
      return { pocket: at.pocket, frames, hits };
    }

    if (struck > 60 && step - lastHit > STEPS / 30) {
      hits.push(firstFrame + Math.floor(frames.length / 2));
      lastHit = step;
    }
    // A frame every 1/FPS of a second from the shot's last, the first one `lead` short of that.
    if ((step + 1) * dt >= nextFrame - 1e-9) {
      frames.push(b.x, b.y);
      nextFrame += 1 / FPS;
    }
    const speed = Math.hypot(b.vx, b.vy);
    slow = speed < STUCK.speed ? slow + dt : 0;
    if (slow > STUCK.for) return { pocket: null, frames, hits };
  }
  return { pocket: null, frames, hits };
}

/** The ball's last frames, from where it dropped in to where it comes to rest (or, into OUT, falls away below the field). */
function settle(pocket: number, x: number, y: number): number[] {
  const rest = restOf(pocket);
  const out = POCKETS[pocket].kind === 'out';
  const count = out ? 14 : 8;
  const frames: number[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    const ease = out ? t * t : 1 - (1 - t) * (1 - t);
    frames.push(x + (rest.x - x) * ease, y + (rest.y - y) * ease);
  }
  return frames;
}

/**
 * The guided ending, the last resort: the ball's own fall up to a little over
 * its pocket's row, then a hop into the pocket (a short arc under gravity).
 */
function guidedEnd(fallen: number[], pocket: number): number[] {
  const rest = restOf(pocket);
  const cup = cupOf(pocket);
  const above = cup ? cup.top - 30 : FOOT_ROW.postTop - 30;
  let cut = 0;
  for (let i = 0; i + 1 < fallen.length; i += 2) {
    cut = i;
    if (fallen[i + 1] > above) break;
  }
  const kept = fallen.slice(0, cut + 2);
  const x0 = kept.length ? kept[kept.length - 2] : rest.x;
  const y0 = kept.length ? kept[kept.length - 1] : above;
  const mouthY = cup ? cup.top + 3 : FOOT_ROW.inLine;
  const count = 22;
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    // A small arc: up a little, then down onto the pocket's mouth.
    const x = x0 + (rest.x - x0) * t;
    const y = y0 + (mouthY - y0) * t * t - 14 * Math.sin(Math.PI * t);
    kept.push(x, y);
  }
  return kept;
}

/** How many shots are tried before the ball is pulled, and how many pulled before its end is guided. */
export const TRIES = { free: 180, pulled: 24 } as const;

/**
 * A flight of the ball that ends in `target`, on the field as it stands: the
 * first of the shots tried (at strengths from `seed`) that drops into it.
 */
export function planFlight(field: FieldState, target: number, seed: number): Flight {
  const steps = planning(field, target, seed);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

/** A flight being planned a shot at a time, so that a page can plan the next ball while the one before it is in the air. */
export interface Planner {
  /** Tries shots for up to `budget` milliseconds (at least one), and gives the flight once one has been found. */
  work: (budget: number) => Flight | null;
  /** The flight, planned to its end now. */
  finish: () => Flight;
}

export function startPlan(field: FieldState, target: number, seed: number): Planner {
  const steps = planning(field, target, seed);
  let found: Flight | null = null;
  const work = (budget: number): Flight | null => {
    if (found) return found;
    const until = performance.now() + budget;
    do {
      const next = steps.next();
      if (next.done) {
        found = next.value;
        return found;
      }
    } while (performance.now() < until);
    return null;
  };
  return { work, finish: () => work(Infinity)! };
}

/** The planning itself: yields after every shot tried, and returns the flight. */
function* planning(field: FieldState, target: number, seed: number): Generator<void, Flight, void> {
  const random = shots(seed);
  const foot = footOf(target);
  const cup = cupOf(target);
  if (!foot && !cup) throw new Error(`no pocket ${target}`);
  const make = (shot: Shot, fallen: Fall, power: number, tries: number, steered: boolean): Flight => {
    const release = shot.frames.length / 2;
    const last = fallen.frames.length;
    const lx = last ? fallen.frames[last - 2] : shot.x;
    const ly = last ? fallen.frames[last - 1] : shot.y;
    const all = [...shot.frames, ...fallen.frames];
    const land = all.length / 2;
    all.push(...settle(target, lx, ly));
    return { target, landed: target, frames: Float32Array.from(all), release, land, hits: fallen.hits, power, tries, steered, guided: false };
  };
  let nearest: { power: number; miss: number } | null = null;
  const aimX = foot ? foot.cx : cup!.cx;
  for (let tries = 0; tries < TRIES.free; tries++) {
    const power = random();
    const shot = shotAt(power);
    const fallen = fall(field, shot, shot.frames.length / 2, null);
    if (fallen.pocket === target) return make(shot, fallen, power, tries, false);
    // Remembered: how far from the pocket it came down, for the pull.
    const n = fallen.frames.length;
    if (n >= 2) {
      const miss = Math.abs(fallen.frames[n - 2] - aimX);
      if (!nearest || miss < nearest.miss) nearest = { power, miss };
    }
    yield;
  }
  // Pulled toward the pocket as it falls, gently, starting from the nearest shot and from others round it.
  for (let tries = 0; tries < TRIES.pulled; tries++) {
    const power = tries === 0 && nearest ? nearest.power : random();
    const shot = shotAt(power);
    const pull: Pull = { x: aimX, from: cup ? Math.max(ARCH.cy, cup.top - 120) : 230, strength: 0.12 + 0.02 * tries };
    const fallen = fall(field, shot, shot.frames.length / 2, pull);
    if (fallen.pocket === target) return make(shot, fallen, power, TRIES.free + tries, true);
    yield;
  }
  // The last resort: its own fall, and the end of it guided in.
  const power = nearest?.power ?? 0.5;
  const shot = shotAt(power);
  const fallen = fall(field, shot, shot.frames.length / 2, null);
  const guided = guidedEnd(fallen.frames, target);
  const all = [...shot.frames, ...guided];
  const land = all.length / 2;
  const rest = restOf(target);
  all.push(...settle(target, all.length ? all[all.length - 2] : rest.x, all.length ? all[all.length - 1] : rest.y));
  return {
    target,
    landed: target,
    frames: Float32Array.from(all),
    release: shot.frames.length / 2,
    land,
    hits: fallen.hits.filter((frame) => frame < land),
    power,
    tries: TRIES.free + TRIES.pulled,
    steered: true,
    guided: true,
  };
}

/** Where the ball is `frame` frames into a flight (between frames, in between): the last frame once it is over. */
export function poseAt(flight: Flight, frame: number): { x: number; y: number } {
  const count = flight.frames.length / 2;
  if (count === 0) return { x: LANE.x, y: LANE.bottom };
  const at = Math.max(0, Math.min(count - 1, frame));
  const i = Math.floor(at);
  const j = Math.min(count - 1, i + 1);
  const f = at - i;
  return {
    x: flight.frames[i * 2] + (flight.frames[j * 2] - flight.frames[i * 2]) * f,
    y: flight.frames[i * 2 + 1] + (flight.frames[j * 2 + 1] - flight.frames[i * 2 + 1]) * f,
  };
}

/** How long a flight lasts, in milliseconds. */
export const flightMs = (flight: Flight): number => (flight.frames.length / 2 / FPS) * 1000;

/**
 * The fall worked out for one shot, for a test: the pocket it ends in on the
 * field as it stands (null if it sticks), and its frames.
 */
export function landingOf(field: FieldState, power: number): { pocket: number | null; frames: number[] } {
  const shot = shotAt(power);
  const fallen = fall(field, shot, shot.frames.length / 2, null);
  return { pocket: fallen.pocket, frames: [...shot.frames, ...fallen.frames] };
}
