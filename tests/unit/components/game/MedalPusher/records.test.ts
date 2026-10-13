import { describe, expect, it } from 'vitest';

import { seededRng } from '@/components/game/MedalPusher/engine';
import { CHAIN_GOAL, CHESTS, JACKPOT_START } from '@/components/game/MedalPusher/lottery';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  BESTS,
  BEST_IDS,
  BONUS_CARD,
  COUNTERS,
  COUNTER_IDS,
  LIMITS,
  MANY_MEDALS,
  RECORDS_KEY,
  RECORDS_VERSION,
  WEEK,
  addDay,
  cardFor,
  claim,
  clearBook,
  countDays,
  createBook,
  currentStreak,
  dayFrom,
  dayNumber,
  dayOf,
  daysIn,
  hasDay,
  isDevice,
  lastIn,
  lifetimeReturn,
  longestRun,
  mergeBooks,
  newStamps,
  parseBook,
  rebase,
  record,
  rowOf,
  runEnding,
  serializeBook,
  stamp,
  unionDays,
  viewOf,
  type CounterId,
  type Day,
  type DaySet,
  type RecordBook,
  type RecordEvent,
} from '@/components/game/MedalPusher/records';
import { MAX_STOCK, START_CREDITS, createSession, grant, type SessionEvent } from '@/components/game/MedalPusher/session';
import { STORAGE_KEY, restore, serialize } from '@/components/game/MedalPusher/storage';

const MONDAY: Day = '2026-10-12';
/** The day `days` after a Monday in October. */
const after = (days: number): Day => dayOf((dayNumber(MONDAY) as number) + days);

const spin = (tier: 'miss' | 'small' | 'big' | 'seven', reachKind: 'none' | 'normal' | 'long' = tier === 'miss' ? 'none' : 'normal'): SessionEvent => ({
  type: 'spinEnd',
  result: { tier, digits: [1, 1, 1], reach: reachKind !== 'none', reachKind },
});
const fed = (count: number): RecordEvent => ({ type: 'fed', count });
const won = (count: number): RecordEvent => ({ type: 'won', count });
/** The book's figures, as it shows them. */
const totals = (book: RecordBook) => viewOf(book).total;
/** A book with the bonus taken on each of these days, in order. */
const taking = (days: Day[], book = createBook('device0001')): RecordBook => days.reduce((kept, day) => claim(kept, day).book, book);
/** What two copies hold, laid out the one way: a book but for whose device it is. */
const holding = (book: RecordBook): string => serializeBook({ ...book, device: 'whoever000' });

describe('a day', () => {
  it('is a real date on the calendar, numbered so that each is one more than the day before', () => {
    expect(dayNumber('1970-01-01')).toBeNull();
    expect(dayNumber('2026-10-12')).toBe(Date.UTC(2026, 9, 12) / 86_400_000);
    expect(dayNumber('2026-10-13')).toBe((dayNumber('2026-10-12') as number) + 1);
    // Over the end of a month, of a year, and of a February with and without its extra day.
    expect(dayNumber('2026-11-01')).toBe((dayNumber('2026-10-31') as number) + 1);
    expect(dayNumber('2027-01-01')).toBe((dayNumber('2026-12-31') as number) + 1);
    expect(dayNumber('2028-03-01')).toBe((dayNumber('2028-02-29') as number) + 1);
    expect(dayNumber('2027-03-01')).toBe((dayNumber('2027-02-28') as number) + 1);
  });

  it('is nothing when it is not a date, or not one the book’s calendar has', () => {
    for (const nonsense of ['', 'today', '2026-10-1', '2026-13-01', '2026-02-30', '2027-02-29', '2026-00-10', '26-10-12', '2026/10/12', ' 2026-10-12', '2026-10-12T00:00']) {
      expect(dayNumber(nonsense), nonsense).toBeNull();
    }
    for (const notText of [null, undefined, 20738, {}, []]) expect(dayNumber(notText)).toBeNull();
    // A clock set wildly wrong is off the calendar at either end.
    expect(dayNumber('2019-12-31')).toBeNull();
    expect(dayNumber('2020-01-01')).toBe(LIMITS.firstDay);
    expect(dayNumber('2099-12-31')).toBe(LIMITS.lastDay);
    expect(dayNumber('2100-01-01')).toBeNull();
  });

  it('reads back from its number as it was written', () => {
    for (const day of ['2020-01-01', '2024-02-29', '2026-10-12', '2026-12-31', '2099-12-31']) expect(dayOf(dayNumber(day) as number)).toBe(day);
    expect(dayFrom(2026, 3, 7)).toBe('2026-03-07');
  });
});

