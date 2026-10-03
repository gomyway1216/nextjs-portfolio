import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { ThreeCardPoker } from '@/components/game/ThreeCardPoker';
import { HoleCard, PlayingCard, cardLabel } from '@/components/game/ThreeCardPoker/Cards';
import { OddsTab, THRESHOLD_HANDS } from '@/components/game/ThreeCardPoker/OddsTab';
import { INITIAL_BANKROLL, PlayTab, TIMING, dealSchedule, revealSchedule } from '@/components/game/ThreeCardPoker/PlayTab';
import { HAND_OPTIONS, SimTab } from '@/components/game/ThreeCardPoker/SimTab';
import { EdgeChart, EvCurve } from '@/components/game/ThreeCardPoker/charts';
import { getStrings } from '@/components/game/ThreeCardPoker/i18n';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('cards', () => {
  it('labels a face-up card by rank and suit, writing tens as 10', () => {
    const markup = renderToStaticMarkup(<PlayingCard card={{ rank: 'T', suit: '♥' }} />);
    expect(markup).toContain('aria-label="10♥"');
    expect(markup).toContain('data-rank="T"');
    expect(markup).toContain('data-suit="♥"');
    expect(cardLabel({ rank: 'Q', suit: '♠' })).toBe('Q♠');
  });

  it('gives nothing away about a face-down card', () => {
    const markup = renderToStaticMarkup(<HoleCard label="Face-down card" />);
    expect(markup).toContain('data-hole="true"');
    expect(markup).toContain('aria-label="Face-down card"');
    expect(markup).not.toContain('data-rank');
    expect(markup).not.toContain('data-suit');
    expect(markup).not.toMatch(/[♠♥♦♣]/);
  });
});

describe('PlayTab', () => {
  it('opens with a full bankroll, the three spots and nothing dealt', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain(`data-testid="tcp-bankroll">${INITIAL_BANKROLL}<`);
    expect(markup).toContain('data-testid="tcp-on-table">0<');
    expect([...markup.matchAll(/data-bet="(\w+)"/g)].map((m) => m[1])).toEqual(['pairPlus', 'ante', 'play']);
    expect(markup).toContain('aria-label="Ante (1:1)"');
    expect(markup).toContain('aria-label="Pair Plus (up to 40:1)"');
    expect(markup).toContain('>DEAL<');
    expect(markup).toContain('Place your Ante, then deal.');
    // PLAY and FOLD are there but locked until a hand is dealt.
    expect(markup).toMatch(/<button[^>]*data-action="play"[^>]*disabled=""[^>]*>PLAY<\/button>/);
    expect(markup).toMatch(/<button[^>]*data-action="fold"[^>]*disabled=""[^>]*>FOLD<\/button>/);
    // No cards, no result, no value panel yet.
    expect(markup).not.toContain('data-rank');
    expect(markup).not.toContain('data-hole');
    expect(markup).not.toContain('data-testid="tcp-ev"');
    expect(markup).not.toContain('data-testid="tcp-results"');
    expect(markup).not.toContain('data-testid="tcp-hint"');
    // The hint toggle starts on, and the stats carry the exact rates to compare with.
    expect(markup).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    expect(markup).toContain('67.42%');
    expect(markup).toContain('69.59%');
    expect(markup).toContain('Dealer plays with Queen-high or better');
  });

  it('is localized, felt included', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('所持金');
    expect(markup).toContain('>ディール<');
    expect(markup).toContain('>プレイ</button>');
    expect(markup).toContain('>フォールド</button>');
    expect(markup).toContain('aria-label="アンティ（1:1）"');
    expect(markup).toContain('ディーラーはクイーンハイ以上で勝負');
    expect(markup).toContain('戦略のヒントを表示');
    expect(markup).not.toContain('Dealer plays with');
  });

  it('paces the deal and the reveal, and drops every delay for reduced motion', () => {
    const deal = dealSchedule();
    expect(deal.cards).toEqual([0, 1, 2, 3, 4, 5].map((k) => k * TIMING.card));
    expect(deal.ready).toBeGreaterThan(deal.cards[5]);
    const reveal = revealSchedule();
    expect(reveal.flips).toEqual([0, TIMING.flip, 2 * TIMING.flip]);
    expect(reveal.paid).toBeGreaterThan(reveal.flips[2]);
    expect(dealSchedule(true)).toEqual({ cards: [0, 0, 0, 0, 0, 0], ready: 0 });
    expect(revealSchedule(true)).toEqual({ flips: [0, 0, 0], paid: 0 });
  });

  it('names hands and results in both languages', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    expect(en.handName('highCard', 'Q')).toBe('Q-high');
    expect(en.handName('pair', '10')).toBe('Pair of 10s');
    expect(en.handName('straightFlush', 'A')).toBe('Straight flush');
    expect(ja.handName('highCard', 'Q')).toBe('Qハイ');
    expect(ja.handName('pair', '8')).toBe('8のペア');
    expect(ja.handName('threeOfAKind', '8')).toBe('スリーカード');
    expect(en.hintSays('play')).toBe('Strategy: play Q-6-4 or better → play this hand');
    expect(en.hintSays('fold')).toContain('fold this hand');
    expect(en.result('notQualified', '+10')).toContain('Ante pays, Play pushes · +10');
    expect(en.result('fold', '−15')).toBe('You folded · −15');
    expect(ja.result('win', '+20')).toBe('あなたの勝ち・+20');
    // The rules in the info modal spell out every payout.
    const rules = en.infoBody.join(' ');
    for (const text of ['Queen-high or better', 'straight pays 1:1', 'three of a kind 4:1', 'straight flush 5:1', 'pair 1:1, flush 3:1, straight 6:1, three of a kind 30:1, straight flush 40:1', 'Q-6-4']) {
      expect(rules, text).toContain(text);
    }
    expect(ja.infoBody).toHaveLength(en.infoBody.length);
  });
});

