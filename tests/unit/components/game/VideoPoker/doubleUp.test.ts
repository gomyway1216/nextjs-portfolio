import { describe, expect, it } from 'vitest';
import { DOUBLE_MAX, DOUBLE_RETURN, doubleOutcome, doubleState, drawDealer, drawFaceDown, roundOutcome, type DoubleOutcome } from '@/components/game/VideoPoker/doubleUp';

// The double-up is a fair bet: on average one double returns exactly what was put on it, so no way of doubling up or
// taking changes the machine's return. These count every case rather than sample.

/** The random number that makes `Math.floor(r * n)` come out `k`. */
const bucket = (k: number, n: number) => (k + 0.5) / n;

/** Random numbers handed out in order, then 0.5. */
const queue = (...values: number[]) => () => values.shift() ?? 0.5;

describe('the double-up', () => {
  it('pays twice for a higher card, the same for a push, nothing for a lower one; aces high, suits not counted', () => {
    const card = (rank: number, suit = 0) => suit * 13 + rank;
    expect(doubleOutcome(card(0), card(12))).toBe('win'); // a deuce against an ace
    expect(doubleOutcome(card(12), card(0))).toBe('lose');
    expect(doubleOutcome(card(9, 0), card(9, 3))).toBe('push'); // jacks of two suits
    expect(DOUBLE_RETURN).toEqual({ win: 2, push: 1, lose: 0 });
  });

  it('returns exactly what is put on it, on average: every dealer’s card against every other card', () => {
    const counts: Record<DoubleOutcome, number> = { win: 0, push: 0, lose: 0 };
    let back = 0;
    for (let dealer = 0; dealer < 52; dealer++) {
      for (let mine = 0; mine < 52; mine++) {
        if (mine === dealer) continue;
        const outcome = doubleOutcome(dealer, mine);
        counts[outcome] += 1;
        back += DOUBLE_RETURN[outcome];
      }
    }
    // 52 × 51 pairs: a push is one of the three other cards of the dealer's rank; the rest split evenly.
    expect(counts).toEqual({ win: 1248, push: 156, lose: 1248 });
    // Medals back for one medal put on each of the 2,652 pairs: exactly 2,652, so one double returns its medals exactly.
    expect(back).toBe(52 * 51);
  });

  it('is just as fair as the machine draws its cards, whichever of the four face-down cards is picked', { timeout: 30_000 }, () => {
    // Every dealer's card (one random number, 52 ways) and every first and second face-down card (51 and 50 ways): the
    // card picked is each of the 51 other cards equally often, and the medals back come to exactly the medals put on.
    // Many cases: what is checked in each is counted, and the counts are checked once, so that the test stays quick.
    for (const pick of [0, 1]) {
      let back = 0;
      let cases = 0;
      let wrong = 0;
      const seen = new Map<number, number>();
      for (let d = 0; d < 52; d++) {
        const dealer = drawDealer(queue(bucket(d, 52)));
        if (dealer !== d) wrong += 1;
        for (let a = 0; a < 51; a++) {
          for (let b = 0; b < (pick === 0 ? 1 : 50); b++) {
            const cards = drawFaceDown(dealer, queue(bucket(a, 51), bucket(b, 50)));
            if (new Set([dealer, ...cards]).size !== 5) wrong += 1;
            const card = cards[pick];
            if (d === 0) seen.set(card, (seen.get(card) ?? 0) + 1);
            back += DOUBLE_RETURN[doubleOutcome(dealer, card)];
            cases += 1;
          }
        }
      }
      expect(wrong).toBe(0);
      expect(back).toBe(cases);
      // With the dealer's card the deuce of spades, the picked card is every one of the other 51 equally often.
      expect(seen.size).toBe(51);
      expect(new Set(seen.values()).size).toBe(1);
    }
    // The third card, for one dealer's card, over every three random numbers: each of the 51 cards 2,450 times.
    const third = new Map<number, number>();
    for (let a = 0; a < 51; a++) {
      for (let b = 0; b < 50; b++) {
        for (let c = 0; c < 49; c++) {
          const card = drawFaceDown(0, queue(bucket(a, 51), bucket(b, 50), bucket(c, 49)))[2];
          third.set(card, (third.get(card) ?? 0) + 1);
        }
      }
    }
    expect(third.size).toBe(51);
    expect([...new Set(third.values())]).toEqual([50 * 49]);
  });

  it('leaves the long-run return alone whatever the player does: the win expected after any number of double-ups is the win', () => {
    // Exactly, in whole numbers: after k double-ups (a push counting as one), the medals expected, times 2,652^k, are
    // the win times 2,652^k. Every sequence of outcomes is weighed by how many of the 2,652 pairs give it.
    const weight: Record<DoubleOutcome, bigint> = { win: BigInt(1248), push: BigInt(156), lose: BigInt(1248) };
    const win = BigInt(45);
    for (let k = 0; k <= DOUBLE_MAX; k++) {
      let total = BigInt(0);
      const walk = (depth: number, offer: bigint, ways: bigint): void => {
        if (depth === k || offer === BigInt(0)) {
          // A lost double ends it; the rest of the k draws are not made, so they are counted as all of their ways.
          total += offer * ways * BigInt(2652) ** BigInt(k - depth);
          return;
        }
        for (const outcome of ['win', 'push', 'lose'] as const) walk(depth + 1, offer * BigInt(DOUBLE_RETURN[outcome]), ways * weight[outcome]);
      };
      walk(0, win, BigInt(1));
      expect(total, `${k} double-ups`).toBe(win * BigInt(2652) ** BigInt(k));
    }
  });

  it('works out where a win stands from its double-ups: on offer, on a double, or lost, and how many are left', () => {
    const two = 0; // the deuce of spades
    const ace = 12;
    const jack = 9;
    const jackHearts = 13 + 9;
    expect(doubleState(45, [])).toEqual({ offer: 45, pending: false, lost: false, left: DOUBLE_MAX });
    expect(doubleState(45, [{ dealer: two }])).toEqual({ offer: 45, pending: true, lost: false, left: DOUBLE_MAX - 1 });
    const won = { dealer: two, cards: [ace, 1, 2, 3], pick: 0 };
    const pushed = { dealer: jack, cards: [jackHearts, 1, 2, 3], pick: 0 };
    const lost = { dealer: ace, cards: [two + 13, 1, 2, 3], pick: 0 };
    expect(roundOutcome(won)).toBe('win');
    expect(roundOutcome(pushed)).toBe('push');
    expect(roundOutcome(lost)).toBe('lose');
    expect(doubleState(45, [won, pushed])).toEqual({ offer: 90, pending: false, lost: false, left: DOUBLE_MAX - 2 });
    expect(doubleState(45, [won, won, won, won])).toEqual({ offer: 45 * 16, pending: false, lost: false, left: 0 });
    expect(doubleState(45, [won, lost])).toEqual({ offer: 0, pending: false, lost: true, left: DOUBLE_MAX - 2 });
  });
});
