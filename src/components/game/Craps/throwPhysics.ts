/**
 * A throw of two dice down a craps table: a small seeded physics model,
 * played back to land on a roll that was drawn before it.
 *
 * The roll is the game's own draw (`rollDice`), made first. The throw only
 * shows it: the dice leave the shooter's hand, fly down the felt, hit the far
 * end's wall (lined with rubber pyramids, which knock them about), come back
 * off it, tumble and stop. Which faces are up is not a matter of the physics:
 * each die's tumbles are counted as it is simulated, and the faces it shows
 * are then chosen backwards from the face it must end on, each one a face
 * next to the one after it, as a die rolling over an edge turns up. So the
 * dice always rest on the drawn roll, and the odds are the game's.
 *
 * The table is seen from above, in the units of the table's own drawing:
 * x runs from the far wall (`felt.left`) towards the shooter, y across the
 * table, z is the height above the felt. A seed fixes everything: the same
 * seed and geometry give the same throw. A throw that does not look right (a
 * die that misses the wall, dice that end on each other or against a rail,
 * a throw too quick or too slow to watch) is thrown again with the next seed,
 * so every throw that is shown hits the wall with both dice and ends with
 * both of them clear and readable.
 */

export interface Felt {
  /** The far wall's face: the rubber the dice must hit. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ThrowGeometry {
  felt: Felt;
  /** A die's edge. */
  die: number;
  /** Where the shooter's hand lets the dice go. */
  hand: { x: number; y: number };
}

export interface DieState {
  x: number;
  y: number;
  /** Height above the felt. */
  z: number;
  /** Turn in the plane of the felt, in degrees. */
  angle: number;
  /** The face that is up. */
  face: number;
}

export type ThrowEventKind = 'rattle' | 'release' | 'wall' | 'felt' | 'rail' | 'clack';

export interface ThrowEvent {
  /** Seconds from the start of the throw. */
  t: number;
  kind: ThrowEventKind;
  /** How hard, 0…1, for how loud it is. */
  strength: number;
}

export interface ThrowPlan {
  faces: readonly [number, number];
  /** The dice 60 times a second, from the hand to rest. */
  frames: (readonly [DieState, DieState])[];
  events: ThrowEvent[];
  /** Seconds from the hand to rest. */
  duration: number;
  /** Seconds the dice are rattled in the hand before they are let go. */
  hand: number;
  /** How many times each die hit the far wall. */
  wallHits: readonly [number, number];
  /** The seed the throw that is shown was made with. */
  seed: number;
}

export const FRAME_RATE = 60;
/** The simulation's step: four steps to a frame. */
const STEP = 1 / (FRAME_RATE * 4);
/** The rattle in the hand. */
export const HAND_TIME = 0.32;
/** The longest a throw is simulated for. */
const LONGEST = 4;
/** How long a throw may take from the hand to rest, so that it is the time a real one takes to watch. */
export const THROW_TIME = { least: 1.4, most: 2.6 } as const;
/** How many seeds are tried for one throw before the last is shown regardless (never seen in tests). */
const TRIES = 64;

/** A small, fast, seeded generator (mulberry32): the same seed, the same numbers. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng: () => number, low: number, high: number) => low + (high - low) * rng();

/** The faces next to `face` on a die: every face but itself and the one opposite (they add up to 7). */
export const nextTo = (face: number): number[] => [1, 2, 3, 4, 5, 6].filter((other) => other !== face && other !== 7 - face);

/** The radius a die takes up on the felt, for the rails and the other die: between half its edge and half its diagonal. */
export const reach = (die: number): number => die * 0.62;

interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  angle: number;
  spin: number;
  /** How far the die has turned over in the air since its last new face, in quarter turns. */
  turn: number;
  /** How fast it turns over in the air, in quarter turns a second. */
  turnRate: number;
  /** How far it has rolled along the felt since its last new face. */
  rolled: number;
  grounded: boolean;
  resting: boolean;
  /** When the face changed. */
  flips: number[];
  wall: number;
}

interface Run {
  bodies: [Body, Body];
  frames: [Body, Body][];
  flipCounts: [number, number][];
  events: ThrowEvent[];
  time: number;
}

const copy = (body: Body): Body => ({ ...body, flips: body.flips });

