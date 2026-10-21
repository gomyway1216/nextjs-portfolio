/**
 * The history of a player's medals: what happened to them, machine by
 * machine, kept beside the medals and never touching them. The medals are the
 * ledger's (ledger.ts); this is only a record of what was done with them, and
 * nothing anywhere reads it to decide a medal.
 *
 * The bank tells it what it does as it does it (bank.ts): a round's medals
 * moved under their receipt, the daily bonus, a refill, a reset, a floor
 * jackpot paid into the medals (MedalCenter/floor/jackpotPayer.ts). Two machines
 * say more than their medals do, and report it themselves: the Medal Pusher,
 * whose medals go in and come out a few at a time, says how many it fed and
 * how many came back, and what its prizes paid; and the craps table, whose
 * moves are chips going onto the table and back, says what each roll decided.
 *
 * This file is only arithmetic on a small document. It never touches the
 * browser and never reads the clock: the time and the day of each thing are
 * handed in with it.
 *
 * One player's history can exist in several copies, a phone's and a laptop's
 * and the account's. `mergeHistories` joins two copies so that nothing is
 * counted twice, whatever order they meet in and however often:
 *
 * - **Entries** are what the page lists. Each is named by the device it
 *   happened on, the game and the round (the round's own name, the one its
 *   receipts carry: `receiptOf` in ledger.ts), so the same round from two
 *   copies is one entry. A round's entry only grows as its medals move (what
 *   went in, what came back, whether it is over), so of two copies of it each
 *   figure is the larger. Only the latest `HISTORY_LIMITS.entries` are kept.
 * - **Records** (`games`) are counted as things happen, not worked out from
 *   the entries, so an entry that has been let go of takes nothing from them.
 *   Each device counts into a row of its own for each game, with a count of
 *   the times it changed it that only grows: of two copies of a row, the one
 *   with the higher count is the later, as with the ledger's receipts.
 * - **Days** keep what each device did on each day: medals bet and won, given
 *   free, and rounds played. Those only grow within a day, so each is the
 *   larger of two copies. They outlive the entries: the page shows them for
 *   the days the entries no longer reach.
 * - **The medals at the end of each day** (`close`), as last seen that day by
 *   any device: of two, the later.
 *
 * A device's own rows are never the ones a copy lets go of to stay within its
 * bounds: another device's give way first, and every device keeps its own,
 * so nothing a device counted is lost to it.
 *
 * What comes back out of storage is not trusted. Unlike the ledger, where one
 * bad row would change the medals, a part of the history that will not do is
 * left out and the rest kept: nothing in it moves a medal.
 */

import { sizeOf } from '../MedalPusher/account';
import { PACK_FORMAT, pack } from '../MedalPusher/pack';
import { dayNumber, type Day } from '../MedalPusher/records';
import { isDevice } from './ledger';

export const HISTORY_VERSION = 1;

export const HISTORY_LIMITS = {
  /** Entries kept: the latest few hundred things that happened, on every device together. */
  entries: 300,
  /** Days whose totals, and whose medals at the end of the day, are kept: the latest three months that saw play. */
  days: 90,
  /** Devices a day keeps the totals of. Beyond that, the ones that did least that day are left out. */
  dayDevices: 3,
  /**
   * Games a history keeps records for: every machine on the floor and the floor jackpot, and room for a few more.
   * Nineteen with Video Keno; a twentieth machine was coming onto the floor beside it (a smart ball for the kids'
   * corner), which would have filled the 20 there were, and a history that kept no more would have let go of the
   * records of the machine played least long ago. 24 left room for four more after those; Goldfish Lantern Pachinko
   * is the first of them (twenty machines and the jackpot: 21), Cherry Blossom Carousel the second (22), Onsen
   * Shooting Gallery the third (23), and one is left.
   */
  games: 24,
  /** Devices a game keeps the records of. Beyond that, the ones that played it least are left out. */
  gameDevices: 4,
  /** Any count of medals. Nobody plays near it. */
  medals: 1_000_000_000_000,
  /** The longest text that is read at all. */
  length: 400_000,
} as const;

/** How long the Medal Pusher can stand unplayed and its play still be one visit, in milliseconds. */
export const VISIT_GAP = 10 * 60_000;

/** What the medal center's own counter does goes under this name: the daily bonus, a refill, a reset. */
export const CENTER = 'medal-center';
/** The Medal Pusher, which plays no rounds: medals go in and come out as the field moves. */
export const PUSHER_GAME = 'medal-pusher';
/**
 * The medal floor's jackpot, won on the server and paid into the medals by
 * the page (the same name its receipts carry: `JACKPOT_GAME` in
 * lib/medalFloor/jackpot.ts). Its wins are entries of their own, and it keeps
 * a row of records like a machine's: how many, how many medals, the biggest.
 * It is no machine: the totals of the machines leave it out.
 */
