import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { KellyCriterion } from '@/components/game/KellyCriterion';
import { OddsTab } from '@/components/game/KellyCriterion/OddsTab';
import { DEFAULT_FRACTION, PlayTab, QUICK_FRACTIONS, TIMING, effectiveStake } from '@/components/game/KellyCriterion/PlayTab';
import { SimTab } from '@/components/game/KellyCriterion/SimTab';
import { BankrollChart, ConvergenceChart, GrowthCurve } from '@/components/game/KellyCriterion/charts';
import { SCENARIOS, kellyFraction, zeroGrowthFraction } from '@/components/game/KellyCriterion/engine';
import { formatMultiple, money, percent, signedPercent } from '@/components/game/KellyCriterion/format';
import { getStrings } from '@/components/game/KellyCriterion/i18n';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('number formatting', () => {
  it('writes money and percentages without noise', () => {
    expect(money(25)).toBe('$25.00');
    expect(money(0.1)).toBe('$0.10');
    expect(percent(0.2)).toBe('20%');
    expect(percent(0.0625)).toBe('6.25%');
    expect(percent(0.4512, 1)).toBe('45.1%');
    expect(signedPercent(0.0201355)).toBe('+2.01%');
    expect(signedPercent(-0.00245)).toBe('−0.24%');
    expect(signedPercent(0)).toBe('0.00%');
    expect(signedPercent(-Infinity)).toBe('−∞');
  });

  it('writes a bankroll multiple at any size', () => {
    expect(formatMultiple(0, 'en-US')).toBe('×0');
    expect(formatMultiple(0.48, 'en-US')).toBe('×0.48');
    expect(formatMultiple(7.49, 'en-US')).toBe('×7.49');
    expect(formatMultiple(420.2, 'en-US')).toBe('×420');
    expect(formatMultiple(128_800, 'en-US')).toBe('×129K');
    expect(formatMultiple(128_800, 'ja-JP')).toBe('×12.9万');
    expect(formatMultiple(1 / 295_000, 'en-US')).toBe('×1/295K');
    expect(formatMultiple(5.68e23, 'en-US')).toBe('×10²⁴');
    expect(formatMultiple(3.6e-20, 'en-US')).toBe('×10⁻¹⁹');
    expect(formatMultiple(Infinity, 'en-US')).toBe('×∞');
  });
});

describe('PlayTab', () => {
  it('opens with the experiment’s $25, 300 flips and a stake that is not the answer', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="kelly-bankroll">$25.00<');
    expect(markup).toContain('data-testid="kelly-flips">0 / 300<');
    expect(markup).toContain('$250.00');
    expect(DEFAULT_FRACTION).not.toBe(kellyFraction(SCENARIOS.coin60));
    expect(markup).toContain('data-testid="kelly-stake">10% of your bankroll = $2.50<');
    expect(markup).toContain('Heads comes up 60% of the time and pays even money. How much will you stake?');
    expect(markup).toContain('aria-label="The coin has not been flipped yet"');
    expect(markup).toContain('data-flips=""');
    // The Kelly stake stays hidden until asked for.
    expect(markup).not.toContain('data-testid="kelly-hint"');
    expect(markup).toContain('data-testid="kelly-shadow">$25.00<');
  });

  it('offers the quick stakes, with the current one pressed', () => {
    const markup = render(<PlayTab />);
    expect(QUICK_FRACTIONS).toEqual([0.05, 0.1, 0.2, 0.5, 1]);
    expect(markup).toMatch(/aria-pressed="true"[^>]*data-quick="0.1">10%</);
    expect(markup).toMatch(/aria-pressed="false"[^>]*data-quick="0.2">20%</);
    expect(markup).toMatch(/data-quick="1">All in</);
    expect(markup).toContain('>×10<');
    expect(markup).toContain('>×50<');
  });

  it('describes the chart in words for screen readers', () => {
    expect(render(<PlayTab />)).toContain('After 0 flips you have $25.00. The Kelly stake on the same flips has $25.00.');
  });

  it('is localized', () => {
    const markup = render(<PlayTab />, 'ja');
    expect(markup).toContain('所持金の10% = $2.50');
    expect(markup).toContain('>投げる<');
    expect(markup).toContain('表は60%の確率で出て、配当は1倍です。いくら賭けますか？');
    expect(markup).toContain('>全額<');
  });

  it('stakes whole cents, at least a cent, never more than there is', () => {
    expect(effectiveStake(25, 0.2)).toBe(5);
    expect(effectiveStake(25, 0)).toBe(0);
    expect(effectiveStake(0.03, 0.1)).toBe(0.01);
    expect(effectiveStake(0.01, 0.5)).toBe(0.01);
    expect(effectiveStake(25, 1)).toBe(25);
  });

  it('paces a single flip and a run', () => {
    expect(TIMING.spin).toBeGreaterThan(0);
    expect(TIMING.auto).toBeGreaterThan(0);
    expect(TIMING.auto * 50).toBeLessThan(5000);
  });
});

