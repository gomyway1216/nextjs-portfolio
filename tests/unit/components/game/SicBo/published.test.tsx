import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { SicBo } from '@/components/game/SicBo';
import { MOST_BACK_PER_MEDAL, analyze, mostBackPerMedal } from '@/components/game/SicBo/engine';
import { OddsTab } from '@/components/game/SicBo/OddsTab';
import { PlayTab } from '@/components/game/SicBo/PlayTab';
import { PUBLISHED_ODDS } from '@/components/game/SicBo/published';
import { createI18nInstance } from '@/lib/i18n';

// The page shows Sic Bo's exact odds without adding them up as it opens: they are written out in published.ts (and the
// most a roll can pay in engine.ts). Here they are added up afresh over the 216 rolls and must be the same, to the bit.

const reckonings = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/game/SicBo/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/components/game/SicBo/engine')>();
  const counted =
    <A extends unknown[], R>(reckon: (...args: A) => R) =>
    (...args: A): R => {
      reckonings.count += 1;
      return reckon(...args);
    };
  // Every way into the reckoning: the whole layout, one area, and the most a roll can pay.
  return { ...engine, analyze: counted(engine.analyze), areaOdds: counted(engine.areaOdds), mostBackPerMedal: counted(engine.mostBackPerMedal) };
});

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the published odds', () => {
  it('are never added up as the page loads or is drawn: not by the table, its Odds tab or How to play', () => {
    // Every module of the page has been loaded by now (the table and the Odds tab used to add the odds up as they loaded).
    expect(reckonings.count).toBe(0);
    for (const lang of ['en', 'ja'] as const) {
      render(<SicBo />, lang);
      render(<PlayTab />, lang);
      render(<OddsTab />, lang);
    }
    expect(reckonings.count).toBe(0);
  });

  it('are exactly what adding up the 216 rolls gives: every area, the best and the least', () => {
    // Printed in full on a failure: what to write into published.ts.
    expect(PUBLISHED_ODDS).toStrictEqual(analyze());
    for (const [i, area] of analyze().areas.entries()) expect(Object.is(PUBLISHED_ODDS.areas[i].sd, area.sd), area.id).toBe(true);
  });

  it('say the most one medal on every area can bring back on a roll, as every roll adds up', () => {
    expect(MOST_BACK_PER_MEDAL).toBe(mostBackPerMedal());
  });

  it('are what the Odds tab shows', () => {
    const odds = render(<OddsTab />);
    expect(odds).toContain('97.22%');
    expect(odds).toContain('35/36');
  });
});
