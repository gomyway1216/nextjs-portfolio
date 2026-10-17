import { describe, expect, it } from 'vitest';

import { ACCOUNT_LIMIT, fromCloud, sizeOf, toCloud } from '@/components/game/MedalPusher/account';
import {
  ACCOUNT_BUDGET,
  CENTER,
  HISTORY_LIMITS,
  accountSizeOf,
  PUSHER_GAME,
  VISIT_GAP,
  createHistory,
  dayTotals,
  medalsOverTime,
  mergeHistories,
  parseHistory,
  printOf,
  record,
  recordsOf,
  returnOf,
  serializeHistory,
  totalsOf,
  type Entry,
  type History,
  type Observation,
} from '@/components/game/MedalCenter/history';

// The medals' history as arithmetic (history.ts): what is written for each thing the bank and the machines say, how
// two copies are joined, the bounds, and the text. Nothing here touches a browser or an account.

const DAY = '2026-10-17';
const T0 = Date.UTC(2026, 9, 17, 9, 0, 0);
const at = (seconds: number) => T0 + seconds * 1000;

type Told = Observation extends infer O ? (O extends unknown ? Omit<O, 'at' | 'day' | 'left'> : never) : never;
/** The history after a list of things, one second apart, each with the medals left after it. */
function play(history: History, steps: readonly (Told & { left?: number; at?: number; day?: string })[], from = 0): History {
  let next = history;
  steps.forEach((step, index) => {
    next = record(next, { left: 100, at: at(from + index), day: DAY, ...step } as Observation);
  });
  return next;
}
const stake = (round: string, medals: number, game = 'roulette') => ({ type: 'move' as const, game, round, step: 'stake', medals: -medals });
const pay = (round: string, medals: number, game = 'roulette') => ({ type: 'move' as const, game, round, step: 'pay', medals });
const fresh = (device = 'phone00001') => createHistory(device, T0);
const entry = (history: History, r: string): Entry | undefined => history.entries.find((one) => one.r === r);
const row = (history: History, game: string) => recordsOf(history).find((one) => one.game === game);

