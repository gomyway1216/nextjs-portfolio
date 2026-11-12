/**
 * The machine's data counter (データカウンター), as a hall hangs one over each machine: the spins since the last hit,
 * the hits with the spins each took, the longest wait and the longest run, and where the balls went.
 *
 * It writes down, once each, the slots this page ran one at a time this visit: as the slot is shown, or, where the
 * card was given up or came back with its ball still on the way, without its having been shown (dueTally.ts). A hit's
 * rounds played out all at once as the page is hidden or left (medalTable.ts `leaving`, `open`) are not among them, and
 * a reset of the medals empties it. Nothing here is read by the rules, the draw or the medals, and nothing is kept
 * between visits.
 */

import type { Fired, HitKind, Mode, Pocket, Tick } from './engine';

/** The hits the counter lists, the latest first. */
export const HIT_LOG = 12;
/** The spins a bar of the hit list is full at: about twice the wait 1 in 99.9 gives on average. */
export const BAR_FULL = 200;

export interface HitEntry {
  /** The hit's number this visit, from 1. */
  id: number;
  kind: HitKind;
  /** The spins it took: those started since the hit before it (or since the visit began), its own among them. */
  spins: number;
  /** The mode its spin started in. */
  mode: Mode;
  /** Its place in its run of hits, from 1: hits one after another until normal play comes back. */
  run: number;
}

export interface DataCounter {
  /** Spins started since the last hit, or since the visit began. */
  since: number;
  /** Hits this visit. */
  hits: number;
  /** The most spins between hits this visit, the wait going on now among them. */
  longest: number;
  /** The run of hits going on: 0 in normal play with none. */
  run: number;
  bestRun: number;
  /** Balls that came to each pocket. */
  pockets: Readonly<Record<Pocket, number>>;
  /** Balls into the ヘソ that took no hold: four were waiting already. */
  overflow: number;
  /** The last hits, the latest first, `HIT_LOG` at most. */
  log: readonly HitEntry[];
}

export const EMPTY_COUNTER: DataCounter = {
  since: 0,
  hits: 0,
  longest: 0,
  run: 0,
  bestRun: 0,
  pockets: { heso: 0, side: 0, denchu: 0, attacker: 0, out: 0 },
  overflow: 0,
  log: [],
};

/** The counter after a slot: the ball that came to its pocket (if one did), then what the machine did. */
export function counted(counter: DataCounter, ball: Fired | null, ticks: readonly Tick[]): DataCounter {
  let { since, hits, longest, run, bestRun, overflow } = counter;
  let pockets = counter.pockets;
  let log = counter.log;
  if (ball) {
    pockets = { ...pockets, [ball.pocket]: pockets[ball.pocket] + 1 };
    if (ball.pocket === 'heso' && ball.held === null) overflow += 1;
  }
  for (const t of ticks) {
    if (t.type === 'start') {
      since += 1;
      longest = Math.max(longest, since);
    } else if (t.type === 'stop' && t.kind) {
      hits += 1;
      // A hit in normal play begins a run, whatever was written down before: the machine may have come back to normal
      // play where this page never saw it (played on in another tab).
      run = t.spin.mode === 'normal' ? 1 : run + 1;
      bestRun = Math.max(bestRun, run);
      // A spin already going as the visit began was never counted as it started: the hit still took that one spin.
      const spins = Math.max(1, since);
      longest = Math.max(longest, spins);
      log = [{ id: hits, kind: { ...t.kind }, spins, mode: t.spin.mode, run }, ...log].slice(0, HIT_LOG);
      since = 0;
    } else if (t.type === 'mode' && t.mode === 'normal') run = 0;
  }
  return { since, hits, longest, run, bestRun, pockets, overflow, log };
}

/** Balls that came to any pocket, OUT among them. */
export const landed = (counter: DataCounter): number => Object.values(counter.pockets).reduce((sum, n) => sum + n, 0);

/**
 * A share of a whole as a percentage to one place. Null: nothing to share. A share too small to show as 0.1% is said
 * to be under it, never 0.0%; one that would round up to 100.0% with something left over is said to be over 99.9%.
 */
export function shareOf(part: number, whole: number): { value: number; bound: '<' | '>' | null } | null {
  if (whole <= 0) return null;
  const percent = (part / whole) * 100;
  if (part > 0 && percent < 0.05) return { value: 0.1, bound: '<' };
  if (part < whole && percent >= 99.95) return { value: 99.9, bound: '>' };
  return { value: Math.round(percent * 10) / 10, bound: null };
}

/** How full a hit's bar is drawn, 0 to 1: its spins against `BAR_FULL`, and never so thin it cannot be seen. */
export const barOf = (spins: number): number => Math.min(1, Math.max(0.04, spins / BAR_FULL));
