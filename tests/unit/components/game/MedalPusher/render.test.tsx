import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { MedalPusher } from '@/components/game/MedalPusher';
import { BOARD_ROLLS, CALC_DEFAULT, JACKPOT_LEVELS, OddsTab, boardSpread, breakEvenSpins, pocketGroups, returnFor } from '@/components/game/MedalPusher/OddsTab';
import { AUTO_PACE, PlayTab } from '@/components/game/MedalPusher/PlayTab';
import { IDLE_DIGITS, Screen, bannerText, stripOffset } from '@/components/game/MedalPusher/ScreenPanel';
import { DEFAULT_PACE, MEDAL_OPTIONS, SimTab } from '@/components/game/MedalPusher/SimTab';
import { FieldDiagram, Marker, ReturnChart } from '@/components/game/MedalPusher/charts';
import { FIELD, PUSHER } from '@/components/game/MedalPusher/engine';
import { percent, tidyPercent } from '@/components/game/MedalPusher/format';
import { PART_IDS, getStrings } from '@/components/game/MedalPusher/i18n';
import { BOARD, FEVER_SQUARE, JACKPOT_START, ROULETTE, spinValue } from '@/components/game/MedalPusher/lottery';
import {
  REEL_DIGITS,
  inReach,
  reelPositions,
  roulettePocket,
  rouletteSettled,
  sameScreen,
  screenState,
  stopTimes,
  sugorokuSquare,
  type ScreenState,
} from '@/components/game/MedalPusher/screen';
import { START_CREDITS, TIMING, createSession, sugorokuDuration, type ActiveRoulette, type ActiveSpin } from '@/components/game/MedalPusher/session';
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
    expect(html).toContain('1·3·5·9 ▸ TREASURE');
    expect(html).toContain('2·4·6·8 ▸ SUGOROKU');
    expect(html).toContain('GOLDEN FEVER');
    expect(html).toContain('NUMBER SLOT');
    // The sugoroku board is always on, the piece on its first square.
    expect(html.match(/data-here="(true|false)"/g)).toHaveLength(BOARD.length);
    expect(html.match(/data-here="true"/g)).toHaveLength(1);
    expect(html).toContain('data-square="0"');
    expect(html).not.toContain('pusher-refill');
    expect(AUTO_PACE).toBe(2);
  });

  it('renders the cabinet in Japanese', () => {
    const html = render(<PlayTab />, 'ja');
    expect(html).toContain('落とす');
    expect(html).toContain('オート');
    expect(html).toContain('1·3·5·9 ▸ 宝箱');
    expect(html).toContain('2·4·6·8 ▸ すごろく');
    expect(html).toContain('ナンバースロット');
    expect(html).toContain('左から50%');
  });

  it('lists the exact odds', () => {
    const html = render(<OddsTab />);
    for (const text of ['0.6%', '1 in 167', '1.5%', '1 in 67', '4%', '1 in 25', '93.9%']) expect(html).toContain(text);
    for (const text of ['A prize ball on the field', 'A choice of three chests', 'A roll on the sugoroku board']) expect(html).toContain(text);
    // What each line is worth: the board's average, the chests' average, the roulette's.
    for (const text of ['8.8 medals', '20 medals', '76.7 medals']) expect(html).toContain(text);
    for (const text of ['8.3%', '25.0%', '33.3%', '12 towers on the pusher', '4 towers on the pusher', 'Medals thrown onto the field']) expect(html).toContain(text);
    expect(html).toContain('One tower on the pusher');
    expect(html).toContain('the average of the board: 8.75 medals');
    expect(html).toContain(`after ${BOARD_ROLLS} rolls from the start, no square is more than ${percent(boardSpread(BOARD_ROLLS))} away`);
    expect(html).toContain('One spin in 2,000');
    expect(html).toContain('1.11 medals');
    expect(html).toContain('1,000 medals');
    const expected = percent(returnFor(CALC_DEFAULT.front / 100, CALC_DEFAULT.spins / 100, spinValue(JACKPOT_START)));
    expect(html).toMatch(new RegExp(`data-testid="pusher-calc-return"[^>]*>${expected.replace('.', '\\.')}<`));
    expect(html.match(/<caption/g)).toHaveLength(5);
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

describe('the screen', () => {
  const idle: ScreenState = { mode: 'slot', banner: 'none', amount: 0, line: null, lit: -1, square: 0, die: 0, rolling: false, chests: null, secondsLeft: 0 };
  const en = getStrings('en');
  const show = (state: ScreenState, stock = 0, lang: 'en' | 'ja' = 'en') =>
    render(<Screen state={state} stock={stock} strings={getStrings(lang)} registerStrip={() => {}} onPick={() => {}} />, lang);

  it('puts each digit on the pay line of its window', () => {
    // A strip of twelve cells, the window showing three tenths of the cell above.
    expect(stripOffset(0)).toBe(`translateY(${(-0.7 * 100) / 12}%)`);
    expect(stripOffset(8)).toBe(`translateY(${(-8.7 * 100) / 12}%)`);
    expect(IDLE_DIGITS).toHaveLength(3);
  });

  it('shows the slot with its reels, the held spins and the legend', () => {
    const html = show(idle, 3);
    expect(html).toContain('data-mode="slot"');
    expect(html).toContain('aria-label="3 of 4 spins held"');
    expect(html.match(/data-lit="true"/g)).toHaveLength(3);
    expect(html).toContain('data-hidden="false"');
    expect(html).toContain('7·7·7 ▸ BALL');
    expect(html).not.toContain('pusher-die');
    expect(html).not.toContain('pusher-wheel');
    expect(html).toContain('aria-label="Sugoroku board: the piece is on square 1 of 12, which pays 10 medals"');
  });

  it('names what a winning line leads to', () => {
    expect(bannerText({ ...idle, banner: 'line', line: 'small' }, en)).toBe('SUGOROKU CHANCE');
    expect(bannerText({ ...idle, banner: 'line', line: 'big' }, en)).toBe('TREASURE CHANCE');
    expect(bannerText({ ...idle, banner: 'ball', line: 'seven' }, en)).toBe('BALL GET!');
    expect(bannerText({ ...idle, banner: 'reach' }, en)).toBe('REACH!');
    expect(bannerText({ ...idle, banner: 'medals', amount: 8 }, en)).toBe('+8 MEDALS');
    expect(bannerText({ ...idle, banner: 'towers', amount: 30 }, en)).toBe('TOWER +30');
    expect(bannerText({ ...idle, banner: 'fever', amount: 30 }, en)).toBe('FEVER! +30');
    expect(bannerText({ ...idle, banner: 'jackpot', amount: 312 }, en)).toBe('JACKPOT! +312');
    expect(bannerText(idle, en)).toBeNull();
    expect(show({ ...idle, banner: 'line', line: 'big' })).toContain('data-line="big"');
  });

  it('shows the die and moves the piece along the board', () => {
    const html = show({ ...idle, mode: 'sugoroku', die: 4, square: 6 });
    expect(html).toContain('SUGOROKU CHANCE');
    expect(html).toContain('data-face="4"');
    expect(html.match(/<circle/g)).toHaveLength(4);
    expect(html).toContain('MOVE 4');
    expect(html).toContain('data-square="6"');
    expect(html).toContain('data-hidden="true"');
    expect(show({ ...idle, mode: 'sugoroku', die: 2, rolling: true })).not.toContain('MOVE 2');
    expect(show({ ...idle, mode: 'sugoroku' })).toContain('Rolling…');
    expect(show({ ...idle, mode: 'sugoroku', die: 3 }, 0, 'ja')).toContain('3マス進む');
  });

  it('offers three chests to pick from, then shows what each held', () => {
    const closed = { state: 'closed' as const, prize: null, chosen: false };
    const choosing = show({ ...idle, mode: 'chest', chests: [closed, closed, closed], secondsLeft: 6 });
    expect(choosing).toContain('TREASURE CHANCE');
    expect(choosing.match(/data-testid="pusher-chest-\d"/g)).toHaveLength(3);
    expect(choosing).not.toContain('disabled=""');
    expect(choosing).toContain('aria-label="Chest 2"');
    expect(choosing).toContain('PICK ONE!  6');

    const picked = show({ ...idle, mode: 'chest', chests: [closed, { state: 'picked', prize: null, chosen: true }, closed] });
    expect(picked.match(/disabled=""/g)).toHaveLength(3);
    expect(picked).not.toContain('pusher-countdown');

    const open = show({
      ...idle,
      mode: 'chest',
      banner: 'towers',
      amount: 30,
      chests: [
        { state: 'open', prize: 10, chosen: false },
        { state: 'open', prize: 30, chosen: true },
        { state: 'open', prize: 20, chosen: false },
      ],
    });
    expect(open).toContain('aria-label="Chest 2 held 30 medals"');
    expect(open).toContain('TOWER +30');
    expect(open).toContain('data-chosen="true"');
  });

  it('lights one sector of the roulette wheel', () => {
    const html = show({ ...idle, mode: 'roulette', lit: 4 });
    expect(html).toContain('JACKPOT CHANCE');
    expect(html.match(/data-pocket="\d+"/g)).toHaveLength(ROULETTE.length);
    expect(html).toContain('data-pocket="4" data-lit="true"');
    expect(html.match(/data-pocket="\d+" data-lit="true"/g)).toHaveLength(1);
    expect(html).toContain('>JP<');
  });

  it('marks the fever square', () => {
    const html = show(idle);
    expect(html.match(/data-fever="true"/g)).toHaveLength(1);
    expect(html).toContain('FEVER');
    expect(BOARD[FEVER_SQUARE]).toBe(30);
  });
});

describe('what the screen shows for a session', () => {
  it('is the slot, with the piece where it stands, when nothing is on', () => {
    const session = createSession(1, { balls: 0 });
    session.square = 5;
    expect(screenState(session, false)).toMatchObject({ mode: 'slot', banner: 'none', square: 5, die: 0, chests: null, lit: -1 });
  });

  it('follows a spin from a reach to the line it stops on', () => {
    const session = createSession(1, { balls: 0 });
    session.spin = { result: { tier: 'big', digits: [5, 5, 5], reach: true }, elapsed: 0, duration: TIMING.spin + TIMING.reach, done: false };
    expect(screenState(session, false).banner).toBe('none');
    session.spin.elapsed = TIMING.spin + 0.2;
    expect(screenState(session, false).banner).toBe('reach');
    expect(screenState(session, true).banner).toBe('none');
    session.spin.done = true;
    expect(screenState(session, false)).toMatchObject({ banner: 'line', line: 'big' });
    session.spin.result = { tier: 'seven', digits: [7, 7, 7], reach: true };
    expect(screenState(session, false)).toMatchObject({ banner: 'ball', line: 'seven' });
  });

  it('tumbles the die, then hops the piece a square at a time', () => {
    const session = createSession(1, { balls: 0 });
    session.square = 10;
    const bonus = { kind: 'sugoroku' as const, roll: 3, from: 10, elapsed: 0.1, duration: sugorokuDuration(3), payout: -1 };
    session.bonus = bonus;
    const tumbling = screenState(session, false);
    expect(tumbling).toMatchObject({ mode: 'sugoroku', rolling: true, square: 10 });
    expect(tumbling.die).toBeGreaterThanOrEqual(1);
    expect(tumbling.die).toBeLessThanOrEqual(6);
    // Without motion there is no tumbling die, only what was rolled.
    expect(screenState(session, true)).toMatchObject({ rolling: false, die: 0, square: 10 });
    bonus.elapsed = TIMING.dice - 0.05;
    expect(screenState(session, false)).toMatchObject({ rolling: false, die: 3, square: 10 });
    // One hop takes one hop's time: the piece is on the next square once that has passed.
    expect(sugorokuSquare({ ...bonus, elapsed: TIMING.dice + TIMING.hop * 0.5 })).toBe(10);
    expect(sugorokuSquare({ ...bonus, elapsed: TIMING.dice + TIMING.hop * 1.5 })).toBe(11);
    expect(sugorokuSquare({ ...bonus, elapsed: TIMING.dice + TIMING.hop * 2.5 })).toBe(0);
    expect(sugorokuSquare({ ...bonus, elapsed: TIMING.dice + TIMING.hop * 9 })).toBe(1);
    bonus.payout = BOARD[1];
    session.square = 1;
    expect(screenState(session, false)).toMatchObject({ banner: 'medals', amount: BOARD[1], square: 1, die: 3 });
    session.bonus = { ...bonus, from: FEVER_SQUARE - 3, payout: 30 };
    expect(screenState(session, false)).toMatchObject({ banner: 'fever', amount: 30, square: FEVER_SQUARE });
  });

  it('counts the chest choice down and reveals every chest once one is open', () => {
    const session = createSession(1, { balls: 0 });
    const bonus = { kind: 'chest' as const, prizes: [20, 10, 30], fallback: 0, picked: -1, elapsed: 2.3, pickedAt: -1, told: false, payout: -1 };
    session.bonus = bonus;
    const choosing = screenState(session, false);
    expect(choosing).toMatchObject({ mode: 'chest', secondsLeft: 6, banner: 'none' });
    expect(choosing.chests?.map((chest) => chest.state)).toEqual(['closed', 'closed', 'closed']);
    expect(choosing.chests?.every((chest) => chest.prize === null)).toBe(true);
    bonus.picked = 2;
    bonus.pickedAt = 2.3;
    const picked = screenState(session, false);
    expect(picked.chests?.map((chest) => chest.state)).toEqual(['closed', 'closed', 'picked']);
    expect(picked.secondsLeft).toBe(0);
    bonus.payout = 30;
    const open = screenState(session, false);
    expect(open).toMatchObject({ banner: 'towers', amount: 30 });
    expect(open.chests?.map((chest) => chest.prize)).toEqual([20, 10, 30]);
    expect(open.chests?.map((chest) => chest.chosen)).toEqual([false, false, true]);
    session.bonus = { ...bonus, picked: 1, payout: 10 };
    expect(screenState(session, false)).toMatchObject({ banner: 'medals', amount: 10 });
  });

  it('follows the roulette to its prize', () => {
    const session = createSession(1, { balls: 0 });
    session.roulette = { pocket: 4, elapsed: 0, duration: TIMING.roulette, payout: -1 };
    expect(screenState(session, false)).toMatchObject({ mode: 'roulette', lit: 0, banner: 'none' });
    expect(screenState(session, true).lit).toBe(-1);
    session.roulette.payout = 100;
    expect(screenState(session, false)).toMatchObject({ lit: 4, banner: 'towers', amount: 100 });
    session.roulette = { pocket: 1, elapsed: 6, duration: TIMING.roulette, payout: 30 };
    expect(screenState(session, false)).toMatchObject({ lit: 1, banner: 'medals', amount: 30 });
    session.roulette = { pocket: 0, elapsed: 6, duration: TIMING.roulette, payout: 300 };
    expect(screenState(session, false)).toMatchObject({ lit: 0, banner: 'jackpot', amount: 300 });
  });

  it('knows when nothing on the screen has changed', () => {
    const session = createSession(1, { balls: 0 });
    const a = screenState(session, false);
    expect(sameScreen(a, screenState(session, false))).toBe(true);
    expect(sameScreen(a, { ...a, square: 1 })).toBe(false);
    expect(sameScreen(a, { ...a, die: 2 })).toBe(false);
    const chests = [{ state: 'closed' as const, prize: null, chosen: false }];
    expect(sameScreen({ ...a, chests }, { ...a, chests: [{ ...chests[0] }] })).toBe(true);
    expect(sameScreen({ ...a, chests }, { ...a, chests: [{ ...chests[0], state: 'picked' }] })).toBe(false);
    expect(sameScreen({ ...a, chests }, a)).toBe(false);
  });
});
