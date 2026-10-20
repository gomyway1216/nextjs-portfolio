/**
 * The medal floor's server side: who is on the floor, the ranking boards and
 * the moments on show. Only the site's API routes call this, with the Admin
 * SDK; no browser writes any of it, and the security rules say so (the backend
 * repo's firestore.rules and database.rules.json).
 *
 * Where things are kept:
 *
 * - Firestore `medal_floor_players/{uid}`: a player's place on the floor: the
 *   name they chose, their four digits, an opaque id their board lines carry
 *   (`pid`, never the account id), whether they have joined, whether the owner
 *   has blocked them, the counters that limit what they can report, and their
 *   floor jackpots still to be paid. Read only by this file.
 * - Firestore `medal_floor_periods/{day-YYYY-MM-DD | week-YYYY-MM-DD}/medal_floor_scores/{pid}`:
 *   one line per player per day and per week: medals won, and the biggest win
 *   at each machine. `expireAt` lets a TTL policy delete it two weeks after its
 *   period ends.
 * - Realtime Database `medalFloor/feed/sNN`: the last FEED_SLOTS moments, in a
 *   ring of slots, with only what the floor shows (name or digits, machine,
 *   medals, time). Public: browsers listen to it for the live feed.
 * - Realtime Database `medalFloorPrivate`: the ring's counter and which account
 *   each slot's moment is (so a player who leaves takes theirs with them).
 * - Firestore `medal_floor_jackpot/current`: the floor jackpot (jackpot.ts):
 *   its seed, the medals played into it since it was last won, anything put
 *   back into it, its number, and its last wins. Changed only in the
 *   transaction that counts a report, and by the owner's void.
 * - Firestore `medal_floor_jackpot/current/medal_floor_jackpot_wins/{win id}`:
 *   every win, with the account it is for, `pending` until it is in that
 *   player's medals (`paid`) or the owner voids it. A player's wins still to
 *   be paid are listed on their place as well (`jackpot.pending`).
 * - Realtime Database `medalFloor/jackpot`: the pool as everybody is shown it
 *   (its medals, its number, its last win by name or digits, never an
 *   account). Public, so that every page has it live.
 */

import { randomBytes, randomInt } from 'node:crypto';
import { requireAdminCredentials } from '@/lib/adminCredentials';
import { getFirestore, getRealtimeDatabase } from '@/lib/firebase-admin';
import { drawName, drawUniform } from './draw';
import { FLOOR_GAMES, feedWorthy, isFloorGame, type FloorGame } from './games';
import { FLOOR_FEED_PATH, feedFrom } from './feed';
import {
  CLAIM_LEASE_MS,
  FLOOR_JACKPOT_PATH,
  JACKPOT_LABEL,
  JACKPOT_SEED,
  JACKPOT_WINS_SHOWN,
  PENDING_MOST,
  compactDay,
  jackpotFrom,
  linked,
  poolAmount,
  winChance,
  winShownFrom,
  type FloorJackpotView,
  type JackpotPrize,
  type JackpotWinOwned,
  type JackpotWinShown,
} from './jackpot';
import { isTag, tagFrom } from './names';
import { periodAt, periodBefore, type Period, type PeriodKind } from './periods';
import { FEED_SLOTS, FEED_SPACING_MS, allowanceAt, countable, countablePlayed, nextWindow, playAllowanceAt, type Allowance, type ReportWindow } from './report';
import type { FloorBoard, FloorBoards, FloorFeedEntry, FloorMe, FloorReport, FloorReportResult, FloorRow, FloorSummary } from './types';

export { feedFrom };

export const PLAYERS_COLLECTION = 'medal_floor_players';
export const PERIODS_COLLECTION = 'medal_floor_periods';
export const SCORES_COLLECTION = 'medal_floor_scores';
export const FEED_PATH = FLOOR_FEED_PATH;
export const PRIVATE_PATH = 'medalFloorPrivate';
export const JACKPOT_COLLECTION = 'medal_floor_jackpot';
export const JACKPOT_DOC = 'current';
export const WINS_COLLECTION = 'medal_floor_jackpot_wins';
export const JACKPOT_PATH = FLOOR_JACKPOT_PATH;

/** How long a period's lines are kept after it ends, for a TTL policy on `expireAt`. */
const KEEP_AFTER_MS = 14 * 86_400_000;

/** How many lines each board shows: on the hub, and on the rankings page. */
export const BOARD_SIZES = { hub: { won: 5, best: 1 }, full: { won: 20, best: 10 } } as const;
export type FloorView = keyof typeof BOARD_SIZES;
/** Lines read past those shown, so that a few hidden ones do not shorten a board. */
const SPARE = 5;
/** How many of the floor jackpot's wins the owner is shown. */
const OWNED_WINS = 20;

/** A refusal the routes turn into an HTTP status. */
export class FloorRefusal extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'FloorRefusal';
    this.status = status;
    this.code = code;
  }
}

/** A win of the floor jackpot waiting to go into a player's medals, and the device of theirs that last said it was paying it. */
interface PendingWin extends JackpotPrize {
  claim?: { device: string; at: number };
}