describe('what is written as it happens', () => {
  it('writes a round as one entry: what it took and what came back, over once it is paid', () => {
    const history = play(fresh(), [stake('spin1', 5), { ...pay('spin1', 12), left: 107 }]);
    expect(history.entries).toHaveLength(1);
    expect(entry(history, 'spin1')).toMatchObject({ d: 'phone00001', g: 'roulette', k: 'round', bet: 5, won: 12, left: 107, done: 1 });
    expect(row(history, 'roulette')).toMatchObject({ rounds: 1, bet: 5, won: 12, top: 12, best: 1 });
    expect(dayTotals(history)).toEqual([{ day: DAY, bet: 5, won: 12, free: 0, rounds: 1, left: 107 }]);
  });

  it('adds every stake of a round to it — a double, a split — and counts the round once', () => {
    const history = play(fresh(), [
      { type: 'move', game: 'blackjack', round: 'hand1', step: 'deal', medals: -10 },
      { type: 'move', game: 'blackjack', round: 'hand1', step: 'double1', medals: -10 },
      { type: 'move', game: 'blackjack', round: 'hand1', step: 'pay', medals: 40 },
    ]);
    expect(entry(history, 'hand1')).toMatchObject({ bet: 20, won: 40, done: 1 });
    expect(row(history, 'blackjack')).toMatchObject({ rounds: 1, bet: 20, won: 40 });
  });

  it('takes a lost round that pays nothing for over when the next round of the game begins, and keeps the best run of rounds won', () => {
    const history = play(fresh(), [
      stake('a', 2),
      pay('a', 4), // won
      stake('b', 2),
      pay('b', 6), // won
      stake('c', 2),
      pay('c', 2), // even: the run stays as it is
      stake('d', 2), // lost: no pay at all
      stake('e', 2),
    ]);
    expect(entry(history, 'd')).toMatchObject({ bet: 2, won: 0, done: 1 });
    expect(entry(history, 'e')).toMatchObject({ bet: 2, won: 0, done: 0 });
    expect(row(history, 'roulette')).toMatchObject({ rounds: 5, best: 2, top: 6 });
    expect(history.games.find((one) => one.g === 'roulette')?.run).toBe(0);
  });

  it('takes a lost round for over as soon as its machine lets go of its receipts, keeping the rounds it still holds', () => {
    const history = play(fresh(), [
      stake('lost', 3, 'slot-machine'),
      { type: 'over', game: 'slot-machine', keep: [] },
      stake('a', 5),
      stake('b', 5),
      { type: 'over', game: 'roulette', keep: ['b'] },
    ]);
    expect(entry(history, 'lost')).toMatchObject({ bet: 3, won: 0, done: 1 });
    expect(entry(history, 'a')).toMatchObject({ done: 1 });
    expect(entry(history, 'b')).toMatchObject({ done: 0 });
    // The craps table's receipts are its chips': letting go of them ends no round.
    const craps = play(fresh(), [{ type: 'round', game: 'craps', round: 't-r1', bet: 1, won: 0 }, { type: 'over', game: 'craps', keep: [] }]);
    expect(craps.entries).toHaveLength(1);
  });

  it('keeps the rounds of each game apart', () => {
    const history = play(fresh(), [stake('s1', 3, 'slot-machine'), stake('r1', 5), pay('s1', 0, 'slot-machine'), pay('r1', 10)]);
    expect(row(history, 'slot-machine')).toMatchObject({ rounds: 1, bet: 3, won: 0 });
    expect(row(history, 'roulette')).toMatchObject({ rounds: 1, bet: 5, won: 10, best: 1 });
    expect(totalsOf(recordsOf(history))).toEqual({ rounds: 2, bet: 8, won: 10 });
  });

  it('pays a round finished on a later page into the round it belongs to, not a new one', () => {
    const history = play(fresh(), [stake('spin1', 5), stake('spin2', 5), pay('spin1', 35)]);
    expect(entry(history, 'spin1')).toMatchObject({ bet: 5, won: 35 });
    expect(row(history, 'roulette')).toMatchObject({ rounds: 2, bet: 10, won: 35 });
  });

  it('does not take the craps table’s chips for rounds: the table reports each roll whole, once', () => {
    const chips = play(fresh(), [
      { type: 'move', game: 'craps', round: 'table0001-1', step: 'move', medals: -10 },
      { type: 'move', game: 'craps', round: 'table0001-2', step: 'move', medals: 10 },
    ]);
    expect(chips.entries).toHaveLength(0);
    expect(chips.games).toHaveLength(0);
    const rolled = play(chips, [
      { type: 'round', game: 'craps', round: 'table0001-r1', bet: 10, won: 20 },
      { type: 'round', game: 'craps', round: 'table0001-r1', bet: 10, won: 20 },
      { type: 'round', game: 'craps', round: 'table0001-r2', bet: 5, won: 0 },
    ]);
    expect(rolled.entries).toHaveLength(2);
    expect(row(rolled, 'craps')).toMatchObject({ rounds: 2, bet: 15, won: 20, top: 20, best: 1 });
  });

  it('writes the Medal Pusher’s play as visits: one while it is played, a new one after it stood still, and a jackpot as an entry of its own', () => {
    let history = play(fresh(), [
      { type: 'machine', game: PUSHER_GAME, fed: 10, won: 4, prize: 0, jackpots: [] },
      { type: 'machine', game: PUSHER_GAME, fed: 5, won: 0, prize: 30, jackpots: [] },
    ]);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({ k: 'play', bet: 15, won: 4, done: 0 });
    history = record(history, { type: 'machine', game: PUSHER_GAME, fed: 0, won: 300, prize: 300, jackpots: [300], at: at(10), day: DAY, left: 500 });
    const jackpot = history.entries.find((one) => one.k === 'jackpot');
    expect(jackpot).toMatchObject({ won: 300, done: 1 });
    // Stood still for longer than a visit: the next medal starts another, and the one before is over.
    history = record(history, { type: 'machine', game: PUSHER_GAME, fed: 1, won: 0, prize: 0, jackpots: [], at: at(10) + VISIT_GAP + 1000, day: DAY, left: 499 });
    const visits = history.entries.filter((one) => one.k === 'play');
    expect(visits).toHaveLength(2);
    expect(visits.map((one) => [one.bet, one.won, one.done])).toEqual([
      [1, 0, 0],
      [15, 304, 1],
    ]);
    // The pusher plays no rounds; its biggest prize is its best single win.
    expect(row(history, PUSHER_GAME)).toMatchObject({ rounds: 0, bet: 16, won: 304, top: 300 });
  });

  it('writes the counter’s own doings once each: the daily bonus, a refill, a reset', () => {
    const history = play(fresh(), [
      { type: 'bonus', medals: 40, left: 140 },
      { type: 'refill', medals: 100, left: 100 },
      { type: 'reset', thrown: 1234, medals: 100, left: 100 },
    ]);
    expect(history.entries.map((one) => [one.g, one.k, one.bet, one.won])).toEqual([
      [CENTER, 'reset', 1234, 100],
      [CENTER, 'refill', 0, 100],
      [CENTER, 'bonus', 0, 40],
    ]);
    expect(dayTotals(history)[0]).toMatchObject({ free: 140, bet: 0, won: 0 });
    // Told twice in the same moment, a bonus is written once.
    const twice = record(history, { type: 'bonus', medals: 40, at: at(0), day: DAY, left: 140 });
    expect(twice).toBe(history);
  });

  it('writes nothing for what will not do: a clock off the calendar, a name or a number out of shape', () => {
    const start = fresh();
    expect(record(start, { ...stake('x', 1), at: at(0), day: '2026-02-30', left: 1 })).toBe(start);
    expect(record(start, { ...stake('x', 1), at: Number.NaN, day: DAY, left: 1 })).toBe(start);
    expect(record(start, { ...stake('BAD ROUND', 1), at: at(0), day: DAY, left: -1 })).toBe(start);
    expect(record(start, { type: 'move', game: 'roulette', round: 'x', step: 'stake', medals: 0.5, at: at(0), day: DAY, left: -1 })).toBe(start);
    expect(record(start, { type: 'round', game: 'craps', round: 'x', bet: -1, won: 0, at: at(0), day: DAY, left: -1 })).toBe(start);
  });

  it('notes the medals at the end of each day, as last seen', () => {
    let history = play(fresh(), [{ type: 'medals', left: 90 }, { type: 'medals', left: 80 }]);
    history = record(history, { type: 'medals', at: at(60), day: '2026-10-18', left: 75 });
    expect(history.close).toEqual([
      { day: '2026-10-18', t: at(60), left: 75 },
      { day: DAY, t: at(1), left: 80 },
    ]);
  });
});

