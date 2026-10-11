import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { MedalPusher } from '@/components/game/MedalPusher';
import {
  BOARD_ROLLS,
  CALC_DEFAULT,
  JACKPOT_LEVELS,
  OddsTab,
  REACH_ROWS,
  boardSpread,
  breakEvenSpins,
  pocketGroups,
  returnFor,
} from '@/components/game/MedalPusher/OddsTab';
import { AUTO_PACE, PlayTab } from '@/components/game/MedalPusher/PlayTab';
import { IDLE_DIGITS, Screen, bannerText, markStrip, stripOffset } from '@/components/game/MedalPusher/ScreenPanel';
import { DEFAULT_PACE, MEDAL_OPTIONS, SimTab } from '@/components/game/MedalPusher/SimTab';
import { FieldDiagram, Marker, ReturnChart } from '@/components/game/MedalPusher/charts';
import { FIELD, PUSHER } from '@/components/game/MedalPusher/engine';
import { percent, tidyPercent } from '@/components/game/MedalPusher/format';
import { PART_IDS, getStrings } from '@/components/game/MedalPusher/i18n';
import { BOARD, FEVER_SQUARE, JACKPOT_START, ROULETTE, reachChance, reachHitChance, spinValue } from '@/components/game/MedalPusher/lottery';
import {
  REEL_DIGITS,
  SWING,
  inReach,
  landTimes,
  reelPositions,
  reelsFast,
  reelsWaiting,
  roulettePocket,
  rouletteSettled,
  sameScreen,
  screenState,
  settleOffset,
  stopTimes,
  stoppedDigits,
  sugorokuSquare,
  type ScreenState,
} from '@/components/game/MedalPusher/screen';
import { START_CREDITS, TIMING, createSession, reachTime, sugorokuDuration, type ActiveRoulette, type ActiveSpin } from '@/components/game/MedalPusher/session';
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
  /** A losing spin `elapsed` seconds in: with no reach, with one, or with a long one. */
  const spin = (reach: boolean | 'long', elapsed: number, digits: [number, number, number] = [4, 7, 2], plain: number = TIMING.spin): ActiveSpin => {
    const reachKind = reach === 'long' ? 'long' : reach ? 'normal' : 'none';
    const result: ActiveSpin['result'] = { tier: 'miss', digits, reach: reach !== false, reachKind };
    return { result, elapsed, duration: plain + reachTime(result), done: false };
  };

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
    // A long reach holds it back longer still.
    const long = stopTimes(spin('long', 0));
    expect(long[0]).toBeCloseTo(left, 9);
    expect(long[2]).toBeCloseTo(right, 9);
    expect(long[1]).toBeCloseTo(TIMING.spin + TIMING.reach + TIMING.longReach, 9);
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
    // A long reach is a reach for all of its longer time.
    const long = stopTimes(spin('long', 0, [5, 6, 5]));
    expect(inReach(spin('long', long[2] + 0.01, [5, 6, 5]))).toBe(true);
    expect(inReach(spin('long', long[1] - 0.01, [5, 6, 5]))).toBe(true);
    expect(inReach(spin('long', long[1], [5, 6, 5]))).toBe(false);
  });

  const KINDS = [false, true, 'long'] as const;
  /** How far round the strip it is from one position to another, the short way. */
  const apart = (a: number, b: number) => Math.min(Math.abs(a - b), REEL_DIGITS.length - Math.abs(a - b));

  it('swing a little past the digit as they stop, and settle exactly on it', () => {
    expect(SWING.past).toBeGreaterThan(0);
    expect(SWING.past).toBeLessThan(0.25);
    // The swing itself: out and back, furthest a third of the way through, and still from then on.
    const speed = (27 * SWING.past) / (4 * SWING.time);
    expect(settleOffset(0, speed)).toBe(0);
    expect(settleOffset(-1, speed)).toBe(0);
    expect(settleOffset(SWING.time, speed)).toBe(0);
    expect(settleOffset(SWING.time + 1, speed)).toBe(0);
    expect(settleOffset(SWING.time / 3, speed)).toBeCloseTo(SWING.past, 12);
    for (let since = 0.001; since < SWING.time; since += 0.001) {
      expect(settleOffset(since, speed)).toBeGreaterThan(0);
      expect(settleOffset(since, speed)).toBeLessThanOrEqual(SWING.past + 1e-12);
    }
    // It leaves the digit at the speed the reel came with, so there is no jolt.
    expect(settleOffset(1e-6, speed) / 1e-6).toBeCloseTo(speed, 3);
    // A reel lands on its digit one swing before it stops, and at that moment it is on the digit.
    for (const kind of KINDS) {
      const lands = landTimes(spin(kind, 0));
      const stops = stopTimes(spin(kind, 0));
      lands.forEach((land, reel) => expect(stops[reel] - land).toBeCloseTo(SWING.time, 12));
      expect(lands.every((land) => land > 0)).toBe(true);
      lands.forEach((land, reel) => expect(apart(reelPositions(spin(kind, land))[reel], [3, 6, 1][reel])).toBeLessThan(1e-9));
    }

    const count = REEL_DIGITS.length;
    const homes = [8, 0, 3];
    for (const kind of KINDS) {
      for (const plain of [TIMING.spin, TIMING.quickSpin]) {
        // Nine, one and four: the first and the last digit of the strip are the ones a swing could carry off its ends.
        const at = (elapsed: number) => spin(kind, elapsed, [9, 1, 4], plain);
        const stops = stopTimes(at(0));
        const furthest = [0, 0, 0];
        let last = reelPositions(at(0));
        const step = 1 / 480;
        for (let elapsed = step; elapsed <= at(0).duration + 0.05; elapsed += step) {
          const now = reelPositions(at(elapsed));
          now.forEach((position, reel) => {
            // Always inside the strip, and never a jump: no further than the fastest reel goes in one step.
            expect(position).toBeGreaterThanOrEqual(0);
            expect(position).toBeLessThan(count);
            expect(apart(position, last[reel])).toBeLessThanOrEqual(15 * step + 1e-9);
            const past = (position - homes[reel] + count) % count;
            if (elapsed >= stops[reel]) {
              // Stopped: exactly on the digit, not nearly.
              expect(position).toBe(homes[reel]);
            } else if (elapsed > stops[reel] - SWING.time) {
              // Swinging: a little past the digit, never short of it again.
              expect(past).toBeLessThanOrEqual(SWING.past + 1e-9);
              furthest[reel] = Math.max(furthest[reel], past);
            } else if (elapsed > stops[reel] - SWING.time - 0.1) {
              // About to arrive: still short of the digit, not past it.
              expect(past === 0 || past > count / 2).toBe(true);
            }
          });
          last = now;
        }
        // The outer reels come in fast and swing the full way; a centre reel that was held back swings less.
        expect(furthest[0]).toBeCloseTo(SWING.past, 3);
        expect(furthest[2]).toBeCloseTo(SWING.past, 3);
        expect(furthest[1]).toBeGreaterThan(0.02);
        expect(furthest[1]).toBeLessThanOrEqual(SWING.past + 1e-9);
        if (kind !== false) expect(furthest[1]).toBeLessThan(furthest[0]);
        if (kind === 'long') expect(furthest[1]).toBeLessThan(0.06);
      }
    }
  });

  it('run blurred while they are too fast to read', () => {
    for (const kind of KINDS) {
      const at = (elapsed: number) => spin(kind, elapsed, [5, 6, 5]);
      const stops = stopTimes(at(0));
      // Every reel starts out fast, and none is once it has stopped.
      expect(reelsFast(at(0))).toEqual([true, true, true]);
      expect(reelsFast(at(stops[0] - SWING.time / 2))).toEqual([false, true, true]);
      expect(reelsFast(at(stops[0] + 0.01))).toEqual([false, true, true]);
      expect(reelsFast(at(stops[2] - 0.001))).toEqual([false, true, false]);
      expect(reelsFast(at(stops[1] - 0.01))).toEqual([false, false, false]);
      expect(reelsFast(at(stops[1]))).toEqual([false, false, false]);
      expect(reelsFast(at(stops[1] + 5))).toEqual([false, false, false]);
      // A reel is fast for one stretch only: once it has slowed it does not speed up again.
      for (let reel = 0; reel < 3; reel++) {
        let slowed = false;
        for (let elapsed = 0; elapsed <= stops[1]; elapsed += 0.01) {
          const fast = reelsFast(at(elapsed))[reel];
          if (slowed) expect(fast).toBe(false);
          if (!fast) slowed = true;
        }
      }
    }
    // Until the right reel stops, the centre gives nothing away: with a reach to come it runs as it does without.
    const stops = stopTimes(spin(false, 0));
    for (let elapsed = 0; elapsed < stops[2]; elapsed += 0.05) {
      const plain = reelsFast(spin(false, elapsed));
      expect(reelsFast(spin(true, elapsed))).toEqual(plain);
      expect(reelsFast(spin('long', elapsed))).toEqual(plain);
    }
    // Once the reach is on, the centre drops out of the blur at once and can be read.
    expect(reelsFast(spin(true, stops[2] + 0.25, [5, 6, 5]))[1]).toBe(false);
    expect(reelsFast(spin('long', stops[2] + 0.25, [5, 6, 5]))[1]).toBe(false);
  });

  it('crawl to the end of a long reach', () => {
    /** Digits the centre reel goes by in the `seconds` before it stops. */
    const lastDigits = (kind: boolean | 'long', seconds: number) => {
      const stop = stopTimes(spin(kind, 0, [5, 6, 5]))[1];
      let distance = 0;
      let last = reelPositions(spin(kind, stop - seconds, [5, 6, 5]))[1];
      for (let elapsed = stop - seconds + 0.005; elapsed <= stop + 1e-9; elapsed += 0.005) {
        const now = reelPositions(spin(kind, elapsed, [5, 6, 5]))[1];
        distance += apart(now, last);
        last = now;
      }
      return distance;
    };
    // In its last second a reel with no reach goes by ten digits and more, one in a reach about four, and one in a long reach under two.
    expect(lastDigits(false, 1)).toBeGreaterThan(10);
    expect(lastDigits(true, 1)).toBeGreaterThan(3);
    expect(lastDigits(true, 1)).toBeLessThan(6);
    expect(lastDigits('long', 1)).toBeGreaterThan(1);
    expect(lastDigits('long', 1)).toBeLessThan(2);
    // All through what the long reach adds, it is slow enough to read every digit that goes by.
    expect(lastDigits('long', TIMING.longReach)).toBeGreaterThan(2);
    expect(lastDigits('long', TIMING.longReach)).toBeLessThan(4);
  });

  it('wait and then change one at a time when nothing may move', () => {
    const before = [3, 1, 8];
    const at = (elapsed: number) => spin(true, elapsed, [5, 6, 5]);
    const stops = stopTimes(at(0));
    expect(reelsWaiting(at(0))).toEqual([true, true, true]);
    expect(stoppedDigits(at(0), before)).toEqual([3, 1, 8]);
    expect(reelsWaiting(at(stops[0]))).toEqual([false, true, true]);
    expect(stoppedDigits(at(stops[0]), before)).toEqual([5, 1, 8]);
    // With the outer reels alike and the centre still waiting, the reach can be read off the reels.
    expect(reelsWaiting(at(stops[2]))).toEqual([false, true, false]);
    expect(stoppedDigits(at(stops[2]), before)).toEqual([5, 1, 5]);
    expect(stoppedDigits(at(stops[1] - 0.01), before)).toEqual([5, 1, 5]);
    expect(reelsWaiting(at(stops[1]))).toEqual([false, false, false]);
    expect(stoppedDigits(at(stops[1]), before)).toEqual([5, 6, 5]);
    // A spin that has been counted has nothing waiting, whatever its clock says.
    expect(reelsWaiting({ ...at(0), done: true })).toEqual([false, false, false]);
    expect(stoppedDigits({ ...at(0), done: true }, before)).toEqual([5, 6, 5]);
  });

  it('are marked for the stylesheet only when a mark changes', () => {
    const writes: string[] = [];
    const dataset: DOMStringMap = {};
    const strip = {
      dataset: new Proxy(dataset, {
        set: (target, key, value) => {
          writes.push(`${String(key)}=${value}`);
          target[String(key)] = value;
          return true;
        },
      }),
    };
    markStrip(strip, 'fast', true);
    markStrip(strip, 'fast', true);
    markStrip(strip, 'waiting', false);
    markStrip(strip, 'fast', false);
    markStrip(strip, 'fast', false);
    markStrip(strip, 'waiting', true);
    markStrip(strip, 'waiting', true);
    expect(writes).toEqual(['fast=true', 'waiting=false', 'fast=false', 'waiting=true']);
    expect(dataset).toEqual({ fast: 'false', waiting: 'true' });
  });
});