export const FLOOR_JACKPOT = 'floor-jackpot';

/**
 * The games whose machine reports each round whole (`round`), because their
 * moves of medals are not rounds: the craps table's and the Sic Bo table's
 * moves are medals going onto the layout and coming off it, a few to a roll,
 * and a roll that loses every bet moves none.
 */
export const REPORTS_ROUNDS: ReadonlySet<string> = new Set(['craps', 'sic-bo']);

/** What an entry is. */
export type EntryKind =
  /** A round of a game: a spin, a hand, a coup, a roll. */
  | 'round'
  /** A visit to the Medal Pusher: medals fed and medals won, until it stands unplayed for a while. */
  | 'play'
  /** A jackpot on the Medal Pusher. Its medals are the visit's: this only says it happened. */
  | 'jackpot'
  | 'bonus'
  | 'refill'
  /** The medals reset at the medal center. */
  | 'reset'
  /** The medal floor's jackpot, paid into the medals: its game is `FLOOR_JACKPOT`, and its name the win's. */
  | 'floor';
const KINDS: readonly EntryKind[] = ['round', 'play', 'jackpot', 'bonus', 'refill', 'reset', 'floor'];

export interface Entry {
  /** The device it happened on. */
  d: string;
  /** The game, or `CENTER`. */
  g: string;
  /** Its name among the device's and the game's: a round's own name, or one made from the moment it began. */
  r: string;
  k: EntryKind;
  /** When it last changed, by the clock of the device it happened on. */
  t: number;
  /** Medals that went in: bet, or fed, or (for a reset) thrown away. */
  bet: number;
  /** Medals that came back: won, paid, or given. */
  won: number;
  /** The medals the player had straight after, as that device saw them; −1 when not known. */
  left: number;
  /** Whether it is over: a round that has been paid, or that another round has come after. 1 or 0. */
  done: number;
}

/** One device's records at one game. */
export interface GameRow {
  g: string;
  d: string;
  /** How many times the device has changed this row: of two copies, the one with the higher count is the later. */
  n: number;
  rounds: number;
  bet: number;
  won: number;
  /** The most medals one round paid back (the Medal Pusher: one prize). */
  top: number;
  /** Rounds come out ahead in a row, now, and at the most. */
  run: number;
  best: number;
  /** When the game was last played on the device. */
  last: number;
}

/** What one device did on one day. */
export interface DayRow {
  day: Day;
  d: string;
  bet: number;
  won: number;
  /** Medals given: the daily bonus, refills and floor jackpots. */
  free: number;
  rounds: number;
}

/** The medals at the end of a day: the last that day's play left, by whichever device saw it last. */
export interface Close {
  day: Day;
  t: number;
  left: number;
}

export interface History {
  v: typeof HISTORY_VERSION;
  /** The device this copy is kept on: the same name as the medals' own on this device. */
  device: string;
  /** When the history began, by the clock of the first device that kept one: nothing before it is in it. 0 when not known. */
  since: number;
  /** The latest first. */
  entries: readonly Entry[];
  games: readonly GameRow[];
  /** The latest day first. */
  days: readonly DayRow[];
  close: readonly Close[];
}

/** A new history for a device, begun at `since`. */
export const createHistory = (device: string, since: number): History => ({ v: HISTORY_VERSION, device, since, entries: [], games: [], days: [], close: [] });

// ── What the bank and the machines say ──────────────────────────────────────

/** Something that happened to the medals, as it is told: at a moment on a day, with the medals the player had straight after. */
export type Observation = (
  /** A move of a round's medals under its receipt: taken below nothing, given above. */
  | { type: 'move'; game: string; round: string; step: string; medals: number }
  /** A round played whole, as its machine reports it: what it took, and what came back. */
  | { type: 'round'; game: string; round: string; bet: number; won: number }
  /** A machine that is fed and pays as it goes (the Medal Pusher): medals fed and won since it last said, the largest prize among them, and any jackpots. */
  | { type: 'machine'; game: string; fed: number; won: number; prize: number; jackpots: readonly number[] }
  | { type: 'bonus' | 'refill'; medals: number }
  /** The medals reset: `thrown` thrown away, and `medals` to start again with. */
  | { type: 'reset'; thrown: number; medals: number }
  /** A floor jackpot paid into the medals, under the win's own name (`id`). */
  | { type: 'floor'; id: string; medals: number }
  /** Medals moved that are no round's (a chip on the craps table, a frame of the pusher): only what is left is noted. */
  | { type: 'medals' }
  /**
   * A machine has let go of its rounds' receipts but those of the rounds in
   * `keep` (`forget` in bank.ts): every other round of the game is over, as
   * its machine says once nothing will try its moves again. A round lost
   * pays nothing, so this is how a lost round is known to be over.
   */
  | { type: 'over'; game: string; keep: readonly string[] }
) & { at: number; day: Day; left: number };