/** One throw, simulated from the hand to rest. */
function simulate(geometry: ThrowGeometry, rng: () => number): Run {
  const { felt, die, hand } = geometry;
  const r = reach(die);
  const length = hand.x - felt.left;
  const gravity = 110 * die;
  const events: ThrowEvent[] = [];
  const event = (t: number, kind: ThrowEventKind, strength: number) => events.push({ t: HAND_TIME + t, kind, strength: Math.max(0, Math.min(1, strength)) });

  // Both dice go for the same patch of wall, the shooter's aim, each a little off it.
  const aimY = between(rng, felt.top + 2.5 * die, felt.bottom - 2.5 * die);
  const pace = between(rng, 2.0, 2.3) * length;
  const bodies = [0, 1].map((i): Body => {
    const x = hand.x + (i === 0 ? -0.35 : 0.35) * die;
    const y = hand.y + (i === 0 ? -0.62 : 0.62) * die;
    const targetY = aimY + (i === 0 ? -1 : 1) * between(rng, 0.7, 1.3) * die;
    const heading = Math.atan2(targetY - y, felt.left - x);
    const speed = pace * between(rng, 0.94, 1.06);
    return {
      x,
      y,
      z: 1.4 * die,
      vx: Math.cos(heading) * speed,
      vy: Math.sin(heading) * speed,
      vz: between(rng, 5, 9) * die,
      angle: between(rng, 0, 360),
      spin: between(rng, -720, 720),
      turn: rng(),
      turnRate: between(rng, 9, 15),
      rolled: 0,
      grounded: false,
      resting: false,
      flips: [],
      wall: 0,
    };
  }) as [Body, Body];

  const frames: [Body, Body][] = [];
  const flipCounts: [number, number][] = [];
  const record = () => {
    frames.push([copy(bodies[0]), copy(bodies[1])]);
    flipCounts.push([bodies[0].flips.length, bodies[1].flips.length]);
  };
  record();

  let t = 0;
  let stepsToFrame = 0;
  const roll = 0.9 * die;
  const rollingSpeed = 0.18 * length;
  const friction = 0.7 * length;
  while (t < LONGEST && !(bodies[0].resting && bodies[1].resting)) {
    t += STEP;
    for (const b of bodies) {
      if (b.resting) continue;
      const flip = () => b.flips.push(HAND_TIME + t);
      if (!b.grounded) {
        b.x += b.vx * STEP;
        b.y += b.vy * STEP;
        b.z += b.vz * STEP;
        b.vz -= gravity * STEP;
        b.angle += b.spin * STEP;
        b.turn += b.turnRate * STEP;
        while (b.turn >= 1) {
          b.turn -= 1;
          flip();
        }
        if (b.z <= 0 && b.vz < 0) {
          b.z = 0;
          const hit = -b.vz;
          if (hit > 1.6 * die) {
            // A bounce on the felt: it loses most of its height and some of its pace, and turns over.
            b.vz = hit * 0.36;
            b.vx *= 0.8;
            b.vy *= 0.8;
            b.spin += between(rng, -240, 240);
            b.turnRate = Math.max(4, b.turnRate * 0.7 + between(rng, -1, 3));
            flip();
            event(t, 'felt', hit / (8 * die));
          } else {
            b.vz = 0;
            b.grounded = true;
            b.rolled = 0;
          }
        }
      } else {
        // On the felt: it rolls over its edges while it is quick, then slides to a stop.
        const speed = Math.hypot(b.vx, b.vy);
        const slower = Math.max(0, speed - friction * STEP);
        if (slower < 0.012 * length) {
          b.vx = 0;
          b.vy = 0;
          b.spin = 0;
          b.resting = true;
        } else {
          b.vx *= slower / speed;
          b.vy *= slower / speed;
          b.x += b.vx * STEP;
          b.y += b.vy * STEP;
          b.angle += b.spin * STEP;
          b.spin *= Math.exp(-5 * STEP);
          if (slower > rollingSpeed) {
            b.rolled += slower * STEP;
            if (b.rolled >= roll) {
              b.rolled -= roll;
              flip();
            }
          }
        }
      }

      // The far wall: its rubber pyramids throw a die back, off to one side and up into the air.
      if (b.x - r < felt.left) {
        b.x = felt.left + r;
        if (b.vx < 0) {
          const pace = -b.vx;
          b.vx = pace * between(rng, 0.5, 0.68);
          b.vy += between(rng, -0.45, 0.45) * pace;
          b.vz = Math.max(b.vz, 0) + pace * between(rng, 0.07, 0.13);
          b.z = Math.max(b.z, 0.05 * die);
          b.grounded = false;
          b.spin += between(rng, -600, 600);
          b.turnRate = between(rng, 8, 14);
          b.wall += 1;
          flip();
          event(t, 'wall', pace / length);
        }
      }
      // The other rails: plain padded wood, a dull knock.
      if (b.x + r > felt.right) {
        b.x = felt.right - r;
        if (b.vx > 0) {
          event(t, 'rail', b.vx / length);
          b.vx *= -0.45;
          b.spin += between(rng, -200, 200);
        }
      }
      if (b.y - r < felt.top) {
        b.y = felt.top + r;
        if (b.vy < 0) {
          event(t, 'rail', -b.vy / length);
          b.vy *= -0.45;
          b.spin += between(rng, -200, 200);
        }
      }
      if (b.y + r > felt.bottom) {
        b.y = felt.bottom - r;
        if (b.vy > 0) {
          event(t, 'rail', b.vy / length);
          b.vy *= -0.45;
          b.spin += between(rng, -200, 200);
        }
      }
    }

    // The two dice knock into each other and part; neither ever passes through the other.
    const [a, b] = bodies;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const apart = Math.hypot(dx, dy);
    if (apart < 2 * r) {
      const nx = apart > 1e-9 ? dx / apart : 1;
      const ny = apart > 1e-9 ? dy / apart : 0;
      const overlap = 2 * r - apart;
      // Pushed apart along the line between them, each by half, but never through a rail.
      const push = (body: Body, sign: number) => {
        body.x = Math.max(felt.left + r, Math.min(felt.right - r, body.x + sign * nx * (overlap / 2 + 1e-6)));
        body.y = Math.max(felt.top + r, Math.min(felt.bottom - r, body.y + sign * ny * (overlap / 2 + 1e-6)));
      };
      push(a, -1);
      push(b, 1);
      // A die pinned against a rail cannot give way: the other goes the whole way.
      const still = 2 * r - Math.hypot(b.x - a.x, b.y - a.y);
      if (still > 0) {
        const moveable = a.x - r <= felt.left + 1e-6 || a.x + r >= felt.right - 1e-6 || a.y - r <= felt.top + 1e-6 || a.y + r >= felt.bottom - 1e-6 ? b : a;
        const sign = moveable === b ? 1 : -1;
        moveable.x = Math.max(felt.left + r, Math.min(felt.right - r, moveable.x + sign * nx * (still + 1e-6)));
        moveable.y = Math.max(felt.top + r, Math.min(felt.bottom - r, moveable.y + sign * ny * (still + 1e-6)));
      }
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (closing > 0) {
        const impulse = (1 + 0.5) * closing * 0.5;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
        for (const body of bodies) {
          if (body.resting) body.resting = false;
          body.spin += between(rng, -300, 300);
        }
        event(t, 'clack', closing / length);
      }
    }

    stepsToFrame += 1;
    if (stepsToFrame === 4) {
      stepsToFrame = 0;
      record();
    }
  }
  record();
  return { bodies, frames, flipCounts, events, time: t };
}

