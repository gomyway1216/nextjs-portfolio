import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { Keno } from '@/components/game/Keno';
import { analyze } from '@/components/game/Keno/engine';
import { OddsTab } from '@/components/game/Keno/OddsTab';
import { PlayTab } from '@/components/game/Keno/PlayTab';
import { PUBLISHED_KENO_ODDS } from '@/components/game/Keno/published';
import { createI18nInstance } from '@/lib/i18n';

// The page shows Video Keno's exact odds without working them out as it opens: they are written out in published.ts.
// Here they are worked out afresh (engine.ts) and must be the same fractions.

const reckonings = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/game/Keno/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/components/game/Keno/engine')>();
  const counted =
    <A extends unknown[], R>(reckon: (...args: A) => R) =>
    (...args: A): R => {
      reckonings.count += 1;
      return reckon(...args);
    };
  // Every way into the reckoning: the whole machine, a ticket, and one catch's chance.
  return { ...engine, analyze: counted(engine.analyze), oddsOf: counted(engine.oddsOf), catchChance: counted(engine.catchChance) };
});

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the published odds', () => {
  it('are never worked out as the page loads or is drawn: not by the machine, its Odds tab or How to play', () => {
    // Every module of the page has been loaded by now.
    expect(reckonings.count).toBe(0);
    for (const lang of ['en', 'ja'] as const) {
      render(<Keno />, lang);
      render(<PlayTab />, lang);
      render(<OddsTab />, lang);
    }
    expect(reckonings.count).toBe(0);
  });

  it('are exactly what the reckoning gives: every catch of every ticket of 1 to 10 spots, and the best and the least', () => {
    // Printed in full on a failure: what to write into published.ts.
    expect(PUBLISHED_KENO_ODDS).toStrictEqual(analyze());
  });

  it('are what the machine and its Odds tab show', () => {
    // The best ticket, one spot, brings back 9/10 of the medals played.
    expect(render(<PlayTab />)).toContain('90.00%');
    const odds = render(<OddsTab />);
    expect(odds).toContain('data-testid="kn-best">90.00%<');
    expect(odds).toContain('71130/79079');
  });
});
