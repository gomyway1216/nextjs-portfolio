/**
 * The player's own book, kept apart from the machine: the daily bonus card
 * with the days it was stamped, the records of a lifetime at this cabinet,
 * and the achievements earned on the way. Resetting the machine does not
 * touch it. In an arcade this is the medal bank's card and the record board
 * on the wall.
 *
 * This file is only arithmetic on a book. It never touches the browser and it
 * never reads the clock: the cabinet passes in what the machine did, and the
 * local calendar day it did it on.
 *
 * One player's book can exist in several copies: a guest's and their
 * account's, a phone's and a laptop's. `mergeBooks` joins two copies so that
 * nothing is lost and nothing is counted twice, whatever order the copies
 * meet in and however often:
 *   - What is counted is kept per device. Each device adds only to its own
 *     row, so the larger of two copies of a row is the later one, and the
 *     figure shown is the sum of the rows (a grow-only counter).
 *   - A best is the larger of the two.
 *   - A stamp keeps the earlier of its two dates.
 *   - The days played and the days the bonus was taken are sets, and the
 *     joined set is every day in either. A day's bonus that either copy has
 *     taken is taken, so no day is paid twice.
 *   - Clearing the records starts a new era. A copy from an older era gives
 *     way to one from a newer, except for the days the bonus was taken, which
 *     no clearing forgets.
 *
 * What comes back out of storage is not trusted: it is checked field by field
 * and kept within `LIMITS`, so a damaged or edited book cannot hand the page
 * a number it would choke on, and the text written back stays small.
 *
 * To count something new, add a line to `COUNTERS` (what an event adds to it)
 * or `BESTS` (what an event would set it to, if that is more). To add an
 * achievement, add a line to `ACHIEVEMENTS` and its name to the strings. No
 * stored book has to change: a counter it has never heard of is zero.
 */

import { CHAIN_GOAL, CHESTS } from './lottery';
import type { SessionEvent } from './session';

export const RECORDS_KEY = 'medal-pusher-records';
export const RECORDS_VERSION = 1;

/** A local calendar day, as the page reads it off the player's clock: `2026-10-12`. */
export type Day = string;

/**
 * The bounds a book keeps within. They are far outside anything play reaches,
 * and they are what keeps the stored text small: at the very worst, every
 * bound reached at once, a book is little over six thousand characters. A
 * player's real one is a few hundred.
 */
export const LIMITS = {
  /** Anything counted over a lifetime. A rail fed without a pause for three years does not get there. */
  count: 1_000_000_000,
  /** Devices whose counts a book keeps apart. Beyond that, the ones that have counted least are left out. */
  devices: 6,
  /** Months of calendar a book remembers, for the days played and for the days the bonus was taken: the latest four years of them. */
  months: 48,
  /** Times the records can be cleared. */
  eras: 1_000_000,
  /** The calendar the book knows: from the first day of 2020 to the last of 2099, as numbered days. */
  firstDay: Date.UTC(2020, 0, 1) / 86_400_000,
  lastDay: Date.UTC(2099, 11, 31) / 86_400_000,
  /** The longest text that is read at all. */
  length: 20_000,
} as const;

// ── Days ────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const DAY_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_SHAPE = /^(\d{4})-(\d{2})$/;
const two = (n: number): string => String(n).padStart(2, '0');

/** A day written out, from the year, the month (1 to 12) and the day of the month. */
export const dayFrom = (year: number, month: number, date: number): Day => `${String(year).padStart(4, '0')}-${two(month)}-${two(date)}`;

/**
 * A day as a number, one more for each day that passes, or null when the text
 * is not a real date on the book's calendar. The thirtieth of February is not
 * one, and neither is anything a clock set wildly wrong would come up with.
 */
export function dayNumber(day: unknown): number | null {
  if (typeof day !== 'string') return null;
  const parts = DAY_SHAPE.exec(day);
  if (!parts) return null;
  const [year, month, date] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const time = Date.UTC(year, month - 1, date);
  const back = new Date(time);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== date) return null;
  const number = time / MS_PER_DAY;
  return number >= LIMITS.firstDay && number <= LIMITS.lastDay ? number : null;
}

