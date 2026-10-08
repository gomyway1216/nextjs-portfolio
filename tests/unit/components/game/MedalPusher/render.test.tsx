import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { MedalPusher } from '@/components/game/MedalPusher';
import { CALC_DEFAULT, JACKPOT_LEVELS, OddsTab, breakEvenSpins, pocketGroups, returnFor } from '@/components/game/MedalPusher/OddsTab';
import { AUTO_PACE, PlayTab } from '@/components/game/MedalPusher/PlayTab';
import { DEFAULT_PACE, MEDAL_OPTIONS, SimTab } from '@/components/game/MedalPusher/SimTab';
import { FieldDiagram, Marker, ReturnChart } from '@/components/game/MedalPusher/charts';
import { FIELD, PUSHER } from '@/components/game/MedalPusher/engine';
import { percent, tidyPercent } from '@/components/game/MedalPusher/format';
import { PART_IDS, getStrings } from '@/components/game/MedalPusher/i18n';
import { JACKPOT_START, ROULETTE, spinValue } from '@/components/game/MedalPusher/lottery';
import { REEL_DIGITS, inReach, reelPositions, roulettePocket, rouletteSettled, stopTimes } from '@/components/game/MedalPusher/screen';
import { START_CREDITS, TIMING, type ActiveRoulette, type ActiveSpin } from '@/components/game/MedalPusher/session';
import { AIM_COLORS, AIM_IDS, AIM_MARKERS } from '@/components/game/MedalPusher/sim';
import { HEIGHT, VIEW, project, rise, unproject, unprojectPanel } from '@/components/game/MedalPusher/view';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

describe('number formatting', () => {
  it('writes percentages to a fixed number of digits, or tidily', () => {
    expect(percent(0.936)).toBe('93.6%');
    expect(percent(0.9361, 2)).toBe('93.61%');
    expect(percent(1, 0)).toBe('100%');
    expect(tidyPercent(0.04)).toBe('4%');
    expect(tidyPercent(0.006)).toBe('0.6%');
    expect(tidyPercent(0.939)).toBe('93.9%');
  });
});

describe('the camera', () => {
  it('draws the front of the field wider and lower than the back', () => {
    const back = [project(0, 0, 0), project(FIELD.width, 0, 0)];
    const front = [project(0, 0, FIELD.depth), project(FIELD.width, 0, FIELD.depth)];
    expect(front[1].x - front[0].x).toBeGreaterThan(back[1].x - back[0].x);
    expect(front[0].y).toBeGreaterThan(back[0].y);
    expect(front[0].scale).toBeGreaterThan(back[0].scale);
    // The field is centred, and all of it is inside the drawing.
    expect((front[0].x + front[1].x) / 2).toBeCloseTo(VIEW.width / 2, 9);
    for (const point of [...back, ...front, project(0, HEIGHT.wall, 0), project(FIELD.width, HEIGHT.wall, 0)]) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(VIEW.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(VIEW.height);
    }
  });

  it('draws what is higher further up, and a flat medal as an ellipse', () => {
    const low = project(40, 0, 60);
    const high = project(40, 10, 60);
    expect(high.y).toBeLessThan(low.y);
    expect(low.y - high.y).toBeCloseTo(10 * rise(low), 0);
    expect(low.tilt).toBeGreaterThan(0.4);
    expect(low.tilt).toBeLessThan(1);
    // Nearer the player the camera looks more steeply down, so a medal looks rounder.
    expect(project(50, 0, 95).tilt).toBeGreaterThan(project(50, 0, 5).tilt);
  });

  it('turns a pixel back into the point of the field it shows', () => {
    for (const [x, height, depth] of [
      [20, 0, 80],
      [77, HEIGHT.pusher, 12],
      [50, 0, 50],
    ]) {
      const point = project(x, height, depth);
      const back = unproject(point.x, point.y, height);
      expect(back?.x).toBeCloseTo(x, 6);
      expect(back?.depth).toBeCloseTo(depth, 6);
    }
    const onPanel = project(31, 28, 0);
    const panel = unprojectPanel(onPanel.x, onPanel.y);
    expect(panel?.x).toBeCloseTo(31, 6);
    expect(panel?.height).toBeCloseTo(28, 6);
    // A pixel far above the drawing looks over the horizon and meets no table.
    expect(unproject(VIEW.width / 2, -100_000, 0)).toBeNull();
  });
});

