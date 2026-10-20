import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { Pachinko } from '@/components/game/Pachinko';
import { TYPICAL_QUARTERS, analyze, figures, fraction, less, nonstop, only, perfectAt, ratioOf, valueOf } from '@/components/game/Pachinko/analysis';
import { BEST_LEFT, BEST_RIGHT, FIRST_RIGHT, STRENGTHS } from '@/components/game/Pachinko/engine';
import { OddsTab } from '@/components/game/Pachinko/OddsTab';
import { PlayTab } from '@/components/game/Pachinko/PlayTab';
import { PUBLISHED_PACHINKO_FIGURES, PUBLISHED_PACHINKO_ODDS } from '@/components/game/Pachinko/published';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_RULES } from '@/lib/medalFloor/games';

// The page shows the machine's exact returns without working them out as it opens: they are written out in
// published.ts. Here they are worked out afresh (analysis.ts: the Markov reward process in BigInts) and must be the same
// fractions, to the last digit; and perfect play is checked to be the best of the ways of playing it is said to beat.

const reckonings = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/game/Pachinko/analysis', async (importOriginal) => {
  const analysis = await importOriginal<typeof import('@/components/game/Pachinko/analysis')>();
  const counted =
    <A extends unknown[], R>(reckon: (...args: A) => R) =>
    (...args: A): R => {
      reckonings.count += 1;
      return reckon(...args);
    };
  // Every way into the reckoning.
  return {
    ...analysis,
    analyze: counted(analysis.analyze),
    figures: counted(analysis.figures),
    perfectAt: counted(analysis.perfectAt),
    nonstop: counted(analysis.nonstop),
    helpingRun: counted(analysis.helpingRun),
    stHitChance: counted(analysis.stHitChance),
    jitanHitChance: counted(analysis.jitanHitChance),
    leftHitChance: counted(analysis.leftHitChance),
  };
});

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('the published returns', () => {
  it('are never worked out as the page loads or is drawn: not by the machine, its Odds tab or How to play', () => {
    expect(reckonings.count).toBe(0);
    for (const lang of ['en', 'ja'] as const) {
      render(<Pachinko />, lang);
      render(<PlayTab />, lang);
      render(<OddsTab />, lang);
    }
    expect(reckonings.count).toBe(0);
  });

  it('are exactly what the reckoning gives: each hand’s return, and the figures beside them', () => {
    // Printed in full on a failure: what to write into published.ts.
    expect(PUBLISHED_PACHINKO_ODDS).toStrictEqual(analyze());
    expect(PUBLISHED_PACHINKO_FIGURES).toStrictEqual(figures());
  });

  it('never beat the machine, however the handle is played: perfect play with 止め打ち brings back 93.46%, under 95%', () => {
    const { perfect, typical, blind } = PUBLISHED_PACHINKO_ODDS;
    expect(valueOf(perfect.back)).toBeCloseTo(0.934574, 6);
    expect(valueOf(typical.back)).toBeCloseTo(0.782397, 6);
    expect(ratioOf(blind.back)).toBe('33/128');
    expect(less(perfect.back, fraction(95, 100))).toBe(true);
    expect(less(typical.back, perfect.back)).toBe(true);
    expect(less(blind.back, typical.back)).toBe(true);
    // The floor is told the best return, rounded up to four places: never less than the machine can bring back.
    const rule = FLOOR_RULES.pachinko.bestReturn;
    expect(rule).toBe(Math.ceil(valueOf(perfect.back) * 10_000) / 10_000);
    expect(less(perfect.back, fraction(Math.round(rule * 10_000), 10_000))).toBe(true);
  });

  it('chose the best strength in each mode, and 止め打ち is worth more than any strength without it', () => {
    const best = PUBLISHED_PACHINKO_ODDS.perfect.back;
    // Perfect play at every left strength in normal play, and every right one at the attacker: none brings back more.
    for (let s = 0; s < STRENGTHS; s++) {
      const there = s < FIRST_RIGHT ? perfectAt(s, BEST_RIGHT) : perfectAt(BEST_LEFT, s);
      expect(ratioOf(there), `strength ${s + 1}`).toBe(ratioOf(PUBLISHED_PACHINKO_FIGURES.strengths[s]));
      if (s !== BEST_LEFT && s !== BEST_RIGHT) expect(less(there, best), `strength ${s + 1}`).toBe(true);
    }
    // Firing without stopping, at the best strengths or with the everyday hand's spread, brings back less.
    expect(less(PUBLISHED_PACHINKO_FIGURES.nonstop, best)).toBe(true);
    expect(less(nonstop(TYPICAL_QUARTERS(BEST_LEFT), TYPICAL_QUARTERS(BEST_RIGHT)), PUBLISHED_PACHINKO_FIGURES.nonstop)).toBe(true);
    expect(ratioOf(nonstop(only(BEST_LEFT), only(BEST_RIGHT)))).toBe(ratioOf(PUBLISHED_PACHINKO_FIGURES.nonstop));
  });

  it('are what the machine, its Odds tab and How to play show', () => {
    expect(render(<PlayTab />)).toContain('93.46%');
    const odds = render(<OddsTab />);
    expect(odds).toContain('93.46%');
    expect(odds).toContain('78.24%');
    expect(odds).toContain('25.78%');
    expect(odds).toContain('33/128');
    expect(odds).toContain(ratioOf(PUBLISHED_PACHINKO_ODDS.perfect.back));
  });
});