describe('the roulette light', () => {
  const roulette = (pocket: number, elapsed: number, from = 0): ActiveRoulette => ({
    pocket,
    from,
    elapsed,
    duration: TIMING.roulette,
    landed: false,
    level: 0,
    total: 0,
    gain: 0,
    over: false,
    jackpot: false,
  });

  it('starts on the pocket it set off from and ends on the one that was drawn', () => {
    for (let pocket = 0; pocket < ROULETTE.length; pocket++) {
      expect(roulettePocket(roulette(pocket, 0))).toBe(0);
      expect(roulettePocket(roulette(pocket, 0, 5))).toBe(5);
      expect(roulettePocket(roulette(pocket, TIMING.roulette, 5))).toBe(pocket);
      expect(roulettePocket(roulette(pocket, TIMING.roulette + 3, 9))).toBe(pocket);
    }
  });

  it('only ever moves on by one pocket, and more slowly as it goes', () => {
    const changes: number[] = [];
    let last = roulettePocket(roulette(7, 0, 3));
    for (let elapsed = 0; elapsed <= TIMING.roulette; elapsed += 0.001) {
      const now = roulettePocket(roulette(7, elapsed, 3));
      if (now !== last) {
        expect((now - last + ROULETTE.length) % ROULETTE.length).toBe(1);
        changes.push(elapsed);
        last = now;
      }
    }
    // Two laps and then on from pocket 3 to pocket 7.
    expect(changes).toHaveLength(2 * ROULETTE.length + 4);
    const firstGap = changes[1] - changes[0];
    const lastGap = changes[changes.length - 1] - changes[changes.length - 2];
    expect(lastGap).toBeGreaterThan(firstGap * 5);
    expect(rouletteSettled(roulette(7, changes[changes.length - 1] - 0.01, 3))).toBe(false);
    expect(rouletteSettled(roulette(7, TIMING.roulette, 3))).toBe(true);
  });
});

