import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { MedalPusher } from '@/components/game/MedalPusher';
import {
  BOARD_ROLLS,
  CALC_DEFAULT,
  JACKPOT_LEVELS,
  OddsTab,
  REACH_ROWS,
  boardSpread,
  bowlSplit,
  breakEvenSpins,
  holeGroups,
  pocketGroups,
  returnFor,
} from '@/components/game/MedalPusher/OddsTab';
import { AIM_CAPS, AIM_KEY, AIM_KEYS, AIM_RANGE, AUTO_PACE, FEED_KEYS, HOLD_DELAY, KEY_CAPS, PlayTab, aimPercent, lightBowlPrize, percentAim, typingIn } from '@/components/game/MedalPusher/PlayTab';
import { ReelSymbol } from '@/components/game/MedalPusher/ReelSymbols';
import {
  GOLD_FLASH_STYLE,
  IDLE_DIGITS,
  Screen,
  ballTransform,
  bannerText,
  dieShade,
  dieTurn,
  markStrip,
  placeBall,
  shadowTransform,
  squarePlace,
  stripOffset,
} from '@/components/game/MedalPusher/ScreenPanel';
import { DEFAULT_PACE, MEDAL_OPTIONS, SimTab } from '@/components/game/MedalPusher/SimTab';
import { GOLD_FLASH, PARTY_TIME, ageStage, celebrate, createStage, goldFlash, type Stage } from '@/components/game/MedalPusher/render';
import { CATCHER } from '@/components/game/MedalPusher/catcher';
import { FieldDiagram, Marker, ReturnChart } from '@/components/game/MedalPusher/charts';
import { AIM, ARM_REACH, ARM_SPEED, CHECKERS, FALL_TIME, FEED, FIELD, LANDING, MEDAL_RADIUS, PUSHER, ROLL_TIME, armStart, tipOf } from '@/components/game/MedalPusher/engine';
import { percent, tidyPercent } from '@/components/game/MedalPusher/format';
import { PART_IDS, getStrings } from '@/components/game/MedalPusher/i18n';
import {
  BOARD,
  BOARD_VALUE,
  BOWLS,
  CHANCE,
  CHANCE_BONUS,
  CHEST_VALUE,
  FEVER_SQUARE,
  JACKPOT_START,
  JEWEL,
  JEWEL_SET,
  JEWEL_SPIN_VALUE,
  JEWEL_VALUE,
  ROULETTE,
  chanceSpinValue,
  chanceTierValue,
  pouredOf,
  reachChance,
  reachHitChance,
  spinValue,
  tierChance,
  tierValue,
} from '@/components/game/MedalPusher/lottery';
import {
  BALL_FALL,
  BOWL_SHAPE,
  REEL_DIGITS,
  SWING,
  ballRollsAt,
  ballSpot,
  ballTipsAt,
  bowlBall,
  countedUp,
  holeSpot,
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
import {
  BOWL_TIMES,
  MAX_STOCK,
  START_CREDITS,
  START_JEWELS,
  TIMING,
  advance,
  bowlShowTime,
  createSession,
  reachTime,
  sugorokuDuration,
  type ActiveBowl,
  type ActiveRoulette,
  type ActiveSpin,
  type Session,
  type SessionEvent,
} from '@/components/game/MedalPusher/session';
import { AIM_COLORS, AIM_IDS, AIM_MARKERS } from '@/components/game/MedalPusher/sim';
import { HEIGHT, HOUSING, SCREEN, VIEW, onScreen, project, rise, screenPlacement, unproject, unprojectPanel } from '@/components/game/MedalPusher/view';
import { createI18nInstance } from '@/lib/i18n';

const render = (node: React.ReactNode, lang: 'en' | 'ja' = 'en') =>
  renderToStaticMarkup(<I18nextProvider i18n={createI18nInstance(lang)}>{node}</I18nextProvider>);

/** The game's stylesheet, for what the screen leaves to it. */
const stylesheet = () => readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/MedalPusher.module.css'), 'utf8');

/** The markup of the table with this test id, from its opening tag to its end. */
const table = (html: string, id: string): string => html.split(`data-testid="${id}"`)[1]?.split('</table>')[0] ?? '';

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
    for (const point of [...back, ...front, project(SCREEN.left, SCREEN.top, 0), project(SCREEN.right, SCREEN.top, 0)]) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(VIEW.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(VIEW.height);
    }
  });

  it('stands the page\u2019s screen where the opening in the wall is: a browser\u2019s camera, given these numbers, is this camera', () => {
    const sheet = screenPlacement();
    // The sheet is the screen, so many of its pixels to a field unit, and is made that much smaller before it is stood up.
    expect(sheet.width).toBe((SCREEN.right - SCREEN.left) * SCREEN.perUnit);
    expect(sheet.height).toBe((SCREEN.top - SCREEN.foot) * SCREEN.perUnit);
    expect(sheet.scale).toBe(1 / SCREEN.perUnit);
    // Tipped back: the foot of the wall is further from the eye than its top, as it is for a camera that looks down.
    expect(sheet.tilt).toBeLessThan(0);
    expect(sheet.tilt).toBeGreaterThan(-Math.PI / 2);
    // Every point of the sheet lands on the pixel the scene's camera gives that point of the wall: corners, edges and middle.
    for (const across of [0, 0.25, 0.5, 1]) {
      for (const down of [0, 0.3, 0.5, 1]) {
        const on = onScreen(across * sheet.width, down * sheet.height);
        const wall = project(SCREEN.left + across * (SCREEN.right - SCREEN.left), SCREEN.top - down * (SCREEN.top - SCREEN.foot), 0);
        expect(on.x).toBeCloseTo(wall.x, 9);
        expect(on.y).toBeCloseTo(wall.y, 9);
      }
    }
    // The sheet is shown at close to its own size all over, so it is laid out once and stays sharp: nowhere stretched or shrunk by a fifth.
    for (const height of [SCREEN.top, SCREEN.foot]) {
      const shown = project(0, height, 0).scale / SCREEN.perUnit;
      expect(shown).toBeGreaterThan(0.85);
      expect(shown).toBeLessThan(1.15);
    }
    // The screen is the upper part of the cabinet: nearly as wide as the drawing at its top, and about a third of its height.
    const top = [project(SCREEN.left, SCREEN.top, 0), project(SCREEN.right, SCREEN.top, 0)];
    const foot = project(SCREEN.left, SCREEN.foot, 0);
    expect((top[1].x - top[0].x) / VIEW.width).toBeGreaterThan(0.75);
    expect((foot.y - top[0].y) / VIEW.height).toBeGreaterThan(0.33);
    expect(foot.y / VIEW.height).toBeLessThan(0.45);
    // Round it is its housing: a strip to either side, the shelf under it and the hood over it, each lapping its edge a little.
    expect(SCREEN.left).toBe(HOUSING.side);
    expect(SCREEN.right).toBe(FIELD.width - HOUSING.side);
    expect(SCREEN.foot).toBeGreaterThan(HOUSING.shelf);
    expect(SCREEN.top).toBeLessThan(HOUSING.hood);
    expect(HOUSING.hood).toBeLessThan(HEIGHT.top);
    expect(HOUSING.lap).toBeGreaterThan(0);
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
    bowl: null,
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

describe('the ball in the bowls', () => {
  const T = TIMING.bowl;
  const FRAME = 1 / 60;
  const holes = BOWLS[0].map((_, hole) => hole);
  const fromCentre = (point: { x: number; y: number }) => Math.hypot(point.x, point.y);
  const apart = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  /** How far round the middle of its bowl the ball went from one place to the next, in turns clockwise. */
  const turnedBy = (before: { x: number; y: number }, after: { x: number; y: number }) =>
    Math.atan2(before.x * after.y - before.y * after.x, before.x * after.x + before.y * after.y) / (2 * Math.PI);
  /** The ball's whole roll to `hole` of the top bowl, a frame at a time, and a second past its end. */
  const roll = (hole: number, frame = FRAME) => Array.from({ length: Math.ceil((T + 1) / frame) + 1 }, (_, index) => bowlBall(index * frame, hole));

  /** A way through one bowl: to which of its holes, and from which hole of the bowl above. */
  interface Way {
    bowl: number;
    hole: number;
    from: number;
  }
  /** The holes of a bowl that lead down to the next. */
  const downs = (bowl: number) => BOWLS[bowl].flatMap((hole, index) => (hole === 'down' ? [index] : []));
  /** Every way there is through every bowl. */
  const WAYS: Way[] = BOWLS.flatMap((all, bowl) => all.flatMap((_, hole) => (bowl === 0 ? [0] : downs(bowl - 1)).map((from) => ({ bowl, hole, from }))));
  const lower = WAYS.filter((way) => way.bowl > 0);
  /** Where the ball is on this way, so long after it came into the bowl. */
  const at = (way: Way, since: number) => bowlBall(since, way.hole, BOWL_TIMES[way.bowl], way.bowl, way.from);
  /** Its whole time in the bowl, a frame at a time and each with its moment, and a second past its end. */
  const frames = (way: Way, frame = FRAME) =>
    Array.from({ length: Math.ceil((BOWL_TIMES[way.bowl] + 1) / frame) + 1 }, (_, index) => ({ time: index * frame, spot: at(way, index * frame) }));

  it('has three holes on a ring in the top bowl, two across the middle one and one in the middle of the last', () => {
    expect(BOWLS.map((bowl) => bowl.length)).toEqual([3, 2, 1]);
    expect(BOWL_TIMES).toHaveLength(BOWLS.length);
    expect(holes).toHaveLength(3);
    for (const hole of holes) expect(fromCentre(holeSpot(hole))).toBeCloseTo(BOWL_SHAPE.ring, 12);
    // The first is at the top; the others follow clockwise.
    expect(holeSpot(0).x).toBeCloseTo(0, 12);
    expect(holeSpot(0).y).toBeCloseTo(-BOWL_SHAPE.ring, 12);
    expect(holeSpot(1).x).toBeGreaterThan(0);
    expect(holeSpot(2).x).toBeLessThan(0);
    expect(apart(holeSpot(0), holeSpot(1))).toBeGreaterThan(BOWL_SHAPE.hole * 4);
    // The middle bowl's two are to the right and to the left, level with each other, so that neither is behind the other.
    expect(holeSpot(0, 1).x).toBeCloseTo(BOWL_SHAPE.ring, 12);
    expect(holeSpot(1, 1).x).toBeCloseTo(-BOWL_SHAPE.ring, 12);
    for (const hole of [0, 1]) expect(holeSpot(hole, 1).y).toBeCloseTo(0, 12);
    // The last bowl is a funnel: its one hole is in the middle, and wider than the others.
    expect(fromCentre(holeSpot(0, 2))).toBe(0);
    expect(BOWL_SHAPE.last).toBeGreaterThan(BOWL_SHAPE.hole);
    // A ball on the lip of a hole is outside the hole, and a ball under the rim is clear of them all.
    expect(BOWL_SHAPE.lip).toBeGreaterThan(BOWL_SHAPE.hole);
    expect(BOWL_SHAPE.rim).toBeGreaterThan(BOWL_SHAPE.ring + BOWL_SHAPE.lip + BOWL_SHAPE.hole);
    expect(BOWL_SHAPE.rim).toBeLessThan(1);
  });

  it('is let go at the same place under the rim of the top bowl whatever hole was drawn', () => {
    const start = bowlBall(0, 0);
    expect(fromCentre(start)).toBeCloseTo(BOWL_SHAPE.rim, 12);
    expect(start).toMatchObject({ bowl: 0, lift: 0, sunk: 0 });
    expect(ballRollsAt(0)).toBe(0);
    for (const hole of holes) {
      expect(apart(bowlBall(0, hole), start)).toBeLessThan(1e-12);
      expect(apart(bowlBall(-3, hole), start)).toBeLessThan(1e-12);
    }
  });

  it('falls into a lower bowl from the hole it went through above, forward to where it can be seen', () => {
    expect(lower.map(({ bowl, hole, from }) => [bowl, hole, from])).toEqual([
      [1, 0, 0],
      [1, 0, 1],
      [1, 1, 0],
      [1, 1, 1],
      [2, 0, 0],
    ]);
    for (const way of lower) {
      expect(ballRollsAt(way.bowl)).toBe(BALL_FALL);
      // It sets off over the hole it went through, a bowl's drop above the floor it is falling to, and still as small as it was drawn down the hole.
      const above = holeSpot(way.from, way.bowl - 1);
      const start = at(way, 0);
      expect(apart(start, above)).toBeLessThan(1e-12);
      expect(start).toMatchObject({ bowl: way.bowl, lift: BOWL_SHAPE.drop, sunk: 1 });
      // It lands under the rim at the front, on the player's side, where the bowl above is not in the way: the same place wherever it came from.
      const landed = at(way, BALL_FALL);
      expect(fromCentre(landed)).toBeCloseTo(BOWL_SHAPE.rim, 12);
      expect(landed.y).toBeGreaterThan(BOWL_SHAPE.rim * 0.7);
      expect(landed).toMatchObject({ lift: 0, sunk: 0 });
      expect(apart(landed, at({ ...way, from: downs(way.bowl - 1)[0] }, BALL_FALL))).toBeLessThan(1e-12);
      // Straight there as seen from above, and down faster and faster.
      const half = at(way, BALL_FALL / 2);
      expect(half.x).toBeCloseTo((above.x + landed.x) / 2, 12);
      expect(half.y).toBeCloseTo((above.y + landed.y) / 2, 12);
      expect(half.lift).toBeCloseTo(BOWL_SHAPE.drop * 0.75, 12);
      const fall = Array.from({ length: 31 }, (_, index) => at(way, (index / 30) * BALL_FALL).lift);
      const drops = fall.slice(1).map((lift, index) => fall[index] - lift);
      expect(drops[0]).toBeGreaterThan(0);
      for (let i = 1; i < drops.length; i++) expect(drops[i]).toBeGreaterThan(drops[i - 1]);
      // It is its own size again by the middle of the fall, while the bowl above still hides it.
      expect(half.sunk).toBe(0);
    }
  });

  it('never jumps from one frame to the next, in a bowl or from one bowl to the next', () => {
    for (const way of WAYS) {
      const coarse = frames(way).map(({ spot }) => spot);
      const steps = coarse.slice(1).map((spot, index) => apart(spot, coarse[index]));
      // At its fastest it covers about an eighth of the bowl's radius in a frame.
      expect(Math.max(...steps)).toBeLessThan(0.14);
      // Looked at four times as often, it moves a quarter as far: nowhere does it leap.
      const fine = frames(way, FRAME / 4).map(({ spot }) => spot);
      const fineSteps = fine.slice(1).map((spot, index) => apart(spot, fine[index]));
      expect(Math.max(...fineSteps)).toBeLessThan(0.14 / 4 + 0.001);
      // It only ever comes down, a little at a time, and what it is drawn at changes as smoothly.
      const coming = coarse.slice(1).map((spot, index) => coarse[index].lift - spot.lift);
      expect(Math.min(...coming)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...coming)).toBeLessThan(0.1);
      const sinking = coarse.slice(1).map((spot, index) => Math.abs(spot.sunk - coarse[index].sunk));
      expect(Math.max(...sinking)).toBeLessThan(0.14);
    }
    // In the top bowl and in the funnel it only ever sinks further into its hole.
    for (const way of WAYS.filter((one) => one.bowl !== 1)) {
      const rolling = frames(way).filter(({ time }) => time >= BALL_FALL);
      const sinking = rolling.slice(1).map(({ spot }, index) => spot.sunk - rolling[index].spot.sunk);
      expect(Math.min(...sinking)).toBeGreaterThanOrEqual(0);
    }
    // The bowl below takes the ball up exactly where the bowl above left it: the same place in the cabinet, drawn the same.
    for (const way of lower) {
      const left = bowlBall(BOWL_TIMES[way.bowl - 1], way.from, BOWL_TIMES[way.bowl - 1], way.bowl - 1);
      expect(left.sunk).toBe(1);
      expect(ballTransform(at(way, 0))).toBe(ballTransform(left));
    }
  });

  it('never rolls back up the bowl, but out from over the hole it nearly took', () => {
    for (const way of WAYS) {
      const rolling = frames(way, FRAME / 4)
        .filter(({ spot }) => spot.lift === 0)
        .map(({ spot }) => spot);
      const rises = rolling.slice(1).map((spot, index) => fromCentre(spot) - fromCentre(rolling[index]));
      expect(fromCentre(rolling[0])).toBeCloseTo(BOWL_SHAPE.rim, 2);
      expect(fromCentre(rolling[rolling.length - 1])).toBeCloseTo(way.bowl === 2 ? 0 : BOWL_SHAPE.ring, 12);
      if (way.bowl === 1) {
        // In the middle bowl it leans in over the other hole and comes back out by as much: less than the lip is wide.
        const back = rises.filter((rise) => rise > 0).reduce((sum, rise) => sum + rise, 0);
        expect(back).toBeGreaterThan(BOWL_SHAPE.lip / 2);
        expect(back).toBeLessThan(BOWL_SHAPE.lip);
      } else {
        expect(Math.max(...rises)).toBeLessThan(1e-9);
      }
    }
  });

  it('circles under the rim, spirals in and goes round the holes before it drops', () => {
    for (const hole of holes) {
      const all = roll(hole);
      // Turns clockwise, added up frame by frame.
      let turned = 0;
      let backwards = 0;
      all.slice(1).forEach((spot, index) => {
        const turn = turnedBy(all[index], spot);
        if (turn < -1e-9) backwards++;
        turned += turn;
      });
      expect(backwards).toBe(0);
      expect(turned).toBeGreaterThan(4);
      expect(turned).toBeLessThan(5);
      // A good second under the rim, then inwards, and the last two seconds down among the holes.
      expect(fromCentre(bowlBall(1, hole))).toBeCloseTo(BOWL_SHAPE.rim, 6);
      expect(fromCentre(bowlBall(T * 0.4, hole))).toBeLessThan(BOWL_SHAPE.rim - 0.1);
      expect(fromCentre(bowlBall(T * 0.4, hole))).toBeGreaterThan(BOWL_SHAPE.ring + BOWL_SHAPE.lip + 0.05);
      expect(fromCentre(bowlBall(T - 2, hole))).toBeCloseTo(BOWL_SHAPE.ring + BOWL_SHAPE.lip, 6);
      // It slows all the way: each second it covers less ground than the one before.
      const ground = (second: number) => {
        const from = second * 60;
        return all.slice(from + 1, from + 61).reduce((sum, spot, index) => sum + apart(spot, all[from + index]), 0);
      };
      for (let second = 1; second < 6; second++) expect(ground(second)).toBeLessThan(ground(second - 1));
    }
  });

  it('goes round every lower bowl too, always the same way, three times and more', () => {
    for (const way of lower) {
      const rolling = frames(way)
        .filter(({ spot }) => spot.lift === 0)
        .map(({ spot }) => spot);
      const turns = rolling.slice(1).map((spot, index) => turnedBy(rolling[index], spot));
      expect(turns.filter((turn) => turn < -1e-9)).toHaveLength(0);
      const turned = turns.reduce((sum, turn) => sum + turn, 0);
      expect(turned).toBeGreaterThan(3);
      expect(turned).toBeLessThan(4.05);
    }
  });

  it('hesitates on the lip of each hole it passes, without going in', () => {
    for (const hole of holes) {
      const all = roll(hole, FRAME / 4);
      const among = all.filter((spot) => spot.sunk === 0 && fromCentre(spot) < BOWL_SHAPE.ring + BOWL_SHAPE.lip + 1e-6);
      for (const other of holes.filter((index) => index !== hole)) {
        // It passes right by the other holes, on their lip and not inside them.
        const nearest = Math.min(...among.map((spot) => apart(spot, holeSpot(other))));
        expect(nearest).toBeCloseTo(BOWL_SHAPE.lip, 3);
        expect(nearest).toBeGreaterThan(BOWL_SHAPE.hole);
      }
      // Its pace among the holes rises and falls: slowest on a lip, quickest half way between two.
      const pace = among.slice(1).map((spot, index) => apart(spot, among[index]));
      let dips = 0;
      for (let i = 1; i < pace.length - 1; i++) if (pace[i] < pace[i - 1] && pace[i] <= pace[i + 1] && pace[i] > 1e-6) dips++;
      expect(dips).toBeGreaterThanOrEqual(2);
    }
  });

  it('all but goes down the other hole of the middle bowl before it rolls on to its own', () => {
    for (const way of WAYS.filter((one) => one.bowl === 1)) {
      const tip = ballTipsAt(BOWL_TIMES[1]);
      const other = holeSpot(1 - way.hole, 1);
      const rolling = frames(way, FRAME / 4).filter(({ time }) => time > BALL_FALL && time < tip);
      // The moment it is furthest down a hole before it tips into its own.
      const miss = rolling.reduce((deepest, one) => (one.spot.sunk > deepest.spot.sunk ? one : deepest));
      expect(miss.spot.sunk).toBeCloseTo(0.3, 2);
      // It is over the other hole then, nearer its middle than its edge, and half the bowl away from its own.
      expect(apart(miss.spot, other)).toBeLessThan(BOWL_SHAPE.hole / 2);
      expect(apart(miss.spot, holeSpot(way.hole, 1))).toBeGreaterThan(BOWL_SHAPE.ring * 2);
      // It comes late, when the ball is slow, and a good second before the ball goes for good.
      expect(miss.time).toBeGreaterThan(BOWL_TIMES[1] * 0.6);
      expect(miss.time).toBeLessThan(tip - 1);
      // It is the only one: up to a little before it and from a little after, the ball rolls at its own size.
      for (const { time, spot } of rolling) if (Math.abs(time - miss.time) > 0.6) expect(spot.sunk).toBeLessThan(0.01);
    }
  });

  it('spirals down the funnel of the last bowl, faster as it closes on the hole in the middle', () => {
    const [way] = WAYS.filter((one) => one.bowl === 2);
    const tip = ballTipsAt(BOWL_TIMES[2]);
    const rolling = frames(way)
      .filter(({ time }) => time > BALL_FALL && time < tip)
      .map(({ spot }) => spot);
    const closing = rolling.slice(1).map((spot, index) => fromCentre(rolling[index]) - fromCentre(spot));
    const turning = rolling.slice(1).map((spot, index) => turnedBy(rolling[index], spot));
    // In towards the middle all the way at an even pace, and round faster with every frame.
    expect(closing[0]).toBeGreaterThan(0);
    for (let i = 1; i < closing.length; i++) {
      expect(closing[i]).toBeCloseTo(closing[0], 9);
      expect(turning[i]).toBeGreaterThan(turning[i - 1]);
    }
    expect(turning[turning.length - 1]).toBeGreaterThan(turning[0] * 4);
    // It is on the edge of the hole when it tips, and then it is in, in the very middle of the bowl.
    const edge = at(way, tip - 0.001);
    expect(fromCentre(edge)).toBeCloseTo(BOWL_SHAPE.last, 2);
    expect(edge.sunk).toBe(0);
    const falling = at(way, (tip + BOWL_TIMES[2]) / 2);
    expect(falling.sunk).toBeGreaterThan(0);
    expect(falling.sunk).toBeLessThan(1);
    expect(fromCentre(falling)).toBeLessThan(BOWL_SHAPE.last);
    for (const later of [BOWL_TIMES[2], BOWL_TIMES[2] + FRAME, BOWL_TIMES[2] + 5]) expect(at(way, later)).toEqual({ ...holeSpot(0, 2), bowl: 2, lift: 0, sunk: 1 });
  });

  it('comes to rest on the lip of its hole, tips in and stays exactly there', () => {
    for (const way of WAYS.filter((one) => one.bowl < 2)) {
      const time = BOWL_TIMES[way.bowl];
      const home = holeSpot(way.hole, way.bowl);
      // Just before it tips it is on the lip, radially outside its hole and all but still.
      const tip = ballTipsAt(time);
      expect(tip).toBeGreaterThan(time - 0.6);
      expect(tip).toBeLessThan(time - 0.2);
      const edge = at(way, tip - 0.001);
      expect(edge.sunk).toBeCloseTo(0, 12);
      expect(apart(edge, home)).toBeCloseTo(BOWL_SHAPE.lip, 3);
      expect(fromCentre(edge)).toBeCloseTo(BOWL_SHAPE.ring + BOWL_SHAPE.lip, 3);
      expect(apart(edge, at(way, tip - 0.001 - FRAME))).toBeLessThan(0.001);
      // Half way through the fall it is part of the way in.
      const falling = at(way, (tip + time) / 2);
      expect(falling.sunk).toBeGreaterThan(0);
      expect(falling.sunk).toBeLessThan(1);
      expect(apart(falling, home)).toBeLessThan(BOWL_SHAPE.lip);
      expect(apart(falling, home)).toBeGreaterThan(0);
      for (const later of [time, time + FRAME, time + 5, time * 100]) expect(at(way, later)).toEqual({ ...home, bowl: way.bowl, lift: 0, sunk: 1 });
    }
  });

  it('ends somewhere else for each hole, and is on its way there well before', () => {
    for (const a of holes) {
      for (const b of holes.filter((hole) => hole > a)) {
        expect(apart(bowlBall(T, a), bowlBall(T, b))).toBeGreaterThan(0.6);
        // A second before the end the three rolls are already in different parts of the bowl.
        expect(apart(bowlBall(T - 1, a), bowlBall(T - 1, b))).toBeGreaterThan(0.5);
      }
    }
    // The middle bowl's two holes are right across it from each other.
    const [right, , left] = WAYS.filter((one) => one.bowl === 1);
    expect([right.hole, left.hole]).toEqual([0, 1]);
    expect(apart(at(right, BOWL_TIMES[1]), at(left, BOWL_TIMES[1]))).toBeCloseTo(BOWL_SHAPE.ring * 2, 12);
  });

  it('acts out the same roll in the top bowl over any length of time', () => {
    for (const hole of holes) {
      for (const share of [0, 0.13, 0.5, 0.8, 0.95, 0.99, 1]) {
        const usual = bowlBall(T * share, hole);
        const slow = bowlBall(20 * share, hole, 20);
        expect(apart(usual, slow)).toBeLessThan(1e-9);
        expect(slow.sunk).toBeCloseTo(usual.sunk, 9);
      }
    }
  });

  it('neither falls nor rolls for a player who has asked for less motion', () => {
    const bowl: ActiveBowl = { holes: [1, 0, 0], stage: 0, elapsed: 3, duration: T, payout: -1 };
    // With motion it is wherever its roll has got to.
    expect(ballSpot(bowl, false)).toEqual(bowlBall(3, 1));
    expect(ballSpot({ ...bowl, duration: 13 }, false)).toEqual(bowlBall(3, 1, 13));
    // Without, it waits where it was let go.
    for (const elapsed of [0, 3, T - 0.01]) expect(ballSpot({ ...bowl, elapsed }, true)).toEqual(bowlBall(0, 1));
    // In a lower bowl it is on its way from the hole it came through, with motion.
    const middle: ActiveBowl = { ...bowl, stage: 1, elapsed: 0.3, duration: BOWL_TIMES[1] };
    expect(ballSpot(middle, false)).toEqual(bowlBall(0.3, 0, BOWL_TIMES[1], 1, 1));
    expect(ballSpot(middle, false).lift).toBeGreaterThan(0);
    expect(ballSpot({ ...middle, elapsed: 2 }, false)).toEqual(bowlBall(2, 0, BOWL_TIMES[1], 1, 1));
    // Without, it is at once where it comes in under that bowl's rim, on the floor, and waits there.
    for (const elapsed of [0, 0.3, 2, BOWL_TIMES[1] - 0.01]) {
      const waiting = ballSpot({ ...middle, elapsed }, true);
      expect(waiting).toEqual(bowlBall(BALL_FALL, 0, BOWL_TIMES[1], 1, 1));
      expect(waiting).toMatchObject({ bowl: 1, lift: 0, sunk: 0 });
      expect(fromCentre(waiting)).toBeCloseTo(BOWL_SHAPE.rim, 12);
    }
    // Either way it is in its hole once it has dropped there for good, in whichever bowl that was.
    const fifty: ActiveBowl = { holes: [2], stage: 0, elapsed: T + 0.01, duration: T, payout: 50 };
    const jackpot: ActiveBowl = { holes: [1, 0, 0], stage: 2, elapsed: BOWL_TIMES[2] + 0.01, duration: BOWL_TIMES[2], payout: 312 };
    for (const calm of [true, false]) {
      expect(ballSpot(fifty, calm)).toEqual({ ...holeSpot(2), bowl: 0, lift: 0, sunk: 1 });
      expect(ballSpot(jackpot, calm)).toEqual({ ...holeSpot(0, 2), bowl: 2, lift: 0, sunk: 1 });
    }
  });

  it('is drawn where it is, in the bowl it is in, and smaller once it has sunk', () => {
    // In ems of the dish, which is 1em from its middle to its rim; the bowl the ball rolls in is a little smaller.
    expect(ballTransform({ x: 0, y: 0, bowl: 0, lift: 0, sunk: 0 })).toBe('translate3d(0.000em, 0.000em, 0.000em) scale(1.000)');
    expect(ballTransform({ x: 1, y: -1, bowl: 0, lift: 0, sunk: 0 })).toBe('translate3d(0.840em, -0.840em, 0.000em) scale(1.000)');
    expect(ballTransform({ x: -0.5, y: 0.25, bowl: 0, lift: 0, sunk: 1 })).toBe('translate3d(-0.420em, 0.210em, 0.000em) scale(0.700)');
    // Each bowl is a drop below the one above, and the ball is that far down with it, less whatever it still has to fall.
    expect(ballTransform({ x: 0, y: 0, bowl: 1, lift: 0, sunk: 0 })).toBe('translate3d(0.000em, 0.000em, -1.764em) scale(1.000)');
    expect(ballTransform({ x: 0, y: 0, bowl: 2, lift: 0, sunk: 0 })).toBe('translate3d(0.000em, 0.000em, -3.528em) scale(1.000)');
    expect(ballTransform({ x: 0, y: 0, bowl: 1, lift: BOWL_SHAPE.drop, sunk: 0 })).toBe(ballTransform({ x: 0, y: 0, bowl: 0, lift: 0, sunk: 0 }));
    expect(ballTransform({ x: 0, y: 0, bowl: 1, lift: 1.05, sunk: 0 })).toBe('translate3d(0.000em, 0.000em, -0.882em) scale(1.000)');
    // Its shadow stays on the floor it is falling to.
    expect(shadowTransform({ x: 0, y: 0, bowl: 1, lift: 0, sunk: 0 })).toBe('translateZ(0.000em)');
    expect(shadowTransform({ x: 0, y: 0, bowl: 1, lift: 1.05, sunk: 0 })).toBe('translateZ(-0.882em)');
    expect(shadowTransform({ x: 0, y: 0, bowl: 2, lift: BOWL_SHAPE.drop, sunk: 1 })).toBe('translateZ(-1.764em)');
  });

  it('moves the ball the cabinet holds, and its shadow with it', () => {
    // An element as far as this goes: something with a style, and perhaps another inside it.
    class Part {
      style = { transform: '' };
      firstElementChild: Part | null = null;
    }
    vi.stubGlobal('HTMLElement', Part);
    try {
      const ball = new Part();
      const shadow = new Part();
      ball.firstElementChild = shadow;
      const spot = { x: 0.2, y: -0.3, bowl: 1, lift: 1.05, sunk: 0 };
      placeBall(ball as unknown as HTMLElement, spot);
      expect(ball.style.transform).toBe(ballTransform(spot));
      expect(ball.style.transform).toBe('translate3d(0.168em, -0.252em, -0.882em) scale(1.000)');
      expect(shadow.style.transform).toBe('translateZ(-0.882em)');
      // A ball with nothing in it is still moved.
      const bare = new Part();
      placeBall(bare as unknown as HTMLElement, spot);
      expect(bare.style.transform).toBe(ballTransform(spot));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('counts a prize up in steps from a tenth of it, and never past what was paid', () => {
    // It sets off a tenth of the way there: the first number read is a prize, never "+0" or one medal.
    expect(countedUp(50, 0, false)).toBe(5);
    expect(countedUp(100, -1, false)).toBe(10);
    expect(countedUp(100, 0, false)).toBe(10);
    expect(countedUp(300, 0, true)).toBe(30);
    // A prize from an upper bowl in 1.4 seconds, the jackpot in five: a quarter of the time in, a quarter of the rest is counted.
    expect(countedUp(100, 0.37, false)).toBe(32);
    expect(countedUp(100, 1.38, false)).toBeLessThan(100);
    expect(countedUp(100, 1.4, false)).toBe(100);
    expect(countedUp(312, 2.52, true)).toBe(171);
    expect(countedUp(312, 4.98, true)).toBeLessThan(312);
    expect(countedUp(312, 5, true)).toBe(312);
    expect(countedUp(312, 500, true)).toBe(312);
    // The count is over well before the prize comes off the screen.
    expect(countedUp(50, bowlShowTime(false) - 2, false)).toBe(50);
    expect(countedUp(5000, bowlShowTime(true) - 2, true)).toBe(5000);
    for (const jackpot of [false, true]) {
      for (const payout of [50, 100, 300, 337, 1200]) {
        const counts = Array.from({ length: 6 * 240 + 1 }, (_, index) => countedUp(payout, index / 240, jackpot));
        // Whole medals, only ever more of them, and the number moves on twenty times a second and no more often.
        for (const count of counts) expect(Number.isInteger(count)).toBe(true);
        for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
        const shown = new Set(counts);
        expect(shown.size).toBeGreaterThan(jackpot ? 40 : 20);
        expect(shown.size).toBeLessThanOrEqual(Math.round((jackpot ? 5 : 1.4) * 20) + 1);
        expect(counts[counts.length - 1]).toBe(payout);
        // The first of them is already several medals, and still most of the prize away.
        expect(counts[0]).toBeGreaterThanOrEqual(5);
        expect(counts[0]).toBeLessThan(payout / 5);
      }
    }
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

  it('groups the holes of each bowl by what they do, with the chance of each overall', () => {
    const groups = holeGroups();
    expect(groups.map(({ bowl, hole, count, holes }) => [bowl, hole, count, holes])).toEqual([
      [0, 'down', 2, 3],
      [0, 50, 1, 3],
      [1, 'down', 1, 2],
      [1, 100, 1, 2],
      [2, 'jackpot', 1, 1],
    ]);
    // Two balls in three go on from the top bowl, and half of those from the middle one.
    const overall = [2 / 3, 1 / 3, 1 / 3, 1 / 3, 1 / 3];
    groups.forEach((group, index) => expect(group.overall).toBeCloseTo(overall[index], 12));
    // The holes that end the challenge are the three ways it can end, each one time in three.
    const ends = groups.filter(({ hole }) => hole !== 'down');
    expect(ends.map(({ hole }) => hole)).toEqual([50, 100, 'jackpot']);
    expect(ends.reduce((sum, { overall: chance }) => sum + chance, 0)).toBeCloseTo(1, 12);
    // What a prize is paid as: so many poured loose, and the towers the rest stands in.
    expect(bowlSplit(50)).toEqual([15, 2]);
    expect(bowlSplit(100)).toEqual([30, 3]);
    expect(bowlSplit(JACKPOT_START)).toEqual([90, 9]);
    for (const medals of [50, 100, 300, 337, 1200]) expect(bowlSplit(medals)[0]).toBe(pouredOf(medals));
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
    expect(en.infoBody(MAX_STOCK)).toHaveLength(ja.infoBody(MAX_STOCK).length);
    expect(en.simNotes('1.08', MAX_STOCK)).toHaveLength(ja.simNotes('1.08', MAX_STOCK).length);
    expect(en.edgeBody).toHaveLength(ja.edgeBody.length);
  });

  it('takes the size of the hold from the machine wherever it is mentioned', () => {
    for (const language of ['en', 'ja'] as const) {
      const t = getStrings(language);
      const held = language === 'ja' ? (n: number) => `${n}回分` : (n: number) => `${n} spins`;
      // Each of these says how many spins are held, and says whatever number it is given.
      const texts = (n: number) => [t.infoBody(n).join(' '), t.simNotes('1.08', n).join(' '), t.calcNote(n)];
      for (const text of texts(MAX_STOCK)) expect(text).toContain(held(MAX_STOCK));
      for (const text of texts(11)) {
        expect(text).toContain(held(11));
        expect(text).not.toContain(held(MAX_STOCK));
      }
      expect(t.slotIntro(11).match(/11/g)).toHaveLength(2);
      expect(t.stockAria(3, MAX_STOCK)).toContain(String(MAX_STOCK));
    }
    // Nothing is left over from the hold of four, in a string or in the source of one that is worked out.
    const source = (_key: string, value: unknown) => (typeof value === 'function' ? String(value) : value);
    const everything = (['en', 'ja'] as const).map((language) => JSON.stringify(getStrings(language), source)).join(' ');
    expect(everything).not.toMatch(/four spins|4回分/);
  });

  it('describes the jewels as the machine has them', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    const info = { en: en.infoBody(MAX_STOCK).join(' '), ja: ja.infoBody(MAX_STOCK).join('') };
    expect(JEWEL.lamps).toBe(5);
    expect(START_JEWELS).toBe(2);
    expect(info.en).toContain('A treasure line also lets a jewel go: the hatch throws it over the pusher onto the middle of the lower table.');
    expect(info.en).toContain(`lights one of the five jewel lamps on the front of the table and pays ${JEWEL.prize} medal at once`);
    expect(info.en).toContain(`The fifth jewel pays the jewel bonus instead, ${JEWEL.bonus} medals stacked as a tower, and the lamps go out.`);
    expect(info.en).toContain('It is pushed along like a medal, but it does not fit through the open sides, so it can only leave over the front.');
    expect(info.en).toContain('Two jewels are already lying on the field.');
    expect(info.ja).toContain('ハッチからプッシャーを越えて、下のテーブルの中央あたりに飛んできます');
    expect(info.ja).toContain(`${JEWEL.lamps}個の宝石ランプが1つ点灯し、すぐにメダル${JEWEL.prize}枚が払い出されます`);
    expect(info.ja).toContain(`${JEWEL.lamps}個目は「宝石ボーナス」で、代わりにメダル${JEWEL.bonus}枚がタワーとして積まれ、ランプは消えます`);
    expect(info.ja).toContain('開いている脇は通らないので、出口は手前の端だけです');
    expect(info.ja).toContain(`宝石は最初から${START_JEWELS}個フィールドに置いてあります`);
    // What is said aloud says what happened, with the numbers it is given.
    expect(en.sayJewel(1, 3, 5)).toBe('A jewel went over the front edge: 1 medal. 3 of 5 jewel lamps are lit.');
    expect(en.sayJewel(2, 1, 5)).toContain('2 medals. 1 of 5');
    expect(en.sayJewelBonus(3, 5)).toBe('A jewel went over the front edge and made the set of 5. Jewel bonus: 3 medals go up as a tower, and the lamps go out.');
    expect(en.jewelLamps(2, 5)).toBe('Jewel lamps: 2 of 5 lit.');
    expect(ja.sayJewel(1, 3, 5)).toBe('宝石が手前の端から落ちました。メダル1枚。宝石ランプは5個中3個点灯しています。');
    expect(ja.sayJewelBonus(3, 5)).toContain('5個そろいました。宝石ボーナス：メダル3枚がタワーとして積まれ');
    expect(ja.jewelLamps(2, 5)).toBe('宝石ランプ：5個中2個点灯');
  });

  it('describes the START pockets as the engine has them', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    // The field is 100 wide, so a distance across it is a percentage of its width.
    expect(FIELD.width).toBe(100);
    expect(PART_IDS).toEqual(['arms', 'pusher', 'chuckers', 'table', 'sides', 'front']);
    expect(en.partName.chuckers).toBe('START pockets');
    expect(ja.partName.chuckers).toBe('チャッカー');
    // How wide a pocket is, where the three are, and that they do not move along the lip.
    expect(en.partText.chuckers).toContain(`as wide as a medal and ${CHECKERS.halfWidth}% of the field’s width more on either side`);
    expect(ja.partText.chuckers).toContain(`メダル1枚分に左右それぞれ幅の${CHECKERS.halfWidth}%を足した広さ`);
    expect(CHECKERS.positions[1]).toBe(FIELD.width / 2);
    expect(en.partText.chuckers).toContain('side by side in the middle of the pusher’s lip');
    expect(en.partText.chuckers).toContain('do not move along it');
    expect(ja.partText.chuckers).toContain('プッシャーの縁の中央に並んでいます');
    expect(ja.partText.chuckers).toContain('左右には動きません');
    // Which medals count: any of them, and a ball never.
    const info = { en: en.infoBody(MAX_STOCK).join(' '), ja: ja.infoBody(MAX_STOCK).join('') };
    expect(info.en).toContain('Any medal does: one you dropped, one the screen paid, or one off a tower');
    expect(info.ja).toContain('自分で落としたメダルでも、払い出されたメダルでも、タワーから崩れたメダルでも同じです');
    expect(en.partText.chuckers).toContain('A ball does not fit');
    expect(ja.partText.chuckers).toContain('ボールは通れません');
    // The calculator's note quotes what the calculator starts from, which is what the Simulation tab measures.
    expect(CALC_DEFAULT).toEqual({ front: 80, spins: 18 });
    expect(en.calcNote(MAX_STOCK)).toContain(`about ${CALC_DEFAULT.front}% of medals leave by the front and a spin starts about ${CALC_DEFAULT.spins} times for every 100 medals dropped`);
    expect(ja.calcNote(MAX_STOCK)).toContain(`約${CALC_DEFAULT.front}%が手前から出て、落としたメダル100枚につき約${CALC_DEFAULT.spins}回の抽選が始まります`);
    // The ways of aiming are named for where each rail feeds, now that there is nothing to follow.
    expect(en.aimName).toEqual({
      centre: 'Both rails down the middle, behind the pockets',
      anywhere: 'Anywhere at all, from the rail on that side',
      beside: 'Each rail at its fixed spot beside the pockets',
      edges: 'Each rail at its own edge',
    });
    expect(ja.aimName).toEqual({
      centre: '両方のレールをチャッカーの奥、中央に',
      anywhere: '場所を決めずに、その側のレールから',
      beside: '左右のレールをチャッカーの両脇に固定',
      edges: '左右のレールをそれぞれの端に',
    });
    expect(en.colGate).toBe('Through a pocket');
    // Nothing still speaks of gates on the back panel, of their sweep, or of following one.
    const source = (_key: string, value: unknown) => (typeof value === 'function' ? String(value) : value);
    const everything = (['en', 'ja'] as const).map((language) => JSON.stringify(getStrings(language), source)).join(' ');
    expect(everything).not.toMatch(/\bgates?\b|sweep|follow(s|ing)? (a|the) |side to side|左右に動き続け|を追う|追いかけ/i);
  });

  it('describes the feed arms as the engine works them', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    // A medal is most of a second going in at its slot and rolling the length of its arm, and in the air for
    // about half a second more.
    expect(ROLL_TIME).toBeCloseTo(FEED.slot + FEED.arm, 12);
    expect(ROLL_TIME).toBeGreaterThanOrEqual(0.75);
    expect(ROLL_TIME).toBeLessThan(1);
    expect(Math.round(FALL_TIME * 2) / 2).toBe(0.5);
    const info = { en: en.infoBody(MAX_STOCK).join(' '), ja: ja.infoBody(MAX_STOCK).join('') };
    expect(info.en).toContain('goes in at the slot by that button, rolls along its feed arm’s rail to the back of the cabinet');
    expect(info.en).toContain('takes most of a second to go in at its slot and roll the length of its arm, and about half a second more to fall');
    expect(info.en).toContain('wherever the arm is pointing when it gets to the tip');
    expect(info.ja).toContain('そのボタンのそばの入り口から入り、アームのレールを奥まで転がって先端から落ち');
    expect(info.ja).toContain('入り口から入ってアームのレールを奥まで転がるのに1秒近く、先端から落ちるのにもう0.5秒ほどかかります');
    expect(info.ja).toContain('先端に着いたときにアームが向いている位置');
    // The diagram's first part is the arms, and its text gives the scatter the engine uses and how far an arm reaches.
    expect(PART_IDS[0]).toBe('arms');
    expect(en.partName.arms).toBe('Feed arms');
    expect(ja.partName.arms).toBe('投入アーム');
    expect(en.partText.arms).toContain('One runs back from each front corner, where its slot is, to end over the pusher');
    expect(ja.partText.arms).toContain('手前の左右の角にある入り口から、プッシャーの上まで1本ずつ伸びています');
    expect(en.partText.arms).toContain(`up to ${LANDING.scatter}% of the width to either side`);
    expect(ja.partText.arms).toContain(`幅の${LANDING.scatter}%まで`);
    expect(ARM_REACH[0].max).toBeGreaterThan(FIELD.width / 2);
    expect(en.partText.arms).toContain('each to a little past the middle');
    expect(ja.partText.arms).toContain('中央を少し越えるところまで');
    // And how long an arm takes to swing from one end of its reach to the other.
    for (const reach of ARM_REACH) expect((reach.max - reach.min) / ARM_SPEED).toBeLessThan(0.2);
    expect(en.partText.arms).toContain('crosses its whole reach in under a fifth of a second');
    expect(ja.partText.arms).toContain('端から端まで動くのに0.2秒かかりません');
    expect(en.simNotes('1.08', MAX_STOCK).join(' ')).toContain('where its arm is pointing when it leaves the tip');
    expect(ja.simNotes('1.08', MAX_STOCK).join('')).toContain('先端を離れるときにアームが向いている位置');
    // Nothing still speaks of the chute the arms replaced.
    const source = (_key: string, value: unknown) => (typeof value === 'function' ? String(value) : value);
    const everything = (['en', 'ja'] as const).map((language) => JSON.stringify(getStrings(language), source)).join(' ');
    expect(everything).not.toMatch(/chute|投入口/i);
  });

  it('says of a prize from the bowls how many medals are poured, which is the number it is given', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    // The usual split, and a pusher crowded enough that more is poured than the share that always is.
    expect(en.sayJackpot(300, 90)).toBe('The ball dropped into the jackpot hole. Jackpot: 300 medals. 90 of them are poured onto the field and the rest go up as towers.');
    expect(en.sayJackpot(300, 200)).toContain('200 of them are poured onto the field and the rest go up as towers.');
    expect(en.sayJackpot(1199, 749)).toContain('Jackpot: 1199 medals. 749 of them are poured onto the field');
    expect(en.sayHole(1, 50, 15, 90)).toBe(
      'The ball dropped into the 50 hole of bowl 1. 15 of those 50 medals are poured onto the field and the rest go up as towers. The run is over: it paid 90 medals.',
    );
    expect(en.sayHole(2, 100, 75, 140)).toContain('75 of those 100 medals are poured onto the field and the rest go up as towers.');
    expect(ja.sayJackpot(300, 90)).toBe('ボールがジャックポットの穴に落ちました。ジャックポット、300枚です。そのうち90枚がフィールドに降り、残りはタワーに積まれます。');
    expect(ja.sayJackpot(300, 200)).toContain('そのうち200枚がフィールドに降り、残りはタワーに積まれます。');
    expect(ja.sayHole(1, 50, 15, 90)).toBe('ボールが1段目のクルーンで50枚の穴に落ちました。50枚のうち15枚がフィールドに降り、残りはタワーに積まれます。終了です。払い出しは合計90枚です。');
    expect(ja.sayHole(2, 100, 75, 140)).toContain('100枚のうち75枚がフィールドに降り、残りはタワーに積まれます。');
    // With no free place on the pusher all of it is poured, and nothing is said of towers that do not go up.
    expect(en.sayJackpot(300, 300)).toBe('The ball dropped into the jackpot hole. Jackpot: 300 medals. All of them are poured onto the field: the pusher has no room for a tower.');
    expect(en.sayHole(1, 50, 50, 90)).toBe('The ball dropped into the 50 hole of bowl 1. All 50 medals are poured onto the field: the pusher has no room for a tower. The run is over: it paid 90 medals.');
    expect(ja.sayJackpot(300, 300)).toBe('ボールがジャックポットの穴に落ちました。ジャックポット、300枚です。プッシャーにタワーを積む場所がないため、すべてフィールドに降ります。');
    expect(ja.sayHole(1, 50, 50, 90)).toBe('ボールが1段目のクルーンで50枚の穴に落ちました。プッシャーにタワーを積む場所がないため、50枚すべてがフィールドに降ります。終了です。払い出しは合計90枚です。');
    for (const text of [en.sayJackpot(300, 300), en.sayHole(1, 50, 50, 90)]) expect(text).not.toContain('the rest');
    for (const text of [ja.sayJackpot(300, 300), ja.sayHole(1, 50, 50, 90)]) expect(text).not.toContain('残り');
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
    // The field only aims, and says so.
    expect(html).toContain('aria-label="The field. Press or drag on its left half to aim the left rail, and on its right half to aim the right rail. This feeds no medals: the L and R buttons do."');
    expect(html).toContain(`aria-label="0 of ${MAX_STOCK} spins held"`);
    // A feed button for each rail, the left one before the medals and the right one after them, each with its key written on it.
    const controls = html.split('data-testid="pusher-controls"')[1].split('data-testid="pusher-keys"')[0];
    const order = ['pusher-feed-left', 'pusher-credits', 'pusher-feed-right', 'pusher-aim-left', 'pusher-aim-right', 'pusher-auto'].map((id) => controls.indexOf(`data-testid="${id}"`));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const button = (id: string) => html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>[\\s\\S]*?</button>`))?.[0] ?? '';
    expect(button('pusher-feed-left')).toContain('aria-label="Feed the left rail"');
    expect(button('pusher-feed-left')).toContain('aria-keyshortcuts="F"');
    expect(button('pusher-feed-left')).toContain('data-arm="0"');
    expect(button('pusher-feed-left')).toContain('data-held="false"');
    expect(button('pusher-feed-left')).toMatch(/>L<[\s\S]*<kbd[^>]*>F<\/kbd>/);
    expect(button('pusher-feed-right')).toContain('aria-label="Feed the right rail"');
    expect(button('pusher-feed-right')).toContain('aria-keyshortcuts="J"');
    expect(button('pusher-feed-right')).toMatch(/>R<[\s\S]*<kbd[^>]*>J<\/kbd>/);
    expect(html).not.toContain('pusher-drop');
    expect(html).not.toContain('>DROP<');
    // An aim for each rail: a slider with a label of its own, as far as that rail's arm reaches, on where a new machine points it.
    const slider = (id: string) => html.match(new RegExp(`<input[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? '';
    expect(slider('pusher-aim-left')).toContain(`min="${AIM_RANGE[0].min}"`);
    expect(slider('pusher-aim-left')).toContain(`max="${AIM_RANGE[0].max}"`);
    expect(slider('pusher-aim-left')).toContain(`value="${aimPercent(armStart(0))}"`);
    expect(slider('pusher-aim-left')).toContain('aria-valuetext="42% across"');
    expect(slider('pusher-aim-right')).toContain(`min="${AIM_RANGE[1].min}"`);
    expect(slider('pusher-aim-right')).toContain(`max="${AIM_RANGE[1].max}"`);
    expect(slider('pusher-aim-right')).toContain('aria-valuetext="58% across"');
    expect(html).toMatch(/<label[^>]*>Left rail aim/);
    expect(html).toMatch(/<label[^>]*>Right rail aim/);
    expect(html).toContain('Keys: F and J feed the left and right rails, and can be held together. S and D aim the left rail, K and L the right.');
    expect(html).toMatch(/aria-pressed="false"[^>]*data-testid="pusher-auto"|data-testid="pusher-auto"[^>]*aria-pressed="false"/);
    expect(html).toContain('aria-live="polite"');
    // Three reels, each a drum with the nine digits round it: a seven on every one.
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

  it('stands the screen in the back wall, behind the canvases, where the camera puts it', () => {
    const html = render(<PlayTab />);
    const sheet = screenPlacement();
    const drawn = (pixels: number) => `calc(${pixels.toFixed(3)} * var(--mp-u))`;
    // The stage has the drawing's own shape, and a pixel of the drawing is so much of the stage's width: nothing is in pixels of the page.
    expect(html).toContain(`aspect-ratio:${VIEW.width} / ${VIEW.height}`);
    expect(html).toContain(`--mp-u:calc(100cqw / ${VIEW.width})`);
    // The room the sheet stands in is the scene's camera, and the sheet is stood where the opening in the housing is.
    expect(html).toContain(`perspective:${drawn(sheet.perspective)};perspective-origin:${drawn(sheet.origin.x)} ${drawn(sheet.origin.y)}`);
    const wall = html.match(/<div[^>]*data-testid="pusher-wall"[^>]*>/)?.[0] ?? '';
    expect(wall).toContain(`width:${drawn(sheet.width)}`);
    expect(wall).toContain(`height:${drawn(sheet.height)}`);
    expect(wall).toContain(`transform:translate3d(${drawn(sheet.x)}, ${drawn(sheet.y)}, ${drawn(sheet.z)}) rotateX(${sheet.tilt.toFixed(5)}rad) scale(${sheet.scale})`);
    // The screen is on the sheet, and the sheet comes before both canvases, so they are over it: whatever the scene draws is in front of the screen.
    expect(html.match(/<canvas/g)).toHaveLength(2);
    expect(html.indexOf('data-testid="pusher-wall"')).toBeGreaterThan(0);
    expect(html.indexOf('data-testid="pusher-wall"')).toBeLessThan(html.indexOf('<canvas'));
    expect(html.indexOf('data-testid="pusher-screen"')).toBeGreaterThan(html.indexOf('data-testid="pusher-wall"'));
    expect(html.indexOf('data-testid="pusher-screen"')).toBeLessThan(html.indexOf('<canvas'));
    expect(html.indexOf('data-testid="pusher-screen"')).toBe(html.lastIndexOf('data-testid="pusher-screen"'));
    expect(html.indexOf('data-testid="pusher-field"')).toBeGreaterThan(html.indexOf('<canvas'));
    // What each line leads to is under the stage; the copy on the screen is not shown in the wall.
    expect(html.match(/7·7·7 ▸ BALL/g)).toHaveLength(2);
    expect(html).toMatch(/<div[^>]*aria-hidden="true"[^>]*data-testid="pusher-legend"/);
    expect(html.indexOf('data-testid="pusher-legend"')).toBeGreaterThan(html.indexOf('data-testid="pusher-field"'));
    const css = stylesheet();
    expect(css).toMatch(/\.wall \.legend \{\s*display: none;\s*\}/);
    expect(css).toMatch(/\.legendBelow \{\s*display: flex;/);
    // The hold's lamps are drawn in the cabinet now. What says how many are lit is still on the screen under the name it
    // had, out of sight but not hidden from a screen reader; and so is the title.
    expect(html).toContain(`aria-label="0 of ${MAX_STOCK} spins held"`);
    expect(html).toContain('data-testid="pusher-mode"');
    const stock = css.match(/\.wall \.stock \{[^}]*\}/)?.[0] ?? '';
    expect(stock).toContain('clip-path: inset(50%)');
    expect(stock).not.toContain('display: none');
    expect(stock).not.toContain('visibility');
    // On the sheet every size is so many pixels of the drawing, or a share of the screen's own stage: never an em or a rem.
    const rules = css.match(/\.wall[^{]*\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(10);
    for (const rule of rules) {
      expect(rule).not.toMatch(/\d(rem|vw)\b/);
      expect(rule).not.toMatch(/(?<!letter-spacing: 0\.\d+)\dem\b/);
    }
  });

  it('feeds from two keys under two hands and aims with the keys beside them', () => {
    // F and J are the home keys of the two first fingers: both can be held at once. Each has its aim keys beside it.
    expect(FEED_KEYS).toEqual({ KeyF: 0, KeyJ: 1 });
    expect(KEY_CAPS).toEqual(['F', 'J']);
    expect(AIM_KEYS).toEqual({ KeyS: { arm: 0, by: -1 }, KeyD: { arm: 0, by: 1 }, KeyK: { arm: 1, by: -1 }, KeyL: { arm: 1, by: 1 } });
    expect(AIM_CAPS).toEqual([
      ['S', 'D'],
      ['K', 'L'],
    ]);
    // Every key is a letter of its own, and what is written on a key is the key that works.
    const codes = [...Object.keys(FEED_KEYS), ...Object.keys(AIM_KEYS)];
    expect(new Set(codes).size).toBe(6);
    for (const arm of [0, 1] as const) {
      expect(FEED_KEYS[`Key${KEY_CAPS[arm]}`]).toBe(arm);
      expect(AIM_KEYS[`Key${AIM_CAPS[arm][0]}`]).toEqual({ arm, by: -1 });
      expect(AIM_KEYS[`Key${AIM_CAPS[arm][1]}`]).toEqual({ arm, by: 1 });
    }
    // Nothing else on the keyboard is the machine's.
    for (const code of ['KeyA', 'KeyG', 'KeyH', 'Space', 'Enter', 'ArrowLeft']) expect([FEED_KEYS[code], AIM_KEYS[code]]).toEqual([undefined, undefined]);
    // A tap of an aim key is a small step, and a held one crosses an arm's reach in a second or two.
    expect(AIM_KEY.tap).toBeLessThanOrEqual(2);
    expect((ARM_REACH[0].max - ARM_REACH[0].min) / AIM_KEY.speed).toBeGreaterThan(1);
    expect((ARM_REACH[0].max - ARM_REACH[0].min) / AIM_KEY.speed).toBeLessThan(2);
    // A press feeds at once, and becomes a stream when it has been held a fifth of a second.
    expect(HOLD_DELAY).toBe(0.2);
  });

  it('leaves a key alone when it is pressed in something the player types or chooses in', () => {
    for (const type of ['text', 'search', 'email', 'number', 'password', 'url', 'tel', undefined]) expect(typingIn({ tagName: 'INPUT', type })).toBe(true);
    expect(typingIn({ tagName: 'TEXTAREA' })).toBe(true);
    expect(typingIn({ tagName: 'SELECT' })).toBe(true);
    expect(typingIn({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    // The aim sliders are inputs too, and a letter does nothing in one: the keys still work with the focus there.
    for (const type of ['range', 'checkbox', 'radio', 'button', 'submit']) expect(typingIn({ tagName: 'INPUT', type })).toBe(false);
    for (const tagName of ['BUTTON', 'CANVAS', 'BODY', 'DIV', 'A']) expect(typingIn({ tagName })).toBe(false);
    expect(typingIn({ tagName: 'DIV', isContentEditable: false })).toBe(false);
    expect(typingIn(null)).toBe(false);
    expect(typingIn(undefined)).toBe(false);
    expect(typingIn('INPUT')).toBe(false);
  });

  it('gives each rail a slider over its own reach, in whole percent across the field', () => {
    expect(aimPercent(AIM.min)).toBe(0);
    expect(aimPercent(AIM.max)).toBe(100);
    expect(aimPercent(FIELD.width / 2)).toBe(50);
    expect(percentAim(0)).toBe(AIM.min);
    expect(percentAim(100)).toBe(AIM.max);
    expect(percentAim(50)).toBeCloseTo(FIELD.width / 2, 9);
    // The left rail's slider runs from the left edge to a little past the middle, and the right rail's the other way.
    expect(AIM_RANGE[0]).toEqual({ min: 0, max: aimPercent(ARM_REACH[0].max) });
    expect(AIM_RANGE[1]).toEqual({ min: aimPercent(ARM_REACH[1].min), max: 100 });
    expect(AIM_RANGE[0].max).toBeGreaterThan(50);
    expect(AIM_RANGE[1].min).toBeLessThan(50);
    expect(AIM_RANGE[0].max + AIM_RANGE[1].min).toBe(100);
    // Every stop of a slider is a spot its rail's arm points at, to the percent: the ends too.
    for (const arm of [0, 1] as const) {
      for (let percent = AIM_RANGE[arm].min; percent <= AIM_RANGE[arm].max; percent++) {
        expect(aimPercent(tipOf(arm, percentAim(percent)))).toBe(percent);
      }
    }
  });

  it('renders the cabinet in Japanese', () => {
    const html = render(<PlayTab />, 'ja');
    expect(html).toContain('aria-label="左のレールにメダルを入れる"');
    expect(html).toContain('aria-label="右のレールにメダルを入れる"');
    expect(html).toContain('左のレールの狙い');
    expect(html).toContain('右のレールの狙い');
    expect(html).toContain('キー操作: FとJで左右のレールにメダルを入れます');
    expect(html).toContain('オート');
    expect(html).toContain('1·3·5·9 ▸ 宝箱');
    expect(html).toContain('2·4·6·8 ▸ すごろく');
    expect(html).toContain('ナンバースロット');
    expect(html).toContain('左から42%');
    expect(html).toContain('左から58%');
  });

  it('lists the exact odds', () => {
    const html = render(<OddsTab />);
    for (const text of ['0.7%', '1 in 143', '1.5%', '1 in 67', '4%', '1 in 25', '93.8%']) expect(html).toContain(text);
    for (const text of ['A prize ball on the field', 'A choice of three chests', 'A roll on the sugoroku board']) expect(html).toContain(text);
    // Each winning line is shown with the pictures its digits wear on the reels, for the eye only: the line's name says the digits.
    const slot = table(html, 'pusher-slot-table');
    const pictures = (tier: string) => {
      const row = slot.split(`<tr data-tier="${tier}">`)[1]?.split('</tr>')[0] ?? '';
      return [...row.matchAll(/<svg[^>]*aria-hidden="true">[\s\S]*?<text[^>]*>(\d)<\/text><\/svg>/g)].map(([, digit]) => Number(digit));
    };
    expect(pictures('seven')).toEqual([7]);
    expect(pictures('big')).toEqual([1, 3, 5, 9]);
    expect(pictures('small')).toEqual([2, 4, 6, 8]);
    expect(pictures('miss')).toEqual([]);
    expect(slot.match(/<span[^>]*aria-hidden="true"><svg/g)).toHaveLength(3);
    // What each line is worth: the board's average, the chests' average with the jewel that comes with them, the roulette's.
    for (const text of ['8.8 medals', '21.4 medals', '63.7 medals']) expect(html).toContain(text);
    // The roulette: four crosses in twelve, and the chance of each number of pockets in a row.
    for (const text of ['A cross: the run ends', 'A tower of 50 medals', '33.3%', '25.0%', '8.3%', 'Medals thrown onto the field']) expect(html).toContain(text);
    expect(html).toContain('4 numbers in a row start the jackpot challenge');
    const chain = table(html, 'pusher-chain-table');
    expect(chain.match(/<td[^>]*>[^<]*</g)?.map((cell) => cell.replace(/<td[^>]*>/, '').slice(0, -1))).toEqual(['66.7%', '44.4%', '29.6%', '19.8%']);
    expect(chain.match(/<th scope="col"/g)).toHaveLength(4);
    // The bowls a full run ends in, by stage: a part for each bowl under a row that names it, and in it what the holes
    // of that bowl do, with the chance of each in its bowl and overall.
    const bowl = table(html, 'pusher-bowl-table');
    expect(bowl.match(/<tbody data-bowl="\d">/g)).toEqual(['<tbody data-bowl="1">', '<tbody data-bowl="2">', '<tbody data-bowl="3">']);
    expect(bowl.match(/<th colSpan="3" scope="rowgroup"[^>]*>[^<]*/g)?.map((head) => head.split('>')[1])).toEqual(['Top bowl: 3 holes', 'Middle bowl: 2 holes', 'Bottom bowl: one hole']);
    expect(bowl.match(/<tr data-bowl="\d" data-hole="[a-z0-9]+"/g)).toEqual([
      '<tr data-bowl="1" data-hole="down"',
      '<tr data-bowl="1" data-hole="50"',
      '<tr data-bowl="2" data-hole="down"',
      '<tr data-bowl="2" data-hole="100"',
      '<tr data-bowl="3" data-hole="jackpot"',
    ]);
    const numbers = bowl
      .split('<tr data-bowl=')
      .slice(1)
      .map((row) => row.match(/<td class="[^"]*">[^<]*/g)?.map((cell) => cell.split('>')[1]));
    expect(numbers).toEqual([
      ['66.7%', '66.7%'],
      ['33.3%', '33.3%'],
      ['50.0%', '33.3%'],
      ['50.0%', '33.3%'],
      ['100.0%', '33.3%'],
    ]);
    // Three columns, which is what fits a phone: what is said of a hole beyond its chances is written under it.
    expect(bowl.match(/<th scope="col"/g)).toHaveLength(3);
    // The two heads over the chances may break into two lines, which the numbers under them may not.
    expect(bowl.match(/<th scope="col" class="[^"]*numHead[^"]*">[^<]*/g)?.map((head) => head.split('>')[1])).toEqual(['Chance in that bowl', 'Chance overall']);
    expect(/\.oddsTable \.numHead \{[^}]*\}/.exec(stylesheet())?.[0]).not.toContain('nowrap');
    expect(bowl.match(/class="[^"]*holeNote[^"]*">[^<]*/g)?.map((note) => note.split('>')[1])).toEqual([
      '2 of its 3 holes',
      'Nothing yet: the ball rolls on in the bowl below',
      '1 of its 3 holes',
      '15 poured onto the field and 2 towers on the pusher',
      '1 of its 2 holes',
      'Nothing yet: the ball rolls on in the bowl below',
      '1 of its 2 holes',
      '30 poured onto the field and 3 towers on the pusher',
      'Its only hole',
      '90 poured onto the field and 9 towers on the pusher when it stands at 300',
    ]);
    const holes = [
      'A hole down to the next bowl',
      'Nothing yet: the ball rolls on in the bowl below',
      'The jackpot',
      '90 poured onto the field and 9 towers on the pusher when it stands at 300',
      '50 medals',
      '15 poured onto the field and 2 towers on the pusher',
      '100 medals',
      '30 poured onto the field and 3 towers on the pusher',
    ];
    for (const text of holes) expect(bowl).toContain(text);
    expect(html).toContain('The jackpot challenge is 3 bowls, one under another.');
    expect(html).toContain('With the jackpot at 300 medals the bowls pay 150 medals on average');
    expect(html).toContain(
      'Of whatever the bowls pay, 30% is poured onto the field loose and the rest is stacked as towers; what the free places on the pusher cannot hold is poured as well.',
    );
    expect(html).toContain('About 19.8% of all balls get this far.');
    expect(html).toContain('One ball in 15.2 wins it, and one spin in 2,170 leads to it');
    expect(html).toContain('One tower on the pusher');
    expect(html).toContain('the average of the board: 8.75 medals');
    expect(html).toContain(`after ${BOARD_ROLLS} rolls from the start, no square is more than ${percent(boardSpread(BOARD_ROLLS))} away`);
    expect(html).toContain('1.117 medals');
    expect(html).toContain('1,000 medals');
    const expected = percent(returnFor(CALC_DEFAULT.front / 100, CALC_DEFAULT.spins / 100, spinValue(JACKPOT_START)));
    expect(html).toMatch(new RegExp(`data-testid="pusher-calc-return"[^>]*>${expected.replace('.', '\\.')}<`));
    // Slot, reach, board, chests, roulette, run, bowl, the jewels, what a spin is worth and what a gold one is.
    expect(html.match(/<caption/g)).toHaveLength(10);
    expect(html.match(/type="range"/g)).toHaveLength(3);
    expect(html.match(/data-badge=/g)).toHaveLength(PART_IDS.length);
  });

  it('lists what the jewels pay, exactly, and counts them in what the treasure line and a spin are worth', () => {
    const html = render(<OddsTab />);
    const jewels = table(html, 'pusher-jewel-table');
    const row = (name: string) => jewels.split(`<tr data-jewel="${name}">`)[1]?.split('</tr>')[0] ?? '';
    expect(jewels.match(/<tr data-jewel=/g)).toHaveLength(2);
    for (const text of ['1st to 4th', '1 medal each', 'Medals thrown onto the field']) expect(row('prize')).toContain(text);
    for (const text of ['5th: the jewel bonus, and the lamps go out', '3 medals', 'One tower on the pusher']) expect(row('bonus')).toContain(text);
    expect(html).toContain('lights one of the 5 jewel lamps on the front of the table');
    expect(html).toContain('it stands too tall for the open sides: the only way off the field is over the front');
    // The exact part: how often one comes, and what a set pays.
    const note = html.split('data-testid="pusher-jewel-note">')[1]?.split('</p>')[0] ?? '';
    expect(note).toContain('with 15 spins in 1,000');
    expect(note).toContain(`A set pays ${JEWEL.lamps - 1} × ${JEWEL.prize} + ${JEWEL.bonus} = ${JEWEL_SET} medals, which is ${JEWEL_VALUE} medals a jewel and ${Number(JEWEL_SPIN_VALUE.toFixed(3))} medals a spin`);
    expect(note).toContain('A set pays 4 × 1 + 3 = 7 medals, which is 1.4 medals a jewel and 0.021 medals a spin');
    expect(note).toContain('No jewel is lost: every one the machine lets go is collected sooner or later, so the figure is exact.');
    expect(note).toContain('A gold spin’s treasure line lets one jewel go like any other');
    expect(note).toContain('chance time doubles the chest, not the jewel');
    expect(note).toContain(`A new machine has ${START_JEWELS} jewels lying on it already`);
    // The treasure line says a jewel comes with it, and is worth its chests and its jewel.
    const line = table(html, 'pusher-slot-table').split('<tr data-tier="big">')[1]?.split('</tr>')[0] ?? '';
    expect(line).toContain('A choice of three chests, and a jewel');
    expect(line).toContain(`${CHEST_VALUE + JEWEL_VALUE} medals`);
    expect(line).toContain('21.4 medals');
    // And a spin is worth what it was, and the jewels' share more.
    expect(html).toContain(`${Number(spinValue(JACKPOT_START).toFixed(3))} medals`);
    expect(html).toContain('1.117 medals');
    // And in Japanese.
    const ja = render(<OddsTab />, 'ja');
    for (const text of ['1〜4個目', '各1枚', '5個目：宝石ボーナス（ランプは消える）', '3枚', '3つの宝箱から1つ選ぶ＋宝石1個', '抽選1,000回につき15個', '4 × 1 + 3 = 7枚', '宝石1個あたり1.4枚、抽選1回あたり0.021枚', '宝石は失われません', '最初から宝石が2個']) expect(ja).toContain(text);
  });

  it('says how many jewel lamps are lit to anyone who cannot see them', () => {
    const html = render(<PlayTab />);
    expect(html).toMatch(new RegExp(`<p[^>]*data-testid="pusher-jewels"[^>]*data-lit="0"[^>]*>Jewel lamps: 0 of ${JEWEL.lamps} lit\\.</p>`));
    expect(render(<PlayTab />, 'ja')).toMatch(new RegExp(`data-testid="pusher-jewels"[^>]*>宝石ランプ：${JEWEL.lamps}個中0個点灯</p>`));
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

  it('explains the jackpot challenge in Japanese', () => {
    const html = render(<OddsTab />, 'ja');
    expect(html).toContain('数字が4回続くとジャックポットチャレンジが始まります');
    expect(html).toContain('クルーン');
    expect(html).toContain('ジャックポットチャレンジは、3段に重なったクルーン');
    for (const text of ['1段目：穴3つ', '2段目：穴2つ', '3段目：穴1つ', '下の段へ進む穴', '3つの穴のうち2つ', 'この段の穴はこれだけ', '全体での確率']) expect(html).toContain(text);
    expect(html).toContain('300枚のとき、90枚がフィールドに降り、プッシャーの上にタワー9本');
    expect(html).toContain('その30%がそのままフィールドに降り、残りがタワーとして積まれます。プッシャーの空いた場所に積みきれない分も、フィールドに降ります。');
    expect(html).toContain('クルーンの払い出しは平均150枚です');
    expect(html).toContain('ボール15.2個に1個がジャックポットを獲得し、抽選では2,170回に1回がそこにつながります');
    const info = getStrings('ja').infoBody(MAX_STOCK).join('');
    expect(info).toContain('数字が4回続くと「ジャックポットチャレンジ」です');
    expect(info).not.toContain('6回');
    expect(getStrings('en').infoBody(MAX_STOCK).join(' ')).toContain('Four numbers in a row start the jackpot challenge');
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
    // The three START pockets are mouths in the catcher on the pusher's front: in a row, as far apart as the engine has them, each as wide as a medal that just fits.
    const pockets = [...html.matchAll(/<circle[^>]*data-chucker[^>]*>/g)].map(([tag]) => {
      const number = (name: string) => Number(new RegExp(` ${name}="([\\d.]+)"`).exec(tag)?.[1]);
      return { x: number('cx'), y: number('cy'), radius: number('r') };
    });
    expect(pockets).toHaveLength(CHECKERS.positions.length);
    const scale = pockets[0].radius / (MEDAL_RADIUS + CHECKERS.halfWidth);
    pockets.forEach((pocket, index) => {
      expect(pocket.radius).toBeCloseTo(pockets[0].radius, 9);
      expect(pocket.y).toBeCloseTo(pockets[0].y, 9);
      expect((pocket.x - pockets[0].x) / scale).toBeCloseTo(CHECKERS.positions[index] - CHECKERS.positions[0], 6);
    });
    // They do not run into one another.
    expect(pockets[1].x - pockets[0].x).toBeGreaterThan(pockets[0].radius * 2);
    // The catcher is drawn out past the pusher's lip, as long as the three pockets take, and every mouth is wholly inside it: beyond the lip, not cut into the pusher.
    const catcher = /<rect[^>]*data-catcher[^>]*>/.exec(html)?.[0] ?? '';
    const side = (name: string) => Number(new RegExp(` ${name}="([\\d.]+)"`).exec(catcher)?.[1]);
    expect(side('width') / scale).toBeCloseTo(CATCHER.to - CATCHER.from, 6);
    expect(side('height') / scale).toBeCloseTo(CATCHER.foot.out, 6);
    for (const pocket of pockets) {
      expect(pocket.x - pocket.radius).toBeGreaterThan(side('x'));
      expect(pocket.x + pocket.radius).toBeLessThan(side('x') + side('width'));
      expect(pocket.y - pocket.radius).toBeGreaterThan(side('y'));
      expect(pocket.y + pocket.radius).toBeLessThan(side('y') + side('height'));
      expect((pocket.y - side('y')) / scale).toBeCloseTo(CATCHER.back + MEDAL_RADIUS + CHECKERS.halfWidth, 6);
    }
    // One feed arm runs back from each front corner to its tip over the pusher, each with its slot at the near end.
    expect(html.match(/data-arm=/g)).toHaveLength(2);
    expect(html.match(/<circle[^>]*r="5.5"/g)).toHaveLength(2);
    const rails = [...html.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"[^>]*stroke-linecap="round"/g)].map((match) => match.slice(1).map(Number));
    expect(rails).toHaveLength(2);
    for (const [x1, y1, x2, y2] of rails) {
      // From below the front edge, at the side, up the picture to over the pusher, nearer the middle.
      expect(y1).toBeGreaterThan(y2 + 150);
      expect(Math.abs(x1 - (rails[0][0] + rails[1][0]) / 2)).toBeGreaterThan(Math.abs(x2 - (rails[0][0] + rails[1][0]) / 2));
    }
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
    stage: -1,
    fallen: [],
    chance: 0,
    gold: false,
  };
  const en = getStrings('en');
  const show = (state: ScreenState, stock = 0, lang: 'en' | 'ja' = 'en') =>
    render(<Screen state={state} stock={stock} strings={getStrings(lang)} registerStrip={() => {}} registerBall={() => {}} onPick={() => {}} />, lang);

  it('turns each digit onto the pay line of its drum', () => {
    // Nine symbols round a drum are 40 degrees apart, and the strip turns back by as much to bring the next one down.
    expect(stripOffset(0)).toBe('rotateX(0.00deg)');
    expect(stripOffset(1)).toBe('rotateX(-40.00deg)');
    expect(stripOffset(8)).toBe('rotateX(-320.00deg)');
    // Between two digits it is part of the way round, which is how a reel is seen to turn and to swing past its digit.
    expect(stripOffset(2.25)).toBe('rotateX(-90.00deg)');
    expect(IDLE_DIGITS).toHaveLength(3);
    // The stylesheet stands the faces the same angle apart, on a drum just big enough for nine faces 1em high to meet edge to edge.
    const css = stylesheet();
    expect(css).toContain(`transform: rotateX(calc(var(--mp-face) * ${360 / REEL_DIGITS.length}deg)) translateZ(var(--mp-drum));`);
    expect(Number(/--mp-drum: ([\d.]+)em;/.exec(css)?.[1])).toBeCloseTo(1 / (2 * Math.tan(Math.PI / REEL_DIGITS.length)), 3);
    // A drum's faces are turned away for most of a turn, and are not drawn from behind.
    expect(/\.digit \{[^}]*backface-visibility: hidden;/.test(css)).toBe(true);
  });

  it('keeps every drum inside its frame, however it is turned', () => {
    // The window does not clip the drum, so the frame drawn over it has to cover whatever of the drum is taller than the window.
    const css = stylesheet();
    const reel = /\.reel \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(reel).not.toContain('overflow');
    const eye = Number(/perspective: ([\d.]+)em;/.exec(reel)?.[1]);
    const half = Number(/height: ([\d.]+)em;/.exec(reel)?.[1]) / 2;
    const frame = Number(/\.reel::after \{[^}]*inset: -([\d.]+)em;\s*border: \1em solid/.exec(css)?.[1]);
    expect(eye).toBeGreaterThan(0);
    expect(frame).toBeGreaterThan(0);
    // Two faces meet a little further from the axle than the middle of a face is, and that edge is what reaches furthest.
    const axle = 1 / (2 * Math.tan(Math.PI / REEL_DIGITS.length));
    const edge = axle / Math.cos(Math.PI / REEL_DIGITS.length);
    let furthest = 0;
    for (let turn = 0; turn <= 180; turn += 0.25) {
      const angle = (turn * Math.PI) / 180;
      // How far behind the window the edge is, and where the eye then sees it, in ems above the pay line.
      const behind = axle - edge * Math.cos(angle);
      furthest = Math.max(furthest, (edge * Math.sin(angle) * eye) / (eye + behind));
    }
    // The drum is taller than its window, which is why the faces above and below are seen to turn away, and the frame covers the rest.
    expect(furthest).toBeGreaterThan(half);
    expect(furthest).toBeLessThan(half + frame);
  });

  it('shows the slot with its reels, the held spins and the legend', () => {
    const html = show(idle, 3);
    expect(html).toContain('data-mode="slot"');
    expect(html).toContain('aria-label="3 of 8 spins held"');
    expect(html.match(/data-lit="true"/g)).toHaveLength(3);
    // One lamp for every spin the machine can hold.
    expect(html.match(/data-lit="(true|false)"/g)).toHaveLength(MAX_STOCK);
    expect(show(idle, MAX_STOCK).match(/data-lit="true"/g)).toHaveLength(MAX_STOCK);
    expect(show(idle, 2, 'ja')).toContain(`aria-label="保留 2／${MAX_STOCK}"`);
    expect(html).toContain('data-hidden="false"');
    // The strips start out neither blurred nor dimmed; the cabinet marks them as they run.
    expect(html.match(/data-fast="false" data-waiting="false"/g)).toHaveLength(3);
    // Each starts turned to its own digit.
    for (const digit of IDLE_DIGITS) expect(html).toContain(`style="transform:${stripOffset(digit - 1)}" data-fast="false"`);
    expect(html).toContain('7·7·7 ▸ BALL');
    expect(html).not.toContain('pusher-die');
    expect(html).not.toContain('pusher-wheel');
    expect(html).not.toContain('pusher-bowl');
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

  it('puts a picture on every face of the drums, with its digit on it and what three of it lead to', () => {
    const html = show(idle);
    // A drum has nine faces, one for each digit in the order they come round, and each is a picture with the digit written on it.
    const face = new RegExp(
      [
        '<span[^>]*style="--mp-face:(\\d)" data-digit="(\\d)" data-tier="(seven|big|small)" data-leads="(ball|chest|sugoroku)">',
        '<svg[^>]*data-family="(seven|big|small)" aria-hidden="true">[\\s\\S]*?<text[^>]*>(\\d)</text></svg></span>',
      ].join(''),
      'g',
    );
    const faces = [...html.matchAll(face)];
    expect(faces).toHaveLength(3 * REEL_DIGITS.length);
    faces.forEach(([, place, digit, tier, leads, family, written], index) => {
      expect(Number(place)).toBe(index % REEL_DIGITS.length);
      expect(Number(digit)).toBe(REEL_DIGITS[index % REEL_DIGITS.length]);
      expect(written).toBe(digit);
      const expected = digit === '7' ? ['seven', 'ball'] : Number(digit) % 2 === 1 ? ['big', 'chest'] : ['small', 'sugoroku'];
      expect([tier, leads]).toEqual(expected);
      expect(family).toBe(tier);
    });
    expect(html.match(/data-leads="ball"/g)).toHaveLength(3);
    expect(html.match(/data-leads="chest"/g)).toHaveLength(3 * 4);
    expect(html.match(/data-leads="sugoroku"/g)).toHaveLength(3 * 4);

    // No two digits wear the same picture, and a family can be told by the colour of its tile alone.
    const symbol = (digit: number) => renderToStaticMarkup(<ReelSymbol digit={digit} />);
    expect(new Set(REEL_DIGITS.map((digit) => symbol(digit).replace(/<text[\s\S]*<\/text>/, ''))).size).toBe(REEL_DIGITS.length);
    const tile = (digit: number) => /<rect[^>]*fill="(#[0-9a-f]{6})"/.exec(symbol(digit))?.[1];
    expect(new Set([1, 3, 5, 9].map(tile)).size).toBe(1);
    expect(new Set([2, 4, 6, 8].map(tile)).size).toBe(1);
    expect(new Set([tile(7), tile(1), tile(2)]).size).toBe(3);
    // The pictures are decoration: whoever shows one says the digit in words.
    for (const digit of REEL_DIGITS) expect(symbol(digit)).toContain('aria-hidden="true"');
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

  it('lays the board out as a loop the piece can walk a square at a time', () => {
    const places = BOARD.map((_, square) => squarePlace(square));
    // Every square has a place of its own on a grid seven wide and three deep.
    expect(new Set(places.map(({ column, row }) => `${column},${row}`)).size).toBe(BOARD.length);
    for (const { column, row } of places) {
      expect(column).toBeGreaterThanOrEqual(0);
      expect(column).toBeLessThan(7);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(3);
    }
    // Each square adjoins the next and the last adjoins the first, so no hop crosses the board.
    places.forEach((place, square) => {
      const next = places[(square + 1) % BOARD.length];
      expect(Math.max(Math.abs(next.column - place.column), Math.abs(next.row - place.row))).toBe(1);
    });
    // The first square is at the front, where the piece is biggest; the fever is on the far side, where its tower stands clear.
    expect(squarePlace(0).row).toBe(2);
    expect(squarePlace(FEVER_SQUARE).row).toBe(0);

    // The markup stands every tile, and the piece, where the loop says.
    const html = show({ ...idle, square: 5 });
    places.forEach(({ column, row }, square) => {
      expect(html).toContain(`style="--mp-column:${column};--mp-row:${row}" data-here="${square === 5}" data-fever="${square === FEVER_SQUARE}"`);
    });
    const piece = `style="--mp-column:${places[5].column};--mp-row:${places[5].row}" aria-hidden="true"`;
    expect(html.match(/style="--mp-column:\d;--mp-row:\d" aria-hidden="true"/g)).toEqual([piece]);
    // On each tile stand the medals it pays, and their number: a square that pays more carries a taller stack.
    const stacks = [...html.matchAll(/<svg[^>]*data-coins="(\d+)">([\s\S]*?)<\/svg><span[^>]*>(?:<span[^>]*>FEVER<\/span>)?(\d+)<\/span>/g)];
    expect(stacks.map(([, , , pays]) => Number(pays))).toEqual([...BOARD]);
    const coins = stacks.map(([, count]) => Number(count));
    // A stack is drawn as that many medals and the face of the top one.
    stacks.forEach(([, count, drawing]) => expect(drawing.match(/<ellipse/g)).toHaveLength(Number(count) + 2));
    BOARD.forEach((medals, a) => {
      BOARD.forEach((other, b) => {
        if (medals > other) expect(coins[a]).toBeGreaterThan(coins[b]);
        if (medals === other) expect(coins[a]).toBe(coins[b]);
      });
    });
    // Until the piece has moved, nothing has hopped.
    expect(html).toContain('data-hop="none"');
  });

  it('shows the die and moves the piece along the board', () => {
    const html = show({ ...idle, mode: 'sugoroku', die: 4, square: 6 });
    expect(html).toContain('SUGOROKU CHANCE');
    expect(html).toContain('data-face="4"');
    // The die is a cube: six faces, each with its own number of pips, and the one that was rolled lit as the top.
    const die = html.match(/<span[^>]*data-testid="pusher-die"[\s\S]*?<\/span>/)?.[0] ?? '';
    const faces = [...die.matchAll(/<svg[^>]*data-pips="(\d)" data-shade="(\w+)">([\s\S]*?)<\/svg>/g)];
    expect(faces.map(([, pips]) => Number(pips))).toEqual([1, 2, 3, 4, 5, 6]);
    for (const [, pips, shade, drawing] of faces) {
      expect(drawing.match(/<circle/g)).toHaveLength(Number(pips));
      expect(shade === 'top').toBe(pips === '4');
    }
    expect(die).toContain(`style="--mp-die-turn:${dieTurn(4)}"`);
    expect(html).toContain('MOVE 4');
    expect(html).toContain('data-square="6"');
    expect(html).toContain('data-hidden="true"');
    // While it tumbles no face is the top one yet, and nothing says how far to move.
    const rolling = show({ ...idle, mode: 'sugoroku', die: 2, rolling: true });
    expect(rolling).toContain('data-rolling="true"');
    expect(rolling).not.toContain('data-shade="top"');
    expect(rolling).not.toContain('MOVE 2');
    // Without motion there is no die until it has been rolled: only the words.
    expect(show({ ...idle, mode: 'sugoroku' })).toContain('Rolling…');
    expect(show({ ...idle, mode: 'sugoroku' })).not.toContain('pusher-die');
    expect(show({ ...idle, mode: 'sugoroku', die: 3 }, 0, 'ja')).toContain('3マス進む');
    // The die is thrown only for a roll.
    expect(show({ ...idle, die: 4 })).not.toContain('pusher-die');
  });

  it('lays the die down with the face that was rolled on top', () => {
    const css = stylesheet();
    type Vector = [number, number, number];
    /** A direction after the turns in a CSS transform, the last of them applied first. */
    const after = (transform: string, start: Vector): Vector =>
      [...transform.matchAll(/rotate([XYZ])\((-?[\d.]+)deg\)/g)].reverse().reduce<Vector>(([x, y, z], [, axis, degrees]) => {
        const cos = Math.cos((Number(degrees) * Math.PI) / 180);
        const sin = Math.sin((Number(degrees) * Math.PI) / 180);
        if (axis === 'X') return [x, y * cos - z * sin, y * sin + z * cos];
        if (axis === 'Y') return [x * cos + z * sin, y, -x * sin + z * cos];
        return [x * cos - y * sin, x * sin + y * cos, z];
      }, start);
    /** The way a face looks out of the cube as the stylesheet stands it there. Before it is turned, a face looks straight up off the board. */
    const out = (pips: number): Vector => {
      const placed = new RegExp(`\\.dieFace\\[data-pips='${pips}'\\] \\{\\s*transform: ([^;]+);`).exec(css)?.[1] ?? '';
      // Half the cube's width out from its middle.
      expect(placed).toMatch(/translateZ\(calc\(var\(--mp-die\) \/ 2\)\)$/);
      return after(placed, [0, 0, 1]);
    };
    const values = [1, 2, 3, 4, 5, 6];
    for (const face of values) {
      // Opposite faces add up to seven.
      out(face).forEach((part, axis) => expect(part + out(7 - face)[axis]).toBeCloseTo(0, 9));
      // Laid down for this roll, the face that was rolled looks straight up.
      const [across, towards, up] = after(dieTurn(face), out(face));
      expect([across, towards, up].map((part) => Math.round(part * 1e9) / 1e9)).toEqual([0, 0, 1]);
      expect(dieShade(face, face)).toBe('top');
      expect(dieShade(face, 7 - face)).toBe('away');
      // Of the other four the player sees two, one more squarely than the other, and each is lit less than the top.
      const sides = values.filter((value) => value !== face && value !== 7 - face).map((value) => dieShade(face, value));
      expect([...sides].sort()).toEqual(['away', 'away', 'front', 'side']);
    }
    // A face that is turned away is not drawn from behind, so the cube is never seen through.
    expect(/\.dieFace \{[^}]*backface-visibility: hidden;/.test(css)).toBe(true);
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
    // Every pocket's number stands in it and has a lamp on the rim; the light is on one of each.
    expect(html.match(/class="[^"]*pocketLabel[^"]*"[^>]*data-on="(true|false)"/g)).toHaveLength(ROULETTE.length);
    expect(html.match(/class="[^"]*rimLamp[^"]*"[^>]*data-on="(true|false)"/g)).toHaveLength(ROULETTE.length);
    expect(html.match(/class="[^"]*pocketLabel[^"]*"[^>]*data-on="true">×</g)).toHaveLength(1);
    expect(html.match(/class="[^"]*rimLamp[^"]*"[^>]*data-on="true"/g)).toHaveLength(1);
    // The tower the run has built so far stands beside the wheel: a medal for every ten.
    expect(html).toContain('data-coins="4"');
    expect(show({ ...idle, mode: 'roulette', lit: -1 })).toContain('data-coins="0"');
    expect(show({ ...idle, mode: 'roulette', lit: -1 })).not.toContain('data-on="true"');
    expect(html).toContain('LEVEL 2 / 4');
    expect(html).toContain('TOWER 40');
    expect(html).toContain('data-level="2"');
    expect(html.match(/class="[^"]*lamp[^"]*" data-lit="(true|false)" data-goal/g)).toHaveLength(4);
    expect(html.match(/data-goal="true"/g)).toHaveLength(1);
    expect(html).not.toContain('pusher-bowl');
  });

  /** The markup of each dish of the bowls, the top one first. */
  const dishes = (html: string) => html.split('data-bowl="').slice(1);
  /** Which holes of a dish are marked, and how. */
  const holesOf = (dish: string) => dish.match(/data-hole="\d" data-kind="[a-z]+" data-in="(true|false)"/g);
  /** The rungs of the ladder beside the bowls. */
  const rungs = (html: string) => (html.split('data-testid="pusher-ladder"')[1]?.split('</ol>')[0] ?? '').match(/data-on="(true|false)" data-done="(true|false)"/g);
  /** The first rule the stylesheet has for this selector, outside any media query. */
  const rule = (css: string, selector: string) => new RegExp(`\\n\\${selector} \\{[^}]*\\}`).exec(css)?.[0] ?? '';

  it('puts the three bowls up for the jackpot challenge, the ball where it is let go', () => {
    const html = show({ ...idle, mode: 'bowl', level: 4, total: 60, stage: 0 });
    expect(html).toContain('data-mode="bowl"');
    expect(html).toContain('JACKPOT CHALLENGE');
    expect(html).not.toContain('JACKPOT CHANCE');
    expect(html).not.toContain('pusher-wheel');
    expect(html).toContain('data-testid="pusher-bowl" data-stage="0" data-fallen=""');
    // Three dishes one under another, each a drop below the one above; only the one the ball is in is out of the shade.
    expect(html.match(/style="--mp-bowl:\d" data-bowl="\d" data-on="(true|false)"/g)).toEqual([
      'style="--mp-bowl:0" data-bowl="0" data-on="true"',
      'style="--mp-bowl:1" data-bowl="1" data-on="false"',
      'style="--mp-bowl:2" data-bowl="2" data-on="false"',
    ]);
    expect(html).toContain(`--mp-drop:${(BOWL_SHAPE.drop * 0.84).toFixed(4)}em`);
    expect(html).toContain('style="--mp-stage:0"');
    // Every hole of every bowl with what it does, and none of them taken yet.
    expect(dishes(html).map(holesOf)).toEqual([
      ['data-hole="0" data-kind="down" data-in="false"', 'data-hole="1" data-kind="down" data-in="false"', 'data-hole="2" data-kind="prize" data-in="false"'],
      ['data-hole="0" data-kind="down" data-in="false"', 'data-hole="1" data-kind="prize" data-in="false"'],
      ['data-hole="0" data-kind="jackpot" data-in="false"'],
    ]);
    // What each hole does is painted on the floor beside it: an arrow on one that leads down, or what it pays.
    expect(html.match(/<text class="[^"]*holeLabel[^"]*"[^>]*>[^<]+<\/text>/g)?.map((label) => label.replace(/<[^>]+>/g, ''))).toEqual(['▼', '▼', '50', '▼', '100', 'JACKPOT']);
    // The ball waits where the cabinet will pick it up, its shadow first inside it, which is where the cabinet looks for it.
    expect(html).toContain(`transform:${ballTransform(bowlBall(0, 0))}" data-testid="pusher-bowl-ball"`);
    expect(html).toMatch(/data-testid="pusher-bowl-ball"><span class="[^"]*ballShadow[^"]*" style="transform:translateZ\(0\.000em\)"><\/span><span class="[^"]*ball[^"]*"><\/span><\/div>/);
    // Beside the bowls, the way down: a rung for each with what it holds, the ball's lit. It takes the place of the run's lamps.
    expect(rungs(html)).toEqual(['data-on="true" data-done="false"', 'data-on="false" data-done="false"', 'data-on="false" data-done="false"']);
    expect(html.match(/rungPrize[^>]*>[^<]+/g)?.map((prize) => prize.split('>')[1])).toEqual(['50', '100', 'JACKPOT']);
    expect(html).not.toContain('LEVEL 4 / 4');
    // The run that got here is still beside it.
    expect(html).toContain('data-level="4"');
    expect(html).toContain('TOWER 60');
    expect(html).toContain('data-hidden="true"');
    // Nothing has been paid yet.
    expect(html).not.toContain('pusher-pay-show');
    expect(show({ ...idle, mode: 'bowl', level: 4, total: 60, stage: 0 }, 0, 'ja')).toContain('ジャックポットチャレンジ');
  });

  it('follows the ball down: the stack is lifted to its bowl and the hole it came through is lit', () => {
    const html = show({ ...idle, mode: 'bowl', level: 4, total: 60, stage: 1, fallen: [1] });
    expect(html).toContain('data-testid="pusher-bowl" data-stage="1" data-fallen="1"');
    expect(html).toContain('style="--mp-stage:1"');
    expect(html.match(/data-bowl="\d" data-on="(true|false)" data-above="(true|false)"/g)).toEqual([
      'data-bowl="0" data-on="false" data-above="true"',
      'data-bowl="1" data-on="true" data-above="false"',
      'data-bowl="2" data-on="false" data-above="false"',
    ]);
    const [top, middle, bottom] = dishes(html).map(holesOf);
    expect(top).toEqual(['data-hole="0" data-kind="down" data-in="false"', 'data-hole="1" data-kind="down" data-in="true"', 'data-hole="2" data-kind="prize" data-in="false"']);
    expect(middle?.join(' ')).not.toContain('data-in="true"');
    expect(bottom?.join(' ')).not.toContain('data-in="true"');
    expect(rungs(html)).toEqual(['data-on="false" data-done="true"', 'data-on="true" data-done="false"', 'data-on="false" data-done="false"']);
    expect(html).not.toContain('pusher-pay-show');
    // The stylesheet lifts the whole stack by a drop for every bowl the ball has gone down, and stands each dish a drop below the last.
    const css = stylesheet();
    expect(rule(css, '.bowlLift')).toContain('transform: translateZ(calc(var(--mp-stage) * var(--mp-drop)));');
    expect(rule(css, '.dish')).toContain('transform: translateZ(calc(var(--mp-bowl) * var(--mp-drop) * -1));');
  });

  it('builds the bowls so that nothing in them is flattened or cut into', () => {
    const css = stylesheet();
    // The window cuts the stack off at the edges of the stage, and the scene inside it is what is looked into: never one box for both.
    expect(rule(css, '.bowlWindow')).toContain('overflow: hidden;');
    expect(rule(css, '.bowlWindow')).not.toContain('perspective');
    expect(rule(css, '.bowlScene')).toContain('perspective: ');
    expect(rule(css, '.bowlScene')).not.toContain('overflow');
    // Everything that holds something standing in depth keeps it in depth, and has nothing on it that would flatten it.
    for (const selector of ['.bowlTilt', '.bowlLift', '.dish', '.ballSpot']) {
      const block = rule(css, selector);
      expect(block).toContain('transform-style: preserve-3d;');
      for (const flattening of ['opacity', 'filter', 'overflow', 'clip-path', 'mask', 'mix-blend-mode']) expect(block).not.toContain(`${flattening}:`);
    }
    // A bowl the ball has dropped out of is glass while the ball falls out from under it. It is the flat sheet of its
    // floor that fades for that, and never the dish, which would be flattened by it.
    const glass = /\n {2}\.dish\[data-above='true'\] > \.bowl \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(glass).toContain('animation: mp-glass');
    expect(/@keyframes mp-glass \{[^@]*opacity: 0\.\d+;/.test(css)).toBe(true);
    expect(rule(css, '.bowl')).not.toContain('preserve-3d');
    expect(css).not.toMatch(/\.dish\[data-above='true'\] \{/);
    // The shade over a bowl the ball is not in is a sheet of its own just above the dish, so it is the sheet that fades and not the dish.
    expect(rule(css, '.dishShade')).toContain('opacity: 0.5;');
    expect(rule(css, '.dishShade')).toContain('transform: translateZ(');
    expect(css).toContain(".dish[data-on='true'] .dishShade {\n  opacity: 0;\n}");
  });

  it('counts out over the stage what the hole the ball took paid', () => {
    const medals = show({ ...idle, mode: 'bowl', level: 4, total: 97, stage: 1, fallen: [1, 1], banner: 'medals', amount: 37 });
    expect(medals).toContain('data-stage="1" data-fallen="1 1"');
    const [top, middle] = dishes(medals).map(holesOf);
    expect(top?.[1]).toBe('data-hole="1" data-kind="down" data-in="true"');
    expect(middle).toEqual(['data-hole="0" data-kind="down" data-in="false"', 'data-hole="1" data-kind="prize" data-in="true"']);
    expect(medals.match(/data-in="true"/g)).toHaveLength(2);
    // The number as far as it has been counted, over the bowl, in the caption and in the run's total; no rain for a prize of this size.
    expect(medals).toContain('data-kind="prize" data-digits="2" aria-hidden="true" data-testid="pusher-pay-show"');
    expect(medals).toContain('data-testid="pusher-pay-count">+37</span>');
    expect(medals).not.toContain('payCoin');
    expect(medals).toContain('data-banner="medals"');
    expect(medals).toContain('+37 MEDALS');
    expect(medals).toContain('TOWER 97');
    // The jackpot: every bowl's hole lit, the whole stage for the count, and medals raining down it.
    const jackpot = show({ ...idle, mode: 'bowl', level: 4, total: 372, stage: 2, fallen: [0, 0, 0], banner: 'jackpot', amount: 312 });
    expect(jackpot.match(/data-in="true"/g)).toHaveLength(3);
    expect(dishes(jackpot).map(holesOf)[2]).toEqual(['data-hole="0" data-kind="jackpot" data-in="true"']);
    expect(rungs(jackpot)).toEqual(['data-on="false" data-done="true"', 'data-on="false" data-done="true"', 'data-on="true" data-done="false"']);
    expect(jackpot).toContain('data-banner="jackpot"');
    expect(jackpot).toContain('data-kind="jackpot" data-digits="3" aria-hidden="true" data-testid="pusher-pay-show"');
    // A jackpot that has grown past a thousand is written smaller, and smaller again past ten thousand, to stay inside the stage.
    const grown = (amount: number) => show({ ...idle, mode: 'bowl', level: 4, total: 40 + amount, stage: 2, fallen: [0, 0, 0], banner: 'jackpot', amount });
    expect(grown(1234)).toContain('data-kind="jackpot" data-digits="4"');
    expect(grown(12345)).toContain('data-kind="jackpot" data-digits="5"');
    expect(grown(123456)).toContain('data-kind="jackpot" data-digits="5"');
    const sizes = ['', "[data-digits='4']", "[data-digits='5']"].map((digits) =>
      Number(new RegExp(`\\.payShow\\[data-kind='jackpot'\\]${digits.replace(/[[\]]/g, '\\$&')} \\.payCount \\{\\s*font-size: ([\\d.]+)cqh;`).exec(stylesheet())?.[1]),
    );
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
    expect(sizes[1]).toBeGreaterThan(sizes[2]);
    expect(sizes[2]).toBeGreaterThan(20);
    expect(jackpot).toContain('data-testid="pusher-pay-count">+312</span>');
    expect(jackpot).toContain('JACKPOT! +312');
    expect(jackpot).toContain('TOWER 372');
    // Each medal of the rain has its own place across the stage and its own moment to start.
    const rain = jackpot.match(/--mp-across:[\d.]+;--mp-wait:\d+/g) ?? [];
    expect(rain).toHaveLength(18);
    expect(new Set(rain.map((coin) => coin.split(';')[0])).size).toBe(18);
    expect(new Set(rain.map((coin) => coin.split(';')[1])).size).toBe(18);
    for (const coin of rain) {
      const across = Number(/--mp-across:([\d.]+)/.exec(coin)?.[1]);
      expect(across).toBeGreaterThanOrEqual(0);
      expect(across).toBeLessThanOrEqual(1);
    }
    expect(show({ ...idle, mode: 'bowl', level: 4, total: 372, stage: 2, fallen: [0, 0, 0], banner: 'jackpot', amount: 312 }, 0, 'ja')).toContain('JACKPOT！ 312枚');
    // The pay show is the bowls' own: a prize on the board or from a chest does not have it.
    expect(show({ ...idle, mode: 'sugoroku', banner: 'medals', amount: 10 })).not.toContain('pusher-pay-show');
  });

  it('leaves out of the pay show all that only moves, for a player who has asked for less motion', () => {
    const css = stylesheet();
    // A medal of the rain is not drawn at all unless motion is welcome.
    expect(rule(css, '.payCoin')).toBe('\n.payCoin {\n  display: none;\n}');
    // What moves is all in one block for players who have not asked for less: the view going down the stack, the shade, the count coming in, the rain.
    const moving = css.split(rule(css, '.payCoin'))[1]?.split('\n@keyframes mp-pay-in')[0] ?? '';
    expect(moving.startsWith('\n@media (prefers-reduced-motion: no-preference) {')).toBe(true);
    for (const text of ['.bowlLift {\n    transition: transform', '.dishShade {\n    transition: opacity', 'animation: mp-glass', 'animation: mp-pay-in', 'animation: mp-rain', 'display: block;']) {
      expect(moving).toContain(text);
    }
    // And nowhere else: each animation is named once where it is used and once where it is defined.
    for (const name of ['mp-rain', 'mp-pay-in', 'mp-glass']) expect(css.split(name)).toHaveLength(3);
    expect(css.split('.bowlLift {')).toHaveLength(3);
    for (const selector of ['.bowlLift', '.dishShade', '.payShow', '.payCount']) {
      expect(rule(css, selector)).not.toContain('transition');
      expect(rule(css, selector)).not.toContain('animation');
    }
    // The number itself is there either way: it is what is paid, counted up by the clock and not by a transition.
    expect(rule(css, '.payCount')).not.toContain('display: none');
  });

  it('keeps the ladder and the count clear of chance time’s strip, which can be up while a ball is in the bowls', () => {
    // A ball goes ahead of the held spins, so gold spins can be held all the while it is in the bowls. The screen
    // says so with its strip, and the ball's own screen is never a gold one.
    const session = createSession(1, { balls: 0 });
    Object.assign(session, { stock: MAX_STOCK, gold: 3, gilded: 3, wasted: 3, roulettes: 1 });
    session.roulette = {
      pocket: 1,
      from: 1,
      elapsed: TIMING.roulette + TIMING.step,
      duration: TIMING.roulette,
      landed: true,
      level: 4,
      total: 40,
      gain: 0,
      over: false,
      jackpot: false,
      bowl: { holes: [0, 1], stage: 1, elapsed: 2, duration: BOWL_TIMES[1], payout: -1 },
    };
    const state = screenState(session, false);
    expect(state).toMatchObject({ mode: 'bowl', stage: 1, fallen: [0], chance: 3, gold: false });
    const rolling = show(state, MAX_STOCK);
    expect(rolling).toContain('3 left');
    expect(rolling).toMatch(/data-gold="false"[^>]*data-testid="pusher-chance"/);
    expect(rungs(rolling)).toHaveLength(3);
    // The strip lies across the top of the stage, and is written just ahead of it: that is how the stylesheet
    // knows it is up, and moves what the bowls have beside and over them out from under it.
    expect(rolling).toMatch(/data-testid="pusher-chance"[^>]*>(<span[^>]*>[^<]*<\/span>)+<\/div><div class="[^"]*stage[^"]*"/);
    const css = stylesheet();
    // The ladder starts lower, and the picture of the tower after it is left out to make the room.
    expect(rolling).toMatch(/<\/ol><span class="[^"]*chainTower[^"]*"/);
    expect(css).toContain('.chance ~ .stage .ladder ~ .chainTower {\n  display: none;\n}');
    expect(/\n\.chance ~ \.stage \.ladder \{\s*margin-top: [\d.]+cqh;\s*\}/.test(css)).toBe(true);
    // A prize from an upper bowl is counted lower over its bowl, and smaller than it is without the strip.
    const lower = Number(/\n\.chance ~ \.stage \.payShow\[data-kind='prize'\] \{\s*top: ([\d.]+)cqh;/.exec(css)?.[1]);
    const smaller = Number(/\n\.chance ~ \.stage \.payShow\[data-kind='prize'\] \.payCount \{\s*font-size: ([\d.]+)cqh;/.exec(css)?.[1]);
    const usual = Number(/\n\.payCount \{[^}]*font-size: ([\d.]+)cqh;/.exec(css)?.[1]);
    expect(lower).toBeGreaterThan(0);
    expect(smaller).toBeGreaterThan(10);
    expect(smaller).toBeLessThan(usual);
    // The roulette's own lamps and tower are not touched by any of this: the rules are for the ladder and the bowls' count alone.
    expect(css.match(/\.chance ~ \.stage/g)).toHaveLength(4);
    // What the ball's hole pays is counted as it is without chance time: the count is the prize, and the strip is still not gold.
    Object.assign(session.roulette.bowl ?? {}, { elapsed: BOWL_TIMES[1] + 2, payout: 100 });
    Object.assign(session.roulette, { over: true, gain: 100, total: 140 });
    const paid = show(screenState(session, false), MAX_STOCK);
    expect(paid).toContain('data-testid="pusher-pay-count">+100</span>');
    expect(paid).toContain('+100 MEDALS');
    expect(paid).toMatch(/data-gold="false"[^>]*data-testid="pusher-chance"/);
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
    const run = { pocket: 3, from: 0, elapsed: 0, duration: TIMING.roulette, landed: false, level: 0, total: 0, gain: 0, over: false, jackpot: false, bowl: null };
    session.roulette = run;
    expect(screenState(session, false)).toMatchObject({ mode: 'roulette', lit: 0, banner: 'none', level: 0, total: 0, stage: -1, fallen: [] });
    expect(screenState(session, true).lit).toBe(-1);
    // A number: the tower goes up and the run goes on.
    Object.assign(run, { landed: true, level: 1, total: 30, gain: 30 });
    expect(screenState(session, false)).toMatchObject({ lit: 3, banner: 'towers', amount: 30, level: 1, total: 30 });
    // A cross: the total the run built.
    Object.assign(run, { pocket: 4, from: 3, landed: true, gain: 0, over: true });
    expect(screenState(session, false)).toMatchObject({ lit: 4, banner: 'finish', amount: 30, level: 1 });
  });

  it('follows the ball from the last number of a full run down the bowls to its hole', () => {
    const session = createSession(1, { balls: 0 });
    const bowl: ActiveBowl = { holes: [1, 1], stage: 0, elapsed: 0, duration: BOWL_TIMES[0], payout: -1 };
    const run: ActiveRoulette = {
      pocket: 1,
      from: 7,
      elapsed: TIMING.roulette + 0.5,
      duration: TIMING.roulette,
      landed: true,
      level: 4,
      total: 60,
      gain: 10,
      over: false,
      jackpot: false,
      bowl: null,
    };
    session.roulette = run;
    // The fourth number is a tower like any other while it is up.
    expect(screenState(session, false)).toMatchObject({ mode: 'roulette', lit: 1, banner: 'towers', amount: 10, level: 4, total: 60, stage: -1, fallen: [] });
    // Then the bowls take the wheel's place. Where the ball will drop is not on the screen until it has.
    run.bowl = bowl;
    for (const elapsed of [0, 3, BOWL_TIMES[0] - 0.01]) {
      bowl.elapsed = elapsed;
      expect(screenState(session, false)).toMatchObject({ mode: 'bowl', banner: 'none', stage: 0, fallen: [], lit: -1, level: 4, total: 60 });
      // The ball is moved by the cabinet, so the screen is the same with or without motion.
      expect(sameScreen(screenState(session, true), screenState(session, false))).toBe(true);
    }
    // Down a hole: the bowl below is the one that is on, and the hole it came through is lit above it.
    Object.assign(bowl, { stage: 1, elapsed: 0.2, duration: BOWL_TIMES[1] });
    for (const elapsed of [0.2, 3, BOWL_TIMES[1] - 0.01]) {
      bowl.elapsed = elapsed;
      expect(screenState(session, false)).toMatchObject({ mode: 'bowl', banner: 'none', stage: 1, fallen: [1], lit: -1, level: 4, total: 60 });
      expect(sameScreen(screenState(session, true), screenState(session, false))).toBe(true);
    }
    // A hundred medals from the middle bowl: counted up from a tenth of it, and the run's total with it.
    Object.assign(bowl, { elapsed: BOWL_TIMES[1], payout: 100 });
    Object.assign(run, { gain: 100, total: 160, over: true });
    expect(screenState(session, false)).toMatchObject({ mode: 'bowl', stage: 1, fallen: [1, 1], banner: 'medals', amount: 10, total: 70, lit: -1 });
    bowl.elapsed = BOWL_TIMES[1] + 0.37;
    expect(screenState(session, false)).toMatchObject({ banner: 'medals', amount: 32, total: 92 });
    // The count is the number that is paid, so a player who asked for less motion has it too.
    expect(sameScreen(screenState(session, true), screenState(session, false))).toBe(true);
    for (const elapsed of [BOWL_TIMES[1] + 1.4, BOWL_TIMES[1] + bowlShowTime(false) - 0.01]) {
      bowl.elapsed = elapsed;
      expect(screenState(session, false)).toMatchObject({ mode: 'bowl', stage: 1, fallen: [1, 1], banner: 'medals', amount: 100, total: 160 });
      expect(screenState(session, true)).toMatchObject({ banner: 'medals', amount: 100, total: 160 });
    }
    // The jackpot's hole, at the bottom of the last bowl: a longer count, and its own banner.
    const last: ActiveBowl = { holes: [0, 0, 0], stage: 2, elapsed: BOWL_TIMES[2], duration: BOWL_TIMES[2], payout: 312 };
    run.bowl = last;
    Object.assign(run, { gain: 312, total: 372, jackpot: true });
    expect(screenState(session, false)).toMatchObject({ mode: 'bowl', stage: 2, fallen: [0, 0, 0], banner: 'jackpot', amount: 31, total: 91 });
    last.elapsed = BOWL_TIMES[2] + 2.52;
    expect(screenState(session, false)).toMatchObject({ banner: 'jackpot', amount: 171, total: 231 });
    expect(sameScreen(screenState(session, true), screenState(session, false))).toBe(true);
    for (const elapsed of [BOWL_TIMES[2] + 5, BOWL_TIMES[2] + bowlShowTime(true) - 0.01]) {
      last.elapsed = elapsed;
      expect(screenState(session, false)).toMatchObject({ mode: 'bowl', stage: 2, fallen: [0, 0, 0], banner: 'jackpot', amount: 312, total: 372 });
    }
    // The screen changes with every step of the count, which is how the cabinet knows to draw it again.
    const counting = [0.5, 0.55, 0.6].map((since) => {
      last.elapsed = BOWL_TIMES[2] + since + 0.02;
      return screenState(session, false);
    });
    expect(sameScreen(counting[0], counting[1])).toBe(false);
    expect(sameScreen(counting[1], counting[2])).toBe(false);
  });

  it('knows when nothing on the screen has changed', () => {
    const session = createSession(1, { balls: 0 });
    const a = screenState(session, false);
    expect(sameScreen(a, screenState(session, false))).toBe(true);
    expect(sameScreen(a, { ...a, square: 1 })).toBe(false);
    expect(sameScreen(a, { ...a, die: 2 })).toBe(false);
    // The bowl the ball is in, and the holes it has been through: the same holes in a list of their own are the same screen.
    expect(sameScreen(a, { ...a, stage: 1 })).toBe(false);
    expect(sameScreen(a, { ...a, fallen: [1] })).toBe(false);
    expect(sameScreen({ ...a, fallen: [1, 0] }, { ...a, fallen: [1, 1] })).toBe(false);
    expect(sameScreen({ ...a, fallen: [1, 0] }, { ...a, fallen: [1, 0] })).toBe(true);
    expect(sameScreen({ ...a, mode: 'bowl' }, { ...a, mode: 'roulette' })).toBe(false);
    const chests = [{ state: 'closed' as const, prize: null, chosen: false }];
    expect(sameScreen({ ...a, chests }, { ...a, chests: [{ ...chests[0] }] })).toBe(true);
    expect(sameScreen({ ...a, chests }, { ...a, chests: [{ ...chests[0], state: 'picked' }] })).toBe(false);
    expect(sameScreen({ ...a, chests }, a)).toBe(false);
  });
});

describe('chance time on the screen and in the words', () => {
  const idle = screenState(createSession(1, { balls: 0 }), false);
  const show = (state: ScreenState, stock = 0, lang: 'en' | 'ja' = 'en') =>
    render(<Screen state={state} stock={stock} strings={getStrings(lang)} registerStrip={() => {}} registerBall={() => {}} onPick={() => {}} />, lang);
  const lamps = (html: string, lit: string) => html.match(new RegExp(`data-lit="[a-z]+" data-gold="${lit}"`, 'g'))?.length ?? 0;

  it('says nothing of it while no spin is gold', () => {
    expect(idle).toMatchObject({ chance: 0, gold: false });
    const html = show(idle, 5);
    expect(html).not.toContain('pusher-chance');
    expect(html).not.toContain('CHANCE TIME');
    expect(lamps(html, 'true')).toBe(0);
    expect(lamps(html, 'false')).toBe(MAX_STOCK);
  });

  it('writes CHANCE TIME, what a gold spin pays and how many are left, and flashes the gold spins’ lamps', () => {
    // Three gold spins held, and nothing gold on the screen yet.
    const waiting = show({ ...idle, chance: 3, gold: false }, MAX_STOCK);
    const strip = waiting.match(/<div[^>]*data-testid="pusher-chance"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(strip).toContain('CHANCE TIME');
    expect(strip).toContain(`×${CHANCE.multiplier}`);
    expect(strip).toContain('3 left');
    expect(strip).toContain('data-gold="false"');
    // The first three lamps are the gold spins': the gold ones are played first.
    expect(lamps(waiting, 'true')).toBe(3);
    expect(waiting.match(/data-lit="true" data-gold="true"/g)).toHaveLength(3);
    // One of them on the reels, and two still held: three left, two lamps gold, and the strip says the screen is gold.
    const playing = show({ ...idle, chance: 3, gold: true }, 7);
    expect(playing).toMatch(/data-gold="true"[^>]*data-testid="pusher-chance"|data-testid="pusher-chance"[^>]*data-gold="true"/);
    expect(playing).toContain('3 left');
    expect(lamps(playing, 'true')).toBe(2);
    // The last one on the reels: no lamp is gold, and it is still chance time.
    const last = show({ ...idle, chance: 1, gold: true }, 4);
    expect(last).toContain('1 left');
    expect(lamps(last, 'true')).toBe(0);
    // It is for the eye: the cabinet says it aloud once, where it makes its announcements.
    expect(strip).toContain('aria-hidden="true"');
    const ja = show({ ...idle, chance: 3, gold: true }, 7, 'ja');
    expect(ja).toContain('チャンスタイム');
    expect(ja).toContain('あと3回');
  });

  it('takes it from the session: the gold spins that are held, and the one on the screen', () => {
    const session = createSession(1, { balls: 0 });
    session.stock = MAX_STOCK;
    session.gold = 5;
    session.gilded = 5;
    session.wasted = 5;
    expect(screenState(session, false)).toMatchObject({ chance: 5, gold: false });
    session.chance = true;
    session.gold = 4;
    expect(screenState(session, false)).toMatchObject({ chance: 5, gold: true });
    // One fewer left, or the screen turning gold, is another screen to draw.
    const five = screenState(session, false);
    expect(sameScreen(five, { ...five })).toBe(true);
    expect(sameScreen(five, { ...five, chance: 4 })).toBe(false);
    expect(sameScreen(five, { ...five, gold: false })).toBe(false);
  });

  it('flashes a gold lamp at one rate, twice a second, each a beat behind the one before, and not at all with motion reduced', () => {
    // Under the three flashes a second that are safe for anyone to look at.
    expect(GOLD_FLASH.perSecond).toBe(2);
    expect(GOLD_FLASH.perSecond).toBeLessThanOrEqual(3);
    const period = 1 / GOLD_FLASH.perSecond;
    for (let lamp = 0; lamp < MAX_STOCK; lamp++) {
      // A whole second, a frame at a time: it goes from dim to bright as many times as the rate says, and no oftener.
      const seen = Array.from({ length: 121 }, (_, frame) => goldFlash(5 + frame / 120, lamp, false));
      expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...seen)).toBeLessThanOrEqual(1);
      expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.9);
      expect(seen.filter((bright, frame) => frame > 0 && seen[frame - 1] < 0.5 && bright >= 0.5)).toHaveLength(GOLD_FLASH.perSecond);
      // The same one flash later, and the opposite half a flash later.
      expect(goldFlash(0.3, lamp, false)).toBeCloseTo(goldFlash(0.3 + period, lamp, false), 9);
      expect(goldFlash(0.3, lamp, false) + goldFlash(0.3 + period / 2, lamp, false)).toBeCloseTo(1, 9);
      // With motion reduced it is steadily at its brightest, whatever the clock says.
      for (const clock of [0, 0.3, 0.3 + period / 2, 17.77]) expect(goldFlash(clock, lamp, true)).toBe(1);
    }
    expect(goldFlash(0.1, 0, false)).not.toBeCloseTo(goldFlash(0.1, 1, false), 3);
  });

  it('flashes the gold lamps on the page at that same rate: the stylesheet takes the length of one flash from the cabinet', () => {
    expect(GOLD_FLASH_STYLE).toEqual({ '--mp-gold-flash': `${1 / GOLD_FLASH.perSecond}s` });
    expect(GOLD_FLASH_STYLE).toEqual({ '--mp-gold-flash': '0.5s' });
    // The row of the hold's lamps carries it, so every gold lamp in the row takes it.
    const html = show({ ...idle, chance: 3, gold: false }, MAX_STOCK);
    expect(html).toMatch(/data-testid="pusher-stock"[^>]*style="--mp-gold-flash:0\.5s"/);
    const css = readFileSync(join(process.cwd(), 'src/components/game/MedalPusher/MedalPusher.module.css'), 'utf8');
    // One run of the animation is one whole flash, bright to dim and back to bright at its start: it does not
    // alternate, which would make a flash take two runs and halve the rate.
    const animation = /\.lamp\[data-gold='true'\] \{\s*animation: ([^;]+);/.exec(css)?.[1];
    expect(animation).toBe('mp-gold-lamp var(--mp-gold-flash, 0.5s) steps(2, jump-none) infinite');
    expect(animation).not.toContain('alternate');
    // It is the only thing that animates a gold lamp, and it is there only for those who have not asked for less motion.
    expect(css.match(/animation: mp-gold-lamp/g)).toHaveLength(1);
    const at = css.indexOf('animation: mp-gold-lamp');
    const media = css.slice(css.lastIndexOf('@media', at), at);
    expect(media).toContain('(prefers-reduced-motion: no-preference)');
    expect(media.match(/\{/g)).toHaveLength(2);
    // Without it a gold lamp is steadily gold: brighter than a lit one, by a rule that no motion setting takes away.
    const steady = /\n\.lamp\[data-gold='true'\] \{([^}]+)\}/.exec(css)?.[1] ?? '';
    expect(steady).toContain('background: #fffbe0');
    expect(steady).not.toContain('animation');
  });

  it('gives the rule and a gold spin’s worth on the Odds tab, to five places', () => {
    const html = render(<OddsTab />);
    const chance = table(html, 'pusher-chance-table');
    // An ordinary spin, a gold one, and what being gold adds, with the jackpot at 300: the board's and the chests' share again.
    // Both spins count the jewel a treasure line lets go, once: 0.021 medals a spin.
    expect(spinValue(JACKPOT_START).toFixed(5)).toBe('1.11714');
    expect(chanceSpinValue(JACKPOT_START).toFixed(5)).toBe('1.76714');
    expect(CHANCE_BONUS).toBeCloseTo(0.65, 12);
    expect(CHANCE_BONUS).toBeCloseTo(tierChance('small') * BOARD_VALUE + tierChance('big') * CHEST_VALUE, 12);
    for (const text of ['1.11714 medals', '1.76714 medals', '0.65000 medals']) expect(chance).toContain(text);
    // What being gold adds is the same at any size of jackpot: a gold spin's ball is worth what any ball is.
    expect(chance.match(/0\.65000 medals/g)).toHaveLength(JACKPOT_LEVELS.length);
    for (const level of JACKPOT_LEVELS) {
      expect(chance).toContain(`${chanceSpinValue(level).toFixed(5)} medals`);
      expect(chanceTierValue('seven', level)).toBe(tierValue('seven', level));
      expect(chanceTierValue('miss', level)).toBe(0);
      expect(chanceTierValue('small', level)).toBe(BOARD_VALUE * 2);
      // Two chests, and the one jewel that comes with any treasure line.
      expect(chanceTierValue('big', level)).toBe(CHEST_VALUE * 2 + JEWEL_VALUE);
    }
    expect(html).toContain(`When all ${MAX_STOCK} spins are held, the next medal through a START pocket starts no spin of its own.`);
    expect(html).toContain('pays 2 times over, and a ball is a ball');
    expect(html).toContain('it is worth 0.65 medals more than one ordinary spin');
    const ja = render(<OddsTab />, 'ja');
    expect(ja).toContain('チャンスタイム');
    expect(ja).toContain('ふつうの抽選より0.65枚多く払い出します');
  });

  it('explains it in the how-to, the slot’s note and the simulation’s notes, in both languages', () => {
    const [en, ja] = [getStrings('en'), getStrings('ja')];
    expect(en.infoBody(MAX_STOCK).join(' ')).toContain('turns one of the held spins gold: that is CHANCE TIME');
    expect(ja.infoBody(MAX_STOCK).join('')).toContain('これがチャンスタイムです');
    expect(en.slotIntro(MAX_STOCK)).toContain('starts no spin of its own, but turns one of the held spins gold');
    expect(ja.slotIntro(MAX_STOCK)).toContain('保留中の抽選が1つ金色に変わります');
    expect(en.simNotes('1.10', MAX_STOCK).join(' ')).toContain('it turns one of the held spins gold, if one is left to turn');
    expect(ja.simNotes('1.10', MAX_STOCK).join('')).toContain('そのうち1つが金の抽選に変わります');
    expect(en.chanceLeft(4)).toBe('4 left');
    expect(en.sayChance).toContain('Chance time');
    expect(ja.sayChance).toContain('チャンスタイム');
    expect(en.colGold).toBe('Gold spins');
    expect(ja.colGold).toBe('金の抽選');
    // The Simulation tab offers both buttons held down as a pace.
    expect(render(<SimTab />)).toContain('11 medals a second');
  });
});

describe('the cabinet’s lights for what the bowls paid', () => {
  const DT = 1 / 60;
  /** The three ends: the way down to each, whether it is the jackpot, and what it pays on a new machine. */
  const ENDS = [
    ['the jackpot', [0, 0, 0], true, 300],
    ['the fifty of the top bowl', [2], false, 50],
    ['the hundred of the middle bowl', [0, 1], false, 100],
  ] as const;
  /** A machine with a full run behind it and the ball a fifth of a second from dropping into the last hole of `way`. */
  const nearTheDrop = (way: readonly number[]): Session => {
    const session = createSession(7, { balls: 0 });
    const stage = way.length - 1;
    session.roulettes = 1;
    session.roulette = {
      pocket: 1,
      from: 1,
      elapsed: TIMING.roulette + TIMING.step,
      duration: TIMING.roulette,
      landed: true,
      level: 4,
      total: 40,
      gain: 0,
      over: false,
      jackpot: false,
      bowl: { holes: [...way], stage, elapsed: BOWL_TIMES[stage] - 0.2, duration: BOWL_TIMES[stage], payout: -1 },
    };
    return session;
  };
  /** A stage for the lights to be on, made without anything to paint it with. */
  const bareStage = (): Stage => {
    vi.stubGlobal('document', { createElement: () => ({}) });
    try {
      return createStage(1, false);
    } finally {
      vi.unstubAllGlobals();
    }
  };
  /**
   * One frame as the cabinet runs it: the machine moves on, the bowls' lights are seen to, whatever else happened
   * in the frame is celebrated, and the stage ages. What comes back is the celebration the bowls have lit.
   */
  const frame = (session: Session, stage: Stage, lit: Stage['party']): Stage['party'] => {
    const events: SessionEvent[] = [];
    advance(session, DT, events);
    const now = lightBowlPrize(stage, session.roulette, lit);
    for (const event of events) if (event.type === 'toppled') celebrate(stage, 'crash');
    ageStage(stage, DT);
    return now;
  };
  const prizeUp = (session: Session): boolean => (session.roulette?.bowl?.payout ?? -1) >= 0;
  /** Whether the cabinet is lit as it is for a prize. A tower coming down shakes it for a moment, which is another thing. */
  const festive = (stage: Stage): boolean => stage.party !== null && stage.party.kind !== 'crash';

  it.each(ENDS)('are on for exactly as long as %s is up on the screen, and out in the frame the screen is free', { timeout: 30_000 }, (_name, way, jackpot, payout) => {
    const session = nearTheDrop(way);
    const stage = bareStage();
    let lit: Stage['party'] = null;
    let shown = 0;
    let freed = -1;
    for (let i = 0; i < 60 * 12; i++) {
      const busy = session.roulette !== null;
      lit = frame(session, stage, lit);
      // In every frame that is drawn the lights are on if, and only if, the prize is on the screen.
      expect(festive(stage), `frame ${i}`).toBe(prizeUp(session));
      if (prizeUp(session)) {
        shown += 1;
        expect(stage.party?.kind).toBe(jackpot ? 'jackpot' : 'fever');
        expect(session.roulette?.bowl?.payout).toBe(payout);
      }
      if (busy && session.roulette === null) freed = i;
    }
    // The screen was freed, the prize having been up for its own time to the frame, and the lights went with it.
    expect(freed).toBeGreaterThan(0);
    expect(Math.abs(shown * DT - bowlShowTime(jackpot))).toBeLessThanOrEqual(DT);
    expect(festive(stage)).toBe(false);
    // The stage's own time for a celebration of that kind is longer than the show: left to it, the lights would have outlasted the screen.
    expect(PARTY_TIME[jackpot ? 'jackpot' : 'fever']).toBeGreaterThan(bowlShowTime(jackpot));
  });

  it.each(ENDS)('are out before the next game is on the screen after %s, a ball’s roulette or a held spin', { timeout: 30_000 }, (_name, way) => {
    for (const next of ['roulette', 'spin'] as const) {
      const session = nearTheDrop(way);
      // Something is waiting for the screen: another ball has gone over, or a spin is held.
      if (next === 'roulette') session.balls = 1;
      else session.stock = 1;
      const stage = bareStage();
      let lit: Stage['party'] = null;
      let started = false;
      for (let i = 0; i < 60 * 12 && !started; i++) {
        lit = frame(session, stage, lit);
        started = next === 'roulette' ? session.roulette?.bowl === null : session.spin !== null;
        if (started) expect(festive(stage), next).toBe(false);
      }
      expect(started, next).toBe(true);
    }
  });

  it('are not taken by a tower that comes down in the middle of the show, and do not stay on for it', () => {
    const session = nearTheDrop([0, 0, 0]);
    const stage = bareStage();
    let lit: Stage['party'] = null;
    while (!prizeUp(session)) lit = frame(session, stage, lit);
    for (let i = 0; i < 60; i++) lit = frame(session, stage, lit);
    // A tower falls: the jackpot's lights are still the jackpot's, in that frame and the next.
    celebrate(stage, 'crash');
    expect(stage.party?.kind).toBe('jackpot');
    lit = frame(session, stage, lit);
    expect(stage.party?.kind).toBe('jackpot');
    while (session.roulette) lit = frame(session, stage, lit);
    expect(stage.party).toBeNull();
    expect(lit).toBeNull();
  });

  it('come back on a stage made anew in the middle of the show, as one is when the cabinet changes size', () => {
    const session = nearTheDrop([0, 1]);
    let stage = bareStage();
    let lit: Stage['party'] = null;
    while (!prizeUp(session)) lit = frame(session, stage, lit);
    for (let i = 0; i < 30; i++) lit = frame(session, stage, lit);
    stage = bareStage();
    expect(stage.party).toBeNull();
    lit = frame(session, stage, lit);
    expect(stage.party?.kind).toBe('fever');
    while (session.roulette) lit = frame(session, stage, lit);
    expect(stage.party).toBeNull();
  });

  it('leave a celebration they did not light to run its own time', () => {
    // The fever square of the board lights the cabinet for as long as its kind lasts, with no ball anywhere near a bowl.
    const session = createSession(7, { balls: 0 });
    const stage = bareStage();
    celebrate(stage, 'fever');
    let lit: Stage['party'] = null;
    for (let i = 0; i < 60; i++) {
      lit = frame(session, stage, lit);
      expect(lit).toBeNull();
      expect(stage.party?.kind).toBe('fever');
    }
    expect(stage.party?.left).toBeCloseTo(PARTY_TIME.fever - 1, 6);
    // Nor do they put out one that took their place: only the very celebration they lit.
    const theirs = { kind: 'fever' as const, left: 1 };
    const other = { kind: 'fever' as const, left: 1 };
    stage.party = other;
    expect(lightBowlPrize(stage, null, theirs)).toBeNull();
    expect(stage.party).toBe(other);
    stage.party = theirs;
    expect(lightBowlPrize(stage, null, theirs)).toBeNull();
    expect(stage.party).toBeNull();
  });
});