const NAME_SHAPE = /^[a-z0-9-]{1,24}$/;
/** A round's name: the one its receipts carry (`receiptOf` in ledger.ts), or one made here. */
const ROUND_SHAPE = /^[a-z0-9-]{1,24}$/;
/** Whether a text will do as a game's name. */
export const isGame = (value: unknown): value is string => typeof value === 'string' && NAME_SHAPE.test(value);
const isRound = (value: unknown): value is string => typeof value === 'string' && ROUND_SHAPE.test(value);
/** A count of medals that will do: a whole number from nothing up to the most that is counted. */
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= HISTORY_LIMITS.medals;
/** A moment that will do: a whole number of milliseconds after 1970 and before the year 275,000. */
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 8.64e15;
const capped = (n: number): number => Math.min(HISTORY_LIMITS.medals, n);
const toLeft = (value: unknown): number => (isCount(value) ? value : -1);

const keyOf = (entry: Pick<Entry, 'd' | 'g' | 'r'>): string => `${entry.d} ${entry.g} ${entry.r}`;
/** A name made from a moment, for something that has no name of its own: base 36, so a few letters. */
const momentName = (prefix: string, at: number, more = ''): string => `${prefix}${at.toString(36)}${more}`;

/** Newest first, and among things of one moment in the order of their names, so that every copy lists them alike. */
const byTime = (a: Entry, b: Entry): number => b.t - a.t || (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0);

/** The history with one entry put in, or put in place of the one of its name. */
function withEntry(history: History, entry: Entry): History {
  const key = keyOf(entry);
  const entries = history.entries.filter((other) => keyOf(other) !== key);
  entries.push(entry);
  entries.sort(byTime);
  return { ...history, entries: entries.slice(0, HISTORY_LIMITS.entries) };
}

const findEntry = (history: History, d: string, g: string, r: string): Entry | undefined => history.entries.find((entry) => entry.d === d && entry.g === g && entry.r === r);

const freshRow = (g: string, d: string): GameRow => ({ g, d, n: 0, rounds: 0, bet: 0, won: 0, top: 0, run: 0, best: 0, last: 0 });

/** This device's row for a game, changed: its count goes up by one. */
function withRow(history: History, game: string, change: (row: GameRow) => GameRow): History {
  const mine = history.games.find((row) => row.g === game && row.d === history.device) ?? freshRow(game, history.device);
  const next = { ...change(mine), n: Math.min(HISTORY_LIMITS.medals, mine.n + 1) };
  return { ...history, games: fitGames([...history.games.filter((row) => row !== mine), next], history.device) };
}

/** This device's totals for a day, with something added. */
function withDay(history: History, day: Day, add: Partial<Pick<DayRow, 'bet' | 'won' | 'free' | 'rounds'>>): History {
  const mine = history.days.find((row) => row.day === day && row.d === history.device) ?? { day, d: history.device, bet: 0, won: 0, free: 0, rounds: 0 };
  const next: DayRow = {
    ...mine,
    bet: capped(mine.bet + (add.bet ?? 0)),
    won: capped(mine.won + (add.won ?? 0)),
    free: capped(mine.free + (add.free ?? 0)),
    rounds: capped(mine.rounds + (add.rounds ?? 0)),
  };
  return { ...history, days: fitDays([...history.days.filter((row) => row !== mine), next], history.device) };
}

/** The medals at the end of the day, as now seen. */
function withClose(history: History, day: Day, at: number, left: number): History {
  if (!isCount(left)) return history;
  const was = history.close.find((close) => close.day === day);
  if (was && (was.t > at || (was.t === at && was.left >= left))) return history;
  return { ...history, close: fitClose([...history.close.filter((close) => close !== was), { day, t: at, left }]) };
}

/**
 * A round is over: it came out ahead, behind or even. Ahead adds one to the
 * run of rounds come out ahead; behind ends it; even leaves it as it was.
 */
function settle(history: History, entry: Entry): History {
  if (entry.done) return history;
  const over = withEntry(history, { ...entry, done: 1 });
  const net = entry.won - entry.bet;
  if (net === 0) return over;
  return withRow(over, entry.g, (row) => (net > 0 ? { ...row, run: row.run + 1, best: Math.max(row.best, row.run + 1) } : { ...row, run: 0 }));
}

