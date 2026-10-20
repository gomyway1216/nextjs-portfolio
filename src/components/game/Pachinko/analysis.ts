/**
 * Goldfish Lantern Pachinko's exact returns: what a ball fired brings back, in the long run, for three hands, worked
 * out as a Markov reward process in fractions of BigInts.
 *
 * The return of a pachinko machine (its 出玉率) is the balls it pays back for every ball fired. Balls are lent for
 * medals and counted back into medals at the same rate (rounded down at the counter), so it is what the medals bring
 * back too, the counter's rounding aside.
 *
 * ## The hands
 *
 * - **Perfect play** (`perfect`): the best strength in each mode, and 止め打ち: in normal play it fires only while
 *   fewer than four of the ヘソ's holds wait (a ball that comes in with four waiting starts nothing), it fires at the
 *   attacker only while it is open (not in the fanfare, between rounds or in the ending), and in ST and 時短 it fires
 *   right at every slot (the 電チュー catches every ball and pays one back for it, which is all a ball can bring back
 *   there). Time costs nothing: it may wait as long as it likes.
 * - **An everyday hand** (`typical`): aims where perfect play does (strength 3 left, 6 right, as the machine calls for
 *   them), but lands on the strength aimed at half the time and one softer or harder a quarter of the time each, and
 *   fires every slot without stopping: into full holds, through the fanfare and between rounds.
 * - **The default strength** (`blind`): the handle left where it starts (strength 4, 左打ち) and never turned for
 *   右打ち. Every ball goes left, so the attacker never fills and nothing but the pockets' own balls comes back.
 *
 * ## How
 *
 * The process (engine.ts) moves slot by slot; its state is the mode, the spins left of ST or 時短, the holds of each
 * queue, the spin running (its kind and phase) and a hit's rounds. Its phases end with a chance each slot, so the
 * state is all the future depends on. It breaks into parts that are worked out each on its own:
 *
 * - **A hit and what follows it** (`cycles`): the rounds, then ST or 時短 with the 電チュー catching every ball shot
 *   right, until their spins run out, a hit in them starting it all again. Both hands that shoot right fire every slot
 *   there and lose nothing to it, so the 電チュー's holds never run out and four are always left at the end (each
 *   spin lasts two slots or more, and a ball a slot comes in): the part is the same whatever the holds were.
 * - **Normal play** (`normalPlay`): the 電チュー's four holds left spin first, then the ヘソ's. The everyday hand's
 *   holds come in a ball at a time and go a spin at a time, so how many wait matters; the spins are worked out one by
 *   one (`spinOutcome`) and joined into a small linear system over the holds waiting as each spin starts.
 * - **The long run**: for the everyday hand, a Markov chain over the ヘソ's holds waiting as normal play comes back,
 *   whose stationary distribution weighs every part. For perfect play none of that matters: every ヘソ hold costs the
 *   same balls and spins the same lottery, so the return is a renewal sum over one hold.
 *
 * Nothing here touches React, the browser or the medals.
 */

import {
  ATTACKER,
  BALLS_PER_MEDAL,
  BEST_LEFT,
  BEST_RIGHT,
  COUNT,
  DEFAULT_STRENGTH,
  ENDING_SLOTS,
  FANFARE_SLOTS,
  FATE_SLOTS,
  FIRST_RIGHT,
  HESO,
  HOLDS,
  INTERVAL_SLOTS,
  JITAN_SPINS,
  LOTTERY,
  PAY_ATTACKER,
  PAY_DENCHU,
  PAY_HESO,
  PAY_SIDE,
  SHOWS,
  SIDE,
  SPLIT_DENCHU,
  SPLIT_HESO,
  STRENGTHS,
  ST_SPINS,
  hitsIn,
  phaseChances,
  showTable,
  type Chance,
  type HitKind,
  type Mode,
  type SpinKind,
} from './engine';

// ── Exact fractions ─────────────────────────────────────────────────────────

export interface Fraction {
  num: bigint;
  den: bigint;
}

