import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { I18nextProvider } from 'react-i18next';
import { OddsTab } from '@/components/game/CarouselPusher/OddsTab';
import { AXIS, CAROUSEL, FIELD, HOLD_MAX, MEDAL_RADIUS, POCKET, POCKETS, RING, SCATTER, SLIDE_SPEED, STOCK, TIMES, TURN_STEPS, freshMachine } from '@/components/game/CarouselPusher/engine';
import { PRIZES, STOPS, WEIGHTS, WEIGHT_TOTAL } from '@/components/game/CarouselPusher/lottery';
import { PUBLISHED_CAROUSEL } from '@/components/game/CarouselPusher/published';
import { simulate } from '@/components/game/CarouselPusher/sim';
import { createI18nInstance } from '@/lib/i18n';
import { FLOOR_RULES } from '@/lib/medalFloor/games';
import { EXPECTED_PER_MEDAL, linked } from '@/lib/medalFloor/jackpot';

// What Cherry Blossom Carousel publishes was measured by playing the machine for millions of medals
// (scripts/carousel-pusher-tune.ts). These tests pin the machine it was measured on: every number that sets how it
// plays, and short seeded runs of each way of feeding, which come out exactly as they did when the measurement was
// made. A change to the machine fails here until it is measured again and published.ts is written out afresh.

describe('the machine the figures were measured on', () => {
  it('has every number of its field, carousel, holes, rail, dish and counter as it was', () => {
    expect({
      MEDAL_RADIUS,
      field: { ...FIELD, width: Number(FIELD.width.toFixed(9)) },
      axis: { x: Number(AXIS.x.toFixed(9)), y: AXIS.y },
      CAROUSEL,
      RING,
      POCKETS,
      POCKET,
      SCATTER,
      TIMES,
      SLIDE_SPEED,
      TURN_STEPS,
      STOCK,
      HOLD_MAX,
      WEIGHTS,
      WEIGHT_TOTAL,
      PRIZES,
      STOPS,
    }).toEqual({
      MEDAL_RADIUS: 1,
      field: { depth: 28, spread: 36, width: 33.420956288, sideReach: 4.5 },
      axis: { x: 16.710478144, y: 5 },
      CAROUSEL: { radius: 6.5, offset: 2, height: 3.2 },
      RING: 3.2,
      POCKETS: [90, 210, 330],
      POCKET: { mouth: 1.15, roll: 0.8 },
      SCATTER: 2.1,
      TIMES: { rail: 42, drop: 12, off: 13, pocket: 10, gap: 15, fling: 32, flingEvery: 2, grow: 18 },
      SLIDE_SPEED: 10,
      TURN_STEPS: 360,
      STOCK: { start: 60, every: 8, most: 9_999 },
      HOLD_MAX: 4,
      WEIGHTS: { jackpot: 164, triple: 1_966, sevens: 4_588, seven: 16_384, miss: 42_434 },
      WEIGHT_TOTAL: 65_536,
      PRIZES: { triple: 20, sevens: 5, seven: 1, miss: 0 },
      STOPS: { left: 36, middle: 54, right: 72, reach: 150, after: 14, jackpotAfter: 60 },
    });
  });

  it('plays a short seeded run of each way exactly as it did: the physics, the holes, the counter and the dish unchanged', () => {
    const fresh = freshMachine(12_345);
    expect([fresh.ids.length, fresh.rng, fresh.nextId]).toEqual([57, 800_942_706, 58]);
    expect(fresh.xy.reduce((a, b) => a + b, 0)).toBeCloseTo(2206.074695, 5);
    const runs = {
      timed: { tally: { fed: 400, back: 334, front: 146, thrownIn: 0, prizes: 188, lost: 119, pockets: 131, direct: 114, wasted: 0, outcomes: [0, 5, 10, 38, 78], jackpots: 0, thrown: 0 }, field: 80, sum: 3100.686669, step: 55_964 },
      steady: { tally: { fed: 400, back: 260, front: 170, thrownIn: 0, prizes: 90, lost: 139, pockets: 88, direct: 78, wasted: 0, outcomes: [0, 2, 5, 25, 56], jackpots: 0, thrown: 0 }, field: 80, sum: 3098.034448, step: 28_281 },
      held: { tally: { fed: 400, back: 253, front: 169, thrownIn: 0, prizes: 84, lost: 153, pockets: 82, direct: 73, wasted: 27, outcomes: [0, 3, 2, 14, 37], jackpots: 0, thrown: 0 }, field: 83, sum: 3225.314125, step: 9_884 },
    } as const;
    for (const [strategy, expected] of Object.entries(runs)) {
      const { tally, machine } = simulate({ strategy: strategy as keyof typeof runs, medals: 400, seed: 7, warmup: 50 });
      expect(tally, strategy).toEqual(expected.tally);
      expect(machine.ids.length, strategy).toBe(expected.field);
      expect(machine.step, strategy).toBe(expected.step);
      expect(machine.xy.reduce((a, b) => a + b, 0), strategy).toBeCloseTo(expected.sum, 5);
    }
  }, 20_000);
});

