import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { CLOUD_FORMAT, fromCloud, sizeOf, toCloud } from '@/components/game/MedalPusher/account';
import { buildTowers, dropJewel, jewelsOnField, medalsOnField, queuePayout, seededRng } from '@/components/game/MedalPusher/engine';
import { medalsInTubes, towersIn } from '@/components/game/MedalPusher/stacker';
import { JACKPOT_START, JACKPOT_STEP } from '@/components/game/MedalPusher/lottery';
import { PACK_FORMAT, pack, unpack } from '@/components/game/MedalPusher/pack';
import { advance, createSession, insert, refill, type Session } from '@/components/game/MedalPusher/session';
import { STORAGE_VERSION, VERSION_BEFORE_LAMP, VERSION_BEFORE_RIDE, restore, serialize } from '@/components/game/MedalPusher/storage';

import inFormat1 from './fixtures/copies-packed-in-format-1.json';
import inFormat2 from './fixtures/copies-packed-in-format-2.json';
import beforeChance from './fixtures/save-before-chance-time.json';
import beforeArms from './fixtures/save-before-feed-arms.json';
import beforeJewels from './fixtures/save-before-jewels.json';
import beforeLeftAndRight from './fixtures/save-before-left-and-right.json';
import beforeLipChuckers from './fixtures/save-before-lip-chuckers.json';
import beforeSlots from './fixtures/save-before-the-front-slots.json';
import beforeLamp from './fixtures/save-before-the-lucky-lamp.json';
import dayBeforeLamp from './fixtures/save-before-the-lucky-lamp-with-the-payout-works.json';
import beforeRide from './fixtures/save-before-the-ride.json';
import beforeTubes from './fixtures/save-before-the-tubes.json';
import beforeWorks from './fixtures/save-before-the-payout-works.json';
import beforeBowls from './fixtures/save-before-the-three-bowls.json';
import withOneBowl from './fixtures/save-with-chance-time-and-one-bowl.json';
import withJewels from './fixtures/save-with-jewels-before-the-payout-works.json';
import withBowls from './fixtures/save-with-the-three-bowls-before-jewels.json';
import { packFormat1, unpackFormat1 } from './packFormat1';
import { packFormat2, unpackFormat2 } from './packFormat2';

const DT = 1 / 60;
/** Tests that run the machine for a good while get room on a slow machine. */
const LONG = 30_000;

/** A machine that has been played: a medal on each rail twice a second, the purse refilled when it is empty. */
function played(seed: number, seconds: number): Session {
  const session = createSession(seed);
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (session.credits === 0) refill(session);
    if (i % 30 === 0) {
      insert(session, 0);
      insert(session, 1);
    }
    advance(session, DT);
  }
  return session;
}

// Every size compared in these tests is in bytes of UTF-8, which is what the route counts, and never in characters.
/** The bytes of a text by itself: a save as it is kept on the device. */
const bytesOf = (text: string): number => new TextEncoder().encode(text).length;
/**
 * The bytes of a packed text as it is sent: the whole copy it travels in, measured as the route measures it. The
 * packed text is a string inside that copy, so a quote in it costs two bytes, and a letter outside ASCII as many
 * bytes as UTF-8 takes for it. The few fields round it are the same for every copy.
 */
const sent = (packedText: string | null): number => sizeOf({ format: PACK_FORMAT, mark: 'a-mark-of-16-hex', changedAt: 0, data: packedText as string });
/** The same for one column of a packed table. */
const sentColumn = (column: unknown): number => sent(JSON.stringify(column));

/** Packs a value and unpacks it again, as the JSON it comes back as. */
const there = (value: unknown): string | null => {
  const small = pack(JSON.stringify(value));
  return small === null ? null : unpack(small);
};

/** A prize pouring out of the hopper's doors onto a machine that has been played: most of what is in the air was poured. */
function pouring(): Session {
  const session = played(6, 8);
  queuePayout(session.machine, 400);
  session.paidOut += 400;
  for (let i = 0; i < 900 && session.machine.falling.filter((medal) => medal.source === 'pour').length < 20; i++) advance(session, DT);
  return session;
}

/** Towers in the tubes, and one of them on its arm, being pushed out. */
function lifting(): Session {
  const session = played(8, 8);
  buildTowers(session.machine, 150);
  session.paidOut += 150;
  for (let i = 0; i < 900 && !session.machine.stacker.tubes.some((tube) => tube.phase === 'pushing'); i++) advance(session, DT);
  return session;
}

/** Jewels lying on the table, and one on its way down from the hatch. */
function jewelled(): Session {
  const session = played(9, 8);
  dropJewel(session.machine);
  for (let i = 0; i < 3; i++) advance(session, DT);
  return session;
}

/** Every save of an older version there is a fixture of. */
const OLDER: [string, string][] = [
  ['before the feed arms', beforeArms.save],
  ['with one aim for both arms', beforeLeftAndRight.save],
  ['before the chuckers were on the lip', beforeLipChuckers.save],
  ['before the slots were at the front', beforeSlots.save],
  ['before chance time', beforeChance.save],
  ['with chance time and one bowl', withOneBowl.save],
  ['before the three bowls', beforeBowls.save],
  ['with the three bowls, before jewels', withBowls.save],
  ['before jewels', beforeJewels.save],
  ['with jewels, before the payout works', withJewels.save],
  ['before the payout works', beforeWorks.save],
  ['in chance time before the lucky lamp, the jewels and the payout works', beforeLamp.save],
  ['the day before the lucky lamp, with the payout works at work', dayBeforeLamp.save],
  ['before a medal rode to its pocket, with three that had just come over one', beforeRide.save],
  ['before the tower tubes, with towers going up on their lifts', beforeTubes.save],
];

/** The whole numbers a string of bits holds, read here by hand and not by the packer: `width` bits each, high bit first. */
const numbersIn = (text: string, width: number, count: number): number[] => {
  const bits = [...atob(text)].map((char) => char.charCodeAt(0).toString(2).padStart(8, '0')).join('');
  return Array.from({ length: count }, (_, index) => parseInt(bits.slice(index * width, (index + 1) * width), 2));
};

type Way = 'list' | 'bytes' | 'ones' | 'few' | 'whole' | 'planes';
/** How often each way of writing a column was used in a packed save. */
function waysIn(small: string): Record<Way, number> {
  const ways: Record<Way, number> = { list: 0, bytes: 0, ones: 0, few: 0, whole: 0, planes: 0 };
  const column = (written: unknown): void => {
    if (Array.isArray(written)) {
      ways.list += 1;
      written.forEach(walk);
    } else if (typeof written === 'string') {
      ways[written[0] === 'f' ? 'bytes' : 'ones'] += 1;
    } else if (typeof written === 'object' && written !== null && 'd' in written) {
      ways.few += 1;
      column(written.d);
    } else if (typeof written === 'object' && written !== null && 'q' in written) {
      ways.planes += 1;
    } else {
      ways.whole += 1;
    }
  };
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (typeof value !== 'object' || value === null) return;
    const node = value as { $?: unknown; c?: unknown[]; t?: { c: unknown[] }[]; v?: unknown };
    if (node.$ === 't') (node.c as unknown[]).forEach(column);
    else if (node.$ === 'g') (node.t as { c: unknown[] }[]).forEach((table) => table.c.forEach(column));
    else if (node.$ === 'o') Object.values(node.v as object).forEach(walk);
    else Object.values(value).forEach(walk);
  };
  walk(JSON.parse(small));
  return ways;
}

