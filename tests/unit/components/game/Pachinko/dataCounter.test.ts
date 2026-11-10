import { describe, expect, it } from 'vitest';

import { BAR_FULL, EMPTY_COUNTER, HIT_LOG, barOf, counted, landed, shareOf, type DataCounter } from '@/components/game/Pachinko/dataCounter';
import { BEST_LEFT, BEST_RIGHT, HOLDS, LOTTERY, SHOWS, busy, fire, newMachine, tick, type BallDraw, type Machine, type Tick } from '@/components/game/Pachinko/engine';

// The data counter only writes down what the machine did. Here a real machine is played, slot by slot, with the balls
// chosen, and the counter is checked against it.

const MISS = LOTTERY - 1;
const ball = (fate: number, lot = MISS, split = 99): BallDraw => ({ fate, lot, split, show: SHOWS - 1, seed: 1 });

/** A machine and its counter, played a slot at a time: every phase of a spin ends at once. */
function table() {
  const m: Machine = newMachine();
  let counter: DataCounter = EMPTY_COUNTER;
  const slot = (strength: number | null, draw?: BallDraw): Tick[] => {
    const fired = strength === null ? null : fire(m, strength, draw ?? ball(0));
    const ticks = tick(m, () => true);
    counter = counted(counter, fired, ticks);
    return ticks;
  };
  /** Runs the machine with no ball until its spins are over (not through a hit's rounds, which wait for balls). */
  const settle = () => {
    for (let guard = 0; guard < 500 && busy(m) && m.bonus === null; guard++) slot(null);
  };
  /** Plays a hit's rounds out at the best strength. */
  const rounds = () => {
    for (let guard = 0; guard < 2_000 && m.bonus; guard++) slot(m.bonus.stage === 'open' ? BEST_RIGHT : null);
  };
  return { m, slot, settle, rounds, counter: () => counter };
}