describe('a set of days', () => {
  const days = (...list: Day[]): DaySet => list.reduce<DaySet>((set, day) => addDay(set, day), {});

  it('holds the days put into it and no others', () => {
    const set = days('2026-10-12', '2026-10-14', '2026-11-01');
    expect(hasDay(set, '2026-10-12')).toBe(true);
    expect(hasDay(set, '2026-10-13')).toBe(false);
    expect(hasDay(set, '2026-11-01')).toBe(true);
    expect(hasDay(set, 'nonsense')).toBe(false);
    expect(countDays(set)).toBe(3);
    expect(daysIn(set).map(dayOf)).toEqual(['2026-10-12', '2026-10-14', '2026-11-01']);
    expect(dayOf(lastIn(set) as number)).toBe('2026-11-01');
    expect(lastIn({})).toBeNull();
  });

  it('is one short number for each month, and is not changed by a day it has or a day that is no day', () => {
    const set = days('2026-10-01', '2026-10-31');
    expect(set).toEqual({ '2026-10': 1 + 2 ** 30 });
    expect(addDay(set, '2026-10-31')).toBe(set);
    expect(addDay(set, '2026-02-30')).toBe(set);
    expect(addDay(set, '2150-01-01')).toBe(set);
    // A month played right through is still one number, and a positive one.
    let october: DaySet = {};
    for (let date = 1; date <= 31; date++) october = addDay(october, dayFrom(2026, 10, date));
    expect(october).toEqual({ '2026-10': 2 ** 31 - 1 });
    expect(countDays(october)).toBe(31);
  });

  it('joins with another into every day that is in either', () => {
    const a = days('2026-10-12', '2026-10-13');
    const b = days('2026-10-13', '2026-10-20', '2026-12-25');
    const joined = unionDays(a, b);
    expect(daysIn(joined).map(dayOf)).toEqual(['2026-10-12', '2026-10-13', '2026-10-20', '2026-12-25']);
    expect(unionDays(b, a)).toEqual(joined);
    expect(unionDays(joined, a)).toEqual(joined);
    expect(unionDays(a, {})).toEqual(a);
  });

  it('counts runs of days in a row, over the ends of months and years', () => {
    const set = days('2026-10-30', '2026-10-31', '2026-11-01', '2026-11-03', '2026-12-31', '2027-01-01');
    expect(runEnding(set, dayNumber('2026-11-01') as number)).toBe(3);
    expect(runEnding(set, dayNumber('2026-11-02') as number)).toBe(0);
    expect(runEnding(set, dayNumber('2026-11-03') as number)).toBe(1);
    expect(runEnding(set, dayNumber('2027-01-01') as number)).toBe(2);
    expect(longestRun(set)).toBe(3);
    expect(longestRun({})).toBe(0);
  });

  it('remembers only its latest months once it has more than a book keeps', () => {
    let set: DaySet = {};
    for (let month = 0; month < LIMITS.months + 5; month++) set = addDay(set, dayFrom(2020 + Math.floor(month / 12), (month % 12) + 1, 15));
    expect(Object.keys(set)).toHaveLength(LIMITS.months);
    expect(hasDay(set, '2020-01-15')).toBe(false);
    expect(hasDay(set, '2020-06-15')).toBe(true);
    expect(hasDay(set, dayFrom(2020 + Math.floor((LIMITS.months + 4) / 12), ((LIMITS.months + 4) % 12) + 1, 15))).toBe(true);
  });
});

describe('recording what the machine did', () => {
  const book = createBook('device0001');

  it('counts each thing the machine says under its own name', () => {
    const events: RecordEvent[] = [
      fed(12),
      won(9),
      { type: 'lost', count: 2 },
      { type: 'landed', count: 30 },
      { type: 'checker', gate: 0, held: true },
      { type: 'checker', gate: 1, held: true },
      { type: 'checker', gate: 2, held: false },
      { type: 'holdFull' },
      { type: 'spinStart', result: { tier: 'miss', digits: [1, 2, 3], reach: false, reachKind: 'none' }, duration: 1.6 },
      spin('miss'),
      spin('miss', 'normal'),
      spin('miss', 'long'),
      spin('small', 'normal'),
      spin('big', 'long'),
      spin('seven', 'long'),
      { type: 'sugorokuStart', roll: 3, from: 0 },
      { type: 'sugorokuEnd', square: 3, payout: 8, fever: false },
      { type: 'sugorokuEnd', square: 7, payout: 30, fever: true },
      { type: 'chestStart' },
      { type: 'chestPicked', chest: 1 },
      { type: 'chestEnd', chest: 1, payout: 10 },
      { type: 'chestEnd', chest: 0, payout: Math.max(...CHESTS) },
      { type: 'toppled', count: 2 },
      { type: 'ball', count: 1 },
      { type: 'rouletteStart', pocket: 1, duration: 2.8 },
      { type: 'rouletteStep', pocket: 1, medals: 10, level: 1 },
      { type: 'rouletteStep', pocket: 2, medals: 20, level: 2 },
      { type: 'rouletteEnd', total: 30, level: 2 },
      { type: 'refill', count: 1 },
    ];
    const next = record(book, events, MONDAY);
    expect(totals(next)).toEqual({
      fed: 12,
      won: 9,
      lost: 2,
      hits: 3,
      wasted: 1,
      fulls: 1,
      spins: 6,
      reaches: 5,
      supers: 3,
      small: 1,
      big: 1,
      seven: 1,
      superWins: 2,
      fevers: 1,
      chests: 2,
      topChests: 1,
      towers: 2,
      balls: 1,
      roulettes: 1,
      challenges: 0,
      jackpots: 0,
      refills: 1,
      claims: 0,
      bonus: 0,
    });
    // Every counter the book has is in that list: a new one has to be put there too.
    expect(Object.keys(totals(next)).sort()).toEqual([...COUNTER_IDS].sort());
    expect(viewOf(next).best).toEqual({ prize: 30, jackpot: 0, run: 2 });
    // It all went into this device's own row, and the book it was made from is as it was.
    expect(Object.keys(next.counters)).toEqual(['device0001']);
    expect(book.counters).toEqual({});
  });

  it('keeps the bests: the largest prize of one game, the largest jackpot and the longest run', () => {
    let next = record(book, [{ type: 'chestEnd', chest: 0, payout: 20 }], MONDAY);
    expect(viewOf(next).best.prize).toBe(20);
    next = record(next, [{ type: 'sugorokuEnd', square: 1, payout: 3, fever: false }], MONDAY);
    expect(viewOf(next).best.prize).toBe(20);
    // A full run and the jackpot's hole: the prize is the whole run, and the jackpot what the hole paid.
    const run: RecordEvent[] = [];
    for (let level = 1; level <= CHAIN_GOAL; level++) run.push({ type: 'rouletteStep', pocket: 2, medals: 20, level });
    run.push({ type: 'bowlStart', hole: 0, duration: 6.5 }, { type: 'bowlEnd', hole: 0, payout: JACKPOT_START + 12, total: JACKPOT_START + 12 + 80, jackpot: true });
    next = record(next, run, MONDAY);
    expect(viewOf(next).best).toEqual({ prize: JACKPOT_START + 92, jackpot: JACKPOT_START + 12, run: CHAIN_GOAL });
    expect(totals(next).challenges).toBe(1);
    expect(totals(next).jackpots).toBe(1);
    // A hole that is not the jackpot's is a prize and no jackpot, and a smaller one changes nothing.
    next = record(next, [{ type: 'bowlEnd', hole: 1, payout: 50, total: 130, jackpot: false }], MONDAY);
    expect(viewOf(next).best).toEqual({ prize: JACKPOT_START + 92, jackpot: JACKPOT_START + 12, run: CHAIN_GOAL });
    expect(totals(next).jackpots).toBe(1);
    expect(Object.keys(viewOf(next).best).sort()).toEqual([...BEST_IDS].sort());
  });

  it('gives back the very same book when nothing in it changed, which is most frames', () => {
    expect(record(book, [], MONDAY)).toBe(book);
    expect(record(book, [{ type: 'landed', count: 4 }], MONDAY)).toBe(book);
    expect(record(book, [{ type: 'bonus', count: 30 }, { type: 'chestStart' }, { type: 'chestPicked', chest: 0 }, { type: 'sugorokuStart', roll: 1, from: 0 }], MONDAY)).toBe(book);
    expect(record(book, [fed(0), won(0)], MONDAY)).toBe(book);
  });

  it('counts a day as played once a medal has been fed on it, and not for what the field did by itself', () => {
    const idle = record(book, [won(3), { type: 'checker', gate: 0, held: true }], MONDAY);
    expect(viewOf(idle).days).toBe(0);
    let played = record(idle, [fed(1)], MONDAY);
    played = record(played, [fed(5)], MONDAY);
    played = record(played, [fed(1)], after(1));
    played = record(played, [fed(1)], after(3));
    expect(viewOf(played).days).toBe(3);
    expect(viewOf(played).streak).toBe(2);
    expect(currentStreak(played, after(3))).toBe(1);
    // The run that is going is still going on a day that has not been played yet, and is over the day after.
    expect(currentStreak(played, after(4))).toBe(1);
    expect(currentStreak(played, after(5))).toBe(0);
    expect(currentStreak(played, 'nonsense')).toBe(0);
  });

  it('still counts when the day is off the calendar, but puts it on no calendar and stamps nothing with it', () => {
    const next = record(book, [fed(3), spin('small')], '2150-01-01');
    expect(totals(next).fed).toBe(3);
    expect(viewOf(next).days).toBe(0);
    expect(next.stamps).toEqual({});
    // The stamp it earned is pressed on the next real day.
    expect(stamp(next, MONDAY).stamps).toEqual({ firstLine: MONDAY });
  });

  it('stops at the most a book counts', () => {
    const next = record(record(book, [fed(LIMITS.count - 1)], MONDAY), [fed(5)], MONDAY);
    expect(totals(next).fed).toBe(LIMITS.count);
  });

  it('works out the lifetime return from what was fed and what came back, and not from free medals', () => {
    expect(lifetimeReturn(viewOf(book))).toBeNull();
    const played = record(book, [fed(200), won(170)], MONDAY);
    expect(lifetimeReturn(viewOf(played))).toBeCloseTo(0.85, 12);
    const withBonus = claim(played, MONDAY).book;
    expect(lifetimeReturn(viewOf(withBonus))).toBeCloseTo(0.85, 12);
    expect(totals(withBonus).fed).toBe(200);
    expect(totals(withBonus).won).toBe(170);
  });
});

