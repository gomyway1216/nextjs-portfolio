/**
 * How a race is run on the track, once its result has been drawn (card.ts):
 * the horses leave the gate together, run as their styles have them (a
 * front-runner goes for the lead, a closer waits at the back), the lead
 * changes on the way, and they cross the line in exactly the drawn order, by
 * margins from a nose to a few lengths. Only the look is chosen here, with a
 * generator seeded by the race's own name, so that a race picked up again
 * after a reload is run again just the same; nothing here changes who wins.
 *
 * Each horse's run is a curve through a few points (the off, four calls on the
 * way, the post, and a little past it), each later and further than the one
 * before, joined by Fritsch–Carlson's monotone cubic, which never runs back:
 * every horse goes forward the whole race, and reaches the post at its own
 * finishing time, the winner first.
 */

import { seeded } from './card';
import type { RunningStyle } from './stable';
import { DISTANCE, LENGTH, STRAIGHT_FROM, TURN_FROM } from './geometry';

/** How long the winner takes from the off to the post, in seconds (a little more or less, race by race). */
export const RUN_SECONDS = 15;
/** When the race calls its four points on the way, as shares of the winner's time. */
export const CALLS = [0.12, 0.35, 0.6, 0.82] as const;
/** How far behind the horse in front each place is, at each call, in lengths: close at first, strung out down the far side, closing up at the end. */
const SPACING = [0.5, 0.85, 0.95, 0.75] as const;
/** How far past the post each horse runs on, and in how long, before it is pulled up. */
const RUN_ON = { seconds: 2.2, lengths: 3.5 } as const;

/** The winning margins a race is told in, from a nose to four lengths, in lengths, and how often each comes up. */
export const MARGINS = [
  { id: 'nose', lengths: 0.05, weight: 8 },
  { id: 'head', lengths: 0.1, weight: 8 },
  { id: 'neck', lengths: 0.25, weight: 12 },
  { id: 'half', lengths: 0.5, weight: 15 },
  { id: 'threeQuarters', lengths: 0.75, weight: 12 },
  { id: 'one', lengths: 1, weight: 12 },
  { id: 'oneQuarter', lengths: 1.25, weight: 7 },
  { id: 'oneHalf', lengths: 1.5, weight: 8 },
  { id: 'two', lengths: 2, weight: 8 },
  { id: 'twoHalf', lengths: 2.5, weight: 4 },
  { id: 'three', lengths: 3, weight: 4 },
  { id: 'four', lengths: 4, weight: 2 },
] as const;
export type MarginId = (typeof MARGINS)[number]['id'];
/** A finish this close is a photo: 写真判定. */
export const PHOTO_MOST = 0.25;

/** How strongly each style goes for the lead early on. */
const STYLE_EARLY: Readonly<Record<RunningStyle, number>> = { front: 3, stalker: 1.8, closer: 0.6, deep: -0.6 };
/** How much the finishing order counts at each call: nothing at the first, most of it at the last. */
const FINISH_WEIGHT = [0, 0.12, 0.3, 0.5] as const;

interface Knot {
  t: number;
  s: number;
  /** The slope there: how fast the horse is running, in units a second. */
  m: number;
}

export interface RacePlan {
  /** The drawn order: gates, first to last. */
  order: readonly number[];
  /** When each gate's horse reaches the post, seconds from the off (by gate − 1). */
  finish: readonly number[];
  /** The margin each finisher is behind the one before it (by place: the second's margin is [1]; [0] is nothing). */
  margins: readonly MarginId[];
  /** When the last horse is pulled up past the post: the race's end. */
  end: number;
  /** Who leads at each call, by gate. */
  leaders: readonly number[];
  knots: readonly (readonly Knot[])[];
}

const pick = <T extends { weight: number }>(items: readonly T[], u: number): T => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let left = u * total;
  for (const item of items) {
    if (left < item.weight) return item;
    left -= item.weight;
  }
  return items[items.length - 1];
};