/** Every round of a game on this device that is not over yet, but those in `keep`, is over: another round has begun, or its machine says so. */
function settleOpen(history: History, game: string, keep: readonly string[] = []): History {
  let next = history;
  for (const entry of history.entries) {
    if (entry.d === history.device && entry.g === game && entry.k === 'round' && !entry.done && !keep.includes(entry.r)) next = settle(next, entry);
  }
  return next;
}

/** A move of a round's medals. The first of a round begins it; a pay ends it. */
function moved(history: History, o: Extract<Observation, { type: 'move' }>): History {
  if (!isGame(o.game) || !isRound(o.round) || !Number.isSafeInteger(o.medals) || Math.abs(o.medals) > HISTORY_LIMITS.medals) return history;
  let next = history;
  let entry = findEntry(next, next.device, o.game, o.round);
  if (!entry) {
    next = settleOpen(next, o.game);
    next = withRow(next, o.game, (row) => ({ ...row, rounds: capped(row.rounds + 1) }));
    next = withDay(next, o.day, { rounds: 1 });
    entry = { d: next.device, g: o.game, r: o.round, k: 'round', t: o.at, bet: 0, won: 0, left: -1, done: 0 };
  }
  const bet = o.medals < 0 ? -o.medals : 0;
  const won = o.medals > 0 ? o.medals : 0;
  const after: Entry = { ...entry, t: Math.max(entry.t, o.at), bet: capped(entry.bet + bet), won: capped(entry.won + won), left: toLeft(o.left) };
  next = withEntry(next, after);
  next = withRow(next, o.game, (row) => ({ ...row, bet: capped(row.bet + bet), won: capped(row.won + won), top: Math.max(row.top, after.won), last: Math.max(row.last, o.at) }));
  if (bet > 0 || won > 0) next = withDay(next, o.day, { bet, won });
  // Every machine's last move of a round is its pay, made even when nothing is paid.
  return o.step === 'pay' ? settle(next, after) : next;
}

/** A round its machine reports whole. Reported again (a page that went before the history heard), it is counted once. */
function wholeRound(history: History, o: Extract<Observation, { type: 'round' }>): History {
  if (!isGame(o.game) || !isRound(o.round) || !isCount(o.bet) || !isCount(o.won) || (o.bet === 0 && o.won === 0)) return history;
  if (findEntry(history, history.device, o.game, o.round)) return history;
  let next = settleOpen(history, o.game);
  const entry: Entry = { d: next.device, g: o.game, r: o.round, k: 'round', t: o.at, bet: o.bet, won: o.won, left: toLeft(o.left), done: 0 };
  next = withEntry(next, entry);
  next = withRow(next, o.game, (row) => ({ ...row, rounds: capped(row.rounds + 1), bet: capped(row.bet + o.bet), won: capped(row.won + o.won), top: Math.max(row.top, o.won), last: Math.max(row.last, o.at) }));
  next = withDay(next, o.day, { bet: o.bet, won: o.won, rounds: 1 });
  return settle(next, entry);
}

/** The Medal Pusher fed and paying: its visit grows, its prizes raise its best, and a jackpot is an entry of its own. */
function machine(history: History, o: Extract<Observation, { type: 'machine' }>): History {
  if (!isGame(o.game) || !isCount(o.fed) || !isCount(o.won) || !isCount(o.prize)) return history;
  const jackpots = o.jackpots.filter(isCount);
  if (o.fed === 0 && o.won === 0 && o.prize === 0 && jackpots.length === 0) return history;
  let next = history;
  if (o.fed > 0 || o.won > 0) {
    // The visit is the device's latest play of the machine, while it has not stood unplayed for long.
    const visit = next.entries.find((entry) => entry.d === next.device && entry.g === o.game && entry.k === 'play');
    const going = visit && !visit.done && o.at >= visit.t && o.at - visit.t <= VISIT_GAP ? visit : null;
    if (visit && !going && !visit.done) next = withEntry(next, { ...visit, done: 1 });
    const base: Entry = going ?? { d: next.device, g: o.game, r: momentName('p', o.at), k: 'play', t: o.at, bet: 0, won: 0, left: -1, done: 0 };
    next = withEntry(next, { ...base, t: Math.max(base.t, o.at), bet: capped(base.bet + o.fed), won: capped(base.won + o.won), left: toLeft(o.left) });
    next = withDay(next, o.day, { bet: o.fed, won: o.won });
  }
  next = withRow(next, o.game, (row) => ({ ...row, bet: capped(row.bet + o.fed), won: capped(row.won + o.won), top: Math.max(row.top, o.prize, ...jackpots), last: Math.max(row.last, o.at) }));
  jackpots.forEach((medals, index) => {
    next = withEntry(next, { d: next.device, g: o.game, r: momentName('j', o.at, index > 0 ? `-${index}` : ''), k: 'jackpot', t: o.at, bet: 0, won: medals, left: toLeft(o.left), done: 1 });
  });
  return next;
}

