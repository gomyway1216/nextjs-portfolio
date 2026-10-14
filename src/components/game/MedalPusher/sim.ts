/**
 * The Simulation tab's experiment: the same machine as the cabinet, played
 * with no one watching. Where a medal goes is physics, so unlike the slot's
 * odds these numbers cannot be worked out — they have to be measured.
 *
 * Each way of aiming gets a machine of its own, started from the same seed,
 * and plays the same number of medals at the same pace: so many a second
 * between the two rails, which every way of aiming but one feeds by turns.
 */

import { AIM, CHECKERS, aimArm, armFor, medalsOnField, seededRng, type Arm } from './engine';
import { CHANCE_BONUS, JACKPOT_GROWTH, JACKPOT_START, TIERS, spinValue, type Tier } from './lottery';
import { advance, createSession, insert, isBusy, type Session } from './session';

export const AIM_IDS = ['centre', 'anywhere', 'beside', 'edges'] as const;
export type AimId = (typeof AIM_IDS)[number];

const [LEFT_POCKET, CENTRE_POCKET, RIGHT_POCKET] = CHECKERS.positions;
/** The two fixed spots beside the START pockets: as far outside the outer two as those are from the middle one. */
export const BESIDE = [LEFT_POCKET - (CENTRE_POCKET - LEFT_POCKET), RIGHT_POCKET + (RIGHT_POCKET - CENTRE_POCKET)] as const;

/** One medal as a way of aiming feeds it: into which rail, and where that rail's arm is pointing when the medal drops off its tip. */
export interface Feed {
  arm: Arm;
  x: number;
}

/**
 * How each way of aiming feeds its `n`-th medal. Three of them feed the two
 * rails by turns, the left first, each rail kept on a spot of its own: both
 * down the middle, behind the centre START pocket; the left at the fixed spot
 * beside the pockets on its side and the right at the one on its; or each at
 * its own edge. The fourth drops anywhere at all (`pick` chooses), from the
 * rail on that side of the field, which swings there. The pockets sit still
 * on the pusher's lip and a medal takes its time getting there, so there is
 * nothing to follow and nothing to lead: a way of aiming is only a choice of
 * column for each rail.
 */
export function aimAt(id: AimId, n: number, pick: () => number): Feed {
  const arm: Arm = n % 2 === 0 ? 0 : 1;
  switch (id) {
    case 'centre':
      return { arm, x: CENTRE_POCKET };
    case 'anywhere': {
      const x = AIM.min + pick() * (AIM.max - AIM.min);
      return { arm: armFor(x), x };
    }
    case 'beside':
      return { arm, x: BESIDE[arm] };
    case 'edges':
      return { arm, x: arm === 0 ? AIM.min : AIM.max };
  }
}

/**
 * Each aim's colour, as a variable that the stylesheet sets for the light and
 * the dark theme so the lines keep their contrast on both. The spots beside
 * the pockets keep the colour that the spots between the gates had.
 */
export const AIM_COLORS: Record<AimId, string> = {
  centre: 'var(--mp-s-centre)',
  anywhere: 'var(--mp-s-anywhere)',
  beside: 'var(--mp-s-between)',
  edges: 'var(--mp-s-edges)',
};

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'diamond';

/** A shape per aim, so the chart's lines can be told apart without their colours. */
export const AIM_MARKERS: Record<AimId, MarkerShape> = {
  centre: 'circle',
  anywhere: 'square',
  beside: 'triangle',
  edges: 'diamond',
};

/** Medals per second on offer, between the two rails. Each rail's slot takes at most one every 0.18 s, so the last is both feed buttons held down. */
export const PACES = [2, 5, 11] as const;
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
  /** Medals that dropped through a START pocket, whoever fed or paid them, and how many of those found the hold already full. */
  hits: number;
  wasted: number;
  spins: number;
  /** Gold spins that were started: each was turned gold by a medal that found the hold full. They are among `spins`. */
  gold: number;
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
  gold: number;
  paidOut: number;
  tiers: Record<Tier, number>;
  jackpots: number;
  field: number;
}

const onField = (session: Session): number => medalsOnField(session.machine);