// Written with BigInt() rather than literals: the site's TypeScript targets a version before BigInt literals.
const ZERO = BigInt(0);
const ONE = BigInt(1);

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < ZERO ? -a : a;
  let y = b < ZERO ? -b : b;
  while (y !== ZERO) [x, y] = [y, x % y];
  return x;
};
export const fraction = (num: bigint | number, den: bigint | number = ONE): Fraction => {
  const n = typeof num === 'bigint' ? num : BigInt(num);
  const d = typeof den === 'bigint' ? den : BigInt(den);
  const g = gcd(n, d) || ONE;
  const sign = d < ZERO ? -ONE : ONE;
  return { num: (sign * n) / g, den: (sign * d) / g };
};
const F0 = fraction(0);
const F1 = fraction(1);
export const add = (a: Fraction, b: Fraction): Fraction => (a.num === ZERO ? b : b.num === ZERO ? a : fraction(a.num * b.den + b.num * a.den, a.den * b.den));
export const sub = (a: Fraction, b: Fraction): Fraction => add(a, { num: -b.num, den: b.den });
export const mul = (a: Fraction, b: Fraction): Fraction => (a.num === ZERO || b.num === ZERO ? F0 : fraction(a.num * b.num, a.den * b.den));
export const div = (a: Fraction, b: Fraction): Fraction => fraction(a.num * b.den, a.den * b.num);
export const less = (a: Fraction, b: Fraction): boolean => a.num * b.den < b.num * a.den;
const sum = (parts: readonly Fraction[]): Fraction => parts.reduce(add, F0);
const pow = (a: Fraction, n: number): Fraction => fraction(a.num ** BigInt(n), a.den ** BigInt(n));
/** A fraction as a number, to the double's precision. */
export const valueOf = (f: Fraction): number => {
  // Scaled down first, so that a numerator and denominator past 2^53 still divide accurately.
  const shift = BigInt(Math.max(0, f.den.toString(2).length - 52));
  return Number(f.num >> shift) / Number(f.den >> shift);
};
/** A fraction written as "num/den", and read back. */
export const ratioOf = (f: Fraction): string => `${f.num.toString()}/${f.den.toString()}`;
export const parseRatio = (text: string): Fraction => {
  const [num, den] = text.split('/');
  return fraction(BigInt(num), BigInt(den));
};
const ofChance = (c: Chance): Fraction => fraction(c.num, 2 ** c.shift);

// ── Pairs of balls paid and fired ───────────────────────────────────────────

/** Balls paid back (`w`) and balls fired (`f`), in expectation. */
interface Balls {
  w: Fraction;
  f: Fraction;
}
const plus = (a: Balls, b: Balls): Balls => ({ w: add(a.w, b.w), f: add(a.f, b.f) });
const times = (k: Fraction, a: Balls): Balls => ({ w: mul(k, a.w), f: mul(k, a.f) });
const NONE: Balls = { w: F0, f: F0 };

// ── The hands ───────────────────────────────────────────────────────────────

export type Hand = 'perfect' | 'typical' | 'blind';
export const HANDS: readonly Hand[] = ['perfect', 'typical', 'blind'];

/**
 * The everyday hand's spread, in quarters: where it lands when it aims at strength `aim`. On it half the time, one
 * softer or harder a quarter each. Its aims (`BEST_LEFT`, `BEST_RIGHT`) have a strength of the same side on either side.
 */
export const TYPICAL_QUARTERS = (aim: number): { strength: number; quarters: number }[] => [
  { strength: aim - 1, quarters: 1 },
  { strength: aim, quarters: 2 },
  { strength: aim + 1, quarters: 1 },
];
/** Where a hand's balls land, in quarters: the everyday hand's spread, or one strength every time. */
export type Spread = readonly { strength: number; quarters: number }[];
export const only = (strength: number): Spread => [{ strength, quarters: 4 }];
/** The chance a ball of a hand landing as `spread` comes into a pocket whose throws are `table`. */
const rateOf = (table: readonly number[], spread: Spread): Fraction =>
  fraction(
    spread.reduce((n, { strength, quarters }) => n + quarters * table[strength], 0),
    4 * FATE_SLOTS,
  );

// ── ST and 時短, and the hits that start them ───────────────────────────────

