import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { BETS, LADDER, RANKS, TOP, UNIT, analyzeLadder, type Card, type Guess, type Move } from '@/components/game/HighLow/engine';
import { getStrings } from '@/components/game/HighLow/i18n';
import type { RoundRecord } from '@/components/game/HighLow/medalTable';
import { PlayTab } from '@/components/game/HighLow/PlayTab';
import { judge, reviewGame } from '@/components/game/HighLow/review';
import { ReviewPanel, gaveUpText } from '@/components/game/HighLow/ReviewPanel';
import { createI18nInstance } from '@/lib/i18n';

// The review of a finished game: each choice beside best play, and what it gave up on average.

/** A card of a rank (0 for a 2 up to 12 for an ace), in spades. */
const card = (rank: number): Card => rank * 4;
const game = (ranks: number[], guesses: Guess[], taken = false, bet: RoundRecord['bet'] = 5): RoundRecord => ({ v: 1, id: 'g1', owner: null, ledger: 'dev', era: 0, bet, cards: ranks.map(card), guesses, taken });

/** Every choice's worth worked out a second way, in plain numbers: medals per `UNIT` bet, best play after the choice. */
function worthByNumbers(): Record<Move, number>[][] {
  const out: Record<Move, number>[][] = [];
  let above = new Array<number>(RANKS).fill(LADDER[TOP - 1]);
  for (let rung = TOP - 1; rung >= 0; rung--) {
    out[rung] = [];
    const here: number[] = [];
    for (let rank = 0; rank < RANKS; rank++) {
      let high = 0;
      let low = 0;
      for (let next = 0; next < RANKS; next++) {
        if (next > rank) high += above[next] / RANKS;
        if (next < rank) low += above[next] / RANKS;
      }
      const take = rung === 0 ? Number.NEGATIVE_INFINITY : LADDER[rung - 1];
      out[rung][rank] = { take, high, low };
      here.push(Math.max(take, high, low));
    }
    above = here;
  }
  return out;
}

describe('a choice beside best play', () => {
  it('names the published best play at every card on every rung, and both sides where they are worth the same', () => {
    const { moves } = analyzeLadder();
    for (let rung = 0; rung < TOP; rung++) {
      for (let rank = 0; rank < RANKS; rank++) {
        const { best, matched, gaveUp } = judge(rung, rank, moves[rung][rank], 5);
        expect(best, `rung ${rung} rank ${rank}`).toContain(moves[rung][rank]);
        expect(matched).toBe(true);
        expect(gaveUp).toBe(0);
        // HIGH and LOW are worth the same only from the middle card, the 8; a take never ties with a guess.
        expect(best).toEqual(moves[rung][rank] !== 'take' && rank === 6 ? ['high', 'low'] : [moves[rung][rank]]);
      }
    }
  });

  it('gives up exactly the best choice’s worth less its own, for every choice at every state and every bet', () => {
    const worth = worthByNumbers();
    for (let rung = 0; rung < TOP; rung++) {
      for (let rank = 0; rank < RANKS; rank++) {
        const most = Math.max(worth[rung][rank].take, worth[rung][rank].high, worth[rung][rank].low);
        for (const move of ['take', 'high', 'low'] as const) {
          if (rung === 0 && move === 'take') continue;
          for (const bet of BETS) {
            const { gaveUp, matched } = judge(rung, rank, move, bet);
            expect(gaveUp, `rung ${rung} rank ${rank} ${move} on ${bet}`).toBeCloseTo(((most - worth[rung][rank][move]) * bet) / UNIT, 6);
            expect(gaveUp).toBeGreaterThanOrEqual(0);
            expect(matched).toBe(gaveUp === 0);
          }
        }
      }
    }
  });

  it('counts a guess against the odds at its full price', () => {
    // LOW from a 2 cannot win: it gives up all that HIGH is worth there.
    const hopeless = judge(0, 0, 'low', 5);
    expect(hopeless.best).toEqual(['high']);
    expect(hopeless.gaveUp).toBeCloseTo(worthByNumbers()[0][0].high, 6);
    // Taking 6 on the first rung from an ace, where LOW wins 12 times in 13, gives a little up.
    const early = judge(1, 12, 'take', 5);
    expect(early.best).toEqual(['low']);
    expect(early.gaveUp).toBeGreaterThan(0);
    expect(judge(1, 12, 'take', 50).gaveUp).toBeCloseTo(early.gaveUp * 10, 9);
  });
});

