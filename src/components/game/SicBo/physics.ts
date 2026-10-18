/**
 * The shaker's physics: three dice under a glass dome on a platter that the machine
 * shakes, a small seeded physics model played back to land on a roll that was
 * drawn before it.
 *
 * The roll is the game's own draw (`drawDice` in engine.ts), made first, as
 * on the electronic tables: the shaker only shows it. While the platter
 * shakes, every die that touches it is kicked back up, turning over as it
 * flies; the dome's glass and the other dice knock it about. Then the platter
 * stops, and the dice bounce lower each time, slide, roll over an edge onto a
 * face and come to rest, each where it is pushed.
 *
 * Which face ends up is the physics' own, as it would be. The faces drawn are
 * then given to the dice like this: the model is run once, each die's last
 * face is read, and the die is turned over in its own frame (by one of the
 * cube's 24 turns, the smallest one that brings the drawn number up) a little
 * at a time while it tumbles fastest, early in the shake, and not at all
 * afterwards. A die spinning at a few dozen turns a second is not seen to
 * turn a quarter more; everything after the turn is the model's own motion of
 * a cube, which looks the same whichever way round it is labelled. So every
 * roll ends on the faces drawn, and the odds are the game's.
 *
 * Units: the edge of a die is 1. The platter is seen from above at a slant:
 * x runs to the right, y towards the player, z up off the platter. The dome
 * is a half ball of radius `DOME` round the platter's middle.
 *
 * Nothing here touches the browser, and nothing is drawn at random: a seed
 * fixes every throw.
 */

import { FACES, seeded, type Dice, type Face } from './engine';

// ── Vectors and turns ───────────────────────────────────────────────────────

export interface Vec {
  x: number;
  y: number;
  z: number;
}
/** A turn, as a unit quaternion: the die's own frame turned into the platter's. */
export interface Quat {
  w: number;
  x: number;
  y: number;
  z: number;
}
/** Where a die is and which way round. `z` is the height of its middle over the platter. */
export interface Pose {
  x: number;
  y: number;
  z: number;
  q: Quat;
}

const vec = (x: number, y: number, z: number): Vec => ({ x, y, z });
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec, b: Vec): Vec => vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const length = (a: Vec): number => Math.hypot(a.x, a.y, a.z);
const scaled = (a: Vec, k: number): Vec => vec(a.x * k, a.y * k, a.z * k);
const unit = (a: Vec): Vec => {
  const l = length(a);
  return l > 1e-12 ? scaled(a, 1 / l) : vec(1, 0, 0);
};

export const IDENTITY: Quat = { w: 1, x: 0, y: 0, z: 0 };
export const qmul = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});
const conj = (q: Quat): Quat => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });
export const qnorm = (q: Quat): Quat => {
  const l = Math.hypot(q.w, q.x, q.y, q.z) || 1;
  return { w: q.w / l, x: q.x / l, y: q.y / l, z: q.z / l };
};
export const axisAngle = (axis: Vec, angle: number): Quat => {
  const a = unit(axis);
  const s = Math.sin(angle / 2);
  return { w: Math.cos(angle / 2), x: a.x * s, y: a.y * s, z: a.z * s };
};
/** A vector of the die's own frame, in the platter's. */
export const rotate = (q: Quat, v: Vec): Vec => {
  const p = qmul(qmul(q, { w: 0, x: v.x, y: v.y, z: v.z }), conj(q));
  return vec(p.x, p.y, p.z);
};
/** How far a turn turns, in radians (0 to π). */
export const angleOf = (q: Quat): number => 2 * Math.acos(Math.min(1, Math.abs(q.w)));
/** Part of a turn from no turn at all: `s` of the way to `q`, the short way round. */
export function partOf(q: Quat, s: number): Quat {
  const t = q.w < 0 ? { w: -q.w, x: -q.x, y: -q.y, z: -q.z } : q;
  const angle = angleOf(t);
  if (angle < 1e-9) return IDENTITY;
  return axisAngle(vec(t.x, t.y, t.z), angle * s);
}
/** The turn that takes direction `a` to direction `b`. */
export function turnBetween(a: Vec, b: Vec): Quat {
  const u = unit(a);
  const v = unit(b);
  const d = dot(u, v);
  if (d < -1 + 1e-9) {
    const other = Math.abs(u.x) < 0.9 ? vec(1, 0, 0) : vec(0, 1, 0);
    return axisAngle(cross(u, other), Math.PI);
  }
  const c = cross(u, v);
  return qnorm({ w: 1 + d, x: c.x, y: c.y, z: c.z });
}

