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
 *   has blocked them, and the counters that limit what they can report.
 *   Read only by this file.
 * - Firestore `medal_floor_periods/{day-YYYY-MM-DD | week-YYYY-MM-DD}/medal_floor_scores/{pid}`:
 *   one line per player per day and per week: medals won, and the biggest win
 *   at each machine. `expireAt` lets a TTL policy delete it two weeks after its
 *   period ends.
 * - Realtime Database `medalFloor/feed/sNN`: the last FEED_SLOTS moments, in a
 *   ring of slots, with only what the floor shows (name or digits, machine,
 *   medals, time). The one public part: browsers listen to it for the live feed.
 * - Realtime Database `medalFloorPrivate`: the ring's counter and which account
 *   each slot's moment is (so a player who leaves takes theirs with them).
 */

import { randomBytes, randomInt } from 'node:crypto';
import { getFirestore, getRealtimeDatabase } from '@/lib/firebase-admin';
import { FLOOR_GAMES, feedWorthy, isFloorGame, type FloorGame } from './games';
import { FLOOR_FEED_PATH, feedFrom } from './feed';
import { isTag, tagFrom } from './names';
import { periodAt, periodBefore, type Period, type PeriodKind } from './periods';
import { FEED_SLOTS, FEED_SPACING_MS, allowanceAt, countable, nextWindow, type Allowance, type ReportWindow } from './report';
import type { FloorBoard, FloorBoards, FloorFeedEntry, FloorMe, FloorReport, FloorReportResult, FloorRow, FloorSummary } from './types';

export { feedFrom };

export const PLAYERS_COLLECTION = 'medal_floor_players';
export const PERIODS_COLLECTION = 'medal_floor_periods';
export const SCORES_COLLECTION = 'medal_floor_scores';
export const FEED_PATH = FLOOR_FEED_PATH;
export const PRIVATE_PATH = 'medalFloorPrivate';

/** How long a period's lines are kept after it ends, for a TTL policy on `expireAt`. */
const KEEP_AFTER_MS = 14 * 86_400_000;

/** How many lines each board shows: on the hub, and on the rankings page. */
export const BOARD_SIZES = { hub: { won: 5, best: 1 }, full: { won: 20, best: 10 } } as const;
export type FloorView = keyof typeof BOARD_SIZES;
/** Lines read past those shown, so that a few hidden ones do not shorten a board. */
const SPARE = 5;

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
  today?: { key: string; won: number };
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

const asNumber = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const asRecord = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

function readPlayer(data: unknown): PlayerDoc | null {
  const raw = asRecord(data);
  if (typeof raw.pid !== 'string' || !isTag(raw.tag)) return null;
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
    today: raw.today as PlayerDoc['today'],
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

const meOf = (player: PlayerDoc | null): FloorMe =>
  player ? { joined: player.joined && !player.blocked, name: player.name, tag: player.tag, blocked: player.blocked } : { joined: false, name: null, tag: null, blocked: false };

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

/** What the floor shows: the moments on show and today's and this week's boards. The owner also sees hidden lines, marked. */
export async function readFloor(view: FloorView, now: number, admin = false): Promise<FloorSummary> {
  // Both stores are reached for first, once: where they are not set up, that fails here, once, and not in every query.
  getFirestore();
  getRealtimeDatabase();
  const [feed, day, week] = await Promise.all([readFeed(), readBoards(periodAt('day', now), view, admin), readBoards(periodAt('week', now), view, admin)]);
  return { now, available: true, feed: view === 'hub' ? feed.slice(0, 12) : feed, day, week };
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
    tx.set(ref, player);
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
    await touchMoments(uid, { name });
  }
  return meOf(player);
}

/**
 * Takes a player off the floor: they are no longer counted or shown, their
 * name is forgotten, and their lines on this and the last day's and week's
 * boards and their moments on show are deleted. What limits their reports is
 * kept, so that leaving and joining again does not start those over.
 */
export async function leaveFloor(uid: string, now: number): Promise<FloorMe> {
  const db = getFirestore();
  const ref = players().doc(uid);
  const player = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const was = snapshot.exists ? readPlayer(snapshot.data()) : null;
    if (!was) return null;
    const player: PlayerDoc = { ...was, name: null, joined: false, updatedAt: now };
    tx.set(ref, player);
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

/**
 * Counts what a player's browser reports from one machine: the medals won, up
 * to what the floor believes (the machine's allowance and the day's most); the
 * biggest win, onto today's and this week's boards for that machine; and a big
 * moment, onto the floor's feed, at most once every FEED_SPACING_MS for one
 * player. Refused for a player who is not on the floor, is blocked, or has
 * reported too often this minute.
 */
export async function reportToFloor(uid: string, report: FloorReport, now: number): Promise<FloorReportResult> {
  const db = getFirestore();
  const ref = players().doc(uid);
  const day = periodAt('day', now);
  const week = periodAt('week', now);
  const key = gameField(report.game);
  const outcome = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const player = snapshot.exists ? readPlayer(snapshot.data()) : null;
    if (player?.blocked) throw new FloorRefusal(403, 'blocked', 'This account has been taken off the medal floor');
    if (!player || !player.joined) throw new FloorRefusal(403, 'not-joined', 'Join the medal floor first');
    const window = nextWindow(player.window, now);
    if (!window) throw new FloorRefusal(429, 'too-often', 'Too many reports this minute');
    const lineRefs = [scores(day.id).doc(player.pid), scores(week.id).doc(player.pid)];
    const lines = await Promise.all(lineRefs.map((line) => tx.get(line)));

    const allowance = allowanceAt(report.game, player.allowances?.[key], now);
    const wonToday = player.today?.key === day.key ? asNumber(player.today.won) : 0;
    const counted = countable(report.won, allowance, wonToday);
    // A player reporting more than the floor believes has their biggest win and moment set aside with the rest.
    const believed = counted === report.won;
    const best = believed && report.best !== undefined ? report.best : 0;
    const moment = believed ? report.moment : undefined;
    const shown = moment !== undefined && feedWorthy(report.game, moment.medals, moment.label) && now - (player.feedAt ?? 0) >= FEED_SPACING_MS;

    tx.set(ref, {
      ...player,
      window,
      feedAt: shown ? now : player.feedAt ?? 0,
      allowances: { ...player.allowances, [key]: { level: allowance - counted, at: now } },
      today: { key: day.key, won: wonToday + counted },
      updatedAt: now,
    } satisfies PlayerDoc);

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
    return { counted, best: best > 0, shown, player };
  });
  if (outcome.shown && report.moment) {
    await showMoment(uid, {
      name: outcome.player.name,
      tag: outcome.player.tag,
      game: report.game,
      label: report.moment.label ?? null,
      medals: report.moment.medals,
      at: now,
    });
  }
  return { counted: outcome.counted, best: outcome.best, shown: outcome.shown };
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