describe('the published figures', () => {
  const { ways, method } = PUBLISHED_CAROUSEL;

  it('were measured over millions of medals each way, best play about 90% and never over 100%, the everyday hand and the held button under it', () => {
    expect(method).toEqual({ machines: 12, batch: 5_000, warmup: 500, script: 'scripts/carousel-pusher-tune.ts' });
    expect(ways.timed.medals).toBeGreaterThanOrEqual(6_000_000);
    expect(ways.steady.medals).toBeGreaterThanOrEqual(4_000_000);
    expect(ways.held.medals).toBeGreaterThanOrEqual(4_000_000);
    for (const way of Object.values(ways)) {
      // Each machine's share in whole batches, its last one short.
      expect(way.batches).toBeGreaterThanOrEqual(Math.floor(way.medals / method.batch));
      expect(way.batches).toBeLessThanOrEqual(Math.floor(way.medals / method.batch) + method.machines);
      // The return is made of what came back: off the front edge, thrown into the tray, and the counter's prizes.
      expect(way.front + way.thrownIn + way.prizes).toBeCloseTo(way.return, 6);
      expect(way.half).toBeGreaterThan(0);
      expect(way.half).toBeLessThan(0.01);
      // The field gives back half to six in ten of what leaves it, as a real machine's does.
      expect(way.fieldShare).toBeGreaterThan(0.5);
      expect(way.fieldShare).toBeLessThan(0.62);
    }
    expect(ways.timed.return).toBeGreaterThan(0.89);
    expect(ways.timed.return + ways.timed.half).toBeLessThan(0.92);
    expect(ways.steady.return + ways.steady.half).toBeLessThan(ways.timed.return - ways.timed.half);
    expect(ways.held.return + ways.held.half).toBeLessThan(ways.steady.return - ways.steady.half);
    // A medal timed to a hole goes in about twice as often as one let go at no moment in particular.
    expect(ways.timed.pockets / ways.steady.pockets).toBeGreaterThan(1.5);
  });

  it('gives the floor its best play, rounded up, and links it to the floor jackpot: with it, still under 100%', () => {
    const rule = FLOOR_RULES['carousel-pusher'];
    expect(rule.bestReturn).toBe(Math.ceil(ways.timed.return * 10_000) / 10_000);
    expect(rule.bestReturn + EXPECTED_PER_MEDAL).toBeLessThanOrEqual(1);
    expect(linked('carousel-pusher')).toBe(true);
  });

  it('shows them on the Odds tab with their intervals, in both languages', () => {
    const render = (lang: 'en' | 'ja') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{<OddsTab />}</I18nextProvider>);
    const en = render('en');
    expect(en).toContain('data-testid="cp-best"');
    expect(en).toContain(`${(ways.timed.return * 100).toFixed(2)}%`);
    expect(en).toContain(`±${(ways.timed.half * 100).toFixed(2)}%`);
    expect(en).toContain(`${(ways.steady.return * 100).toFixed(2)}%`);
    expect(en).toContain(`${(ways.held.return * 100).toFixed(2)}%`);
    expect(en).toContain('6,000,000');
    expect(en).toContain('patents.google.com/patent/US5622366');
    const ja = render('ja');
    expect(ja).toContain('95%区間');
    expect(ja).toContain(`${(ways.timed.return * 100).toFixed(2)}%`);
  });
});
