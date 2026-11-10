import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { HandHistory } from '@/components/game/ThreeCardPoker/HandHistory';
import { PlayTab } from '@/components/game/ThreeCardPoker/PlayTab';
import { handOdds } from '@/components/game/ThreeCardPoker/analysis';
import { dealRound, decide, settle, type Bets, type Card, type Decision, type Rank, type Suit } from '@/components/game/ThreeCardPoker/engine';
import { EMPTY_HISTORY, HISTORY_LIMIT, addHand, decisionValue, reviewHand, type History } from '@/components/game/ThreeCardPoker/history';
import { getStrings } from '@/components/game/ThreeCardPoker/i18n';
import { createI18nInstance } from '@/lib/i18n';

const hand = (text: string): Card[] => text.split(' ').map((c) => ({ rank: c[0] as Rank, suit: c[1] as Suit }));

const review = (player: string, dealer: string, decision: Decision, bets: Bets = { ante: 1, pairPlus: 0 }) => {
  const cards = { player: hand(player), dealer: hand(dealer), bets };
  return reviewHand(cards, settle(bets, decision, cards.player, cards.dealer));
};

/** A small seeded generator, so the sample of deals is the same on every run. */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe('reviewHand', () => {
  it('costs nothing when the decision is the best one', () => {
    const played = review('Q♠ 6♥ 4♦', 'K♠ 9♥ 2♦', 'play');
    expect(played.best).toBe('play');
    expect(played.cost).toBe(0);
    const folded = review('Q♠ 6♥ 3♦', 'K♠ 9♥ 2♦', 'fold');
    expect(folded.best).toBe('fold');
    expect(folded.cost).toBe(0);
  });

  it('charges a weak hand that was played what playing is expected to lose beyond the ante, in medals', () => {
    const cards = hand('J♠ 8♥ 3♦');
    const { evPlay } = handOdds(cards);
    expect(evPlay).toBeLessThan(-1);
    const played = review('J♠ 8♥ 3♦', '2♠ 5♥ 9♦', 'play', { ante: 5, pairPlus: 0 });
    expect(played.best).toBe('fold');
    expect(played.cost).toBeCloseTo(5 * (-1 - evPlay), 10);
    // The dealer did not qualify and the hand won: the review is of the decision, not of how it turned out.
    expect(played.settlement.net).toBe(5);
  });

  it('charges a folded hand that should have been played the ante it gave away and what playing was expected to bring', () => {
    const { evPlay } = handOdds(hand('K♠ 8♥ 3♦'));
    const folded = review('K♠ 8♥ 3♦', '2♠ 5♥ 9♦', 'fold', { ante: 2, pairPlus: 5 });
    expect(folded.best).toBe('play');
    // King-high wins nothing on Pair Plus either way, so that bet does not come into it.
    expect(folded.cost).toBeCloseTo(2 * (evPlay + 1), 10);
  });

  it('adds the Pair Plus bet and its winnings when a fold throws them away', () => {
    const { evPlay } = handOdds(hand('8♠ 8♥ 3♦'));
    const folded = review('8♠ 8♥ 3♦', 'A♠ K♥ 9♦', 'fold', { ante: 2, pairPlus: 5 });
    expect(folded.best).toBe('play');
    // A pair pays 1:1: folding gives up the 5 medals bet and the 5 they would have won.
    expect(folded.cost).toBeCloseTo(2 * (evPlay + 1) + 10, 10);
    expect(decisionValue('fold', { ante: 2, pairPlus: 5 }, hand('8♠ 8♥ 3♦'))).toBe(-7);
  });

  it('names the same best decision as the Q-6-4 rule and the exact value panel, with or without a Pair Plus bet', () => {
    const rng = seeded(7);
    for (let i = 0; i < 400; i++) {
      const { player, dealer } = dealRound(rng);
      const bets = { ante: 1 + (i % 10), pairPlus: i % 3 === 0 ? 0 : 1 + (i % 7) };
      const { best } = reviewHand({ player, dealer, bets }, settle(bets, 'play', player, dealer));
      expect(best).toBe(decide('optimal', player));
      expect(best).toBe(handOdds(player).best);
    }
  });
});

describe('addHand', () => {
  it('numbers the hands, keeps the newest first and counts every hand in the totals', () => {
    let history: History = EMPTY_HISTORY;
    history = addHand(history, review('Q♠ 6♥ 4♦', 'K♠ 9♥ 2♦', 'play'));
    history = addHand(history, review('J♠ 8♥ 3♦', '2♠ 5♥ 9♦', 'play'));
    history = addHand(history, review('K♠ 8♥ 3♦', '2♠ 5♥ 9♦', 'fold'));
    expect(history.entries.map((e) => e.number)).toEqual([3, 2, 1]);
    expect(history.hands).toBe(3);
    expect(history.mistakes).toBe(2);
    expect(history.cost).toBeCloseTo(history.entries[0].cost + history.entries[1].cost, 10);
    expect(EMPTY_HISTORY.entries).toHaveLength(0);
  });

  it('lists only the last hands but goes on counting', () => {
    let history: History = EMPTY_HISTORY;
    const mistake = review('J♠ 8♥ 3♦', '2♠ 5♥ 9♦', 'play');
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) history = addHand(history, mistake);
    expect(history.entries).toHaveLength(HISTORY_LIMIT);
    expect(history.entries[0].number).toBe(HISTORY_LIMIT + 5);
    expect(history.entries[HISTORY_LIMIT - 1].number).toBe(6);
    expect(history.hands).toBe(HISTORY_LIMIT + 5);
    expect(history.mistakes).toBe(HISTORY_LIMIT + 5);
    expect(history.cost).toBeCloseTo((HISTORY_LIMIT + 5) * mistake.cost, 8);
  });
});

