import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { P, VALUES, addValue, upcard } from '@/components/game/Blackjack/analysis';
import { act, legalActions, type Action, type Card, type Rank, type Round } from '@/components/game/Blackjack/engine';
import { HandReview, costText } from '@/components/game/Blackjack/HandReview';
import { getStrings } from '@/components/game/Blackjack/i18n';
import {
  INSURANCE_LOSS,
  matchesChart,
  moveEvs,
  reviewInsurance,
  reviewMove,
  spotOf,
  summarize,
  type Decision,
} from '@/components/game/Blackjack/review';

const card = (rank: Rank): Card => ({ rank, suit: '♠' });
const cards = (ranks: string) => [...ranks].map((r) => card(r as Rank));

/** A round at the player's turn: the dealer shows `up`, the hands are as given, and the shoe deals `next` in order. */
const roundOf = (up: string, hands: string[], { bet = 2, active = 0, next = '' } = {}): Round => ({
  shoe: { decks: 6, cards: cards(next), next: 0, cutIndex: 0 },
  bet,
  dealer: [card(up as Rank), card('7')],
  hands: hands.map((h) => ({ cards: cards(h), bet, doubled: false, split: hands.length > 1, splitAce: false, done: false })),
  active,
  phase: 'player',
  insurance: 0,
  result: null,
  whole: true,
});

const ALL = { double: true, split: true };

describe('reviewMove', () => {
  it('finds the chart’s play free and a play against it costly, in medals of the hand’s bet', () => {
    const round = roundOf('T', ['T6'], { bet: 4 });
    const legal = legalActions(round);
    const a = upcard(10);
    const hit = reviewMove(round, 'hit', legal);
    expect(hit).toMatchObject({ kind: 'move', hand: 0, action: 'hit', chart: 'hit', cost: 0 });
    expect(matchesChart(hit)).toBe(true);
    const stand = reviewMove(round, 'stand', legal);
    expect(stand.chart).toBe('hit');
    expect(matchesChart(stand)).toBe(false);
    expect(stand.cost).toBeCloseTo(4 * (a.hit({ total: 16, soft: false }) - a.stand(16)), 12);
    expect(stand.cost).toBeGreaterThan(0);
    // The cards are the hand's as it was, not the round's own array.
    expect(stand.cards).toEqual(cards('T6'));
    expect(stand.cards).not.toBe(round.hands[0].cards);
  });

  it('measures against the plays the player’s medals allowed', () => {
    const round = roundOf('6', ['65']);
    // With the medals for it, 11 against a 6 is a double, and a hit gives up the difference.
    const rich = reviewMove(round, 'hit', legalActions(round));
    expect(rich.chart).toBe('double');
    expect(rich.cost).toBeCloseTo(2 * (upcard(6).double({ total: 11, soft: false }) - upcard(6).hit({ total: 11, soft: false })), 12);
    // Without them the chart's play is the hit, and it costs nothing.
    const poor = reviewMove(round, 'hit', { double: false, split: false });
    expect(poor).toMatchObject({ chart: 'hit', cost: 0 });
    expect(() => reviewMove(round, 'double', { double: false, split: false })).toThrow();
  });

  it('says which hand a play was on, and that place holds as hands are split', () => {
    let round = roundOf('6', ['88'], { next: '8T32T' });
    const first = reviewMove(round, 'split', legalActions(round));
    expect(first).toMatchObject({ hand: 0, action: 'split', chart: 'split', cost: 0 });
    round = act(round, 'split'); // 8 8 | 8
    const second = reviewMove(round, 'split', legalActions(round));
    expect(second.hand).toBe(0);
    round = act(round, 'split'); // 8 T | 8 | 8
    round = act(round, 'stand'); // on to the second hand: 8 3
    expect(round.active).toBe(1);
    expect(reviewMove(round, 'double', legalActions(round))).toMatchObject({ hand: 1, chart: 'double', cost: 0 });
  });

  it('never finds the chart’s play dear: its cost is nothing or a close call', () => {
    let close = 0;
    let cells = 0;
    const hands: string[] = [];
    for (const a of 'A23456789T') for (const b of 'A23456789T') if (!(a === 'A' && b === 'T') && !(a === 'T' && b === 'A')) hands.push(a + b);
    for (const up of 'A23456789T') {
      for (const hand of hands) {
        const round = roundOf(up, [hand], { bet: 1 });
        const legal = legalActions(round);
        const chart = reviewMove(round, 'stand', legal).chart;
        const played = reviewMove(round, chart, legal);
        cells++;
        if (played.cost > 0) close++;
        expect(played.cost).toBeLessThan(0.02);
      }
    }
    expect(close / cells).toBeLessThan(0.05);
  });
});