describe('the achievements', () => {
  const book = createBook('device0001');
  const earnedBy = (events: RecordEvent[], day = MONDAY) => Object.keys(record(book, events, day).stamps);

  it('are a dozen, each with a name of its own', () => {
    expect(ACHIEVEMENTS).toHaveLength(12);
    expect(new Set(ACHIEVEMENT_IDS).size).toBe(ACHIEVEMENTS.length);
  });

  it('are each earned by the thing they are for, and by nothing less', () => {
    expect(earnedBy([spin('miss', 'long'), fed(10)])).toEqual([]);
    expect(earnedBy([spin('small')])).toEqual(['firstLine']);
    expect(earnedBy([spin('big')])).toEqual(['firstLine']);
    expect(earnedBy([{ type: 'holdFull' }])).toEqual(['holdFull']);
    // A medal turned away by a full hold is not the hold filling: the cabinet says that itself.
    expect(earnedBy([{ type: 'checker', gate: 0, held: false }])).toEqual([]);
    expect(earnedBy([spin('small', 'long')])).toEqual(['firstLine', 'superWin']);
    expect(earnedBy([{ type: 'sugorokuEnd', square: 7, payout: 30, fever: true }])).toEqual(['fever']);
    expect(earnedBy([{ type: 'chestEnd', chest: 0, payout: Math.max(...CHESTS) }])).toEqual(['treasure']);
    expect(earnedBy([{ type: 'chestEnd', chest: 0, payout: Math.max(...CHESTS) - 10 }])).toEqual([]);
    expect(earnedBy([{ type: 'toppled', count: 1 }])).toEqual(['tower']);
    expect(earnedBy([spin('seven')])).toEqual(['firstLine', 'sevens']);
    expect(earnedBy([{ type: 'ball', count: 1 }])).toEqual(['ball']);
    expect(earnedBy([{ type: 'rouletteStep', pocket: 1, medals: 10, level: CHAIN_GOAL - 1 }])).toEqual([]);
    expect(earnedBy([{ type: 'rouletteStep', pocket: 1, medals: 10, level: CHAIN_GOAL }])).toEqual(['fullRun']);
    expect(earnedBy([{ type: 'bowlEnd', hole: 1, payout: 50, total: 90, jackpot: false }])).toEqual([]);
    expect(earnedBy([{ type: 'bowlEnd', hole: 0, payout: 300, total: 340, jackpot: true }])).toEqual(['jackpot']);
    expect(earnedBy([won(MANY_MEDALS - 1)])).toEqual([]);
    expect(earnedBy([won(MANY_MEDALS)])).toEqual(['thousand']);
  });

  it('are stamped with the day they were earned, once, and keep that day', () => {
    const first = record(book, [spin('small')], MONDAY);
    expect(first.stamps).toEqual({ firstLine: MONDAY });
    const later = record(first, [spin('big'), spin('seven')], after(3));
    expect(later.stamps).toEqual({ firstLine: MONDAY, sevens: after(3) });
    expect(newStamps(book, first)).toEqual(['firstLine']);
    expect(newStamps(first, later)).toEqual(['sevens']);
    expect(newStamps(later, later)).toEqual([]);
  });

  it('gives a stamp for a week of days in a row, and not for seven days with a gap', () => {
    let gappy = book;
    for (const days of [0, 1, 2, 3, 5, 6, 7]) gappy = record(gappy, [fed(1)], after(days));
    expect(gappy.stamps.week).toBeUndefined();
    let steady = book;
    for (let days = 0; days < WEEK; days++) {
      expect(steady.stamps.week).toBeUndefined();
      steady = record(steady, [fed(1)], after(days));
    }
    expect(steady.stamps.week).toBe(after(WEEK - 1));
    // Taking the bonus is a visit too: a card filled without a medal fed is a week.
    expect(taking(Array.from({ length: WEEK }, (_, days) => after(days))).stamps.week).toBe(after(WEEK - 1));
  });

  it('every counter and every best can be read off an event, and none reads a thing from one it is not for', () => {
    for (const id of COUNTER_IDS) expect(COUNTERS[id]({ type: 'landed', count: 3 })).toBe(0);
    for (const id of BEST_IDS) expect(BESTS[id]({ type: 'landed', count: 3 })).toBe(0);
  });
});

