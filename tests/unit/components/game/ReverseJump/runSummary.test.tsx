import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RunSummaryPanel } from '@/components/game/ReverseJump/RunSummaryPanel';
import {
  advanceRunStats,
  createRunStats,
  DIFFICULTY_CONFIG,
  ObstacleType,
  Pose,
  poseOf,
  recordCleared,
  RunSummary,
  speedForScore,
  summarizeRun,
  tenthsOfSecond,
  WORLD,
} from '@/components/game/ReverseJump/gameLogic';
import { getReverseJumpCopy } from '@/components/game/ReverseJump/i18n';

const TYPES: ObstacleType[] = ['low', 'high'];
const POSES: Pose[] = ['standing', 'ducking', 'airborne'];
const LANGUAGES = ['en', 'ja'] as const;

const summary = (overrides: Partial<RunSummary['hit']> = {}): RunSummary => ({
  difficulty: 'hard',
  score: 17,
  elapsedMs: 23456,
  lowCleared: 10,
  highCleared: 7,
  flips: 3,
  topSpeedRatio: 1.178,
  hit: { type: 'low', pose: 'ducking', mode: 'inverted', msSinceFlip: 840, ...overrides },
});

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('ReverseJump run stats', () => {
  it('poseOf reports the pose the collision box was built from', () => {
    expect(poseOf(WORLD.groundY, false)).toBe('standing');
    expect(poseOf(WORLD.groundY, true)).toBe('ducking');
    expect(poseOf(WORLD.groundY - 1, false)).toBe('airborne');
  });

  it('keeps the since-flip clock empty until the first flip, then restarts it on every flip', () => {
    const stats = createRunStats();
    advanceRunStats(stats, 16, false, 320);
    advanceRunStats(stats, 16, false, 320);
    expect(stats.msSinceFlip).toBeNull();
    expect(stats.flips).toBe(0);

    advanceRunStats(stats, 16, true, 320);
    expect(stats.msSinceFlip).toBe(0);
    advanceRunStats(stats, 16, false, 320);
    advanceRunStats(stats, 16, false, 320);
    expect(stats.msSinceFlip).toBe(32);

    advanceRunStats(stats, 16, true, 320);
    expect(stats.msSinceFlip).toBe(0);
    expect(stats.flips).toBe(2);
    expect(stats.elapsedMs).toBe(96);
  });

  it('measures the same run time whatever the frame rate', () => {
    const at = (fps: number) => {
      const stats = createRunStats();
      for (let i = 0; i < fps * 3; i++) advanceRunStats(stats, 1000 / fps, false, 320);
      return stats.elapsedMs;
    };
    expect(at(30)).toBeCloseTo(3000, 6);
    expect(at(60)).toBeCloseTo(3000, 6);
    expect(at(144)).toBeCloseTo(3000, 6);
  });

  it('remembers the fastest speed seen and counts cleared obstacles by type', () => {
    const stats = createRunStats();
    advanceRunStats(stats, 16, false, 400);
    advanceRunStats(stats, 16, false, 380);
    recordCleared(stats, 'low');
    recordCleared(stats, 'low');
    recordCleared(stats, 'high');
    expect(stats).toMatchObject({ topSpeed: 400, lowCleared: 2, highCleared: 1 });
  });

  it('summarizes a run: score is the obstacles cleared, speed is relative to the starting speed', () => {
    const cfg = DIFFICULTY_CONFIG.hard;
    const stats = createRunStats();
    for (let i = 0; i < 5; i++) recordCleared(stats, i % 2 === 0 ? 'low' : 'high');
    advanceRunStats(stats, 20, true, speedForScore(5, cfg));
    advanceRunStats(stats, 20, false, speedForScore(5, cfg));

    const result = summarizeRun(stats, 'hard', {
      type: 'high',
      playerY: WORLD.groundY - 40,
      ducking: false,
      mode: 'inverted',
    });
    expect(result).toEqual({
      difficulty: 'hard',
      score: 5,
      elapsedMs: 40,
      lowCleared: 3,
      highCleared: 2,
      flips: 1,
      topSpeedRatio: (cfg.baseSpeed + 5 * cfg.speedPerScore) / cfg.baseSpeed,
      hit: { type: 'high', pose: 'airborne', mode: 'inverted', msSinceFlip: 20 },
    });
  });

  it('never reports a top speed below the starting speed', () => {
    const result = summarizeRun(createRunStats(), 'easy', {
      type: 'low',
      playerY: WORLD.groundY,
      ducking: false,
      mode: 'normal',
    });
    expect(result.topSpeedRatio).toBe(1);
    expect(result.hit).toEqual({ type: 'low', pose: 'standing', mode: 'normal', msSinceFlip: null });
  });

  it('tenthsOfSecond rounds down to a whole tenth', () => {
    expect(tenthsOfSecond(99)).toBe(0);
    expect(tenthsOfSecond(100)).toBe(0.1);
    expect(tenthsOfSecond(349)).toBe(0.3);
    expect(tenthsOfSecond(23456)).toBe(23.4);
    expect(tenthsOfSecond(-5)).toBe(0);
  });
});