/** The chance of a hit at a spin started in `mode`, and the chance of each kind given the result. */
const lotteryOf = (mode: Mode): Fraction => fraction(hitsIn(mode), LOTTERY);
/** How many slots a spin of `kind` lasts on average, its phases' chances not hanging on the holds (ST, 時短). */
const meanSlots = (mode: Mode, kind: SpinKind): Fraction => sum(phaseChances(mode, kind, 0).map((c) => div(F1, ofChance(c))));

/** A spin with the 電チュー helping: the chance it is a hit, and the slots it lasts on average, hit or miss. */
function helpingSpin(mode: Mode): { hit: Fraction; slotsHit: Fraction; slotsMiss: Fraction } {
  const t = showTable(mode);
  const nrHit = fraction(t.hitNr, SHOWS);
  const nrMiss = fraction(t.missNr, SHOWS);
  const spMiss = fraction(t.missSp, SHOWS);
  const plainMiss = sub(F1, add(nrMiss, spMiss));
  return {
    hit: lotteryOf(mode),
    slotsHit: add(mul(nrHit, meanSlots(mode, 'nr')), mul(sub(F1, nrHit), meanSlots(mode, 'sp'))),
    slotsMiss: sum([mul(plainMiss, meanSlots(mode, 'plain')), mul(nrMiss, meanSlots(mode, 'nr')), mul(spMiss, meanSlots(mode, 'sp'))]),
  };
}

/**
 * ST or 時短 for a hand that fires right at every slot: the balls it fires (every one caught by the 電チュー and paid
 * back one for one: the first slot's, before the first spin, and one a slot of every spin), and the chance a hit comes
 * before the spins run out.
 */
export function helpingRun(mode: 'st' | 'jitan'): { churn: Fraction; hit: Fraction } {
  const spins = mode === 'st' ? ST_SPINS : JITAN_SPINS;
  const { hit, slotsHit, slotsMiss } = helpingSpin(mode);
  const miss = sub(F1, hit);
  const perSpin = add(mul(hit, slotsHit), mul(miss, slotsMiss));
  let reach = F0;
  for (let k = 0; k < spins; k++) reach = add(reach, pow(miss, k));
  return { churn: add(F1, mul(reach, perSpin)), hit: sub(F1, pow(miss, spins)) };
}

/** A hit's rounds for a hand: the balls they pay, and the balls the hand fires through them. */
type Rounds = (kind: HitKind) => Balls;

/**
 * What a hit of each split brings, from its rounds to the end of the ST or 時短 after them, every hit in those
 * included: from the ヘソ (`heso`) and from the 電チュー (`denchu`). A hit from the 電チュー is always followed by ST,
 * so its part is the same each time, and a hit in it starts the same part again: `denchu = rounds + run + hit ×
 * denchu`, solved for `denchu`.
 */
function cycles(rounds: Rounds): { heso: Balls; denchu: Balls } {
  const run = { st: helpingRun('st'), jitan: helpingRun('jitan') };
  const churnOf = (after: 'st' | 'jitan'): Balls => ({ w: mul(run[after].churn, fraction(PAY_DENCHU)), f: run[after].churn });
  const denchuBase = SPLIT_DENCHU.reduce((acc, { kind, percent }) => plus(acc, times(fraction(percent, 100), plus(rounds(kind), churnOf(kind.after)))), NONE);
  const denchu = times(div(F1, sub(F1, run.st.hit)), denchuBase);
  const after = (kind: HitKind): Balls => plus(plus(rounds(kind), churnOf(kind.after)), times(run[kind.after].hit, denchu));
  const heso = SPLIT_HESO.reduce((acc, { kind, percent }) => plus(acc, times(fraction(percent, 100), after(kind))), NONE);
  return { heso, denchu };
}

const roundsPay = (kind: HitKind): Fraction => fraction(kind.rounds * COUNT * PAY_ATTACKER);

// ── Perfect play ────────────────────────────────────────────────────────────

