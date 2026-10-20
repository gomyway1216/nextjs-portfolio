import { describe, expect, it } from 'vitest';

import {
  ATTACKER,
  BALL_NUMBERS,
  BEST_LEFT,
  BEST_RIGHT,
  COUNT,
  DEFAULT_STRENGTH,
  DENCHU,
  ENDING_SLOTS,
  FANFARE_SLOTS,
  FATE_SLOTS,
  FIRST_RIGHT,
  HESO,
  HIT_NORMAL,
  HIT_ST,
  HOLDS,
  INTERVAL_SLOTS,
  JITAN_SPINS,
  LOTTERY,
  SHOWS,
  SIDE,
  SPLIT_DENCHU,
  SPLIT_HESO,
  STRENGTHS,
  ST_SPINS,
  attackerOpen,
  copyMachine,
  drawBall,
  endsAt,
  fire,
  helping,
  hitKindOf,
  hitLabel,
  hitMedals,
  newMachine,
  numbersForBall,
  parseMachine,
  phaseChances,
  rushPrize,
  shootRight,
  spinKindOf,
  spinUnit,
  tick,
  type BallDraw,
  type Machine,
} from '@/components/game/Pachinko/engine';
import { analyze, valueOf } from '@/components/game/Pachinko/analysis';

// Goldfish Lantern Pachinko's rules, slot by slot. Its exact returns are pinned in published.test.tsx; here the board,
// the draw and the machine are pinned, and the returns are checked by playing.

