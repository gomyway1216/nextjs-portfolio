import { describe, expect, it } from 'vitest';
import {
  Action,
  Card,
  Rank,
  basicStrategyDecision,
  handValue,
  isBlackjack,
  isBust,
  isPair,
  newDeck,
  newShoe,
  playDealerTurn,
  playRound,
  runBlackjackSimAsync,
  shouldTakeInsurance,
  strategyFor,
} from '@/components/game/Blackjack/engine';

/** Build a hand from compact rank strings, all spades unless a suit is given. */
function hand(...ranks: string[]): Card[] {
  return ranks.map((r) => {
    const suit = (r.length > 1 && '♠♥♦♣'.includes(r.slice(-1))) ? r.slice(-1) as Card['suit'] : '♠';
    const rank = (r.length > 1 && '♠♥♦♣'.includes(r.slice(-1)) ? r.slice(0, -1) : r) as Rank;
    return { rank, suit };
  });
}
const up = (r: Rank): Card => ({ rank: r, suit: '♦' });

describe('hand evaluation', () => {
  it('builds a 52-card deck and a 6-deck shoe with no accidental sharing', () => {
    expect(newDeck()).toHaveLength(52);
    expect(newShoe()).toHaveLength(312);
    expect(newShoe(2)).toHaveLength(104);
  });

  it('values face cards as 10 and totals correctly', () => {
    expect(handValue(hand('K', 'Q')).total).toBe(20);
    expect(handValue(hand('T', '7')).total).toBe(17);
    expect(handValue(hand('2', '3', '4')).total).toBe(9);
  });

  it('counts a single ace as 11 (soft) and drops to 1 when it would bust', () => {
    expect(handValue(hand('A', '6'))).toEqual({ total: 17, soft: true });
    expect(handValue(hand('A', '6', 'T'))).toEqual({ total: 17, soft: false }); // 1+6+10
    expect(handValue(hand('A', 'A'))).toEqual({ total: 12, soft: true });       // 11+1
    expect(handValue(hand('A', 'A', '9'))).toEqual({ total: 21, soft: true });  // 11+1+9
    expect(handValue(hand('A', 'A', '9', 'K'))).toEqual({ total: 21, soft: false }); // 1+1+9+10
  });

  it('detects blackjack only on a two-card 21', () => {
    expect(isBlackjack(hand('A', 'K'))).toBe(true);
    expect(isBlackjack(hand('A', 'T'))).toBe(true);
    expect(isBlackjack(hand('7', '7', '7'))).toBe(false); // 21 but three cards
    expect(isBlackjack(hand('A', '5', '5'))).toBe(false);
  });

  it('detects bust and splittable pairs (by value)', () => {
    expect(isBust(hand('T', '6', 'K'))).toBe(true);
    expect(isBust(hand('T', '6'))).toBe(false);
    expect(isPair(hand('8', '8'))).toBe(true);
    expect(isPair(hand('K', 'T'))).toBe(true);  // both value 10
    expect(isPair(hand('K', '9'))).toBe(false);
    expect(isPair(hand('A', 'A'))).toBe(true);
  });
});

describe('basic strategy — hard totals (S17, DAS)', () => {
  it('always hits 8 or below and always stands 17+', () => {
    for (const d of ['2', '6', 'T', 'A'] as Rank[]) {
      expect(basicStrategyDecision(hand('5', '3'), up(d), true)).toBe('hit');
      expect(basicStrategyDecision(hand('T', '7'), up(d), true)).toBe('stand');
    }
  });

  it('doubles 11 vs everything but Ace, and 10 vs 2-9', () => {
    for (const d of ['2', '5', '9', 'T'] as Rank[]) {
      expect(basicStrategyDecision(hand('6', '5'), up(d), true)).toBe('double');
    }
    expect(basicStrategyDecision(hand('6', '5'), up('A'), true)).toBe('hit');
    expect(basicStrategyDecision(hand('7', '3'), up('9'), true)).toBe('double');
    expect(basicStrategyDecision(hand('7', '3'), up('T'), true)).toBe('hit');
    expect(basicStrategyDecision(hand('7', '3'), up('A'), true)).toBe('hit');
  });

  it('stands stiff hands 12-16 vs weak upcards, hits vs strong', () => {
    expect(basicStrategyDecision(hand('T', '6'), up('6'), true)).toBe('stand');
    expect(basicStrategyDecision(hand('T', '6'), up('7'), true)).toBe('hit');
    expect(basicStrategyDecision(hand('T', '2'), up('2'), true)).toBe('hit');  // 12 vs 2 hits
    expect(basicStrategyDecision(hand('T', '2'), up('4'), true)).toBe('stand'); // 12 vs 4 stands
  });

  it('collapses double to hit when doubling is not allowed', () => {
    expect(basicStrategyDecision(hand('6', '5'), up('5'), false)).toBe('hit');
  });
});