describe('OddsTab', () => {
  it('shows the exact counts and edges', () => {
    const markup = render(<OddsTab />);
    for (const [category, ways] of [
      ['straightFlush', '48'],
      ['threeOfAKind', '52'],
      ['straight', '720'],
      ['flush', '1,096'],
      ['pair', '3,744'],
      ['highCard', '16,440'],
    ]) {
      expect(markup, category).toContain(`data-testid="ways-${category}">${ways}<`);
    }
    expect(markup).toContain('data-testid="total-hands">22,100<');
    expect(markup).toContain('data-testid="edge-pairplus-standard">7.28%<');
    expect(markup).toContain('data-testid="edge-pairplus-old">2.32%<');
    expect(markup).toContain('data-testid="pairplus-return">−7.28%<');
    expect(markup).toContain('data-testid="edge-ante">3.37%<');
    expect(markup).toContain('data-testid="element-of-risk">2.01%<');
    expect(markup).toContain('data-testid="dealer-qualifies">69.59%<');
    expect(markup).toContain('data-testid="play-rate">67.42%<');
    expect(markup).toContain('data-testid="average-wager">1.674<');
    expect(markup).toContain('data-testid="total-combinations">407,170,400<');
    expect(markup).toContain('data-testid="ante-return">−3.373%<');
    expect(markup).toContain('data-testid="bonus-return">+5.285%<');
    // Best hand first, as on a pay table.
    expect([...markup.matchAll(/<tr data-category="(\w+)"/g)].map((m) => m[1]).slice(0, 6)).toEqual([
      'straightFlush',
      'threeOfAKind',
      'straight',
      'flush',
      'pair',
      'highCard',
    ]);
    // The five ways a hand ends, plus the bonus row.
    expect([...markup.matchAll(/<tr data-outcome="(\w+)"/g)].map((m) => m[1])).toEqual(['fold', 'notQualified', 'win', 'tie', 'lose', 'bonus']);
    expect(markup).toContain('132,652,800');
  });

  it('shows why Q-6-4 is the cut-off and compares the strategies', () => {
    const markup = render(<OddsTab />);
    const best = [...markup.matchAll(/<tr data-hand="(\w+)" data-best="(\w+)"/g)].map((m) => [m[1], m[2]]);
    expect(best.map(([h]) => h)).toEqual(THRESHOLD_HANDS.map((r) => r.join('')));
    expect(Object.fromEntries(best)).toMatchObject({ JT8: 'fold', Q32: 'fold', Q63: 'fold', Q64: 'play', Q65: 'play', K32: 'play' });
    expect(markup).toContain('<td>J-10-8</td>');
    expect(markup).toContain('−0.9939');
    expect(markup).toContain('−1.0031');
    expect(markup).toContain('data-testid="tcp-ev-curve"');
    expect(markup).toContain('the worst Q-6-4 is still worth −0.9946 and the best Q-6-3 only −1.0026');
    // Cheapest strategy first.
    expect([...markup.matchAll(/<tr data-strategy="(\w+)"/g)].map((m) => m[1])).toEqual(['optimal', 'mimic', 'always']);
    expect(markup).toContain('data-testid="edge-strategy-optimal">3.37%<');
    expect(markup).toContain('data-testid="edge-strategy-mimic">3.45%<');
    expect(markup).toContain('data-testid="edge-strategy-always">7.65%<');
    expect(markup).toContain('the 480 Queen-high hands weaker than Q-6-4');
    expect(markup).toContain('plays 7,200 hands the best strategy folds — 6,720 of them');
    expect(markup).toContain('Without it the house edge would be 8.66%.');
  });

  it('is localized', () => {
    const markup = render(<OddsTab />, 'ja');
    expect(markup).toContain('なぜQ-6-4が境目なのか');
    expect(markup).toContain('ストレートフラッシュ');
    expect(markup).toContain('1-4-6-30-40（元の配当）');
    expect(markup).toContain('data-testid="edge-ante">3.37%<');
  });
});