describe('two copies of one history', () => {
  /** A phone and a laptop, each with what it played, and the account's copy that has heard from the phone. */
  const copies = () => {
    const phone = play(fresh('phone00001'), [stake('p1', 3), pay('p1', 9), { type: 'bonus', medals: 30 }]);
    const laptop = play(fresh('laptop0001'), [stake('l1', 2, 'slot-machine'), pay('l1', 0, 'slot-machine')], 30);
    return { phone, laptop };
  };

  it('holds everything either has, once, whichever way round and however often they meet', () => {
    const { phone, laptop } = copies();
    const joined = mergeHistories(phone, laptop);
    expect(joined.device).toBe('phone00001');
    expect(joined.entries).toHaveLength(3);
    expect(totalsOf(recordsOf(joined))).toEqual({ rounds: 2, bet: 5, won: 9 });
    expect(printOf(serializeHistory(joined))).toBe(printOf(serializeHistory(mergeHistories(laptop, phone))));
    // Met again, and with older copies of either: nothing is counted twice.
    const again = mergeHistories(mergeHistories(joined, phone), mergeHistories(laptop, joined));
    expect(printOf(serializeHistory(again))).toBe(printOf(serializeHistory(joined)));
    expect(totalsOf(recordsOf(again))).toEqual({ rounds: 2, bet: 5, won: 9 });
  });

  it('takes the later of two copies of a device’s row and of a round, not their sum', () => {
    const { phone } = copies();
    const later = play(phone, [stake('p2', 4), pay('p2', 0)], 10);
    const joined = mergeHistories(later, phone);
    expect(row(joined, 'roulette')).toMatchObject({ rounds: 2, bet: 7, won: 9 });
    // A round seen half way on one copy and whole on the other is the whole round.
    const half = play(fresh('phone00001'), [stake('q', 5)]);
    const whole = play(half, [pay('q', 15)], 1);
    expect(entry(mergeHistories(half, whole), 'q')).toMatchObject({ bet: 5, won: 15, done: 1 });
    expect(entry(mergeHistories(whole, half), 'q')).toMatchObject({ bet: 5, won: 15, done: 1 });
  });

  it('keeps the earlier beginning of the two', () => {
    const { phone, laptop } = copies();
    expect(mergeHistories({ ...phone, since: T0 + 5 }, { ...laptop, since: T0 - 5 }).since).toBe(T0 - 5);
    expect(mergeHistories({ ...phone, since: 0 }, { ...laptop, since: T0 }).since).toBe(T0);
  });

  it('is joined the same way however the copies are grouped', () => {
    const a = play(fresh('aaaaaa0001'), [stake('a1', 1), pay('a1', 2)]);
    const b = play(fresh('bbbbbb0001'), [stake('b1', 3)], 5);
    const c = play(fresh('cccccc0001'), [{ type: 'refill', medals: 100 }], 9);
    const left = mergeHistories(mergeHistories(a, b), c);
    const right = mergeHistories(a, mergeHistories(b, c));
    expect(printOf(serializeHistory(left))).toBe(printOf(serializeHistory(right)));
  });
});

