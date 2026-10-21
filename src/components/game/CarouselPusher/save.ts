/**
 * The machine as it is written down, and read back: every field checked, nothing trusted. A save holds the field's
 * medals to a ten-thousandth of a medal's radius (the machine plays on from there exactly as it would have, to
 * within that), the medals in the air, the counter and its spin, the numbers drawn ahead, and the treasure dish.
 */

import { AIR_MOST, FIELD, FIELD_MOST, HOLD_MAX, STOCK, TIMES, type Air, type Machine, type Spin } from './engine';
import { OUTCOME_IDS, STOPS, classify } from './lottery';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const isNumber = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
/** To four places: what a save keeps of a position. */
const kept = (value: number): number => Math.round(value * 10_000) / 10_000;

/** The most steps a machine has run: about 500 years of play. */
const STEP_MOST = 1e12;
/** How far outside the field a medal's middle can be in a save (one on its way over an edge, or behind a wall). */
const MARGIN = 8;
const X_RANGE = [-MARGIN, FIELD.width + MARGIN] as const;
const Y_RANGE = [-MARGIN, FIELD.depth + MARGIN] as const;
/** How far a medal on the deck can be from the pole. */
const DECK_RANGE = 12;

/** The machine as text. */
export function serializeMachine(m: Machine): string {
  return JSON.stringify(packMachine(m));
}

/** The machine as plain data, its positions to four places. */
export function packMachine(m: Machine): Machine {
  return {
    ...m,
    xy: m.xy.map(kept),
    grow: m.grow.map(kept),
    ids: m.ids.slice(),
    air: m.air.map(packAir),
    spin: m.spin ? { ...m.spin, digits: [...m.spin.digits] as Spin['digits'], stops: [...m.spin.stops] as Spin['stops'] } : null,
    tickets: m.tickets.slice(),
  };
}

function packAir(a: Air): Air {
  switch (a.k) {
    case 'rail':
      return { ...a, dx: kept(a.dx), dy: kept(a.dy) };
    case 'drop':
    case 'fling':
      return { ...a, x: kept(a.x), y: kept(a.y) };
    case 'slide':
      return { ...a, qx: kept(a.qx), qy: kept(a.qy), ex: kept(a.ex), ey: kept(a.ey) };
    case 'off':
      return { ...a, sx: kept(a.sx), sy: kept(a.sy), x: kept(a.x), y: kept(a.y) };
  }
}

/** A medal in the air as a save holds it, or null when it is not one the machine could have. */
function parseAir(value: unknown, step: number): Air | null {
  if (!isRecord(value) || !isWhole(value.id, 1, Number.MAX_SAFE_INTEGER) || !isWhole(value.from, 0, STEP_MOST) || !isWhole(value.at, 0, STEP_MOST)) return null;
  const { id, from, at } = value;
  // A medal on its way arrives after it set off, and no later than its longest leg from now (a rail behind the slot's queue).
  if (at < from || from > step + 4 * TIMES.rail || at > step + 8 * TIMES.rail + 400) return null;
  // The press's draw for the way a miss glances off the deck. Saves from before the machine drew it have none: such a
  // medal takes one of its own from its number, so the save still plays on.
  const w = value.w === undefined ? (id * 0.6180339887498949) % 1 : value.w;
  if ((value.k === 'rail' || value.k === 'drop') && !isNumber(w, 0, 1)) return null;
  switch (value.k) {
    case 'rail':
      if (!isNumber(value.dx, -3, 3) || !isNumber(value.dy, -3, 3)) return null;
      return { k: 'rail', id, from, at, dx: value.dx, dy: value.dy, w: w as number };
    case 'drop':
      if (!isNumber(value.x, ...X_RANGE) || !isNumber(value.y, ...Y_RANGE)) return null;
      return { k: 'drop', id, from, at, x: value.x, y: value.y, w: w as number };
    case 'fling':
      if (!isNumber(value.x, ...X_RANGE) || !isNumber(value.y, ...Y_RANGE)) return null;
      return { k: 'fling', id, from, at, x: value.x, y: value.y };
    case 'slide': {
      for (const key of ['qx', 'qy', 'ex', 'ey'] as const) if (!isNumber(value[key], -DECK_RANGE, DECK_RANGE)) return null;
      if (!isWhole(value.pocket, -1, 2) || typeof value.direct !== 'boolean') return null;
      return { k: 'slide', id, from, at, qx: value.qx as number, qy: value.qy as number, ex: value.ex as number, ey: value.ey as number, pocket: value.pocket, direct: value.direct };
    }
    case 'off':
      if (!isNumber(value.sx, ...X_RANGE) || !isNumber(value.sy, ...Y_RANGE) || !isNumber(value.x, ...X_RANGE) || !isNumber(value.y, ...Y_RANGE)) return null;
      return { k: 'off', id, from, at, sx: value.sx, sy: value.sy, x: value.x, y: value.y };
    default:
      return null;
  }
}