describe('the data counter', () => {
  it('starts with nothing written down', () => {
    expect(EMPTY_COUNTER).toMatchObject({ since: 0, hits: 0, longest: 0, run: 0, bestRun: 0, overflow: 0, log: [] });
    expect(landed(EMPTY_COUNTER)).toBe(0);
  });

  it('counts each spin as it starts, and the longest wait with the one going on', () => {
    const t = table();
    for (let i = 0; i < 3; i++) {
      t.slot(BEST_LEFT, ball(0));
      t.settle();
    }
    expect(t.counter()).toMatchObject({ since: 3, hits: 0, longest: 3, run: 0, bestRun: 0 });
    expect(t.counter().pockets).toEqual({ heso: 3, side: 0, denchu: 0, attacker: 0, out: 0 });
    expect(t.counter().log).toEqual([]);
  });

  it('writes a hit down with the spins it took, its own among them, and starts counting again', () => {
    const t = table();
    for (let i = 0; i < 4; i++) {
      t.slot(BEST_LEFT, ball(0));
      t.settle();
    }
    t.slot(BEST_LEFT, ball(0, 0, 0));
    t.settle();
    expect(t.m.bonus).not.toBeNull();
    expect(t.counter()).toMatchObject({ since: 0, hits: 1, longest: 5, run: 1, bestRun: 1 });
    expect(t.counter().log).toEqual([{ id: 1, kind: { rounds: 10, after: 'st' }, spins: 5, mode: 'normal', run: 1 }]);
  });

  it('counts a run of hits through ST, and ends it as normal play comes back', () => {
    const t = table();
    t.slot(BEST_LEFT, ball(0, 0, 0));
    t.settle();
    t.rounds();
    expect(t.m.mode).toBe('st');
    // A ball into the electric tulip whose hold hits: 4 rounds and ST again.
    t.slot(BEST_RIGHT, ball(0, 0, 99));
    t.settle();
    expect(t.counter()).toMatchObject({ hits: 2, run: 2, bestRun: 2, since: 0 });
    expect(t.counter().log[0]).toEqual({ id: 2, kind: { rounds: 4, after: 'st' }, spins: 1, mode: 'st', run: 2 });
    t.rounds();
    // ST runs out without a hit: the run is over, the longest run stays.
    for (let guard = 0; guard < 200 && t.m.mode !== 'normal'; guard++) {
      t.slot(BEST_RIGHT, ball(0));
      t.settle();
    }
    expect(t.m.mode).toBe('normal');
    expect(t.counter()).toMatchObject({ hits: 2, run: 0, bestRun: 2 });
    // The next hit, in normal play, begins a run of its own.
    t.settle();
    t.slot(BEST_LEFT, ball(0, 0, 99));
    t.settle();
    expect(t.counter().log[0]).toMatchObject({ id: 3, mode: 'normal', run: 1, kind: { rounds: 4, after: 'jitan' } });
    expect(t.counter().bestRun).toBe(2);
    // Ten balls a round into the attacker over fourteen rounds, the balls caught by the tulip, and the start pocket's.
    const pockets = t.counter().pockets;
    expect(pockets.attacker).toBe(140);
    expect(pockets.denchu).toBeGreaterThan(0);
    expect(landed(t.counter())).toBe(pockets.heso + pockets.side + pockets.denchu + pockets.attacker + pockets.out);
  });

  it('begins a run at a hit in normal play even where it never saw normal play come back', () => {
    const spin = (mode: 'normal' | 'st') => ({ from: 1 as const, hold: { lot: 0, split: 0, show: 0, seed: 0 }, mode, hit: true, kind: 'plain' as const, phase: 0, age: 1 });
    const hit = (mode: 'normal' | 'st'): Tick[] => [{ type: 'stop', spin: spin(mode), kind: { rounds: 4, after: 'st' } }];
    let counter = counted(EMPTY_COUNTER, null, hit('normal'));
    counter = counted(counter, null, hit('st'));
    expect(counter).toMatchObject({ run: 2, bestRun: 2 });
    // The machine went back to normal play in another tab: no `mode` tick came to this page.
    counter = counted(counter, null, hit('normal'));
    expect(counter).toMatchObject({ hits: 3, run: 1, bestRun: 2 });
    expect(counter.log.map((entry) => entry.run)).toEqual([1, 2, 1]);
  });

  it('counts a hit whose spin was already going as the visit began as one spin', () => {
    const m = newMachine();
    fire(m, BEST_LEFT, ball(0, 0, 0));
    // The spin starts before the counter is there to see it.
    expect(tick(m, () => false).map((t) => t.type)).toEqual(['start']);
    let counter = EMPTY_COUNTER;
    for (let guard = 0; guard < 20 && !m.bonus; guard++) counter = counted(counter, null, tick(m, () => true));
    expect(counter).toMatchObject({ hits: 1, since: 0, longest: 1 });
    expect(counter.log[0].spins).toBe(1);
  });

  it('counts the start pocket’s balls that took no hold: four were waiting', () => {
    const m = newMachine();
    let counter = EMPTY_COUNTER;
    // No slot of the machine runs between the balls: no hold spins.
    for (let i = 0; i < HOLDS + 2; i++) counter = counted(counter, fire(m, BEST_LEFT, ball(0)), []);
    counter = counted(counter, fire(m, BEST_LEFT, ball(127)), []);
    expect(counter.pockets).toEqual({ heso: HOLDS + 2, side: 0, denchu: 0, attacker: 0, out: 1 });
    expect(counter.overflow).toBe(2);
    expect(landed(counter)).toBe(HOLDS + 3);
  });

  it('keeps the last hits only, the latest first, and leaves the counter it was given as it was', () => {
    const hit: Tick[] = [
      { type: 'start', spin: { from: 1, hold: { lot: 0, split: 0, show: 0, seed: 0 }, mode: 'st', hit: true, kind: 'plain', phase: 0, age: 0 } },
      { type: 'stop', spin: { from: 1, hold: { lot: 0, split: 0, show: 0, seed: 0 }, mode: 'st', hit: true, kind: 'plain', phase: 0, age: 1 }, kind: { rounds: 4, after: 'st' } },
    ];
    let counter = EMPTY_COUNTER;
    for (let i = 0; i < HIT_LOG + 3; i++) {
      const before = counter;
      const snapshot = JSON.stringify(before);
      counter = counted(counter, null, hit);
      expect(JSON.stringify(before)).toBe(snapshot);
    }
    expect(counter.hits).toBe(HIT_LOG + 3);
    expect(counter.log).toHaveLength(HIT_LOG);
    expect(counter.log[0].id).toBe(HIT_LOG + 3);
    expect(counter.log[HIT_LOG - 1].id).toBe(4);
    expect(counter.bestRun).toBe(HIT_LOG + 3);
    expect(EMPTY_COUNTER.log).toEqual([]);
    expect(EMPTY_COUNTER.pockets.heso).toBe(0);
  });
});

describe('a share of the balls', () => {
  it('is a percentage to one place, and nothing of nothing', () => {
    expect(shareOf(0, 0)).toBeNull();
    expect(shareOf(0, 10)).toEqual({ value: 0, bound: null });
    expect(shareOf(1, 3)).toEqual({ value: 33.3, bound: null });
    expect(shareOf(10, 10)).toEqual({ value: 100, bound: null });
  });

  it('never reads 0.0% for a ball that did go there, nor 100.0% with a ball elsewhere', () => {
    expect(shareOf(1, 100_000)).toEqual({ value: 0.1, bound: '<' });
    expect(shareOf(1, 1_500)).toEqual({ value: 0.1, bound: null });
    expect(shareOf(99_999, 100_000)).toEqual({ value: 99.9, bound: '>' });
  });
});

describe('a hit’s bar', () => {
  it('is as long as the wait, full at twice the average, and never too thin to see', () => {
    expect(barOf(BAR_FULL / 2)).toBe(0.5);
    expect(barOf(BAR_FULL * 3)).toBe(1);
    expect(barOf(1)).toBe(0.04);
  });
});