/** The letter the name of each of the counter's doings begins with. */
const COUNTED = { bonus: 'b', refill: 'f', reset: 'x' } as const;

/** Something the medal center's counter did, once: a bonus, a refill, a reset. The same thing told twice is written once. */
function counted(history: History, kind: 'bonus' | 'refill' | 'reset', o: Observation, bet: number, won: number): History {
  const r = momentName(COUNTED[kind], o.at);
  if (findEntry(history, history.device, CENTER, r)) return history;
  const next = withEntry(history, { d: history.device, g: CENTER, r, k: kind, t: o.at, bet, won, left: toLeft(o.left), done: 1 });
  return kind === 'reset' ? next : withDay(next, o.day, { free: won });
}

/**
 * A floor jackpot paid into the medals: an entry of its own, named by the
 * win, so that the same win told twice is written once; the medals given on
 * its day; and the floor jackpot's records, as a machine's are kept: one more
 * won, its medals, the biggest.
 */
function floorJackpot(history: History, o: Extract<Observation, { type: 'floor' }>): History {
  if (!isRound(o.id) || !isCount(o.medals) || o.medals === 0) return history;
  if (findEntry(history, history.device, FLOOR_JACKPOT, o.id)) return history;
  let next = withEntry(history, { d: history.device, g: FLOOR_JACKPOT, r: o.id, k: 'floor', t: o.at, bet: 0, won: o.medals, left: toLeft(o.left), done: 1 });
  next = withDay(next, o.day, { free: o.medals });
  return withRow(next, FLOOR_JACKPOT, (row) => ({ ...row, rounds: capped(row.rounds + 1), won: capped(row.won + o.medals), top: Math.max(row.top, o.medals), last: Math.max(row.last, o.at) }));
}

/**
 * The history with something that happened written in. The same history
 * comes back for anything that will not do: a moment or a day off the
 * calendar, a name or a number out of shape.
 */
export function record(history: History, o: Observation): History {
  if (!isTime(o.at) || dayNumber(o.day) === null) return history;
  const next = withClose(history, o.day, o.at, o.left);
  switch (o.type) {
    case 'move':
      return REPORTS_ROUNDS.has(o.game) ? next : moved(next, o);
    case 'round':
      return wholeRound(next, o);
    case 'machine':
      return machine(next, o);
    case 'bonus':
    case 'refill':
      if (!isCount(o.medals) || o.medals === 0) return next;
      return counted(next, o.type, o, 0, o.medals);
    case 'reset':
      if (!isCount(o.thrown) || !isCount(o.medals)) return next;
      return counted(next, 'reset', o, o.thrown, o.medals);
    case 'medals':
      return next;
    case 'floor':
      return floorJackpot(next, o);
    case 'over':
      return !isGame(o.game) || REPORTS_ROUNDS.has(o.game) ? next : settleOpen(next, o.game, o.keep);
  }
}

// ── Keeping within bounds ───────────────────────────────────────────────────

/** The latest entries, as many as are kept. */
const fitEntries = (entries: readonly Entry[]): Entry[] => [...entries].sort(byTime).slice(0, HISTORY_LIMITS.entries);

/**
 * The game rows a copy kept on `home` keeps: for each game, home's own row and
 * the rows of the devices that have changed theirs most, as many as a game
 * keeps; and the games home has played, then the busiest, as many as are kept.
 */
function fitGames(rows: readonly GameRow[], home: string): GameRow[] {
  const byGame = new Map<string, GameRow[]>();
  for (const row of rows) byGame.set(row.g, [...(byGame.get(row.g) ?? []), row]);
  const games = [...byGame.entries()].map(([game, list]) => {
    const own = list.filter((row) => row.d === home);
    const others = list.filter((row) => row.d !== home).sort((a, b) => b.n - a.n || (a.d < b.d ? -1 : 1));
    const kept = [...own, ...others].slice(0, HISTORY_LIMITS.gameDevices);
    return { game, kept, own: own.length > 0, busy: kept.reduce((sum, row) => sum + row.n, 0) };
  });
  games.sort((a, b) => Number(b.own) - Number(a.own) || b.busy - a.busy || (a.game < b.game ? -1 : 1));
  return games
    .slice(0, HISTORY_LIMITS.games)
    .flatMap(({ kept }) => kept)
    .sort((a, b) => (a.g < b.g ? -1 : a.g > b.g ? 1 : a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

const dayWeight = (row: DayRow): number => row.bet + row.won + row.free + row.rounds;

/** The latest days, as many as are kept, each with home's own totals and the busiest other devices', as many as a day keeps. */
function fitDays(rows: readonly DayRow[], home: string): DayRow[] {
  const byDay = new Map<Day, DayRow[]>();
  for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);
  const days = [...byDay.keys()].sort().reverse().slice(0, HISTORY_LIMITS.days);
  return days.flatMap((day) => {
    const list = byDay.get(day) ?? [];
    const own = list.filter((row) => row.d === home);
    const others = list.filter((row) => row.d !== home).sort((a, b) => dayWeight(b) - dayWeight(a) || (a.d < b.d ? -1 : 1));
    return [...own, ...others].slice(0, HISTORY_LIMITS.dayDevices).sort((a, b) => (a.d < b.d ? -1 : 1));
  });
}

const fitClose = (close: readonly Close[]): Close[] => [...close].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0)).slice(0, HISTORY_LIMITS.days);