describe('moveEvs', () => {
  it('gives only the plays allowed', () => {
    expect(Object.keys(moveEvs(cards('88'), card('6'), ALL)).sort()).toEqual(['double', 'hit', 'split', 'stand']);
    expect(Object.keys(moveEvs(cards('88'), card('6'), { double: true, split: false })).sort()).toEqual(['double', 'hit', 'stand']);
    expect(Object.keys(moveEvs(cards('853'), card('6'), { double: false, split: false })).sort()).toEqual(['hit', 'stand']);
  });

  it('values a split by how many more the table allows', () => {
    const a = upcard(6);
    expect(moveEvs(cards('88'), card('6'), ALL).split).toBe(a.split(8));
    expect(a.split(8, 2)).toBe(a.split(8));
    // The fourth hand cannot be split again: each of the two hands is the best play of an 8 and one more card.
    let hand = 0;
    for (const c of VALUES) hand += P[c] * Math.max(...Object.values(a.twoCard(addValue({ total: 8, soft: false }, c))));
    expect(moveEvs(cards('88'), card('6'), ALL, 3).split).toBeCloseTo(2 * hand, 12);
    // Splitting 8s again is worth having against a 6, so the last split is worth less than the first.
    expect(a.split(8, 4)).toBeLessThan(a.split(8, 3));
    expect(a.split(8, 3)).toBeLessThan(a.split(8));
    // Aces are split once, however many hands there are.
    expect(a.split(11, 4)).toBe(a.split(11));
  });
});

describe('reviewInsurance', () => {
  it('costs a thirteenth of the stake when taken and nothing when declined', () => {
    expect(INSURANCE_LOSS).toBeCloseTo(1 / 13, 12);
    expect(reviewInsurance({ bet: 10, whole: true }, true)).toMatchObject({ kind: 'insurance', taken: true });
    expect(reviewInsurance({ bet: 10, whole: true }, true).cost).toBeCloseTo(5 / 13, 12);
    // A 3-medal bet insures with one medal.
    expect(reviewInsurance({ bet: 3, whole: true }, true).cost).toBeCloseTo(1 / 13, 12);
    const declined = reviewInsurance({ bet: 10, whole: true }, false);
    expect(declined.cost).toBe(0);
    expect(matchesChart(declined)).toBe(true);
    expect(matchesChart(reviewInsurance({ bet: 10, whole: true }, true))).toBe(false);
  });
});

describe('spotOf', () => {
  it('names a hand as a chart does', () => {
    expect(spotOf(cards('88'))).toEqual({ kind: 'pair', value: 8 });
    expect(spotOf(cards('KQ'))).toEqual({ kind: 'pair', value: 10 });
    expect(spotOf(cards('AA'))).toEqual({ kind: 'pair', value: 11 });
    expect(spotOf(cards('A7'))).toEqual({ kind: 'soft', value: 18 });
    expect(spotOf(cards('A7T'))).toEqual({ kind: 'hard', value: 18 });
    expect(spotOf(cards('T6'))).toEqual({ kind: 'hard', value: 16 });
    expect(spotOf(cards('448'))).toEqual({ kind: 'hard', value: 16 });
  });
});

