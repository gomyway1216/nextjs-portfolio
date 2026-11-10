import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { DISCS, JACKPOT, LAMPS, LEVELS, POCKETS, add, drawFor, fraction, ratioOf, runOf, times, type Draw, type Fraction, type Run } from '@/components/game/BallTower/engine';
import { getStrings } from '@/components/game/BallTower/i18n';
import { PlayTab } from '@/components/game/BallTower/PlayTab';
import { PUBLISHED_BALL_TOWER_ODDS } from '@/components/game/BallTower/published';
import { percentDigits, percentOf, routeOf } from '@/components/game/BallTower/route';
import { RunRoute } from '@/components/game/BallTower/RunRoute';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') => renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);
const plain = (text: string) => text.replace(/​/g, '');

/** Every draw that plays out differently: each pocket of each disc the ball reaches, and each lamp of a "?" pocket's roulette, with how likely it is. */
function everyRun(): { run: Run; chance: Fraction }[] {
  const out: { run: Run; chance: Fraction }[] = [];
  const walk = (level: number, draw: Draw, chance: Fraction) => {
    for (let pocket = 0; pocket < POCKETS[level]; pocket++) {
      const each = times(chance, fraction(1, POCKETS[level]));
      const kind = DISCS[level][pocket].kind;
      const pockets = [...draw.pockets];
      pockets[level] = pocket;
      if (kind === 'up') walk(level + 1, { pockets, lamps: draw.lamps }, each);
      else if (kind === 'mystery')
        for (let lamp = 0; lamp < LAMPS[level]; lamp++) {
          const lamps = [...draw.lamps];
          lamps[level] = lamp;
          out.push({ run: runOf({ pockets, lamps }), chance: times(each, fraction(1, LAMPS[level])) });
        }
      else out.push({ run: runOf({ pockets, lamps: draw.lamps }), chance: each });
    }
  };
  walk(0, { pockets: new Array<number>(LEVELS).fill(0), lamps: new Array<number>(LEVELS).fill(0) }, fraction(1));
  return out;
}
const signature = (run: Run) => run.stops.map((stop) => `${stop.kind}:${stop.pays}`).join('>');

describe('the way a ball came down', () => {
  it('reads each step off the tower: the pockets of its kind out of the disc’s, and a "?" pocket’s lamps', () => {
    const out = routeOf(runOf(drawFor(['out'])));
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0]).toMatchObject({ level: 0, kind: 'out', pays: 0, pockets: 12, of: 18, lamps: null });
    expect(ratioOf(out.chance)).toBe('2/3');

    const pay = routeOf(runOf(drawFor(['up', 'pay'], 2)));
    expect(pay.steps.map((s) => [s.kind, s.pockets, s.of])).toEqual([
      ['up', 6, 18],
      ['pay', 2, 15],
    ]);
    expect(ratioOf(pay.chance)).toBe('2/45');

    const lamp = routeOf(runOf(drawFor(['up', 'mystery'], 5)));
    expect(lamp.steps[1]).toMatchObject({ kind: 'mystery', pays: 5, pockets: 3, of: 15, lamps: { count: 2, of: 10 } });
    expect(ratioOf(lamp.steps[1].chance)).toBe('1/25');
    expect(ratioOf(lamp.chance)).toBe('1/75');

    const jackpot = routeOf(runOf(drawFor(['up', 'up', 'up', 'up', 'jackpot'])));
    expect(jackpot.steps).toHaveLength(LEVELS);
    expect(jackpot.steps[4]).toMatchObject({ kind: 'jackpot', pays: JACKPOT, pockets: 1, of: 6 });
    expect(jackpot.chance).toEqual(PUBLISHED_BALL_TOWER_ODDS.jackpot);
  });

  it('gives every way down the chance the draw gives it: over every draw they add up to one, and bring back the published return', () => {
    const drawn = new Map<string, Fraction>();
    const said = new Map<string, { chance: Fraction; pays: number }>();
    for (const { run, chance } of everyRun()) {
      const key = signature(run);
      drawn.set(key, add(drawn.get(key) ?? fraction(0), chance));
      said.set(key, { chance: routeOf(run).chance, pays: run.pays });
    }
    expect(said.size).toBeGreaterThan(30);
    let all = fraction(0);
    let back = fraction(0);
    for (const [key, { chance, pays }] of said) {
      expect(chance, key).toEqual(drawn.get(key));
      all = add(all, chance);
      back = add(back, times(chance, fraction(pays)));
    }
    expect(all).toEqual(fraction(1));
    expect(back).toEqual(PUBLISHED_BALL_TOWER_ODDS.back);
  });

  it('never writes a chance as nothing: the rarest way down keeps a figure that counts', () => {
    expect(percentDigits(2 / 3)).toBe(1);
    expect(percentDigits(1 / 15)).toBe(2);
    expect(percentDigits(0)).toBe(1);
    expect(percentOf(fraction(2, 3), 'en-US')).toBe('66.7%');
    expect(percentOf(fraction(1, 3240), 'en-US')).toBe('0.031%');
    expect(percentOf(fraction(1, 3240), 'ja-JP')).toBe('0.031%');
    for (const { run } of everyRun()) {
      const text = percentOf(routeOf(run).chance, 'en-US');
      expect(Number(text.replace('%', '')), `${signature(run)} ${text}`).toBeGreaterThan(0);
    }
  });
});