/** Whether a simulated throw is one to show: both dice hit the wall, and both end clear of the rails and of each other. */
function looksRight(run: Run, geometry: ThrowGeometry): boolean {
  const { felt, die } = geometry;
  const r = reach(die);
  const [a, b] = run.bodies;
  if (a.wall < 1 || b.wall < 1) return false;
  if (!a.resting || !b.resting) return false;
  const total = HAND_TIME + run.time;
  if (total < THROW_TIME.least || total > THROW_TIME.most) return false;
  const margin = r + 0.25 * die;
  for (const body of run.bodies) {
    if (body.x < felt.left + margin || body.x > felt.right - margin || body.y < felt.top + margin || body.y > felt.bottom - margin) return false;
  }
  return Math.hypot(a.x - b.x, a.y - b.y) >= 2 * r + 0.35 * die;
}

/**
 * The faces a die shows, from the hand to rest: `flips + 1` faces, the last
 * the one it must end on, and each one next to the one after it.
 */
export function facesBackFrom(last: number, flips: number, rng: () => number): number[] {
  const faces = [last];
  for (let i = 0; i < flips; i++) {
    const options = nextTo(faces[0]);
    faces.unshift(options[Math.floor(rng() * options.length)]);
  }
  return faces;
}

/**
 * The throw for a roll that has been drawn: `faces` are the dice as the game
 * drew them. The same faces, geometry and seed always give the same throw.
 */