// ── The die ─────────────────────────────────────────────────────────────────

/** The die's six faces in its own frame: +x, −x, +y, −y, +z, −z. */
export const AXES: readonly Vec[] = [vec(1, 0, 0), vec(-1, 0, 0), vec(0, 1, 0), vec(0, -1, 0), vec(0, 0, 1), vec(0, 0, -1)];
/** The number on each of those faces: opposite faces add up to 7, as on every die. */
export const LABELS: readonly Face[] = [2, 5, 3, 4, 1, 6];
const UP = vec(0, 0, 1);

/** Which of the die's faces is up: the one whose outward side points most nearly up. */
export function upAxis(q: Quat): number {
  let best = 0;
  let most = -Infinity;
  AXES.forEach((axis, index) => {
    const up = rotate(q, axis).z;
    if (up > most) {
      most = up;
      best = index;
    }
  });
  return best;
}
/** The number a die shows on top. */
export const upFace = (q: Quat): Face => LABELS[upAxis(q)];

/** How far below its middle the die reaches: half an edge lying flat, up to half its long diagonal on a corner. */
export function depthOf(q: Quat): number {
  const x = rotate(q, AXES[0]).z;
  const y = rotate(q, AXES[2]).z;
  const z = rotate(q, AXES[4]).z;
  return 0.5 * (Math.abs(x) + Math.abs(y) + Math.abs(z));
}

/** A die lying flat on `face`, turned `yaw` about the upright. */
export const lyingOn = (face: Face, yaw: number): Quat => qnorm(qmul(axisAngle(UP, yaw), turnBetween(AXES[LABELS.indexOf(face)], UP)));

/** The cube's 24 turns onto itself: every way a die can be picked up and put back into the same place. */
export const CUBE_TURNS: readonly Quat[] = (() => {
  const found: Quat[] = [IDENTITY];
  const steps = [axisAngle(vec(1, 0, 0), Math.PI / 2), axisAngle(vec(0, 1, 0), Math.PI / 2), axisAngle(vec(0, 0, 1), Math.PI / 2)];
  const same = (a: Quat, b: Quat) => Math.abs(Math.abs(a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z) - 1) < 1e-9;
  for (let i = 0; i < found.length; i++) {
    for (const step of steps) {
      const next = qnorm(qmul(step, found[i]));
      if (!found.some((q) => same(q, next))) found.push(next);
    }
  }
  return found;
})();

/** The smallest of the cube's turns that takes face `from` of the die to where face `to` was. */
export function cubeTurn(from: number, to: number): Quat {
  let best = IDENTITY;
  let least = Infinity;
  for (const turn of CUBE_TURNS) {
    const moved = rotate(turn, AXES[from]);
    if (dot(moved, AXES[to]) < 1 - 1e-6) continue;
    const angle = angleOf(turn);
    if (angle < least - 1e-9) {
      least = angle;
      best = turn;
    }
  }
  return best;
}

// ── The shaker ──────────────────────────────────────────────────────────────

