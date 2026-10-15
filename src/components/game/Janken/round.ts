/**
 * One round at the machine, from the medal going in to the medals paid, as
 * plain data that is written down after every step. Only the steps are here;
 * who may take them, and the medals that go with them, are `machine.ts`'s.
 *
 * - **calling**: medals are at stake and the cat is calling "jan, ken…". A
 *   fresh round has the one medal put in at stake; a double-up has the medals
 *   won. Nothing of the cat's hand exists yet: it is drawn when the player's
 *   hand is pressed.
 * - **spinning**: a win has been thrown, and the lamp the roulette stops on
 *   has been drawn with it. The ring is being run round to it.
 * - **offer**: the medals won wait to be taken, or put on a double-up.
 *
 * A round that is being paid says so (`paying`): the medals it ends with are
 * written down before they go in, so that a browser that dies between the
 * two pays them once when the machine is next opened, and the round cannot
 * be played on instead.
 *
 * No round at all is the machine waiting for a medal.
 */

import { LAMPS, MAX_DOUBLES, type Outcome } from './engine';

export const ROUND_VERSION = 1;

export interface Round {
  v: typeof ROUND_VERSION;
  /** A round of a medal put in, or a double-up of medals won. */
  kind: 'play' | 'double';
  phase: 'calling' | 'spinning' | 'offer';
  /** While calling: the medals at stake. 1 for a medal put in, the medals won for a double-up. */
  stake: number;
  /** While spinning or on offer: the medals won and not yet paid. */
  win: number;
  /** The lamp the roulette stopped on, after a won play; −1 before. */
  lamp: number;
  /** Double-ups won so far. */
  doubles: number;
  /** Draws in a row on the throw being called: shown as "あいこで…", and "しょ!" when the hand is pressed. */
  draws: number;
  /**
   * The round's name, which its moves of medals go under (`bank.apply`). A round from before receipts has none until
   * it is paid.
   */
  id?: string;
  /** The medals the round ends with, once it is being paid: written down before they go in. */
  paying?: number;
}

/** A medal has gone in: it is at stake. */
export const started = (): Round => ({ v: ROUND_VERSION, kind: 'play', phase: 'calling', stake: 1, win: 0, lamp: -1, doubles: 0, draws: 0 });

/**
 * The round after a throw. A draw is called again with the same stake; a loss
 * ends the round with nothing; a win of a play goes to the roulette, which
 * stops on `lamp` (drawn with the throw); a win of a double-up doubles the
 * medals at stake.
 */
export function thrown(round: Round, outcome: Outcome, lamp = -1): Round | null {
  if (round.phase !== 'calling') return round;
  if (outcome === 'draw') return { ...round, draws: round.draws + 1 };
  if (outcome === 'lose') return null;
  if (round.kind === 'play') {
    if (!Number.isInteger(lamp) || lamp < 0 || lamp >= LAMPS.length) throw new Error('a won play needs the lamp its roulette stops on');
    return { ...round, phase: 'spinning', stake: 0, win: LAMPS[lamp], lamp, draws: 0 };
  }
  return { ...round, phase: 'offer', stake: 0, win: round.stake * 2, doubles: round.doubles + 1, draws: 0 };
}

/** The ring has stopped: the medals it stopped on are offered. */
export const spun = (round: Round): Round => (round.phase === 'spinning' ? { ...round, phase: 'offer' } : round);

/** Whether the medals on offer can still be doubled up. */
export const canDouble = (round: Round | null): boolean => round !== null && round.phase === 'offer' && round.doubles < MAX_DOUBLES;

/** The medals on offer put on a double-up. Nothing moves in or out of the player's medals: they were never paid. */
export const doubled = (round: Round): Round => (canDouble(round) ? { ...round, kind: 'double', phase: 'calling', stake: round.win, win: 0, draws: 0 } : round);

/**
 * What the round is owed if it ends here, before anything more is thrown:
 * the medals at stake while it calls (a medal put in comes back; medals won
 * that were put on a double-up come back as won), and the medals won once
 * a win has been thrown.
 */
export const owed = (round: Round | null): number => (round === null ? 0 : round.phase === 'calling' ? round.stake : round.win);

// ── Written down ────────────────────────────────────────────────────────────

/** Where a player's round in play is kept on this device: a guest's under one name, an account's under it and the account. */
export const ROUND_KEY = 'medal-janken-round';
export const roundKey = (owner: string | null): string => (owner === null ? ROUND_KEY : `${ROUND_KEY}:${owner}`);

export const packRound = (round: Round): string => JSON.stringify(round);

const whole = (value: unknown, least: number, most: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most;
/** The most a round can have at stake or won: the biggest lamp doubled every time it can be. */
export const MOST_MEDALS = Math.max(...LAMPS) * 2 ** MAX_DOUBLES;

/** The round in a text that was kept, or null for none, or for anything that is not a round this version wrote. */
export function readRound(text: unknown): Round | null {
  if (typeof text !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const r = data as Record<string, unknown>;
  if (r.v !== ROUND_VERSION || (r.kind !== 'play' && r.kind !== 'double') || (r.phase !== 'calling' && r.phase !== 'spinning' && r.phase !== 'offer')) return null;
  if (!whole(r.stake, 0, MOST_MEDALS) || !whole(r.win, 0, MOST_MEDALS) || !whole(r.lamp, -1, LAMPS.length - 1) || !whole(r.doubles, 0, MAX_DOUBLES) || !whole(r.draws, 0, 1_000_000)) return null;
  const round: Round = { v: ROUND_VERSION, kind: r.kind, phase: r.phase, stake: r.stake, win: r.win, lamp: r.lamp, doubles: r.doubles, draws: r.draws };
  if (r.id !== undefined) {
    if (typeof r.id !== 'string' || !/^[a-z0-9]{1,24}$/.test(r.id)) return null;
    round.id = r.id;
  }
  if (r.paying !== undefined) {
    if (!whole(r.paying, 1, MOST_MEDALS)) return null;
    round.paying = r.paying;
  }
  // What each step leaves, and nothing else: a medal or a won sum at stake while calling, a lamp's medals spinning.
  if (round.phase === 'calling') {
    if (round.win !== 0 || round.stake < 1) return null;
    if (round.kind === 'play' && (round.stake !== 1 || round.doubles !== 0)) return null;
  } else {
    if (round.stake !== 0 || round.win < 1) return null;
    if (round.phase === 'spinning' && (round.kind !== 'play' || round.lamp < 0 || LAMPS[round.lamp] !== round.win)) return null;
  }
  return round;
}
