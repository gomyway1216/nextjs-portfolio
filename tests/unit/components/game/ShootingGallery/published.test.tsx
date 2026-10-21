import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { ShootingGallery } from '@/components/game/ShootingGallery';
import { PLAYERS, analyze, analyzePlayer, forwardReturn, fraction, less, ratioOf, valueOf, type Fraction } from '@/components/game/ShootingGallery/engine';
import { OddsTab } from '@/components/game/ShootingGallery/OddsTab';
import { PlayTab } from '@/components/game/ShootingGallery/PlayTab';
import { PUBLISHED_SHOOTING_GALLERY_ODDS } from '@/components/game/ShootingGallery/published';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_RULES } from '@/lib/medalFloor/games';

// The page shows the shooting gallery's exact odds without working them out as it opens: they are written out in
// published.ts. Here they are worked out afresh (engine.ts: dynamic programming over every state the shelf can be in
// and every count of corks left, in BigInts) and must be the same fractions, to the last digit. Each return is then
// checked by a second road: what the shelves a play ends on pay, carried forward from the shelf as it is set up by the
// same choices, must be exactly the return the backward programme gives.

const reckonings = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/game/ShootingGallery/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/components/game/ShootingGallery/engine')>();
  const counted =
    <A extends unknown[], R>(reckon: (...args: A) => R) =>
    (...args: A): R => {
      reckonings.count += 1;
      return reckon(...args);
    };
  // Every way into the reckoning: the three hands together, one hand, the second road, and the floating-point programme
  // a check by play and the best shot use.
  return {
    ...engine,
    analyze: counted(engine.analyze),
    analyzePlayer: counted(engine.analyzePlayer),
    forwardReturn: counted(engine.forwardReturn),
    solve: counted(engine.solve),
    bestShot: counted(engine.bestShot),
    checkPlays: counted(engine.checkPlays),
  };
});

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
const add = (a: Fraction, b: Fraction) => fraction(a.num * b.den + b.num * a.den, a.den * b.den);

describe('the published odds', () => {
  it('are never worked out as the page loads or is drawn: not by the machine, its Odds tab or How to play', () => {
    // Every module of the page has been loaded by now.
    expect(reckonings.count).toBe(0);
    for (const lang of ['en', 'ja'] as const) {
      render(<ShootingGallery />, lang);
      render(<PlayTab />, lang);
      render(<OddsTab />, lang);
    }
    expect(reckonings.count).toBe(0);
  });

  it('are exactly what the reckoning gives: each hand’s return, its chance of each count of figures off the shelf, and of the cat', () => {
    // Printed in full on a failure: what to write into published.ts.
    expect(PUBLISHED_SHOOTING_GALLERY_ODDS).toStrictEqual(analyze());
  });

  it('come to the same return by a second road, and their chances of each ending add up to one', () => {
    for (const player of PLAYERS) {
      const { back, fell, grand } = PUBLISHED_SHOOTING_GALLERY_ODDS[player];
      expect(ratioOf(forwardReturn(player)), player).toBe(ratioOf(back));
      expect(ratioOf(fell.reduce(add, fraction(0))), player).toBe('1/1');
      expect(less(grand, fraction(1, 5)), player).toBe(true);
    }
  });

  it('chose the best to the last digit: every figure and band compared exactly on every shelf gives the same returns', { timeout: 15_000 }, () => {
    for (const player of ['perfect', 'typical'] as const) expect(ratioOf(analyzePlayer(player, { exhaustive: true }).back), player).toBe(ratioOf(PUBLISHED_SHOOTING_GALLERY_ODDS[player].back));
  });

  it('never beat the machine, however well the sight is timed: perfect play brings back 91.95%, never more than 93%', () => {
    const { perfect, typical, blind } = PUBLISHED_SHOOTING_GALLERY_ODDS;
    expect(ratioOf(perfect.back)).toBe('123418233/134217728');
    expect(valueOf(perfect.back)).toBeCloseTo(0.919537, 6);
    expect(valueOf(typical.back)).toBeCloseTo(0.652266, 6);
    expect(valueOf(blind.back)).toBeCloseTo(0.311050, 6);
    expect(less(perfect.back, fraction(93, 100))).toBe(true);
    expect(less(fraction(90, 100), perfect.back)).toBe(true);
    expect(less(typical.back, perfect.back)).toBe(true);
    expect(less(blind.back, typical.back)).toBe(true);
    // Perfect play goes for the cat: about one play in twelve knocks it off; the everyday hand never tries it.
    expect(valueOf(perfect.grand)).toBeCloseTo(0.083413, 5);
    expect(ratioOf(typical.grand)).toBe('0/1');
    // The floor is told the best return, rounded up to four places: never less than the machine can bring back.
    const rule = FLOOR_RULES['shooting-gallery'].bestReturn;
    expect(rule).toBe(Math.ceil(valueOf(perfect.back) * 10_000) / 10_000);
    expect(less(perfect.back, fraction(Math.round(rule * 10_000), 10_000))).toBe(true);
  });

  it('are what the machine, its Odds tab and How to play show', () => {
    expect(render(<PlayTab />)).toContain('91.95%');
    const odds = render(<OddsTab />);
    expect(odds).toContain('91.95%');
    expect(odds).toContain('65.23%');
    expect(odds).toContain('31.11%');
    expect(odds).toContain('123418233/134217728');
    expect(render(<OddsTab />, 'ja')).toContain('91.95%');
  });
});