/** The dome's radius, in edges of a die. */
export const DOME = 3;
/** How near the middle of a die comes to anything: the dome's glass and the other dice. Two dice lying flat at twice this never touch, however they are turned. */
export const REACH = 0.72;
const LIMIT = DOME - REACH;
export const FRAME_RATE = 60;
const STEPS_PER_FRAME = 4;
const STEP = 1 / (FRAME_RATE * STEPS_PER_FRAME);
/** Gravity, in edges a second a second. */
const GRAVITY = 300;
/** How long the platter shakes, in seconds. */
export const SHAKE_TIME = 1.4;
/** How long a throw is simulated for at most, before every die still moving is put down. */
const LONGEST = 6;
/** How long a roll takes from the first shake to the last die at rest, so that it is the time a real one takes to watch. */
export const ROLL_TIME = { least: 1.9, most: 4.4 } as const;
/** How many seeds are tried for one roll before the last is shown regardless (never seen in tests). */
const TRIES = 32;
/** How hard the platter shakes the dome, in edges, and how fast. */
const JOLT = { size: 0.045, hz: 13 } as const;

export type ShakeEventKind = 'land' | 'knock' | 'glass';
export interface ShakeEvent {
  /** Seconds from the start. */
  t: number;
  kind: ShakeEventKind;
  /** How hard, in edges a second. */
  strength: number;
}

export interface ShakePlan {
  /** The faces the three dice end on, die by die: the roll drawn, in the order the dice lie. */
  faces: Dice;
  /** Each frame, each die: x, y, z and its turn (w, x, y, z), 60 frames a second. */
  frames: Float32Array;
  count: number;
  /** Seconds from the first shake to the last die at rest. */
  duration: number;
  /** When the platter stops shaking. */
  shakeEnd: number;
  /** How far the platter is jolted, each frame, in edges. */
  jolt: Float32Array;
  events: ShakeEvent[];
  /** Where the dice come to rest. */
  end: Pose[];
  /** The seed the roll that is shown was made with. */
  seed: number;
}

/** Numbers a frame holds for one die. */
export const PER_DIE = 7;

interface Body {
  p: Vec;
  v: Vec;
  q: Quat;
  /** Turning, in radians a second, about an axis of the platter's. */
  w: Vec;
  state: 'free' | 'tip' | 'rest';
  tip: { from: Quat; axis: Vec; angle: number; t: number; length: number } | null;
  /** When the die starts to feel the shaking. */
  wakes: number;
}

const between = (rng: () => number, low: number, high: number) => low + (high - low) * rng();
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Three dice at rest on `dice`, as a seed lays them out: in a loose triangle round the middle, each turned its own
 * way. What a roll from before the page opened is shown as.
 */
export function restPoses(dice: Dice, seed: number): Pose[] {
  const rng = seeded(seed ^ 0x5bd1e995);
  const start = rng() * Math.PI * 2;
  return dice.map((face, i) => {
    const angle = start + (i * Math.PI * 2) / 3 + between(rng, -0.12, 0.12);
    const r = between(rng, 0.98, 1.1);
    return { x: r * Math.cos(angle), y: r * Math.sin(angle), z: 0.5, q: lyingOn(face, rng() * Math.PI * 2) };
  });
}

/** Whether three poses could be dice at rest: in the dome, each lying flat, none on another. */
export function restsWell(poses: readonly Pose[]): boolean {
  if (poses.length !== 3) return false;
  for (const pose of poses) {
    if (![pose.x, pose.y, pose.z, pose.q.w, pose.q.x, pose.q.y, pose.q.z].every(Number.isFinite)) return false;
    if (Math.hypot(pose.x, pose.y, pose.z) > LIMIT + 1e-6 || Math.abs(depthOf(pose.q) - 0.5) > 1e-3 || Math.abs(pose.z - 0.5) > 1e-3) return false;
  }
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (Math.hypot(poses[i].x - poses[j].x, poses[i].y - poses[j].y) < 2 * REACH - 1e-6) return false;
  return true;
}

