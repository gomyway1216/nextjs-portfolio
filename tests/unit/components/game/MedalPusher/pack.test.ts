import { describe, expect, it } from 'vitest';

import { buildTowers, dropJewel, jewelsOnField, queuePayout, seededRng } from '@/components/game/MedalPusher/engine';
import { holds } from '@/components/game/MedalPusher/lift';
import { pack, unpack } from '@/components/game/MedalPusher/pack';
import { advance, createSession, insert, refill, type Session } from '@/components/game/MedalPusher/session';
import { restore, serialize } from '@/components/game/MedalPusher/storage';

import beforeArms from './fixtures/save-before-feed-arms.json';
import beforeLeftAndRight from './fixtures/save-before-left-and-right.json';
import beforeLipChuckers from './fixtures/save-before-lip-chuckers.json';
import beforeSlots from './fixtures/save-before-the-front-slots.json';

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

/** Packs a value and unpacks it again, as the JSON it comes back as. */
const there = (value: unknown): string | null => {
  const small = pack(JSON.stringify(value));
  return small === null ? null : unpack(small);
};

describe('a packed save', () => {
  it('comes back as the very text it was made from, and is much shorter', { timeout: LONG }, () => {
    for (const session of [createSession(1), played(2, 20), played(3, 45)]) {
      const text = serialize(session);
      const small = pack(text);
      expect(small).not.toBeNull();
      expect(unpack(small)).toBe(text);
      expect((small as string).length).toBeLessThan(text.length / 2);
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

  it('writes a list of objects with the same fields as columns: bytes for positions, bits for yes and no', () => {
    const medals = Array.from({ length: 40 }, (_, index) => ({ id: index + 1, x: 3.2 + index * 1.0123456789, y: 50.123456789012 - index / 7, ball: index % 9 === 0, source: index % 2 ? 'player' : 'spill' }));
    const small = JSON.parse(pack(JSON.stringify({ medals })) as string);
    expect(small.medals.$).toBe('t');
    expect(small.medals.k).toEqual(['id', 'x', 'y', 'ball', 'source']);
    const [id, x, y, ball, source] = small.medals.c;
    // Small whole numbers are shorter in digits; long fractions are shorter as bytes.
    expect(Array.isArray(id)).toBe(true);
    expect(x).toMatch(/^f[A-Za-z0-9+/]+=*$/);
    expect(y).toMatch(/^f/);
    expect(ball).toBe(`b${medals.map((medal) => (medal.ball ? '1' : '0')).join('')}`);
    expect(source).toHaveLength(40);
    expect(there({ medals })).toBe(JSON.stringify({ medals }));
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
    expect(small.medals.t[0].c[1]).toMatch(/^f[A-Za-z0-9+/]+=*$/);
    // Five of the sixty are jewels and nothing more, and each says so with one bit.
    expect(small.medals.t[1].c[4]).toBe('b11111');
    expect(small.medals.t[2].c[5]).toEqual(['a third set of fields']);
    expect(unpack(pack(text))).toBe(text);
    expect((pack(text) as string).length).toBeLessThan(text.length / 2);
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
      dropJewel(session.machine);
      expect(session.machine.medals.some((medal) => medal.jewel)).toBe(true);
      expect(session.machine.falling.some((medal) => medal.jewel)).toBe(true);
      expect(jewelsOnField(session.machine)).toBeGreaterThanOrEqual(2);
      const text = serialize(session);
      const small = pack(text) as string;
      expect(unpack(small)).toBe(text);
      expect(small.length).toBeLessThan(text.length / 2);
      expect(serialize(restore(unpack(small), 1) as Session)).toBe(text);
      // The same machine with its jewels taken off is no smaller on its way than a few hundred characters.
      const without = JSON.parse(text) as { machine: { medals: { jewel?: boolean }[]; falling: { jewel?: boolean }[] } };
      without.machine.medals = without.machine.medals.filter((medal) => !medal.jewel);
      without.machine.falling = without.machine.falling.filter((medal) => !medal.jewel);
      expect(small.length - (pack(JSON.stringify(without)) as string).length).toBeLessThan(600);
    }
  });

  it('packs the payout works as it packs everything else: the doors, the lifts and the medals that were poured', () => {
    // A prize pouring out of the hopper's doors while another goes up as three towers on their lifts.
    const session = createSession(4, { balls: 0 });
    queuePayout(session.machine, 80);
    buildTowers(session.machine, 75);
    session.paidOut += 155;
    for (let i = 0; i < 300 && !(session.machine.hopper.phase === 'pouring' && session.machine.hopper.poured >= 12); i++) advance(session, DT);
    const { machine } = session;
    expect(machine.hopper).toMatchObject({ phase: 'pouring', pours: 1 });
    expect(machine.lifts.filter(holds)).toHaveLength(3);
    const pouring = machine.falling.filter((medal) => medal.source === 'pour');
    expect(pouring.length).toBeGreaterThanOrEqual(10);
    const text = serialize(session);
    const small = pack(text) as string;
    expect(unpack(small)).toBe(text);
    expect(small.length).toBeLessThan(text.length / 2);
    // The lifts are a table like the medals, the doors are four fields as they were written, and what was poured says so in its column.
    const packed = JSON.parse(small) as { machine: { hopper: unknown; lifts: { $: string; k: string[] }; falling: { $: string; k: string[]; c: unknown[] } } };
    expect(packed.machine.hopper).toEqual(machine.hopper);
    expect(packed.machine.lifts.$).toBe('t');
    expect(packed.machine.lifts.k).toEqual(['id', 'x', 'behind', 'size', 'wait', 'sunk']);
    expect(packed.machine.falling.$).toBe('t');
    const sources = packed.machine.falling.c[packed.machine.falling.k.indexOf('source')] as string[];
    expect(sources.filter((source) => source === 'pour')).toHaveLength(pouring.length);
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

  it.each([
    ['before the feed arms', beforeArms.save],
    ['with one aim for both arms', beforeLeftAndRight.save],
    ['before the chuckers were on the lip', beforeLipChuckers.save],
    ['before the slots were at the front', beforeSlots.save],
  ])('carries a save written %s, and it comes back as the machine it was', (_name, save) => {
    const small = pack(save);
    expect(small).not.toBeNull();
    expect((small as string).length).toBeLessThan(save.length / 2);
    expect(unpack(small)).toBe(save);
    const [original, travelled] = [restore(save, 7), restore(unpack(small), 7)];
    expect(original).not.toBeNull();
    expect(serialize(travelled as Session)).toBe(serialize(original as Session));
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
  });

  it('never throws on packed saves that have been damaged, and gives a machine or nothing', { timeout: LONG }, () => {
    const random = seededRng(5);
    const good = pack(serialize(played(4, 10))) as string;
    const junk = ['', '0', '"', '{', '}', '[', ']', ',', ':', 'null', 'f', 'b', '$', '=', 'A', '\\'];
    let read = 0;
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