interface PlayerDoc {
  pid: string;
  tag: string;
  name: string | null;
  joined: boolean;
  blocked: boolean;
  joinedAt: number;
  updatedAt: number;
  window?: ReportWindow;
  feedAt?: number;
  allowances?: Record<string, Allowance>;
  /** Each machine's allowance of medals played, for the floor jackpot. */
  plays?: Record<string, Allowance>;
  today?: { key: string; won: number; played?: number };
  /** The floor day they last won the floor jackpot on, and their wins still to be paid. */
  jackpot?: { day: string | null; pending: PendingWin[] };
}

interface ScoreDoc {
  uid: string;
  pid: string;
  name: string | null;
  tag: string;
  won: number;
  wonAt: number;
  best: Record<string, number>;
  bestAt: Record<string, number>;
  hide: Record<string, true>;
  blocked: boolean;
}

/** The floor jackpot as it is kept. */
interface PoolDoc {
  /** How many times it has been won: the pool's own number. */
  seq: number;
  seed: number;
  /** Medals played into it since it was last won: its share of them is in it. */
  played: number;
  /** Medals put back into it by a void. */
  extra: number;
  /** Every change counts it up, so that the live mirror never goes back. */
  v: number;
  updatedAt: number;
  /** Its last wins, newest first, as they are shown, with their names. */
  wins: (JackpotWinShown & { id: string })[];
  totals: { played: number; hits: number; paid: number };
}

/** One win of the floor jackpot as it is kept. */
interface WinDoc extends JackpotWinShown {
  id: string;
  uid: string;
  pid: string;
  /** The floor day it was won on. */
  day: string;
  /** What the pool was started again at when this win took it, for a void to put the rest back. */
  reset: number;
  state: 'pending' | 'paid' | 'void';
  paidAt?: number;
  voidedAt?: number;
  /** The moment on the floor's feed that shows it. */
  moment?: number;
}

/** A machine's id as a field name ("slot-machine" → "slot_machine"), so that `best.slot_machine` is a plain path. */
export const gameField = (game: FloorGame): string => game.replace(/-/g, '_');
/** A board's key in a line's `hide`. */
export const boardField = (board: FloorBoard): string => (board === 'won' ? 'won' : `best_${gameField(board.slice(5) as FloorGame)}`);
export const isBoard = (value: unknown): value is FloorBoard => value === 'won' || (typeof value === 'string' && value.startsWith('best:') && isFloorGame(value.slice(5)));

const PID = /^[0-9a-f]{16}$/;
export const isPid = (value: unknown): value is string => typeof value === 'string' && PID.test(value);
const PERIOD_ID = /^(day|week)-\d{4}-\d{2}-\d{2}$/;
export const isPeriodId = (value: unknown): value is string => typeof value === 'string' && PERIOD_ID.test(value);

const slotKey = (id: number): string => `s${String(id % FEED_SLOTS).padStart(2, '0')}`;

const players = () => getFirestore().collection(PLAYERS_COLLECTION);
const scores = (periodId: string) => getFirestore().collection(PERIODS_COLLECTION).doc(periodId).collection(SCORES_COLLECTION);
const poolRef = () => getFirestore().collection(JACKPOT_COLLECTION).doc(JACKPOT_DOC);
const winsOf = () => poolRef().collection(WINS_COLLECTION);

const asNumber = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const asRecord = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * A document as Firestore will take it: without the fields that are not there. Firestore refuses a field whose value
 * is `undefined` (it is not a value), and a place read back from a player who has never reported has some.
 */
export function stored<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => stored(item)) as T;
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) if (field !== undefined) out[key] = stored(field);
  return out as T;
}

function readPending(value: unknown): PendingWin[] {
  if (!Array.isArray(value)) return [];
  const out: PendingWin[] = [];
  for (const raw of value.slice(0, PENDING_MOST)) {
    const win = asRecord(raw);
    if (typeof win.id !== 'string' || !isCount(win.medals) || !isCount(win.at)) continue;
    const pending: PendingWin = { id: win.id, medals: win.medals, at: win.at };
    const claim = asRecord(win.claim);
    if (typeof claim.device === 'string' && isCount(claim.at)) pending.claim = { device: claim.device, at: claim.at };
    out.push(pending);
  }
  return out;
}

function readPlayer(data: unknown): PlayerDoc | null {
  const raw = asRecord(data);
  if (typeof raw.pid !== 'string' || !isTag(raw.tag)) return null;
  const jackpot = asRecord(raw.jackpot);
  return {
    pid: raw.pid,
    tag: raw.tag,
    name: typeof raw.name === 'string' ? raw.name : null,
    joined: raw.joined === true,
    blocked: raw.blocked === true,
    joinedAt: asNumber(raw.joinedAt),
    updatedAt: asNumber(raw.updatedAt),
    window: raw.window as ReportWindow | undefined,
    feedAt: asNumber(raw.feedAt, 0),
    allowances: asRecord(raw.allowances) as Record<string, Allowance>,
    plays: asRecord(raw.plays) as Record<string, Allowance>,
    today: raw.today as PlayerDoc['today'],
    jackpot: raw.jackpot === undefined ? undefined : { day: typeof jackpot.day === 'string' ? jackpot.day : null, pending: readPending(jackpot.pending) },
  };
}

