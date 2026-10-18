/**
 * The floor jackpot: one pool for the whole medal floor, held by the server,
 * that joined players feed as they play at the machines linked to it, and any
 * of them can win.
 *
 * ## How it works
 *
 * - **What feeds it.** For every medal a joined player plays at a linked
 *   machine, the site adds a share to the pool: `JACKPOT_SHARE`, one medal for
 *   every 100 played (1%). The share is added *on top* of the stake, not taken
 *   out of it, so every machine still pays back exactly what its own odds say.
 * - **The draw.** Each of those medals is also a ticket with a chance of
 *   `1 / JACKPOT_ONE_IN` (1 in 150,000) to win the whole pool. A report of
 *   `played` medals is drawn once, on the server, with `1 − (1 − q)^played`
 *   (`winChance`), from `node:crypto` randomness. The browser never draws.
 * - **Once won,** the pool starts again at `JACKPOT_SEED` (1,000).
 * - **Which machines.** A machine is linked only if its best play, with the
 *   floor jackpot's long-run value added, still brings back at most 100% of
 *   the medals played (`linked`, from each machine's `bestReturn` in games.ts,
 *   pinned against the games' own exact odds). The pusher, the slot machine,
 *   Calico Janken, roulette, Three Card Poker, Big Catch Harbor, Mini Turf
 *   Racing, Ball Bingo, the Star Festival Big Wheel, the High & Low Ladder and Moonlit Sic Bo are; blackjack, video poker, baccarat and craps, whose best play
 *   already brings back 99% to 100%, are not. As on a real floor, not every cabinet is
 *   on the progressive: play at those tables neither feeds it nor draws for it.
 * - **Limits.** The medals played that take part are checked like the medals
 *   won: no faster than each machine can be played (games.ts), and at most
 *   `DAILY_PLAYED_MOST` (20,000) of one player's a floor day. One jackpot per
 *   player per floor day.
 *
 * ## Why these numbers
 *
 * The owner's rule is that the machines pay like real ones: about 90%, and
 * never more than 100%. So the floor jackpot adds little to each medal, and
 * grows for a while before somebody hits it.
 *
 * - **What it is worth.** In the long run every medal that takes part brings
 *   back its share, 0.01, and its part of the seeds the site puts in, 1,000 for
 *   every 150,000 medals: `EXPECTED_PER_MEDAL` = c + seed × q ≈ 0.0167, 1.67
 *   medals for every 100 played (a hair less, `exactPerMedal`, since a part of
 *   a medal is never added). That is on top of each linked machine's own
 *   return, for joined players only, and only in the long run.
 * - **How big.** On average the pool is hit after 150,000 medals have fed it a
 *   hundredth each: 1,500 on top of the seed, 2,500 medals in all
 *   (`MEAN_JACKPOT`). Half of all hits are under about 2,000 and one in ten is
 *   over 4,400, as a geometric wait gives.
 * - **How often.** The floor is small: a handful of signed-in players a day
 *   who have joined it, each playing half an hour to an hour, about 20,000 to
 *   40,000 medals a day at the linked machines. That is a hit about once a week
 *   (every 4 to 7.5 days); once a day on a busy day of 150,000; once a
 *   fortnight on a quiet day of 10,000. A progressive that grows for a while is
 *   part of the fun.
 * - **No farming.** One player's day takes part up to 20,000 medals, so the
 *   most anyone can have of winning in a day, whatever their browser reports,
 *   is 1 − (1 − q)^20,000 ≈ 12.5%, and at most one jackpot a day. Honest heavy
 *   players get the same chance as anyone who lies about their play.
 *
 * The owner can change any of these here; the Odds tabs say what they are.
 *
 * Nothing here is money, and no word of it reaches a player as money.
 */

import { FLOOR_GAMES, FLOOR_RULES, type FloorGame } from './games';
import { isTag } from './names';