describe('the reels', () => {
  const spin = (reach: boolean, elapsed: number, digits: [number, number, number] = [4, 7, 2]): ActiveSpin => ({
    result: { tier: 'miss', digits, reach },
    elapsed,
    duration: TIMING.spin + (reach ? TIMING.reach : 0),
    done: false,
  });

  it('stop left, then right, then centre', () => {
    const [left, centre, right] = stopTimes(spin(false, 0));
    expect(left).toBeLessThan(right);
    expect(right).toBeLessThan(centre);
    expect(centre).toBe(TIMING.spin);
    // A reach holds the centre reel back by the length of the reach and leaves the others alone.
    const reach = stopTimes(spin(true, 0));
    expect(reach[0]).toBeCloseTo(left, 9);
    expect(reach[2]).toBeCloseTo(right, 9);
    expect(reach[1]).toBeCloseTo(TIMING.spin + TIMING.reach, 9);
  });

  it('show the drawn digits once they have stopped, and keep inside the strip before', () => {
    const count = REEL_DIGITS.length;
    expect(reelPositions(spin(false, TIMING.spin))).toEqual([3, 6, 1]);
    expect(reelPositions(spin(false, TIMING.spin + 5))).toEqual([3, 6, 1]);
    for (let elapsed = 0; elapsed < TIMING.spin; elapsed += 0.013) {
      const positions = reelPositions(spin(false, elapsed));
      expect(positions.every((position) => position >= 0 && position < count)).toBe(true);
    }
    // After the left reel stops it stays on its digit while the others run.
    const [stop] = stopTimes(spin(false, 0));
    expect(reelPositions(spin(false, stop + 0.01))[0]).toBe(3);
    expect(reelPositions(spin(false, stop + 0.01))[1]).not.toBe(6);
  });

  it('ease onto the digit without a jump', () => {
    const [stop] = stopTimes(spin(false, 0));
    const before = reelPositions(spin(false, stop - 0.001))[0];
    const wrapped = Math.min(Math.abs(before - 3), REEL_DIGITS.length - Math.abs(before - 3));
    expect(wrapped).toBeLessThan(0.001);
  });

  it('call a reach only between the right reel stopping and the centre', () => {
    const stops = stopTimes(spin(true, 0, [5, 6, 5]));
    expect(inReach(spin(true, stops[2] - 0.01, [5, 6, 5]))).toBe(false);
    expect(inReach(spin(true, stops[2] + 0.01, [5, 6, 5]))).toBe(true);
    expect(inReach(spin(true, stops[1], [5, 6, 5]))).toBe(false);
    expect(inReach(spin(false, TIMING.spin * 0.9))).toBe(false);
  });
});

describe('the roulette light', () => {
  const roulette = (pocket: number, elapsed: number): ActiveRoulette => ({ pocket, elapsed, duration: TIMING.roulette, payout: -1 });

  it('starts on the first pocket and ends on the one that was drawn', () => {
    for (let pocket = 0; pocket < ROULETTE.length; pocket++) {
      expect(roulettePocket(roulette(pocket, 0))).toBe(0);
      expect(roulettePocket(roulette(pocket, TIMING.roulette))).toBe(pocket);
      expect(roulettePocket(roulette(pocket, TIMING.roulette + 3))).toBe(pocket);
    }
  });

  it('only ever moves on by one pocket, and more slowly as it goes', () => {
    const changes: number[] = [];
    let last = roulettePocket(roulette(7, 0));
    for (let elapsed = 0; elapsed <= TIMING.roulette; elapsed += 0.002) {
      const now = roulettePocket(roulette(7, elapsed));
      if (now !== last) {
        expect((now - last + ROULETTE.length) % ROULETTE.length).toBe(1);
        changes.push(elapsed);
        last = now;
      }
    }
    // Three laps and then on to pocket 7.
    expect(changes).toHaveLength(3 * ROULETTE.length + 7);
    const firstGap = changes[1] - changes[0];
    const lastGap = changes[changes.length - 1] - changes[changes.length - 2];
    expect(lastGap).toBeGreaterThan(firstGap * 5);
    expect(rouletteSettled(roulette(7, changes[changes.length - 1] - 0.01))).toBe(false);
    expect(rouletteSettled(roulette(7, TIMING.roulette))).toBe(true);
  });
});