const ball = (fate: number, lot = LOTTERY - 1, split = 99, show = SHOWS - 1, seed = 1): BallDraw => ({ fate, lot, split, show, seed });
const seeded = (seed: number) => {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe('the board', () => {
  it('has seven strengths, four left and three right, whose throws fit the nails', () => {
    expect(STRENGTHS).toBe(7);
    expect(FIRST_RIGHT).toBe(4);
    for (let s = 0; s < STRENGTHS; s++) {
      expect(HESO[s] + SIDE[s]).toBeLessThanOrEqual(FATE_SLOTS);
      expect(DENCHU[s]).toBeLessThanOrEqual(FATE_SLOTS);
      expect(ATTACKER[s]).toBeLessThanOrEqual(FATE_SLOTS);
      // A side of the board each: left balls never reach the 電チュー or the attacker, right ones never the ヘソ.
      if (s < FIRST_RIGHT) expect(DENCHU[s] + ATTACKER[s]).toBe(0);
      else expect(HESO[s] + SIDE[s]).toBe(0);
    }
    // The best of each side is the one the hands aim at, and the handle starts left, short of the best.
    expect(HESO.indexOf(Math.max(...HESO))).toBe(BEST_LEFT);
    expect(ATTACKER.indexOf(Math.max(...ATTACKER))).toBe(BEST_RIGHT);
    expect(DEFAULT_STRENGTH).toBeLessThan(FIRST_RIGHT);
    expect(DEFAULT_STRENGTH).not.toBe(BEST_LEFT);
  });

  it('has a 甘デジ’s lottery: 1 in 99.9, 1 in 40.0 in ST; splits that add up to 100', () => {
    expect(LOTTERY / HIT_NORMAL).toBeCloseTo(99.9, 1);
    expect(LOTTERY / HIT_ST).toBeCloseTo(40.0, 1);
    expect(SPLIT_HESO.reduce((n, s) => n + s.percent, 0)).toBe(100);
    expect(SPLIT_DENCHU.reduce((n, s) => n + s.percent, 0)).toBe(100);
    expect(hitKindOf(1, 0)).toEqual({ rounds: 10, after: 'st' });
    expect(hitKindOf(1, 5)).toEqual({ rounds: 4, after: 'st' });
    expect(hitKindOf(1, 50)).toEqual({ rounds: 4, after: 'jitan' });
    expect(hitKindOf(2, 29)).toEqual({ rounds: 10, after: 'st' });
    expect(hitKindOf(2, 30)).toEqual({ rounds: 4, after: 'st' });
    expect(ST_SPINS).toBe(30);
    expect(JITAN_SPINS).toBe(20);
    expect(hitMedals({ rounds: 4, after: 'st' })).toBe(40);
    expect(hitMedals({ rounds: 10, after: 'st' })).toBe(100);
    expect(hitLabel({ rounds: 10, after: 'st' })).toBe('pachinko-10r');
  });

  it('draws a ball from five numbers, and a test can choose them', () => {
    const numbers = [0.1, 0.2, 0.3, 0.4, 0.5];
    let i = 0;
    const drawn = drawBall(() => numbers[i++]);
    expect(i).toBe(BALL_NUMBERS);
    expect(numbersForBall(drawn)).toHaveLength(BALL_NUMBERS);
    const chosen: BallDraw = { fate: 17, lot: 600, split: 42, show: 1000, seed: 123_456_789 };
    let j = 0;
    const again = numbersForBall(chosen);
    expect(drawBall(() => again[j++])).toEqual(chosen);
  });

  it('weighs a phase’s end exactly: a chance of 1 in 2^k ends at that share of the numbers', () => {
    expect(endsAt({ num: 1, shift: 0 }, 0.999_999)).toBe(true);
    expect(endsAt({ num: 1, shift: 2 }, 0.249_999)).toBe(true);
    expect(endsAt({ num: 1, shift: 2 }, 0.25)).toBe(false);
    const units = Array.from({ length: 4_000 }, (_, age) => spinUnit(987_654, age));
    expect(new Set(units).size).toBe(units.length);
    expect(units.every((u) => u >= 0 && u < 1)).toBe(true);
    expect(units.filter((u) => u < 0.5).length / units.length).toBeCloseTo(0.5, 1);
  });
});

describe('a ball', () => {
  it('goes left to the ヘソ, a side pocket or OUT; right, to nothing until the 電チュー or the attacker opens', () => {
    const m = newMachine();
    expect(fire(m, BEST_LEFT, ball(0))).toEqual({ pocket: 'heso', paid: 3, held: 1 });
    expect(fire(m, BEST_LEFT, ball(HESO[BEST_LEFT]))).toEqual({ pocket: 'side', paid: 5, held: null });
    expect(fire(m, BEST_LEFT, ball(FATE_SLOTS - 1))).toEqual({ pocket: 'out', paid: 0, held: null });
    expect(fire(m, BEST_RIGHT, ball(0))).toEqual({ pocket: 'out', paid: 0, held: null });
    expect(shootRight(m)).toBe(false);
  });

  it('takes no fifth hold: a ball into the ヘソ with four waiting pays its 3 and starts nothing (why experts stop firing)', () => {
    const m = newMachine();
    for (let i = 0; i < HOLDS; i++) expect(fire(m, BEST_LEFT, ball(0)).held).toBe(1);
    expect(fire(m, BEST_LEFT, ball(0))).toEqual({ pocket: 'heso', paid: 3, held: null });
    expect(m.q1).toHaveLength(HOLDS);
  });
});

describe('the machine', () => {
  /** Runs `m` with every phase ending as `ends` says, a right ball every slot, until `until` or a limit. */
  const run = (m: Machine, slots: number, strength: number | null, random = seeded(3)) => {
    const seen: string[] = [];
    for (let i = 0; i < slots; i++) {
      if (strength !== null) fire(m, strength, drawBall(random));
      for (const t of tick(m)) seen.push(t.type === 'mode' ? `mode:${t.mode}` : t.type);
    }
    return seen;
  };

  it('starts a spin as a hold comes in, the 電チュー’s first, and judges it at the odds of the moment', () => {
    const m = newMachine();
    fire(m, BEST_LEFT, ball(0, HIT_NORMAL - 1));
    const ticks = tick(m);
    expect(ticks[0]).toMatchObject({ type: 'start', spin: { from: 1, hit: true, mode: 'normal' } });
    expect(m.q1).toHaveLength(0);
    const st: Machine = { ...newMachine(), mode: 'st', left: ST_SPINS, q1: [{ lot: 0, split: 0, show: 0, seed: 0 }] };
    fire(st, BEST_RIGHT, ball(0, HIT_ST - 1));
    expect(tick(st)[0]).toMatchObject({ type: 'start', spin: { from: 2, hit: true, mode: 'st' } });
    // A number between the two odds: a miss in normal play, a hit in ST.
    expect(spinKindOf('normal', false, SHOWS - 1)).toBe('plain');
    expect(spinKindOf('st', true, 0)).toBe('nr');
  });

  it('lasts at least two slots a spin with the 電チュー helping, so a ball a slot always leaves four holds at the end', () => {
    for (const kind of ['plain', 'nr', 'sp'] as const) {
      expect(phaseChances('st', kind, 0)[0]).toEqual({ num: 1, shift: 0 });
      expect(phaseChances('st', kind, 0).length).toBeGreaterThanOrEqual(2);
    }
    for (let seed = 1; seed <= 40; seed++) {
      const random = seeded(seed);
      const m: Machine = { ...newMachine(), mode: 'jitan', left: JITAN_SPINS };
      for (let i = 0; i < 5_000 && helping(m.mode); i++) {
        fire(m, BEST_RIGHT, drawBall(random));
        tick(m);
      }
      if (m.mode === 'normal' && !m.bonus) expect(m.q2.length + (m.spin?.from === 2 ? 1 : 0)).toBe(HOLDS);
    }
  });

  it('plays a hit through: the fanfare, rounds of ten balls with intervals between, the ending, then ST', () => {
    const m = newMachine();
    fire(m, BEST_LEFT, { fate: 0, lot: 0, split: 10, show: 0, seed: 1 });
    const seen: string[] = [];
    for (let i = 0; i < 2_000 && !(m.mode === 'st' && !m.bonus); i++) {
      if (attackerOpen(m)) fire(m, BEST_RIGHT, ball(0));
      for (const t of tick(m)) seen.push(t.type === 'mode' ? `mode:${t.mode}` : t.type);
    }
    expect(seen.filter((t) => t === 'open')).toHaveLength(4);
    expect(seen.filter((t) => t === 'close')).toHaveLength(4);
    expect(seen.slice(-2)).toEqual(['end', 'mode:st']);
    expect(m).toMatchObject({ mode: 'st', left: ST_SPINS, bonus: null, rush: { hits: 1, balls: 400 } });
    expect(FANFARE_SLOTS + INTERVAL_SLOTS + ENDING_SLOTS).toBeGreaterThan(0);
    expect(COUNT).toBe(10);
  });

  it('goes back to normal play after ST’s spins run out with no hit, the run of hits told', () => {
    const m: Machine = { ...newMachine(), mode: 'st', left: 1, rush: { hits: 6, balls: 3_000 } };
    const seen = run(m, 50, BEST_RIGHT, () => 0.99);
    expect(seen).toContain('mode:normal');
    expect(m.mode).toBe('normal');
    expect(rushPrize({ hits: 6, balls: 3_000 })).toBe(300);
    expect(rushPrize({ hits: 2, balls: 800 })).toBeNull();
  });

  it('reads back only a machine it could be in', () => {
    const m = newMachine();
    fire(m, BEST_LEFT, ball(0));
    tick(m);
    expect(parseMachine(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(parseMachine(copyMachine(m))).toEqual(m);
    expect(parseMachine({ ...m, mode: 'st' })).toBeNull();
    expect(parseMachine({ ...m, spin: { ...m.spin!, hit: true } })).toBeNull();
    expect(parseMachine({ ...m, q1: [{ lot: LOTTERY, split: 0, show: 0, seed: 0 }] })).toBeNull();
  });
});

describe('the returns, checked by playing', () => {
  // The engine played slot by slot with each hand's policy, beside the exact returns (published.test.tsx pins them).
  // A hit pays hundreds of balls and a run of them thousands, so a few million slots only come within a few points.
  const play = (hand: 'perfect' | 'typical' | 'blind', slots: number, seed: number): number => {
    const random = seeded(seed);
    const m = newMachine();
    let won = 0;
    let fired = 0;
    const spread = (aim: number) => {
      const r = random() * 4;
      return r < 1 ? aim - 1 : r < 3 ? aim : aim + 1;
    };
    for (let i = 0; i < slots; i++) {
      let strength: number | null;
      if (hand === 'perfect') strength = m.bonus ? (attackerOpen(m) ? BEST_RIGHT : null) : helping(m.mode) ? BEST_RIGHT : m.q1.length < HOLDS ? BEST_LEFT : null;
      else if (hand === 'typical') strength = shootRight(m) ? spread(BEST_RIGHT) : spread(BEST_LEFT);
      else strength = DEFAULT_STRENGTH;
      if (strength !== null) {
        won += fire(m, strength, drawBall(random)).paid;
        fired += 1;
      }
      tick(m);
    }
    return won / fired;
  };

  it('brings back what the reckoning says, within the play’s spread', { timeout: 20_000 }, () => {
    const odds = analyze();
    expect(play('perfect', 3_000_000, 11)).toBeCloseTo(valueOf(odds.perfect.back), 1);
    expect(play('typical', 3_000_000, 12)).toBeCloseTo(valueOf(odds.typical.back), 1);
    expect(play('blind', 300_000, 13)).toBeCloseTo(valueOf(odds.blind.back), 2);
  });
});