/** Dice at rest, eased apart and in from the glass until none touches another or the dome (a few hundredths of an edge at most). */
function apart(poses: Pose[]): Pose[] {
  const out = poses.map((pose) => ({ ...pose }));
  for (let round = 0; round < 24; round++) {
    let moved = false;
    for (const pose of out) {
      const r = Math.hypot(pose.x, pose.y, pose.z);
      if (r > LIMIT) {
        const across = Math.sqrt(Math.max(0, LIMIT * LIMIT - pose.z * pose.z)) / Math.hypot(pose.x, pose.y);
        pose.x *= across * 0.9999;
        pose.y *= across * 0.9999;
        moved = true;
      }
    }
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const dx = out[i].x - out[j].x;
        const dy = out[i].y - out[j].y;
        const dist = Math.hypot(dx, dy);
        if (dist >= 2 * REACH) continue;
        const nx = dist > 1e-9 ? dx / dist : 1;
        const ny = dist > 1e-9 ? dy / dist : 0;
        const push = (2 * REACH - dist) / 2 + 1e-5;
        out[i].x += nx * push;
        out[i].y += ny * push;
        out[j].x -= nx * push;
        out[j].y -= ny * push;
        moved = true;
      }
    if (!moved) break;
  }
  return out;
}

interface Run {
  /** Each frame, each die, as the model has it: x, y, z and its turn. */
  raw: number[];
  count: number;
  events: ShakeEvent[];
  end: Pose[];
  duration: number;
}

