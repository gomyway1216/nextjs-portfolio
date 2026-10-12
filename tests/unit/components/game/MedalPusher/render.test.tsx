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
import { ReelSymbol } from '@/components/game/MedalPusher/ReelSymbols';
import {
  IDLE_DIGITS,
  Screen,
  ballTransform,
  bannerText,
  dieShade,
  dieTurn,
  markStrip,
  squarePlace,
  stripOffset,
} from '@/components/game/MedalPusher/ScreenPanel';
import { DEFAULT_PACE, MEDAL_OPTIONS, SimTab } from '@/components/game/MedalPusher/SimTab';
import { FieldDiagram, Marker, ReturnChart } from '@/components/game/MedalPusher/charts';
import { CHECKERS, FIELD, LANDING, PUSHER, SWEEP } from '@/components/game/MedalPusher/engine';
import { percent, tidyPercent } from '@/components/game/MedalPusher/format';
import { PART_IDS, getStrings } from '@/components/game/MedalPusher/i18n';
import { BOARD, BOWL, FEVER_SQUARE, JACKPOT_START, ROULETTE, reachChance, reachHitChance, spinValue } from '@/components/game/MedalPusher/lottery';
import {
  BOWL_SHAPE,
  REEL_DIGITS,
  SWING,
  ballSpot,
  ballTipsAt,
  bowlBall,
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
  MAX_STOCK,
  START_CREDITS,
  TIMING,
  createSession,
  reachTime,
  sugorokuDuration,
  type ActiveBowl,
  type ActiveRoulette,
  type ActiveSpin,
} from '@/components/game/MedalPusher/session';
import { AIM_COLORS, AIM_IDS, AIM_MARKERS } from '@/components/game/MedalPusher/sim';
import { HEIGHT, VIEW, project, rise, unproject, unprojectPanel } from '@/components/game/MedalPusher/view';
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

