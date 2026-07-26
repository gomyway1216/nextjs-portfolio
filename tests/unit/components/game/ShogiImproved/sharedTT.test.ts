/**
 * Unit tests for the Lazy SMP shared transposition table (sharedTT.ts):
 * entry round-trips, the XOR consistency check, the depth-preferred
 * replacement policy ported from the WASM engine, and the generation cell
 * used to stop helper threads. Node exposes SharedArrayBuffer natively, so
 * these run without any cross-origin-isolation setup.
 */

import { describe, expect, it } from 'vitest';

import {
  SHARED_TT_BYTES,
  SHARED_TT_ENTRIES,
  SharedTT,
  createSharedTTBuffer,
  isSharedTTBuffer,
} from '@/components/game/ShogiImproved/sharedTT';

/** flagDepth encoding used by the WASM engine: flag | depth<<2 | USED bit. */
function flagDepth(flag: number, depth: number): number {
  return flag | ((depth & 0xff) << 2) | (1 << 30);
}

function makeTT(): { tt: SharedTT; scratch: Int32Array } {
  const sab = createSharedTTBuffer();
  if (!sab) throw new Error('SharedArrayBuffer unavailable in this environment');
  return { tt: new SharedTT(sab), scratch: new Int32Array(4) };
}

describe('sharedTT', () => {
  it('createSharedTTBuffer produces a buffer isSharedTTBuffer accepts', () => {
    const sab = createSharedTTBuffer();
    expect(sab).not.toBeNull();
    expect(sab!.byteLength).toBe(SHARED_TT_BYTES);
    expect(SHARED_TT_ENTRIES).toBe(1 << 20);
    expect(SHARED_TT_BYTES).toBe(33_554_496);
    expect(isSharedTTBuffer(sab)).toBe(true);
    expect(isSharedTTBuffer(new ArrayBuffer(SHARED_TT_BYTES))).toBe(false);
    expect(isSharedTTBuffer(new SharedArrayBuffer(8))).toBe(false);
  });

  it('misses on an empty table and round-trips a stored entry', () => {
    const { tt, scratch } = makeTT();
    const hashA = 0x1234abcd | 0;
    const hashB = 0x76543210 | 0;
    expect(tt.probe(hashA, hashB, scratch)).toBe(0);

    const fd = flagDepth(1, 7);
    tt.store(hashA, hashB, -321, fd, 0x00c0ffee);
    expect(tt.probe(hashA, hashB, scratch)).toBe(1);
    expect(scratch[0]).toBe(-321); // value
    expect(scratch[1]).toBe(fd); // flagDepth
    expect(scratch[2]).toBe(0x00c0ffee); // best
    expect(scratch[3]).toBe(0); // second (no previous best)
  });

  it('does not hit for a different hash mapping to the same slot', () => {
    const { tt, scratch } = makeTT();
    const hashA = 42;
    const hashB = 314;
    const aliasedA = 42 + (1 << 20); // same index (2^20 mask), different hashA
    tt.store(hashA, hashB, 5, flagDepth(0, 3), 99);
    expect(tt.probe(aliasedA, hashB, scratch)).toBe(0);
  });

  it('does not hit when hashA matches but the independent hashB differs', () => {
    const { tt, scratch } = makeTT();
    const hashA = 0x0d15ea5e;
    tt.store(hashA, 111, 5, flagDepth(0, 3), 99);
    scratch.fill(777);
    expect(tt.probe(hashA, 222, scratch)).toBe(0);
    expect([...scratch]).toEqual([777, 777, 777, 777]);
  });

  it('hash pair 0/0 round-trips (the USED bit keeps empty slots unmatchable)', () => {
    const { tt, scratch } = makeTT();
    // An all-zero table must not "hit" pair 0/0 (an empty entry XORs to 0).
    expect(tt.probe(0, 0, scratch)).toBe(0);
    tt.store(0, 0, 17, flagDepth(2, 1), 123);
    expect(tt.probe(0, 0, scratch)).toBe(1);
    expect(scratch[0]).toBe(17);
  });

  it('keeps the deeper entry for the same position (depth-preferred)', () => {
    const { tt, scratch } = makeTT();
    const hashA = 777;
    const hashB = -123;
    tt.store(hashA, hashB, 100, flagDepth(0, 8), 11);
    tt.store(hashA, hashB, 200, flagDepth(0, 3), 22); // shallower: must be ignored
    expect(tt.probe(hashA, hashB, scratch)).toBe(1);
    expect(scratch[0]).toBe(100);
    expect(scratch[2]).toBe(11);
  });

  it('promotes the old best move to `second` on same-position replacement', () => {
    const { tt, scratch } = makeTT();
    const hashA = 888;
    const hashB = 999;
    tt.store(hashA, hashB, 100, flagDepth(0, 4), 11);
    tt.store(hashA, hashB, 150, flagDepth(0, 6), 22); // deeper: replaces
    expect(tt.probe(hashA, hashB, scratch)).toBe(1);
    expect(scratch[0]).toBe(150);
    expect(scratch[2]).toBe(22); // new best
    expect(scratch[3]).toBe(11); // old best kept as ordering hint
  });

  it('a different hash pair always replaces, without inheriting `second`', () => {
    const { tt, scratch } = makeTT();
    const hashA = 42;
    const hashB = 11;
    const aliasedA = 42 + (1 << 20);
    tt.store(hashA, hashB, 100, flagDepth(0, 9), 11);
    tt.store(aliasedA, 22, 5, flagDepth(0, 1), 22); // different pair, same slot, shallow
    expect(tt.probe(hashA, hashB, scratch)).toBe(0);
    expect(tt.probe(aliasedA, 22, scratch)).toBe(1);
    expect(scratch[3]).toBe(0);
  });

  it('same hashA with a different hashB replaces even when shallower', () => {
    const { tt, scratch } = makeTT();
    const hashA = 4242;
    tt.store(hashA, 11, 100, flagDepth(0, 9), 31);
    tt.store(hashA, 22, 5, flagDepth(0, 1), 32);
    expect(tt.probe(hashA, 11, scratch)).toBe(0);
    expect(tt.probe(hashA, 22, scratch)).toBe(1);
    expect(scratch[0]).toBe(5);
    expect(scratch[2]).toBe(32);
    expect(scratch[3]).toBe(0);
  });

  it('a torn entry fails the XOR check and reads as a miss', () => {
    const sab = createSharedTTBuffer()!;
    const tt = new SharedTT(sab);
    const scratch = new Int32Array(4);
    const hashA = 0x0badf00d | 0;
    const hashB = 0x12345678 | 0;
    tt.store(hashA, hashB, 1000, flagDepth(0, 5), 77);
    // Simulate a concurrent half-written entry: flip one data word without
    // updating the check word.
    const view = new Int32Array(sab);
    const base = 16 + ((hashA & ((1 << 20) - 1)) << 3);
    view[base + 1] = view[base + 1] ^ 0x5555;
    expect(tt.probe(hashA, hashB, scratch)).toBe(0);
  });

  it('a torn secondary hash fails the pair check and reads as a miss', () => {
    const sab = createSharedTTBuffer()!;
    const tt = new SharedTT(sab);
    const scratch = new Int32Array(4);
    const hashA = 0x23456789 | 0;
    const hashB = 0x3456789a | 0;
    tt.store(hashA, hashB, -1000, flagDepth(1, 5), 88);
    const view = new Int32Array(sab);
    const base = 16 + ((hashA & ((1 << 20) - 1)) << 3);
    view[base + 5] ^= 1;
    expect(tt.probe(hashA, hashB, scratch)).toBe(0);
  });

  it('clear() drops entries but leaves the generation cell alone', () => {
    const { tt, scratch } = makeTT();
    tt.store(1, 10, 2, flagDepth(0, 2), 3);
    tt.publishGeneration(9);
    tt.clear();
    expect(tt.probe(1, 10, scratch)).toBe(0);
    expect(tt.readGeneration()).toBe(9);
  });

  it('publishes and reads the stop generation', () => {
    const { tt } = makeTT();
    expect(tt.readGeneration()).toBe(0);
    tt.publishGeneration(41);
    expect(tt.readGeneration()).toBe(41);
    tt.publishGeneration(0);
    expect(tt.readGeneration()).toBe(0);
  });

  it('rejects a buffer of the wrong size', () => {
    expect(() => new SharedTT(new SharedArrayBuffer(64))).toThrow();
  });
});