/** Fritsch–Carlson slopes for points that only go up: the cubic through them never turns back. */
function monotoneSlopes(points: readonly { t: number; s: number }[]): number[] {
  const n = points.length;
  const secant = Array.from({ length: n - 1 }, (_, i) => (points[i + 1].s - points[i].s) / (points[i + 1].t - points[i].t));
  const m = points.map((_, i) => (i === 0 ? secant[0] : i === n - 1 ? secant[n - 2] : (secant[i - 1] + secant[i]) / 2));
  for (let i = 0; i < n - 1; i += 1) {
    if (secant[i] <= 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / secant[i];
    const b = m[i + 1] / secant[i];
    const h = a * a + b * b;
    if (h > 9) {
      const tau = 3 / Math.sqrt(h);
      m[i] = tau * a * secant[i];
      m[i + 1] = tau * b * secant[i];
    }
  }
  return m;
}

/**
 * The plan of a race whose horses finish in `order` (gates, first to last),
 * the horses in the gates running in `styles` (by gate − 1), its look chosen
 * by `seed` (the race's name).
 */
export function planRace(order: readonly number[], styles: readonly RunningStyle[], seed: number): RacePlan {
  const rng = seeded(seed);
  const field = order.length;
  const winnerTime = RUN_SECONDS * (0.96 + 0.08 * rng());
  // The pace at the post, and so how long a length takes there.
  const closing = (DISTANCE / winnerTime) * 1.04;
  const perLength = LENGTH / closing;

  // Finishing times: the winner's, then each one behind by its margin.
  const margins: MarginId[] = ['nose'];
  const finish = new Array<number>(field).fill(0);
  let behind = 0;
  order.forEach((gate, place) => {
    if (place > 0) {
      const margin = pick(MARGINS, rng());
      margins[place] = margin.id;
      behind += margin.lengths;
    }
    finish[gate - 1] = winnerTime + behind * perLength;
  });
  margins[0] = 'nose';

  // Where each horse stands at each call: by a mix of how it likes to run and where it will finish.
  const place = new Array<number>(field).fill(0);
  order.forEach((gate, at) => {
    place[gate - 1] = at;
  });
  const early = styles.map((style) => STYLE_EARLY[style] + (rng() * 2 - 1) * 0.9);
  const late = place.map((at) => ((field - 1 - at) / (field - 1)) * 4 - 0.5);
  const ranks: number[][] = FINISH_WEIGHT.map((weight) => {
    const score = early.map((e, g) => (1 - weight) * e + weight * late[g] + (rng() * 2 - 1) * 0.25);
    const byScore = score.map((_, g) => g).sort((a, b) => score[b] - score[a]);
    const rank = new Array<number>(field).fill(0);
    byScore.forEach((g, r) => {
      rank[g] = r;
    });
    return rank;
  });
  // The lead changes at least once: the winner never leads at the first call.
  const winner = order[0] - 1;
  if (ranks[0][winner] === 0) {
    const second = ranks[0].indexOf(1);
    ranks[0][winner] = 1;
    ranks[0][second] = 0;
  }

  const knots: Knot[][] = [];
  for (let g = 0; g < field; g += 1) {
    const points: { t: number; s: number }[] = [{ t: 0, s: 0 }];
    CALLS.forEach((share, k) => {
      const t = share * winnerTime;
      // The leader's pace: a touch slower out of the gate, then even.
      const pace = (k === 0 ? 0.85 : 1) * (t / winnerTime) * DISTANCE;
      const spacing = ranks[k][g] * SPACING[k] * LENGTH * (0.85 + 0.3 * rng());
      points.push({ t, s: pace - spacing });
    });
    points.push({ t: finish[g], s: DISTANCE });
    points.push({ t: finish[g] + RUN_ON.seconds, s: DISTANCE + RUN_ON.lengths * LENGTH });
    const slopes = monotoneSlopes(points);
    // Pulled up past the post: the last slope eases off to a walk.
    slopes[slopes.length - 1] = Math.min(slopes[slopes.length - 1], (RUN_ON.lengths * LENGTH) / RUN_ON.seconds / 3);
    knots.push(points.map((point, i) => ({ ...point, m: slopes[i] })));
  }

  const leaders = CALLS.map((_, k) => ranks[k].indexOf(0) + 1);
  const end = Math.max(...finish) + RUN_ON.seconds;
  return { order, finish, margins, end, leaders, knots };
}

/** How far the horse in `gate` has run `t` seconds after the off. */
export function progressAt(plan: RacePlan, gate: number, t: number): number {
  const knots = plan.knots[gate - 1];
  if (t <= 0) return 0;
  const last = knots[knots.length - 1];
  if (t >= last.t) return last.s;
  let i = 0;
  while (i < knots.length - 2 && t > knots[i + 1].t) i += 1;
  const a = knots[i];
  const b = knots[i + 1];
  const h = b.t - a.t;
  const x = (t - a.t) / h;
  const x2 = x * x;
  const x3 = x2 * x;
  return (2 * x3 - 3 * x2 + 1) * a.s + (x3 - 2 * x2 + x) * h * a.m + (-2 * x3 + 3 * x2) * b.s + (x3 - x2) * h * b.m;
}

/**
 * The gates in the order they stand `t` seconds after the off, the one in front first. A horse past the post is placed
 * where it finished, ahead of any that has not finished yet, whatever happens as they are pulled up.
 */
export function standingsAt(plan: RacePlan, t: number): number[] {
  const gates = plan.order.map((_, i) => i + 1);
  const key = (gate: number): number => (t >= plan.finish[gate - 1] ? 1e6 - plan.finish[gate - 1] : progressAt(plan, gate, t));
  const at = gates.map(key);
  return gates.sort((a, b) => at[b - 1] - at[a - 1] || a - b);
}

/** Whether the first two were too close to call by eye: a photo. */
export const isPhoto = (plan: RacePlan): boolean => (MARGINS.find((margin) => margin.id === plan.margins[1])?.lengths ?? 1) <= PHOTO_MOST;

/** What the race caller says, and when: the moments the commentary line is written for. */
export type Call =
  | { kind: 'off'; t: number }
  | { kind: 'early'; t: number; leader: number; second: number }
  | { kind: 'turn'; t: number; leader: number; second: number }
  | { kind: 'home'; t: number; leader: number; second: number; lengths: number }
  | { kind: 'straight'; t: number; leader: number }
  /** The last hundred: the leader clear, or with another right there, or another flying at it from behind (the winner, coming). */
  | { kind: 'final'; t: number; leader: number; chaser: number; mode: 'clear' | 'close' | 'flying' }
  | { kind: 'post'; t: number; winner: number; photo: boolean }
  | { kind: 'result'; t: number; winner: number; second: number; margin: MarginId; photo: boolean };

/** No two of the caller's lines on the way closer than this, in seconds: each can be read. */
const CALL_GAP = 1.2;

/**
 * The race caller's lines for a plan: the off, the early leaders, into the far turn, round the home turn, the
 * straight, the last hundred (the winner in front, or flying at the leader), the post and the result.
 */
export function callsOf(plan: RacePlan): Call[] {
  const winnerAt = Math.min(...plan.finish);
  const at = (t: number) => standingsAt(plan, t);
  const s = (gate: number, t: number) => progressAt(plan, gate, t);
  /** When the leader first reaches `distance`, to the tenth of a second. */
  const whenLeaderAt = (distance: number, from: number): number => {
    let t = from;
    while (t < winnerAt && s(at(t)[0], t) < distance) t += 0.1;
    return t;
  };
  const calls: Call[] = [{ kind: 'off', t: 0 }];
  const earlyAt = CALLS[0] * winnerAt + 1;
  const early = at(earlyAt);
  calls.push({ kind: 'early', t: earlyAt, leader: early[0], second: early[1] });
  const turnAt = whenLeaderAt(TURN_FROM + 20, earlyAt);
  const round = at(turnAt);
  calls.push({ kind: 'turn', t: turnAt, leader: round[0], second: round[1] });
  const homeAt = whenLeaderAt(TURN_FROM + (STRAIGHT_FROM - TURN_FROM) * 0.62, turnAt);
  const home = at(homeAt);
  calls.push({ kind: 'home', t: homeAt, leader: home[0], second: home[1], lengths: (s(home[0], homeAt) - s(home[1], homeAt)) / LENGTH });
  const straightAt = whenLeaderAt(STRAIGHT_FROM, homeAt);
  calls.push({ kind: 'straight', t: straightAt, leader: at(straightAt)[0] });
  // The last hundred: the winner named, in front or coming.
  const finalAt = whenLeaderAt(DISTANCE - 70, straightAt);
  const last = at(finalAt);
  const winner = plan.order[0];
  const mode = last[0] !== winner ? 'flying' : s(last[0], finalAt) - s(last[1], finalAt) < LENGTH ? 'close' : 'clear';
  calls.push({ kind: 'final', t: finalAt, leader: last[0], chaser: last[0] !== winner ? winner : last[1], mode });
  // The lines on the way, each kept only if the one before it has had time to be read.
  const spoken: Call[] = [];
  for (const call of calls.sort((a, b) => a.t - b.t)) {
    const before = spoken[spoken.length - 1];
    if (!before || call.t - before.t >= CALL_GAP) spoken.push(call);
    // The last hundred says more than the line before it: it takes that line's place.
    else if (call.kind === 'final' && before.kind !== 'off') spoken[spoken.length - 1] = call;
  }
  const photo = isPhoto(plan);
  spoken.push({ kind: 'post', t: winnerAt, winner: plan.order[0], photo });
  spoken.push({ kind: 'result', t: Math.max(...plan.finish) + 0.4, winner: plan.order[0], second: plan.order[1], margin: plan.margins[1], photo });
  return spoken.filter((call) => call.t <= winnerAt || call.kind === 'post' || call.kind === 'result');
}

/** A seed from a race's name, for its plan. */
export function planSeed(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
