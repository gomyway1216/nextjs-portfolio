import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { Blackjack } from '@/components/game/Blackjack';
import { gameValue, medalBetEdge, policyValue } from '@/components/game/Blackjack/analysis';
import { MAX_BET, MIN_BET } from '@/components/game/Blackjack/medalTable';
import { OddsTab, RULE_VARIANTS } from '@/components/game/Blackjack/OddsTab';
import { PlayTab } from '@/components/game/Blackjack/PlayTab';
import {
  NEVER_BUSTS,
  PLAYS_LIKE_THE_DEALER,
  PUBLISHED_MEDAL_BET_EDGES,
  PUBLISHED_POLICY_EDGES,
  PUBLISHED_VALUE,
  PUBLISHED_VARIANT_EDGES,
} from '@/components/game/Blackjack/published';
import { SimTab } from '@/components/game/Blackjack/SimTab';
import { createI18nInstance } from '@/lib/i18n';

// The page shows blackjack's exact figures without working them out as it opens: they are written out in
// published.ts. Here they are worked out afresh (analysis.ts) and must be the same figures to the last bit.

const reckonings = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/game/Blackjack/analysis', async (importOriginal) => {
  const analysis = await importOriginal<typeof import('@/components/game/Blackjack/analysis')>();
  const counted =
    <A extends unknown[], R>(reckon: (...args: A) => R) =>
    (...args: A): R => {
      reckonings.count += 1;
      return reckon(...args);
    };
  // Every whole game reckoned over every up card and every two-card start.
  return { ...analysis, gameValue: counted(analysis.gameValue), medalBetEdge: counted(analysis.medalBetEdge), policyValue: counted(analysis.policyValue) };
});

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
const same = (a: number, b: number) => Object.is(a, b);

describe('the published figures', () => {
  it('are never worked out as the page loads or is drawn: not by the table, its Odds tab or its Simulation tab', () => {
    // Every module of the page has been loaded by now.
    expect(reckonings.count).toBe(0);
    for (const lang of ['en', 'ja'] as const) {
      render(<Blackjack />, lang);
      render(<PlayTab />, lang);
      render(<OddsTab />, lang);
      render(<SimTab />, lang);
    }
    expect(reckonings.count).toBe(0);
  });

  it('are exactly what the reckoning gives, to the last bit: the table’s game, every rule compared, and every medal bet', () => {
    // Printed in full on a failure: what to write into published.ts.
    expect(PUBLISHED_VALUE).toStrictEqual(gameValue());
    expect(same(PUBLISHED_VALUE.houseEdge, gameValue().houseEdge)).toBe(true);
    expect(Object.keys(PUBLISHED_VARIANT_EDGES).sort()).toEqual(RULE_VARIANTS.map((v) => v.id).sort());
    for (const variant of RULE_VARIANTS) expect(PUBLISHED_VARIANT_EDGES[variant.id], variant.id).toBe(gameValue(variant.rules).houseEdge);
    const bets = Array.from({ length: MAX_BET - MIN_BET + 1 }, (_, i) => MIN_BET + i);
    expect(Object.keys(PUBLISHED_MEDAL_BET_EDGES).map(Number)).toEqual(bets);
    for (const bet of bets) expect(PUBLISHED_MEDAL_BET_EDGES[bet], `${bet} medals`).toBe(medalBetEdge(bet));
  });

  it('are exactly what the reckoning gives for the two fixed ways of playing', () => {
    expect(PUBLISHED_POLICY_EDGES.mimic).toBe(-policyValue(PLAYS_LIKE_THE_DEALER));
    expect(PUBLISHED_POLICY_EDGES.neverBust).toBe(-policyValue(NEVER_BUSTS));
  });

  it('are what the Odds tab shows', () => {
    const odds = render(<OddsTab />);
    expect(odds).toContain(`${(PUBLISHED_VALUE.houseEdge * 100).toFixed(3)}%`);
    expect(odds).toContain(`${(PUBLISHED_VARIANT_EDGES.sixFive * 100).toFixed(3)}%`);
    expect(odds).toContain(`${(PUBLISHED_MEDAL_BET_EDGES[1] * 100).toFixed(3)}%`);
  });
});
