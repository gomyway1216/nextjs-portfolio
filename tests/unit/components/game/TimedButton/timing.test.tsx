/**
 * Timed Button — early/late timing and the post-run review (static markup; the repo has no jsdom).
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  DIFFICULTY_ORDER,
  DIFFICULTY_TUNING,
  TENDENCY_THRESHOLD_MS,
  markerDirection,
  markerPosition,
  recordRound,
  scoreRound,
  summarizeTiming,
  timingOffsetMs,
  timingSide,
} from '@/components/game/TimedButton/gameLogic';
import { getTimedButtonCopy } from '@/components/game/TimedButton/i18n';
import { TimingReview, timingText } from '@/components/game/TimedButton/TimingReview';

describe('markerDirection', () => {
  it('is +1 on the way right and -1 on the way back', () => {
    expect(markerDirection(0, 1000)).toBe(1);
    expect(markerDirection(499, 1000)).toBe(1);
    expect(markerDirection(500, 1000)).toBe(-1);
    expect(markerDirection(999, 1000)).toBe(-1);
    expect(markerDirection(1000, 1000)).toBe(1);
    expect(markerDirection(1750, 1000)).toBe(-1);
  });

  it('falls back to +1 for a non-positive period', () => {
    expect(markerDirection(300, 0)).toBe(1);
  });
});

describe('timingOffsetMs', () => {
  const period = 2000; // the marker crosses the whole track in 1000 ms

  it('is negative before the centre and positive after it, moving right', () => {
    // Centre 0.4 is crossed at t = 400 on the first pass.
    expect(timingOffsetMs(400, 0.4, period)).toBe(0);
    expect(timingOffsetMs(370, 0.4, period)).toBeCloseTo(-30);
    expect(timingOffsetMs(455, 0.4, period)).toBeCloseTo(55);
  });

  it('flips with the direction of travel on the way back', () => {
    // On the return pass the centre 0.4 is crossed at t = 1600.
    expect(timingOffsetMs(1600, 0.4, period)).toBeCloseTo(0);
    expect(timingOffsetMs(1580, 0.4, period)).toBeCloseTo(-20); // still right of the centre: early
    expect(timingOffsetMs(1640, 0.4, period)).toBeCloseTo(40); // already left of it: late
  });

  it('measures against the upcoming crossing right after a bounce', () => {
    // Centre 0.9: crossed at 900, wall at 1000, crossed again at 1100.
    expect(timingOffsetMs(990, 0.9, period)).toBeCloseTo(90);
    expect(timingOffsetMs(1010, 0.9, period)).toBeCloseTo(-90);
  });

  it('always measures the crossing nearest in time, for any tap', () => {
    for (const center of [0.12, 0.5, 0.88]) {
      for (let t = 0; t < 3 * period; t += 13) {
        // Brute force: scan nearby instants for the closest centre crossing.
        let nearest = Number.POSITIVE_INFINITY;
        for (let k = -2; k <= 4; k++) {
          for (const crossing of [center * 1000 + k * period, (2 - center) * 1000 + k * period]) {
            if (Math.abs(t - crossing) < Math.abs(nearest)) nearest = t - crossing;
          }
        }
        const offset = timingOffsetMs(t, center, period);
        // At a wall both crossings are equally near, so compare the size and
        // check separately that the sign points at a real crossing.
        expect(Math.abs(offset)).toBeCloseTo(Math.abs(nearest), 6);
        expect(markerPosition(t - offset, period)).toBeCloseTo(center, 6);
      }
    }
  });

  it('agrees with the scored distance on every difficulty', () => {
    for (const diff of DIFFICULTY_ORDER) {
      const tuning = DIFFICULTY_TUNING[diff];
      for (let t = 0; t < tuning.periodMs * 2; t += 17) {
        const record = recordRound(t, 0.37, tuning);
        expect(Math.abs(record.offsetMs)).toBeCloseTo((record.distance * tuning.periodMs) / 2, 6);
      }
    }
  });

  it('never returns negative zero', () => {
    expect(Object.is(timingOffsetMs(1600, 0.4, period), -0)).toBe(false);
    expect(Object.is(timingOffsetMs(500, 0.5, 0), 0)).toBe(true);
  });
});

describe('recordRound', () => {
  it('scores exactly like scoreRound and keeps where the marker stopped', () => {
    const tuning = DIFFICULTY_TUNING.hard;
    const record = recordRound(410, 0.5, tuning);
    const markerPos = markerPosition(410, tuning.periodMs);
    expect(record).toMatchObject(scoreRound(markerPos, 0.5, tuning));
    expect(record.markerPos).toBe(markerPos);
    expect(record.targetCenter).toBe(0.5);
    expect(record.offsetMs).toBeCloseTo(410 - 375);
  });
});

describe('timingSide', () => {
  it('classifies at whole-millisecond resolution', () => {
    expect(timingSide(-0.6)).toBe('early');
    expect(timingSide(-0.4)).toBe('onTime');
    expect(timingSide(0)).toBe('onTime');
    expect(timingSide(0.49)).toBe('onTime');
    expect(timingSide(0.5)).toBe('late');
    expect(timingSide(120)).toBe('late');
  });
});

describe('summarizeTiming', () => {
  it('returns a neutral summary for an empty run', () => {
    expect(summarizeTiming([])).toEqual({
      taps: 0,
      early: 0,
      late: 0,
      onTime: 0,
      medianOffsetMs: 0,
      tendency: 'onTime',
    });
  });

  it('counts sides and takes the median, so one wild miss does not set the lean', () => {
    const summary = summarizeTiming([-30, -22, -18, 0.2, 640]);
    expect(summary).toMatchObject({ taps: 5, early: 3, late: 1, onTime: 1, tendency: 'early' });
    expect(summary.medianOffsetMs).toBe(-18);
  });

  it('averages the two middle taps for an even count', () => {
    const summary = summarizeTiming([40, 10, 30, 20]);
    expect(summary.medianOffsetMs).toBe(25);
    expect(summary.tendency).toBe('late');
  });

  it('reports no lean when the median is inside the threshold', () => {
    expect(summarizeTiming([-50, TENDENCY_THRESHOLD_MS - 0.01, 60]).tendency).toBe('onTime');
    expect(summarizeTiming([-50, TENDENCY_THRESHOLD_MS, 60]).tendency).toBe('late');
    expect(summarizeTiming([-50, -TENDENCY_THRESHOLD_MS, 60]).tendency).toBe('early');
  });
});

describe('timingText', () => {
  const en = getTimedButtonCopy('en');
  const ja = getTimedButtonCopy('ja');

  it('never shows a zero-millisecond early or late', () => {
    expect(timingText(0.3, en)).toBe('Dead on');
    expect(timingText(-0.3, en)).toBe('Dead on');
    expect(timingText(0.5, en)).toBe('1 ms late');
    expect(timingText(-23.6, en)).toBe('24 ms early');
  });

  it('is localized', () => {
    expect(timingText(31, ja)).toBe('31ミリ秒遅い');
    expect(timingText(-31, ja)).toBe('31ミリ秒早い');
    expect(timingText(0, ja)).toBe('ぴったり');
  });
});

describe('TimingReview', () => {
  const tuning = DIFFICULTY_TUNING.medium; // period 2000 ms: 1000 ms per pass
  // Target centre 0.5 is crossed at t = 500 (and 1500 on the way back).
  const lateRun = [512, 530, 1541, 524, 900].map((t) => recordRound(t, 0.5, tuning));

  const render = (records: typeof lateRun, language: 'en' | 'ja' = 'en') =>
    renderToStaticMarkup(
      <TimingReview
        records={records}
        targetHalfWidth={tuning.targetHalfWidth}
        copy={getTimedButtonCopy(language)}
      />
    );

  it('renders nothing for an empty run', () => {
    expect(render([])).toBe('');
  });

  it('lists every round with its rating, timing and score', () => {
    const html = render(lateRun);
    expect(html.match(/<li/g)).toHaveLength(5);
    expect(html).toContain('12 ms late');
    expect(html).toContain('30 ms late');
    expect(html).toContain('41 ms late');
    expect(html).toContain('24 ms late');
    expect(html).toContain('400 ms late');
    for (const record of lateRun) expect(html).toContain(`+${record.score}`);
    expect(lateRun[4].rating).toBe('miss');
    expect(html).toContain('Miss');
    expect(html).toContain('Round 5');
  });

  it('states the median lean and the early/late counts', () => {
    const html = render(lateRun);
    expect(html).toContain('data-tendency="late"');
    expect(html).toContain('about 30 ms late');
    expect(html).toContain('0 early · 5 late');
    expect(html).toContain('median of your 5 taps');
  });

  it('reports an early lean and a balanced run', () => {
    const early = [470, 480, 1460].map((t) => recordRound(t, 0.5, tuning));
    expect(render(early)).toContain('about 30 ms early');

    const balanced = [496, 500, 506].map((t) => recordRound(t, 0.5, tuning));
    const html = render(balanced);
    expect(html).toContain('data-tendency="onTime"');
    expect(html).toContain(`within ${TENDENCY_THRESHOLD_MS} ms`);
    expect(html).toContain('1 early · 1 late · 1 dead on');
  });

  it('places the marker and the zone on the mini track', () => {
    const html = render([recordRound(530, 0.5, tuning)]);
    // Marker stopped at 0.53; zone spans centre ± half-width.
    expect(html).toMatch(/left:53%/);
    expect(html).toMatch(/left:41%;width:18%/);
  });

  it('is fully localized in Japanese', () => {
    const html = render(lateRun, 'ja');
    expect(html).toContain('タイミングの振り返り');
    expect(html).toContain('約30ミリ秒遅く押す傾向');
    expect(html).toContain('早い 0回・遅い 5回');
    expect(html).toContain('ラウンド5');
    expect(html).toContain('400ミリ秒遅い');
    expect(html.replace(/<[^>]*>/g, ' ')).not.toMatch(/[A-Za-z]/);
  });
});