describe('the odds', () => {
  it('groups the roulette by prize, the jackpot first', () => {
    expect(pocketGroups()).toEqual([
      { pocket: 'jackpot', count: 1 },
      { pocket: 100, count: 3 },
      { pocket: 50, count: 4 },
      { pocket: 30, count: 4 },
    ]);
  });

  it('works out the return and what it would take to break even', () => {
    expect(returnFor(0.78, 0, 1.08)).toBeCloseTo(0.78, 12);
    expect(returnFor(0.78, 0.22, 1.08)).toBeCloseTo(0.78 * (1 + 0.22 * 1.08), 12);
    const needed = breakEvenSpins(0.78, 1.08);
    expect(returnFor(0.78, needed, 1.08)).toBeCloseTo(1, 12);
    expect(breakEvenSpins(1, 1.08)).toBeCloseTo(0, 12);
    expect(breakEvenSpins(0.4, 1.08)).toBeGreaterThan(1);
    expect(JACKPOT_LEVELS[0]).toBe(JACKPOT_START);
  });
});

describe('strings', () => {
  it('has every string in both languages', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(typeof ja[key]).toBe(typeof en[key]);
      if (typeof en[key] === 'string') expect((ja[key] as string).length).toBeGreaterThan(0);
    }
    expect(Object.keys(en.partName).sort()).toEqual([...PART_IDS].sort());
    expect(Object.keys(ja.partText).sort()).toEqual([...PART_IDS].sort());
    expect(Object.keys(en.aimName).sort()).toEqual([...AIM_IDS].sort());
    expect(en.infoBody).toHaveLength(ja.infoBody.length);
    expect(en.simNotes('1.08')).toHaveLength(ja.simNotes('1.08').length);
    expect(en.edgeBody).toHaveLength(ja.edgeBody.length);
  });
});