function readScore(data: unknown): ScoreDoc | null {
  const raw = asRecord(data);
  if (typeof raw.uid !== 'string' || typeof raw.pid !== 'string' || !isTag(raw.tag)) return null;
  return {
    uid: raw.uid,
    pid: raw.pid,
    name: typeof raw.name === 'string' ? raw.name : null,
    tag: raw.tag,
    won: asNumber(raw.won),
    wonAt: asNumber(raw.wonAt),
    best: asRecord(raw.best) as Record<string, number>,
    bestAt: asRecord(raw.bestAt) as Record<string, number>,
    hide: asRecord(raw.hide) as Record<string, true>,
    blocked: raw.blocked === true,
  };
}

/** The pool as it is kept, or a new one at the seed when there is none yet. */
function readPool(data: unknown, now: number): PoolDoc {
  const raw = asRecord(data);
  const totals = asRecord(raw.totals);
  const kept = Array.isArray(raw.wins) ? raw.wins : [];
  return {
    seq: isCount(raw.seq) ? raw.seq : 0,
    seed: isCount(raw.seed) ? raw.seed : JACKPOT_SEED,
    played: isCount(raw.played) ? raw.played : 0,
    extra: isCount(raw.extra) ? raw.extra : 0,
    v: isCount(raw.v) ? raw.v : 0,
    updatedAt: isCount(raw.updatedAt) ? raw.updatedAt : now,
    wins: kept.flatMap((win: unknown) => {
      const shown = winShownFrom(win);
      const id = asRecord(win).id;
      return shown && typeof id === 'string' ? [{ ...shown, id }] : [];
    }),
    totals: { played: isCount(totals.played) ? totals.played : 0, hits: isCount(totals.hits) ? totals.hits : 0, paid: isCount(totals.paid) ? totals.paid : 0 },
  };
}

function readWin(data: unknown): WinDoc | null {
  const raw = asRecord(data);
  const shown = winShownFrom(raw);
  if (!shown || typeof raw.id !== 'string' || typeof raw.uid !== 'string' || typeof raw.pid !== 'string' || typeof raw.day !== 'string') return null;
  const state = raw.state === 'paid' || raw.state === 'void' ? raw.state : 'pending';
  const win: WinDoc = { ...shown, id: raw.id, uid: raw.uid, pid: raw.pid, day: raw.day, reset: isCount(raw.reset) ? raw.reset : JACKPOT_SEED, state };
  if (isCount(raw.paidAt)) win.paidAt = raw.paidAt;
  if (isCount(raw.voidedAt)) win.voidedAt = raw.voidedAt;
  if (isCount(raw.moment)) win.moment = raw.moment;
  return win;
}

/** A win as everybody is shown it: the name or the digits, the machine, the medals, the time. */
const shownWin = (win: JackpotWinShown): JackpotWinShown => ({ name: win.name, tag: win.tag, game: win.game, medals: win.medals, at: win.at });
const poolView = (pool: PoolDoc, now: number): FloorJackpotView => ({ now, available: true, amount: poolAmount(pool), seq: pool.seq, v: pool.v, wins: pool.wins.map(shownWin) });

function meOf(player: PlayerDoc | null): FloorMe {
  if (!player) return { joined: false, name: null, tag: null, blocked: false };
  const me: FloorMe = { joined: player.joined && !player.blocked, name: player.name, tag: player.tag, blocked: player.blocked };
  const due = player.jackpot?.pending.length ?? 0;
  if (due > 0) me.due = due;
  return me;
}

// ── The feed ─────────────────────────────────────────────────────────────────

async function readFeed(): Promise<FloorFeedEntry[]> {
  const snapshot = await getRealtimeDatabase().ref(FEED_PATH).get();
  return feedFrom(snapshot.val());
}

async function showMoment(uid: string, entry: Omit<FloorFeedEntry, 'id'>): Promise<number | null> {
  const rtdb = getRealtimeDatabase();
  const counted = await rtdb.ref(`${PRIVATE_PATH}/seq`).transaction((value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) ? value : 0) + 1);
  const id = counted.snapshot.val();
  if (!counted.committed || typeof id !== 'number') return null;
  const slot = slotKey(id);
  const shown: Record<string, unknown> = { id, tag: entry.tag, game: entry.game, medals: entry.medals, at: entry.at };
  if (entry.name !== null) shown.name = entry.name;
  if (entry.label !== null) shown.label = entry.label;
  await rtdb.ref().update({ [`${FEED_PATH}/${slot}`]: shown, [`${PRIVATE_PATH}/owners/${slot}`]: { id, uid } });
  return id;
}

/** The slots holding one account's moments (by the private owners list, checked against what each slot shows now). */
async function slotsOf(uid: string): Promise<string[]> {
  const rtdb = getRealtimeDatabase();
  const [owners, feed] = await Promise.all([rtdb.ref(`${PRIVATE_PATH}/owners`).get(), rtdb.ref(FEED_PATH).get()]);
  const shown = asRecord(feed.val());
  return Object.entries(asRecord(owners.val()))
    .filter(([slot, owner]) => asRecord(owner).uid === uid && asRecord(shown[slot]).id === asRecord(owner).id)
    .map(([slot]) => slot);
}