describe('the daily bonus card', () => {
  const book = createBook('device0001');

  it('gives more each day, most on the seventh, and its sizes are worth coming back for but small beside a jackpot', () => {
    expect(BONUS_CARD).toHaveLength(WEEK);
    for (let square = 1; square < BONUS_CARD.length; square++) expect(BONUS_CARD[square]).toBeGreaterThan(BONUS_CARD[square - 1]);
    // The first is a good part of what a machine starts with; the largest is no more than half the smallest jackpot.
    expect(BONUS_CARD[0]).toBeGreaterThanOrEqual(START_CREDITS / 4);
    expect(BONUS_CARD[0]).toBeLessThan(START_CREDITS);
    expect(Math.max(...BONUS_CARD)).toBeLessThanOrEqual(JACKPOT_START / 2);
    expect(BONUS_CARD.reduce((sum, medals) => sum + medals, 0)).toBe(480);
  });

  it('starts with its first square ready and nothing stamped', () => {
    expect(cardFor(book, MONDAY)).toEqual({ state: 'ready', stamped: 0, days: [], today: 1, medals: BONUS_CARD[0], next: BONUS_CARD[1], nextDay: after(1), restarted: false });
  });

  it('is stamped once a day, a square further each day in a row, and pays what the square says', () => {
    let kept = book;
    let paid = 0;
    for (let days = 0; days < WEEK; days++) {
      const before = cardFor(kept, after(days));
      expect(before.state).toBe('ready');
      expect(before.today).toBe(days + 1);
      expect(before.stamped).toBe(days);
      expect(before.medals).toBe(BONUS_CARD[days]);
      expect(before.days).toEqual(Array.from({ length: days }, (_, square) => after(square)));
      const taken = claim(kept, after(days));
      expect(taken.medals).toBe(BONUS_CARD[days]);
      paid += taken.medals;
      kept = taken.book;
      // It is not there to take a second time that day.
      expect(claim(kept, after(days))).toEqual({ book: kept, medals: 0 });
      const standing = cardFor(kept, after(days));
      expect(standing.state).toBe('taken');
      expect(standing.stamped).toBe(days + 1);
      expect(standing.today).toBe(days + 1);
      expect(standing.medals).toBe(BONUS_CARD[days]);
      expect(standing.next).toBe(BONUS_CARD[(days + 1) % WEEK]);
      expect(standing.nextDay).toBe(after(days + 1));
    }
    expect(paid).toBe(480);
    expect(totals(kept).bonus).toBe(480);
    expect(totals(kept).claims).toBe(WEEK);
    expect(cardFor(kept, after(WEEK - 1)).days).toEqual(Array.from({ length: WEEK }, (_, square) => after(square)));
  });

  it('begins a new card the day after the seventh, and goes on from there', () => {
    const week = taking(Array.from({ length: WEEK }, (_, days) => after(days)));
    const eighth = cardFor(week, after(WEEK));
    expect(eighth).toMatchObject({ state: 'ready', stamped: 0, today: 1, medals: BONUS_CARD[0], restarted: false });
    const ninth = cardFor(claim(week, after(WEEK)).book, after(WEEK + 1));
    expect(ninth).toMatchObject({ state: 'ready', stamped: 1, today: 2, medals: BONUS_CARD[1], days: [after(WEEK)] });
    // A fortnight without a break is two full cards.
    const fortnight = taking(Array.from({ length: 2 * WEEK }, (_, days) => after(days)));
    expect(cardFor(fortnight, after(2 * WEEK - 1))).toMatchObject({ state: 'taken', stamped: WEEK, medals: BONUS_CARD[WEEK - 1] });
    expect(totals(fortnight).bonus).toBe(960);
  });

  it('starts again after a missed day, and says so', () => {
    const three = taking([after(0), after(1), after(2)]);
    expect(cardFor(three, after(3))).toMatchObject({ state: 'ready', stamped: 3, today: 4, medals: BONUS_CARD[3], restarted: false });
    const missed = cardFor(three, after(4));
    expect(missed).toEqual({ state: 'ready', stamped: 0, days: [], today: 1, medals: BONUS_CARD[0], next: BONUS_CARD[1], nextDay: after(5), restarted: true });
    expect(claim(three, after(4)).medals).toBe(BONUS_CARD[0]);
    expect(cardFor(three, after(40))).toMatchObject({ state: 'ready', stamped: 0, today: 1, restarted: true });
  });

  it('counts the day the bonus is taken as a day played', () => {
    const taken = claim(book, MONDAY).book;
    expect(viewOf(taken).days).toBe(1);
    expect(hasDay(taken.claimed, MONDAY)).toBe(true);
    expect(hasDay(taken.played, MONDAY)).toBe(true);
  });

  it('does not pay a day twice when the clock is put forward and back, and the card is still a card', () => {
    // Monday's is taken. The clock goes forward to Thursday, where a missed day makes it a new card, and that is taken too.
    let kept = claim(book, MONDAY).book;
    const ahead = claim(kept, after(3));
    expect(ahead.medals).toBe(BONUS_CARD[0]);
    kept = ahead.book;
    // Back on Monday, and on the days between, nothing is ready, and the card shows what it holds: Thursday's stamp.
    for (const days of [0, 1, 2]) {
      const card = cardFor(kept, after(days));
      expect(card).toEqual({ state: 'later', stamped: 1, days: [after(3)], today: 0, medals: 0, next: BONUS_CARD[1], nextDay: after(4), restarted: false });
      expect(claim(kept, after(days))).toEqual({ book: kept, medals: 0 });
    }
    // Thursday comes for real: it was taken already. Friday carries on from it.
    expect(cardFor(kept, after(3)).state).toBe('taken');
    expect(claim(kept, after(3)).medals).toBe(0);
    expect(claim(kept, after(4)).medals).toBe(BONUS_CARD[1]);
    // However the clock is thrown about, every day in the book was paid once.
    let thrown = book;
    let paid = 0;
    const rng = seededRng(11);
    for (let turn = 0; turn < 400; turn++) {
      const taken = claim(thrown, after(Math.floor(rng() * 30)));
      paid += taken.medals > 0 ? 1 : 0;
      thrown = taken.book;
    }
    expect(paid).toBe(countDays(thrown.claimed));
    expect(totals(thrown).claims).toBe(paid);
    expect(paid).toBeLessThanOrEqual(30);
  });

  it('has nothing for a day that is off the calendar', () => {
    expect(cardFor(book, 'nonsense')).toEqual({ state: 'off', stamped: 0, days: [], today: 0, medals: 0, next: BONUS_CARD[0], nextDay: null, restarted: false });
    expect(claim(book, 'nonsense')).toEqual({ book, medals: 0 });
    expect(claim(book, '2150-01-01').medals).toBe(0);
    const two = taking([after(0), after(1)]);
    expect(cardFor(two, '1999-01-01')).toMatchObject({ state: 'off', stamped: 2, today: 0, medals: 0, days: [after(0), after(1)] });
  });
});