const move = (hand: string, up: string, action: Action, at: Partial<Parameters<typeof roundOf>[2]> = {}) => {
  const round = roundOf(up, [hand], at);
  return reviewMove(round, action, legalActions(round));
};

describe('summarize', () => {
  it('counts the plays that matched the chart and adds up the costs', () => {
    const plays: Decision[] = [reviewInsurance({ bet: 4, whole: true }, true), move('T6', 'A', 'stand', { bet: 4 }), move('T6', 'A', 'hit', { bet: 4 })];
    const sum = summarize(plays);
    expect(sum.plays).toBe(3);
    expect(sum.matched).toBe(1);
    expect(sum.cost).toBeCloseTo(plays[0].cost + plays[1].cost, 12);
    expect(summarize([])).toEqual({ plays: 0, matched: 0, cost: 0 });
  });
});

describe('HandReview', () => {
  it('writes a cost to the hundredth of a medal', () => {
    expect(costText(0)).toBe('0');
    expect(costText(0.004)).toBe('<0.01');
    expect(costText(0.005)).toBe('0.01');
    expect(costText(1.234)).toBe('1.23');
  });

  it('shows nothing for a hand with no play in it', () => {
    expect(renderToStaticMarkup(<HandReview t={getStrings('en')} decisions={[]} hands={1} />)).toBe('');
  });

  it('lists each play with the chart’s and what it gives up', () => {
    const stood = move('T6', 'T', 'stand', { bet: 4 });
    const markup = renderToStaticMarkup(<HandReview t={getStrings('en')} decisions={[move('65', 'T', 'double', { bet: 4 }), stood]} hands={1} />);
    expect(markup).toContain('Your plays this hand');
    expect(markup).toContain('Hard 11 vs 10');
    expect(markup).toContain('Hard 16 vs 10');
    expect(markup).not.toContain('Hand 1');
    expect(markup).toContain('You: Stand');
    expect(markup).toContain('You: Double');
    expect(markup).toContain('✓ The chart’s play');
    expect(markup).toContain('Chart: Hit');
    expect(stood.cost).toBeLessThan(0.005);
    expect(markup).toContain('gives up &lt;0.01 medals on average');
    expect(markup.match(/data-match="true"/g)).toHaveLength(1);
    expect(markup.match(/data-match="false"/g)).toHaveLength(1);
    expect(markup).toContain('1 of 2 plays matched the chart. Together they give up &lt;0.01 medals on average.');
  });

  it('names the hand once there was a split, and reads insurance and a clean hand', () => {
    const lost = move('65', '6', 'hit', { bet: 4 });
    expect(renderToStaticMarkup(<HandReview t={getStrings('en')} decisions={[lost]} hands={1} />)).toContain(`gives up ${lost.cost.toFixed(2)} medals on average`);
    const en = renderToStaticMarkup(
      <HandReview t={getStrings('en')} decisions={[reviewInsurance({ bet: 4, whole: true }, false), move('88', 'A', 'split'), move('A7', 'A', 'hit')]} hands={2} />,
    );
    expect(en).toContain('Insurance');
    expect(en).toContain('You: No insurance');
    expect(en).toContain('Hand 1 · Pair of 8s vs A');
    expect(en).toContain('Hand 1 · Soft 18 vs A');
    expect(en).toContain('3 of 3 plays matched the chart. None of them gives up anything on average.');
    expect(en).not.toContain('gives up 0');

    const insured = reviewInsurance({ bet: 4, whole: true }, true);
    const ja = renderToStaticMarkup(<HandReview t={getStrings('ja')} decisions={[insured, move('AA', '6', 'split')]} hands={2} />);
    expect(ja).toContain('このハンドのプレイ');
    expect(ja).toContain('あなた：掛けた');
    expect(ja).toContain('表：掛けない');
    expect(ja).toContain(`平均${insured.cost.toFixed(2)}枚の損`);
    expect(ja).toContain('ハンド1 · Aのペア 対 6');
    expect(ja).toContain('2回のうち1回が表どおりでした。');
  });
});