describe('HandHistory', () => {
  const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
    renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
  const text = (markup: string) => markup.replace(/<[^>]+>/g, '');

  const played = [
    review('Q♠ 6♥ 4♦', 'K♠ 9♥ 2♦', 'play', { ante: 5, pairPlus: 0 }),
    review('8♠ 8♥ 3♦', 'T♠ 7♥ 2♦', 'fold', { ante: 2, pairPlus: 5 }),
  ];
  const history = played.reduce((so, next) => addHand(so, next), EMPTY_HISTORY);

  it('says what will be listed before any hand is finished, on the table too', () => {
    const empty = render(<HandHistory history={EMPTY_HISTORY} t={getStrings('en')} locale="en-US" />);
    expect(text(empty)).toContain('Hands this session (newest first, the last 20)');
    expect(empty).toContain('Each hand you finish is listed here');
    expect(empty).not.toContain('role="region"');
    expect(empty).not.toContain('tcp-history-summary');
    expect(render(<PlayTab />)).toContain('data-testid="tcp-history"');
    expect(render(<PlayTab />, 'ja')).toContain('終わったハンドが、最善の判断と一緒にここに並びます。');
  });

  it('lists each hand with both sets of cards, what it came to and the decision against the best one', () => {
    const markup = render(<HandHistory history={history} t={getStrings('en')} locale="en-US" />);
    const cost = history.entries[0].cost.toFixed(2);
    expect(markup).toContain(`data-testid="tcp-history-summary">Not the best decision in 1 of 2 hands · ${cost} medals given up on average<`);
    // The list scrolls, so the keyboard can reach it, and it has a name.
    expect(markup).toMatch(/tabindex="0" role="region" aria-label="Hands played this session, newest first"/);
    const rows = [...markup.matchAll(/<li[^>]*data-hand="(\d+)" data-agreed="(\w+)">(.*?)<\/li>/g)].map((m) => [m[1], m[2], text(m[3])]);
    expect(rows.map((r) => r.slice(0, 2))).toEqual([
      ['2', 'false'],
      ['1', 'true'],
    ]);
    expect(rows[0][2]).toContain('You 8♠8♥3♦ Pair of 8s');
    expect(rows[0][2]).toContain('Dealer 10♠7♥2♦ 10-high · doesn’t qualify');
    expect(rows[0][2]).toContain('−7lost 7');
    expect(rows[0][2]).toContain(`✗ Folded — playing was better by ${cost} medals on average · Ante 2, Pair Plus 5`);
    expect(rows[1][2]).toContain('Dealer K♠9♥2♦ K-high');
    expect(rows[1][2]).not.toContain('qualify');
    expect(rows[1][2]).toContain('−10lost 10');
    expect(rows[1][2]).toContain('✓ Played — the best decision · Ante 5');
    // Hearts and diamonds are marked red; spades are not.
    expect(markup).toContain('<span data-red="true">8♥</span>');
    expect(markup).toContain('<span>8♠</span>');
    expect(markup).toContain('over the 18,424 hands the dealer could hold');
  });

  it('is localized', () => {
    const markup = render(<HandHistory history={history} t={getStrings('ja')} locale="ja-JP" />, 'ja');
    const cost = history.entries[0].cost.toFixed(2);
    expect(text(markup)).toContain('このセッションのハンド (新しい順・直近20回)');
    expect(markup).toContain(`最善でなかった判断：2回中1回・平均で計${cost}枚の損`);
    expect(markup).toContain('aria-label="このセッションでプレイしたハンド（新しい順）"');
    expect(text(markup)).toContain(`フォールド（プレイのほうが平均${cost}枚有利） · アンティ2、ペアプラス5`);
    expect(text(markup)).toContain('プレイ（最善の判断） · アンティ5');
    expect(text(markup)).toContain('7枚の負け');
    expect(markup).not.toContain('Hands this session');
  });

  it('says a single hand in the singular and an even hand as even', () => {
    const en = getStrings('en');
    expect(en.historySummary(0, 1, '0.00')).toBe('Not the best decision in 0 of 1 hand · 0.00 medals given up on average');
    expect(en.historyNet(3)).toBe('won 3');
    expect(en.historyNet(0)).toBe('even');
    expect(getStrings('ja').historyNet(0)).toBe('増減なし');
    expect(en.historyVerdict('play', 'fold', '0.42')).toBe('Played — folding was better by 0.42 medals on average');
  });
});