describe('two copies of one book', () => {
  const phone = () => createBook('phone00001');
  const laptop = () => createBook('laptop0001');

  it('keep what each device counted apart, so what both knew already is not counted twice', () => {
    // The phone plays and the laptop gets a copy. Then each plays on by itself.
    const shared = record(phone(), [fed(10), won(8)], MONDAY);
    let onLaptop = mergeBooks(laptop(), shared);
    let onPhone = record(shared, [fed(5), won(1)], after(1));
    onLaptop = record(onLaptop, [fed(7), won(7)], after(1));
    const joined = mergeBooks(onPhone, onLaptop);
    expect(totals(joined).fed).toBe(22);
    expect(totals(joined).won).toBe(16);
    expect(joined.counters).toEqual({ laptop0001: { fed: 7, won: 7 }, phone00001: { fed: 15, won: 9 } });
    // The other way round it holds the same, and so does joining again, or joining a copy that is out of date.
    expect(holding(mergeBooks(onLaptop, onPhone))).toBe(holding(joined));
    expect(holding(mergeBooks(joined, onLaptop))).toBe(holding(joined));
    expect(holding(mergeBooks(joined, shared))).toBe(holding(joined));
    expect(holding(mergeBooks(joined, joined))).toBe(holding(joined));
    onPhone = mergeBooks(onPhone, onLaptop);
    expect(onPhone.device).toBe('phone00001');
    expect(mergeBooks(onLaptop, onPhone).device).toBe('laptop0001');
  });

  it('take the larger of two bests, the earlier of two dates for a stamp, and every day in either', () => {
    const a = record(record(phone(), [spin('small'), { type: 'chestEnd', chest: 0, payout: 30 }, fed(1)], after(2)), [fed(1)], after(3));
    const b = record(record(laptop(), [spin('big'), { type: 'rouletteStep', pocket: 1, medals: 50, level: 3 }, { type: 'rouletteEnd', total: 90, level: 3 }, fed(1)], MONDAY), [fed(1)], after(1));
    const joined = mergeBooks(a, b);
    expect(viewOf(joined).best).toEqual({ prize: 90, jackpot: 0, run: 3 });
    expect(joined.stamps).toEqual({ firstLine: MONDAY, treasure: after(2) });
    expect(viewOf(joined).days).toBe(4);
    // Two days here and two there were four in a row all along.
    expect(viewOf(a).streak).toBe(2);
    expect(viewOf(joined).streak).toBe(4);
    expect(holding(mergeBooks(b, a))).toBe(holding(joined));
  });

  it('join the days the bonus was taken, so a day one copy has taken is not paid from the other', () => {
    const a = taking([after(0), after(1)], phone());
    const b = taking([after(1)], laptop());
    const joined = mergeBooks(b, a);
    expect(countDays(joined.claimed)).toBe(2);
    expect(cardFor(joined, after(1)).state).toBe('taken');
    expect(claim(joined, after(1)).medals).toBe(0);
    // The card is the longer one: two stamps, and the third square tomorrow.
    expect(cardFor(joined, after(1)).stamped).toBe(2);
    expect(claim(joined, after(2)).medals).toBe(BONUS_CARD[2]);
    // What each device was really paid is still what it counted: both took Tuesday's before they met.
    expect(totals(joined).claims).toBe(3);
  });

  it('never bring back records that were cleared, and never forget a bonus that was taken', () => {
    const played = claim(record(phone(), [fed(50), won(40), spin('seven')], MONDAY), MONDAY).book;
    const onLaptop = mergeBooks(laptop(), played);
    const cleared = clearBook(played);
    expect(cleared.era).toBe(1);
    expect(totals(cleared).fed).toBe(0);
    expect(cleared.stamps).toEqual({});
    expect(viewOf(cleared).days).toBe(0);
    // Clearing is no way to take the day's bonus again.
    expect(claim(cleared, MONDAY).medals).toBe(0);
    expect(cardFor(cleared, MONDAY).state).toBe('taken');
    // The laptop's copy, from before, does not bring the old records back, whichever is joined to which.
    for (const joined of [mergeBooks(cleared, onLaptop), mergeBooks(onLaptop, cleared)]) {
      expect(joined.era).toBe(1);
      expect(totals(joined).fed).toBe(0);
      expect(joined.stamps).toEqual({});
      expect(hasDay(joined.claimed, MONDAY)).toBe(true);
    }
    // What the laptop took while it had not heard of the clearing is still taken afterwards.
    const laptopLater = claim(onLaptop, after(1)).book;
    const joined = mergeBooks(cleared, laptopLater);
    expect(claim(joined, after(1)).medals).toBe(0);
    expect(totals(joined).claims).toBe(0);
    // What is played after the clearing counts from nothing, on either device.
    const after1 = record(mergeBooks(laptop(), cleared), [fed(3)], after(2));
    expect(after1.era).toBe(1);
    expect(totals(mergeBooks(cleared, after1)).fed).toBe(3);
  });

  it('come to the same book however the copies meet: every count is there once, with three devices and an account between them', () => {
    const kinds: CounterId[] = ['fed', 'won', 'lost', 'spins', 'towers'];
    for (let schedule = 0; schedule < 16; schedule++) {
      const rng = seededRng(100 + schedule);
      const pick = (n: number) => Math.min(n - 1, Math.floor(rng() * n));
      const names = ['phone00001', 'laptop0001', 'tablet0001'];
      const copies = names.map((name) => createBook(name));
      // The account's copy belongs to no device: it only ever holds what the devices put there.
      let account = createBook('account001');
      const truth = Object.fromEntries(kinds.map((kind) => [kind, 0])) as Record<string, number>;
      const own = names.map(() => ({ ...truth }));
      const claimedDays = new Set<Day>();
      let best = 0;
      for (let turn = 0; turn < 50; turn++) {
        const who = pick(copies.length);
        const what = pick(6);
        if (what <= 1) {
          // Play: something is counted on this device.
          const kind = kinds[pick(kinds.length)];
          const count = 1 + pick(9);
          const event = kind === 'spins' ? spin('miss') : ({ type: kind === 'towers' ? 'toppled' : kind, count } as RecordEvent);
          const added = kind === 'spins' ? 1 : count;
          const prize = 1 + pick(400);
          copies[who] = record(copies[who], [event, { type: 'chestEnd', chest: 0, payout: prize }], after(pick(20)));
          truth[kind] += added;
          own[who][kind] += added;
          best = Math.max(best, prize);
        } else if (what === 2) {
          const day = after(pick(20));
          if (claim(copies[who], day).medals > 0) claimedDays.add(day);
          copies[who] = claim(copies[who], day).book;
        } else if (what === 3) {
          // Two devices meet, one way only: the other does not hear back.
          const other = (who + 1 + pick(copies.length - 1)) % copies.length;
          copies[who] = mergeBooks(copies[who], copies[other]);
        } else if (what === 4) {
          // The account: this device takes in what is there, then puts back what it has.
          copies[who] = mergeBooks(copies[who], account);
          account = mergeBooks(account, copies[who]);
        } else {
          // An old copy turns up again and is put into the account as it was.
          account = mergeBooks(account, copies[who]);
        }
        // At no time has any copy more than was really counted, and each device's own row is exactly its own.
        for (let index = 0; index < copies.length; index++) {
          const shown = totals(copies[index]);
          const row = rowOf(copies[index].counters, names[index]);
          for (const kind of kinds) {
            expect(shown[kind]).toBeLessThanOrEqual(truth[kind]);
            expect(row?.[kind] ?? 0).toBe(own[index][kind]);
          }
        }
      }
      // Everybody meets everybody, through the account and directly, in whatever order.
      for (let round = 0; round < 2; round++) {
        for (let index = 0; index < copies.length; index++) {
          account = mergeBooks(account, copies[index]);
          copies[index] = mergeBooks(copies[index], account);
        }
      }
      for (const copy of copies) {
        for (const kind of kinds) expect(totals(copy)[kind]).toBe(truth[kind]);
        expect(viewOf(copy).best.prize).toBe(best);
        for (const day of claimedDays) expect(hasDay(copy.claimed, day)).toBe(true);
        expect(holding(copy)).toBe(holding(copies[0]));
        expect(holding(copy)).toBe(holding(account));
      }
      // Each claim was counted by the device that made it; a day taken on two devices before they met was paid on both.
      expect(totals(copies[0]).claims).toBeGreaterThanOrEqual(countDays(copies[0].claimed));
    }
  });

  it('is the same whichever way round three copies are joined', () => {
    const rng = seededRng(5);
    for (let trial = 0; trial < 40; trial++) {
      const [a, b, c] = ['phone00001', 'laptop0001', 'tablet0001'].map((name) => {
        let book = createBook(name);
        for (let turn = 0; turn < 5; turn++) {
          book = record(book, [fed(1 + Math.floor(rng() * 9)), won(Math.floor(rng() * 9)), spin(rng() < 0.3 ? 'small' : 'miss')], after(Math.floor(rng() * 12)));
          if (rng() < 0.5) book = claim(book, after(Math.floor(rng() * 12))).book;
        }
        return book;
      });
      const one = holding(mergeBooks(mergeBooks(a, b), c));
      expect(holding(mergeBooks(a, mergeBooks(b, c)))).toBe(one);
      expect(holding(mergeBooks(mergeBooks(c, a), b))).toBe(one);
      expect(holding(mergeBooks(b, mergeBooks(c, a)))).toBe(one);
    }
  });

  it('has room for a few devices: its own, and of the others the ones that have counted most', () => {
    let book = record(phone(), [fed(1)], MONDAY);
    for (let other = 0; other < LIMITS.devices + 3; other++) {
      book = mergeBooks(book, record(createBook(`other${String(other).padStart(5, '0')}`), [fed(100 + other)], MONDAY));
    }
    expect(Object.keys(book.counters)).toHaveLength(LIMITS.devices);
    // Its own row counted least of all and is kept all the same. The ones left out are the smallest of the others.
    expect(rowOf(book.counters, 'phone00001')).toEqual({ fed: 1 });
    expect(rowOf(book.counters, 'other00000')).toBeUndefined();
    expect(rowOf(book.counters, `other${String(LIMITS.devices + 2).padStart(5, '0')}`)).toEqual({ fed: 100 + LIMITS.devices + 2 });
  });

  it('looks a device up among the book’s own rows only', () => {
    const book = record(createBook('constructor'), [fed(2)], MONDAY);
    expect(rowOf(book.counters, 'constructor')).toEqual({ fed: 2 });
    expect(rowOf({}, 'constructor')).toBeUndefined();
    expect(totals(mergeBooks(createBook('constructor'), book)).fed).toBe(2);
    expect(totals(mergeBooks(book, createBook('constructor'))).fed).toBe(2);
  });
});