describe('the ball in the bowl', () => {
  const T = TIMING.bowl;
  const FRAME = 1 / 60;
  const holes = BOWL.map((_, hole) => hole);
  const fromCentre = (point: { x: number; y: number }) => Math.hypot(point.x, point.y);
  const apart = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  /** The ball's whole roll to `hole`, a frame at a time, and a second past its end. */
  const roll = (hole: number, frame = FRAME) => Array.from({ length: Math.ceil((T + 1) / frame) + 1 }, (_, index) => bowlBall(index * frame, hole));

  it('has three holes evenly spaced on a ring, well apart and inside the rim', () => {
    expect(holes).toHaveLength(3);
    for (const hole of holes) expect(fromCentre(holeSpot(hole))).toBeCloseTo(BOWL_SHAPE.ring, 12);
    // The first is at the top; the others follow clockwise.
    expect(holeSpot(0).x).toBeCloseTo(0, 12);
    expect(holeSpot(0).y).toBeCloseTo(-BOWL_SHAPE.ring, 12);
    expect(holeSpot(1).x).toBeGreaterThan(0);
    expect(holeSpot(2).x).toBeLessThan(0);
    expect(apart(holeSpot(0), holeSpot(1))).toBeGreaterThan(BOWL_SHAPE.hole * 4);
    // A ball on the lip of a hole is outside the hole, and a ball under the rim is clear of them all.
    expect(BOWL_SHAPE.lip).toBeGreaterThan(BOWL_SHAPE.hole);
    expect(BOWL_SHAPE.rim).toBeGreaterThan(BOWL_SHAPE.ring + BOWL_SHAPE.lip + BOWL_SHAPE.hole);
    expect(BOWL_SHAPE.rim).toBeLessThan(1);
  });

  it('is let go at the same place under the rim whatever hole was drawn', () => {
    const start = bowlBall(0, 0);
    expect(fromCentre(start)).toBeCloseTo(BOWL_SHAPE.rim, 12);
    expect(start.sunk).toBe(0);
    for (const hole of holes) {
      expect(apart(bowlBall(0, hole), start)).toBeLessThan(1e-12);
      expect(apart(bowlBall(-3, hole), start)).toBeLessThan(1e-12);
    }
  });

  it('never jumps from one frame to the next', () => {
    for (const hole of holes) {
      const frames = roll(hole);
      const steps = frames.slice(1).map((spot, index) => apart(spot, frames[index]));
      // At its fastest it covers about an eighth of the bowl's radius in a frame.
      expect(Math.max(...steps)).toBeLessThan(0.14);
      // Looked at four times as often, it moves a quarter as far: nowhere does it leap.
      const fine = roll(hole, FRAME / 4);
      const fineSteps = fine.slice(1).map((spot, index) => apart(spot, fine[index]));
      expect(Math.max(...fineSteps)).toBeLessThan(0.14 / 4 + 0.001);
      // It only ever sinks further into its hole, and smoothly.
      const sinking = frames.slice(1).map((spot, index) => spot.sunk - frames[index].sunk);
      expect(Math.min(...sinking)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...sinking)).toBeLessThan(0.1);
    }
  });

  it('never rolls back up the bowl', () => {
    for (const hole of holes) {
      const frames = roll(hole, FRAME / 4);
      const rises = frames.slice(1).map((spot, index) => fromCentre(spot) - fromCentre(frames[index]));
      expect(Math.max(...rises)).toBeLessThan(1e-9);
      expect(fromCentre(frames[0])).toBeCloseTo(BOWL_SHAPE.rim, 12);
      expect(fromCentre(frames[frames.length - 1])).toBeCloseTo(BOWL_SHAPE.ring, 12);
    }
  });

  it('circles under the rim, spirals in and goes round the holes before it drops', () => {
    for (const hole of holes) {
      const frames = roll(hole);
      // Turns clockwise, added up frame by frame.
      let turned = 0;
      let backwards = 0;
      frames.slice(1).forEach((spot, index) => {
        const before = frames[index];
        const angle = Math.atan2(before.x * spot.y - before.y * spot.x, before.x * spot.x + before.y * spot.y);
        if (angle < -1e-9) backwards++;
        turned += angle / (2 * Math.PI);
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
        return frames.slice(from + 1, from + 61).reduce((sum, spot, index) => sum + apart(spot, frames[from + index]), 0);
      };
      for (let second = 1; second < 6; second++) expect(ground(second)).toBeLessThan(ground(second - 1));
    }
  });

  it('hesitates on the lip of each hole it passes, without going in', () => {
    for (const hole of holes) {
      const frames = roll(hole, FRAME / 4);
      const among = frames.filter((spot) => spot.sunk === 0 && fromCentre(spot) < BOWL_SHAPE.ring + BOWL_SHAPE.lip + 1e-6);
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

  it('comes to rest on the lip of its hole, tips in and stays exactly there', () => {
    for (const hole of holes) {
      const home = holeSpot(hole);
      // Just before it tips it is on the lip, radially outside its hole and all but still.
      const tip = ballTipsAt();
      expect(tip).toBeGreaterThan(T - 0.6);
      expect(tip).toBeLessThan(T - 0.2);
      const edge = bowlBall(tip - 0.001, hole);
      expect(edge.sunk).toBe(0);
      expect(apart(edge, home)).toBeCloseTo(BOWL_SHAPE.lip, 3);
      expect(apart(edge, bowlBall(tip - 0.001 - FRAME, hole))).toBeLessThan(0.001);
      // Half way through the fall it is part of the way in.
      const falling = bowlBall((tip + T) / 2, hole);
      expect(falling.sunk).toBeGreaterThan(0);
      expect(falling.sunk).toBeLessThan(1);
      expect(apart(falling, home)).toBeLessThan(BOWL_SHAPE.lip);
      expect(apart(falling, home)).toBeGreaterThan(0);
      for (const later of [T, T + FRAME, T + 5, T * 100]) expect(bowlBall(later, hole)).toEqual({ x: home.x, y: home.y, sunk: 1 });
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
  });

  it('acts out the same roll over any length of time', () => {
    for (const hole of holes) {
      for (const share of [0, 0.13, 0.5, 0.8, 0.95, 0.99, 1]) {
        const usual = bowlBall(T * share, hole);
        const slow = bowlBall(20 * share, hole, 20);
        expect(apart(usual, slow)).toBeLessThan(1e-9);
        expect(slow.sunk).toBeCloseTo(usual.sunk, 9);
      }
    }
  });

  it('does not roll for a player who has asked for less motion', () => {
    const bowl: ActiveBowl = { hole: 1, elapsed: 3, duration: T, payout: -1 };
    // With motion it is wherever its roll has got to.
    expect(ballSpot(bowl, false)).toEqual(bowlBall(3, 1));
    expect(ballSpot({ ...bowl, duration: 13 }, false)).toEqual(bowlBall(3, 1, 13));
    // Without, it waits where it was let go, and is in its hole once it has dropped.
    for (const elapsed of [0, 3, T - 0.01]) expect(ballSpot({ ...bowl, elapsed }, true)).toEqual(bowlBall(0, 1));
    const dropped = { ...bowl, elapsed: T + 0.01, payout: 50 };
    expect(ballSpot(dropped, true)).toEqual({ ...holeSpot(1), sunk: 1 });
    expect(ballSpot(dropped, false)).toEqual({ ...holeSpot(1), sunk: 1 });
  });

  it('is drawn where it is, and smaller once it has sunk', () => {
    // In ems of the dish, which is 1em from its middle to its rim; the bowl the ball rolls in is a little smaller.
    expect(ballTransform({ x: 0, y: 0, sunk: 0 })).toBe('translate(0.000em, 0.000em) scale(1.000)');
    expect(ballTransform({ x: 1, y: -1, sunk: 0 })).toBe('translate(0.840em, -0.840em) scale(1.000)');
    expect(ballTransform({ x: -0.5, y: 0.25, sunk: 1 })).toBe('translate(-0.420em, 0.210em) scale(0.700)');
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

  it('describes the gates as the engine moves them', () => {
    const en = getStrings('en');
    const ja = getStrings('ja');
    // The field is 100 wide, so a distance across it is a percentage of its width.
    expect(FIELD.width).toBe(100);
    expect(en.partText.gates).toContain(`${SWEEP.amplitude}% of the width each way`);
    expect(en.partText.gates).toContain(`every ${SWEEP.period} seconds`);
    expect(ja.partText.gates).toContain(`幅の${SWEEP.amplitude}%ずつ`);
    expect(ja.partText.gates).toContain(`${SWEEP.period}秒で1往復`);
    expect(en.infoBody(MAX_STOCK).join(' ')).toContain('sweep from side to side');
    expect(ja.infoBody(MAX_STOCK).join(' ')).toContain('左右に動き続けて');
    // The calculator's note quotes the share of followed medals that come through a gate: exactly this, from the scatter.
    const through = 1 - (1 - CHECKERS.halfWidth / LANDING.scatter) ** 2;
    expect(en.calcNote(MAX_STOCK)).toContain(`about ${Math.round(through * 100)}% start a spin`);
    expect(ja.calcNote(MAX_STOCK)).toContain(`約${Math.round(through * 100)}%が抽選を始めます`);
    expect(en.calcNote(MAX_STOCK)).toContain(`about ${CALC_DEFAULT.front}% of medals leave by the front`);
    expect(ja.calcNote(MAX_STOCK)).toContain(`約${CALC_DEFAULT.front}%が手前から出て`);
    expect(CALC_DEFAULT.spins).toBe(Math.round(through * 100));
    expect(en.aimName.centre).toBe('Following the centre gate');
    expect(ja.aimName.centre).toBe('中央のチャッカーを追う');
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
    expect(html).toContain(`aria-label="0 of ${MAX_STOCK} spins held"`);
    expect(html).toContain('>DROP<');
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
    // What each line is worth: the board's average, the chests' average, the roulette's.
    for (const text of ['8.8 medals', '20 medals', '63.7 medals']) expect(html).toContain(text);
    // The roulette: four crosses in twelve, and the chance of each number of pockets in a row.
    for (const text of ['A cross: the run ends', 'A tower of 50 medals', '33.3%', '25.0%', '8.3%', 'Medals thrown onto the field']) expect(html).toContain(text);
    expect(html).toContain('4 numbers in a row start the jackpot challenge');
    const chain = table(html, 'pusher-chain-table');
    expect(chain.match(/<td[^>]*>[^<]*</g)?.map((cell) => cell.replace(/<td[^>]*>/, '').slice(0, -1))).toEqual(['66.7%', '44.4%', '29.6%', '19.8%']);
    expect(chain.match(/<th scope="col"/g)).toHaveLength(4);
    // The bowl a full run ends in: three holes, each one time in three.
    const bowl = table(html, 'pusher-bowl-table');
    expect(bowl.match(/<tr data-hole="[a-z0-9]+"/g)).toEqual(['<tr data-hole="jackpot"', '<tr data-hole="50"', '<tr data-hole="100"']);
    expect(bowl.match(/33\.3%/g)).toHaveLength(3);
    const holes = ['The jackpot', '12 towers on the pusher when it stands at 300', '50 medals', '2 towers on the pusher', '100 medals', '4 towers on the pusher'];
    for (const text of holes) expect(bowl).toContain(text);
    expect(html).toContain('The jackpot challenge is a bowl with 3 holes.');
    expect(html).toContain('With the jackpot at 300 medals the bowl pays 150 medals on average');
    expect(html).toContain('About 19.8% of all balls get this far.');
    expect(html).toContain('One ball in 15.2 wins it, and one spin in 2,170 leads to it');
    expect(html).toContain('One tower on the pusher');
    expect(html).toContain('the average of the board: 8.75 medals');
    expect(html).toContain(`after ${BOARD_ROLLS} rolls from the start, no square is more than ${percent(boardSpread(BOARD_ROLLS))} away`);
    expect(html).toContain('1.096 medals');
    expect(html).toContain('1,000 medals');
    const expected = percent(returnFor(CALC_DEFAULT.front / 100, CALC_DEFAULT.spins / 100, spinValue(JACKPOT_START)));
    expect(html).toMatch(new RegExp(`data-testid="pusher-calc-return"[^>]*>${expected.replace('.', '\\.')}<`));
    // Slot, reach, board, chests, roulette, run, bowl and what a spin is worth.
    expect(html.match(/<caption/g)).toHaveLength(8);
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

  it('explains the jackpot challenge in Japanese', () => {
    const html = render(<OddsTab />, 'ja');
    expect(html).toContain('数字が4回続くとジャックポットチャレンジが始まります');
    expect(html).toContain('クルーン');
    expect(html).toContain('300枚のとき、プッシャーの上にタワー12本');
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
    hole: -1,
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

  it('puts the bowl up for the jackpot challenge, the ball where it is let go', () => {
    const html = show({ ...idle, mode: 'bowl', level: 4, total: 60 });
    expect(html).toContain('data-mode="bowl"');
    expect(html).toContain('JACKPOT CHALLENGE');
    expect(html).not.toContain('JACKPOT CHANCE');
    expect(html).not.toContain('pusher-wheel');
    expect(html).toContain('data-testid="pusher-bowl" data-landed="-1"');
    // A hole for each prize, labelled, and none of them taken yet.
    expect(html.match(/<g data-hole="\d" data-in="(true|false)"/g)).toHaveLength(BOWL.length);
    expect(html).not.toContain('data-in="true"');
    for (const label of ['JACKPOT', '50', '100']) expect(html).toContain(`>${label}</span>`);
    expect(html.match(/class="[^"]*holeSign[^"]*"/g)).toHaveLength(BOWL.length);
    // The ball waits where the cabinet will pick it up.
    expect(html).toContain(`transform:${ballTransform(bowlBall(0, 0))}" data-testid="pusher-bowl-ball"`);
    // The run that got here is still beside it.
    expect(html).toContain('LEVEL 4 / 4');
    expect(html).toContain('TOWER 60');
    expect(html).toContain('data-hidden="true"');
    expect(show({ ...idle, mode: 'bowl', level: 4, total: 60 }, 0, 'ja')).toContain('ジャックポットチャレンジ');
  });

  it('lights the hole the ball dropped into and says what it paid', () => {
    const medals = show({ ...idle, mode: 'bowl', level: 4, total: 160, hole: 2, banner: 'towers', amount: 100 });
    expect(medals).toContain('data-landed="2"');
    expect(medals.match(/data-in="true"/g)).toHaveLength(1);
    expect(medals).toContain('<g data-hole="2" data-in="true"');
    expect(medals).toContain('TOWER +100');
    expect(medals).toContain('TOWER 160');
    const jackpot = show({ ...idle, mode: 'bowl', level: 4, total: 372, hole: 0, banner: 'jackpot', amount: 312 });
    expect(jackpot).toContain('<g data-hole="0" data-in="true"');
    expect(jackpot).toContain('data-banner="jackpot"');
    expect(jackpot).toContain('JACKPOT! +312');
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
    expect(screenState(session, false)).toMatchObject({ mode: 'roulette', lit: 0, banner: 'none', level: 0, total: 0, hole: -1 });
    expect(screenState(session, true).lit).toBe(-1);
    // A number: the tower goes up and the run goes on.
    Object.assign(run, { landed: true, level: 1, total: 30, gain: 30 });
    expect(screenState(session, false)).toMatchObject({ lit: 3, banner: 'towers', amount: 30, level: 1, total: 30 });
    // A cross: the total the run built.
    Object.assign(run, { pocket: 4, from: 3, landed: true, gain: 0, over: true });
    expect(screenState(session, false)).toMatchObject({ lit: 4, banner: 'finish', amount: 30, level: 1 });
  });

  it('follows the ball from the last number of a full run to its hole', () => {
    const session = createSession(1, { balls: 0 });
    const bowl: ActiveBowl = { hole: 2, elapsed: 0, duration: TIMING.bowl, payout: -1 };
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
    expect(screenState(session, false)).toMatchObject({ mode: 'roulette', lit: 1, banner: 'towers', amount: 10, level: 4, total: 60 });
    // Then the bowl takes the wheel's place. Where the ball will drop is not on the screen until it has.
    run.bowl = bowl;
    for (const elapsed of [0, 3, TIMING.bowl - 0.01]) {
      bowl.elapsed = elapsed;
      expect(screenState(session, false)).toMatchObject({ mode: 'bowl', banner: 'none', hole: -1, lit: -1, level: 4, total: 60 });
      // The ball is moved by the cabinet, so the screen is the same with or without motion.
      expect(sameScreen(screenState(session, true), screenState(session, false))).toBe(true);
    }
    // A hundred medals: more towers.
    Object.assign(bowl, { elapsed: TIMING.bowl, payout: 100 });
    Object.assign(run, { gain: 100, total: 160, over: true });
    expect(screenState(session, false)).toMatchObject({ mode: 'bowl', hole: 2, banner: 'towers', amount: 100, total: 160, lit: -1 });
    expect(screenState(session, true)).toMatchObject({ mode: 'bowl', hole: 2, banner: 'towers', amount: 100 });
    // The jackpot's hole.
    Object.assign(bowl, { hole: 0, payout: 312 });
    Object.assign(run, { gain: 312, total: 372, jackpot: true });
    expect(screenState(session, false)).toMatchObject({ mode: 'bowl', hole: 0, banner: 'jackpot', amount: 312, total: 372 });
  });

  it('knows when nothing on the screen has changed', () => {
    const session = createSession(1, { balls: 0 });
    const a = screenState(session, false);
    expect(sameScreen(a, screenState(session, false))).toBe(true);
    expect(sameScreen(a, { ...a, square: 1 })).toBe(false);
    expect(sameScreen(a, { ...a, die: 2 })).toBe(false);
    expect(sameScreen(a, { ...a, hole: 1 })).toBe(false);
    expect(sameScreen({ ...a, mode: 'bowl' }, { ...a, mode: 'roulette' })).toBe(false);
    const chests = [{ state: 'closed' as const, prize: null, chosen: false }];
    expect(sameScreen({ ...a, chests }, { ...a, chests: [{ ...chests[0] }] })).toBe(true);
    expect(sameScreen({ ...a, chests }, { ...a, chests: [{ ...chests[0], state: 'picked' }] })).toBe(false);
    expect(sameScreen({ ...a, chests }, a)).toBe(false);
  });
});
