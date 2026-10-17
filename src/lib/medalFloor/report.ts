/**
 * The checks every report to the floor goes through, as plain functions: what
 * shape a report may have, how many medals won the floor believes, and how
 * often a player may report or be shown. The server applies them (store.ts);
 * the browser keeps to them so that it is never refused for playing.
 */

import { DAILY_WON_MOST, FLOOR_RULES, isFloorGame, labelPays } from './games';
import type { FloorReport } from './types';

/** How many reports one player may make in a minute (each machine reports about once a minute, and big wins at once). */
export const REPORTS_PER_MINUTE = 20;
/** The least time between two of one player's moments shown on the floor: nobody fills it on their own. */
export const FEED_SPACING_MS = 20_000;
/** How many moments the floor keeps on show. */
export const FEED_SLOTS = 40;
/** The largest report body the server reads. */
export const REPORT_BYTES = 512;

const whole = (value: unknown, least: number, most: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= least && value <= most;

export type ReportCheck = { ok: true; report: FloorReport } | { ok: false; error: string };

/**
 * A report as the browser sent it, checked against the machine's rules: a
 * known machine, whole medals, no win bigger than the machine can pay at all,
 * a named win only in an amount that win pays, and no more medals won in one
 * report than the floor would believe at once.
 */
export function checkReport(body: unknown): ReportCheck {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Report must be an object' };
  const { game, won = 0, best, moment } = body as Record<string, unknown>;
  if (!isFloorGame(game)) return { ok: false, error: 'Unknown machine' };
  const rule = FLOOR_RULES[game];
  if (!whole(won, 0, rule.burst)) return { ok: false, error: 'Medals won out of range' };
  if (best !== undefined && !whole(best, 1, rule.most)) return { ok: false, error: 'Biggest win out of range' };
  let checkedMoment: FloorReport['moment'];
  if (moment !== undefined) {
    if (moment === null || typeof moment !== 'object' || Array.isArray(moment)) return { ok: false, error: 'Moment must be an object' };
    const { medals, label } = moment as Record<string, unknown>;
    if (!whole(medals, 1, rule.most)) return { ok: false, error: 'Moment out of range' };
    if (label !== undefined) {
      if (typeof label !== 'string' || !labelPays(game, label, medals)) return { ok: false, error: 'That win does not pay that' };
      checkedMoment = { medals, label };
    } else checkedMoment = { medals };
  }
  const biggest = Math.max(typeof best === 'number' ? best : 0, checkedMoment?.medals ?? 0);
  if (won === 0 && biggest === 0) return { ok: false, error: 'Nothing to report' };
  const report: FloorReport = { game, won };
  if (biggest > 0) report.best = biggest;
  if (checkedMoment) report.moment = checkedMoment;
  return { ok: true, report };
}

/** One machine's allowance of medals won: how much the floor would believe now, and when that was worked out. */
export interface Allowance {
  level: number;
  at: number;
}

/** The allowance at `now`: refilled at the machine's `perMinute`, up to its `burst`. A new player starts full. */
export function allowanceAt(game: FloorReport['game'], allowance: Allowance | undefined, now: number): number {
  const rule = FLOOR_RULES[game];
  if (!allowance || !Number.isFinite(allowance.level) || !Number.isFinite(allowance.at)) return rule.burst;
  const minutes = Math.max(0, now - allowance.at) / 60_000;
  return Math.min(rule.burst, Math.max(0, allowance.level) + minutes * rule.perMinute);
}

/**
 * How many of `won` medals are counted: no more than the machine's allowance
 * holds, and no more than is left of the player's day.
 */
export function countable(won: number, allowance: number, wonToday: number): number {
  return Math.max(0, Math.min(won, Math.floor(allowance), DAILY_WON_MOST - wonToday));
}

/** A player's report count in the current minute: `minute` is the minute since the epoch the count is for. */
export interface ReportWindow {
  minute: number;
  count: number;
}

/** The window after one more report at `now`, or null when that would be one too many. */
export function nextWindow(window: ReportWindow | undefined, now: number): ReportWindow | null {
  const minute = Math.floor(now / 60_000);
  const count = window && window.minute === minute ? window.count : 0;
  if (count >= REPORTS_PER_MINUTE) return null;
  return { minute, count: count + 1 };
}