describe('OddsTab', () => {
  it('works the formula out for the 60% coin', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain('data-testid="kelly-formula">f* = p − q / b = 0.60 − 0.40 / 1 = 20%<');
    expect(markup).toContain('data-testid="kelly-edge">+20.0%<');
    expect(markup).toContain('data-testid="kelly-fraction">20%<');
    expect(markup).toContain('data-testid="kelly-growth">+2.01%<');
    expect(markup).toContain('data-testid="kelly-double">34.4<');
    expect(markup).toContain('data-testid="kelly-zero">38.9%<');
    expect(markup).toContain('1.95 × Kelly');
    expect(markup).not.toContain('data-testid="kelly-no-edge"');
  });

  it('shows where each bet size ends after 300 bets', () => {
    const markup = render(<OddsTab />);
    const row = (id: string) => markup.match(new RegExp(`<tr data-strategy="${id}"[^>]*>(.*?)</tr>`))![1];
    expect(row('kelly')).toContain('data-col="typical">×420<');
    expect(row('kelly')).toContain('data-col="below">4.4%<');
    expect(row('kelly')).toContain('data-col="half">45.1%<');
    expect(row('half')).toContain('data-col="typical">×91.2<');
    expect(row('half')).toContain('data-col="half">10.4%<');
    expect(row('double')).toContain('data-col="typical">×0.48<');
    expect(row('double')).toContain('data-sign="neg">−0.24%<');
    expect(row('allIn')).toContain('data-col="typical">×0<');
    expect(row('allIn')).toContain('>−∞<');
    expect(markup).toMatch(/<tr data-strategy="kelly" data-best="true">/);
    // The average is carried by a few enormous runs.
    expect(markup).toContain('At the Kelly stake the average is ×129K and the typical result ×420');
  });

  it('gives the growth curve a text alternative', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain('<caption>Long-run growth per bet against the fraction of the bankroll staked</caption>');
    expect(markup).toContain('<th scope="row">20% (1 × Kelly)</th><td>+2.01%</td>');
    expect(markup).toContain('<th scope="row">40% (2 × Kelly)</th><td>−0.24%</td>');
  });

  it('reports the 2016 experiment and its own exact count of it', () => {
    const markup = render(<OddsTab />);
    expect(markup).toContain('28% of them went bust.');
    expect(markup).toContain('The average payout was $91, and only 21% reached the $250 cap.');
    expect(markup).toContain('Staking a constant 20% reaches ten times the stake within 300 flips 93.8% of the time; 15% does it 95.2% of the time and 10% does it 94.2%.');
    expect(markup).toContain('href="https://arxiv.org/abs/1701.01427"');
    expect(markup).toContain('rel="noopener noreferrer"');
  });

  it('is localized', () => {
    const markup = render(<OddsTab />, 'ja');
    expect(markup).toContain('いくら賭けるか');
    expect(markup).toContain('ケリーの1.95倍');
    expect(markup).toContain('28%が破産しました。');
    expect(markup).toContain('data-col="typical">×420<');
  });
});

