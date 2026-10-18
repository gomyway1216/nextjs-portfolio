import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { BallBingo } from '@/components/game/BallBingo';
import { framesBetween } from '@/components/game/BallBingo/Board';
import { analyzeMachine } from '@/components/game/BallBingo/engine';
import { PUBLISHED_ODDS } from '@/components/game/BallBingo/odds';
import { OddsTab } from '@/components/game/BallBingo/OddsTab';
import { PlayTab } from '@/components/game/BallBingo/PlayTab';
import { createI18nInstance } from '@/lib/i18n';

// The page shows the exact odds without working them out as it opens: they are written out in odds.ts. Here they are
// worked out afresh (the dynamic programming of engine.ts) and must be the same figures to the last bit.

const reckonings = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/game/BallBingo/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/components/game/BallBingo/engine')>();
  return {
    ...engine,
    analyzeMachine: () => {
      reckonings.count += 1;
      return engine.analyzeMachine();
    },
  };
});

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the published odds', () => {
  it('are never worked out as the page loads or is drawn: not by the machine, its Odds tab or its panel', () => {
    // Every module of the page has been loaded by now.
    expect(reckonings.count).toBe(0);
    for (const lang of ['en', 'ja'] as const) {
      render(<BallBingo />, lang);
      render(<PlayTab />, lang);
      render(<OddsTab />, lang);
    }
    expect(reckonings.count).toBe(0);
  });

  it('are exactly what the reckoning over every state of a game gives, to the last bit', () => {
    const reckoned = analyzeMachine();
    expect(reckonings.count).toBe(1);
    // Printed in full on a failure: what to write into odds.ts.
    expect(PUBLISHED_ODDS).toStrictEqual(reckoned);
    for (const row of PUBLISHED_ODDS.lines) expect(Object.is(row.chance, reckoned.lines[row.lines].chance)).toBe(true);
    expect(Object.is(PUBLISHED_ODDS.rtp, reckoned.rtp)).toBe(true);
  });

  it('are what the Odds tab and the panel show', () => {
    const odds = render(<OddsTab />);
    expect(odds).toContain(`${(PUBLISHED_ODDS.rtp * 100).toFixed(3)}%`);
    expect(odds).toContain('89.974%');
    expect(odds).toContain('12,747');
    expect(render(<PlayTab />)).toContain('89.974%');
  });
});

describe('the quick mode', () => {
  it('goes through a flight’s frames at its own pace, or twice as fast, and never backwards', () => {
    expect(framesBetween(0, 1000, 1)).toBe(60);
    expect(framesBetween(0, 1000, 2)).toBe(120);
    expect(framesBetween(500, 750, 2)).toBe(30);
    expect(framesBetween(750, 500, 2)).toBe(0);
  });

  it('is a switch on the machine, off on the server, said in both languages', () => {
    const en = render(<PlayTab />);
    expect(en).toMatch(/<button[^>]*data-testid="bingo-speed"[^>]*aria-pressed="false"/);
    expect(en).toContain('aria-label="2× speed: the balls fly twice as fast"');
    expect(en).toContain('data-speed="1"');
    expect(render(<PlayTab />, 'ja')).toContain('2× 高速：ボールが2倍の速さで飛びます');
  });
});