describe('the panel that shows it', () => {
  const lampRun = runOf(drawFor(['up', 'mystery'], 5));
  const row = (markup: string, level: number) => markup.match(new RegExp(`<tr data-testid="bt-route-${level}"[\\s\\S]*?</tr>`))?.[0] ?? '';

  it('has a row for every disc, the pocket and its chance on those the ball reached, and the chance of the whole way', () => {
    const markup = render(<RunRoute entry={{ run: lampRun, bet: 3 }} running={false} />);
    expect(markup).toContain('data-testid="bt-route" data-shown="true"');
    expect(markup.match(/<tr data-testid="bt-route-\d"/g)).toHaveLength(LEVELS);
    expect(row(markup, 0)).toContain('data-kind="up" data-reached="true"');
    expect(row(markup, 0)).toMatch(/>UP<\/td><td[^>]*>6\/18<\/td>/);
    expect(row(markup, 1)).toMatch(/>\? → ×5<\/td><td[^>]*>3\/15 × 2\/10<\/td>/);
    for (let level = 2; level < LEVELS; level++) {
      expect(row(markup, level)).toContain('data-reached="false"');
      expect(row(markup, level)).toContain('Not reached');
    }
    expect(markup).toContain('×5 on disc 2: 15 medals');
    expect(markup).toContain('Bet: 3 medals');
    expect(markup).toMatch(/data-testid="bt-route-chance">[^<]*1\.33% of the time \(1\/75\)/);
  });

  it('says the same in Japanese, the jackpot’s chance to the digit', () => {
    const jackpot = runOf(drawFor(['up', 'up', 'up', 'up', 'jackpot']));
    const markup = plain(render(<RunRoute entry={{ run: jackpot, bet: 10 }} running={false} />, 'ja'));
    expect(row(markup, 2)).toMatch(/>CHANCE<\/td><td[^>]*>1\/6<\/td>/);
    expect(row(markup, 4)).toMatch(/>JP ×300<\/td><td[^>]*>1\/6<\/td>/);
    expect(markup).toContain('ベット：10枚');
    expect(markup).toContain('0.031%（1/3,240）');
    expect(markup).not.toContain('届かず');
    expect(plain(render(<RunRoute entry={{ run: lampRun, bet: 1 }} running={false} />, 'ja'))).toContain('届かず');
  });

  it('keeps every row and its lines while there is no run to show, and says a ball is in play', () => {
    const empty = render(<RunRoute entry={null} running={false} />);
    expect(empty).toContain('data-shown="false"');
    expect(empty.match(/<tr data-testid="bt-route-\d"/g)).toHaveLength(LEVELS);
    expect(empty).toContain(getStrings('en').routeEmpty);
    expect(empty).toMatch(/data-testid="bt-route-chance"><\/p>/);
    expect(render(<RunRoute entry={null} running />)).toContain(getStrings('en').routeWaiting);
    expect(plain(render(<RunRoute entry={null} running />, 'ja'))).toContain(plain(getStrings('ja').routeWaiting));
  });

  it('stands on the machine between the last runs and the visit’s figures, and the last runs’ buttons are a finger tall', () => {
    const markup = render(<PlayTab />);
    expect(markup).toContain('data-testid="bt-route" data-shown="false"');
    expect(markup.indexOf('id="bt-history-title"')).toBeLessThan(markup.indexOf('id="bt-route-title"'));
    expect(markup.indexOf('id="bt-route-title"')).toBeLessThan(markup.indexOf('id="bt-session-title"'));
    const css = readFileSync(path.join(process.cwd(), 'src/components/game/BallTower/BallTower.module.css'), 'utf8');
    const chip = /\n\.historyChip \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(chip).toContain('min-height: 44px');
    expect(chip).toContain('min-width: 44px');
  });
});