/** The model, run from `start`: every die's flight, frame by frame, until all three are at rest. */
function simulate(start: readonly Pose[], seed: number): Run {
  const rng = seeded(seed);
  const bodies: Body[] = start.map((pose) => ({
    p: vec(pose.x, pose.y, depthOf(pose.q)),
    v: vec(0, 0, 0),
    q: qnorm(pose.q),
    w: vec(0, 0, 0),
    state: 'free',
    tip: null,
    wakes: between(rng, 0, 0.08),
  }));
  const raw: number[] = [];
  const events: ShakeEvent[] = [];
  const record = () => {
    for (const body of bodies) raw.push(body.p.x, body.p.y, body.p.z, body.q.w, body.q.x, body.q.y, body.q.z);
  };
  record();
  let step = 0;
  let t = 0;
  const kickSpin = (body: Body, size: number) => {
    body.w = vec(body.w.x + between(rng, -size, size), body.w.y + between(rng, -size, size), body.w.z + between(rng, -size, size) * 0.6);
    const spin = length(body.w);
    if (spin > 42) body.w = scaled(body.w, 42 / spin);
  };
  /** Starts a die rolling over its lowest edge onto the face nearest to up. */
  const beginTip = (body: Body) => {
    const k = upAxis(body.q);
    const up = rotate(body.q, AXES[k]);
    const angle = Math.acos(Math.min(1, Math.max(-1, up.z)));
    body.w = vec(0, 0, body.w.z * 0.5);
    if (angle < 1e-4) {
      body.q = qnorm(qmul(turnBetween(up, UP), body.q));
      body.p.z = depthOf(body.q);
      body.state = 'free';
      return;
    }
    // Over an edge, falling: the further it has to go, the longer, and quicker at the end than at the start.
    body.tip = { from: body.q, axis: unit(cross(up, UP)), angle, t: 0, length: 0.07 + 0.2 * Math.min(1, angle / 0.9553) };
    body.state = 'tip';
  };
  const wake = (body: Body) => {
    if (body.state === 'rest') body.state = 'free';
  };

  for (;;) {
    const shaking = t < SHAKE_TIME;
    for (const body of bodies) {
      if (body.state === 'rest') continue;
      if (body.state === 'tip' && body.tip) {
        const tip = body.tip;
        tip.t += STEP;
        const s = Math.min(1, tip.t / tip.length);
        body.q = qnorm(qmul(axisAngle(tip.axis, tip.angle * s * s), tip.from));
        body.p = vec(body.p.x + body.v.x * STEP, body.p.y + body.v.y * STEP, depthOf(body.q));
        body.v = vec(body.v.x * Math.exp(-6 * STEP), body.v.y * Math.exp(-6 * STEP), 0);
        if (s >= 1) {
          const up = rotate(body.q, AXES[upAxis(body.q)]);
          body.q = qnorm(qmul(turnBetween(up, UP), body.q));
          body.p.z = depthOf(body.q);
          body.tip = null;
          body.state = 'free';
          events.push({ t, kind: 'land', strength: 2 + tip.angle * 4 });
        }
        continue;
      }
      // Free: falling, flying and turning.
      body.v = vec(body.v.x, body.v.y, body.v.z - GRAVITY * STEP);
      body.p = vec(body.p.x + body.v.x * STEP, body.p.y + body.v.y * STEP, body.p.z + body.v.z * STEP);
      const w = body.w;
      const dq = qmul({ w: 0, x: w.x, y: w.y, z: w.z }, body.q);
      body.q = qnorm({ w: body.q.w + 0.5 * dq.w * STEP, x: body.q.x + 0.5 * dq.x * STEP, y: body.q.y + 0.5 * dq.y * STEP, z: body.q.z + 0.5 * dq.z * STEP });
      body.w = scaled(body.w, 1 - 0.25 * STEP);
      const depth = depthOf(body.q);
      const onFloor = body.p.z <= depth + 1e-3;
      if (body.p.z < depth) {
        body.p.z = depth;
        if (body.v.z < 0) {
          const impact = -body.v.z;
          if (shaking && t >= body.wakes) {
            // The platter kicks it back up, turning, and knocks it sideways.
            const ramp = Math.min(1, 0.45 + (t - body.wakes) / 0.25);
            body.v = vec(body.v.x * 0.6 + between(rng, -5.5, 5.5), body.v.y * 0.6 + between(rng, -5.5, 5.5), between(rng, 15, 28) * ramp);
            kickSpin(body, 26 * ramp);
            if (impact > 4) events.push({ t, kind: 'knock', strength: impact });
          } else if (impact > 2.4) {
            // A bounce, lower each time; the platter takes some of its slide and its turning.
            body.v = vec(body.v.x * 0.7, body.v.y * 0.7, impact * 0.36);
            body.w = scaled(body.w, 0.62);
            kickSpin(body, impact * 0.35);
            events.push({ t, kind: 'land', strength: impact });
          } else body.v = vec(body.v.x, body.v.y, 0);
        }
      }
      if (!shaking && onFloor && Math.abs(body.v.z) < 0.5) {
        // Sliding and spinning on the platter, the felt holding it back.
        body.v = vec(body.v.x * Math.exp(-4.5 * STEP), body.v.y * Math.exp(-4.5 * STEP), body.v.z);
        body.w = scaled(body.w, Math.exp(-5.5 * STEP));
        const flat = Math.abs(depth - 0.5) < 2e-3;
        const slide = Math.hypot(body.v.x, body.v.y);
        if (!flat && slide < 2.8 && length(body.w) < 6) beginTip(body);
        else if (flat) {
          // Lying flat it only turns about the upright, and comes to rest.
          body.w = vec(0, 0, body.w.z);
          if (slide < 0.2 && Math.abs(body.w.z) < 0.25) {
            body.state = 'rest';
            body.v = vec(0, 0, 0);
            body.w = vec(0, 0, 0);
          }
        }
      }
    }

    // The dome's glass: a die that reaches it comes back off it.
    for (const body of bodies) {
      const r = length(body.p);
      if (r <= LIMIT) continue;
      const n = scaled(body.p, 1 / r);
      body.p = scaled(n, LIMIT);
      const out = dot(body.v, n);
      if (out > 0) {
        body.v = vec(body.v.x - 1.55 * out * n.x, body.v.y - 1.55 * out * n.y, body.v.z - 1.55 * out * n.z);
        kickSpin(body, out * 0.5);
        if (out > 3) events.push({ t, kind: 'glass', strength: out });
      }
    }
    // The dice on each other: twice over, so that a die pushed off one is not left in the next.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++) {
          const a = bodies[i];
          const b = bodies[j];
          const d = vec(a.p.x - b.p.x, a.p.y - b.p.y, a.p.z - b.p.z);
          const dist = length(d);
          if (dist >= 2 * REACH) continue;
          const n = dist > 1e-9 ? scaled(d, 1 / dist) : vec(1, 0, 0);
          const push = (2 * REACH - dist) / 2;
          // Along the platter only, for a die lying on it: it is not pushed into the felt.
          const lift = (body: Body, k: number) => {
            const z = body.state === 'free' && body.p.z > depthOf(body.q) + 1e-3 ? body.p.z + n.z * k : body.p.z;
            body.p = vec(body.p.x + n.x * k, body.p.y + n.y * k, z);
          };
          lift(a, push);
          lift(b, -push);
          const closing = dot(vec(a.v.x - b.v.x, a.v.y - b.v.y, a.v.z - b.v.z), n);
          if (closing < 0) {
            const j2 = -0.75 * closing;
            a.v = vec(a.v.x + n.x * j2, a.v.y + n.y * j2, a.v.z + n.z * j2);
            b.v = vec(b.v.x - n.x * j2, b.v.y - n.y * j2, b.v.z - n.z * j2);
            if (-closing > 1) {
              wake(a);
              wake(b);
              kickSpin(a, -closing * 0.4);
              kickSpin(b, -closing * 0.4);
            }
            // A die left at rest by a soft touch stays at rest.
            for (const body of [a, b]) if (body.state === 'rest') body.v = vec(0, 0, 0);
            if (-closing > 3) events.push({ t, kind: 'knock', strength: -closing });
          }
        }
    }

    step += 1;
    t = step * STEP;
    if (step % STEPS_PER_FRAME === 0) record();
    const resting = bodies.every((body) => body.state === 'rest');
    if (resting && t > SHAKE_TIME && step % STEPS_PER_FRAME === 0) break;
    if (t > LONGEST) {
      // Put down whatever still moves: tipped flat where it is, at rest.
      for (const body of bodies) {
        if (body.state === 'rest') continue;
        const up = rotate(body.q, AXES[upAxis(body.q)]);
        body.q = qnorm(qmul(turnBetween(up, UP), body.q));
        body.p = vec(body.p.x, body.p.y, depthOf(body.q));
        body.state = 'rest';
      }
      record();
      break;
    }
  }
  const count = raw.length / (3 * PER_DIE);
  const end = apart(bodies.map((body) => ({ x: body.p.x, y: body.p.y, z: body.p.z, q: body.q })));
  // The last frame is where they rest, eased apart by a hair where the last pushes left them touching.
  end.forEach((pose, die) => raw.splice(((count - 1) * 3 + die) * PER_DIE, 3, pose.x, pose.y, pose.z));
  return { raw, count, events, end, duration: (count - 1) / FRAME_RATE };
}