export function planThrow(faces: readonly [number, number], geometry: ThrowGeometry, seed: number): ThrowPlan {
  let run: Run | null = null;
  let used = seed >>> 0;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    used = (seed + Math.imul(attempt, 0x9e3779b1)) >>> 0;
    run = simulate(geometry, seeded(used));
    if (looksRight(run, geometry)) break;
  }
  const done = run!;
  const pick = seeded(used ^ 0x5bd1e995);
  const sequences = [facesBackFrom(faces[0], done.bodies[0].flips.length, pick), facesBackFrom(faces[1], done.bodies[1].flips.length, pick)];

  // The hand: the dice held together, rattled, before they go.
  const handFrames = Math.round(HAND_TIME * FRAME_RATE);
  const jiggle = seeded(used ^ 0x27d4eb2f);
  const start = done.frames[0];
  const frames: (readonly [DieState, DieState])[] = [];
  for (let k = 0; k < handFrames; k++) {
    frames.push(
      [0, 1].map((i) => ({
        x: start[i].x + between(jiggle, -0.12, 0.12) * geometry.die,
        y: start[i].y + between(jiggle, -0.12, 0.12) * geometry.die,
        z: start[i].z,
        angle: start[i].angle + between(jiggle, -12, 12),
        face: sequences[i][0],
      })) as unknown as readonly [DieState, DieState],
    );
  }
  done.frames.forEach((pair, k) => {
    frames.push(
      [0, 1].map((i) => ({
        x: pair[i].x,
        y: pair[i].y,
        z: Math.max(0, pair[i].z),
        angle: ((pair[i].angle % 360) + 360) % 360,
        face: sequences[i][done.flipCounts[k][i]],
      })) as unknown as readonly [DieState, DieState],
    );
  });

  const rattle = seeded(used ^ 0x165667b1);
  const events: ThrowEvent[] = [];
  for (let at = 0.03; at < HAND_TIME - 0.04; at += between(rattle, 0.045, 0.075)) events.push({ t: at, kind: 'rattle', strength: between(rattle, 0.4, 0.9) });
  events.push({ t: HAND_TIME, kind: 'release', strength: 0.5 }, ...done.events);
  events.sort((x, y) => x.t - y.t);

  return {
    faces,
    frames,
    events,
    duration: (frames.length - 1) / FRAME_RATE,
    hand: HAND_TIME,
    wallHits: [done.bodies[0].wall, done.bodies[1].wall],
    seed: used,
  };
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerpAngle = (a: number, b: number, u: number) => {
  const turn = ((((b - a) % 360) + 540) % 360) - 180;
  return a + turn * u;
};

/** The dice `t` seconds into a throw, between its frames: at rest from its end on. */
export function diceAt(plan: ThrowPlan, t: number): readonly [DieState, DieState] {
  const at = Math.max(0, t) * FRAME_RATE;
  const k = Math.min(plan.frames.length - 1, Math.floor(at));
  const next = Math.min(plan.frames.length - 1, k + 1);
  const u = at - k;
  if (k === next || u <= 0) return plan.frames[k];
  const [a, b] = [plan.frames[k], plan.frames[next]];
  return [0, 1].map((i) => ({
    x: lerp(a[i].x, b[i].x, u),
    y: lerp(a[i].y, b[i].y, u),
    z: lerp(a[i].z, b[i].z, u),
    angle: lerpAngle(a[i].angle, b[i].angle, u),
    face: a[i].face,
  })) as unknown as readonly [DieState, DieState];
}

/** The dice at rest at the end of a throw. */
export const restOf = (plan: ThrowPlan): readonly [DieState, DieState] => plan.frames[plan.frames.length - 1];