describe('ReverseJump copy for the run summary', () => {
  it.each(LANGUAGES)('%s: every obstacle / pose pair has its own sentence', (language) => {
    const copy = getReverseJumpCopy(language);
    const lines = TYPES.flatMap((type) => POSES.map((pose) => copy.hit[type][pose]));
    expect(lines.every((line) => line.trim().length > 0)).toBe(true);
    expect(new Set(lines).size).toBe(6);
  });

  it('Japanese sentences are not left in English', () => {
    const ja = getReverseJumpCopy('ja');
    const lines = [
      ja.lastRun,
      ja.lastRunEmpty,
      ...TYPES.flatMap((type) => POSES.map((pose) => ja.hit[type][pose])),
      ja.flipNone(ja.modeNormal),
      ja.flipJust(ja.modeInverted),
      ja.flipAgo(ja.modeInverted, '1.2'),
      ja.statTime,
      ja.statLow,
      ja.statHigh,
      ja.statFlips,
      ja.statTopSpeed,
      ja.runSeconds('1.2'),
    ];
    for (const line of lines) expect(line).not.toMatch(/[A-Za-z]{3,}/);
  });
});

describe('RunSummaryPanel', () => {
  it.each(LANGUAGES)('%s: says what the runner hit, in which pose, and how long after the flip', (language) => {
    const copy = getReverseJumpCopy(language);
    const shown = text(renderToStaticMarkup(<RunSummaryPanel summary={summary()} copy={copy} />));
    expect(shown).toContain(copy.hit.low.ducking);
    expect(shown).toContain(copy.flipAgo(copy.modeInverted, '0.8'));
    expect(shown).toContain(copy.hard);
    expect(shown).toContain(copy.runSeconds('23.4'));
    expect(shown).toContain('×1.18');
    expect(shown).toContain(`${copy.statLow} 10`);
    expect(shown).toContain(`${copy.statHigh} 7`);
    expect(shown).toContain(`${copy.statFlips} 3`);
    expect(shown).toContain(`${copy.score} 17`);
  });

  it('says so when the controls never flipped', () => {
    const copy = getReverseJumpCopy('en');
    const shown = text(
      renderToStaticMarkup(
        <RunSummaryPanel summary={summary({ mode: 'normal', msSinceFlip: null })} copy={copy} />,
      ),
    );
    expect(shown).toContain(copy.flipNone(copy.modeNormal));
  });

  it('does not print "0.0s earlier" for a flip in the last tenth of a second', () => {
    const copy = getReverseJumpCopy('en');
    const shown = text(
      renderToStaticMarkup(<RunSummaryPanel summary={summary({ msSinceFlip: 99 })} copy={copy} />),
    );
    expect(shown).toContain(copy.flipJust(copy.modeInverted));
    expect(shown).not.toContain('0.0');
  });

  it.each(LANGUAGES)('%s: renders the same rows before the first run, so the panel keeps its height', (language) => {
    const copy = getReverseJumpCopy(language);
    const empty = renderToStaticMarkup(<RunSummaryPanel summary={null} copy={copy} />);
    const filled = renderToStaticMarkup(<RunSummaryPanel summary={summary()} copy={copy} />);
    const shape = (html: string) => (html.match(/<(p|dt|dd|h2|span)\b/g) ?? []).join('');
    expect(shape(empty)).toBe(shape(filled));
    expect(text(empty)).toContain(copy.lastRunEmpty);
    expect((empty.match(/<dd[^>]*>–<\/dd>/g) ?? []).length).toBe(6);
  });

  it('reserves two wrapped lines per sentence on narrow screens', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/components/game/ReverseJump/ReverseJump.module.css'),
      'utf8',
    );
    const narrow = css.slice(css.indexOf('@media (max-width: 640px)'));
    expect(narrow).toMatch(/\.runLine\s*\{[^}]*min-height:\s*calc\(2 \* 1\.45em\)/);
    // 320px viewport: 16px gutters, 1px borders, 0.75rem panel padding.
    const contentPx = 320 - 32 - 2 - 24;
    const fontPx = 0.85 * 16;
    const perLine = Math.floor(contentPx / fontPx);
    const ja = getReverseJumpCopy('ja');
    const longest = [
      ja.lastRunEmpty,
      ...TYPES.flatMap((type) => POSES.map((pose) => ja.hit[type][pose])),
      ja.flipNone(ja.modeNormal),
      ja.flipJust(ja.modeNormal),
      ja.flipAgo(ja.modeNormal, '999.9'),
    ].reduce((max, line) => Math.max(max, line.length), 0);
    expect(longest).toBeLessThanOrEqual(perLine * 2);
  });
});