/** Every order the three dice can take the three faces drawn in. */
const ORDERS: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

/** Whether a run looks right: as long as a real roll takes, and every die at rest flat and clear of the others and the glass. */
const looksRight = (run: Run): boolean => run.duration >= ROLL_TIME.least && run.duration <= ROLL_TIME.most && restsWell(run.end);

/**
 * The roll shown for `dice`, from the dice lying at `start`: the model run with `seed` (or the next seed, until a run
 * looks right), and each die turned in its own frame, while it tumbles in the shake, to end on its face of the roll.
 */
export function planShake(start: readonly Pose[], dice: Dice, seed: number): ShakePlan {
  const from = restsWell(start) ? start : restPoses(dice, seed);
  let used = seed >>> 0;
  let run = simulate(from, used);
  for (let k = 1; k < TRIES && !looksRight(run); k++) {
    used = (seed + Math.imul(k, 0x9e3779b9)) >>> 0;
    run = simulate(from, used);
  }
  // Which die takes which face of the roll: the order that turns them least.
  const natural = run.end.map((pose) => upAxis(pose.q));
  let order = ORDERS[0];
  let least = Infinity;
  for (const candidate of ORDERS) {
    const turned = candidate.reduce((sum, which, die) => sum + angleOf(cubeTurn(LABELS.indexOf(dice[which]), natural[die])), 0);
    if (turned < least - 1e-9) {
      least = turned;
      order = candidate;
    }
  }
  const faces = order.map((which) => dice[which]) as unknown as Dice;
  const turns = faces.map((face, die) => cubeTurn(LABELS.indexOf(face), natural[die]));

  const frames = new Float32Array(run.raw.length);
  const jolt = new Float32Array(run.count);
  const rampFrom = 0.1;
  const rampTo = SHAKE_TIME - 0.3;
  for (let f = 0; f < run.count; f++) {
    const t = f / FRAME_RATE;
    const s = smooth((t - rampFrom) / (rampTo - rampFrom));
    for (let die = 0; die < 3; die++) {
      const at = (f * 3 + die) * PER_DIE;
      const q = qnorm(qmul({ w: run.raw[at + 3], x: run.raw[at + 4], y: run.raw[at + 5], z: run.raw[at + 6] }, partOf(turns[die], s)));
      // While it is being turned it is never shown in the platter.
      const z = Math.max(run.raw[at + 2], depthOf(q));
      frames.set([run.raw[at], run.raw[at + 1], z, q.w, q.x, q.y, q.z], at);
    }
    const envelope = smooth(t / 0.08) * smooth((SHAKE_TIME - t) / 0.12);
    jolt[f] = JOLT.size * envelope * Math.sin(2 * Math.PI * JOLT.hz * t);
  }
  const end = run.end.map((pose, die) => ({ x: pose.x, y: pose.y, z: pose.z, q: qnorm(qmul(pose.q, turns[die])) }));
  // The last frame is the rest, exactly.
  end.forEach((pose, die) => frames.set([pose.x, pose.y, pose.z, pose.q.w, pose.q.x, pose.q.y, pose.q.z], ((run.count - 1) * 3 + die) * PER_DIE));
  return { faces, frames, count: run.count, duration: run.duration, shakeEnd: SHAKE_TIME, jolt, events: run.events, end, seed: used };
}