describe('SimTab', () => {
  it('offers the run and shows nothing until it has finished', () => {
    const markup = render(<SimTab />);
    expect(markup).toContain('Three strategies on the same cards');
    expect(markup.match(/>Run</g)).toHaveLength(1);
    expect(HAND_OPTIONS.every((n) => markup.includes(`value="${n}"`))).toBe(true);
    expect(markup).toContain('>100,000</option>');
    expect(markup).not.toContain('data-testid="tcp-sim-table"');
  });

  it('is localized', () => {
    const markup = render(<SimTab />, 'ja');
    expect(markup).toContain('同じカードで3つの戦略を比べる');
    expect(markup).toContain('>実行<');
  });
});

describe('charts', () => {
  it('draws one line per strategy with its exact edge dashed', () => {
    const markup = renderToStaticMarkup(
      <EdgeChart
        xLabel="Hands"
        series={[
          { id: 'optimal', color: '#22c55e', label: 'Optimal', theory: 0.0337, points: [{ hands: 100, edge: 0.1 }, { hands: 1000, edge: 0.04 }] },
          { id: 'always', color: '#ef4444', label: 'Always', theory: 0.0765, points: [{ hands: 100, edge: -0.05 }, { hands: 1000, edge: 0.08 }] },
        ]}
      />,
    );
    expect(markup.match(/<polyline/g)).toHaveLength(2);
    expect(markup).toContain('data-series="optimal"');
    expect(markup).toContain('aria-label="Optimal: 3.37%, Always: 7.65%"');
    expect(renderToStaticMarkup(<EdgeChart xLabel="Hands" series={[]} />)).toBe('');
  });

  it('marks the fold line and the threshold on the EV curve', () => {
    const markup = renderToStaticMarkup(
      <EvCurve values={[-1.1, -1.05, -0.95, 0.2]} threshold={2} thresholdLabel="Q-6-4" foldLabel="Fold: −1" xLabel="Hands" ariaLabel="curve" ticks={[{ index: 0, label: 'J' }]} />,
    );
    expect(markup).toContain('>Q-6-4<');
    expect(markup).toContain('>Fold: −1<');
    expect(markup.match(/<polyline/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<EvCurve values={[0]} threshold={0} thresholdLabel="" foldLabel="" xLabel="" ariaLabel="" ticks={[]} />)).toBe('');
  });
});

describe('ThreeCardPoker shell', () => {
  it('keeps every tab panel mounted and hides the inactive ones', () => {
    const markup = render(<ThreeCardPoker />, 'ja');
    const panels = [...markup.matchAll(/<div role="tabpanel" id="tcp-panel-(\w+)"[^>]*?( hidden="")?>/g)];
    expect(panels.map((m) => [m[1], Boolean(m[2])])).toEqual([
      ['play', false],
      ['odds', true],
      ['sim', true],
    ]);
    expect(markup).toContain('スリーカードポーカー');
    expect(markup).toContain('>シミュレーション<');
    expect(markup).toContain('aria-selected="true"');
  });

  it('renders in English with the three tabs', () => {
    const markup = render(<ThreeCardPoker />);
    expect(markup).toContain('Three Card Poker');
    expect([...markup.matchAll(/id="tcp-tab-(\w+)"/g)].map((m) => m[1])).toEqual(['play', 'odds', 'sim']);
    expect(markup).toContain('>How to play<');
  });
});