describe('the page', () => {
  it('renders the three tabs with one tab stop', () => {
    const html = render(<MedalPusher />);
    expect(html).toContain('<h1');
    expect(html).toContain('Medal Pusher');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
    expect(html.match(/tabindex="0"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(html.match(/role="tab"[^>]*tabindex="-1"|tabindex="-1"[^>]*role="tab"/g)).toHaveLength(2);
    expect(html).toContain('aria-selected="true"');
    expect(html).toMatch(/id="pusher-panel-odds"[^>]*hidden/);
  });

  it('renders the cabinet as a new machine', () => {
    const html = render(<PlayTab />);
    expect(html).toMatch(new RegExp(`data-testid="pusher-credits"[^>]*>${START_CREDITS}<`));
    expect(html).toMatch(new RegExp(`data-testid="pusher-jackpot"[^>]*>${JACKPOT_START}<`));
    expect(html).toContain('<canvas');
    expect(html).toContain('aria-label="The field. Click or tap where a medal should drop."');
    expect(html).toContain('aria-valuetext="50% across"');
    expect(html).toContain('aria-label="0 of 4 spins held"');
    expect(html).toContain('>DROP<');
    expect(html).toMatch(/aria-pressed="false"[^>]*data-testid="pusher-auto"|data-testid="pusher-auto"[^>]*aria-pressed="false"/);
    expect(html).toContain('aria-live="polite"');
    // Three reels, each a strip of the nine digits and the first again.
    expect(html.match(/data-tier="seven"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('7·7·7 ▸ BALL');
    expect(html).toContain('1·3·5·9 ▸ TOWER 20');
    expect(html).not.toContain('pusher-refill');
    expect(AUTO_PACE).toBe(2);
  });

  it('renders the cabinet in Japanese', () => {
    const html = render(<PlayTab />, 'ja');
    expect(html).toContain('落とす');
    expect(html).toContain('オート');
    expect(html).toContain('タワー20枚');
    expect(html).toContain('左から50%');
  });

  it('lists the exact odds', () => {
    const html = render(<OddsTab />);
    for (const text of ['0.6%', '1 in 167', '1.5%', '1 in 67', '4%', '1 in 25', '93.9%']) expect(html).toContain(text);
    expect(html).toContain('A tower of 20 medals');
    expect(html).toContain('A prize ball on the field');
    for (const text of ['8.3%', '25.0%', '33.3%', '12 towers on the pusher', '4 towers on the pusher', 'Medals thrown onto the field']) expect(html).toContain(text);
    expect(html).toContain('One spin in 2,000');
    expect(html).toContain('76.7 medals');
    expect(html).toContain('1.08 medals');
    expect(html).toContain('1,000 medals');
    const expected = percent(returnFor(CALC_DEFAULT.front / 100, CALC_DEFAULT.spins / 100, spinValue(JACKPOT_START)));
    expect(html).toMatch(new RegExp(`data-testid="pusher-calc-return"[^>]*>${expected.replace('.', '\\.')}<`));
    expect(html.match(/<caption/g)).toHaveLength(3);
    expect(html.match(/type="range"/g)).toHaveLength(3);
    expect(html.match(/data-badge=/g)).toHaveLength(PART_IDS.length);
  });

  it('offers the simulation before any run', () => {
    const html = render(<SimTab />);
    expect(html).toContain('data-testid="pusher-sim-run"');
    expect(html).not.toContain('pusher-sim-result');
    expect(html).not.toContain('pusher-sim-cancel');
    expect(html).toContain('5 medals a second');
    expect(html).toContain('1,000');
    expect(MEDAL_OPTIONS).toEqual([500, 1000, 2000]);
    expect(DEFAULT_PACE).toBe(5);
  });
});

describe('charts', () => {
  it('draws a line and markers for every aim, with break-even dashed', () => {
    const series = AIM_IDS.map((id, index) => ({
      id,
      color: AIM_COLORS[id],
      marker: AIM_MARKERS[id],
      points: Array.from({ length: 40 }, (_, i) => ({ medals: (i + 1) * 25, rate: 0.6 + index * 0.1 + i * 0.002 })),
    }));
    const html = render(<ReturnChart series={series} xLabel="Medals dropped" ariaLabel="chart" formatCount={(n) => String(n)} />);
    expect(html.match(/<polyline/g)).toHaveLength(4);
    for (const id of AIM_IDS) expect(html).toContain(`data-series="${id}"`);
    expect(html).toContain('stroke-dasharray="6 4"');
    expect(html).toContain('>100%<');
    expect(html).toContain('>1000<');
    expect(html).toContain('role="img"');
    // A marker every eighth point and one on the last: five on each line.
    expect(html.match(/<circle/g)).toHaveLength(5);
    expect(html.match(/<rect/g)).toHaveLength(5);
    expect(render(<ReturnChart series={[]} xLabel="x" ariaLabel="chart" formatCount={String} />)).toBe('');
  });

  it('stretches the axis to a run that went far above break-even', () => {
    const series = [{ id: 'centre', color: 'red', marker: 'circle' as const, points: [{ medals: 10, rate: 2.4 }] }];
    const html = render(<ReturnChart series={series} xLabel="x" ariaLabel="chart" formatCount={String} />);
    expect(html).toContain('>200%<');
  });

  it('draws each marker shape', () => {
    expect(render(<svg><Marker shape="circle" x={5} y={5} color="red" /></svg>)).toContain('<circle');
    expect(render(<svg><Marker shape="square" x={5} y={5} color="red" /></svg>)).toContain('<rect');
    expect(render(<svg><Marker shape="triangle" x={5} y={5} color="red" /></svg>)).toContain('<path');
    expect(render(<svg><Marker shape="diamond" x={5} y={5} color="red" /></svg>)).toContain('<path');
  });

  it('labels the six parts of the field', () => {
    const html = render(<FieldDiagram ariaLabel="the field" />);
    expect(html).toContain('aria-label="the field"');
    expect(html.match(/data-badge=/g)).toHaveLength(6);
    expect(PUSHER.max).toBeLessThan(FIELD.sideOpenFrom);
  });
});