describe('a game looked back over', () => {
  it('has a row for every guess and for the take that ended it', () => {
    // A 2: HIGH (right, a 9). A 9 on rung 1: TAKE, which is best play there.
    const review = reviewGame(game([0, 7], ['high'], true));
    expect(review?.decisions.map(({ rung, move, result, matched }) => ({ rung, move, result, matched }))).toEqual([
      { rung: 0, move: 'high', result: 'right', matched: true },
      { rung: 1, move: 'take', result: null, matched: true },
    ]);
    expect(review?.matched).toBe(2);
    expect(review?.gaveUp).toBe(0);
  });

  it('tells a tie from a wrong guess, and adds up what the choices gave up', () => {
    // A King: HIGH (not best; right, an ace). An ace on rung 1: LOW (best), and another ace ties.
    const review = reviewGame(game([11, 12, 12], ['high', 'low']));
    expect(review?.decisions.map(({ result, matched }) => ({ result, matched }))).toEqual([
      { result: 'right', matched: false },
      { result: 'tie', matched: true },
    ]);
    expect(review?.decisions[0].best).toEqual(['low']);
    expect(review?.matched).toBe(1);
    expect(review?.gaveUp).toBe(review?.decisions[0].gaveUp);
    expect(review?.gaveUp).toBeGreaterThan(0);
    expect(reviewGame(game([5, 0], ['high']))?.decisions[0].result).toBe('wrong');
  });

  it('has no take for a game that reached the top, and nothing for a game still being played', () => {
    // 2, A, 2, A, …: twelve right guesses.
    const ranks = Array.from({ length: TOP + 1 }, (_, i) => (i % 2 === 0 ? 0 : 12));
    const guesses = Array.from({ length: TOP }, (_, i): Guess => (i % 2 === 0 ? 'high' : 'low'));
    const top = reviewGame(game(ranks, guesses, true));
    expect(top?.decisions).toHaveLength(TOP);
    expect(top?.decisions.every(({ move, matched }) => move !== 'take' && matched)).toBe(true);
    expect(reviewGame(game([0, 7], ['high']))).toBeNull();
    expect(reviewGame(game([3], []))).toBeNull();
  });
});

describe('the review panel', () => {
  const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
  const review = reviewGame(game([11, 12, 12], ['high', 'low']))!;

  it('shows each choice, how it came out and the best play, in both languages', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getStrings(lang);
      const locale = lang === 'ja' ? 'ja-JP' : 'en-US';
      const markup = render(<ReviewPanel review={review} visit={{ choices: 5, matched: 3 }} t={t} locale={locale} />, lang);
      expect(markup.match(/data-testid="hl-review-row"/g)).toHaveLength(2);
      expect(markup).toContain(`aria-label="${t.cardName(11, 0)}"`);
      expect(markup).toContain(t.reviewSummary(1, 2));
      expect(markup).toContain(t.reviewGaveUp(gaveUpText(review.gaveUp, locale)));
      expect(markup).toContain(t.reviewBetter(t.low, gaveUpText(review.decisions[0].gaveUp, locale)));
      expect(markup).toContain(`· ${t.reviewTie}`);
      expect(markup).toContain(`>${t.reviewBest}<`);
      expect(markup).toContain(t.reviewVisit(3, 5));
      expect(markup).toContain(t.reviewNote);
    }
  });

  it('waits for a game to end: the machine opens with no review and no visit figures', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain(getStrings('en').reviewEmpty);
    expect(markup).not.toContain('hl-review-row');
    expect(markup).not.toContain('hl-review-visit');
    expect(render(<PlayTab />, 'ja')).toContain(getStrings('ja').reviewEmpty);
  });

  it('never rounds something given up to nothing', () => {
    expect(gaveUpText(0.0004, 'en-US')).toBe('0.0004');
    expect(gaveUpText(1.2345, 'en-US')).toBe('1.23');
    expect(gaveUpText(12, 'ja-JP')).toBe('12');
  });
});