/**
 * Perfect play's return, as a renewal sum over one hold of the ヘソ. It fires at the best strength only while fewer
 * than four of the ヘソ's holds wait, so no ball is lost to a full queue: a hold costs `FATE_SLOTS / HESO[best]` balls
 * on average, and they pay what the ヘソ and the side pockets pay. Each hold spins once at the normal odds; a hit
 * starts its cycle; every cycle ends with the 電チュー's four holds left, each a spin at the normal odds whose hit starts
 * a 電チュー's cycle (and the holds after it are spun in that cycle's ST).
 */
export function perfectAt(left = BEST_LEFT, right = BEST_RIGHT): Fraction {
  const a = fraction(HESO[left], FATE_SLOTS);
  const hold: Balls = { w: div(fraction(PAY_HESO * HESO[left] + PAY_SIDE * SIDE[left], FATE_SLOTS), a), f: div(F1, a) };
  // Fires at the attacker only while it is open: ten balls in take FATE_SLOTS / ATTACKER[right] balls each on average.
  const rounds: Rounds = (kind) => ({ w: roundsPay(kind), f: fraction(kind.rounds * COUNT * FATE_SLOTS, ATTACKER[right]) });
  const { heso, denchu } = cycles(rounds);
  const low = lotteryOf('normal');
  const held = sub(F1, pow(sub(F1, low), HOLDS));
  // Cycles started by the holds left after a cycle, per cycle started by the ヘソ: held + held² + … = held / (1 − held).
  const fromLeft = div(held, sub(F1, held));
  const all = plus(hold, times(low, plus(heso, times(fromLeft, denchu))));
  return div(all.w, all.f);
}

// ── The everyday hand ───────────────────────────────────────────────────────

/** A spin's outcome in normal play: the slots it lasts on average, and the chance of each count of the ヘソ's holds waiting as it ends. */
interface SpinOutcome {
  slots: Fraction;
  ends: Fraction[];
}

/**
 * A spin of `kind` started in normal play with `h1` of the ヘソ's holds and `h2` of the 電チュー's waiting, for a hand
 * whose every ball comes into the ヘソ with chance `a`: worked out over the ヘソ's holds (which only grow while a spin
 * runs) and the spin's phase. Each slot a ball (a hold if fewer than four wait), then the phase ends with its chance.
 */
function spinOutcome(kind: SpinKind, h1: number, h2: number, a: Fraction): SpinOutcome {
  const phases = phaseChances('normal', kind, 0).length;
  // value[h][phase], filled from the most holds and the last phase back.
  const value: SpinOutcome[][] = Array.from({ length: HOLDS + 1 }, () => new Array<SpinOutcome>(phases));
  const endAt = (h: number): SpinOutcome => ({ slots: F0, ends: Array.from({ length: HOLDS + 1 }, (_, k) => (k === h ? F1 : F0)) });
  for (let h = HOLDS; h >= h1; h--) {
    for (let ph = phases - 1; ph >= 0; ph--) {
      const fill = h < HOLDS ? a : F0;
      let slots = F1;
      let ends: Fraction[] = Array.from({ length: HOLDS + 1 }, () => F0);
      let self = F0;
      for (const [to, p] of [
        [h + 1, fill],
        [h, sub(F1, fill)],
      ] as const) {
        if (p.num === ZERO) continue;
        const q = ofChance(phaseChances('normal', kind, to + h2)[ph]);
        const next = ph + 1 < phases ? value[to][ph + 1] : endAt(to);
        const onEnd = mul(p, q);
        slots = add(slots, mul(onEnd, next.slots));
        ends = ends.map((e, k) => add(e, mul(onEnd, next.ends[k])));
        const stay = mul(p, sub(F1, q));
        if (to === h) self = add(self, stay);
        else {
          const there = value[to][ph];
          slots = add(slots, mul(stay, there.slots));
          ends = ends.map((e, k) => add(e, mul(stay, there.ends[k])));
        }
      }
      const scale = div(F1, sub(F1, self));
      value[h][ph] = { slots: mul(scale, slots), ends: ends.map((e) => mul(scale, e)) };
    }
  }
  return value[h1][0];
}