/** The share of every medal played that the site adds to the pool: `medals` for every `per` played (1%). */
export const JACKPOT_SHARE = { medals: 1, per: 100 } as const;
/** The share as a fraction: c. */
export const JACKPOT_C = JACKPOT_SHARE.medals / JACKPOT_SHARE.per;
/** What the pool starts at, and starts at again once it has been won. The site puts it in. */
export const JACKPOT_SEED = 1_000;
/** Each medal played that takes part has a chance of one in this to win the pool. */
export const JACKPOT_ONE_IN = 150_000;
/** The chance of each medal played: q. */
export const JACKPOT_Q = 1 / JACKPOT_ONE_IN;

/** The most medals played of one player's in one floor day that take part: past it, no share is added and no ticket drawn. */
export const DAILY_PLAYED_MOST = 20_000;
/** How many of a player's wins can wait to be paid at once (one a day, so this is a month's): past it, they win no more until they are paid. */
export const PENDING_MOST = 30;
/** How many of the last wins the pool shows. */
export const JACKPOT_WINS_SHOWN = 5;

/** The game name the medals' receipts are made under: `floor-jackpot:<win id>:pay`. */
export const JACKPOT_GAME = 'floor-jackpot';
/** The step of a win's receipt. */
export const JACKPOT_PAY_STEP = 'pay';
/** The label a jackpot's moment carries on the floor's feed. */
export const JACKPOT_LABEL = 'floor-jackpot';
/** Where the pool is shown live in the Realtime Database: public to read, written by the server only. */
export const FLOOR_JACKPOT_PATH = 'medalFloor/jackpot';

/**
 * After a device of a player's says it is paying a win, no other device of
 * theirs is given it for this long: two devices open at once never both pay
 * it. A device that never comes back lets it go after this.
 */
export const CLAIM_LEASE_MS = 10 * 60_000;
/** How many floor days a device keeps the receipt of a win it has paid, so that a page that heard of the win late finds it paid. */
export const RECEIPT_KEEP_DAYS = 3;

// ── The arithmetic ───────────────────────────────────────────────────────────

/** The medals in a pool: its seed, a share of the medals played since it started, and anything put back into it. */
export const poolAmount = (pool: { seed: number; played: number; extra: number }): number =>
  pool.seed + Math.floor((pool.played * JACKPOT_SHARE.medals) / JACKPOT_SHARE.per) + pool.extra;

/** The chance that `played` medals win at least once: 1 − (1 − q)^played. */
export const winChance = (played: number): number => (played > 0 ? -Math.expm1(played * Math.log1p(-JACKPOT_Q)) : 0);

/** The pool on average when it is won: the seed and c / q, the share of the 1 / q medals played on average before a hit. */
export const MEAN_JACKPOT = JACKPOT_SEED + JACKPOT_C * JACKPOT_ONE_IN;

/** What a medal that takes part brings back in the long run, as published: c + seed × q. */
export const EXPECTED_PER_MEDAL = JACKPOT_C + JACKPOT_SEED * JACKPOT_Q;

/**
 * Whether a machine is linked to the floor jackpot: its best play, with the
 * floor jackpot's long-run value added, brings back at most 100% of the medals
 * played. Play at a machine that is not linked neither feeds it nor draws for it.
 */
export const linked = (game: FloorGame): boolean => FLOOR_RULES[game].bestReturn + EXPECTED_PER_MEDAL <= 1;

/** The machines linked to the floor jackpot, in the floor's order. */
export const LINKED_GAMES: readonly FloorGame[] = FLOOR_GAMES.filter(linked);

/**
 * The same, exactly, with whole medals: by the renewal-reward theorem, what a
 * pool pays on average over the medals played on average between two hits.
 * A pool won after G medals pays seed + ⌊G / per⌋, and G is geometric (each
 * medal wins with q), so E[⌊G / per⌋] = Σₖ P(G ≥ k·per) = r^(per−1) / (1 − r^per)
 * with r = 1 − q, and E[G] = 1 / q.
 */
export function exactPerMedal(): number {
  const r = 1 - JACKPOT_Q;
  const per = JACKPOT_SHARE.per;
  const shares = (JACKPOT_SHARE.medals * r ** (per - 1)) / (1 - r ** per);
  return JACKPOT_Q * (JACKPOT_SEED + shares);
}

/** How many hits a day the floor sees on average with `played` medals a day taking part. */
export const hitsPerDay = (played: number): number => played * JACKPOT_Q;