describe('the odds', () => {
  it('groups the roulette by pocket, the cross first', () => {
    expect(pocketGroups()).toEqual([
      { pocket: 'stop', count: 4 },
      { pocket: 50, count: 1 },
      { pocket: 30, count: 1 },
      { pocket: 20, count: 3 },
      { pocket: 10, count: 3 },
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
    for (const text of ['0.7%', '1 in 143', '1.5%', '1 in 67', '4%', '1 in 25', '93.8%']) expect(html).toContain(text);
    for (const text of ['A prize ball on the field', 'A choice of three chests', 'A roll on the sugoroku board']) expect(html).toContain(text);
    // What each line is worth: the board's average, the chests' average, the roulette's.
    for (const text of ['8.8 medals', '20 medals', '65.1 medals']) expect(html).toContain(text);
    // The roulette: four crosses in twelve, and the chance of each number of pockets in a row.
    for (const text of ['A cross: the run ends', 'A tower of 50 medals', '33.3%', '25.0%', '8.3%', 'Medals thrown onto the field']) expect(html).toContain(text);
    for (const text of ['66.7%', '44.4%', '29.6%', '19.8%', '13.2%', '8.8%']) expect(html).toContain(text);
    expect(html).toContain('One ball in 11.4 wins it, and one spin in 1,627 leads to it');
    expect(html).toContain('One tower on the pusher');
    expect(html).toContain('the average of the board: 8.75 medals');
    expect(html).toContain(`after ${BOARD_ROLLS} rolls from the start, no square is more than ${percent(boardSpread(BOARD_ROLLS))} away`);
    expect(html).toContain('1.106 medals');
    expect(html).toContain('1,000 medals');
    const expected = percent(returnFor(CALC_DEFAULT.front / 100, CALC_DEFAULT.spins / 100, spinValue(JACKPOT_START)));
    expect(html).toMatch(new RegExp(`data-testid="pusher-calc-return"[^>]*>${expected.replace('.', '\\.')}<`));
    expect(html.match(/<caption/g)).toHaveLength(7);
    expect(html.match(/type="range"/g)).toHaveLength(3);
    expect(html.match(/data-badge=/g)).toHaveLength(PART_IDS.length);
  });

  it('says how far to trust a reach', () => {
    const html = render(<OddsTab />);
    const table = html.match(/<table[^>]*data-testid="pusher-reach-table"[\s\S]*?<\/table>/)?.[0] ?? '';
    expect(REACH_ROWS).toEqual(['long', 'normal', 'any']);
    expect(table.match(/data-reach="(long|normal|any)"/g)).toEqual(['data-reach="long"', 'data-reach="normal"', 'data-reach="any"']);
    // Each row: how often the reach comes up, and how often it then hits.
    const row = (kind: string) => table.match(new RegExp(`<tr data-reach="${kind}">[\\s\\S]*?</tr>`))?.[0] ?? '';
    for (const kind of REACH_ROWS) {
      expect(row(kind)).toContain(`>${percent(reachChance(kind))}<`);
      expect(row(kind)).toContain(`>${percent(reachHitChance(kind))}<`);
    }
    expect(row('long')).toContain('Super reach (the long one)');
    expect(row('long')).toContain('>5.8%<');
    expect(row('long')).toContain('>63.8%<');
    expect(row('normal')).toContain('>14.4%<');
    expect(row('normal')).toContain('>17.2%<');
    expect(row('any')).toContain('>20.3%<');
    expect(row('any')).toContain('>30.6%<');
    // The note after it puts the two side by side and says where the difference comes from.
    expect(html).toContain('a super reach goes on to hit 63.8% of the time and an ordinary reach 17.2%, so the long one is about 3.7 times as likely to hit');
    expect(html).toContain('played with the long reach 60% of the time');
    expect(html).toContain('lost with a reach only 15% of the time');
    // The reach note that was there before still comes first.
    expect(html.indexOf('About 15% of losing spins')).toBeGreaterThan(-1);
    expect(html.indexOf('About 15% of losing spins')).toBeLessThan(html.indexOf('pusher-reach-table'));

    const ja = render(<OddsTab />, 'ja');
    for (const text of ['ノーマルリーチ', 'スーパーリーチ', 'リーチ全体', '出現率', '信頼度', '約3.7倍']) expect(ja).toContain(text);
    expect(ja).toContain('スーパーリーチが63.8%、ノーマルリーチが17.2%');
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
  const idle: ScreenState = {
    mode: 'slot',
    banner: 'none',
    amount: 0,
    line: null,
    lit: -1,
    square: 0,
    die: 0,
    rolling: false,
    chests: null,
    secondsLeft: 0,
    level: 0,
    total: 0,
  };
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
    // The strips start out neither blurred nor dimmed; the cabinet marks them as they run.
    expect(html.match(/data-fast="false" data-waiting="false"/g)).toHaveLength(3);
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
    expect(bannerText({ ...idle, banner: 'superReach' }, en)).toBe('SUPER REACH!');
    expect(bannerText({ ...idle, banner: 'reach' }, getStrings('ja'))).toBe('リーチ！');
    expect(bannerText({ ...idle, banner: 'superReach' }, getStrings('ja'))).toBe('スーパーリーチ！');
    expect(bannerText({ ...idle, banner: 'medals', amount: 8 }, en)).toBe('+8 MEDALS');
    expect(bannerText({ ...idle, banner: 'towers', amount: 30 }, en)).toBe('TOWER +30');
    expect(bannerText({ ...idle, banner: 'fever', amount: 30 }, en)).toBe('FEVER! +30');
    expect(bannerText({ ...idle, banner: 'jackpot', amount: 312 }, en)).toBe('JACKPOT! +312');
    expect(bannerText({ ...idle, banner: 'finish', amount: 90 }, en)).toBe('FINISH! TOTAL 90');
    expect(bannerText({ ...idle, banner: 'finish', amount: 0 }, en)).toBe('FINISH…');
    expect(bannerText(idle, en)).toBeNull();
    expect(show({ ...idle, banner: 'line', line: 'big' })).toContain('data-line="big"');
  });

  it('badges every digit on the reels with what three of it lead to', () => {
    const html = show(idle);
    // A strip is twelve tiles: a nine, the nine digits, and a one and a two again.
    const tiles = [...html.matchAll(/<span[^>]*data-tier="(seven|big|small)"[^>]*>(\d)<svg[^>]*data-leads="(ball|chest|sugoroku)"[^>]*aria-hidden="true"/g)];
    expect(tiles).toHaveLength(3 * 12);
    for (const [, tier, digit, leads] of tiles) {
      const expected = digit === '7' ? ['seven', 'ball'] : Number(digit) % 2 === 1 ? ['big', 'chest'] : ['small', 'sugoroku'];
      expect([tier, leads]).toEqual(expected);
    }
    expect(html.match(/data-leads="ball"/g)).toHaveLength(3);
    expect(html.match(/data-leads="chest"/g)).toHaveLength(3 * 6);
    expect(html.match(/data-leads="sugoroku"/g)).toHaveLength(3 * 5);
  });

  it('cuts a reach in across the reels, and a long one as a super reach', () => {
    expect(show(idle)).not.toContain('pusher-cut-in');
    expect(show({ ...idle, banner: 'line', line: 'small' })).not.toContain('pusher-cut-in');

    const reach = show({ ...idle, banner: 'reach' });
    expect(reach).toContain('data-banner="reach"');
    expect(reach).toMatch(/data-kind="reach"[^>]*aria-hidden="true"[^>]*data-testid="pusher-cut-in"/);
    // Once across the reels and once in the caption, which is all that is left of it without motion.
    expect(reach.match(/>REACH!</g)).toHaveLength(2);
    expect(reach).not.toContain('SUPER REACH!');
    expect(reach).not.toContain('7·7·7 ▸ BALL');

    const long = show({ ...idle, banner: 'superReach' });
    expect(long).toContain('data-banner="superReach"');
    expect(long).toMatch(/data-kind="superReach"[^>]*data-testid="pusher-cut-in"/);
    expect(long.match(/>SUPER REACH!</g)).toHaveLength(2);
    expect(show({ ...idle, banner: 'superReach' }, 0, 'ja').match(/>スーパーリーチ！</g)).toHaveLength(2);
    expect(show({ ...idle, banner: 'reach' }, 0, 'ja').match(/>リーチ！</g)).toHaveLength(2);
  });

  it('has the cut-in off the reels well before the centre reel decides the reach', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/MedalPusher.module.css'), 'utf8');
    const plain = Number(/animation: mp-cut-in ([\d.]+)s/.exec(css)?.[1]);
    const long = Number(/\.cutIn\[data-kind='superReach'\] \{[^}]*animation-duration: ([\d.]+)s/.exec(css)?.[1]);
    // The stylesheet's own note gives these two figures; the band holds for a little over half of each.
    expect(plain).toBe(0.75);
    expect(long).toBe(1.1);
    const superReach = Number((TIMING.reach + TIMING.longReach).toFixed(2));
    expect(css).toContain(`It takes ${plain} s of a reach's ${TIMING.reach} s; a super reach's takes ${long} s of its ${superReach} s`);
    // Either way it has gone with at least half a second of the reach still to run.
    expect(TIMING.reach - plain).toBeGreaterThanOrEqual(0.5);
    expect(superReach - long).toBeGreaterThanOrEqual(0.5);
  });

  it('shows the die and moves the piece along the board', () => {
    const html = show({ ...idle, mode: 'sugoroku', die: 4, square: 6 });
    expect(html).toContain('SUGOROKU CHANCE');
    expect(html).toContain('data-face="4"');
    // Four pips on the die itself; the reels behind it have circles of their own.
    const die = html.match(/<svg[^>]*data-testid="pusher-die"[\s\S]*?<\/svg>/)?.[0] ?? '';
    expect(die.match(/<circle/g)).toHaveLength(4);
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
    const html = show({ ...idle, mode: 'roulette', lit: 4, level: 2, total: 40 });
    expect(html).toContain('JACKPOT CHANCE');
    expect(html.match(/data-pocket="\d+"/g)).toHaveLength(ROULETTE.length);
    expect(html).toContain('data-pocket="4" data-lit="true"');
    expect(html.match(/data-pocket="\d+" data-lit="true"/g)).toHaveLength(1);
    // Four crosses on the wheel, and beside it how far the run has got.
    expect(html.match(/>×</g)).toHaveLength(4);
    expect(html).toContain('LEVEL 2 / 6');
    expect(html).toContain('TOWER 40');
    expect(html).toContain('data-level="2"');
    expect(html.match(/data-goal="true"/g)).toHaveLength(1);
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
    const result: ActiveSpin['result'] = { tier: 'big', digits: [5, 5, 5], reach: true, reachKind: 'normal' };
    const spin: ActiveSpin = { result, elapsed: 0, duration: TIMING.spin + TIMING.reach, done: false };
    session.spin = spin;
    expect(screenState(session, false).banner).toBe('none');
    spin.elapsed = TIMING.spin + 0.2;
    expect(screenState(session, false).banner).toBe('reach');
    // Without motion the reach is still called: the words are all there is of it.
    expect(screenState(session, true).banner).toBe('reach');
    spin.done = true;
    expect(screenState(session, false)).toMatchObject({ banner: 'line', line: 'big' });
    spin.result = { tier: 'seven', digits: [7, 7, 7], reach: true, reachKind: 'normal' };
    expect(screenState(session, false)).toMatchObject({ banner: 'ball', line: 'seven' });
  });

  it('calls a long reach a super reach for as long as it lasts', () => {
    const session = createSession(1, { balls: 0 });
    const result: ActiveSpin['result'] = { tier: 'miss', digits: [7, 8, 7], reach: true, reachKind: 'long' };
    const spin: ActiveSpin = { result, elapsed: 0, duration: TIMING.spin + reachTime(result), done: false };
    session.spin = spin;
    const [, centre, right] = stopTimes(spin);
    spin.elapsed = right - 0.01;
    expect(screenState(session, false).banner).toBe('none');
    spin.elapsed = right + 0.01;
    expect(screenState(session, false).banner).toBe('superReach');
    expect(screenState(session, true).banner).toBe('superReach');
    // Still on when an ordinary reach would have been over.
    spin.elapsed = TIMING.spin + TIMING.reach + 0.5;
    expect(screenState(session, false).banner).toBe('superReach');
    spin.elapsed = centre - 0.01;
    expect(screenState(session, false).banner).toBe('superReach');
    // It missed: the reels have stopped and there is nothing to announce.
    spin.elapsed = centre;
    spin.done = true;
    expect(screenState(session, false)).toMatchObject({ banner: 'none', line: null });
    // The same reach with three alike behind it ends in the line it was always going to.
    spin.result = { tier: 'seven', digits: [7, 7, 7], reach: true, reachKind: 'long' };
    expect(screenState(session, false)).toMatchObject({ banner: 'ball', line: 'seven' });
    expect(sameScreen({ ...screenState(session, false), banner: 'reach' }, { ...screenState(session, false), banner: 'superReach' })).toBe(false);
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

  it('follows the roulette through a run to its end', () => {
    const session = createSession(1, { balls: 0 });
    const run = { pocket: 3, from: 0, elapsed: 0, duration: TIMING.roulette, landed: false, level: 0, total: 0, gain: 0, over: false, jackpot: false };
    session.roulette = run;
    expect(screenState(session, false)).toMatchObject({ mode: 'roulette', lit: 0, banner: 'none', level: 0, total: 0 });
    expect(screenState(session, true).lit).toBe(-1);
    // A number: the tower goes up and the run goes on.
    Object.assign(run, { landed: true, level: 1, total: 30, gain: 30 });
    expect(screenState(session, false)).toMatchObject({ lit: 3, banner: 'towers', amount: 30, level: 1, total: 30 });
    // A cross: the total the run built.
    Object.assign(run, { pocket: 4, from: 3, landed: true, gain: 0, over: true });
    expect(screenState(session, false)).toMatchObject({ lit: 4, banner: 'finish', amount: 30, level: 1 });
    // A full run: the jackpot.
    Object.assign(run, { pocket: 1, level: 6, total: 400, gain: 300, over: true, jackpot: true });
    expect(screenState(session, false)).toMatchObject({ lit: 1, banner: 'jackpot', amount: 300, level: 6, total: 400 });
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