describe('two tabs of the game on one device', () => {
  const start = () => record(createBook('device0001'), [fed(10)], MONDAY);

  it('add what each has counted to the one row they share, where the larger of the two would lose the other’s', () => {
    const stored = start();
    // Both tabs open with what is stored. One feeds three medals and the other four.
    const first = record(stored, [fed(3), won(1)], MONDAY);
    const second = record(stored, [fed(4)], MONDAY);
    expect(totals(mergeBooks(first, second)).fed).toBe(14);
    // The first writes. The second writes on top of that, and neither's medals are lost.
    const afterFirst = rebase(stored, first, stored);
    expect(totals(afterFirst).fed).toBe(13);
    const afterSecond = rebase(afterFirst, second, stored);
    expect(totals(afterSecond).fed).toBe(17);
    expect(totals(afterSecond).won).toBe(1);
    // The first tab reads it back: it has nothing new of its own since it wrote, so it takes what is there.
    expect(holding(rebase(afterSecond, afterFirst, afterFirst))).toBe(holding(afterSecond));
    // With nothing new on either side nothing changes, however often it is done.
    expect(holding(rebase(afterSecond, afterSecond, afterSecond))).toBe(holding(afterSecond));
  });

  it('comes to exactly what was counted, whatever order the tabs count and write in', () => {
    for (let schedule = 0; schedule < 80; schedule++) {
      const rng = seededRng(900 + schedule);
      let stored = createBook('device0001');
      const tabs = [0, 1, 2].map(() => ({ book: stored, base: stored }));
      let truth = 0;
      const days = new Set<Day>();
      for (let turn = 0; turn < 50; turn++) {
        const tab = tabs[Math.min(2, Math.floor(rng() * 3))];
        const what = rng();
        if (what < 0.5) {
          const count = 1 + Math.floor(rng() * 9);
          tab.book = record(tab.book, [fed(count)], MONDAY);
          truth += count;
        } else if (what < 0.6) {
          // A bonus: the tab looks at what is stored first, as the page does, and writes at once.
          tab.book = rebase(stored, tab.book, tab.base);
          const day = after(Math.floor(rng() * 5));
          const taken = claim(tab.book, day);
          if (taken.medals > 0) {
            expect(days.has(day)).toBe(false);
            days.add(day);
          }
          stored = taken.book;
          tab.book = stored;
          tab.base = stored;
        } else if (what < 0.85) {
          // The tab writes.
          stored = rebase(stored, tab.book, tab.base);
          tab.book = stored;
          tab.base = stored;
        } else {
          // The tab hears that another has written, and takes it in without writing.
          tab.book = rebase(stored, tab.book, tab.base);
          tab.base = stored;
        }
        expect(totals(stored).fed).toBeLessThanOrEqual(truth);
      }
      for (const tab of tabs) {
        stored = rebase(stored, tab.book, tab.base);
        tab.book = stored;
        tab.base = stored;
      }
      expect(totals(stored).fed).toBe(truth);
      expect(countDays(stored.claimed)).toBe(days.size);
      expect(totals(stored).claims).toBe(days.size);
    }
  });

  it('gives way to a clearing made in another tab, and wins when the clearing is its own', () => {
    const stored = start();
    const mine = record(stored, [fed(5)], MONDAY);
    const cleared = clearBook(stored);
    // The other tab cleared: what this one had counted before it heard belongs to the records that are gone.
    const heard = rebase(cleared, mine, stored);
    expect(heard.era).toBe(1);
    expect(totals(heard).fed).toBe(0);
    // This tab cleared: the stored book, from before, does not come back.
    const wrote = rebase(mine, cleared, stored);
    expect(wrote.era).toBe(1);
    expect(totals(wrote).fed).toBe(0);
  });
});