describe('the bounds', () => {
  it('keeps the latest entries and lets the rest go, and an entry let go of takes nothing from the records', () => {
    let history = fresh();
    const rounds = HISTORY_LIMITS.entries + 25;
    for (let i = 0; i < rounds; i++) history = play(history, [stake(`s${i}`, 1), pay(`s${i}`, 2)], i * 2);
    expect(history.entries).toHaveLength(HISTORY_LIMITS.entries);
    expect(history.entries[0].r).toBe(`s${rounds - 1}`);
    expect(entry(history, 's0')).toBeUndefined();
    expect(row(history, 'roulette')).toMatchObject({ rounds, bet: rounds, won: rounds * 2, best: rounds });
  });

  it('keeps the latest days, as many as are kept, with this device’s own totals always among them', () => {
    let history = fresh('home000001');
    for (let i = 0; i < HISTORY_LIMITS.days + 10; i++) {
      const day = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      history = record(history, { type: 'bonus', medals: 30, at: Date.UTC(2026, 0, 1) + i * 86_400_000, day, left: 130 });
    }
    expect(new Set(history.days.map((one) => one.day)).size).toBe(HISTORY_LIMITS.days);
    expect(history.close).toHaveLength(HISTORY_LIMITS.days);
    expect(history.days.at(-1)?.day).toBe(new Date(Date.UTC(2026, 0, 1) + 10 * 86_400_000).toISOString().slice(0, 10));
    // A day played on more devices than a day keeps: the busiest others, and always this device.
    let busy = record(fresh('home000001'), { type: 'bonus', medals: 1, at: at(0), day: DAY, left: 1 });
    for (let d = 0; d < HISTORY_LIMITS.dayDevices + 3; d++) {
      const other = record(fresh(`other${String(d).padStart(5, '0')}`), { type: 'bonus', medals: 100 + d, at: at(d + 1), day: DAY, left: 1 });
      busy = mergeHistories(busy, other);
    }
    const today = busy.days.filter((one) => one.day === DAY);
    expect(today).toHaveLength(HISTORY_LIMITS.dayDevices);
    expect(today.some((one) => one.d === 'home000001')).toBe(true);
  });

  it('keeps a game’s records for as many devices as it may, this device’s always among them', () => {
    let history = play(fresh('home000001'), [stake('h', 1)]);
    for (let d = 0; d < HISTORY_LIMITS.gameDevices + 4; d++) {
      let other = fresh(`other${String(d).padStart(5, '0')}`);
      for (let i = 0; i < 3 + d; i++) other = play(other, [stake(`o${d}-${i}`, 1)], i);
      history = mergeHistories(history, other);
    }
    const rows = history.games.filter((one) => one.g === 'roulette');
    expect(rows).toHaveLength(HISTORY_LIMITS.gameDevices);
    expect(rows.some((one) => one.d === 'home000001')).toBe(true);
  });
});

