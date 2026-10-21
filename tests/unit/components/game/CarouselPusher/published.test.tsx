import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { I18nextProvider } from 'react-i18next';
import { OddsTab } from '@/components/game/CarouselPusher/OddsTab';
import { AXIS, CAROUSEL, FIELD, HOLD_MAX, MEDAL_RADIUS, POCKET, POCKETS, RING, SCATTER, SHED, SLIDE_SPEED, STOCK, TIMES, TURN_STEPS, freshMachine } from '@/components/game/CarouselPusher/engine';
import { PRIZES, STOPS, WEIGHTS, WEIGHT_TOTAL } from '@/components/game/CarouselPusher/lottery';
import { PUBLISHED_CAROUSEL, familyOf, familyTops } from '@/components/game/CarouselPusher/published';
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
      SHED,
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
      field: { depth: 28, spread: 36, width: 33.420956288, sideReach: 8.4 },
      axis: { x: 16.710478144, y: 5 },
      CAROUSEL: { radius: 6.5, offset: 2, height: 3.2 },
      RING: 3.2,
      POCKETS: [90, 210, 330],
      POCKET: { mouth: 1.15, roll: 0.8 },
      SCATTER: 2.1,
      SHED: { spread: 30, steps: 20 },
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
      timed: { tally: { fed: 400, back: 378, front: 204, thrownIn: 5, prizes: 169, lost: 133, pockets: 142, direct: 118, wasted: 0, outcomes: [1, 4, 12, 29, 96], jackpots: 1, thrown: 84 }, field: 79, sum: 3032.439659, step: 55_946 },
      steady: { tally: { fed: 400, back: 352, front: 179, thrownIn: 0, prizes: 173, lost: 136, pockets: 85, direct: 68, wasted: 0, outcomes: [0, 6, 6, 23, 50], jackpots: 0, thrown: 0 }, field: 81, sum: 3115.421839, step: 29_298 },
      held: { tally: { fed: 400, back: 235, front: 179, thrownIn: 0, prizes: 56, lost: 134, pockets: 94, direct: 79, wasted: 44, outcomes: [0, 1, 5, 11, 37], jackpots: 0, thrown: 0 }, field: 82, sum: 3157.513766, step: 9_519 },
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

  it('scanned every other moment of dropping, and none of them reaches above best play', () => {
    const { scan, best } = PUBLISHED_CAROUSEL;
    expect(scan.script).toBe('scripts/carousel-pusher-lead-scan.ts');
    expect(scan.machines).toBe(12);
    expect(scan.againSeed).toBeGreaterThanOrEqual(scan.firstSeed + scan.machines);
    // Early or late, -40 to +20 in steps of 3 and every step from -6 to +6; one angle a turn every 12°; DROP held
    // through 60° of the swing at six places and 120° at three; the holes timed by the dish at three fills.
    const leads = [...new Set([...Array.from({ length: 21 }, (_, i) => -40 + 3 * i), ...Array.from({ length: 13 }, (_, i) => i - 6)])].map((l) => `lead ${l}`);
    const angles = Array.from({ length: 30 }, (_, i) => `phase@${12 * i}+1`);
    const swings = [0, 60, 120, 180, 240, 300].map((a) => `phase@${a}+60`).concat([0, 120, 240].map((a) => `phase@${a}+120`));
    const dishes = ['dish@100', 'dish@150', 'dish@250'];
    expect(scan.plays.map((p) => p.play).sort()).toEqual([...leads, ...angles, ...swings, ...dishes].sort());
    expect(familyTops(scan.plays).map((f) => [f.id, f.plays])).toEqual([
      ['leads', 30],
      ['angles', 30],
      ['swings', 9],
      ['dishes', 3],
    ]);
    for (const play of scan.plays) {
      expect(play.medals, play.play).toBeGreaterThanOrEqual(familyOf(play.play) === 'angles' ? 120_000 : 480_000);
      // Its interval reaches no higher than best play's.
      expect(play.return - play.half, play.play).toBeLessThanOrEqual(best.return + best.half);
    }
    // The plays that came out highest, measured again on other machines for many more medals; the best is the highest
    // of them and best play, about 90%, and even the top of its interval leaves room under 100% for the floor jackpot.
    expect(scan.again.length).toBeGreaterThan(0);
    for (const play of scan.again) {
      expect(play.medals, play.play).toBeGreaterThanOrEqual(1_200_000);
      expect(scan.plays.some((p) => p.play === play.play), play.play).toBe(true);
    }
    const highest = [{ play: 'lead 0', medals: ways.timed.medals, return: ways.timed.return, half: ways.timed.half }, ...scan.again].reduce((a, b) => (b.return > a.return ? b : a));
    expect(best).toEqual(highest);
    expect(best.return).toBeGreaterThan(0.89);
    expect(best.return).toBeLessThan(0.92);
    expect(best.return + best.half + EXPECTED_PER_MEDAL).toBeLessThan(0.95);
  });

  it('gives the floor the best there is, rounded up, and links it to the floor jackpot: with it, still under 100%', () => {
    const rule = FLOOR_RULES['carousel-pusher'];
    expect(rule.bestReturn).toBe(Math.ceil(PUBLISHED_CAROUSEL.best.return * 10_000) / 10_000);
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
    // The scan: each family's highest, with its interval.
    expect(en).toContain('data-testid="cp-scan-table"');
    const { best } = PUBLISHED_CAROUSEL;
    expect(en).toContain('data-testid="cp-best-of-all"');
    expect(en).toContain(`${(best.return * 100).toFixed(2)}% ±${(best.half * 100).toFixed(2)}%`);
    for (const family of familyTops(PUBLISHED_CAROUSEL.scan.plays)) expect(en).toContain(`${(family.top.return * 100).toFixed(2)}% ±${(family.top.half * 100).toFixed(2)}%`);
    const ja = render('ja');
    expect(ja).toContain('95%区間');
    expect(ja).toContain(`${(ways.timed.return * 100).toFixed(2)}%`);
  });
});
