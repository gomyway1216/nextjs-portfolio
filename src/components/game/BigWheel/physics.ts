/**
 * How the big wheel moves: a pure model of a spin that is sure to end with the
 * segment drawn under the pointer, the leather flapper at the top that the
 * pegs bend and let go, and the hub's lamps running round to their stop.
 *
 * The result is drawn first (engine.ts); this only choreographs it, from the
 * way a real one behaves:
 *
 * - **The run.** The motor brings the wheel up to speed in a moment (`SPIN_UP`)
 *   and lets it go; it slows, quickly at first and
 *   then more and more gently, as a motor-braked prize wheel is stopped
 *   ("rapidly decelerates it once, then decelerates gradually", US 9,672,684):
 *   friction that is part constant (the bearing, and the flapper costing the
 *   wheel the same at every peg) and part in step with the speed. Its speed
 *   is v(t) = (v₀ + A)·e^(−bt) − A, which falls to nothing at the end of the
 *   run; the position that gives is `runShape`.
 * - **The stop.** At the end the wheel no longer has the speed to push the
 *   flapper over the next peg: the peg leans on it, the wheel stalls, and the
 *   bent flapper pushes it back a little into the segment it stopped in (the
 *   rock back). The pointer never leaves the segment drawn once it is in it
 *   for the last time.
 * - **The flapper.** A peg that reaches the flapper's tip bends it in the
 *   direction the wheel turns until it slips past, and the flapper snaps back
 *   and swings, a little less each time, until the next peg: the clack of a
 *   prize wheel, fast at first and then peg by peg.
 *
 * Conventions: angles are degrees, clockwise, the wheel's own rotation; a
 * segment's centre is at `index × SEG` on the wheel, and it is under the
 * pointer at the top when the wheel has turned to `−index × SEG`. The wheel
 * turns clockwise, so the segment under the pointer counts down.
 *
 * The `rng` passed in only changes the look of a spin (how long, how far, how
 * it settles), never where it ends; the machine takes it from the spin's own
 * name, so that a spin shown again after a reload looks the same.
 */

import { LAMP_COUNT, SEGMENT_COUNT, WHEEL, type Spin } from './engine';

/** One segment's angle. */
export const SEG = 360 / SEGMENT_COUNT;
/** One lamp's step round the hub. */
export const LAMP_STEP = 360 / LAMP_COUNT;

export const mod = (value: number, by: number): number => ((value % by) + by) % by;
export const mod360 = (deg: number): number => mod(deg, 360);

/** The segment under the pointer when the wheel has turned to `angle`. */
export const segmentAt = (angle: number): number => Math.round(mod360(-angle) / SEG) % SEGMENT_COUNT;

/**
 * Where the pointer is within the segment under it, in segments, from −0.5 to
 * 0.5: 0 at its middle, below 0 towards the segment that comes next.
 */
export function offsetAt(angle: number): number {
  const along = mod360(-angle) / SEG;
  return along - Math.round(along);
}

/** The angle at which segment `index` is under the pointer, `offset` segments along it. */
export const angleFor = (index: number, offset = 0): number => mod360(-(index + offset) * SEG);

// ── The flapper ─────────────────────────────────────────────────────────────

/**
 * Where the peg nearest the pointer is, in segments, from −0.5 to 0.5: below
 * 0 coming up to the flapper, above 0 past it. (The pegs sit between the
 * segments.)
 */
export function pegAt(angle: number): number {
  const m = mod(0.5 + angle / SEG, 1);
  return m >= 0.5 ? m - 1 : m;
}

/** How far before the pointer a peg reaches the flapper's tip, and how far past it the tip slips off, in segments. */
export const FLAPPER = { reach: 0.3, slip: 0.1, bend: 30, period: 110, decay: 95 } as const;

/** Whether the peg at `x` (`pegAt`) is touching the flapper. */
export const touching = (x: number): boolean => x >= -FLAPPER.reach && x <= FLAPPER.slip;

/** How far, in degrees, a peg at `x` bends the flapper the way the wheel turns: from nothing as it reaches it, to all the way as it slips off. */
export const pushedBend = (x: number): number => (touching(x) ? (FLAPPER.bend * (x + FLAPPER.reach)) / (FLAPPER.reach + FLAPPER.slip) : 0);

/** The flapper swinging free `ms` after a peg let it go bent by `from` degrees: back and forth, a little less each time. */
export function freeSwing(from: number, ms: number): number {
  if (ms < 0) return from;
  // Long still: it hangs straight (and a peg that never let it go, at -Infinity, has it hanging straight too).
  if (!Number.isFinite(ms) || ms > 12 * FLAPPER.decay) return 0;
  return from * Math.exp(-ms / FLAPPER.decay) * Math.cos((2 * Math.PI * ms) / FLAPPER.period);
}