/** The day a number stands for. */
export function dayOf(number: number): Day {
  const date = new Date(number * MS_PER_DAY);
  return dayFrom(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * A set of days, written as the months that have any: under each month, one
 * bit for each of its days, the first day's the lowest. A month played right
 * through is one short number, and so is a month played once.
 */
export type DaySet = Readonly<Record<string, number>>;

/** Where a numbered day is kept: its month, and its bit there. */
function placeOf(number: number): { month: string; bit: number } {
  const day = dayOf(number);
  return { month: day.slice(0, 7), bit: 1 << (Number(day.slice(8)) - 1) };
}

/** Whether a numbered day is in the set. */
const holds = (set: DaySet, number: number): boolean => {
  const { month, bit } = placeOf(number);
  return ((set[month] ?? 0) & bit) !== 0;
};

/** Whether a day is in the set. A day that is not on the calendar is in none. */
export function hasDay(set: DaySet, day: Day): boolean {
  const number = dayNumber(day);
  return number !== null && holds(set, number);
}

/** The set with only its latest months, as many as a book remembers. */
function latestMonths(set: DaySet): DaySet {
  const months = Object.keys(set).sort();
  if (months.length <= LIMITS.months) return set;
  const kept: Record<string, number> = {};
  for (const month of months.slice(months.length - LIMITS.months)) kept[month] = set[month];
  return kept;
}

/** The set with a day added. A day that is not on the calendar is not added. */
export function addDay(set: DaySet, day: Day): DaySet {
  const number = dayNumber(day);
  if (number === null || holds(set, number)) return set;
  const { month, bit } = placeOf(number);
  return latestMonths({ ...set, [month]: (set[month] ?? 0) | bit });
}

/** Every day that is in either set. */
export function unionDays(a: DaySet, b: DaySet): DaySet {
  const joined: Record<string, number> = { ...a };
  for (const [month, days] of Object.entries(b)) joined[month] = (joined[month] ?? 0) | days;
  return latestMonths(joined);
}

/** The days of a set as numbers, the earliest first. */
export function daysIn(set: DaySet): number[] {
  const days: number[] = [];
  for (const month of Object.keys(set).sort()) {
    const parts = MONTH_SHAPE.exec(month);
    if (!parts) continue;
    const first = Date.UTC(Number(parts[1]), Number(parts[2]) - 1, 1) / MS_PER_DAY;
    for (let date = 0; date < 31; date++) if ((set[month] & (1 << date)) !== 0) days.push(first + date);
  }
  return days;
}

/** How many days are in a set. */
export const countDays = (set: DaySet): number => daysIn(set).length;

/** The latest day in a set, as a number, or null when the set is empty. */
export function lastIn(set: DaySet): number | null {
  const days = daysIn(set);
  return days.length > 0 ? days[days.length - 1] : null;
}

/** How many days in a row, ending on this numbered day, are in the set. None when the day itself is not. */
export function runEnding(set: DaySet, number: number): number {
  let run = 0;
  while (holds(set, number - run)) run++;
  return run;
}

/** The longest run of days in a row in the set. */
export function longestRun(set: DaySet): number {
  let longest = 0;
  let run = 0;
  let previous = Number.NaN;
  for (const day of daysIn(set)) {
    run = day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return longest;
}

// ── What is counted ─────────────────────────────────────────────────────────

/**
 * What the book hears of. Most of it is what the machine says happened. Two
 * things it does not say, because they happen at the controls and not on the
 * field, are worked out by the cabinet from the machine's own counters and
 * passed in beside the rest: medals fed, and refills taken.
 */
export type RecordEvent = SessionEvent | { type: 'fed'; count: number } | { type: 'refill'; count: number };

/** The day's bonus being taken. Only `claim` says this, so that it is counted exactly when it is paid. */
interface Claimed {
  type: 'claimed';
  medals: number;
}
type Counted = RecordEvent | Claimed;

/** What one event adds to a counter, or would set a best to. Nothing, for most events. */
type Reading = (event: Counted) => number;

/** A reading of one kind of event: `amount` of it, or one for each when no amount is given. */
const on =
  <T extends Counted['type']>(type: T, amount: (event: Extract<Counted, { type: T }>) => number = () => 1): Reading =>
  (event) =>
    event.type === type ? amount(event as Extract<Counted, { type: T }>) : 0;

/** The most a chest can hold. */
const TOP_CHEST = Math.max(...CHESTS);

/**
 * Everything the book counts, and what each event adds to it. Each is a sum
 * over a lifetime, kept per device.
 */
export const COUNTERS = {
  /** Medals fed into the rails, and what became of the field's medals: over the front, or out of the sides. */
  fed: on('fed', (event) => event.count),
  won: on('won', (event) => event.count),
  lost: on('lost', (event) => event.count),
  /**
   * Medals through a START pocket, the ones that found the hold full already, and of those the ones that turned a
   * held spin gold. And of the ones that were held, those whose spin was gold from the start: through the pocket
   * the lucky lamp was on, or through any pocket while the wings were open.
   */
  hits: on('checker'),
  wasted: on('checker', (event) => (event.held ? 0 : 1)),
  golds: on('checker', (event) => (event.gold ? 1 : 0)),
  luckies: on('checker', (event) => (event.lucky ? 1 : 0)),
  /** Times the hold filled right up: the machine says so at the moment its last place is taken. */
  fulls: on('holdFilled'),
  /** Chance times: the machine says when one begins, with the first held spin to turn gold. */
  chances: on('chanceStart'),
  /** Spins that have stopped, and of those the ones that showed a reach, and a super reach. */
  spins: on('spinEnd'),
  reaches: on('spinEnd', (event) => (event.result.reach ? 1 : 0)),
  supers: on('spinEnd', (event) => (event.result.reachKind === 'long' ? 1 : 0)),
  /** Lines: three even digits, three odd ones, three sevens. Every line is a reach that hit. */
  small: on('spinEnd', (event) => (event.result.tier === 'small' ? 1 : 0)),
  big: on('spinEnd', (event) => (event.result.tier === 'big' ? 1 : 0)),
  seven: on('spinEnd', (event) => (event.result.tier === 'seven' ? 1 : 0)),
  /** Super reaches that hit. */
  superWins: on('spinEnd', (event) => (event.result.reachKind === 'long' && event.result.tier !== 'miss' ? 1 : 0)),
  /** Landings on the sugoroku board's fever square. */
  fevers: on('sugorokuEnd', (event) => (event.fever ? 1 : 0)),
  /** Chests opened, and the ones that held the most a chest can. */
  chests: on('chestEnd'),
  topChests: on('chestEnd', (event) => (event.payout >= TOP_CHEST ? 1 : 0)),
  /**
   * Prizes big enough for the hopper to pour: the machine says so each time its doors begin to drop open. And towers
   * that came up on their lifts and stand built: it says so as their guards begin to sink.
   */
  pours: on('pourStart'),
  raised: on('towersReady', (event) => event.towers),
  /** Towers pushed over the pusher's lip. */
  towers: on('toppled', (event) => event.count),
  /** Prize balls pushed over the front, and the roulettes they started. */
  balls: on('ball', (event) => event.count),
  roulettes: on('rouletteStart'),
  /** Full runs: the ball let go in the bowl. And the times it found the jackpot's hole. */
  challenges: on('bowlStart'),
  jackpots: on('bowlEnd', (event) => (event.jackpot ? 1 : 0)),
  /** Refills taken when the medals ran out. */
  refills: on('refill', (event) => event.count),
  /** Daily bonuses taken, and the medals they came to. */
  claims: on('claimed'),
  bonus: on('claimed', (event) => event.medals),
} satisfies Record<string, Reading>;
export type CounterId = keyof typeof COUNTERS;
export const COUNTER_IDS = Object.keys(COUNTERS) as CounterId[];

/**
 * The bests: the most any one event has come to. A prize is what one game on
 * the screen paid: one roll on the board, one chest, or one whole run of the
 * roulette with whatever the bowl added to it.
 */
export const BESTS = {
  prize: (event) =>
    event.type === 'sugorokuEnd' || event.type === 'chestEnd' ? event.payout : event.type === 'rouletteEnd' || event.type === 'bowlEnd' ? event.total : 0,
  /** The largest jackpot won. */
  jackpot: on('bowlEnd', (event) => (event.jackpot ? event.payout : 0)),
  /** The longest run of numbers on the roulette. */
  run: on('rouletteStep', (event) => event.level),
} satisfies Record<string, Reading>;
export type BestId = keyof typeof BESTS;
export const BEST_IDS = Object.keys(BESTS) as BestId[];

/** One device's counts. A counter that is at zero is left out. */
export type Counts = Readonly<Partial<Record<CounterId, number>>>;

/** A stamp in the book's sheet of achievements, and what earns it. */
export interface Achievement {
  id: string;
  earned: (view: BookView) => boolean;
}

/** Days in a row that earn the last stamp, and fill one bonus card. */
export const WEEK = 7;
/** Medals won that earn a stamp. */
export const MANY_MEDALS = 1000;

/** The achievements, in the order the sheet shows them. */
export const ACHIEVEMENTS = [
  { id: 'firstLine', earned: (view) => view.total.small + view.total.big + view.total.seven >= 1 },
  { id: 'holdFull', earned: (view) => view.total.fulls >= 1 },
  { id: 'superWin', earned: (view) => view.total.superWins >= 1 },
  { id: 'fever', earned: (view) => view.total.fevers >= 1 },
  { id: 'treasure', earned: (view) => view.total.topChests >= 1 },
  { id: 'tower', earned: (view) => view.total.towers >= 1 },
  { id: 'sevens', earned: (view) => view.total.seven >= 1 },
  { id: 'ball', earned: (view) => view.total.balls >= 1 },
  { id: 'fullRun', earned: (view) => view.best.run >= CHAIN_GOAL },
  { id: 'jackpot', earned: (view) => view.total.jackpots >= 1 },
  { id: 'thousand', earned: (view) => view.total.won >= MANY_MEDALS },
  { id: 'week', earned: (view) => view.streak >= WEEK },
] as const satisfies readonly Achievement[];
export type AchievementId = (typeof ACHIEVEMENTS)[number]['id'];
export const ACHIEVEMENT_IDS: readonly AchievementId[] = ACHIEVEMENTS.map((achievement) => achievement.id);

// ── The book ────────────────────────────────────────────────────────────────

export interface RecordBook {
  v: typeof RECORDS_VERSION;
  /** The device this copy is kept on: a name made up at random the first time the book is opened there. */
  device: string;
  /** How many times the records have been cleared. */
  era: number;
  /** What each device has counted, under its name. */
  counters: Readonly<Record<string, Counts>>;
  bests: Readonly<Partial<Record<BestId, number>>>;
  /** The achievements earned, each with the day it was. */
  stamps: Readonly<Partial<Record<AchievementId, Day>>>;
  /** The days a medal was fed or the bonus taken. */
  played: DaySet;
  /** The days the bonus was taken. */
  claimed: DaySet;
}

const DEVICE_SHAPE = /^[a-z0-9]{6,16}$/;
/** Whether a text will do as a device's name. */
export const isDevice = (value: unknown): value is string => typeof value === 'string' && DEVICE_SHAPE.test(value);

/** A device's own row of counts, if the book has one. A name is looked up among the book's own rows and nowhere else. */
export const rowOf = (counters: Readonly<Record<string, Counts>>, device: string): Counts | undefined =>
  Object.prototype.hasOwnProperty.call(counters, device) ? counters[device] : undefined;

/** A new, empty book for a device. */
export const createBook = (device: string): RecordBook => ({
  v: RECORDS_VERSION,
  device,
  era: 0,
  counters: {},
  bests: {},
  stamps: {},
  played: {},
  claimed: {},
});

/** The book as it is shown: every counter summed over the devices, the bests, and the days. */
export interface BookView {
  total: Record<CounterId, number>;
  best: Record<BestId, number>;
  /** Days played, and the longest run of them in a row. */
  days: number;
  streak: number;
}

export function viewOf(book: RecordBook): BookView {
  const total = Object.fromEntries(COUNTER_IDS.map((id) => [id, 0])) as Record<CounterId, number>;
  for (const counts of Object.values(book.counters)) {
    for (const id of COUNTER_IDS) total[id] = Math.min(LIMITS.count, total[id] + (counts[id] ?? 0));
  }
  const best = Object.fromEntries(BEST_IDS.map((id) => [id, book.bests[id] ?? 0])) as Record<BestId, number>;
  return { total, best, days: countDays(book.played), streak: longestRun(book.played) };
}

/** What came back over the front for each medal fed, over a lifetime, or null before any has been fed. */
export const lifetimeReturn = (view: BookView): number | null => (view.total.fed > 0 ? view.total.won / view.total.fed : null);

/** The run of days played that is still going on `day`: it ends today, or yesterday if today has not been played yet. */
export function currentStreak(book: RecordBook, day: Day): number {
  const today = dayNumber(day);
  if (today === null) return 0;
  return runEnding(book.played, today) || runEnding(book.played, today - 1);
}

/** The achievements that hold now and have no stamp yet are stamped with `day`. A day off the calendar stamps nothing. */
export function stamp(book: RecordBook, day: Day): RecordBook {
  if (dayNumber(day) === null) return book;
  if (ACHIEVEMENTS.every((achievement) => book.stamps[achievement.id] !== undefined)) return book;
  const view = viewOf(book);
  let stamps: Partial<Record<AchievementId, Day>> | null = null;
  for (const achievement of ACHIEVEMENTS) {
    if (book.stamps[achievement.id] !== undefined || !achievement.earned(view)) continue;
    stamps ??= { ...book.stamps };
    stamps[achievement.id] = day;
  }
  return stamps ? { ...book, stamps } : book;
}

/** The achievements `after` has a stamp for and `before` had none, in the sheet's order. */
export const newStamps = (before: RecordBook, after: RecordBook): AchievementId[] =>
  ACHIEVEMENT_IDS.filter((id) => after.stamps[id] !== undefined && before.stamps[id] === undefined);

/** Counts what happened into the book's own device's row, and raises the bests. The same book comes back when nothing in it changed. */
function count(book: RecordBook, events: readonly Counted[]): RecordBook {
  let counts: Partial<Record<CounterId, number>> | null = null;
  let bests: Partial<Record<BestId, number>> | null = null;
  for (const event of events) {
    for (const id of COUNTER_IDS) {
      const added = COUNTERS[id](event);
      if (!(added > 0)) continue;
      counts ??= { ...rowOf(book.counters, book.device) };
      counts[id] = Math.min(LIMITS.count, (counts[id] ?? 0) + Math.floor(added));
    }
    for (const id of BEST_IDS) {
      const reached = Math.min(LIMITS.count, Math.floor(BESTS[id](event)));
      if (!(reached > ((bests ?? book.bests)[id] ?? 0))) continue;
      bests ??= { ...book.bests };
      bests[id] = reached;
    }
  }
  if (!counts && !bests) return book;
  // The book's own row may be new, and one row more than the book has room for: another device's gives way, never this one's.
  return { ...book, counters: counts ? roomFor({ ...book.counters, [book.device]: counts }, book.device) : book.counters, bests: bests ?? book.bests };
}

/**
 * The book after `events`, which happened on `day`. A day counts as played
 * once a medal has been fed on it. Whatever the events earned is stamped. The
 * same book comes back when nothing in it changed, which is most frames.
 */
export function record(book: RecordBook, events: readonly RecordEvent[], day: Day): RecordBook {
  if (events.length === 0) return book;
  let next = count(book, events);
  if (events.some((event) => event.type === 'fed' && event.count > 0)) {
    const played = addDay(next.played, day);
    if (played !== next.played) next = { ...next, played };
  }
  return next === book ? book : stamp(next, day);
}

// ── The daily bonus ─────────────────────────────────────────────────────────

/**
 * What each square of the bonus card gives, the first day's first. A week
 * comes to 480 medals: the first day is a third of the hundred a machine
 * starts with, and the seventh, the largest, is half of the smallest jackpot.
 */
export const BONUS_CARD = [30, 40, 50, 60, 70, 80, 150] as const;

/** The bonus card as it stands on a day. */
export interface BonusCard {
  /**
   * `ready`: today's bonus can be taken. `taken`: it has been. `later`: the
   * card's last stamp is for a day after today, which a clock that was put
   * forward and back again leaves behind, so nothing is ready until the day
   * after that one. `off`: today is not a day on the calendar.
   */
  state: 'ready' | 'taken' | 'later' | 'off';
  /** How many squares are stamped, and the day each was, the first square's first. */
  stamped: number;
  days: Day[];
  /** Today's square, 1 to 7: the one to stamp, or the one that was. 0 when today has none. */
  today: number;
  /** Medals today's bonus gives, or gave. 0 when today has none. */
  medals: number;
  /** Medals the next bonus after that gives, and the first day it can be taken. */
  next: number;
  nextDay: Day | null;
  /** Whether a missed day has started the card again. */
  restarted: boolean;
}

/** The squares stamped by a run of days: the run's last day is the last stamp, and every seven days fill a card. */
const stampedBy = (run: number): number => (run === 0 ? 0 : ((run - 1) % BONUS_CARD.length) + 1);

/**
 * The card on `day`. It is worked out from the days the bonus was taken and
 * nothing else: the run of days in a row that ends with the latest of them
 * fills the card, seven to a card. Taken the day after, the run goes on.
 * After a missed day the card is a new one.
 */
export function cardFor(book: RecordBook, day: Day): BonusCard {
  const today = dayNumber(day);
  const last = lastIn(book.claimed);
  const size = BONUS_CARD.length;
  const standing = (state: 'taken' | 'later' | 'off', latest: number): BonusCard => {
    const stamped = stampedBy(runEnding(book.claimed, latest));
    return {
      state,
      stamped,
      days: Array.from({ length: stamped }, (_, square) => dayOf(latest - (stamped - 1 - square))),
      today: state === 'taken' ? stamped : 0,
      medals: state === 'taken' ? BONUS_CARD[stamped - 1] : 0,
      next: BONUS_CARD[stamped % size],
      nextDay: latest + 1 <= LIMITS.lastDay ? dayOf(latest + 1) : null,
      restarted: false,
    };
  };
  if (today === null) {
    return last === null ? { state: 'off', stamped: 0, days: [], today: 0, medals: 0, next: BONUS_CARD[0], nextDay: null, restarted: false } : standing('off', last);
  }
  if (last !== null && today === last) return standing('taken', last);
  if (last !== null && today < last) return standing('later', last);
  // Today's is still to be taken. It carries on from yesterday's if yesterday's was taken, and a full card is followed by a new one.
  const carried = last !== null && today === last + 1 ? stampedBy(runEnding(book.claimed, last)) % size : 0;
  return {
    state: 'ready',
    stamped: carried,
    days: Array.from({ length: carried }, (_, square) => dayOf(today - (carried - square))),
    today: carried + 1,
    medals: BONUS_CARD[carried],
    next: BONUS_CARD[(carried + 1) % size],
    nextDay: today + 1 <= LIMITS.lastDay ? dayOf(today + 1) : null,
    restarted: last !== null && today > last + 1,
  };
}

/**
 * The book with `day`'s bonus spent: the day is stamped on the card and
 * counted as played. Nothing is counted as paid. This is the half of taking a
 * bonus that has to be written down before any medal is given.
 */
export const spendDay = (book: RecordBook, day: Day): RecordBook => ({ ...book, claimed: addDay(book.claimed, day), played: addDay(book.played, day) });

/**
 * The book with a bonus of `medals` counted, on `day`: one more bonus taken,
 * and its medals as bonus medals. They are not fed, won or paid, so no return
 * in the book changes. This is the other half, for once the medals are given.
 */
export const countBonus = (book: RecordBook, medals: number, day: Day): RecordBook => stamp(count(book, [{ type: 'claimed', medals }]), day);

/**
 * Takes the bonus for `day`, if it is there to take: the day is spent and the
 * bonus counted, in one. The same book comes back, with no medals, when there
 * is nothing to take.
 */
export function claim(book: RecordBook, day: Day): { book: RecordBook; medals: number } {
  const card = cardFor(book, day);
  if (card.state !== 'ready') return { book, medals: 0 };
  return { book: countBonus(spendDay(book, day), card.medals, day), medals: card.medals };
}

// ── Two copies of one book ──────────────────────────────────────────────────

/** What one device has counted in all: how much its row is worth keeping. */
const weight = (counts: Counts): number => COUNTER_IDS.reduce((sum, id) => sum + (counts[id] ?? 0), 0);

/** The rows a book has room for: its own device's, and of the others the ones that have counted most. */
function roomFor(counters: Readonly<Record<string, Counts>>, own: string): Readonly<Record<string, Counts>> {
  const devices = Object.keys(counters);
  if (devices.length <= LIMITS.devices) return counters;
  const mine = rowOf(counters, own) !== undefined;
  const kept = devices
    .filter((device) => device !== own)
    .sort((a, b) => weight(counters[b]) - weight(counters[a]) || (a < b ? -1 : 1))
    .slice(0, LIMITS.devices - (mine ? 1 : 0));
  if (mine) kept.push(own);
  return Object.fromEntries(kept.sort().map((device) => [device, counters[device]]));
}

/** Two copies of one device's row: for each counter the larger, which is the later. */
function laterCounts(a: Counts | undefined, b: Counts | undefined): Counts {
  if (!a || !b) return a ?? b ?? {};
  const later: Partial<Record<CounterId, number>> = {};
  for (const id of COUNTER_IDS) {
    const most = Math.max(a[id] ?? 0, b[id] ?? 0);
    if (most > 0) later[id] = most;
  }
  return later;
}

/**
 * Two copies of one player's book as one, kept as the first one's device. A
 * copy from before the records were last cleared gives way to the other,
 * except for the days it took the bonus. See the top of the file for why
 * nothing is lost and nothing counted twice.
 */
export function mergeBooks(a: RecordBook, b: RecordBook): RecordBook {
  const claimed = unionDays(a.claimed, b.claimed);
  if (a.era !== b.era) return { ...(a.era > b.era ? a : b), device: a.device, claimed };

  const counters: Record<string, Counts> = {};
  for (const device of [...new Set([...Object.keys(a.counters), ...Object.keys(b.counters)])].sort()) {
    counters[device] = laterCounts(rowOf(a.counters, device), rowOf(b.counters, device));
  }
  const bests: Partial<Record<BestId, number>> = {};
  for (const id of BEST_IDS) {
    const most = Math.max(a.bests[id] ?? 0, b.bests[id] ?? 0);
    if (most > 0) bests[id] = most;
  }
  const stamps: Partial<Record<AchievementId, Day>> = {};
  for (const id of ACHIEVEMENT_IDS) {
    const [first, second] = [a.stamps[id], b.stamps[id]];
    const earlier = first !== undefined && second !== undefined ? (first <= second ? first : second) : (first ?? second);
    if (earlier !== undefined) stamps[id] = earlier;
  }
  return { v: RECORDS_VERSION, device: a.device, era: a.era, counters: roomFor(counters, a.device), bests, stamps, played: unionDays(a.played, b.played), claimed };
}

/**
 * The book to write when the stored one may have moved on since this page
 * last read it, which is what a second tab of the game does. Two tabs on one
 * device count into the same row, so the larger of the two is not the sum:
 * what this page has counted since it last read or wrote, `mine` less `base`,
 * is added to what is stored now. Everything else joins as two copies do.
 */
export function rebase(stored: RecordBook, mine: RecordBook, base: RecordBook): RecordBook {
  const joined = mergeBooks(mine, stored);
  if (stored.era !== mine.era || stored.device !== mine.device) return joined;
  const now = rowOf(mine.counters, mine.device) ?? {};
  const then = (base.era === mine.era ? rowOf(base.counters, mine.device) : undefined) ?? {};
  const there = rowOf(stored.counters, mine.device) ?? {};
  const row: Partial<Record<CounterId, number>> = {};
  for (const id of COUNTER_IDS) {
    const since = Math.max(0, (now[id] ?? 0) - (then[id] ?? 0));
    const total = Math.min(LIMITS.count, Math.max(now[id] ?? 0, Math.max(there[id] ?? 0, then[id] ?? 0) + since));
    if (total > 0) row[id] = total;
  }
  return Object.keys(row).length > 0 ? { ...joined, counters: roomFor({ ...joined.counters, [mine.device]: row }, mine.device) } : joined;
}

/**
 * The book with its records cleared: the counts, the bests, the stamps and
 * the days played. The days the bonus was taken stay, so clearing the records
 * is not a way to take a day's bonus again. It is a new era, so that a copy
 * elsewhere, from before, does not bring the old records back.
 */
export const clearBook = (book: RecordBook): RecordBook => ({ ...createBook(book.device), era: Math.min(LIMITS.eras, book.era + 1), claimed: book.claimed });

// ── Text ────────────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** A stored count: a whole number above zero, and no more than the most a book counts. Anything else is nothing. */
const counted = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.min(LIMITS.count, Math.floor(value)) : 0);

function readCounts(value: unknown): Counts {
  const counts: Partial<Record<CounterId, number>> = {};
  if (!isRecord(value)) return counts;
  for (const id of COUNTER_IDS) {
    const total = counted(value[id]);
    if (total > 0) counts[id] = total;
  }
  return counts;
}

/** A stored set of days: the months that are real months of the calendar, each with only days that month has. */
function readDays(value: unknown): DaySet {
  const days: Record<string, number> = {};
  if (!isRecord(value)) return days;
  for (const [month, stored] of Object.entries(value)) {
    const parts = MONTH_SHAPE.exec(month);
    if (!parts || typeof stored !== 'number' || !Number.isInteger(stored) || stored <= 0 || stored >= 2 ** 31) continue;
    const [year, number] = [Number(parts[1]), Number(parts[2])];
    if (number < 1 || number > 12) continue;
    let real = 0;
    for (let date = 1; date <= 31; date++) if ((stored & (1 << (date - 1))) !== 0 && dayNumber(dayFrom(year, number, date)) !== null) real |= 1 << (date - 1);
    if (real !== 0) days[month] = real;
  }
  return latestMonths(days);
}

/** A set of days with its months in order. */
const inOrder = (set: DaySet): DaySet => Object.fromEntries(Object.keys(set).sort().map((month) => [month, set[month]]));

/**
 * The book as text. It is always laid out the same way: the devices by name,
 * the months in order, and everything else in the order of the tables above.
 * Two copies that hold the same things are the same text.
 */
export function serializeBook(book: RecordBook): string {
  const counters: Record<string, Counts> = {};
  for (const device of Object.keys(book.counters).sort()) {
    const row: Partial<Record<CounterId, number>> = {};
    for (const id of COUNTER_IDS) if ((book.counters[device][id] ?? 0) > 0) row[id] = book.counters[device][id];
    if (Object.keys(row).length > 0) counters[device] = row;
  }
  const bests: Partial<Record<BestId, number>> = {};
  for (const id of BEST_IDS) if ((book.bests[id] ?? 0) > 0) bests[id] = book.bests[id];
  const stamps: Partial<Record<AchievementId, Day>> = {};
  for (const id of ACHIEVEMENT_IDS) if (book.stamps[id] !== undefined) stamps[id] = book.stamps[id];
  const tidy: RecordBook = { v: RECORDS_VERSION, device: book.device, era: book.era, counters, bests, stamps, played: inOrder(book.played), claimed: inOrder(book.claimed) };
  return JSON.stringify(tidy);
}

/**
 * Reads a book back. Text that is not a book at all (not this version, or
 * with no device to its name) gives null. Inside a book, whatever is not what
 * it should be is left out and whatever is too large is brought down to the
 * most a book holds, so the rest of a damaged book is still the player's.
 */
export function parseBook(text: unknown): RecordBook | null {
  if (typeof text !== 'string' || text.length > LIMITS.length) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== RECORDS_VERSION || !isDevice(value.device)) return null;
  const device = value.device;

  const counters: Record<string, Counts> = {};
  if (isRecord(value.counters)) {
    for (const [name, stored] of Object.entries(value.counters)) {
      if (!isDevice(name)) continue;
      const counts = readCounts(stored);
      if (Object.keys(counts).length > 0) counters[name] = counts;
    }
  }
  const bests: Partial<Record<BestId, number>> = {};
  const stamps: Partial<Record<AchievementId, Day>> = {};
  if (isRecord(value.bests)) {
    for (const id of BEST_IDS) {
      const most = counted(value.bests[id]);
      if (most > 0) bests[id] = most;
    }
  }
  if (isRecord(value.stamps)) {
    for (const id of ACHIEVEMENT_IDS) {
      const day = value.stamps[id];
      if (typeof day === 'string' && dayNumber(day) !== null) stamps[id] = day;
    }
  }
  const era = typeof value.era === 'number' && Number.isInteger(value.era) && value.era >= 0 ? Math.min(LIMITS.eras, value.era) : 0;
  return { v: RECORDS_VERSION, device, era, counters: roomFor(counters, device), bests, stamps, played: readDays(value.played), claimed: readDays(value.claimed) };
}