/** A history within every bound, kept as `home`'s. */
const fit = (history: History): History => ({
  ...history,
  entries: fitEntries(history.entries),
  games: fitGames(history.games, history.device),
  days: fitDays(history.days, history.device),
  close: fitClose(history.close),
});

// ── Two copies of one history ───────────────────────────────────────────────

/** Two copies of one entry: each figure the larger, and the medals left as the later copy saw them. */
function laterEntry(a: Entry, b: Entry): Entry {
  return {
    d: a.d,
    g: a.g,
    r: a.r,
    k: a.k <= b.k ? a.k : b.k,
    t: Math.max(a.t, b.t),
    bet: Math.max(a.bet, b.bet),
    won: Math.max(a.won, b.won),
    left: a.t > b.t ? a.left : b.t > a.t ? b.left : Math.max(a.left, b.left),
    done: Math.max(a.done, b.done),
  };
}

/** Two copies of one device's row for a game: the later (the higher count), and where the counts are the same, each figure the larger. */
function laterRow(a: GameRow, b: GameRow): GameRow {
  if (a.n !== b.n) return a.n > b.n ? a : b;
  return { g: a.g, d: a.d, n: a.n, rounds: Math.max(a.rounds, b.rounds), bet: Math.max(a.bet, b.bet), won: Math.max(a.won, b.won), top: Math.max(a.top, b.top), run: Math.max(a.run, b.run), best: Math.max(a.best, b.best), last: Math.max(a.last, b.last) };
}

function joinBy<T>(a: readonly T[], b: readonly T[], key: (item: T) => string, join: (one: T, other: T) => T): T[] {
  const joined = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const k = key(item);
    const had = joined.get(k);
    joined.set(k, had === undefined ? item : join(had, item));
  }
  return [...joined.values()];
}

/** The earlier of two moments a history began, leaving out one that is not known. */
const earlier = (a: number, b: number): number => (a > 0 && b > 0 ? Math.min(a, b) : Math.max(a, b));

/**
 * Two copies of one player's history as one, kept as the first one's device.
 * Every entry, row and day of either is in it, once, each the later of its two
 * copies; see the top of the file.
 */
export function mergeHistories(a: History, b: History): History {
  return fit({
    v: HISTORY_VERSION,
    device: a.device,
    since: earlier(a.since, b.since),
    entries: joinBy(a.entries, b.entries, keyOf, laterEntry),
    games: joinBy(a.games, b.games, (row) => `${row.g} ${row.d}`, laterRow),
    days: joinBy(a.days, b.days, (row) => `${row.day} ${row.d}`, (one, other) => ({
      ...one,
      bet: Math.max(one.bet, other.bet),
      won: Math.max(one.won, other.won),
      free: Math.max(one.free, other.free),
      rounds: Math.max(one.rounds, other.rounds),
    })),
    close: joinBy(a.close, b.close, (close) => close.day, (one, other) => (other.t > one.t || (other.t === one.t && other.left > one.left) ? other : one)),
  });
}

/** Whether two items of a history hold the same: every field the same. */
const same = (a: object, b: object): boolean => {
  const fields = Object.keys(a);
  return fields.length === Object.keys(b).length && fields.every((field) => (a as Record<string, unknown>)[field] === (b as Record<string, unknown>)[field]);
};

/** The items of `now` that `then` lacks, or holds otherwise. */
function newer<T extends object>(now: readonly T[], then: readonly T[], key: (item: T) => string): T[] {
  const had = new Map(then.map((item) => [key(item), item]));
  return now.filter((item) => {
    const was = had.get(key(item));
    return was === undefined || !same(was, item);
  });
}

/**
 * The part of `now` that `then` does not hold as it is: every entry, row, day
 * and close of `now` that `then` lacks or holds otherwise. It is a history of
 * its own, the same device's from the same beginning, and since everything in
 * a history only grows (see the top of the file), `then` and the part joined
 * (`mergeHistories`) are `now` again. A device keeps its history as a whole
 * and the part changed since the whole was written (historyStore.ts), so that
 * a round played writes a few hundred characters, not the whole history.
 */