describe('basic strategy — soft totals (S17)', () => {
  it('handles the classic soft-18 line', () => {
    expect(basicStrategyDecision(hand('A', '7'), up('2'), true)).toBe('stand');
    expect(basicStrategyDecision(hand('A', '7'), up('3'), true)).toBe('double');
    expect(basicStrategyDecision(hand('A', '7'), up('6'), true)).toBe('double');
    expect(basicStrategyDecision(hand('A', '7'), up('8'), true)).toBe('stand');
    expect(basicStrategyDecision(hand('A', '7'), up('9'), true)).toBe('hit');
    expect(basicStrategyDecision(hand('A', '7'), up('A'), true)).toBe('hit');
  });

  it('doubles soft 13-17 on the correct weak upcards', () => {
    expect(basicStrategyDecision(hand('A', '2'), up('5'), true)).toBe('double'); // soft 13
    expect(basicStrategyDecision(hand('A', '2'), up('4'), true)).toBe('hit');
    expect(basicStrategyDecision(hand('A', '4'), up('4'), true)).toBe('double'); // soft 15
    expect(basicStrategyDecision(hand('A', '6'), up('3'), true)).toBe('double'); // soft 17
    expect(basicStrategyDecision(hand('A', '6'), up('2'), true)).toBe('hit');
  });

  it('doubles soft 19 (A,8) only vs 6 under S17, else stands', () => {
    expect(basicStrategyDecision(hand('A', '8'), up('6'), true)).toBe('double');
    expect(basicStrategyDecision(hand('A', '8'), up('5'), true)).toBe('stand');
    expect(basicStrategyDecision(hand('A', '8'), up('6'), false)).toBe('hit'); // no double allowed
    expect(basicStrategyDecision(hand('A', '9'), up('6'), true)).toBe('stand'); // soft 20 stands
  });
});

describe('basic strategy — pair splitting (DAS)', () => {
  const cd = true; // canDouble
  const cs = true; // canSplit
  it('always splits Aces and 8s', () => {
    for (const d of ['2', '7', 'T', 'A'] as Rank[]) {
      expect(basicStrategyDecision(hand('A', 'A'), up(d), cd, cs)).toBe('split');
      expect(basicStrategyDecision(hand('8', '8'), up(d), cd, cs)).toBe('split');
    }
  });

  it('never splits 5s (plays as hard 10) or tens', () => {
    expect(basicStrategyDecision(hand('5', '5'), up('6'), cd, cs)).toBe('double'); // 10 vs 6
    expect(basicStrategyDecision(hand('5', '5'), up('T'), cd, cs)).toBe('hit');    // 10 vs T
    expect(basicStrategyDecision(hand('T', 'T'), up('6'), cd, cs)).toBe('stand');
  });

  it('splits 9s except vs 7, T, A', () => {
    expect(basicStrategyDecision(hand('9', '9'), up('6'), cd, cs)).toBe('split');
    expect(basicStrategyDecision(hand('9', '9'), up('7'), cd, cs)).toBe('stand');
    expect(basicStrategyDecision(hand('9', '9'), up('9'), cd, cs)).toBe('split');
    expect(basicStrategyDecision(hand('9', '9'), up('T'), cd, cs)).toBe('stand');
    expect(basicStrategyDecision(hand('9', '9'), up('A'), cd, cs)).toBe('stand');
  });

  it('splits low pairs vs bust cards, but 4,4 only vs 5-6', () => {
    expect(basicStrategyDecision(hand('2', '2'), up('4'), cd, cs)).toBe('split');
    expect(basicStrategyDecision(hand('3', '3'), up('7'), cd, cs)).toBe('split');
    expect(basicStrategyDecision(hand('6', '6'), up('2'), cd, cs)).toBe('split');
    expect(basicStrategyDecision(hand('4', '4'), up('5'), cd, cs)).toBe('split');
    expect(basicStrategyDecision(hand('4', '4'), up('4'), cd, cs)).toBe('hit');
  });

  it('does not split when splitting is disallowed (falls back to hard play)', () => {
    // 8,8 = hard 16: stand vs 6, hit vs 7 when we cannot split.
    expect(basicStrategyDecision(hand('8', '8'), up('6'), true, false)).toBe('stand');
    expect(basicStrategyDecision(hand('8', '8'), up('7'), true, false)).toBe('hit');
  });
});

