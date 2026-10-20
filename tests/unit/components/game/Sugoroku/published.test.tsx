import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { Sugoroku } from '@/components/game/Sugoroku';
import { analyzeBoard } from '@/components/game/Sugoroku/engine';
import { OddsTab } from '@/components/game/Sugoroku/OddsTab';
import { PlayTab } from '@/components/game/Sugoroku/PlayTab';
import { PUBLISHED_BOARD_ODDS } from '@/components/game/Sugoroku/published';
import { createI18nInstance } from '@/lib/i18n';

// The page shows the board's exact odds without working them out as it opens: they are written out in published.ts.
// Here they are worked out afresh (engine.ts) and must be the same fractions.

const reckonings = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/game/Sugoroku/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/components/game/Sugoroku/engine')>();
  const counted =
    <A extends unknown[], R>(reckon: (...args: A) => R) =>
    (...args: A): R => {
      reckonings.count += 1;
      return reckon(...args);
    };
  // Every way into the reckoning: the whole board, and every way a roll from one square can go.
  return { ...engine, analyzeBoard: counted(engine.analyzeBoard), outcomesFrom: counted(engine.outcomesFrom) };
});

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the published odds', () => {
  it('are never worked out as the page loads or is drawn: not by the machine, its Odds tab or How to play', () => {
    // Every module of the page has been loaded by now.
    expect(reckonings.count).toBe(0);
    for (const lang of ['en', 'ja'] as const) {
      render(<Sugoroku />, lang);
      render(<PlayTab />, lang);
      render(<OddsTab />, lang);
    }
    expect(reckonings.count).toBe(0);
  });

  it('are exactly what the reckoning gives: every square, the long run, the chances and the best choice of bet', () => {
    // Printed in full on a failure: what to write into published.ts.
    expect(PUBLISHED_BOARD_ODDS).toStrictEqual(analyzeBoard());
  });

  it('are what the machine and its Odds tab show', () => {
    expect(render(<PlayTab />)).toContain('89.74%');
    const odds = render(<OddsTab />);
    expect(odds).toContain('89.74%');
    expect(odds).toContain('67/72');
  });
});
