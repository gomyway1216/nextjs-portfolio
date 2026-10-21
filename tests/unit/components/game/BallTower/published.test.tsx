import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { BallTower } from '@/components/game/BallTower';
import { BETS, LEVELS, add, analyze, bestBack, fraction, less, ratioOf, valueOf, worthFrom, type Fraction } from '@/components/game/BallTower/engine';
import { OddsTab } from '@/components/game/BallTower/OddsTab';
import { PlayTab } from '@/components/game/BallTower/PlayTab';
import { PUBLISHED_BALL_TOWER_ODDS } from '@/components/game/BallTower/published';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_RULES } from '@/lib/medalFloor/games';
import { EXPECTED_PER_MEDAL, linked } from '@/lib/medalFloor/jackpot';

// The page shows the tower's exact odds without working them out as it opens: they are written out in published.ts.
// Here they are worked out afresh (engine.ts: the five discs' Markov chain, in BigInts) and must be the same fractions,
// to the last digit. The return is then checked by a second road: backward from the bottom disc, what a ball is worth on
// each disc, which must be exactly what the chances of every ending give forward.

const reckonings = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/game/BallTower/engine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('@/components/game/BallTower/engine')>();
  const counted =
    <A extends unknown[], R>(reckon: (...args: A) => R) =>
    (...args: A): R => {
      reckonings.count += 1;
      return reckon(...args);
    };
  return { ...engine, analyze: counted(engine.analyze), worthFrom: counted(engine.worthFrom), checkRuns: counted(engine.checkRuns) };
});

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
const total = (list: readonly Fraction[]) => list.reduce(add, fraction(0));

describe('the published odds', () => {
  it('are never worked out as the page loads or is drawn: not by the machine, its Odds tab or How to play', () => {
    expect(reckonings.count).toBe(0);
    for (const lang of ['en', 'ja'] as const) {
      render(<BallTower />, lang);
      render(<PlayTab />, lang);
      render(<OddsTab />, lang);
    }
    expect(reckonings.count).toBe(0);
  });

  it('are exactly what the reckoning gives: the return on every bet, each disc’s reach, every ending, every multiple', () => {
    // Printed in full on a failure: what to write into published.ts.
    expect(PUBLISHED_BALL_TOWER_ODDS).toStrictEqual(analyze());
  });

  it('come to the same return by a second road, backward from the bottom disc, and their chances of every ending add up to one', () => {
    const odds = PUBLISHED_BALL_TOWER_ODDS;
    expect(ratioOf(worthFrom(0))).toBe(ratioOf(odds.back));
    const ends = odds.ends.flatMap((end) => [end.pay, end.mystery, end.jackpot, end.out]);
    // Every ball ends somewhere: in a pocket of some disc, as many as reached it less as many as went on.
    expect(ratioOf(total(ends))).toBe('1/1');
    expect(ratioOf(add(total(odds.pays.map((p) => p.chance)), total(odds.ends.map((end) => end.out))))).toBe('1/1');
    expect(ratioOf(add(odds.hit, total(odds.ends.map((end) => end.out))))).toBe('1/1');
    expect(ratioOf(total(odds.backByLevel))).toBe(ratioOf(odds.back));
    expect(odds.reach).toHaveLength(LEVELS);
  });

  it('bring back exactly 9/10 on every bet, so the best choice is any bet: the floor is told 90%, and links the tower to its jackpot', () => {
    const odds = PUBLISHED_BALL_TOWER_ODDS;
    expect(odds.byBet).toHaveLength(BETS.length);
    for (const back of odds.byBet) expect(ratioOf(back)).toBe('9/10');
    expect(ratioOf(bestBack(odds))).toBe('9/10');
    expect(less(bestBack(odds), fraction(1))).toBe(true);
    const rule = FLOOR_RULES['ball-tower'].bestReturn;
    expect(rule).toBe(Math.ceil(valueOf(bestBack(odds)) * 10_000) / 10_000);
    expect(rule).toBe(0.9);
    // With the floor jackpot's share added, the best play still brings back no more than it takes.
    expect(rule + EXPECTED_PER_MEDAL).toBeLessThanOrEqual(1);
    expect(linked('ball-tower')).toBe(true);
  });

  it('are what the machine, its Odds tab and How to play show', () => {
    expect(render(<PlayTab />)).toContain('90.00%');
    const odds = render(<OddsTab />);
    expect(odds).toContain('90.00%');
    expect(odds).toContain('22.22%');
    expect(odds).toContain('0.0309%');
    expect(odds).toContain('1 ball in 3,240');
    expect(odds).toContain('As a fraction: 9/10.');
    expect(render(<OddsTab />, 'ja')).toContain('90.00%');
    // Every bet's row says the same return.
    expect(odds.match(/<tr data-bet="\d+">/g)).toHaveLength(BETS.length);
  });
});