describe('insurance advice', () => {
  it('always declines insurance (it is a -EV side bet)', () => {
    expect(shouldTakeInsurance()).toBe(false);
  });
});

describe('dealer turn (S17)', () => {
  it('stands on all 17 including soft 17', () => {
    const soft17 = hand('A', '6'); // 17 soft
    playDealerTurn(soft17, () => ({ rank: 'K', suit: '♠' }));
    expect(handValue(soft17).total).toBe(17); // did not hit
  });

  it('hits until reaching at least 17', () => {
    const d = hand('5', '4'); // 9
    const feed = [up('3'), up('K')]; // 9 -> 12 -> 22? K makes 22 -> stops after >=17? 12 <17 draw K -> 22
    let i = 0;
    playDealerTurn(d, () => feed[i++]);
    expect(handValue(d).total).toBeGreaterThanOrEqual(17);
  });

  it('bails cleanly when the draw source is exhausted', () => {
    const d = hand('2', '3'); // 5
    playDealerTurn(d, () => undefined);
    expect(d).toHaveLength(2); // nothing pushed
  });
});

describe('playRound settlement', () => {
  const alwaysStand = () => 'stand' as Action;

  it('pays a natural 3:2', () => {
    // Order after shuffle depends on rng; instead force a deterministic shoe by
    // using a strategy-independent property: run many rounds and confirm any
    // blackjack outcome nets +1.5 * bet.
    let sawBJ = false;
    for (let i = 0; i < 2000 && !sawBJ; i++) {
      const r = playRound(10, alwaysStand);
      if (r.outcome === 'blackjack') {
        expect(r.net).toBeCloseTo(15);
        sawBJ = true;
      }
    }
  });

  it('produces only valid outcomes and consistent net signs', () => {
    for (let i = 0; i < 300; i++) {
      const r = playRound(10, strategyFor('basic'));
      expect(['win', 'lose', 'push', 'blackjack']).toContain(r.outcome);
      if (r.outcome === 'lose') expect(r.net).toBeLessThan(0);
      if (r.outcome === 'win' || r.outcome === 'blackjack') expect(r.net).toBeGreaterThan(0);
      if (r.outcome === 'push') expect(r.net).toBe(0);
      expect(r.bet).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('Monte Carlo sim', () => {
  it('rejects non-positive hand counts', async () => {
    await expect(runBlackjackSimAsync('basic', 0)).rejects.toThrow();
    await expect(runBlackjackSimAsync('basic', -5)).rejects.toThrow();
  });

  it('reports a small house edge for basic strategy and a large one for always-stand', async () => {
    const basic = await runBlackjackSimAsync('basic', 40_000, { chunkSize: 40_000 });
    const stand = await runBlackjackSimAsync('always-stand', 40_000, { chunkSize: 40_000 });
    expect(basic).not.toBeNull();
    expect(stand).not.toBeNull();
    // Basic strategy edge should be small (roughly 0-2% for this ruleset); always
    // well under the always-stand disaster.
    expect(Math.abs(basic!.edge)).toBeLessThan(0.03);
    expect(stand!.edge).toBeGreaterThan(0.1);
    expect(basic!.edge).toBeLessThan(stand!.edge);
    // Sanity on counters.
    expect(basic!.winCount + basic!.loseCount + basic!.pushCount).toBe(basic!.hands);
  });
});