describe('the book as text', () => {
  const used = (): RecordBook => {
    let book = createBook('device0001');
    book = record(book, [fed(120), won(95), { type: 'lost', count: 9 }, spin('small', 'long'), { type: 'chestEnd', chest: 0, payout: 30 }], MONDAY);
    book = claim(book, MONDAY).book;
    return mergeBooks(book, record(createBook('laptop0001'), [fed(7)], after(1)));
  };

  it('is kept under its own name, apart from the machine’s save', () => {
    expect(RECORDS_KEY).toBe('medal-pusher-records');
    expect(RECORDS_KEY).not.toBe(STORAGE_KEY);
    expect(RECORDS_VERSION).toBe(1);
  });

  it('comes back as the book it was', () => {
    const book = used();
    const text = serializeBook(book);
    expect(parseBook(text)).toEqual(JSON.parse(text));
    expect(serializeBook(parseBook(text) as RecordBook)).toBe(text);
    expect(JSON.parse(text)).toEqual({
      v: 1,
      device: 'device0001',
      era: 0,
      counters: { device0001: { fed: 120, won: 95, lost: 9, spins: 1, reaches: 1, supers: 1, small: 1, superWins: 1, chests: 1, topChests: 1, claims: 1, bonus: 30 }, laptop0001: { fed: 7 } },
      bests: { prize: 30 },
      stamps: { firstLine: MONDAY, superWin: MONDAY, treasure: MONDAY },
      played: { '2026-10': 2 ** 11 + 2 ** 12 },
      claimed: { '2026-10': 2 ** 11 },
    });
  });

  it('is the same text for the same book, however the book came to be', () => {
    const a = record(record(createBook('device0001'), [won(2)], MONDAY), [fed(3)], MONDAY);
    const b = record(record(createBook('device0001'), [fed(3)], MONDAY), [won(2)], MONDAY);
    expect(Object.keys(a.counters.device0001)).not.toEqual(Object.keys(b.counters.device0001));
    expect(serializeBook(a)).toBe(serializeBook(b));
  });

  it('is small: a few hundred characters for a real player, and under six thousand with every bound reached', () => {
    expect(serializeBook(createBook('device0001')).length).toBeLessThan(120);
    expect(serializeBook(used()).length).toBeLessThan(500);
    // The largest book there can be: every device, every counter at the most, every stamp, every month full.
    const counters = Object.fromEntries(
      Array.from({ length: LIMITS.devices }, (_, index) => [`devicedevice${String(index).padStart(4, '0')}`, Object.fromEntries(COUNTER_IDS.map((id) => [id, LIMITS.count]))]),
    );
    let months: DaySet = {};
    for (let day = LIMITS.lastDay - LIMITS.months * 31; day <= LIMITS.lastDay; day++) months = addDay(months, dayOf(day));
    expect(Object.keys(months)).toHaveLength(LIMITS.months);
    const largest: RecordBook = {
      v: 1,
      device: 'devicedevice0000',
      era: LIMITS.eras,
      counters,
      bests: Object.fromEntries(BEST_IDS.map((id) => [id, LIMITS.count])),
      stamps: Object.fromEntries(ACHIEVEMENT_IDS.map((id) => [id, '2099-12-31'])),
      played: months,
      claimed: months,
    };
    const text = serializeBook(largest);
    expect(text.length).toBeLessThan(6000);
    expect(text.length).toBeLessThan(LIMITS.length);
    // And it is a book: it reads back whole.
    expect(serializeBook(parseBook(text) as RecordBook)).toBe(text);
  });

  it('is not a book when it is nonsense, another version, or has no device to its name', () => {
    const text = serializeBook(used());
    for (const nonsense of [null, undefined, 7, {}, '', 'null', '[]', '"book"', '{', '{}', text.slice(0, -2), 'x'.repeat(LIMITS.length + 1)]) expect(parseBook(nonsense)).toBeNull();
    const book = JSON.parse(text);
    expect(parseBook(JSON.stringify({ ...book, v: 2 }))).toBeNull();
    expect(parseBook(JSON.stringify({ ...book, v: '1' }))).toBeNull();
    for (const device of [undefined, '', 'short', 'Has-Capitals', 'far-too-long-a-name-for-a-device', 12345678]) expect(parseBook(JSON.stringify({ ...book, device }))).toBeNull();
    expect(isDevice('device0001')).toBe(true);
    // The machine's own save is not a book, and a book is not a machine.
    expect(parseBook(serialize(createSession(3)))).toBeNull();
    expect(restore(text, 3)).toBeNull();
  });

  it('keeps what is sound in a damaged book and leaves out what is not', () => {
    const book = JSON.parse(serializeBook(used()));
    const damaged = {
      ...book,
      era: -4,
      extra: 'what is this',
      counters: {
        device0001: { fed: 120.9, won: -5, lost: '9', spins: Number.NaN, chests: null, towers: 1e30, madeUp: 12, bonus: 30 },
        'Not A Device': { fed: 5 },
        laptop0001: 'none',
        tablet0001: { fed: 0 },
      },
      bests: { prize: 1e30, jackpot: -1, run: 'far', madeUp: 3 },
      stamps: { firstLine: MONDAY, superWin: 'yesterday', treasure: '2026-02-30', jackpot: 20738, madeUp: MONDAY },
      played: { '2026-10': 2 ** 11, '2026-02': 2 ** 30 + 1, '2026-13': 1, '1999-01': 1, 'October': 1, '2026-11': -3, '2026-12': 1.5, '2027-01': 2 ** 31 },
      claimed: 'every day',
    };
    const read = parseBook(JSON.stringify(damaged)) as RecordBook;
    expect(read).toEqual({
      v: 1,
      device: 'device0001',
      era: 0,
      counters: { device0001: { fed: 120, towers: LIMITS.count, bonus: 30 } },
      bests: { prize: LIMITS.count },
      stamps: { firstLine: MONDAY },
      // The thirty-first of February is no day; the first is.
      played: { '2026-10': 2 ** 11, '2026-02': 1 },
      claimed: {},
    });
    // Whatever was read can be shown, recorded into and written again.
    expect(viewOf(read).total.towers).toBe(LIMITS.count);
    expect(totals(record(read, [{ type: 'toppled', count: 5 }], MONDAY)).towers).toBe(LIMITS.count);
    expect(parseBook(serializeBook(read))).toEqual(read);
  });

  it('reads a book with more devices and more months than it keeps as its largest rows and its latest months', () => {
    const counters = Object.fromEntries(Array.from({ length: LIMITS.devices + 4 }, (_, index) => [`other${String(index).padStart(5, '0')}`, { fed: 10 + index }]));
    const played = Object.fromEntries(Array.from({ length: LIMITS.months + 6 }, (_, month) => [dayFrom(2030 + Math.floor(month / 12), (month % 12) + 1, 1).slice(0, 7), 1]));
    const read = parseBook(JSON.stringify({ v: 1, device: 'device0001', era: 2, counters: { ...counters, device0001: { fed: 1 } }, bests: {}, stamps: {}, played, claimed: {} })) as RecordBook;
    expect(Object.keys(read.counters)).toHaveLength(LIMITS.devices);
    expect(rowOf(read.counters, 'device0001')).toEqual({ fed: 1 });
    expect(rowOf(read.counters, 'other00000')).toBeUndefined();
    expect(Object.keys(read.played)).toHaveLength(LIMITS.months);
    expect(read.played['2030-01']).toBeUndefined();
    expect(read.era).toBe(2);
  });
});

