/**
 * The session as the play tab charts it: the net medals after each spin, and how often each line of the paytable has
 * hit. Kept in memory only, as the session's statistics are.
 */

import { PAY_RULES, type PayRuleId, type SpinResult } from './engine';

export interface SessionPoint {
  /** Spins played up to this point. */
  spins: number;
  /** Medals bet up to this point. */
  wagered: number;
  /** Medals won less medals bet, up to this point. */
  net: number;
}

export interface SessionLog {
  /** The session from its start (0 spins, 0 medals), oldest first: every `every` spins, and the newest spin. */
  points: readonly SessionPoint[];
  /** The spins between two points kept: 1 until the session outgrows the limit. */
  every: number;
  /** Spins played: the last point's, kept beside the points for the tally. */
  spins: number;
  hits: Readonly<Record<PayRuleId, number>>;
}

/** The most points a session keeps: a chart a few hundred pixels wide shows no more. */
export const POINT_LIMIT = 400;

const START: SessionPoint = { spins: 0, wagered: 0, net: 0 };

export const EMPTY_LOG: SessionLog = {
  points: [START],
  every: 1,
  spins: 0,
  hits: Object.fromEntries(PAY_RULES.map((rule) => [rule.id, 0])) as Record<PayRuleId, number>,
};

/**
 * The log with one more spin on it. The points are a spin apart until there are more than `limit` of them; from then
 * on the spins between them are doubled, as often as it takes, and the points off the new spacing dropped. So a long
 * session's line gets coarser evenly along its length, never longer. The newest spin is always the last point, and
 * the totals are exact whatever the spacing.
 */
export function recordSpin(log: SessionLog, result: Pick<SpinResult, 'bet' | 'win' | 'rule'>, limit = POINT_LIMIT): SessionLog {
  const prev = log.points[log.points.length - 1];
  const point: SessionPoint = { spins: prev.spins + 1, wagered: prev.wagered + result.bet, net: prev.net + result.win - result.bet };
  let every = log.every;
  // The point before stays only if it is on the spacing: off it, it was there as the newest spin and no more.
  let points = [...(prev.spins % every === 0 ? log.points : log.points.slice(0, -1)), point];
  while (points.length > Math.max(3, limit)) {
    every *= 2;
    const spacing = every;
    points = points.filter((p) => p.spins % spacing === 0 || p === point);
  }
  const hits = result.rule ? { ...log.hits, [result.rule.id]: log.hits[result.rule.id] + 1 } : log.hits;
  return { points, every, spins: point.spins, hits };
}

/** What the medals bet come to on average: the house edge of them, gone. */
export const expectedNet = (wagered: number, houseEdge: number): number => -houseEdge * wagered;

/** How often a line of the given chance hits in that many spins, on average. */
export const expectedHits = (spins: number, probability: number): number => spins * probability;

export interface ChartScale {
  /** The last spin on the x axis. */
  maxSpins: number;
  /** The y axis, in medals: always holds 0, every point and the average line. */
  low: number;
  high: number;
}

/** The fewest spins the x axis shows, and the fewest medals the y axis spans, so that a new session is not all zoom. */
export const MIN_SPINS = 10;
export const MIN_SPAN = 20;

export function chartScale(points: readonly SessionPoint[], houseEdge: number): ChartScale {
  let low = 0;
  let high = 0;
  for (const p of points) {
    low = Math.min(low, p.net, expectedNet(p.wagered, houseEdge));
    high = Math.max(high, p.net);
  }
  const short = MIN_SPAN - (high - low);
  if (short > 0) {
    high += short / 2;
    low -= short / 2;
  }
  return { maxSpins: Math.max(MIN_SPINS, points[points.length - 1]?.spins ?? 0), low, high };
}
