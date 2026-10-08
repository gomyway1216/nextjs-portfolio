/**
 * The Simulation tab's experiment: the same machine as the cabinet, played
 * with no one watching. Where a medal goes is physics, so unlike the slot's
 * odds these numbers cannot be worked out — they have to be measured.
 *
 * Each way of aiming gets a machine of its own, started from the same seed,
 * and plays the same number of medals at the same pace.
 */

import { AIM, CHECKERS, medalsOnField, seededRng } from './engine';
import { JACKPOT_START, TIERS, spinValue, type Tier } from './lottery';
import { advance, createSession, insert, isBusy, type Session } from './session';

export const AIM_IDS = ['centre', 'anywhere', 'between', 'edges'] as const;
export type AimId = (typeof AIM_IDS)[number];

const [LEFT_GATE, CENTRE_GATE, RIGHT_GATE] = CHECKERS.positions;

/**
 * Where each way of aiming lets its `n`-th medal go: always over the centre
 * gate, anywhere at all (`pick` chooses), between two gates, or at the edges.
 */
export function aimAt(id: AimId, n: number, pick: () => number): number {
  switch (id) {
    case 'centre':
      return CENTRE_GATE;
    case 'anywhere':
      return AIM.min + pick() * (AIM.max - AIM.min);
    case 'between':
      return n % 2 === 0 ? (LEFT_GATE + CENTRE_GATE) / 2 : (CENTRE_GATE + RIGHT_GATE) / 2;
    case 'edges':
      return n % 2 === 0 ? AIM.min : AIM.max;
  }
}

/**
 * Each aim's colour, as a variable that the stylesheet sets for the light and
 * the dark theme so the lines keep their contrast on both.
 */
export const AIM_COLORS: Record<AimId, string> = {
  centre: 'var(--mp-s-centre)',
  anywhere: 'var(--mp-s-anywhere)',
  between: 'var(--mp-s-between)',
  edges: 'var(--mp-s-edges)',
};

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond';

/** A shape per aim, so the chart's lines can be told apart without their colours. */
export const AIM_MARKERS: Record<AimId, MarkerShape> = {
  centre: 'circle',
  anywhere: 'square',
  between: 'triangle',
  edges: 'diamond',
};

/** Medals per second on offer. The machine itself takes at most one every 0.18 s. */
export const PACES = [2, 5] as const;
export type Pace = (typeof PACES)[number];

/** Medals played before the count starts, so every machine is measured once its tables have filled. */
export const WARM_UP = 300;
/** The field is run this many times a second, the same step the cabinet never exceeds. */
const STEPS_PER_SECOND = 60;
/** Seconds the machine may go on after the last medal, to finish its spins and payouts. */
const RUN_OUT = 90;
const CHECKPOINTS = 40;

export interface RatePoint {
  medals: number;
  /** Medals won per medal played, so far. */
  rate: number;
}

export interface AimResult {
  played: number;
  won: number;
  lost: number;
  /** Medals through a gate, and how many of those found four spins already held. */
  hits: number;
  wasted: number;
  spins: number;
  /** Medals the slot and the roulette threw onto the field. */
  paidOut: number;
  tiers: Record<Tier, number>;
  jackpots: number;
  /** How many more medals lay on the field at the end than at the start of the count. */
  fieldChange: number;
  points: RatePoint[];
}

export type SimResult = Record<AimId, AimResult>;

export interface AsyncOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
/** Milliseconds of work between two yields to the browser. */
const SLICE = 12;

interface Counts {
  played: number;
  won: number;
  lost: number;
  hits: number;
  wasted: number;
  spins: number;
  paidOut: number;
  tiers: Record<Tier, number>;
  jackpots: number;
  field: number;
}

const onField = (session: Session): number => medalsOnField(session.machine);

const snapshot = (session: Session): Counts => ({
  played: session.inserted,
  won: session.won,
  lost: session.lost,
  hits: session.hits,
  wasted: session.wasted,
  spins: session.spins,
  paidOut: session.paidOut,
  tiers: { ...session.tiers },
  jackpots: session.jackpots,
  field: onField(session),
});