describe('medals from outside the machine', () => {
  it('go into the purse and nowhere else, and the cabinet is told', () => {
    const session = createSession(9);
    const before = { ...session, machine: undefined };
    const events: SessionEvent[] = [];
    expect(grant(session, 40, events)).toBe(true);
    expect(session.credits).toBe(START_CREDITS + 40);
    expect(events).toEqual([{ type: 'bonus', count: 40 }]);
    // Nothing a return is worked out from has moved: not what was fed, won, lost or paid, nor the jackpot.
    expect({ ...session, machine: undefined, credits: START_CREDITS }).toEqual(before);
    expect(grant(session, 30)).toBe(true);
    expect(session.credits).toBe(START_CREDITS + 70);
  });

  it('are refused when there is nothing to give', () => {
    const session = createSession(9);
    const events: SessionEvent[] = [];
    for (const medals of [0, -5, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(grant(session, medals, events)).toBe(false);
    expect(session.credits).toBe(START_CREDITS);
    expect(events).toEqual([]);
  });

  it('are in the machine’s save, which holds a purse of any size the card can make it', () => {
    const session = createSession(9);
    for (const medals of BONUS_CARD) grant(session, medals);
    const back = restore(serialize(session), 1);
    expect(back?.credits).toBe(START_CREDITS + 480);
    expect(MAX_STOCK).toBeGreaterThan(0);
  });
});