/** The chance of each (kind, result) of a spin started in normal play. */
function normalSpins(): { kind: SpinKind; hit: boolean; p: Fraction }[] {
  const low = lotteryOf('normal');
  const miss = sub(F1, low);
  const t = showTable('normal');
  const nrMiss = fraction(t.missNr, SHOWS);
  const spMiss = fraction(t.missSp, SHOWS);
  return [
    { kind: 'nr', hit: true, p: mul(low, fraction(t.hitNr, SHOWS)) },
    { kind: 'sp', hit: true, p: mul(low, fraction(SHOWS - t.hitNr, SHOWS)) },
    { kind: 'plain', hit: false, p: mul(miss, sub(F1, add(nrMiss, spMiss))) },
    { kind: 'nr', hit: false, p: mul(miss, nrMiss) },
    { kind: 'sp', hit: false, p: mul(miss, spMiss) },
  ];
}

/**
 * Normal play from its start until a hit, for a hand whose every ball comes into the ヘソ with chance `a`: from each
 * count of the ヘソ's holds waiting as it begins (the 電チュー's four left spinning first), the slots it lasts, and the
 * chance it ends in a hit from each queue with each count of the ヘソ's holds waiting.
 *
 * Unknowns: the spins of the ヘソ's holds as they start, with 0 to 3 of its holds still waiting (a spin takes one),
 * and the machine standing idle with none. A linear system of five, solved exactly; the 電チュー's holds left spin
 * before them, a chain with no way back (`fromLeft`).
 */
interface Exits {
  slots: Fraction;
  /** By the count of the ヘソ's holds waiting as the hit comes: from the ヘソ, and from the 電チュー. */
  heso: Fraction[];
  denchu: Fraction[];
}
const noExits = (): Exits => ({ slots: F0, heso: Array.from({ length: HOLDS + 1 }, () => F0), denchu: Array.from({ length: HOLDS + 1 }, () => F0) });
const scaled = (k: Fraction, e: Exits): Exits => ({ slots: mul(k, e.slots), heso: e.heso.map((x) => mul(k, x)), denchu: e.denchu.map((x) => mul(k, x)) });
const joined = (a: Exits, b: Exits): Exits => ({ slots: add(a.slots, b.slots), heso: a.heso.map((x, i) => add(x, b.heso[i])), denchu: a.denchu.map((x, i) => add(x, b.denchu[i])) });