export function changedSince(now: History, then: History): History {
  return {
    ...now,
    entries: newer(now.entries, then.entries, keyOf),
    games: newer(now.games, then.games, (row) => `${row.g} ${row.d}`),
    days: newer(now.days, then.days, (row) => `${row.day} ${row.d}`),
    close: newer(now.close, then.close, (close) => close.day),
  };
}

/** Whether a history holds nothing: no entry, row, day or close. */
export const isEmpty = (history: History): boolean => history.entries.length + history.games.length + history.days.length + history.close.length === 0;

// ── Text ────────────────────────────────────────────────────────────────────

/**
 * The most the account's copy may come to, as the save route measures it
 * (`sizeOf` in account.ts): well within the route's 64 KB. A player's real
 * history comes to a fraction of it; only one at the very edge of every bound
 * at once (every entry from another device and another game, every number at
 * its largest) would reach it, and then its oldest entries give way.
 */
export const ACCOUNT_BUDGET = 48_000;
/**
 * Below this many characters a history's text cannot come to the budget on
 * the account: packed, a text is never longer than it was (the names of the
 * fields are written once, not in every entry), so it is only packed to be
 * measured when it is longer than this.
 */
const SURELY_FITS = ACCOUNT_BUDGET - 400;

/** The size of the account's copy of a text, as the route measures it: packed, with the copy's mark and time beside it. */
export const accountSizeOf = (text: string): number => {
  const data = pack(text);
  return data === null ? Number.POSITIVE_INFINITY : sizeOf({ format: PACK_FORMAT, mark: 'm'.repeat(20), changedAt: 8_640_000_000_000_000, data });
};

const writeOut = (tidy: History): string =>
  JSON.stringify({
    v: HISTORY_VERSION,
    device: tidy.device,
    since: tidy.since,
    entries: tidy.entries.map(({ d, g, r, k, t, bet, won, left, done }) => ({ d, g, r, k, t, bet, won, left, done })),
    games: tidy.games.map(({ g, d, n, rounds, bet, won, top, run, best, last }) => ({ g, d, n, rounds, bet, won, top, run, best, last })),
    days: tidy.days.map(({ day, d, bet, won, free, rounds }) => ({ day, d, bet, won, free, rounds })),
    close: tidy.close.map(({ day, t, left }) => ({ day, t, left })),
  });

/**
 * The history as text, always laid out the same way, so two copies that hold
 * the same things are the same text, and never more than the account takes
 * (`ACCOUNT_BUDGET`).
 */
export function serializeHistory(history: History): string {
  let tidy = fit(history);
  let text = writeOut(tidy);
  while (text.length > SURELY_FITS && accountSizeOf(text) > ACCOUNT_BUDGET) {
    // The oldest entries give way first, a tenth at a time; with none left, the oldest days.
    if (tidy.entries.length > 0) tidy = { ...tidy, entries: tidy.entries.slice(0, Math.floor(tidy.entries.length * 0.9)) };
    else if (tidy.days.length > 0) tidy = { ...tidy, days: tidy.days.slice(0, Math.floor(tidy.days.length * 0.9)), close: tidy.close.slice(0, Math.floor(tidy.close.length * 0.9)) };
    else break;
    text = writeOut(tidy);
  }
  return text;
}