describe('the history as text', () => {
  it('reads back what it wrote, the same text for two copies that hold the same things', () => {
    const history = play(fresh(), [stake('x', 2), pay('x', 5), { type: 'bonus', medals: 30 }]);
    const text = serializeHistory(history);
    expect(parseHistory(text)).toEqual(history);
    expect(serializeHistory(parseHistory(text)!)).toBe(text);
    expect(printOf(text)).toBe(printOf(serializeHistory({ ...history, device: 'another001' })));
  });

  it('leaves out a part that will not do and keeps the rest; a text that is no history is none', () => {
    const history = play(fresh(), [stake('x', 2), pay('x', 5)]);
    const stored = JSON.parse(serializeHistory(history)) as Record<string, unknown[]>;
    stored.entries.push({ d: 'phone00001', g: 'roulette', r: 'NOT A NAME', k: 'round', t: at(9), bet: 1, won: 1, left: 1, done: 1 });
    stored.entries.push({ d: 'phone00001', g: 'roulette', r: 'neg', k: 'round', t: at(9), bet: -5, won: 1, left: 1, done: 1 });
    stored.games.push({ g: 'roulette', d: 'phone00001', n: 'many' });
    stored.days.push({ day: '2026-13-01', d: 'phone00001', bet: 1, won: 1, free: 0, rounds: 1 });
    const read = parseHistory(JSON.stringify(stored));
    expect(read?.entries).toHaveLength(1);
    expect(read && totalsOf(recordsOf(read))).toEqual({ rounds: 1, bet: 2, won: 5 });
    for (const bad of [null, 42, '', 'not json', '[]', JSON.stringify({ v: 2, device: 'phone00001' }), JSON.stringify({ v: 1, device: 'NO' }), 'x'.repeat(HISTORY_LIMITS.length + 1)]) {
      expect(parseHistory(bad)).toBeNull();
    }
  });

  /** The very worst a history can be: every bound reached at once, and every name and number in it different, at its longest and largest, so that nothing in it packs. */
  const worstOf = (seed: number): History => {
    let state = seed;
    const random = () => (state = (state * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
    const word = (size: number) => Array.from({ length: size }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(random() * 36)]).join('');
    const big = () => Math.floor(random() * HISTORY_LIMITS.medals);
    const when = () => T0 + Math.floor(random() * 4e12);
    const home = word(16);
    const days = Array.from({ length: HISTORY_LIMITS.days }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
    const kinds = ['round', 'play', 'jackpot', 'bonus', 'refill', 'reset'] as const;
    return {
      v: 1,
      device: home,
      since: T0,
      entries: Array.from({ length: HISTORY_LIMITS.entries }, (_, i) => ({ d: word(16), g: word(24), r: word(24), k: kinds[i % kinds.length], t: when(), bet: big(), won: big(), left: big(), done: i % 2 })),
      games: Array.from({ length: HISTORY_LIMITS.games }, () => word(24)).flatMap((g) =>
        Array.from({ length: HISTORY_LIMITS.gameDevices }, (_, i) => ({ g, d: i === 0 ? home : word(16), n: big(), rounds: big(), bet: big(), won: big(), top: big(), run: big(), best: big(), last: when() })),
      ),
      days: days.flatMap((day) => Array.from({ length: HISTORY_LIMITS.dayDevices }, (_, i) => ({ day, d: i === 0 ? home : word(16), bet: big(), won: big(), free: big(), rounds: big() }))),
      close: days.map((day) => ({ day, t: when(), left: big() })),
    };
  };

  /** A player's real history after a couple of months: a phone, a laptop and a tablet, 300 rounds of seven machines, and a bonus a day. */
  const realHistory = (): History => {
    const machines = ['slot-machine', 'roulette', 'blackjack', 'video-poker', 'baccarat', 'three-card-poker', 'janken'];
    const devices = ['k3j2h1g0f9', 'p9q8r7s6t5', 'a1b2c3d4e5'].map((name) => fresh(name));
    for (let i = 0; i < HISTORY_LIMITS.entries; i++) {
      const game = machines[i % machines.length];
      const round = `${(1_760_700_000_000 + i * 977).toString(36)}${(i * 7919).toString(36).padStart(4, '0')}`;
      const which = i % devices.length;
      devices[which] = play(devices[which], [stake(round, 1 + (i % 9), game), { ...pay(round, (i * 37) % 23, game), left: 1000 + ((i * 131) % 4000) }], i * 40);
    }
    for (let i = 0; i < 60; i++) {
      const day = new Date(Date.UTC(2026, 7, 1) + i * 86_400_000).toISOString().slice(0, 10);
      const which = i % devices.length;
      devices[which] = record(devices[which], { type: 'bonus', medals: 30 + (i % 7) * 10, at: Date.UTC(2026, 7, 1) + i * 86_400_000, day, left: 900 + i });
    }
    return devices.reduce((joined, copy) => mergeHistories(joined, copy));
  };

  it('fits on the account well within the save route’s 64 KB, at the very worst and as a player’s really is', () => {
    const worst = worstOf(12_345);
    const worstText = serializeHistory(worst);
    const worstCloud = toCloud(worstText, 'm'.repeat(20), at(0));
    expect(worstCloud).not.toBeNull();
    expect(fromCloud(worstCloud)?.text).toBe(worstText);
    // The worst gives up its oldest entries to fit; it is still a history, and reads back as the same text.
    expect(parseHistory(worstText)?.entries.length).toBeLessThan(HISTORY_LIMITS.entries);
    expect(serializeHistory(parseHistory(worstText)!)).toBe(worstText);

    const real = realHistory();
    const realText = serializeHistory(real);
    // A real history keeps every entry: it is nowhere near the budget.
    expect(parseHistory(realText)?.entries).toHaveLength(HISTORY_LIMITS.entries);

    // Measured when the history came in: the worst 47,347 bytes on the account (88,997 characters on the device, having
    // given up its oldest entries), a player's of two months on three devices 12,117 (47,288 characters, every entry
    // kept). The route takes 65,536.
    expect(accountSizeOf(worstText)).toBeLessThanOrEqual(ACCOUNT_BUDGET);
    expect(sizeOf(worstCloud!)).toBeLessThanOrEqual(ACCOUNT_BUDGET);
    expect(accountSizeOf(realText)).toBeLessThanOrEqual(14_000);
    expect(ACCOUNT_BUDGET).toBeLessThan(ACCOUNT_LIMIT * 0.75);
  });

  it('never comes to more on the account than its text is long, which is why a short text is not packed to be measured', () => {
    for (const history of [worstOf(1), worstOf(99), worstOf(2026), realHistory(), fresh()]) {
      const text = serializeHistory(history);
      expect(accountSizeOf(text)).toBeLessThanOrEqual(text.length + 400);
    }
  });
});

describe('what the page is shown', () => {
  it('says what came back for each medal that went in, and nothing before any went in', () => {
    expect(returnOf(0, 0)).toBeNull();
    expect(returnOf(200, 190)).toBeCloseTo(0.95);
  });

  it('draws the medals over time from the entries, and from the ends of the days the entries no longer reach', () => {
    const history = play(fresh(), [
      { ...stake('a', 5), left: 95 },
      { ...pay('a', 10), left: 105 },
    ]);
    const older: History = { ...history, close: [...history.close, { day: '2026-10-10', t: Date.UTC(2026, 9, 10, 20), left: 60 }] };
    expect(medalsOverTime(older)).toEqual([
      { t: Date.UTC(2026, 9, 10, 20), left: 60 },
      { t: at(1), left: 105 },
    ]);
  });
});