/** Takes an account's moments off the floor, or puts its new name on them. */
async function touchMoments(uid: string, change: { remove: true } | { name: string | null }): Promise<void> {
  const slots = await slotsOf(uid);
  if (slots.length === 0) return;
  const update: Record<string, unknown> = {};
  for (const slot of slots) {
    if ('remove' in change) {
      update[`${FEED_PATH}/${slot}`] = null;
      update[`${PRIVATE_PATH}/owners/${slot}`] = null;
    } else update[`${FEED_PATH}/${slot}/name`] = change.name;
  }
  await getRealtimeDatabase().ref().update(update);
}

// ── The boards ───────────────────────────────────────────────────────────────

/**
 * Ranks a board's lines by score, the earlier first between equal scores, which
 * share a rank ("1, 2, 2, 4"). Hidden lines are left out; the owner sees them,
 * marked and without a rank, and they take no place from anybody.
 */
export function ranked(lines: { score: number; at: number; doc: Pick<ScoreDoc, 'name' | 'tag' | 'pid'> & { blocked?: boolean }; hidden: boolean }[], size: number, admin: boolean): FloorRow[] {
  const sorted = lines.filter((line) => line.score > 0 && (admin || !line.hidden)).sort((a, b) => b.score - a.score || a.at - b.at);
  const rows: FloorRow[] = [];
  let shown = 0;
  let rank = 0;
  let last: number | null = null;
  for (const line of sorted) {
    if (!line.hidden && shown >= size) break;
    if (line.hidden && shown >= size) continue;
    if (!line.hidden) {
      shown += 1;
      if (line.score !== last) {
        rank = shown;
        last = line.score;
      }
    }
    const row: FloorRow = { rank: line.hidden ? 0 : rank, name: line.doc.name, tag: line.doc.tag, score: line.score, at: line.at };
    if (admin) {
      row.pid = line.doc.pid;
      row.hidden = line.hidden;
      row.blocked = line.doc.blocked === true;
    }
    rows.push(row);
  }
  return rows;
}

async function readBoards(period: Period, view: FloorView, admin: boolean): Promise<FloorBoards> {
  const size = BOARD_SIZES[view];
  const lines = async (board: FloorBoard, field: string, at: (doc: ScoreDoc) => number, score: (doc: ScoreDoc) => number, count: number) => {
    const snapshot = await scores(period.id).orderBy(field, 'desc').limit(count + SPARE).get();
    const docs = snapshot.docs.map((doc) => readScore(doc.data())).filter((doc): doc is ScoreDoc => doc !== null);
    return ranked(
      docs.map((doc) => ({ doc, score: score(doc), at: at(doc), hidden: doc.blocked || doc.hide[boardField(board)] === true })),
      count,
      admin,
    );
  };
  const [won, ...bests] = await Promise.all([
    lines('won', 'won', (doc) => doc.wonAt, (doc) => doc.won, size.won),
    ...FLOOR_GAMES.map((game) =>
      lines(`best:${game}`, `best.${gameField(game)}`, (doc) => asNumber(doc.bestAt[gameField(game)]), (doc) => asNumber(doc.best[gameField(game)]), size.best),
    ),
  ]);
  const best: FloorBoards['best'] = {};
  FLOOR_GAMES.forEach((game, index) => {
    if (bests[index].length > 0) best[game] = bests[index];
  });
  return { kind: period.kind, key: period.key, start: period.start, end: period.end, won, best };
}

const emptyBoards = (period: Period): FloorBoards => ({ kind: period.kind, key: period.key, start: period.start, end: period.end, won: [], best: {} });

/** An empty floor, for when the store cannot be reached. */
export const emptySummary = (now: number): FloorSummary => ({ now, available: false, feed: [], day: emptyBoards(periodAt('day', now)), week: emptyBoards(periodAt('week', now)) });

/** A read of the floor that takes longer than this is given up: the page is told the floor cannot be reached, not left waiting. */
export const READ_TIMEOUT_MS = 6_000;