/** A spin as a save holds it: its digits must show its outcome, and its stops be the ones a spin of them has. */
function parseSpin(value: unknown, step: number): Spin | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isWhole(value.outcome, 0, OUTCOME_IDS.length - 1) || !Array.isArray(value.digits) || value.digits.length !== 3 || !value.digits.every((d) => isWhole(d, 0, 9))) return undefined;
  const digits = value.digits as [number, number, number];
  if (classify(...digits) !== OUTCOME_IDS[value.outcome]) return undefined;
  if (!isWhole(value.from, 0, STEP_MOST) || value.from > step || !Array.isArray(value.stops) || !isWhole(value.at, 0, STEP_MOST)) return undefined;
  const right = digits[0] === digits[1] ? STOPS.reach : STOPS.right;
  const after = OUTCOME_IDS[value.outcome] === 'jackpot' ? STOPS.jackpotAfter : STOPS.after;
  const stops: Spin['stops'] = [STOPS.left, STOPS.middle, right];
  if (value.stops.length !== 3 || value.stops.some((s, i) => s !== stops[i]) || value.at !== value.from + right + after) return undefined;
  return { outcome: value.outcome, digits: [...digits], from: value.from, stops, at: value.at };
}

/** A machine as it comes back out of a save, or null when it is not one this machine could have written. */
export function parseMachine(value: unknown): Machine | null {
  if (!isRecord(value) || !isWhole(value.step, 0, STEP_MOST)) return null;
  const step = value.step;
  const { xy, grow, ids } = value;
  if (!Array.isArray(xy) || !Array.isArray(grow) || !Array.isArray(ids)) return null;
  const n = ids.length;
  if (n > FIELD_MOST || xy.length !== 2 * n || grow.length !== n) return null;
  for (let i = 0; i < n; i++) {
    if (!isNumber(xy[2 * i], ...X_RANGE) || !isNumber(xy[2 * i + 1], ...Y_RANGE) || !isNumber(grow[i], 0.3, 1) || !isWhole(ids[i], 1, Number.MAX_SAFE_INTEGER)) return null;
  }
  if (!Array.isArray(value.air) || value.air.length > AIR_MOST) return null;
  const air: Air[] = [];
  for (const a of value.air) {
    const parsed = parseAir(a, step);
    if (!parsed) return null;
    air.push(parsed);
  }
  const spin = parseSpin(value.spin, step);
  if (spin === undefined) return null;
  if (!isWhole(value.holds, 0, HOLD_MAX) || !isWhole(value.rest, 0, 60)) return null;
  if (!Array.isArray(value.tickets) || value.tickets.length > 16 || !value.tickets.every((t) => isNumber(t, 0, 1) && t < 1)) return null;
  if (!isWhole(value.stock, STOCK.start, STOCK.most) || !isWhole(value.toStock, 0, STOCK.every - 1)) return null;
  if (!isWhole(value.fling, 0, STOCK.most) || !isWhole(value.flingAt, 0, STEP_MOST)) return null;
  if (!isWhole(value.rng, -(2 ** 31), 2 ** 31 - 1) || !isWhole(value.nextId, 1, Number.MAX_SAFE_INTEGER)) return null;
  if (!isWhole(value.slotAt, 0, STEP_MOST) || value.slotAt > step + 8 * TIMES.gap) return null;
  if (!isWhole(value.tray, 0, 1_000_000) || !isWhole(value.quiet, 0, STEP_MOST)) return null;
  const allIds = [...(ids as number[]), ...air.map((a) => a.id)];
  if (new Set(allIds).size !== allIds.length || allIds.some((id) => id >= (value.nextId as number))) return null;
  return {
    step,
    xy: (xy as number[]).slice(),
    grow: (grow as number[]).slice(),
    ids: (ids as number[]).slice(),
    air,
    holds: value.holds,
    spin,
    rest: value.rest,
    tickets: (value.tickets as number[]).slice(),
    stock: value.stock,
    toStock: value.toStock,
    fling: value.fling,
    flingAt: value.flingAt,
    rng: value.rng,
    nextId: value.nextId,
    slotAt: value.slotAt,
    tray: value.tray,
    quiet: value.quiet,
  };
}