/** A die's pose in frame `frame` of a plan, `die` 0 to 2. */
export function poseAt(plan: ShakePlan, frame: number, die: number): Pose {
  const f = Math.max(0, Math.min(plan.count - 1, frame));
  const at = (f * 3 + die) * PER_DIE;
  const v = plan.frames;
  return { x: v[at], y: v[at + 1], z: v[at + 2], q: { w: v[at + 3], x: v[at + 4], y: v[at + 5], z: v[at + 6] } };
}

/** The pose between two frames, `t` seconds in: positions in a line, turns the short way round. */
export function poseAtTime(plan: ShakePlan, t: number, die: number): Pose {
  const exact = Math.max(0, Math.min(plan.count - 1, t * FRAME_RATE));
  const f = Math.floor(exact);
  const k = exact - f;
  const a = poseAt(plan, f, die);
  if (k < 1e-6 || f >= plan.count - 1) return a;
  const b = poseAt(plan, f + 1, die);
  const sign = a.q.w * b.q.w + a.q.x * b.q.x + a.q.y * b.q.y + a.q.z * b.q.z < 0 ? -1 : 1;
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    z: a.z + (b.z - a.z) * k,
    q: qnorm({ w: a.q.w + (sign * b.q.w - a.q.w) * k, x: a.q.x + (sign * b.q.x - a.q.x) * k, y: a.q.y + (sign * b.q.y - a.q.y) * k, z: a.q.z + (sign * b.q.z - a.q.z) * k }),
  };
}

/** The faces of a die in its own frame, for drawing it: each face's outward side and its number. */
export const DIE_FACES: readonly { axis: Vec; face: Face }[] = AXES.map((axis, i) => ({ axis, face: LABELS[i] }));

/** The dice a page shows before any roll: one of each of the low numbers. */
export const FIRST_DICE: Dice = [1, 2, 3];

/** Every face, for the tests. */
export const ALL_FACES = FACES;