describe('SimTab', () => {
  it('offers the run and shows nothing until it has finished', () => {
    const markup = render(<SimTab />);
    expect(markup).toContain('Five bet sizes on the same flips');
    expect(markup.match(/>Run</g)).toHaveLength(1);
    expect(markup).not.toContain('data-testid="kelly-sim-result"');
    expect(markup).toContain('>10,000<');
    expect(markup).toContain('>300<');
  });

  it('is localized', () => {
    const markup = render(<SimTab />, 'ja');
    expect(markup).toContain('同じ出目に、5通りの賭け方');
    expect(markup).toContain('>実行<');
  });
});

describe('charts', () => {
  it('draws the player and the Kelly stake on the same axes', () => {
    const markup = renderToStaticMarkup(
      <BankrollChart you={[25, 30, 24]} kelly={[25, 30, 24]} start={25} cap={250} maxFlips={300} ariaLabel="Bankroll" youLabel="You" kellyLabel="Kelly" />,
    );
    expect(markup).toContain('role="img" aria-label="Bankroll"');
    expect(markup).toContain('data-line="you"');
    expect(markup).toContain('data-line="kelly"');
    expect(markup).toContain('$250');
  });

  it('marks the Kelly peak and the zero-growth stake on the curve', () => {
    const wager = SCENARIOS.coin60;
    const markup = renderToStaticMarkup(
      <GrowthCurve wager={wager} kelly={kellyFraction(wager)} zero={zeroGrowthFraction(wager)} ariaLabel="Growth" xLabel="Stake" kellyLabel="Kelly" zeroLabel="zero" />,
    );
    expect(markup).toContain('data-curve="growth"');
    expect(markup).toContain('data-marker="kelly"');
    expect(markup).toContain('data-marker="zero"');
    expect(markup).toContain('20.0%');
    expect(markup).toContain('38.9%');
  });

  it('leaves the markers out when there is no edge', () => {
    const wager = { p: 0.5, b: 1 };
    const markup = renderToStaticMarkup(<GrowthCurve wager={wager} kelly={0} zero={null} ariaLabel="Growth" xLabel="Stake" kellyLabel="Kelly" zeroLabel="zero" />);
    expect(markup).toContain('data-curve="growth"');
    expect(markup).not.toContain('data-marker');
  });

  it('draws one line per strategy with its exact growth dashed', () => {
    const series = [
      { id: 'kelly', color: '#22c55e', label: 'Kelly', exact: 0.02, points: [{ sessions: 10, growth: 0.03 }, { sessions: 100, growth: 0.021 }] },
      { id: 'double', color: '#f59e0b', label: 'Double', exact: -0.002, points: [{ sessions: 10, growth: 0.01 }, { sessions: 100, growth: -0.001 }] },
    ];
    const markup = renderToStaticMarkup(<ConvergenceChart series={series} xLabel="Sessions" ariaLabel="Growth" />);
    expect(markup.match(/data-series=/g)).toHaveLength(2);
    expect(markup.match(/stroke-dasharray="6 4"/g)).toHaveLength(2);
    expect(renderToStaticMarkup(<ConvergenceChart series={[]} xLabel="Sessions" ariaLabel="Growth" />)).toBe('');
  });
});

describe('KellyCriterion shell', () => {
  it('keeps every tab panel mounted and hides the inactive ones', () => {
    const markup = render(<KellyCriterion />, 'ja');
    const panels = [...markup.matchAll(/<div role="tabpanel" id="kelly-panel-(\w+)"[^>]*?( hidden="")?>/g)];
    expect(panels.map((m) => m[1])).toEqual(['play', 'formula', 'sim']);
    expect(panels.map((m) => Boolean(m[2]))).toEqual([false, true, true]);
    expect(markup).toContain('ケリー基準');
  });

  it('renders in English with the three tabs and one main heading', () => {
    const markup = render(<KellyCriterion />);
    expect(markup).toContain('Kelly Criterion');
    for (const label of ['Play', 'The formula', 'Simulation']) expect(markup).toContain(`>${label}</button>`);
    expect(markup.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it('says the same thing in both languages about the numbers that matter', () => {
    for (const language of ['en', 'ja'] as const) {
      const t = getStrings(language);
      expect(t.infoBody.join(' ')).toContain('20%');
      expect(t.infoBody.join(' ')).toContain('28%');
      expect(t.experimentFacts).toHaveLength(5);
    }
  });
});
