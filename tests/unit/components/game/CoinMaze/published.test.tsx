import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { CoinMaze } from '@/components/game/CoinMaze';
import { analyze } from '@/components/game/CoinMaze/engine';
import { OddsTab } from '@/components/game/CoinMaze/OddsTab';
import { PlayTab } from '@/components/game/CoinMaze/PlayTab';
import { PUBLISHED_MAZE_ODDS } from '@/components/game/CoinMaze/published';
import { createI18nInstance } from '@/lib/i18n';

// The page shows the maze's exact odds without working them out as it opens: they are written out in published.ts.
// Here they are worked out afresh (engine.ts) and must be the same fractions.

const reckonings = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/game/CoinMaze/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/components/game/CoinMaze/engine')>();
  const counted =
    <A extends unknown[], R>(reckon: (...args: A) => R) =>
    (...args: A): R => {
      reckonings.count += 1;
      return reckon(...args);
    };
  // Every way into the reckoning: the whole maze, a medal's worth from a gate down, and one gate's chance.
  return { ...engine, analyze: counted(engine.analyze), worthFrom: counted(engine.worthFrom), stagePass: counted(engine.stagePass) };
});

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the published odds', () => {
  it('are never worked out as the page loads or is drawn: not by the machine, its Odds tab or How to play', () => {
    // Every module of the page has been loaded by now.
    expect(reckonings.count).toBe(0);
    for (const lang of ['en', 'ja'] as const) {
      render(<CoinMaze />, lang);
      render(<PlayTab />, lang);
      render(<OddsTab />, lang);
    }
    expect(reckonings.count).toBe(0);
  });

  it('are exactly what the reckoning gives: the three hands gate by gate, and leaving the machine to flick blind', () => {
    // Printed in full on a failure: what to write into published.ts.
    expect(PUBLISHED_MAZE_ODDS).toStrictEqual(analyze());
  });

  it('are what the machine and its Odds tab show', () => {
    // Perfect timing brings back 121,275/131,072 of the medals played.
    expect(render(<PlayTab />)).toContain('92.53%');
    const odds = render(<OddsTab />);
    expect(odds).toContain('92.53%');
    expect(odds).toContain('11025/16384');
  });
});