// ── Names ────────────────────────────────────────────────────────────────────

const WIN_ID = /^(\d{8})-[0-9a-f]{8}$/;
/** A win's name: the floor day it was won on and eight random hex digits, `20261017-a1b2c3d4`. It fits a receipt's round. */
export const isWinId = (value: unknown): value is string => typeof value === 'string' && WIN_ID.test(value);
/** The floor day (`YYYY-MM-DD`) as a win's name begins with it. */
export const compactDay = (key: string): string => key.replace(/-/g, '');
/** The floor day a win's name says it was won on (`YYYYMMDD`), or null. */
export const winDay = (id: string): string | null => WIN_ID.exec(id)?.[1] ?? null;
/** A device's name as the medals keep it (MedalCenter/ledger.ts): the device a win is claimed for. */
export const isDeviceName = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]{6,16}$/.test(value);

// ── What goes over the wire ──────────────────────────────────────────────────

/** A win as everybody is shown it: who, at which machine, how many medals, when. No account id. */
export interface JackpotWinShown {
  name: string | null;
  tag: string;
  game: FloorGame;
  medals: number;
  at: number;
}

/** The pool as everybody is shown it. */
export interface FloorJackpotView {
  /** The server's clock as it answered. */
  now: number;
  /** False when the floor's store could not be reached: then nothing else here means anything. */
  available: boolean;
  /** The medals in the pool now. */
  amount: number;
  /** How many times it has been won. */
  seq: number;
  /**
   * The pool's version: every change counts it up, and the live mirror
   * (`JackpotLive.v`) carries the same count, so that a page can tell which of
   * the two it heard last is the later. 0 where it is not known.
   */
  v: number;
  /** The last wins, newest first. */
  wins: JackpotWinShown[];
}

/** For the owner: a win with its name, its player's opaque board id (never the account's) and where it stands. */
export interface JackpotWinOwned extends JackpotWinShown {
  id: string;
  pid: string;
  state: 'pending' | 'paid' | 'void';
}

/** A player's win waiting to go into their medals. */
export interface JackpotPrize {
  id: string;
  medals: number;
  at: number;
}

/** The pool as the Realtime Database shows it live (`FLOOR_JACKPOT_PATH`). */
export interface JackpotLive {
  amount: number;
  seq: number;
  /** Every change counts it up: a mirror never goes back to an older one. */
  v: number;
  last: JackpotWinShown | null;
}

const asRecord = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** A win as shown, read from what the server or the database holds; null when it is not one. */
export function winShownFrom(value: unknown): JackpotWinShown | null {
  const raw = asRecord(value);
  if (!isTag(raw.tag) || typeof raw.game !== 'string' || !(FLOOR_GAMES as readonly string[]).includes(raw.game) || !count(raw.medals) || !count(raw.at)) return null;
  return { name: typeof raw.name === 'string' ? raw.name : null, tag: raw.tag, game: raw.game as FloorGame, medals: raw.medals, at: raw.at };
}

/** The pool as the database holds it live, or null when what is there is not one. */
export function jackpotFrom(value: unknown): JackpotLive | null {
  const raw = asRecord(value);
  if (!count(raw.amount) || !count(raw.seq) || !count(raw.v)) return null;
  return { amount: raw.amount, seq: raw.seq, v: raw.v, last: raw.last === undefined ? null : winShownFrom(raw.last) };
}

/** The pool as the route answers it, checked; null when the answer is not one. */
export function jackpotViewFrom(value: unknown): FloorJackpotView | null {
  const raw = asRecord(value);
  if (typeof raw.available !== 'boolean' || !count(raw.amount) || !count(raw.seq) || !count(raw.now)) return null;
  const wins = Array.isArray(raw.wins) ? raw.wins.map(winShownFrom).filter((win): win is JackpotWinShown => win !== null) : [];
  return { now: raw.now, available: raw.available, amount: raw.amount, seq: raw.seq, v: count(raw.v) ? raw.v : 0, wins };
}

/** An empty pool, for when the store cannot be reached. */
export const unavailableJackpot = (now: number): FloorJackpotView => ({ now, available: false, amount: 0, seq: 0, v: 0, wins: [] });