function normalPlay(a: Fraction): Exits[] {
  const spins = normalSpins();
  const outcomes = new Map<string, SpinOutcome>();
  const outcome = (kind: SpinKind, h1: number, h2: number): SpinOutcome => {
    const key = `${kind}:${h1}:${h2}`;
    let found = outcomes.get(key);
    if (!found) {
      found = spinOutcome(kind, h1, h2, a);
      outcomes.set(key, found);
    }
    return found;
  };
  // The ヘソ's spins, as linear combinations of the unknowns: x[h] for a spin started with h waiting (0 to 3), and
  // idle (the 4th) = 1/a slots, then x[0].
  const n = HOLDS;
  // Equation rows: x[h] = constant + Σ coeff[j] x[j].
  const rows: { coeff: Fraction[]; constant: Exits }[] = [];
  for (let h = 0; h < n; h++) {
    const coeff = Array.from({ length: n }, () => F0);
    let constant = noExits();
    for (const { kind, hit, p } of spins) {
      const o = outcome(kind, h, 0);
      constant = joined(constant, { slots: mul(p, o.slots), heso: Array.from({ length: n + 1 }, () => F0), denchu: Array.from({ length: n + 1 }, () => F0) });
      o.ends.forEach((e, end) => {
        const pe = mul(p, e);
        if (pe.num === ZERO) return;
        if (hit) constant.heso[end] = add(constant.heso[end], pe);
        else if (end > 0) coeff[end - 1] = add(coeff[end - 1], pe);
        else {
          // Idle until a ball comes into the ヘソ, then a spin with none waiting.
          constant.slots = add(constant.slots, div(pe, a));
          coeff[0] = add(coeff[0], pe);
        }
      });
    }
    rows.push({ coeff, constant });
  }
  // Solve (I − C) x = constant by Gauss–Jordan elimination over the five vectors of each row.
  const m = rows.map(({ coeff, constant }, i) => ({ coeff: coeff.map((c, j) => (i === j ? sub(F1, c) : mul(fraction(-1), c))), constant }));
  for (let col = 0; col < n; col++) {
    const pivot = m.findIndex((row, i) => i >= col && row.coeff[col].num !== ZERO);
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const inv = div(F1, m[col].coeff[col]);
    m[col] = { coeff: m[col].coeff.map((c) => mul(inv, c)), constant: scaled(inv, m[col].constant) };
    for (let i = 0; i < n; i++) {
      if (i === col || m[i].coeff[col].num === ZERO) continue;
      const k = m[i].coeff[col];
      m[i] = { coeff: m[i].coeff.map((c, j) => sub(c, mul(k, m[col].coeff[j]))), constant: joined(m[i].constant, scaled(mul(fraction(-1), k), m[col].constant)) };
    }
  }
  const heso = m.map((row) => row.constant);
  const idle = joined({ slots: div(F1, a), heso: Array.from({ length: n + 1 }, () => F0), denchu: Array.from({ length: n + 1 }, () => F0) }, heso[0]);
  /** What follows a spin that ended without a hit, the 電チュー's holds all spun, with `end` of the ヘソ's waiting. */
  const afterLeft = (end: number): Exits => (end > 0 ? heso[end - 1] : idle);
  // The 電チュー's holds left: a spin started with `k` of them still waiting after it, and `h1` of the ヘソ's.
  const left = new Map<string, Exits>();
  const fromLeft = (h1: number, k: number): Exits => {
    const key = `${h1}:${k}`;
    const known = left.get(key);
    if (known) return known;
    let value = noExits();
    for (const { kind, hit, p } of spins) {
      const o = outcome(kind, h1, k);
      value = joined(value, { slots: mul(p, o.slots), heso: Array.from({ length: n + 1 }, () => F0), denchu: Array.from({ length: n + 1 }, () => F0) });
      o.ends.forEach((e, end) => {
        const pe = mul(p, e);
        if (pe.num === ZERO) return;
        if (hit) value.denchu[end] = add(value.denchu[end], pe);
        else value = joined(value, scaled(pe, k > 0 ? fromLeft(end, k - 1) : afterLeft(end)));
      });
    }
    left.set(key, value);
    return value;
  };
  // Normal play begins as the last spin of ST or 時短 ends: the first of the 電チュー's four holds left starts at once.
  return Array.from({ length: HOLDS + 1 }, (_, h1) => fromLeft(h1, HOLDS - 1));
}

/**
 * The return of a hand that fires every slot without stopping, landing as `left` while the machine calls for 左打ち
 * and as `right` while it calls for 右打ち (both sides of each: the 電チュー catches every ball shot right): the Markov
 * chain over the ヘソ's holds waiting as normal play begins, weighed by its stationary distribution.
 */
export function nonstop(left: Spread, right: Spread): Fraction {
  const a = rateOf(HESO, left);
  const direct = add(mul(fraction(PAY_HESO), a), mul(fraction(PAY_SIDE), rateOf(SIDE, left)));
  const c = rateOf(ATTACKER, right);
  // Fires every slot through the rounds: the fanfare, every interval and the ending are balls lost; ten balls into the
  // attacker take 10/c on average.
  const rounds: Rounds = (kind) => ({
    w: roundsPay(kind),
    f: add(fraction(FANFARE_SLOTS + (kind.rounds - 1) * INTERVAL_SLOTS + ENDING_SLOTS), mul(fraction(kind.rounds * COUNT), div(F1, c))),
  });
  const cycle = cycles(rounds);
  const normal = normalPlay(a);
  const n = HOLDS + 1;
  // The chain: from h1 waiting as normal play begins to h1 waiting as the next begins (a hit leaves the ヘソ's holds as
  // they are; the hand shoots right until normal play is back).
  const step: Fraction[][] = normal.map((e) => Array.from({ length: n }, (_, j) => add(e.heso[j], e.denchu[j])));
  const reward: Balls[] = normal.map((e) => {
    const inPlay: Balls = { w: mul(direct, e.slots), f: e.slots };
    const fromHeso = times(sum(e.heso), cycle.heso);
    const fromDenchu = times(sum(e.denchu), cycle.denchu);
    return plus(plus(inPlay, fromHeso), fromDenchu);
  });
  // Stationary distribution: π (P − I) = 0, Σ π = 1.
  const m: Fraction[][] = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (_, j) => (i === n - 1 ? F1 : sub(step[j][i], i === j ? F1 : F0))), i === n - 1 ? F1 : F0]);
  for (let col = 0; col < n; col++) {
    const pivot = m.findIndex((row, i) => i >= col && row[col].num !== ZERO);
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const inv = div(F1, m[col][col]);
    m[col] = m[col].map((x) => mul(inv, x));
    for (let i = 0; i < n; i++) {
      if (i === col || m[i][col].num === ZERO) continue;
      const k = m[i][col];
      m[i] = m[i].map((x, j) => sub(x, mul(k, m[col][j])));
    }
  }
  const pi = m.map((row) => row[n]);
  const all = pi.reduce((acc, p, i) => plus(acc, times(p, reward[i])), NONE);
  return div(all.w, all.f);
}