/** How many pegs have slipped past the flapper's tip by the time the wheel has turned to `angle`: one more each time a peg goes by. */
export const pegsPast = (angle: number): number => Math.floor(angle / SEG + 0.5 - FLAPPER.slip);

// ── A spin of the wheel ─────────────────────────────────────────────────────

/** A spin of the wheel to its stop. */
export interface SpinPlan {
  /** The segment it stops on. */
  target: number;
  /** Where it starts, and where it ends: unwrapped, so that `end − from` is how far it turns, less the rock back. */
  from: number;
  end: number;
  /** The farthest it turns, before the flapper pushes it back to `end` (`end` itself when it does not rock back). */
  over: number;
  /** How long the run takes, in ms, and the rock back after it (0 for none). */
  run: number;
  settle: number;
  /** How sharply it slows at first: the bigger, the more of its slowing comes early. */
  kappa: number;
}

/** How long a run takes, in ms, at the shortest and the longest. */
export const RUN_MS = { least: 5_600, most: 7_000 } as const;
/** How long the rock back takes, in ms. */
export const SETTLE_MS = 420;

/**
 * Plans a spin from `from` that stops on segment `target`. The high numbers
 * and BONUS always stop as a real wheel stops on its big prizes most often
 * (US 9,672,684: near the ends of the spot): leaning on the peg into the next
 * segment, then falling back.
 */
export function planSpin(from: number, target: number, rng: () => number): SpinPlan {
  const segment = WHEEL[target];
  const rocks = segment === 'bonus' || segment === 20 || segment === 40 || rng() < 0.6;
  let endOffset: number;
  let overOffset: number;
  if (rocks) {
    // Stalled with the next peg leaning on the flapper (in touch, but not past), then pushed back clear of it.
    overOffset = -0.42 + 0.12 * rng();
    endOffset = -0.12 + 0.2 * rng();
  } else {
    endOffset = -0.15 + 0.5 * rng();
    overOffset = endOffset;
  }
  const rock = (endOffset - overOffset) * SEG;
  const overAt = angleFor(target, overOffset);
  const turns = 2 + (rng() < 0.35 ? 1 : 0);
  const over = from + mod360(overAt - from) + 360 * turns;
  return {
    target,
    from,
    end: over - rock,
    over,
    run: RUN_MS.least + (RUN_MS.most - RUN_MS.least) * rng(),
    settle: rocks ? SETTLE_MS : 0,
    kappa: 1.8 + 0.8 * rng(),
  };
}

/**
 * How far along its run the wheel is, from 0 to 1, at `s` of the run's time:
 * the position under friction part constant and part in step with the speed,
 * scaled to end exactly at 1 with no speed left.
 */
export function runShape(s: number, kappa: number): number {
  if (s <= 0) return 0;
  if (s >= 1) return 1;
  const ek = Math.exp(kappa);
  return (ek * (1 - Math.exp(-kappa * s)) - kappa * s) / (ek - 1 - kappa);
}

/** The wheel's speed at `s` of the run, as a share of its average speed over the run. */
export const runSpeed = (s: number, kappa: number): number => (s >= 1 ? 0 : (kappa * (Math.exp(kappa * (1 - Math.max(0, s))) - 1)) / (Math.exp(kappa) - 1 - kappa));

export const planLength = (plan: SpinPlan): number => plan.run + plan.settle;

/**
 * How much of the run's first moments the motor takes to bring the wheel up
 * to speed: over it the wheel's position is eased in (`smoothstep`), so that it
 * starts from standing, not at full speed, and the run still ends where and
 * when it was planned to.
 */
export const SPIN_UP = 0.05;
const smoothstep = (x: number): number => x * x * (3 - 2 * x);

/** How far along its run the wheel is, from 0 to 1, at `s` of the run's time, the spin-up included. */
export const runAt = (s: number, kappa: number): number => runShape(s, kappa) * (s < SPIN_UP ? smoothstep(Math.max(0, s) / SPIN_UP) : 1);

/** Where the wheel is, `ms` into a spin. */
export function angleAt(plan: SpinPlan, ms: number): number {
  if (ms <= 0) return plan.from;
  if (ms < plan.run) return plan.from + (plan.over - plan.from) * runAt(ms / plan.run, plan.kappa);
  if (plan.settle <= 0 || ms >= plan.run + plan.settle) return plan.end;
  const s = (ms - plan.run) / plan.settle;
  return plan.over - (plan.over - plan.end) * ((1 - Math.cos(Math.PI * s)) / 2);
}

