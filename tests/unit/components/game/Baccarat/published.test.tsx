import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { Baccarat } from '@/components/game/Baccarat';
import { betOdds, exactOdds } from '@/components/game/Baccarat/analysis';
import { DEFAULT_DECKS, fullShoeCounts } from '@/components/game/Baccarat/engine';
import { DECK_OPTIONS, OddsTab } from '@/components/game/Baccarat/OddsTab';
import { PlayTab } from '@/components/game/Baccarat/PlayTab';
import { PUBLISHED_SHOES, publishedShoeOdds, unseenOdds } from '@/components/game/Baccarat/published';
import { theoreticalEdge } from '@/components/game/Baccarat/sim';
import { SimTab } from '@/components/game/Baccarat/SimTab';
import { createI18nInstance } from '@/lib/i18n';

// The page shows the exact odds off the top of a fresh shoe without counting them as it opens: they are written out
// in published.ts. Here they are counted afresh over every ordered six-card draw and must be the same to the draw.

const counts = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/game/Baccarat/analysis', async (importOriginal) => {
  const analysis = await importOriginal<typeof import('@/components/game/Baccarat/analysis')>();
  return {
    ...analysis,
    exactOdds: (rankCounts: readonly number[]) => {
      counts.count += 1;
      return analysis.exactOdds(rankCounts);
    },
    shoeOdds: (decks: number) => {
      counts.count += 1;
      return analysis.shoeOdds(decks);
    },
  };
});

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the published odds', () => {
  it('are never counted as the page loads or is drawn: not by the table, its Odds tab or its Simulation tab', () => {
    // Every module of the page has been loaded by now.
    expect(counts.count).toBe(0);
    for (const lang of ['en', 'ja'] as const) {
      render(<Baccarat />, lang);
      render(<PlayTab />, lang);
      render(<OddsTab />, lang);
      render(<SimTab />, lang);
    }
    theoreticalEdge('banker');
    expect(counts.count).toBe(0);
  });

  it('are exactly what the count over every six-card draw gives, for every shoe the Odds tab offers, and no other', () => {
    expect(Object.keys(PUBLISHED_SHOES).map(Number)).toEqual([...DECK_OPTIONS]);
    for (const decks of DECK_OPTIONS) {
      // Printed in full on a failure: what to write into published.ts.
      expect(PUBLISHED_SHOES[decks], `${decks} decks`).toStrictEqual(exactOdds(fullShoeCounts(decks)));
      expect(Number.isSafeInteger(PUBLISHED_SHOES[decks].total)).toBe(true);
    }
    expect(() => publishedShoeOdds(3)).toThrow(/not written out/);
  });

  it('are the next hand’s odds when nothing has been seen, and a shoe with cards gone is counted as it is dealt', () => {
    const before = counts.count;
    expect(unseenOdds(fullShoeCounts(DEFAULT_DECKS))).toBe(PUBLISHED_SHOES[DEFAULT_DECKS]);
    expect(unseenOdds(fullShoeCounts(1))).toBe(PUBLISHED_SHOES[1]);
    expect(counts.count).toBe(before);
    const dealt = fullShoeCounts(DEFAULT_DECKS);
    dealt[3] -= 1;
    expect(unseenOdds(dealt)).toStrictEqual(exactOdds(dealt));
    // A shoe of a deck count not written out, and one not a whole number of decks, are counted too.
    expect(unseenOdds(fullShoeCounts(3))).toStrictEqual(exactOdds(fullShoeCounts(3)));
    expect(unseenOdds(dealt.map(() => 3))).toStrictEqual(exactOdds(dealt.map(() => 3)));
  });

  it('are what the Odds tab shows', () => {
    const banker = betOdds('banker', PUBLISHED_SHOES[DEFAULT_DECKS]);
    expect(render(<OddsTab />)).toContain(`data-testid="edge-banker">${(-banker.ev * 100).toFixed(3)}%<`);
  });
});
