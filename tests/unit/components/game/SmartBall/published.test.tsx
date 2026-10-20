import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { SmartBall } from '@/components/game/SmartBall';
import { PAYS, PLAYERS, STAKE, analyze, analyzePlayer, fraction, less, ratioOf, valueOf, type Fraction } from '@/components/game/SmartBall/engine';
import { OddsTab } from '@/components/game/SmartBall/OddsTab';
import { PlayTab } from '@/components/game/SmartBall/PlayTab';
import { PUBLISHED_SMART_BALL_ODDS } from '@/components/game/SmartBall/published';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_RULES } from '@/lib/medalFloor/games';

// The page shows the smart ball's exact odds without working them out as it opens: they are written out in
// published.ts. Here they are worked out afresh (engine.ts: dynamic programming over every set of lit holes and marbles
// left, in BigInts) and must be the same fractions, to the last digit. Each is then checked by a second road: the chance
// of every number of lines, carried forward from an empty board by the same choices, must pay back exactly the return.

const reckonings = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/game/SmartBall/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/components/game/SmartBall/engine')>();
  const counted =
    <A extends unknown[], R>(reckon: (...args: A) => R) =>
    (...args: A): R => {
      reckonings.count += 1;
      return reckon(...args);
    };
  // Every way into the reckoning: the three hands together, one hand, and the floating-point programme a check by play
  // and the best shot use.
  return { ...engine, analyze: counted(engine.analyze), analyzePlayer: counted(engine.analyzePlayer), solve: counted(engine.solve), bestShot: counted(engine.bestShot), checkPlays: counted(engine.checkPlays) };
});

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
const add = (a: Fraction, b: Fraction) => fraction(a.num * b.den + b.num * a.den, a.den * b.den);

describe('the published odds', () => {
  it('are never worked out as the page loads or is drawn: not by the machine, its Odds tab or How to play', () => {
    // Every module of the page has been loaded by now.
    expect(reckonings.count).toBe(0);
    for (const lang of ['en', 'ja'] as const) {
      render(<SmartBall />, lang);
      render(<PlayTab />, lang);
      render(<OddsTab />, lang);
    }
    expect(reckonings.count).toBe(0);
  });

  it('are exactly what the reckoning gives: each hand’s return, and its chance of no line to three', () => {
    // Printed in full on a failure: what to write into published.ts.
    expect(PUBLISHED_SMART_BALL_ODDS).toStrictEqual(analyze());
  });

  it('pay back what each hand’s lines pay: the chances add up to one, and paid out a play at a time they are the return', () => {
    for (const player of PLAYERS) {
      const { back, lines } = PUBLISHED_SMART_BALL_ODDS[player];
      expect(ratioOf(lines.reduce(add, fraction(0))), player).toBe('1/1');
      const paid = lines.reduce((sum, chance, n) => add(sum, fraction(chance.num * BigInt(PAYS[n]), chance.den)), fraction(0));
      expect(ratioOf(fraction(paid.num, paid.den * BigInt(STAKE))), player).toBe(ratioOf(back));
    }
  });

  it('chose the best to the last digit: every strength compared exactly at every board gives the same returns', { timeout: 15_000 }, () => {
    for (const player of ['perfect', 'typical'] as const) expect(ratioOf(analyzePlayer(player, { exhaustive: true }).back), player).toBe(ratioOf(PUBLISHED_SMART_BALL_ODDS[player].back));
  });

  it('never beat the machine, however well the plunger is pulled: perfect play brings back 93.46%, at most about 95%', () => {
    const { perfect, typical, blind } = PUBLISHED_SMART_BALL_ODDS;
    expect(valueOf(perfect.back)).toBeCloseTo(0.934555, 6);
    expect(valueOf(typical.back)).toBeCloseTo(0.778012, 6);
    expect(valueOf(blind.back)).toBeCloseTo(0.326228, 6);
    expect(less(perfect.back, fraction(95, 100))).toBe(true);
    expect(less(typical.back, perfect.back)).toBe(true);
    expect(less(blind.back, typical.back)).toBe(true);
    // The floor is told the best return, rounded up to four places: never less than the machine can bring back.
    const rule = FLOOR_RULES['smart-ball'].bestReturn;
    expect(rule).toBe(Math.ceil(valueOf(perfect.back) * 10_000) / 10_000);
    expect(less(perfect.back, fraction(Math.round(rule * 10_000), 10_000))).toBe(true);
  });

  it('are what the machine, its Odds tab and How to play show', () => {
    expect(render(<PlayTab />)).toContain('93.46%');
    const odds = render(<OddsTab />);
    expect(odds).toContain('93.46%');
    expect(odds).toContain('77.80%');
    expect(odds).toContain('32.62%');
    expect(odds).toContain('19416340307406796973/20776019874734407680');
  });
});