/** What two copies have in common when they hold the same things, whichever device each is kept on. */
export function printOf(text: string): string {
  const history = parseHistory(text);
  return history ? serializeHistory({ ...history, device: '' }) : text;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** The items of a stored list that will do, read one by one; far more than are kept is not read at all. */
const items = <T>(value: unknown, most: number, read: (item: Record<string, unknown>) => T | null): T[] =>
  Array.isArray(value) ? value.slice(0, most * 4).flatMap((item) => (isRecord(item) ? (read(item) ?? []) : [])) : [];

/**
 * Reads a history back. A text that is not a history at all is null; a part
 * of one that will not do (an entry, a row, a day) is left out, and the rest
 * kept.
 */
export function parseHistory(text: unknown): History | null {
  if (typeof text !== 'string' || text.length > HISTORY_LIMITS.length) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== HISTORY_VERSION || !isDevice(value.device)) return null;
  const entries = items(value.entries, HISTORY_LIMITS.entries, (item): Entry | null => {
    const { d, g, r, k, t, bet, won, left, done } = item;
    if (!isDevice(d) || !(isGame(g) || g === CENTER) || !isRound(r) || !KINDS.includes(k as EntryKind) || !isTime(t) || !isCount(bet) || !isCount(won)) return null;
    return { d, g, r, k: k as EntryKind, t, bet, won, left: toLeft(left), done: done === 1 ? 1 : 0 };
  });
  const games = items(value.games, HISTORY_LIMITS.games * HISTORY_LIMITS.gameDevices, (item): GameRow | null => {
    const { g, d, n, rounds, bet, won, top, run, best, last } = item;
    if (!isGame(g) || !isDevice(d) || ![n, rounds, bet, won, top, run, best].every(isCount) || !(last === 0 || isTime(last))) return null;
    return { g, d, n: n as number, rounds: rounds as number, bet: bet as number, won: won as number, top: top as number, run: run as number, best: best as number, last: last as number };
  });
  const days = items(value.days, HISTORY_LIMITS.days * HISTORY_LIMITS.dayDevices, (item): DayRow | null => {
    const { day, d, bet, won, free, rounds } = item;
    if (dayNumber(day) === null || !isDevice(d) || ![bet, won, free, rounds].every(isCount)) return null;
    return { day: day as Day, d, bet: bet as number, won: won as number, free: free as number, rounds: rounds as number };
  });
  const close = items(value.close, HISTORY_LIMITS.days, (item): Close | null => {
    const { day, t, left } = item;
    if (dayNumber(day) === null || !isTime(t) || !isCount(left)) return null;
    return { day: day as Day, t, left };
  });
  const since = isTime(value.since) ? value.since : 0;
  // One copy of anything the text holds twice: the later of the two, as when two copies are joined.
  const once = mergeHistories(createHistory(value.device, since), { v: HISTORY_VERSION, device: value.device, since, entries, games, days, close });
  return once;
}

// ── What the page shows ─────────────────────────────────────────────────────

/** A game's records, every device's together. */
export interface GameRecord {
  game: string;
  rounds: number;
  bet: number;
  won: number;
  top: number;
  best: number;
  last: number;
}

/** Each game's records, every device's rows added together, the game played last first. */
export function recordsOf(history: History): GameRecord[] {
  const byGame = new Map<string, GameRecord>();
  for (const row of history.games) {
    const had = byGame.get(row.g) ?? { game: row.g, rounds: 0, bet: 0, won: 0, top: 0, best: 0, last: 0 };
    byGame.set(row.g, {
      game: row.g,
      rounds: capped(had.rounds + row.rounds),
      bet: capped(had.bet + row.bet),
      won: capped(had.won + row.won),
      top: Math.max(had.top, row.top),
      best: Math.max(had.best, row.best),
      last: Math.max(had.last, row.last),
    });
  }
  return [...byGame.values()].sort((a, b) => b.last - a.last || (a.game < b.game ? -1 : 1));
}

/** Every machine's records added together. The floor jackpot is no machine, and is left out: its records are its own. */
export function totalsOf(records: readonly GameRecord[]): { rounds: number; bet: number; won: number } {
  return records
    .filter((row) => row.game !== FLOOR_JACKPOT)
    .reduce((sum, row) => ({ rounds: capped(sum.rounds + row.rounds), bet: capped(sum.bet + row.bet), won: capped(sum.won + row.won) }), { rounds: 0, bet: 0, won: 0 });
}

/** What came back for each medal that went in, or null before any went in. */
export const returnOf = (bet: number, won: number): number | null => (bet > 0 ? won / bet : null);

/** One day's totals, every device's together. */
export interface DayTotal {
  day: Day;
  bet: number;
  won: number;
  free: number;
  rounds: number;
  /** The medals at the end of the day, if known. */
  left: number | null;
}

/** Each day's totals, the latest first. */
export function dayTotals(history: History): DayTotal[] {
  const byDay = new Map<Day, DayTotal>();
  for (const row of history.days) {
    const had = byDay.get(row.day) ?? { day: row.day, bet: 0, won: 0, free: 0, rounds: 0, left: null };
    byDay.set(row.day, { ...had, bet: capped(had.bet + row.bet), won: capped(had.won + row.won), free: capped(had.free + row.free), rounds: capped(had.rounds + row.rounds) });
  }
  for (const close of history.close) {
    const had = byDay.get(close.day) ?? { day: close.day, bet: 0, won: 0, free: 0, rounds: 0, left: null };
    byDay.set(close.day, { ...had, left: close.left });
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

/**
 * The medals over time, the earliest first: after each thing the entries
 * list, and before them, at the end of each day the entries no longer reach.
 */
export function medalsOverTime(history: History): { t: number; left: number }[] {
  const recent = history.entries.filter((entry) => entry.left >= 0).map((entry) => ({ t: entry.t, left: entry.left }));
  const first = recent.reduce((least, point) => Math.min(least, point.t), Number.POSITIVE_INFINITY);
  const older = history.close.filter((close) => close.t < first).map((close) => ({ t: close.t, left: close.left }));
  return [...older, ...recent].sort((a, b) => a.t - b.t);
}
