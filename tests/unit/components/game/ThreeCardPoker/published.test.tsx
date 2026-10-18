import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { ThreeCardPoker } from '@/components/game/ThreeCardPoker';
import { highCardCurve, ranksOdds, strategyOdds } from '@/components/game/ThreeCardPoker/analysis';
import { PLAY_THRESHOLD, STRATEGY_IDS } from '@/components/game/ThreeCardPoker/engine';
import { OddsTab, THRESHOLD_HANDS } from '@/components/game/ThreeCardPoker/OddsTab';
import { PlayTab } from '@/components/game/ThreeCardPoker/PlayTab';
import { PUBLISHED_CURVE, PUBLISHED_RANKS, PUBLISHED_STRATEGIES, publishedRanks } from '@/components/game/ThreeCardPoker/published';
import { exactEdge } from '@/components/game/ThreeCardPoker/sim';
import { SimTab } from '@/components/game/ThreeCardPoker/SimTab';
import { createI18nInstance } from '@/lib/i18n';

// The page shows the exact odds over every hand against every dealer hand without working them out as it opens: they
// are written out in published.ts. Here they are worked out afresh (analysis.ts) and must be the same figures to the
// last bit.

const reckonings = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/game/ThreeCardPoker/analysis', async (importOriginal) => {
  const analysis = await importOriginal<typeof import('@/components/game/ThreeCardPoker/analysis')>();
  const counted =
    <A extends unknown[], R>(reckon: (...args: A) => R) =>
    (...args: A): R => {
      reckonings.count += 1;
      return reckon(...args);
    };
  // Everything that goes over every hand's value against the dealer.
  return {
    ...analysis,
    orbits: counted(analysis.orbits),
    policyOdds: counted(analysis.policyOdds),
    strategyOdds: counted(analysis.strategyOdds),
    scoreOdds: counted(analysis.scoreOdds),
    ranksOdds: counted(analysis.ranksOdds),
    highCardCurve: counted(analysis.highCardCurve),
  };
});

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the published odds', () => {
  it('are never worked out as the page loads or is drawn: not by the table, its Odds tab or its Simulation tab', () => {
    // Every module of the page has been loaded by now.
    expect(reckonings.count).toBe(0);
    for (const lang of ['en', 'ja'] as const) {
      render(<ThreeCardPoker />, lang);
      render(<PlayTab />, lang);
      render(<OddsTab />, lang);
      render(<SimTab />, lang);
    }
    for (const id of STRATEGY_IDS) exactEdge(id);
    expect(reckonings.count).toBe(0);
  });

  it('are exactly what the reckoning over every hand gives, to the last bit: the three strategies', () => {
    for (const id of STRATEGY_IDS) {
      const reckoned = strategyOdds(id);
      // Printed in full on a failure: what to write into published.ts.
      expect(PUBLISHED_STRATEGIES[id], id).toStrictEqual(reckoned);
      for (const key of ['ev', 'houseEdge', 'playRate', 'averageWager', 'elementOfRisk'] as const) expect(Object.is(PUBLISHED_STRATEGIES[id][key], reckoned[key]), `${id} ${key}`).toBe(true);
    }
  });

  it('are exactly what the reckoning gives: every hand around the cut-off the Odds tab lists, and no other', () => {
    expect(Object.keys(PUBLISHED_RANKS).sort()).toEqual(THRESHOLD_HANDS.map((ranks) => ranks.join('-')).sort());
    for (const ranks of [...THRESHOLD_HANDS, PLAY_THRESHOLD, ['Q', '6', '3'] as const]) {
      const reckoned = ranksOdds(ranks);
      expect(publishedRanks(ranks), ranks.join('-')).toStrictEqual(reckoned);
      expect(Object.is(publishedRanks(ranks).evPlay, reckoned.evPlay)).toBe(true);
    }
    expect(() => publishedRanks(['A', 'A', 'A'])).toThrow(/not written out/);
  });

  it('are exactly what the reckoning gives: the value of playing every high-card hand', () => {
    const reckoned = highCardCurve();
    expect(PUBLISHED_CURVE).toStrictEqual(reckoned);
    expect(PUBLISHED_CURVE.every((point, i) => Object.is(point.evPlay, reckoned[i].evPlay))).toBe(true);
  });

  it('are what the tabs show', () => {
    const pct = (p: number) => `${(p * 100).toFixed(2)}%`;
    expect(render(<OddsTab />)).toContain(pct(PUBLISHED_STRATEGIES.optimal.houseEdge));
    expect(render(<PlayTab />)).toContain(pct(PUBLISHED_STRATEGIES.optimal.playRate));
  });
});