/**
 * Plays `medals` medals each way, `pace` a second, after a warm-up that is not
 * counted. Resolves to null if it is cancelled.
 */
export async function simulate(
  medals: number,
  pace: number,
  options: AsyncOptions = {},
  seed: number = Math.floor(Math.random() * 2 ** 31),
): Promise<SimResult | null> {
  if (!Number.isInteger(medals) || medals <= 0) throw new Error('simulate: medals must be a positive integer');
  if (!(pace > 0) || !Number.isFinite(pace)) throw new Error('simulate: pace must be a positive number');
  // Fail on a bad seed before any work is done.
  seededRng(seed);
  if (options.signal?.aborted) return null;

  const dt = 1 / STEPS_PER_SECOND;
  const interval = 1 / pace;
  const perAim = WARM_UP + medals;
  const total = perAim * AIM_IDS.length;
  const every = Math.max(1, Math.floor(medals / CHECKPOINTS));
  const result = {} as SimResult;
  let sliceStart = performance.now();
  let steps = 0;

  /** Hands the browser a turn when this slice has run long enough; false once cancelled. */
  const breathe = async (done: number): Promise<boolean> => {
    if (++steps % 64 !== 0 || performance.now() - sliceStart < SLICE) return true;
    options.onProgress?.(done, total);
    await yieldToBrowser();
    sliceStart = performance.now();
    return !options.signal?.aborted;
  };

  for (let a = 0; a < AIM_IDS.length; a++) {
    const id = AIM_IDS[a];
    // No balls to begin with: a ball left on the field is a gift, and this measures the machine without one.
    const session = createSession(seed, 0);
    // The experiment is about the machine, not about a purse running dry.
    session.credits = Number.MAX_SAFE_INTEGER;
    // The aim has a generator of its own, so the machine's draws do not depend on it.
    const pick = seededRng(seed + 1);
    let start: Counts | null = null;
    const points: RatePoint[] = [];
    let clock = interval;

    while (session.inserted < perAim) {
      if (clock >= interval && session.machine.cooldown <= 1e-9) {
        if (session.inserted === WARM_UP) start = snapshot(session);
        clock -= interval;
        const taken = insert(session, aimAt(id, session.inserted, pick));
        if (taken && start) {
          const played = session.inserted - start.played;
          if (played % every === 0 || played === medals) points.push({ medals: played, rate: (session.won - start.won) / played });
        }
      }
      advance(session, dt);
      clock += dt;
      if (!(await breathe(a * perAim + session.inserted))) return null;
    }
    // Let the spins it is still holding play out and the prizes land.
    for (let i = 0; i < RUN_OUT * STEPS_PER_SECOND && isBusy(session); i++) {
      advance(session, dt);
      if (!(await breathe((a + 1) * perAim))) return null;
    }

    const from = start ?? snapshot(session);
    const played = session.inserted - from.played;
    const won = session.won - from.won;
    if (points.length > 0) points[points.length - 1] = { medals: played, rate: won / played };
    result[id] = {
      played,
      won,
      lost: session.lost - from.lost,
      hits: session.hits - from.hits,
      wasted: session.wasted - from.wasted,
      spins: session.spins - from.spins,
      paidOut: session.paidOut - from.paidOut,
      tiers: Object.fromEntries(TIERS.map((tier) => [tier, session.tiers[tier] - from.tiers[tier]])) as Record<Tier, number>,
      jackpots: session.jackpots - from.jackpots,
      fieldChange: onField(session) - from.field,
      points,
    };
  }
  options.onProgress?.(total, total);
  return result;
}

/** The share of the medals that left the field which went over the front. */
export const frontShare = (result: AimResult): number => (result.won + result.lost === 0 ? 0 : result.won / (result.won + result.lost));

/**
 * The return this run would have had with average luck on the screen: every
 * medal on the field, dropped or paid out, leaves by the front with the share
 * measured here, and each spin pays its exact average instead of what it
 * happened to pay.
 */
export const steadyReturn = (result: AimResult): number =>
  result.played === 0 ? 0 : frontShare(result) * (1 + (result.spins / result.played) * spinValue(JACKPOT_START));
