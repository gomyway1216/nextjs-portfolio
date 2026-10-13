import { describe, expect, it } from 'vitest';

import { seededRng } from '@/components/game/MedalPusher/engine';
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