function within<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[medal-floor] ${what} took longer than ${ms} ms`)), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** The floor jackpot as the owner sees it: the pool, and its last wins with each one's name, player and state. */
async function readOwnedJackpot(now: number): Promise<NonNullable<FloorSummary['jackpot']>> {
  const [pool, found] = await Promise.all([poolRef().get(), winsOf().orderBy('at', 'desc').limit(OWNED_WINS).get()]);
  const owned: JackpotWinOwned[] = found.docs.flatMap((doc) => {
    const win = readWin(doc.data());
    return win ? [{ ...shownWin(win), id: win.id, pid: win.pid, state: win.state }] : [];
  });
  return { ...poolView(readPool(pool.exists ? pool.data() : undefined, now), now), owned };
}

/** What the floor shows: the moments on show and today's and this week's boards. The owner also sees hidden lines, marked, and the floor jackpot's wins. */
export async function readFloor(view: FloorView, now: number, admin = false): Promise<FloorSummary> {
  // Firestore first, and once: where it is not set up, that fails here, once, and not in every query; where the server
  // has no credentials at all, that is known at once (adminCredentials.ts), not after the read's own retries. The
  // boards before the moments: where the store cannot be reached at all, the read fails on them, and the Realtime
  // Database, whose client keeps dialling once it has been asked, is never asked.
  getFirestore();
  await requireAdminCredentials();
  const [day, week] = await within(Promise.all([readBoards(periodAt('day', now), view, admin), readBoards(periodAt('week', now), view, admin)]), READ_TIMEOUT_MS, 'reading the boards');
  const feed = await within(readFeed(), READ_TIMEOUT_MS, 'reading the moments on show');
  const summary: FloorSummary = { now, available: true, feed: view === 'hub' ? feed.slice(0, 12) : feed, day, week };
  if (admin) summary.jackpot = await within(readOwnedJackpot(now), READ_TIMEOUT_MS, 'reading the floor jackpot');
  return summary;
}

// ── A player's own place ─────────────────────────────────────────────────────

export async function readMe(uid: string): Promise<FloorMe> {
  const snapshot = await players().doc(uid).get();
  return meOf(snapshot.exists ? readPlayer(snapshot.data()) : null);
}

/** The periods whose lines a player's name is on, or that are taken away when they leave. */
const periodsAround = (now: number): Period[] => (['day', 'week'] as PeriodKind[]).flatMap((kind) => [periodAt(kind, now), periodBefore(kind, now)]);

/**
 * Puts a signed-in player on the floor under `name` (null: their four digits),
 * or changes their name. Their name is changed on their lines and moments too.
 */
export async function joinFloor(uid: string, name: string | null, now: number): Promise<FloorMe> {
  const db = getFirestore();
  const ref = players().doc(uid);
  const { player, renamed } = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const was = snapshot.exists ? readPlayer(snapshot.data()) : null;
    if (was?.blocked) throw new FloorRefusal(403, 'blocked', 'This account has been taken off the medal floor');
    const player: PlayerDoc = was
      ? { ...was, name, joined: true, updatedAt: now, joinedAt: was.joined ? was.joinedAt : now }
      : { pid: randomBytes(8).toString('hex'), tag: tagFrom(randomInt(0, 10_000) / 10_000), name, joined: true, blocked: false, joinedAt: now, updatedAt: now };
    tx.set(ref, stored(player));
    return { player, renamed: was !== null && was.name !== name };
  });
  if (renamed) {
    const current = (['day', 'week'] as PeriodKind[]).map((kind) => scores(periodAt(kind, now).id).doc(player.pid));
    await db.runTransaction(async (tx) => {
      const lines = await Promise.all(current.map((line) => tx.get(line)));
      lines.forEach((line, index) => {
        if (line.exists) tx.update(current[index], { name });
      });
    });
    try {
      await touchMoments(uid, { name });
    } catch (error) {
      // The new name is the player's now; the moments on show keep the old one until they scroll off.
      console.error('[medal-floor] the moments on show could not be renamed:', error);
    }
  }
  return meOf(player);
}

/**
 * Takes a player off the floor: they are no longer counted or shown, their
 * name is forgotten, and their lines on this and the last day's and week's
 * boards and their moments on show are deleted. What limits their reports is
 * kept, so that leaving and joining again does not start those over; so are
 * floor jackpots they have won and not yet been paid, which are theirs.
 */
export async function leaveFloor(uid: string, now: number): Promise<FloorMe> {
  const db = getFirestore();
  const ref = players().doc(uid);
  const player = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const was = snapshot.exists ? readPlayer(snapshot.data()) : null;
    if (!was) return null;
    const player: PlayerDoc = { ...was, name: null, joined: false, updatedAt: now };
    tx.set(ref, stored(player));
    return player;
  });
  if (player) {
    const batch = db.batch();
    for (const period of periodsAround(now)) batch.delete(scores(period.id).doc(player.pid));
    await batch.commit();
    await touchMoments(uid, { remove: true });
  }
  return meOf(player);
}

// ── Reports ──────────────────────────────────────────────────────────────────

/** The pool as everybody is shown it live, written over only by a later one. */
async function mirrorPool(pool: PoolDoc): Promise<void> {
  const shown: Record<string, unknown> = { amount: poolAmount(pool), seq: pool.seq, v: pool.v, at: pool.updatedAt };
  const last = pool.wins[0];
  if (last) {
    const win: Record<string, unknown> = { tag: last.tag, game: last.game, medals: last.medals, at: last.at };
    if (last.name !== null) win.name = last.name;
    shown.last = win;
  }
  await getRealtimeDatabase()
    .ref(JACKPOT_PATH)
    .transaction((current: unknown) => ((jackpotFrom(current)?.v ?? -1) >= pool.v ? undefined : shown));
}

/** Mirrors the pool, and never fails what has been counted already for it: the page asks the route instead. */
async function mirrorQuietly(pool: PoolDoc): Promise<void> {
  try {
    await mirrorPool(pool);
  } catch (error) {
    console.error('[medal-floor] the floor jackpot could not be shown live:', error);
  }
}

/**
 * Counts what a player's browser reports from one machine: the medals won, up
 * to what the floor believes (the machine's allowance and the day's most); the
 * biggest win, onto today's and this week's boards for that machine; a big
 * moment, onto the floor's feed, at most once every FEED_SPACING_MS for one
 * player; and the medals played, up to what the floor believes of them, into
 * the floor jackpot, with its draw. Refused for a player who is not on the
 * floor, is blocked, or has reported too often this minute.
 *
 * The draw: each medal played that is believed is a ticket (jackpot.ts), so
 * the report wins with 1 − (1 − q)^played. Only the machines linked to the
 * floor jackpot (jackpot.ts `linked`) feed it and draw: medals played at any
 * other are not counted for it. The number it is drawn with comes
 * from `node:crypto`, once for the report, before its transaction: Firestore
 * may run a transaction more than once, and running it again never draws
 * again. A win takes the whole pool, the share of this report's medals in it,
 * and starts it again at the seed, in the same transaction. Two reports that
 * win at once are put one after the other by the transaction: the first takes
 * the pool, and the second, run again on the pool started over, only feeds
 * it, since the pool it drew against has been won.
 */
export async function reportToFloor(uid: string, report: FloorReport, now: number): Promise<FloorReportResult> {
  const db = getFirestore();
  const ref = players().doc(uid);
  const day = periodAt('day', now);
  const week = periodAt('week', now);
  const key = gameField(report.game);
  // Medals played at a machine that is not linked to the floor jackpot take no part in it.
  const offered = report.played ?? 0;
  const asked = linked(report.game) ? offered : 0;
  const draw = asked > 0 ? drawUniform() : 1;
  const winId = asked > 0 ? `${compactDay(day.key)}-${drawName()}` : '';
  /** The pool's number the draw was made against: a pool somebody else has won since is not this draw's to win. */
  let drawnAgainst: number | null = null;
  const outcome = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const player = snapshot.exists ? readPlayer(snapshot.data()) : null;
    if (player?.blocked) throw new FloorRefusal(403, 'blocked', 'This account has been taken off the medal floor');
    if (!player || !player.joined) throw new FloorRefusal(403, 'not-joined', 'Join the medal floor first');
    const window = nextWindow(player.window, now);
    if (!window) throw new FloorRefusal(429, 'too-often', 'Too many reports this minute');
    const lineRefs = [scores(day.id).doc(player.pid), scores(week.id).doc(player.pid)];
    const lines = await Promise.all(lineRefs.map((line) => tx.get(line)));
    // Only a report of medals played reads the pool: the rest leave every other player's reports alone.
    const poolSnapshot = asked > 0 ? await tx.get(poolRef()) : null;

    const allowance = allowanceAt(report.game, player.allowances?.[key], now);
    const wonToday = player.today?.key === day.key ? asNumber(player.today.won) : 0;
    const counted = countable(report.won, allowance, wonToday);
    // A player reporting more than the floor believes has their biggest win and moment set aside with the rest.
    const believed = counted === report.won;
    const best = believed && report.best !== undefined ? report.best : 0;
    const moment = believed ? report.moment : undefined;
    const shown = moment !== undefined && feedWorthy(report.game, moment.medals, moment.label) && now - (player.feedAt ?? 0) >= FEED_SPACING_MS;

    // The medals played, as far as the floor believes them: the machine's allowance, and the day's most.
    const playAllowance = playAllowanceAt(report.game, player.plays?.[key], now);
    const playedToday = player.today?.key === day.key ? asNumber(player.today.played) : 0;
    const played = asked > 0 ? countablePlayed(asked, playAllowance, playedToday) : 0;
    let pool: PoolDoc | null = null;
    let win: WinDoc | null = null;
    let jackpot = player.jackpot;
    if (poolSnapshot && played > 0) {
      const was = readPool(poolSnapshot.exists ? poolSnapshot.data() : undefined, now);
      drawnAgainst ??= was.seq;
      const fed: PoolDoc = { ...was, played: was.played + played, v: was.v + 1, updatedAt: now, totals: { ...was.totals, played: was.totals.played + played } };
      // One jackpot a floor day for a player, and none while a month of theirs still waits to be paid.
      const mayWin = jackpot?.day !== day.key && (jackpot?.pending.length ?? 0) < PENDING_MOST;
      if (mayWin && was.seq === drawnAgainst && draw < winChance(played)) {
        const medals = poolAmount(fed);
        win = { id: winId, uid, pid: player.pid, name: player.name, tag: player.tag, game: report.game, medals, at: now, day: day.key, reset: JACKPOT_SEED, state: 'pending' };
        pool = {
          seq: was.seq + 1,
          seed: JACKPOT_SEED,
          played: 0,
          extra: 0,
          v: fed.v,
          updatedAt: now,
          wins: [{ id: win.id, ...shownWin(win) }, ...was.wins].slice(0, JACKPOT_WINS_SHOWN),
          totals: { ...fed.totals, hits: fed.totals.hits + 1, paid: fed.totals.paid + medals },
        };
        jackpot = { day: day.key, pending: [...(jackpot?.pending ?? []), { id: win.id, medals, at: now }] };
        tx.set(winsOf().doc(win.id), stored(win));
      } else pool = fed;
      tx.set(poolRef(), stored({ ...pool, amount: poolAmount(pool) }));
    }

    tx.set(
      ref,
      stored({
        ...player,
        window,
        feedAt: shown ? now : (player.feedAt ?? 0),
        allowances: { ...player.allowances, [key]: { level: allowance - counted, at: now } },
        plays: asked > 0 ? { ...player.plays, [key]: { level: playAllowance - played, at: now } } : player.plays,
        today: { key: day.key, won: wonToday + counted, played: playedToday + played },
        jackpot,
        updatedAt: now,
      } satisfies PlayerDoc),
    );

    if (counted > 0 || best > 0) {
      [day, week].forEach((period, index) => {
        const was = lines[index].exists ? readScore(lines[index].data()) : null;
        const line: ScoreDoc = was ?? { uid, pid: player.pid, name: player.name, tag: player.tag, won: 0, wonAt: now, best: {}, bestAt: {}, hide: {}, blocked: false };
        // `expireAt` is for a TTL policy: the line is deleted two weeks after its period ends.
        const next: ScoreDoc & { expireAt: Date } = { ...line, name: player.name, tag: player.tag, expireAt: new Date(period.end + KEEP_AFTER_MS) };
        if (counted > 0) {
          next.won = line.won + counted;
          next.wonAt = now;
        }
        if (best > asNumber(line.best[key])) {
          next.best = { ...line.best, [key]: best };
          next.bestAt = { ...line.bestAt, [key]: now };
        }
        tx.set(lineRefs[index], next);
      });
    }
    return { counted, best: best > 0, shown, player, played, pool, win };
  });

  // The report is counted already. Nothing after this may fail it: a browser told it failed sends the same medals
  // again, and they would be counted twice.
  if (outcome.pool) await mirrorQuietly(outcome.pool);
  if (outcome.win) {
    const won = outcome.win;
    try {
      // The whole floor is shown a floor jackpot, whenever the player's last moment was.
      const id = await showMoment(uid, { name: won.name, tag: won.tag, game: won.game, label: JACKPOT_LABEL, medals: won.medals, at: now });
      if (id !== null) await winsOf().doc(won.id).update({ moment: id });
    } catch (error) {
      console.error('[medal-floor] a floor jackpot could not be put on show:', error);
    }
  }
  let shown = outcome.shown;
  if (shown && report.moment) {
    try {
      shown = (await showMoment(uid, { name: outcome.player.name, tag: outcome.player.tag, game: report.game, label: report.moment.label ?? null, medals: report.moment.medals, at: now })) !== null;
    } catch (error) {
      console.error('[medal-floor] a moment could not be put on show:', error);
      shown = false;
    }
  }
  const result: FloorReportResult = { counted: outcome.counted, best: outcome.best, shown };
  if (offered > 0) result.played = outcome.played;
  if (outcome.win) result.jackpot = { id: outcome.win.id, medals: outcome.win.medals, at: outcome.win.at };
  return result;
}

// ── The floor jackpot ────────────────────────────────────────────────────────

/** The floor jackpot as everybody is shown it. */
export async function readJackpot(now: number): Promise<FloorJackpotView> {
  getFirestore();
  await requireAdminCredentials();
  const snapshot = await within(poolRef().get(), READ_TIMEOUT_MS, 'reading the floor jackpot');
  return poolView(readPool(snapshot.exists ? snapshot.data() : undefined, now), now);
}

/**
 * Hands a player's device the floor jackpots of theirs still to be paid, for
 * it to put into their medals: each under its receipt, and then said to be
 * paid (`ackWin`). A win another device of theirs has said it is paying within
 * CLAIM_LEASE_MS is not handed over, so two devices open at once never both
 * pay it; the same device is handed it again (a page reloaded halfway). A
 * player the owner has taken off the floor is handed nothing until the owner
 * says what becomes of their wins.
 */
export async function claimWins(uid: string, device: string, now: number): Promise<JackpotPrize[]> {
  const db = getFirestore();
  const ref = players().doc(uid);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const player = snapshot.exists ? readPlayer(snapshot.data()) : null;
    if (!player || !player.jackpot || player.jackpot.pending.length === 0) return [];
    if (player.blocked) throw new FloorRefusal(403, 'blocked', 'This account has been taken off the medal floor');
    const handed: JackpotPrize[] = [];
    const pending = player.jackpot.pending.map((win) => {
      if (win.claim && win.claim.device !== device && now - win.claim.at < CLAIM_LEASE_MS) return win;
      handed.push({ id: win.id, medals: win.medals, at: win.at });
      return { ...win, claim: { device, at: now } };
    });
    if (handed.length > 0) tx.set(ref, stored({ ...player, jackpot: { ...player.jackpot, pending }, updatedAt: now }));
    return handed;
  });
}

/**
 * A player's device says one of their floor jackpots is in their medals. Said
 * again, or for a win the owner has voided since, it is done all the same: the
 * device stops asking. A win that is not theirs is refused.
 */
export async function ackWin(uid: string, id: string, now: number): Promise<void> {
  const db = getFirestore();
  const ref = players().doc(uid);
  const winRef = winsOf().doc(id);
  await db.runTransaction(async (tx) => {
    const [snapshot, found] = await Promise.all([tx.get(ref), tx.get(winRef)]);
    const win = found.exists ? readWin(found.data()) : null;
    if (!win || win.uid !== uid) throw new FloorRefusal(404, 'no-win', 'No such win');
    const player = snapshot.exists ? readPlayer(snapshot.data()) : null;
    if (player?.jackpot?.pending.some((pending) => pending.id === id)) {
      tx.set(ref, stored({ ...player, jackpot: { ...player.jackpot, pending: player.jackpot.pending.filter((pending) => pending.id !== id) }, updatedAt: now }));
    }
    if (win.state === 'pending') tx.update(winRef, { state: 'paid', paidAt: now });
  });
}

/**
 * The owner voids a floor jackpot that is plainly not real: it is not paid if
 * it has not been, it comes off the pool's last wins and the floor's feed, and
 * the pool is given back what it took over the seed it was started again at.
 * Medals already paid into a player's browser cannot be taken back from it.
 */
export async function voidWin(id: string, now: number): Promise<void> {
  const db = getFirestore();
  const winRef = winsOf().doc(id);
  const result = await db.runTransaction(async (tx) => {
    const found = await tx.get(winRef);
    const win = found.exists ? readWin(found.data()) : null;
    if (!win) throw new FloorRefusal(404, 'no-win', 'No such win');
    if (win.state === 'void') return null;
    const playerRef = players().doc(win.uid);
    const [snapshot, poolSnapshot] = await Promise.all([tx.get(playerRef), tx.get(poolRef())]);
    const player = snapshot.exists ? readPlayer(snapshot.data()) : null;
    const was = readPool(poolSnapshot.exists ? poolSnapshot.data() : undefined, now);
    const pool: PoolDoc = { ...was, extra: was.extra + Math.max(0, win.medals - win.reset), v: was.v + 1, updatedAt: now, wins: was.wins.filter((shown) => shown.id !== id) };
    tx.update(winRef, { state: 'void', voidedAt: now });
    tx.set(poolRef(), stored({ ...pool, amount: poolAmount(pool) }));
    if (player?.jackpot?.pending.some((pending) => pending.id === id)) {
      tx.set(playerRef, stored({ ...player, jackpot: { ...player.jackpot, pending: player.jackpot.pending.filter((pending) => pending.id !== id) }, updatedAt: now }));
    }
    return { pool, moment: win.moment };
  });
  if (!result) return;
  await mirrorQuietly(result.pool);
  if (result.moment !== undefined) {
    try {
      await hideMoment(result.moment);
    } catch (error) {
      // Already scrolled off the floor, or taken off by hand.
      if (!(error instanceof FloorRefusal)) console.error('[medal-floor] a voided floor jackpot could not be taken off the floor:', error);
    }
  }
}

// ── The owner ────────────────────────────────────────────────────────────────

/** Hides one line of one board (or shows it again). */
export async function hideLine(periodId: string, board: FloorBoard, pid: string, hidden: boolean): Promise<void> {
  const db = getFirestore();
  const ref = scores(periodId).doc(pid);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const line = snapshot.exists ? readScore(snapshot.data()) : null;
    if (!line) throw new FloorRefusal(404, 'no-line', 'No such line');
    const hide = { ...line.hide };
    if (hidden) hide[boardField(board)] = true;
    else delete hide[boardField(board)];
    tx.update(ref, { hide });
  });
}

/** Takes one moment off the floor. */
export async function hideMoment(id: number): Promise<void> {
  const rtdb = getRealtimeDatabase();
  const slot = slotKey(id);
  const shown = await rtdb.ref(`${FEED_PATH}/${slot}`).get();
  if (asRecord(shown.val()).id !== id) throw new FloorRefusal(404, 'no-moment', 'That moment is no longer on show');
  await rtdb.ref().update({ [`${FEED_PATH}/${slot}`]: null, [`${PRIVATE_PATH}/owners/${slot}`]: null });
}

/**
 * Blocks a player (by their board id): nothing more they report is counted,
 * their lines on this and the last day's and week's boards are hidden and their
 * moments are taken off. Unblocking shows their lines again.
 */
export async function blockPlayer(pid: string, blocked: boolean, now: number): Promise<void> {
  const db = getFirestore();
  const found = await players().where('pid', '==', pid).limit(1).get();
  const doc = found.docs[0];
  if (!doc) throw new FloorRefusal(404, 'no-player', 'No such player');
  const uid = doc.id;
  const lineRefs = periodsAround(now).map((period) => scores(period.id).doc(pid));
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(doc.ref);
    const lines = await Promise.all(lineRefs.map((line) => tx.get(line)));
    const player = snapshot.exists ? readPlayer(snapshot.data()) : null;
    if (!player) throw new FloorRefusal(404, 'no-player', 'No such player');
    tx.update(doc.ref, { blocked, updatedAt: now });
    lines.forEach((line, index) => {
      if (line.exists) tx.update(lineRefs[index], { blocked });
    });
  });
  if (blocked) await touchMoments(uid, { remove: true });
}

/** Whether an error means the floor's store is not set up here (a build, or a machine without credentials), not that it failed. */
export function storeUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Firebase projectId is required') ||
    message.includes('Initialization attempted during build phase') ||
    message.includes('Could not load the default credentials') ||
    message.includes('Failed to determine project ID')
  );
}