// ── The default strength ────────────────────────────────────────────────────

/** The handle never turned: every ball at the default strength, which shoots left, pays what the ヘソ and side pockets pay, whatever the machine is doing. */
const blind = (): Fraction => fraction(PAY_HESO * HESO[DEFAULT_STRENGTH] + PAY_SIDE * SIDE[DEFAULT_STRENGTH], FATE_SLOTS);

// ── All of it ───────────────────────────────────────────────────────────────

export type MachineOdds = Record<Hand, { back: Fraction }>;

/** Every hand's exact return (a fraction of a second): for the tests, and for writing out published.ts. The page reads published.ts. */
export const analyze = (): MachineOdds => ({
  perfect: { back: perfectAt() },
  typical: { back: nonstop(TYPICAL_QUARTERS(BEST_LEFT), TYPICAL_QUARTERS(BEST_RIGHT)) },
  blind: { back: blind() },
});

// ── Figures the Odds tab shows beside the returns ───────────────────────────

export interface MachineFigures {
  /** The chance ST brings a hit before its spins run out, 時短 brings one back, and one of the 電チュー's four holds left is a hit. */
  stHit: Fraction;
  jitanHit: Fraction;
  leftHit: Fraction;
  /** Spins per 250 balls at the best strength, none lost to a full queue. */
  spinsPer250: Fraction;
  /** The best strengths fired without stopping: what 止め打ち is worth, beside perfect play. */
  nonstop: Fraction;
  /** Perfect play at each strength: a left one in normal play (the best right one at the attacker), a right one at the attacker (the best left one in normal play). */
  strengths: Fraction[];
}

/** The figures beside the returns (a fraction of a second): for the tests, and for writing out published.ts. */
export const figures = (): MachineFigures => ({
  stHit: stHitChance(),
  jitanHit: jitanHitChance(),
  leftHit: leftHitChance(),
  spinsPer250: spinsPer250(BEST_LEFT),
  nonstop: nonstop(only(BEST_LEFT), only(BEST_RIGHT)),
  strengths: Array.from({ length: STRENGTHS }, (_, s) => (s < FIRST_RIGHT ? perfectAt(s, BEST_RIGHT) : perfectAt(BEST_LEFT, s))),
});

/** The chance a run of ST brings a hit before its 30 spins run out. */
export const stHitChance = (): Fraction => helpingRun('st').hit;
/** The chance 時短 brings a hit back before its 20 spins run out. */
export const jitanHitChance = (): Fraction => helpingRun('jitan').hit;
/** The chance one of the 電チュー's four holds left after ST or 時短 is a hit. */
export const leftHitChance = (): Fraction => sub(F1, pow(sub(F1, lotteryOf('normal')), HOLDS));
/** Spins started per 250 balls fired at a strength, with no ball lost to a full queue. */
export const spinsPer250 = (strength: number): Fraction => fraction(250 * HESO[strength], FATE_SLOTS);
/** Medals a hit's rounds are worth at the counter. */
export const medalsOfRounds = (rounds: number): number => (rounds * COUNT * PAY_ATTACKER) / BALLS_PER_MEDAL;