describe('a packed save', () => {
  it('comes back as the very text it was made from, and is much shorter', { timeout: LONG }, () => {
    for (const session of [createSession(1), played(2, 20), played(3, 45)]) {
      const text = serialize(session);
      const small = pack(text);
      expect(small).not.toBeNull();
      expect(unpack(small)).toBe(text);
      expect(sent(small)).toBeLessThan(bytesOf(text) / 2);
      // And what it comes back as is a machine: the same one.
      expect(serialize(restore(unpack(small), 1) as Session)).toBe(text);
    }
  });

  it('holds every number exactly, however it is written', () => {
    const numbers = [0, 1, -1, 0.1, 0.30000000000000004, 1 / 3, 100, 3.2, 96.8, 1e21, 1e-7, 5e-324, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 123456789.12345679];
    const rows = numbers.map((n, index) => ({ id: index, x: n, y: -n }));
    expect(there(rows)).toBe(JSON.stringify(rows));
    const back = JSON.parse(there(rows) as string) as { x: number; y: number }[];
    back.forEach((row, index) => {
      expect(Object.is(row.x, numbers[index])).toBe(true);
      expect(row.y).toBe(-numbers[index] === 0 ? 0 : -numbers[index]);
    });
  });

  it('writes a list of objects with the same fields as columns, each the shortest way there is for it', () => {
    const medals = Array.from({ length: 40 }, (_, index) => ({ id: index + 1, x: 3.2 + index * 1.0123456789, y: 50.123456789012 - index / 7, ball: index % 9 === 0, source: index % 2 ? 'player' : 'spill', grow: 0 }));
    const small = JSON.parse(pack(JSON.stringify({ medals })) as string);
    expect(small.medals.$).toBe('t');
    expect(small.medals.k).toEqual(['id', 'x', 'y', 'ball', 'source', 'grow']);
    const [id, x, y, ball, source, grow] = small.medals.c;
    // Whole numbers that lie near one another: the smallest, and how far above it each is, six bits apiece.
    expect(id).toEqual({ m: 1, n: 40, w: 6, i: expect.stringMatching(/^[A-Za-z0-9+/]{40}$/) });
    expect(numbersIn(id.i, 6, 40)).toEqual(medals.map((medal) => medal.id - 1));
    // Long fractions, all different: their own bytes.
    expect(x).toMatch(/^f[A-Za-z0-9+/]+=*$/);
    expect(y).toMatch(/^f/);
    // Two values that come many times: the two, and a bit for each cell that says which.
    expect(ball).toEqual({ d: 'b10', n: 40, i: expect.any(String) });
    expect(numbersIn(ball.i, 1, 40)).toEqual(medals.map((medal) => (medal.ball ? 0 : 1)));
    expect(source).toEqual({ d: ['spill', 'player'], n: 40, i: expect.any(String) });
    expect(numbersIn(source.i, 1, 40)).toEqual(medals.map((medal) => (medal.source === 'spill' ? 0 : 1)));
    // One value in every cell: the value, how many cells, and not a bit more.
    expect(grow).toEqual({ d: [0], n: 40 });
    expect(there({ medals })).toBe(JSON.stringify({ medals }));
    // Each of them is less than the same column was in format 1.
    const before = JSON.parse(packFormat1(JSON.stringify({ medals })) as string);
    expect(Array.isArray(before.medals.c[0])).toBe(true);
    expect(before.medals.c[3]).toBe(`b${medals.map((medal) => (medal.ball ? '1' : '0')).join('')}`);
    expect(before.medals.c[4]).toHaveLength(40);
    for (const column of [0, 3, 4, 5]) expect(sentColumn(small.medals.c[column])).toBeLessThan(sentColumn(before.medals.c[column]));
    for (const column of [1, 2]) expect(small.medals.c[column]).toBe(before.medals.c[column]);
  });

  it('writes which of a few values a cell is in as few bits as say it, the high bit first', () => {
    // a b a c a b b a: three values, so two bits to a cell. 00 01 00 10 00 01 01 00 is the bytes 0x12 0x14.
    const rows = ['a', 'b', 'a', 'c', 'a', 'b', 'b', 'a'].map((letter) => ({ letter: `the letter ${letter}, written out at length` }));
    const [letters] = (JSON.parse(pack(JSON.stringify(rows)) as string) as { c: [{ d: string[]; n: number; i: string }] }).c;
    expect(letters).toEqual({ d: ['a', 'b', 'c'].map((letter) => `the letter ${letter}, written out at length`), n: 8, i: 'EhQ=' });
    expect(there(rows)).toBe(JSON.stringify(rows));
    // Seventeen values take five bits; the bits left over in the last byte are nothing.
    const many = Array.from({ length: 200 }, (_, index) => ({ kind: `kind number ${(index * 7) % 17}` }));
    const [kinds] = (JSON.parse(pack(JSON.stringify(many)) as string) as { c: [{ d: string[]; n: number; i: string }] }).c;
    expect(kinds.d).toHaveLength(17);
    expect(atob(kinds.i)).toHaveLength(125);
    expect(numbersIn(kinds.i, 5, 200).map((place) => kinds.d[place])).toEqual(many.map((row) => row.kind));
    expect(there(many)).toBe(JSON.stringify(many));
  });

  it('writes a column the way that is fewest bytes as it is sent, which is not always the fewest characters', () => {
    const table = (column: unknown): string => JSON.stringify({ $: 't', k: ['cell'], c: [column] });
    // Three cells of one emoji. Written out, cell by cell, they are fewer characters than the emoji written once
    // with the number of cells, even counting the backslash each quote gets inside the copy. In bytes they are more:
    // an emoji is two characters and four bytes, each time it is written.
    const coins = [{ cell: '🪙' }, { cell: '🪙' }, { cell: '🪙' }];
    const [each, once] = [table(['🪙', '🪙', '🪙']), table({ d: ['🪙'], n: 3 })];
    expect(unpack(each)).toBe(JSON.stringify(coins));
    expect(unpack(once)).toBe(JSON.stringify(coins));
    expect(each.length).toBeLessThan(once.length);
    expect(JSON.stringify(each).length).toBeLessThan(JSON.stringify(once).length);
    expect(sent(once)).toBeLessThan(sent(each));
    expect(sent(each) - sent(once)).toBe(2);
    expect(pack(JSON.stringify(coins))).toBe(once);

    // And the other way about. Twelve small whole numbers are fewer bytes, taken by themselves, as the smallest of
    // them and three bits each than written out. Inside the copy they are more: that way of writing them has eight
    // quotes in it and the list has none, and each quote is sent with a backslash before it.
    const ids = [10, 17, 11, 12, 13, 14, 15, 16, 10, 11, 12, 13];
    const rows = ids.map((cell) => ({ cell }));
    const bits = ids.map((id) => (id - 10).toString(2).padStart(3, '0')).join('').padEnd(40, '0');
    const inBits = btoa(String.fromCharCode(...(bits.match(/.{8}/g) as string[]).map((byte) => parseInt(byte, 2))));
    const [listed, above] = [table(ids), table({ m: 10, n: 12, w: 3, i: inBits })];
    expect(unpack(listed)).toBe(JSON.stringify(rows));
    expect(unpack(above)).toBe(JSON.stringify(rows));
    expect(bytesOf(above)).toBeLessThan(bytesOf(listed));
    expect(sent(listed)).toBeLessThan(sent(above));
    expect(pack(JSON.stringify(rows))).toBe(listed);

    // Letters of two and of three bytes, quotes and backslashes: whichever way is taken is no more bytes as it is
    // sent than writing the cells out, and comes back as the text it was.
    for (const value of ['é', 'メダル', '🪙🪙', '"', '\\', 'a "quoted" メダル \\ 🪙', '\n', '\u0001']) {
      for (const cells of [3, 4, 9, 40]) {
        const text = JSON.stringify(Array.from({ length: cells }, () => ({ cell: value })));
        const small = pack(text) as string;
        expect(unpack(small)).toBe(text);
        expect(sent(small)).toBeLessThanOrEqual(sent(table(Array.from({ length: cells }, () => value))));
        expect(sent(small)).toBeLessThanOrEqual(sent(table({ d: [value], n: cells })));
      }
    }
  });

  it('takes two cells for the same value only when JSON writes them the same', () => {
    // 1 and "1" and true and [1] are four values; 0 and −0 are one, since JSON writes both as 0; so are 1 and 1.0.
    const cells = [1, '1', true, [1], 1.0, 0, -0, null, 'null', { a: 1 }, { a: 1 }, { a: '1' }, [], {}, '', 1e21, 1e21];
    const rows = Array.from({ length: 170 }, (_, index) => ({ cell: cells[index % cells.length] }));
    const text = JSON.stringify(rows);
    const [column] = (JSON.parse(pack(text) as string) as { c: [{ d: unknown[]; n: number }] }).c;
    expect(column.n).toBe(170);
    expect(column.d).toEqual([1, '1', true, [1], 0, null, 'null', { a: 1 }, { a: '1' }, [], {}, '', 1e21]);
    expect(unpack(pack(text))).toBe(text);
  });

  it('writes whole numbers as the smallest and how far above it each one is, only where that is exact', () => {
    const column = (cells: number[]): unknown => (JSON.parse(pack(JSON.stringify(cells.map((id) => ({ id })))) as string) as { c: unknown[] }).c[0];
    const exact = (cells: number[]): void => {
      const back = JSON.parse(there(cells.map((id) => ({ id }))) as string) as { id: number }[];
      back.forEach((row, index) => expect(Object.is(row.id, cells[index] === 0 ? 0 : cells[index])).toBe(true));
    };
    const spread = (from: number, span: number): number[] => Array.from({ length: 60 }, (_, index) => from + (index === 0 ? 0 : index === 1 ? span : (index * 7919) % (span + 1)));
    // Ids as a machine has them, and as it may have them after years: a million million.
    for (const from of [1, 3505, 1_000_000_000_000 - 30, -400]) {
      const ids = spread(from, 457);
      expect(column(ids)).toMatchObject({ m: from, n: 60, w: 9 });
      expect(numbersIn((column(ids) as { i: string }).i, 9, 60)).toEqual(ids.map((id) => id - from));
      exact(ids);
    }
    // At either end of the whole numbers that are exact, and across nought.
    for (const ids of [spread(Number.MAX_SAFE_INTEGER - 63, 63), spread(Number.MIN_SAFE_INTEGER, 63), spread(-31, 63)]) {
      expect(column(ids)).toMatchObject({ m: ids[0], n: 60, w: 6 });
      exact(ids);
    }
    // As far apart as thirty-two bits say, and no farther: one more and it is written another way.
    expect(column(spread(10, 2 ** 32 - 1))).toMatchObject({ m: 10, w: 32 });
    exact(spread(10, 2 ** 32 - 1));
    expect(column(spread(10, 2 ** 32))).not.toHaveProperty('m');
    exact(spread(10, 2 ** 32));
    // Whole numbers past the exact ones, and numbers that are not whole, are never written so.
    for (const cells of [spread(2 ** 53, 64).map((id) => id * 2), spread(Number.MAX_SAFE_INTEGER - 10, 20), spread(0.5, 63), [...spread(1, 63), 2.5], [...spread(1, 63), 1e300]]) {
      expect(column(cells)).not.toHaveProperty('m');
      exact(cells);
    }
  });

  it('writes a long column of numbers a byte at a time when that is fewer bytes: a plane that is one value once, and one of a few as those and bits', () => {
    // Positions on the field, as many as a machine has medals: every one between 2 and 100, so the top byte of each
    // is the same. Every other byte is all sorts, and is written as it is.
    const random = seededRng(3);
    const rows = Array.from({ length: 500 }, () => ({ x: 2 + random() * 98 }));
    const text = JSON.stringify(rows);
    const [x] = (JSON.parse(pack(text) as string) as { c: [{ n: number; q: unknown[] }] }).c;
    expect(x.n).toBe(500);
    expect(x.q).toHaveLength(8);
    // The low byte first.
    for (const plane of x.q.slice(0, 7)) expect(plane).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(x.q[7]).toEqual({ v: [64] });
    const byteOf = (cell: number, at: number): number => new Uint8Array(new Float64Array([cell]).buffer)[at];
    expect([...atob(x.q[0] as string)].map((char) => char.charCodeAt(0))).toEqual(rows.map(({ x: cell }) => byteOf(cell, 0)));
    // Exact, and fewer bytes as it is sent than the numbers' own bytes, which is how format 2 wrote them.
    expect(unpack(pack(text))).toBe(text);
    const bytes = (JSON.parse(packFormat2(text) as string) as { c: [string] }).c[0];
    expect(bytes).toMatch(/^f/);
    expect(sentColumn(x)).toBeLessThan(sentColumn(bytes) * 0.92);
    // A short column of them is not worth it: what is written round each plane costs more than the byte it saves.
    const short = JSON.stringify(rows.slice(0, 30));
    expect((JSON.parse(pack(short) as string) as { c: unknown[] }).c[0]).toMatch(/^f/);
    // Numbers with less in them than a number can hold: between 1 and 2, in 256ths. Five planes are nothing at all,
    // two take sixteen values each, and the top is one.
    const steps = Array.from({ length: 300 }, () => ({ x: 1 + Math.floor(random() * 256) / 256 }));
    const [fine] = (JSON.parse(pack(JSON.stringify(steps)) as string) as { c: [{ n: number; q: { v: number[]; i?: string }[] }] }).c;
    expect(fine.q.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => ({ v: [0] })));
    for (const at of [5, 6]) {
      const plane = fine.q[at];
      expect(plane.v.length).toBeGreaterThan(8);
      expect(plane.v.length).toBeLessThanOrEqual(16);
      expect(numbersIn(plane.i as string, (plane.v.length - 1).toString(2).length, 300).map((place) => plane.v[place])).toEqual(steps.map(({ x: cell }) => byteOf(cell, at)));
    }
    expect(fine.q[7]).toEqual({ v: [63] });
    expect(unpack(pack(JSON.stringify(steps)))).toBe(JSON.stringify(steps));
    expect(sentColumn(fine)).toBeLessThan(sentColumn((JSON.parse(packFormat2(JSON.stringify(steps)) as string) as { c: [string] }).c[0]) / 3);
    // A machine's medals are such a column, two of them: where each lies across the field and out from the back wall.
    const machine = JSON.parse(pack(serialize(played(2, 20))) as string) as { machine: { medals: { k: string[]; c: unknown[]; t?: { k: string[]; c: unknown[] }[] } } };
    const table = machine.machine.medals.t ? machine.machine.medals.t[0] : machine.machine.medals;
    for (const field of ['x', 'y']) expect(table.c[table.k.indexOf(field)]).toHaveProperty('q');
  });

  it('brings every table back as the text it was, whatever its cells hold and whichever way each column is written', () => {
    const random = seededRng(11);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
    const awkward: unknown[] = [0, -0, 1, -1, 0.1, 1 / 3, 1e21, 5e-324, 2 ** 53, 2 ** 53 + 2, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, Number.MAX_VALUE, null, true, false];
    awkward.push('', '0', 'false', 'null', 'a "quoted" \\ one', 'メダル 🪙', [], [1, 2], [[1], [2]], {}, { a: 1 }, { a: 1, b: [true, null] }, { $: 't' }, { d: [1], n: 2 }, { m: 0, n: 2, w: 1, i: 'AA==' });
    const kinds: (() => () => unknown)[] = [
      // One value in every cell.
      () => {
        const value = pick(awkward);
        return () => value;
      },
      // A few values, many times.
      () => {
        const values = Array.from({ length: 2 + Math.floor(random() * 6) }, () => pick(awkward));
        return () => pick(values);
      },
      // Whole numbers that lie near one another, wherever they lie; some of them past where whole numbers are exact.
      () => {
        const from = pick([0, -50, 1000, 2 ** 31, 2 ** 32 - 3, 1e12, Number.MAX_SAFE_INTEGER - 300, Number.MIN_SAFE_INTEGER]);
        const span = pick([1, 2, 7, 255, 256, 70_000, 2 ** 32 - 1, 2 ** 32]);
        return () => from + Math.floor(random() * (span + 1));
      },
      // Numbers with fractions, all different.
      () => () => (random() - 0.5) * 10 ** Math.floor(random() * 12 - 4),
      // Yes and no.
      () => () => random() < 0.3,
      // Anything at all.
      () => () => pick(awkward),
    ];
    const names = ['id', 'x', '$', 'd', 'n', 'i', 'm', 'w', 'q', 'v', '__proto__', 'k', 'c', 'constructor'];
    const used: Record<Way, number> = { list: 0, bytes: 0, ones: 0, few: 0, whole: 0, planes: 0 };
    for (let table = 0; table < 300; table++) {
      const fields = names.filter(() => random() < 0.35).map((name) => ({ name, cell: pick(kinds)() }));
      const rows = Array.from({ length: Math.floor(random() * 90) }, () => {
        const row: Record<string, unknown> = {};
        for (const field of fields) Object.defineProperty(row, field.name, { value: field.cell(), enumerable: true, writable: true, configurable: true });
        // Now and then a row has a field the others have not, as a jewel has among medals.
        if (random() < 0.04) row.jewel = true;
        return row;
      });
      const text = JSON.stringify(table % 3 === 0 ? rows : { version: 7, machine: { medals: rows, time: 1.5 } });
      const small = pack(text) as string;
      expect(unpack(small)).toBe(text);
      // The same text packed as formats 1 and 2 packed it is read as well as ever, and is never fewer bytes as it is
      // sent: every way they had of writing a column is one that format 3 weighs.
      expect(unpack(packFormat1(text), 1)).toBe(text);
      expect(unpack(packFormat2(text), 2)).toBe(text);
      expect(sent(small)).toBeLessThanOrEqual(sent(packFormat1(text)));
      expect(sent(small)).toBeLessThanOrEqual(sent(packFormat2(text)));
      for (const [way, count] of Object.entries(waysIn(small))) used[way as Way] += count;
    }
    // Every way of writing a column was among them, many times over, but a byte at a time: that is worth it only for
    // a long column of numbers whose upper bytes are few, and here it is tried on every column of numbers it can be.
    for (const [way, count] of Object.entries(used)) if (way !== 'planes') expect(count).toBeGreaterThan(40);
  });

  it('writes a list whose objects have a few different sets of fields as a table for each set, in the order the rows came in', () => {
    // Medals, and among them jewels, which say that they are jewels where a medal says nothing.
    const medals = Array.from({ length: 60 }, (_, index) => {
      const medal = { id: index + 1, x: 3.2 + index * 1.0123456789, y: 50.123456789012 - index / 7, ball: index % 9 === 0 };
      return index % 13 === 5 ? { ...medal, jewel: true } : index === 40 ? { ...medal, jewel: true, note: 'a third set of fields' } : medal;
    });
    const text = JSON.stringify({ medals });
    const small = JSON.parse(pack(text) as string);
    expect(small.medals.$).toBe('g');
    expect(small.medals.t.map((table: { k: string[] }) => table.k)).toEqual([
      ['id', 'x', 'y', 'ball'],
      ['id', 'x', 'y', 'ball', 'jewel'],
      ['id', 'x', 'y', 'ball', 'jewel', 'note'],
    ]);
    // The order: a set of fields and how many rows in a row have it, by turns. Five medals, a jewel, twelve medals, a jewel, …
    expect(small.medals.r.slice(0, 8)).toEqual([0, 5, 1, 1, 0, 12, 1, 1]);
    expect(small.medals.r.filter((_: number, index: number) => index % 2 === 1).reduce((sum: number, count: number) => sum + count, 0)).toBe(60);
    // Fifty-four places across the field, which are worth writing a byte at a time, just.
    expect(small.medals.t[0].c[1]).toMatchObject({ n: 54, q: expect.any(Array) });
    // Five of the sixty are jewels and nothing more, and each says so with one bit.
    expect(small.medals.t[1].c[4]).toBe('b11111');
    expect(small.medals.t[2].c[5]).toEqual(['a third set of fields']);
    expect(unpack(pack(text))).toBe(text);
    expect(sent(pack(text))).toBeLessThan(bytesOf(text) / 2);
    // Two jewels side by side, a jewel first, a jewel last: every row comes back in its place.
    for (const jewels of [[0], [59], [0, 1], [20, 21, 22], [0, 30, 59], [1, 3, 5, 7, 9]]) {
      const rows = Array.from({ length: 60 }, (_, index) => (jewels.includes(index) ? { id: index, x: index / 3, jewel: true } : { id: index, x: index / 3 }));
      expect(there(rows)).toBe(JSON.stringify(rows));
      expect(JSON.parse(pack(JSON.stringify(rows)) as string).$).toBe('g');
    }
    // As many sets of fields as rows, or nearly, is not worth a table for each, and neither are more sets than eight.
    const few = [{ a: 1 }, { b: 2 }, { a: 3 }];
    expect(pack(JSON.stringify(few))).toBe(JSON.stringify(few));
    const many = Array.from({ length: 40 }, (_, index) => ({ id: index, [`field${index % 9}`]: index }));
    expect(pack(JSON.stringify(many))).toBe(JSON.stringify(many));
    expect(there(many)).toBe(JSON.stringify(many));
  });

  it('packs a machine with jewels on its tables and in the air as small as one without', { timeout: LONG }, () => {
    for (const session of [createSession(1), played(2, 20)]) {
      // A jewel on a table, whatever the play has made of the one a machine starts with, and one in the air.
      const lying = session.machine.medals.find((medal) => medal.level === 0 && medal.tier === 0 && medal.stack === 1 && !medal.ball && medal.sinceDrop < 0);
      if (lying && !session.machine.medals.some((medal) => medal.jewel)) lying.jewel = true;
      dropJewel(session.machine);
      expect(session.machine.medals.some((medal) => medal.jewel)).toBe(true);
      expect(session.machine.falling.some((medal) => medal.jewel)).toBe(true);
      expect(jewelsOnField(session.machine)).toBeGreaterThanOrEqual(2);
      const text = serialize(session);
      const small = pack(text) as string;
      expect(unpack(small)).toBe(text);
      expect(sent(small)).toBeLessThan(bytesOf(text) / 2);
      expect(serialize(restore(unpack(small), 1) as Session)).toBe(text);
      // The same machine with its jewels taken off is no smaller on its way than a few hundred bytes.
      const without = JSON.parse(text) as { machine: { medals: { jewel?: boolean }[]; falling: { jewel?: boolean }[] } };
      without.machine.medals = without.machine.medals.filter((medal) => !medal.jewel);
      without.machine.falling = without.machine.falling.filter((medal) => !medal.jewel);
      expect(sent(small) - sent(pack(JSON.stringify(without)))).toBeLessThan(600);
    }
  });

  it('packs the payout works as it packs everything else: the doors, the tubes and the medals that were poured', () => {
    // A prize pouring out of the hopper's doors while another is stacked as two towers in the tubes.
    const session = createSession(4, { balls: 0 });
    queuePayout(session.machine, 80);
    buildTowers(session.machine, 75);
    session.paidOut += 155;
    for (let i = 0; i < 300 && !(session.machine.hopper.phase === 'pouring' && session.machine.hopper.poured >= 12); i++) advance(session, DT);
    const { machine } = session;
    expect(machine.hopper).toMatchObject({ phase: 'pouring', pours: 1 });
    expect(machine.stacker.tubes.map(towersIn)).toEqual([1, 1]);
    expect(machine.stacker.tubes.every((tube) => tube.phase === 'stacking' && tube.stacked > 0)).toBe(true);
    const pouring = machine.falling.filter((medal) => medal.source === 'pour');
    expect(pouring.length).toBeGreaterThanOrEqual(10);
    const text = serialize(session);
    const small = pack(text) as string;
    expect(unpack(small)).toBe(text);
    expect(sent(small)).toBeLessThan(bytesOf(text) / 2);
    // The tubes are a table like the medals, the doors are four fields as they were written, and what was poured says so in its column.
    const packed = JSON.parse(small) as { machine: { hopper: unknown; stacker: { tubes: { $: string; k: string[] } }; falling: { $: string; k: string[]; c: unknown[] } } };
    expect(packed.machine.hopper).toEqual(machine.hopper);
    expect(packed.machine.stacker.tubes.$).toBe('t');
    expect(packed.machine.stacker.tubes.k).toEqual(['phase', 'clock', 'stacked', 'size', 'waiting', 'tower']);
    expect(packed.machine.falling.$).toBe('t');
    // Where each medal in the air came from is written once for each source, and each medal says which in a bit or two.
    const sources = packed.machine.falling.c[packed.machine.falling.k.indexOf('source')] as { d: string[]; n: number; i?: string };
    expect(sources.d).toContain('pour');
    expect(sources.n).toBe(machine.falling.length);
    const width = sources.d.length > 2 ? 2 : sources.d.length - 1;
    const places = sources.i === undefined ? new Array<number>(sources.n).fill(0) : numbersIn(sources.i, width, sources.n);
    expect(places.filter((place) => sources.d[place] === 'pour')).toHaveLength(pouring.length);
    // And what comes back is the same machine, which plays on as the one that was packed does.
    const back = restore(unpack(small), 1) as Session;
    expect(serialize(back)).toBe(text);
    session.machine.rng = seededRng(5);
    back.machine.rng = seededRng(5);
    for (let i = 0; i < 180; i++) {
      advance(session, DT);
      advance(back, DT);
    }
    expect(serialize(back)).toBe(serialize(session));
  });

  it('packs the lucky lamp’s two numbers with the rest of a session’s, and they come back as they were', { timeout: LONG }, () => {
    /** A machine with both rails held down from the start, at the first moment `when` says. */
    const caught = (when: (session: Session) => boolean): Session => {
      const session = createSession(20261014, { balls: 0 });
      for (let i = 0; i < 150 * 60 && !when(session); i++) {
        if (session.credits === 0) refill(session);
        insert(session, 0);
        insert(session, 1);
        advance(session, DT);
      }
      if (!when(session)) throw new Error('no such moment');
      return session;
    };
    // A spin the lamp alone made gold, with the wings shut; and chance time, the wings open, with spins the lamp and the wings made gold among those held.
    const lamp = caught((session) => session.lucky >= 1 && session.gold >= 1 && !session.rush);
    const rush = caught((session) => session.rush && session.gold >= 2 && session.lucky >= 2);
    expect([lamp.rush, lamp.gilded]).toEqual([false, 0]);
    expect(rush.gilded).toBeGreaterThanOrEqual(1);
    for (const session of [lamp, rush]) {
      const text = serialize(session);
      const small = pack(text) as string;
      expect(unpack(small)).toBe(text);
      expect(sent(small)).toBeLessThan(bytesOf(text) / 2);
      // A session's numbers are no table: they travel as they were written, the lamp's two among them, where a session
      // holds them. The medals on their tongues are a list, which is a table once two are riding.
      const written = JSON.parse(text) as { version: number; session: Record<string, unknown> };
      const packed = JSON.parse(small) as { version: number; session: Record<string, unknown> };
      expect(packed.version).toBe(STORAGE_VERSION);
      const { riding: _packedRiders, ...packedNumbers } = packed.session;
      const { riding: _writtenRiders, ...writtenNumbers } = written.session;
      expect(JSON.stringify(packedNumbers)).toBe(JSON.stringify(writtenNumbers));
      expect([packed.session.lucky, packed.session.rush]).toEqual([session.lucky, session.rush]);
      const keys = Object.keys(packed.session);
      expect(keys.slice(keys.indexOf('gilded'), keys.indexOf('chance') + 1)).toEqual(['gilded', 'lucky', 'rush', 'chance']);
      // And what comes back is the same machine, which plays on as the one that was packed does.
      const back = restore(unpack(small), 1) as Session;
      expect(serialize(back)).toBe(text);
      expect([back.lucky, back.rush, back.gold, back.gilded, back.chance]).toEqual([session.lucky, session.rush, session.gold, session.gilded, session.chance]);
      session.machine.rng = seededRng(5);
      back.machine.rng = seededRng(5);
      for (let i = 0; i < 180; i++) {
        advance(session, DT);
        advance(back, DT);
      }
      expect(serialize(back)).toBe(serialize(session));
      // And on its way to the account and back, in the format a copy is written in now.
      const state = toCloud(text, 'a-made-up-mark', 0);
      expect(state?.format).toBe(PACK_FORMAT);
      expect(fromCloud(JSON.parse(JSON.stringify(state)))?.text).toBe(text);
    }
  });

  it('packs the medals on their tongues as the table they are, and they come back as they were', { timeout: LONG }, () => {
    // Both rails held down from the start until three medals are on their way to a pocket at once, a lit one's and an unlit one's among them.
    const session = createSession(20261014, { balls: 0 });
    const mixed = (): boolean => session.riding.length >= 3 && session.riding.some((rider) => rider.lit) && session.riding.some((rider) => !rider.lit);
    for (let i = 0; i < 300 * 60 && !mixed(); i++) {
      if (session.credits === 0) refill(session);
      insert(session, 0);
      insert(session, 1);
      advance(session, DT);
    }
    expect(mixed()).toBe(true);
    const text = serialize(session);
    const small = pack(text) as string;
    expect(unpack(small)).toBe(text);
    // A list of riders is a list of objects that all have the same fields: it is written as those fields once and a column for each.
    const packed = JSON.parse(small) as { version: number; session: { riding: Record<string, unknown> } };
    expect(packed.version).toBe(STORAGE_VERSION);
    expect(packed.session.riding).toMatchObject({ $: 't', k: ['gate', 'lit', 'left'] });
    expect(packed.session.riding.c).toHaveLength(3);
    // What comes back is the same machine, its riders with it, and it plays on as the one that was packed does.
    const back = restore(unpack(small), 1) as Session;
    expect(serialize(back)).toBe(text);
    expect(back.riding).toEqual(session.riding);
    session.machine.rng = seededRng(5);
    back.machine.rng = seededRng(5);
    for (let i = 0; i < 180; i++) {
      advance(session, DT);
      advance(back, DT);
    }
    expect(serialize(back)).toBe(serialize(session));
    // And on its way to the account and back, in the format a copy is written in now.
    const state = toCloud(text, 'a-made-up-mark', 0);
    expect(state?.format).toBe(PACK_FORMAT);
    expect(fromCloud(JSON.parse(JSON.stringify(state)))?.text).toBe(text);
    // A save with none on its way has an empty list, which is no table and travels as it is.
    const none = JSON.parse(pack(serialize(createSession(3))) as string) as { session: Record<string, unknown> };
    expect(none.session.riding).toEqual([]);
  });

  it('carries a save written before a medal rode to its pocket, and it comes back with none on its way', () => {
    const save = beforeRide.save;
    const small = pack(save) as string;
    expect(sent(small)).toBeLessThan(bytesOf(save) / 2);
    expect(unpack(small)).toBe(save);
    // It travels as that version wrote it: its number, and no word of riders.
    const packed = JSON.parse(small) as { version: number; session: Record<string, unknown> };
    expect(packed.version).toBe(VERSION_BEFORE_RIDE);
    expect(packed.session).not.toHaveProperty('riding');
    const back = restore(unpack(small), 7) as Session;
    expect(back.riding).toEqual([]);
    expect(serialize(back)).toBe(serialize(restore(save, 7) as Session));
    // Written again it is a save of today's version, and that travels too.
    const today = serialize(back);
    expect(JSON.parse(today).version).toBe(STORAGE_VERSION);
    expect(unpack(pack(today))).toBe(today);
  });

  it('carries a save written the day before the lucky lamp, and it comes back in chance time with none of its gold spins the lamp’s', () => {
    const save = dayBeforeLamp.save;
    const small = pack(save) as string;
    expect(sent(small)).toBeLessThan(bytesOf(save) / 2);
    expect(unpack(small)).toBe(save);
    // It travels as that version wrote it: its number, and no word of the lamp.
    const packed = JSON.parse(small) as { version: number; session: Record<string, unknown> };
    expect(packed.version).toBe(VERSION_BEFORE_LAMP);
    for (const key of ['lucky', 'rush']) expect(packed.session).not.toHaveProperty(key);
    const back = restore(unpack(small), 7) as Session;
    expect(back).toMatchObject({ lucky: 0, rush: true, chance: true });
    expect(serialize(back)).toBe(serialize(restore(save, 7) as Session));
    // Written again it is a save of today's version, and that travels too.
    const today = serialize(back);
    expect(JSON.parse(today).version).toBe(STORAGE_VERSION);
    expect(unpack(pack(today))).toBe(today);
  });

  it('leaves alone what is not a table, and keeps the order of every field', () => {
    const odd = {
      z: 1,
      a: [1, 2, 3],
      mixed: [{ a: 1 }, { b: 2 }],
      shuffled: [
        { a: 1, b: 2 },
        { b: 2, a: 1 },
      ],
      one: [{ only: true }],
      none: [],
      empty: [{}, {}],
      nested: [
        { id: 1, inside: { x: 1.5, list: [{ p: 1, q: [1, 2] }, { p: 2, q: [] }] }, tags: ['a', 'b'] },
        { id: 2, inside: null, tags: [] },
      ],
      texts: [
        { s: 'quote " and \\ slash', n: null },
        { s: 'メダル 🪙', n: null },
      ],
      deep: { deeper: { deepest: [{ k: 0.1, v: false }, { k: 0.2, v: true }] } },
    };
    expect(there(odd)).toBe(JSON.stringify(odd));
  });

  it('keeps an object that has the marking field of its own, and one with a field named like the prototype', () => {
    const tricky = { $: 't', k: ['x'], c: [[1]], inner: [{ $: 'o', v: 1 }, { $: 'o', v: 2 }], list: [{ $: 1 }] };
    expect(there(tricky)).toBe(JSON.stringify(tricky));
    const proto = '{"rows":[{"__proto__":1,"constructor":2.5},{"__proto__":3,"constructor":4.5}],"__proto__":{"x":1}}';
    expect(unpack(pack(proto))).toBe(proto);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('writes a number that JSON cannot keep the sign of the way JSON writes it', () => {
    // −0 is written 0 by JSON. A column holding one is left as a list, so the text is the same either way.
    const rows = [
      { x: -0, y: 0.123456789012345 },
      { x: 1.123456789012345, y: 2.123456789012345 },
    ];
    expect(there(rows)).toBe(JSON.stringify(rows));
  });

  it.each(OLDER)('carries a save written %s, and it comes back as the machine it was', (_name, save) => {
    const small = pack(save);
    expect(small).not.toBeNull();
    expect(sent(small)).toBeLessThan(bytesOf(save) / 2);
    expect(unpack(small)).toBe(save);
    const [original, travelled] = [restore(save, 7), restore(unpack(small), 7)];
    expect(original).not.toBeNull();
    expect(serialize(travelled as Session)).toBe(serialize(original as Session));
  });

  it.each([
    ['a prize pouring out of the hopper’s doors', pouring, (session: Session) => session.machine.hopper.phase === 'pouring' && session.machine.falling.filter((medal) => medal.source === 'pour').length >= 20],
    ['towers in the tubes and one on its arm', lifting, (session: Session) => session.machine.stacker.tubes.some((tube) => tube.phase === 'pushing') && medalsInTubes(session.machine.stacker) > 0 && session.machine.medals.some((medal) => medal.stack > 1)],
    ['jewels on the table and one in the air', jewelled, (session: Session) => session.machine.medals.some((medal) => medal.jewel) && session.machine.falling.some((medal) => medal.jewel)],
  ])('carries a machine with %s, and it comes back as the machine it was', { timeout: LONG }, (_name, make, isThat) => {
    const session = make();
    expect(isThat(session)).toBe(true);
    const text = serialize(session);
    expect((JSON.parse(text) as { version: number }).version).toBe(STORAGE_VERSION);
    const small = pack(text) as string;
    expect(unpack(small)).toBe(text);
    expect(sent(small)).toBeLessThan(bytesOf(text) / 3);
    // What comes back is that machine, and plays on as the one that was packed does.
    const back = restore(unpack(small), 1) as Session;
    expect(serialize(back)).toBe(text);
    session.machine.rng = seededRng(5);
    back.machine.rng = seededRng(5);
    for (let i = 0; i < 240; i++) {
      advance(session, DT);
      advance(back, DT);
    }
    expect(serialize(back)).toBe(serialize(session));
    // And on its way to the account and back.
    const state = toCloud(text, 'a-made-up-mark', 0);
    expect(state?.format).toBe(PACK_FORMAT);
    expect(fromCloud(JSON.parse(JSON.stringify(state)))?.text).toBe(text);
  });
});

// ── Format 1, which is on players' accounts ─────────────────────────────────

describe('a copy packed before format 2', () => {
  const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

  it('is read from the account as the save it was: two copies that main’s own packer wrote', () => {
    expect(inFormat1.copies).toHaveLength(2);
    for (const copy of inFormat1.copies) {
      expect(copy.state.format).toBe(1);
      const read = fromCloud(JSON.parse(JSON.stringify(copy.state)));
      expect(read?.mark).toBe(copy.state.mark);
      const text = read?.text as string;
      // The fixture says how long the text is in characters, as a string's length counts them.
      expect(text).toHaveLength(copy.length);
      expect(sha256(text)).toBe(copy.sha256);
      // It is a machine, and the same one whichever way it travels from here on.
      const machine = restore(text, 3);
      expect(machine).not.toBeNull();
      expect(unpack(pack(text))).toBe(text);
    }
    // The first is a save there is a fixture of, and comes back as that save, character for character: jewels and all.
    const [first, second] = inFormat1.copies;
    expect(fromCloud(first.state)?.text).toBe(withJewels.save);
    expect(first.state.data).toContain('"$":"g"');
    // The second has the payout works at work in it, three towers coming up on lifts in the pusher's deck. It was
    // written the day before the lucky lamp, so the text `serialize` writes for that machine today is no longer the
    // copy's own, as it was on that day: it is the copy's with today's version on it, the lamp's two numbers among
    // the session's, none of its spins the lamp's and no chance time, since it holds no gold spin, and no medal on a
    // tongue, since that game counted a medal as it came over the lip. And its field is today's: there are no lifts
    // now, and the three towers they held are given back to the tubes to be stacked again, every medal of them.
    // With those taken out again, the session is the copy's to the character.
    const copied = fromCloud(second.state)?.text as string;
    const works = restore(copied, 3) as Session;
    const then = JSON.parse(copied) as { version: number; machine: { medals: { id: number; stack: number; grow: number }[]; lifts: { id: number; sunk: number }[] }; session: Record<string, unknown> & { jackpot: number; jackpotProgress: number } };
    expect(then.version).toBe(7);
    expect(works.machine.hopper.phase).toBe('pouring');
    const held = then.machine.lifts.filter((lift) => lift.sunk < 0).map((lift) => then.machine.medals.find((medal) => medal.id === lift.id));
    expect(held).toHaveLength(3);
    expect(medalsInTubes(works.machine.stacker)).toBe(held.reduce((sum, tower) => sum + (tower ? tower.stack + tower.grow : 0), 0));
    expect(works.machine.stacker.tubes.map(towersIn).reduce((sum, towers) => sum + towers, 0)).toBe(3);
    expect(works.machine.medals.some((medal) => held.some((tower) => tower?.id === medal.id))).toBe(false);
    expect(jewelsOnField(works.machine)).toBe(3);
    // Not a medal more or less than the copy had, in its towers, on its tables, in the air and waiting to be paid.
    const before = restore(copied, 3) as Session;
    expect(medalsOnField(works.machine)).toBe(medalsOnField(before.machine));
    const today = JSON.parse(serialize(works)) as { version: number; session: Record<string, unknown> };
    const { lucky, rush, riding, ...numbers } = today.session;
    expect([works.gold, works.chance]).toEqual([0, false]);
    expect([today.version, lucky, rush, riding]).toEqual([STORAGE_VERSION, 0, false, []]);
    // Its jackpot is today's as well: the copy's stood below where one starts now, and is brought up to it, a medal
    // more for each of today's steps its progress had in it. With the copy's own two numbers put back, the session is
    // the copy's.
    expect(then.session.jackpot).toBeLessThan(JACKPOT_START);
    expect([works.jackpot, works.jackpotProgress]).toEqual([JACKPOT_START + Math.floor(then.session.jackpotProgress / JACKPOT_STEP), then.session.jackpotProgress % JACKPOT_STEP]);
    expect({ ...numbers, jackpot: then.session.jackpot, jackpotProgress: then.session.jackpotProgress }).toEqual(then.session);
    void VERSION_BEFORE_LAMP;
  });

  it('is read whatever machine it holds: new, played, with the works at work, with jewels, and of every older version', { timeout: LONG }, () => {
    const texts = [createSession(1), played(2, 20), played(3, 45), pouring(), lifting(), jewelled()].map(serialize).concat(OLDER.map(([, save]) => save));
    for (const text of texts) {
      const before = packFormat1(text) as string;
      // Through the reader for format 1, and from the account in a copy that says it is format 1.
      expect(unpack(before, 1)).toBe(text);
      expect(fromCloud({ format: 1, mark: 'a-made-up-mark', changedAt: 0, data: before })).toEqual({ text, mark: 'a-made-up-mark' });
      // Format 2 is smaller for every one of them, and holds the same text.
      const now = pack(text) as string;
      expect(sent(now)).toBeLessThan(sent(before) * 0.8);
      expect(unpack(now)).toBe(text);
    }
  });

  it('is read exactly as format 1’s own reader read it, damaged or not', { timeout: LONG }, () => {
    const random = seededRng(8);
    const junk = ['', '0', '"', '{', '}', '[', ']', ',', ':', 'null', 'f', 'b', '$', '=', 'A', '\\', '{"d":[1],"n":2}'];
    let read = 0;
    for (const text of [serialize(played(4, 10)), serialize(jewelled()), withJewels.save]) {
      const good = packFormat1(text) as string;
      expect(unpack(good, 1)).toBe(unpackFormat1(good));
      for (let i = 0; i < 300; i++) {
        const at = Math.floor(random() * good.length);
        const damaged = random() < 0.5 ? good.slice(0, at) + good.slice(at + 1 + Math.floor(random() * 8)) : good.slice(0, at) + junk[Math.floor(random() * junk.length)] + good.slice(at);
        const was = unpackFormat1(damaged);
        expect(unpack(damaged, 1)).toBe(was);
        if (was !== null) read += 1;
      }
    }
    expect(read).toBeGreaterThan(0);
    expect(read).toBeLessThan(900);
  });

  it('is not taken for a copy of another format, nor one of another for it: a copy is read in the format it says it is in', { timeout: LONG }, () => {
    const text = serialize(played(2, 20));
    const [first, second, now] = [packFormat1(text) as string, packFormat2(text) as string, pack(text) as string];
    // A copy written today has columns that the formats before it never had. Read as either it is no copy at all,
    // which is also what a page still running yesterday's code makes of it.
    expect(waysIn(now).planes).toBeGreaterThan(0);
    for (const format of [1, 2]) {
      expect(unpack(now, format)).toBeNull();
      expect(fromCloud({ format, mark: 'm', changedAt: 0, data: now })).toBeNull();
    }
    expect(unpackFormat1(now)).toBeNull();
    expect(unpackFormat2(now)).toBeNull();
    expect(fromCloud({ format: PACK_FORMAT, mark: 'm', changedAt: 0, data: now })?.text).toBe(text);
    // So has a copy of format 2, which format 1 never had: it is not read as format 1.
    expect(waysIn(second).few + waysIn(second).whole).toBeGreaterThan(0);
    expect(unpack(second, 1)).toBeNull();
    expect(unpackFormat1(second)).toBeNull();
    // Every way an earlier format wrote a column is still a way of writing one, so its copies need no reader of their own.
    expect(waysIn(first)).toMatchObject({ few: 0, whole: 0, planes: 0 });
    expect(waysIn(second)).toMatchObject({ planes: 0 });
    expect(unpack(first, PACK_FORMAT)).toBe(text);
    expect(unpack(second, PACK_FORMAT)).toBe(text);
    // What is written now says so, and a format nobody has written yet is not read as anything.
    expect(PACK_FORMAT).toBe(3);
    expect(CLOUD_FORMAT).toBe(PACK_FORMAT);
    expect(toCloud(text, 'm', 0)?.format).toBe(3);
    for (const format of [0, 4, 2.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const copy of [first, second, now]) expect(unpack(copy, format)).toBeNull();
      expect(fromCloud({ format, mark: 'm', changedAt: 0, data: now })).toBeNull();
    }
    for (const format of ['3', null, undefined, [3], { is: 3 }]) expect(fromCloud({ format, mark: 'm', changedAt: 0, data: now })).toBeNull();
  });
});

// ── Format 2, which is on players' accounts too ─────────────────────────────

describe('a copy packed before format 3', () => {
  const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

  it('is read from the account as the save it was: two copies that main’s own packer wrote', () => {
    expect(inFormat2.copies).toHaveLength(2);
    for (const copy of inFormat2.copies) {
      expect(copy.state.format).toBe(2);
      const read = fromCloud(JSON.parse(JSON.stringify(copy.state)));
      expect(read?.mark).toBe(copy.state.mark);
      const text = read?.text as string;
      // The fixture says how long the text is in characters, as a string's length counts them.
      expect(text).toHaveLength(copy.length);
      expect(sha256(text)).toBe(copy.sha256);
      // Format 2's own reader makes the same of it; it is a machine; and packed today it is fewer bytes on its way.
      expect(unpackFormat2(copy.state.data)).toBe(text);
      expect(restore(text, 3)).not.toBeNull();
      expect(unpack(pack(text))).toBe(text);
      expect(sent(pack(text))).toBeLessThan(sent(copy.state.data));
    }
    // The first is a save there is a fixture of, and comes back as that save, character for character.
    expect(fromCloud(inFormat2.copies[0].state)?.text).toBe(beforeTubes.save);
  });

  it('is read whatever machine it holds: new, played, with the works at work, with jewels, and of every older version', { timeout: LONG }, () => {
    const texts = [createSession(1), played(2, 20), played(3, 45), pouring(), lifting(), jewelled()].map(serialize).concat(OLDER.map(([, save]) => save));
    for (const text of texts) {
      const before = packFormat2(text) as string;
      // Through the reader for format 2, and from the account in a copy that says it is format 2.
      expect(unpack(before, 2)).toBe(text);
      expect(fromCloud({ format: 2, mark: 'a-made-up-mark', changedAt: 0, data: before })).toEqual({ text, mark: 'a-made-up-mark' });
      // Format 3 is no bigger for any of them, and holds the same text.
      const now = pack(text) as string;
      expect(sent(now)).toBeLessThanOrEqual(sent(before));
      expect(unpack(now)).toBe(text);
    }
  });

  it('is read exactly as format 2’s own reader read it, damaged or not', { timeout: LONG }, () => {
    const random = seededRng(9);
    const junk = ['', '0', '"', '{', '}', '[', ']', ',', ':', 'null', 'f', 'b', '$', '=', 'A', '\\', 'd', 'n', 'i', 'm', 'w', 'q', 'v', '"n":9', '"w":3'];
    let read = 0;
    for (const text of [serialize(played(4, 10)), serialize(jewelled()), beforeTubes.save]) {
      const good = packFormat2(text) as string;
      expect(unpack(good, 2)).toBe(unpackFormat2(good));
      for (let i = 0; i < 300; i++) {
        const at = Math.floor(random() * good.length);
        const damaged = random() < 0.5 ? good.slice(0, at) + good.slice(at + 1 + Math.floor(random() * 8)) : good.slice(0, at) + junk[Math.floor(random() * junk.length)] + good.slice(at);
        const was = unpackFormat2(damaged);
        expect(unpack(damaged, 2)).toBe(was);
        if (was !== null) read += 1;
      }
    }
    expect(read).toBeGreaterThan(0);
    expect(read).toBeLessThan(900);
  });
});

describe('what is not a packed save', () => {
  it('is not packed when it is not JSON, and not unpacked when it is not text', () => {
    expect(pack('')).toBeNull();
    expect(pack('{')).toBeNull();
    expect(pack('medals')).toBeNull();
    for (const value of [null, undefined, 42, true, {}, [], () => '{}']) expect(unpack(value)).toBeNull();
  });

  const broken: [string, unknown][] = [
    ['text that is not JSON', '{"$":"t"'],
    ['a table with no columns', { $: 't', k: ['x'] }],
    ['a table with no fields', { $: 't', k: [], c: [] }],
    ['a table with more fields than columns', { $: 't', k: ['x', 'y'], c: [[1]] }],
    ['a table whose columns are of different lengths', { $: 't', k: ['x', 'y'], c: [[1, 2], [1]] }],
    ['a table whose field is not a name', { $: 't', k: [1], c: [[1]] }],
    ['a column that is a number', { $: 't', k: ['x'], c: [5] }],
    ['a column of bytes that is not base64', { $: 't', k: ['x'], c: ['f!!!!'] }],
    ['a column of bytes that is not a whole number of numbers', { $: 't', k: ['x'], c: ['fAAAA'] }],
    ['a column of bytes holding what is not a number', { $: 't', k: ['x'], c: [`f${btoa(String.fromCharCode(0, 0, 0, 0, 0, 0, 0xf8, 0x7f))}`] }],
    ['a column of bytes holding an infinity', { $: 't', k: ['x'], c: [`f${btoa(String.fromCharCode(0, 0, 0, 0, 0, 0, 0xf0, 0x7f))}`] }],
    ['a column of bits with a 2 in it', { $: 't', k: ['x'], c: ['b0121'] }],
    ['a column written some other way', { $: 't', k: ['x'], c: ['zzzz'] }],
    ['tables for sets of fields with no order to them', { $: 'g', t: [{ k: ['x'], c: [[1]] }, { k: ['y'], c: [[2]] }] }],
    ['an order with no tables', { $: 'g', r: [0, 1, 1, 1] }],
    ['an order for a single table', { $: 'g', r: [0, 1], t: [{ k: ['x'], c: [[1]] }] }],
    ['an order that names a table there is not', { $: 'g', r: [0, 1, 2, 1], t: [{ k: ['x'], c: [[1]] }, { k: ['y'], c: [[2]] }] }],
    ['an order that takes more rows than a table has', { $: 'g', r: [0, 2, 1, 1], t: [{ k: ['x'], c: [[1]] }, { k: ['y'], c: [[2]] }] }],
    ['an order that leaves a row of a table out', { $: 'g', r: [0, 1, 1, 1], t: [{ k: ['x'], c: [[1, 5]] }, { k: ['y'], c: [[2]] }] }],
    ['an order with a run of no rows', { $: 'g', r: [0, 1, 1, 0, 1, 1], t: [{ k: ['x'], c: [[1]] }, { k: ['y'], c: [[2]] }] }],
    ['an order with half a run', { $: 'g', r: [0, 1, 1], t: [{ k: ['x'], c: [[1]] }, { k: ['y'], c: [[2]] }] }],
    ['an order that is not whole numbers', { $: 'g', r: [0, 1.5, 1, 1], t: [{ k: ['x'], c: [[1, 5]] }, { k: ['y'], c: [[2]] }] }],
    ['an order in words', { $: 'g', r: ['0', '1', '1', '1'], t: [{ k: ['x'], c: [[1]] }, { k: ['y'], c: [[2]] }] }],
    ['a table for a set of fields that has no rows', { $: 'g', r: [0, 1], t: [{ k: ['x'], c: [[1]] }, { k: ['y'], c: [[]] }] }],
    ['a table for a set of fields that is not a table', { $: 'g', r: [0, 1, 1, 1], t: [{ k: ['x'], c: [[1]] }, [2]] }],
    ['a mark of no kind', { $: 'q', v: {} }],
    ['a wrapped object that is not an object', { $: 'o', v: [1, 2] }],
    ['a wrapped object with nothing in it', { $: 'o' }],
    ['a broken table inside a good one', { $: 't', k: ['x'], c: [[{ $: 't', k: ['y'] }]] }],
  ];

  it.each(broken)('gives nothing for %s, and does not throw', (_name, value) => {
    expect(unpack(typeof value === 'string' ? value : JSON.stringify(value))).toBeNull();
    expect(unpack(typeof value === 'string' ? value : JSON.stringify(value), 1)).toBeNull();
  });

  /** A table of one column, written as given. */
  const tableOf = (column: unknown): string => JSON.stringify({ $: 't', k: ['x'], c: [column] });

  it('reads a column written in bits by hand as what it says', () => {
    // 7 8 8: two values, a bit to a cell, 0 1 1 and five bits of nothing: 0x60.
    expect(unpack(tableOf({ d: [7, 8], n: 3, i: 'YA==' }))).toBe('[{"x":7},{"x":8},{"x":8}]');
    expect(unpack(tableOf({ d: ['only'], n: 3 }))).toBe('[{"x":"only"},{"x":"only"},{"x":"only"}]');
    // 10 13 11: the smallest is 10, two bits to a cell, 00 11 01 and two of nothing: 0x34.
    expect(unpack(tableOf({ m: 10, n: 3, w: 2, i: 'NA==' }))).toBe('[{"x":10},{"x":13},{"x":11}]');
    // The few values may themselves be written any way a column is.
    expect(unpack(tableOf({ d: { m: 10, n: 3, w: 2, i: 'NA==' }, n: 4, i: 'Gw==' }))).toBe(null);
    expect(unpack(tableOf({ d: { m: 10, n: 3, w: 2, i: 'NA==' }, n: 4, i: 'GA==' }))).toBe('[{"x":10},{"x":13},{"x":11},{"x":10}]');
    expect(unpack(tableOf({ d: 'b10', n: 3, i: 'YA==' }))).toBe('[{"x":true},{"x":false},{"x":false}]');
  });

  const brokenBits: [string, unknown][] = [
    ['a few values and no count of the cells', { d: [7, 8], i: 'YA==' }],
    ['a count that is not a whole number', { d: [7, 8], n: 2.5, i: 'YA==' }],
    ['a count in words', { d: [7, 8], n: '3', i: 'YA==' }],
    ['a count of one', { d: [7], n: 1 }],
    ['a count of none', { d: [7], n: 0 }],
    ['a count below none', { d: [7], n: -3 }],
    ['a count past what a column may have', { d: [7], n: 65537 }],
    ['as many values as cells', { d: [7, 8, 9], n: 3, i: 'GA==' }],
    ['more values than cells', { d: [7, 8, 9, 6], n: 3, i: 'GA==' }],
    ['no values', { d: [], n: 3 }],
    ['one value, and bits all the same', { d: [7], n: 3, i: 'AA==' }],
    ['two values and no bits', { d: [7, 8], n: 3 }],
    ['bits that are not text', { d: [7, 8], n: 3, i: [0, 1, 1] }],
    ['bits that are not base64', { d: [7, 8], n: 3, i: '!!!!' }],
    ['bits that base64 does not write so', { d: [7, 8], n: 3, i: 'YA' }],
    ['bits with a gap in them', { d: [7, 8], n: 3, i: 'Y A==' }],
    ['too few bits for the cells', { d: [7, 8], n: 9, i: 'YA==' }],
    ['too many bits for the cells', { d: [7, 8], n: 3, i: 'YAA=' }],
    ['something in the bits left over', { d: [7, 8], n: 3, i: 'YQ==' }],
    ['a cell that is a value there is not', { d: [7, 8, 9], n: 4, i: 'Gw==' }],
    ['a few values and a smallest as well', { d: [7, 8], m: 0, n: 3, i: 'YA==' }],
    ['a few values and a width as well', { d: [7, 8], w: 1, n: 3, i: 'YA==' }],
    ['a field it has no business with', { d: [7, 8], n: 3, i: 'YA==', z: 1 }],
    ['values that are not a column', { d: 5, n: 3 }],
    ['values written some other way', { d: 'zz', n: 3 }],
    ['values that are a broken column', { d: { d: [7], n: 1 }, n: 3 }],
    ['whole numbers and no width', { m: 10, n: 3, i: 'NA==' }],
    ['a width of no bits', { m: 10, n: 3, w: 0, i: '' }],
    ['a width past thirty-two', { m: 10, n: 3, w: 33, i: 'AAAAAAAAAAAAAAAAAA==' }],
    ['a width that is not whole', { m: 10, n: 3, w: 1.5, i: 'NA==' }],
    ['a smallest that is not whole', { m: 0.5, n: 3, w: 2, i: 'NA==' }],
    ['a smallest past the whole numbers that are exact', { m: 2 ** 53, n: 3, w: 2, i: 'NA==' }],
    ['a smallest in words', { m: '10', n: 3, w: 2, i: 'NA==' }],
    // Two below the least whole number that is exact, and three above that: the numbers are exact, the smallest is not.
    ['a smallest below the whole numbers that are exact, whatever is added to it', { m: -(2 ** 53) - 2, n: 2, w: 2, i: '8A==' }],
    ['one whole number, which is never worth writing so', { m: 10, n: 1, w: 2, i: 'wA==' }],
    ['whole numbers that come to more than is exact', { m: Number.MAX_SAFE_INTEGER, n: 2, w: 1, i: 'QA==' }],
    ['whole numbers and no bits', { m: 10, n: 3, w: 2 }],
    ['whole numbers with too few bits', { m: 10, n: 5, w: 2, i: 'NA==' }],
    ['whole numbers with something in the bits left over', { m: 10, n: 3, w: 2, i: 'NQ==' }],
    ['neither values nor a smallest', { n: 3, w: 2, i: 'NA==' }],
    ['an empty object for a column', {}],
    ['nothing for a column', null],
  ];

  it.each(brokenBits)('gives nothing for a column in bits with %s, and does not throw', (_name, column) => {
    expect(unpack(tableOf(column))).toBeNull();
    // Nor inside another column, nor as the values of one.
    expect(unpack(tableOf([{ $: 't', k: ['y'], c: [column] }]))).toBeNull();
    expect(unpack(tableOf({ d: column, n: 70 }))).toBeNull();
  });

  /**
   * The numbers 1, 2 and 3 a byte at a time. Each is six bytes of nothing and then F0 3F, 00 40 and 08 40: two bits
   * a cell for the first of those two bytes, which takes three values, 00 01 10; and a bit a cell for the second, 0 1 1.
   */
  const NOTHING = Array.from({ length: 6 }, () => ({ v: [0] }));
  const oneTwoThree = (planes: unknown[] = [...NOTHING, { v: [240, 0, 8], i: 'GA==' }, { v: [63, 64], i: 'YA==' }]): { n: number; q: unknown[] } => ({ n: 3, q: planes });

  it('reads a column written a byte at a time by hand as what it says', () => {
    expect(unpack(tableOf(oneTwoThree()))).toBe('[{"x":1},{"x":2},{"x":3}]');
    // A plane may as well be its bytes as they are.
    const asBytes = (...bytes: number[]): string => btoa(String.fromCharCode(...bytes));
    const raw = oneTwoThree([...NOTHING.map(() => asBytes(0, 0, 0)), asBytes(0xf0, 0, 8), asBytes(0x3f, 0x40, 0x40)]);
    expect(unpack(tableOf(raw))).toBe('[{"x":1},{"x":2},{"x":3}]');
    // But not in a copy that says it is format 2 or 1, which never wrote so; and not by format 2's own reader.
    for (const column of [oneTwoThree(), raw]) {
      expect(unpack(tableOf(column), 2)).toBeNull();
      expect(unpack(tableOf(column), 1)).toBeNull();
      expect(unpackFormat2(tableOf(column))).toBeNull();
    }
  });

  const brokenPlanes: [string, unknown][] = [
    ['seven planes', oneTwoThree([...NOTHING, { v: [240, 0, 8], i: 'GA==' }])],
    ['nine planes', oneTwoThree([...NOTHING, { v: [240, 0, 8], i: 'GA==' }, { v: [63, 64], i: 'YA==' }, { v: [0] }])],
    ['planes that are not a list', { n: 3, q: { v: [0] } }],
    ['no planes', { n: 3 }],
    ['a plane that is a number', oneTwoThree([...NOTHING, 7, { v: [63, 64], i: 'YA==' }])],
    ['a plane that is null', oneTwoThree([...NOTHING, null, { v: [63, 64], i: 'YA==' }])],
    ['a plane of too few bytes', oneTwoThree([...NOTHING, btoa(String.fromCharCode(0xf0, 0)), { v: [63, 64], i: 'YA==' }])],
    ['a plane of too many bytes', oneTwoThree([...NOTHING, btoa(String.fromCharCode(0xf0, 0, 8, 0)), { v: [63, 64], i: 'YA==' }])],
    ['a plane that is not base64', oneTwoThree([...NOTHING, '!!!!', { v: [63, 64], i: 'YA==' }])],
    ['a plane of bytes that base64 does not write so', oneTwoThree([...NOTHING, '8AAI=', { v: [63, 64], i: 'YA==' }])],
    ['a plane whose values are not bytes', oneTwoThree([...NOTHING, { v: [240, 0, 256], i: 'GA==' }, { v: [63, 64], i: 'YA==' }])],
    ['a plane whose values are not whole', oneTwoThree([...NOTHING, { v: [240, 0, 8.5], i: 'GA==' }, { v: [63, 64], i: 'YA==' }])],
    ['a plane whose values are below nought', oneTwoThree([...NOTHING, { v: [240, 0, -8], i: 'GA==' }, { v: [63, 64], i: 'YA==' }])],
    ['a plane whose values are in words', oneTwoThree([...NOTHING, { v: ['240', '0', '8'], i: 'GA==' }, { v: [63, 64], i: 'YA==' }])],
    ['a plane with a value twice', oneTwoThree([...NOTHING, { v: [240, 0, 0], i: 'GA==' }, { v: [63, 64], i: 'YA==' }])],
    ['a plane with no values', oneTwoThree([...NOTHING, { v: [] }, { v: [63, 64], i: 'YA==' }])],
    ['a plane of more values than a byte has', oneTwoThree([...NOTHING, { v: Array.from({ length: 257 }, (_, index) => index % 256), i: 'GA==' }, { v: [63, 64], i: 'YA==' }])],
    ['a plane of one value and bits as well', oneTwoThree([{ v: [0], i: 'AA==' }, ...NOTHING.slice(1), { v: [240, 0, 8], i: 'GA==' }, { v: [63, 64], i: 'YA==' }])],
    ['a plane of three values and no bits', oneTwoThree([...NOTHING, { v: [240, 0, 8] }, { v: [63, 64], i: 'YA==' }])],
    ['a plane whose bits name a value there is not', oneTwoThree([...NOTHING, { v: [240, 0, 8], i: 'HA==' }, { v: [63, 64], i: 'YA==' }])],
    ['a plane with something in the bits left over', oneTwoThree([...NOTHING, { v: [240, 0, 8], i: 'GQ==' }, { v: [63, 64], i: 'YA==' }])],
    ['a plane with a field it has no business with', oneTwoThree([...NOTHING, { v: [240, 0, 8], i: 'GA==', z: 1 }, { v: [63, 64], i: 'YA==' }])],
    ['planes that make what is not a number', oneTwoThree([...NOTHING, { v: [248] }, { v: [127] }])],
    ['planes that make an infinity', oneTwoThree([...NOTHING, { v: [240] }, { v: [127] }])],
    ['planes that make −0, which JSON writes as 0', oneTwoThree([...NOTHING, { v: [0] }, { v: [128] }])],
    ['planes and a few values as well', { ...oneTwoThree(), d: [1] }],
    ['planes and a smallest as well', { ...oneTwoThree(), m: 1 }],
    ['planes and a width as well', { ...oneTwoThree(), w: 2 }],
    ['planes and bits of their own', { ...oneTwoThree(), i: 'GA==' }],
    ['planes and no count of the cells', { q: oneTwoThree().q }],
    ['planes for one number, which is never worth writing so', { n: 1, q: Array.from({ length: 8 }, () => ({ v: [0] })) }],
  ];

  it.each(brokenPlanes)('gives nothing for a column written a byte at a time with %s, and does not throw', (_name, column) => {
    expect(unpack(tableOf(column))).toBeNull();
    // Nor inside another column, nor as the values of one.
    expect(unpack(tableOf([{ $: 't', k: ['y'], c: [column] }]))).toBeNull();
    expect(unpack(tableOf({ d: column, n: 70 }))).toBeNull();
  });

  it('gives nothing for a column in bits in a copy that says it is format 1, sound as the column is', () => {
    for (const column of [{ d: [7, 8], n: 3, i: 'YA==' }, { d: ['only'], n: 3 }, { m: 10, n: 3, w: 2, i: 'NA==' }]) {
      expect(unpack(tableOf(column))).not.toBeNull();
      expect(unpack(tableOf(column), 1)).toBeNull();
      expect(unpackFormat1(tableOf(column))).toBeNull();
    }
  });

  it('does not unfold a copy that says a value is in more cells than a save could have', () => {
    // Sixty-five thousand cells of one value is as many as a column may say. One such column of a value fifty
    // characters long is three times the longest save that is read, and is unfolded; a hundred of them, in a copy
    // of a few thousand characters, would come to three hundred times that, and are not.
    const long = 'a value written out at some length'.padEnd(50, '.');
    const column = { d: [long], n: 65536 };
    // What a copy may unfold to is counted in characters, as a string's length counts them: it is the text built
    // here that is bounded, not anything that is sent.
    expect((unpack(tableOf(column)) as string).length).toBeGreaterThan(3_000_000);
    const many = JSON.stringify({ $: 't', k: Array.from({ length: 100 }, (_, index) => `field${index}`), c: Array.from({ length: 100 }, () => column) });
    expect(bytesOf(many)).toBeLessThan(10_000);
    const started = Date.now();
    expect(unpack(many)).toBeNull();
    expect(Date.now() - started).toBeLessThan(2_000);
    // The same of tables inside tables, and of values that are themselves tables.
    expect(unpack(tableOf({ d: [JSON.parse(tableOf(column))], n: 65536 }))).toBeNull();
    expect(unpack(JSON.stringify(Array.from({ length: 100 }, () => JSON.parse(tableOf(column)))))).toBeNull();
    // And of numbers a byte at a time: sixty-five thousand noughts to a column, each plane one value, a hundred columns.
    const noughts = { n: 65536, q: Array.from({ length: 8 }, () => ({ v: [0] })) };
    expect((unpack(tableOf(noughts)) as string).length).toBeGreaterThan(65536 * 7);
    const zeros = JSON.stringify({ $: 't', k: Array.from({ length: 100 }, (_, index) => `field${index}`), c: Array.from({ length: 100 }, () => noughts) });
    expect(bytesOf(zeros)).toBeLessThan(20_000);
    expect(unpack(zeros)).toBeNull();
  });

  it('packs what would unfold to more than that another way, and it still comes back as it was', { timeout: LONG }, () => {
    // Three columns of one long value each, a million and a half characters apiece: two of them are within what
    // columns in bits may unfold to, and the third would pass it, so that one is written cell by cell.
    const value = 'x'.repeat(58);
    const rows = Array.from({ length: 25_000 }, () => ({ a: value, b: value, c: value }));
    const text = JSON.stringify(rows);
    const small = pack(text) as string;
    const columns = (JSON.parse(small) as { c: unknown[] }).c;
    expect(columns[0]).toEqual({ d: [value], n: 25_000 });
    expect(columns[1]).toEqual({ d: [value], n: 25_000 });
    expect(Array.isArray(columns[2])).toBe(true);
    expect(unpack(small)).toBe(text);
    // A list longer than a column in bits may be is written the earlier ways too.
    const long = Array.from({ length: 70_000 }, (_, index) => ({ id: index, on: true, level: 0 }));
    const longSmall = pack(JSON.stringify(long)) as string;
    expect(waysIn(longSmall)).toMatchObject({ few: 0, whole: 0 });
    expect(unpack(longSmall)).toBe(JSON.stringify(long));
  });

  it('never throws on packed saves that have been damaged, and gives a machine or nothing', { timeout: LONG }, () => {
    const random = seededRng(5);
    const good = pack(serialize(played(4, 10))) as string;
    const junk = ['', '0', '"', '{', '}', '[', ']', ',', ':', 'null', 'f', 'b', '$', '=', 'A', '\\', 'd', 'n', 'i', 'm', 'w', '"n":9', '"w":3'];
    let read = 0;
    expect(waysIn(good).few).toBeGreaterThan(5);
    expect(waysIn(good).whole).toBeGreaterThan(0);
    for (let i = 0; i < 400; i++) {
      // Cut a piece out, or put a piece of junk in, somewhere.
      const at = Math.floor(random() * good.length);
      const damaged = random() < 0.5 ? good.slice(0, at) + good.slice(at + 1 + Math.floor(random() * 8)) : good.slice(0, at) + junk[Math.floor(random() * junk.length)] + good.slice(at);
      const text = unpack(damaged);
      if (text === null) continue;
      read += 1;
      // What unpacks is JSON again; whether it is a machine is for `restore` to say, and it does not throw either.
      expect(() => JSON.parse(text)).not.toThrow();
      expect(() => restore(text, 1)).not.toThrow();
    }
    // Some damage leaves it readable (a digit gone from a number); most does not.
    expect(read).toBeLessThan(400);
  });
});