// ── The hub's lamps ─────────────────────────────────────────────────────────

/** The light running round the hub's lamps to the one drawn. */
export interface LampPlan {
  from: number;
  target: number;
  /** How many lamps it steps over, all told. */
  steps: number;
  run: number;
  kappa: number;
}

export const LAMP_RUN_MS = 2_600;

export function planLamps(from: number, target: number, rng: () => number): LampPlan {
  return { from, target, steps: mod(target - from, LAMP_COUNT) + 2 * LAMP_COUNT, run: LAMP_RUN_MS + 400 * rng(), kappa: 2.2 };
}

/** The lamp lit `ms` into the run: it steps fast at first and slower and slower, and stops on the one drawn. */
export function lampAt(plan: LampPlan, ms: number): number {
  if (ms >= plan.run) return plan.target;
  return mod(plan.from + Math.floor(plan.steps * runShape(ms / plan.run, plan.kappa)), LAMP_COUNT);
}

// ── A spin, as the machine shows it ─────────────────────────────────────────

/**
 * The steps of a spin on the screen:
 * - `spin`: the wheel runs to its stop;
 * - `bonus`: it has stopped on BONUS, which flashes;
 * - `chance`: the hub's lamps run round to the multiplier;
 * - `second`: the second chance, the wheel run again with BONUS dark;
 * - `done`: the result stands.
 */
export type Phase = 'spin' | 'bonus' | 'chance' | 'second' | 'done';

export interface ShowStep {
  phase: Exclude<Phase, 'done'>;
  at: number;
  length: number;
  wheel?: SpinPlan;
  lamps?: LampPlan;
}

export interface Show {
  steps: ShowStep[];
  length: number;
  /** Where the wheel is when the show is over, and the lamp lit. */
  rest: number;
  lamp: number;
}

/** How long BONUS flashes before the lamps run, and how long the lamp drawn is shown before the second chance. */
export const BONUS_FLASH_MS = 1_100;
export const LAMP_HOLD_MS = 900;
/** With less motion: how long each step stands, the wheel and the lamps put straight where they stop. */
export const CALM_MS = { spin: 350, bonus: 300, chance: 350, second: 350 } as const;

/** The whole show of a spin, from where the wheel stands and the lamp last lit. */
export function showOf(spin: Spin, from: number, lampFrom: number, rng: () => number, calm = false): Show {
  const steps: ShowStep[] = [];
  let at = 0;
  const push = (step: Omit<ShowStep, 'at'>) => {
    steps.push({ ...step, at });
    at += step.length;
  };
  const first = planSpin(from, spin.stop, rng);
  if (calm) {
    first.run = 0;
    first.settle = 0;
    first.over = first.end;
  }
  push({ phase: 'spin', length: calm ? CALM_MS.spin : planLength(first), wheel: first });
  let rest = first.end;
  let lamp = lampFrom;
  if (WHEEL[spin.stop] === 'bonus' && spin.lamp !== null && spin.second !== null) {
    push({ phase: 'bonus', length: calm ? CALM_MS.bonus : BONUS_FLASH_MS });
    const lamps = planLamps(lampFrom, spin.lamp, rng);
    if (calm) lamps.run = 0;
    push({ phase: 'chance', length: calm ? CALM_MS.chance : lamps.run + LAMP_HOLD_MS, lamps });
    const second = planSpin(first.end, spin.second, rng);
    if (calm) {
      second.run = 0;
      second.settle = 0;
      second.over = second.end;
    }
    push({ phase: 'second', length: calm ? CALM_MS.second : planLength(second), wheel: second });
    rest = second.end;
    lamp = spin.lamp;
  }
  return { steps, length: at, rest, lamp };
}

export interface ShowFrame {
  phase: Phase;
  angle: number;
  /** The lamp lit, or null when the lamps are not running and none is to be shown. */
  lamp: number | null;
}

/** Where everything is `ms` into the show. */
export function frameAt(show: Show, ms: number): ShowFrame {
  if (ms >= show.length) return { phase: 'done', angle: show.rest, lamp: show.steps.some((step) => step.phase === 'chance') ? show.lamp : null };
  let angle = show.steps[0].wheel?.from ?? show.rest;
  let lamp: number | null = null;
  for (const step of show.steps) {
    const inStep = ms - step.at;
    if (step.wheel) angle = inStep >= 0 ? angleAt(step.wheel, inStep) : angle;
    if (step.lamps && inStep >= 0) lamp = lampAt(step.lamps, inStep);
    if (inStep >= 0 && inStep < step.length) return { phase: step.phase, angle, lamp };
  }
  return { phase: 'done', angle: show.rest, lamp };
}