/**
 * How many gold spins a session has started so far: every medal that made a spin gold, by finding the hold
 * full or by being held through the lit slot or open wings, less the gold spins still held, which have not
 * been spun yet. A stretch of play is measured by the difference between its
 * two ends, so a gold spin belongs to the stretch its reels turned in, like any other spin, and not to the one
 * its medal went through the pocket in.
 */
export const goldStarted = (session: Pick<Session, 'gilded' | 'lucky' | 'gold'>): number => session.gilded + session.lucky - session.gold;

const snapshot = (session: Session): Counts => ({
  played: session.inserted,
  won: session.won,
  lost: session.lost,
  hits: session.hits,
  wasted: session.wasted,
  spins: session.spins,
  gold: goldStarted(session),
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
    // No balls and no jewels to begin with: one left on the field is a gift, and this measures the machine without.
    // Its player picks a chest the moment it is offered, so no spin waits on a choice.
    const session = createSession(seed, { balls: 0, jewels: 0, quickPick: true });
    // The experiment is about the machine, not about a purse running dry.
    session.credits = Number.MAX_SAFE_INTEGER;
    // The aim has a generator of its own, so the machine's draws do not depend on it.
    const pick = seededRng(seed + 1);
    let start: Counts | null = null;
    const points: RatePoint[] = [];
    let clock = interval;
    // The spot each medal on a rail is meant for, rail by rail, in the order they were fed.
    const meant: [number[], number[]] = [[], []];
    /**
     * A medal drops where its arm's tip is when it leaves it, a roll after it was fed. So before
     * every step each arm is pointed where the medal that leaves it next is meant to drop. An arm
     * crosses its whole reach in less time than its slot waits between two medals, so it is always
     * there by then.
     */
    const holdArms = () => {
      for (const arm of [0, 1] as const) {
        const onRail = session.machine.rolling.reduce((count, medal) => count + (medal.arm === arm ? 1 : 0), 0);
        meant[arm].splice(0, meant[arm].length - onRail);
        if (meant[arm].length > 0) aimArm(session.machine, arm, meant[arm][0]);
      }
    };
    // The medal that goes in next, once it has been decided: it waits for its rail's slot if that is not free yet.
    let next: Feed | null = null;

    while (session.inserted < perAim) {
      if (clock >= interval) next ??= aimAt(id, session.inserted, pick);
      if (next && session.machine.waits[next.arm] <= 1e-9) {
        if (session.inserted === WARM_UP) start = snapshot(session);
        clock -= interval;
        const taken = insert(session, next.arm);
        if (taken) meant[next.arm].push(next.x);
        next = null;
        if (taken && start) {
          const played = session.inserted - start.played;
          if (played % every === 0 || played === medals) points.push({ medals: played, rate: (session.won - start.won) / played });
        }
      }
      holdArms();
      advance(session, dt);
      clock += dt;
      if (!(await breathe(a * perAim + session.inserted))) return null;
    }
    // Let the last medals drop, the spins it is still holding play out and the prizes land.
    for (let i = 0; i < RUN_OUT * STEPS_PER_SECOND && isBusy(session); i++) {
      holdArms();
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
      gold: goldStarted(session) - from.gold,
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

/** The share of the medals that left the field which dropped into the tray, over the middle of the front edge: the rest went down the side holes. */
export const frontShare = (result: AimResult): number => (result.won + result.lost === 0 ? 0 : result.won / (result.won + result.lost));

/**
 * Medals the screen's games put on the field for each medal played in this
 * run, with average luck: each spin at its exact average instead of what it
 * happened to pay, an ordinary spin's, and for a gold spin what being gold
 * adds to that; and what the jackpot grew by, every medal of which is paid
 * when it is won.
 */
export const steadyPaid = (result: AimResult): number =>
  result.played === 0 ? 0 : (result.spins * spinValue(JACKPOT_START) + result.gold * CHANCE_BONUS) / result.played + JACKPOT_GROWTH;

/**
 * The return this run would have had with average luck on the screen: every
 * medal on the field, dropped or paid out, leaves by the front with the share
 * measured here, and the screen pays its exact average (`steadyPaid`).
 */
export const steadyReturn = (result: AimResult): number => (result.played === 0 ? 0 : frontShare(result) * (1 + steadyPaid(result)));
