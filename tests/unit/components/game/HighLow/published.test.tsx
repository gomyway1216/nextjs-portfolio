import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { HighLow } from '@/components/game/HighLow';
import { analyzeLadder } from '@/components/game/HighLow/engine';
import { OddsTab } from '@/components/game/HighLow/OddsTab';
import { PlayTab } from '@/components/game/HighLow/PlayTab';
import { PUBLISHED_LADDER } from '@/components/game/HighLow/published';
import { createI18nInstance } from '@/lib/i18n';

// The page shows the ladder's exact odds without working them out as it opens: they are written out in published.ts.
// Here they are worked out afresh (engine.ts) and must be the same fractions.

const reckonings = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/game/HighLow/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/components/game/HighLow/engine')>();
  const counted =
    <A extends unknown[], R>(reckon: (...args: A) => R) =>
    (...args: A): R => {
      reckonings.count += 1;
      return reckon(...args);
    };
  // Every way into the reckoning: the whole ladder, a way of playing's return and its endings.
  return { ...engine, analyzeLadder: counted(engine.analyzeLadder), returnUnder: counted(engine.returnUnder), endingsUnder: counted(engine.endingsUnder) };
});

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the published odds', () => {
  it('are never worked out as the page loads or is drawn: not by the machine, its Odds tab or How to play', () => {
    // Every module of the page has been loaded by now.
    expect(reckonings.count).toBe(0);
    for (const lang of ['en', 'ja'] as const) {
      render(<HighLow />, lang);
      render(<PlayTab />, lang);
      render(<OddsTab />, lang);
    }
    expect(reckonings.count).toBe(0);
  });

  it('are exactly what the reckoning gives: best play, its moves and endings, and every simple way of playing', () => {
    // Printed in full on a failure: what to write into published.ts.
    expect(PUBLISHED_LADDER).toStrictEqual(analyzeLadder());
  });

  it('are what the Odds tab shows', () => {
    const odds = render(<OddsTab />);
    expect(odds).toContain('data-testid="hl-rtp">89.96%<');
    expect(odds).toContain('data-testid="hl-way-best">89.965%<');
  });
});
