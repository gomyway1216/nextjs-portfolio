import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyChaos,
  createGameState,
  DIFFICULTY_CONFIG,
  HEIGHT,
  launch,
  step,
  type StepInput,
  WIDTH,
} from '@/components/game/ChaosBreakout/engine';
import { getStrings } from '@/components/game/ChaosBreakout/i18n';
import {
  createRecordsStore,
  EMPTY_BOOK,
  formatDuration,
  parseBook,
  RECORDS_KEY,
  recordRun,
  runResult,
} from '@/components/game/ChaosBreakout/records';
import { RunSummary } from '@/components/game/ChaosBreakout/RunSummary';

const idleInput: StepInput = { pointerX: null, left: false, right: false };

const fakeStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  const counts = { reads: 0 };
  return {
    counts,
    getItem: (key: string) => {
      counts.reads += 1;
      return data.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};

describe('run stats in the engine', () => {
  const playing = () => {
    const s = createGameState('medium', () => 0.5);
    launch(s);
    return s;
  };

  it('starts every run from zero', () => {
    expect(createGameState('hard').stats).toEqual({
      bricksBroken: 0,
      maxCombo: 0,
      chaosPulses: 0,
      frames: 0,
    });
  });

  it('counts destroyed bricks and the longest combo, not chipped ones', () => {
    const s = playing();
    const [first, second, tough] = s.bricks;
    tough.hp = 2;
    tough.maxHp = 2;
    // A fourth brick out of reach keeps the stage from clearing.
    s.bricks = [first, second, tough, { ...first, y: 300 }];
    const aimAt = (brick: typeof first) => {
      s.balls[0] = {
        x: brick.x + brick.width / 2,
        y: brick.y + brick.height + 2,
        vx: 0,
        vy: -4,
        r: 8,
      };
    };

    aimAt(first);
    step(s, idleInput, 'medium', () => 0.5);
    aimAt(second);
    step(s, idleInput, 'medium', () => 0.5);
    expect(s.stats.bricksBroken).toBe(2);
    expect(s.stats.maxCombo).toBe(2);

    aimAt(tough);
    step(s, idleInput, 'medium', () => 0.5);
    expect(tough.hp).toBe(1);
    expect(s.stats.bricksBroken).toBe(2);
    expect(s.stats.maxCombo).toBe(2);
  });

  it('keeps the longest combo after the live combo resets', () => {
    const s = playing();
    s.combo = 4;
    s.comboTimer = 1;
    s.stats.maxCombo = 4;
    step(s, idleInput, 'medium', () => 0.5);
    expect(s.combo).toBe(0);
    expect(s.stats.maxCombo).toBe(4);
  });

  it('counts chaos pulses', () => {
    const s = playing();
    applyChaos(s, DIFFICULTY_CONFIG.medium, () => 0);
    applyChaos(s, DIFFICULTY_CONFIG.medium, () => 0.6);
    expect(s.stats.chaosPulses).toBe(2);
  });

  it('measures play time in sim frames, the same at 60Hz and 120Hz', () => {
    const at60 = playing();
    const at120 = playing();
    for (let i = 0; i < 30; i += 1) step(at60, idleInput, 'medium', () => 0.5, 1);
    for (let i = 0; i < 60; i += 1) step(at120, idleInput, 'medium', () => 0.5, 0.5);
    expect(at60.stats.frames).toBe(30);
    expect(at120.stats.frames).toBe(30);
  });

  it('does not count time before launch or after game over', () => {
    const s = createGameState('master', () => 0.5);
    step(s, idleInput, 'master', () => 0.5);
    expect(s.stats.frames).toBe(0);
    launch(s);
    s.lives = 1;
    s.balls = [{ x: WIDTH / 2, y: HEIGHT + 50, vx: 0, vy: 6, r: 8 }];
    step(s, idleInput, 'master', () => 0.5);
    expect(s.status).toBe('gameover');
    step(s, idleInput, 'master', () => 0.5);
    expect(s.stats.frames).toBe(1);
  });

  it('runResult reads the finished state', () => {
    const s = playing();
    s.score = 420;
    s.stage = 3;
    s.stats = { bricksBroken: 31, maxCombo: 7, chaosPulses: 5, frames: 3725 };
    expect(runResult(s)).toEqual({
      score: 420,
      stage: 3,
      combo: 7,
      bricks: 31,
      pulses: 5,
      frames: 3725,
    });
  });
});

describe('parseBook', () => {
  it('returns the empty book for missing or broken data', () => {
    expect(parseBook(null)).toBe(EMPTY_BOOK);
    expect(parseBook('')).toBe(EMPTY_BOOK);
    expect(parseBook('{not json')).toBe(EMPTY_BOOK);
    expect(parseBook('null')).toBe(EMPTY_BOOK);
    expect(parseBook('42')).toBe(EMPTY_BOOK);
  });

  it('keeps well-formed records and drops malformed or unknown ones', () => {
    const raw = JSON.stringify({
      easy: { score: 120, stage: 2, combo: 5 },
      medium: { score: -1, stage: 2, combo: 5 },
      hard: { score: '900', stage: 2, combo: 5 },
      expert: { score: 10.5, stage: 1, combo: 1 },
      master: { score: 10, stage: 1 },
      nightmare: { score: 1, stage: 1, combo: 1 },
    });
    expect(parseBook(raw)).toEqual({ easy: { score: 120, stage: 2, combo: 5 } });
  });
});

describe('recordRun', () => {
  it('a first run sets the record but only flags figures above a fresh start', () => {
    const { book, improved } = recordRun({}, 'hard', { score: 0, stage: 1, combo: 0 });
    expect(book.hard).toEqual({ score: 0, stage: 1, combo: 0 });
    expect(improved).toEqual({ score: false, stage: false, combo: false });

    const next = recordRun({}, 'hard', { score: 50, stage: 1, combo: 3 });
    expect(next.book.hard).toEqual({ score: 50, stage: 1, combo: 3 });
    expect(next.improved).toEqual({ score: true, stage: false, combo: true });
  });

  it('keeps each best separately and never lowers one', () => {
    const start = { hard: { score: 500, stage: 4, combo: 6 } };
    const { book, improved } = recordRun(start, 'hard', { score: 300, stage: 5, combo: 6 });
    expect(book.hard).toEqual({ score: 500, stage: 5, combo: 6 });
    expect(improved).toEqual({ score: false, stage: true, combo: false });
    expect(start.hard).toEqual({ score: 500, stage: 4, combo: 6 });
  });

  it('leaves other difficulties alone', () => {
    const start = { easy: { score: 900, stage: 6, combo: 10 } };
    const { book } = recordRun(start, 'master', { score: 40, stage: 1, combo: 2 });
    expect(book.easy).toEqual(start.easy);
    expect(book.master).toEqual({ score: 40, stage: 1, combo: 2 });
  });
});

describe('formatDuration', () => {
  it('formats frames as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(59.9)).toBe('0:00');
    expect(formatDuration(60 * 9)).toBe('0:09');
    expect(formatDuration(60 * 75 + 30)).toBe('1:15');
    expect(formatDuration(60 * 60 * 12)).toBe('12:00');
  });
});

describe('records store', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves snapshots from its cache until another tab changes the book', () => {
    const tab = new EventTarget();
    vi.stubGlobal('window', tab);
    const storage = fakeStorage();
    const store = createRecordsStore(() => storage);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    const storageEvent = (key: string | null) => Object.assign(new Event('storage'), { key });

    expect(store.getSnapshot()).toBe(EMPTY_BOOK);
    store.getSnapshot();
    store.getSnapshot();
    expect(storage.counts.reads).toBe(1);

    storage.setItem(RECORDS_KEY, JSON.stringify({ hard: { score: 60, stage: 1, combo: 2 } }));
    tab.dispatchEvent(storageEvent('some-other-key'));
    expect(calls).toBe(0);
    expect(store.getSnapshot()).toBe(EMPTY_BOOK);

    tab.dispatchEvent(storageEvent(RECORDS_KEY));
    expect(calls).toBe(1);
    expect(store.getSnapshot()).toEqual({ hard: { score: 60, stage: 1, combo: 2 } });
    expect(storage.counts.reads).toBe(2);

    // A change made while nobody listened is picked up by the next subscriber.
    unsubscribe();
    storage.setItem(RECORDS_KEY, JSON.stringify({ hard: { score: 75, stage: 1, combo: 2 } }));
    tab.dispatchEvent(storageEvent(RECORDS_KEY));
    expect(calls).toBe(1);
    store.subscribe(() => {})();
    expect(store.getSnapshot().hard?.score).toBe(75);
  });

  it('reads the stored book and returns a stable snapshot', () => {
    const storage = fakeStorage({
      [RECORDS_KEY]: JSON.stringify({ easy: { score: 10, stage: 1, combo: 2 } }),
    });
    const store = createRecordsStore(() => storage);
    const first = store.getSnapshot();
    expect(first).toEqual({ easy: { score: 10, stage: 1, combo: 2 } });
    expect(store.getSnapshot()).toBe(first);
  });

  it('saves a run, notifies subscribers and reports what improved', () => {
    const storage = fakeStorage();
    const store = createRecordsStore(() => storage);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    const improved = store.saveRun('medium', { score: 200, stage: 2, combo: 4 });
    expect(improved).toEqual({ score: true, stage: true, combo: true });
    expect(calls).toBe(1);
    expect(store.getSnapshot().medium).toEqual({ score: 200, stage: 2, combo: 4 });
    expect(parseBook(storage.getItem(RECORDS_KEY))).toEqual(store.getSnapshot());
    unsubscribe();
    store.saveRun('medium', { score: 300, stage: 2, combo: 4 });
    expect(calls).toBe(1);
  });

  it('stores only the record fields of a full run result', () => {
    const storage = fakeStorage();
    const store = createRecordsStore(() => storage);
    const s = createGameState('easy', () => 0.5);
    s.score = 80;
    s.stats = { bricksBroken: 8, maxCombo: 3, chaosPulses: 1, frames: 900 };
    store.saveRun('easy', runResult(s));
    expect(JSON.parse(storage.getItem(RECORDS_KEY) ?? '')).toEqual({
      easy: { score: 80, stage: 1, combo: 3 },
    });
  });

  it('merges with a record another tab wrote since the last read', () => {
    const storage = fakeStorage();
    const store = createRecordsStore(() => storage);
    expect(store.getSnapshot()).toBe(EMPTY_BOOK);
    storage.setItem(
      RECORDS_KEY,
      JSON.stringify({
        medium: { score: 900, stage: 2, combo: 3 },
        easy: { score: 5, stage: 1, combo: 1 },
      }),
    );
    const improved = store.saveRun('medium', { score: 400, stage: 3, combo: 3 });
    expect(improved).toEqual({ score: false, stage: true, combo: false });
    expect(store.getSnapshot()).toEqual({
      medium: { score: 900, stage: 3, combo: 3 },
      easy: { score: 5, stage: 1, combo: 1 },
    });
  });

  it('keeps records in memory when storage is unavailable or throws', () => {
    const none = createRecordsStore(() => null);
    none.saveRun('easy', { score: 70, stage: 1, combo: 2 });
    expect(none.getSnapshot().easy).toEqual({ score: 70, stage: 1, combo: 2 });

    const broken = createRecordsStore(() => {
      throw new Error('denied');
    });
    expect(broken.getSnapshot()).toBe(EMPTY_BOOK);
    broken.saveRun('easy', { score: 70, stage: 1, combo: 2 });
    broken.saveRun('easy', { score: 90, stage: 1, combo: 2 });
    expect(broken.getSnapshot().easy).toEqual({ score: 90, stage: 1, combo: 2 });

    const quota = createRecordsStore(() => ({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    }));
    quota.saveRun('hard', { score: 30, stage: 1, combo: 2 });
    expect(quota.getSnapshot().hard).toEqual({ score: 30, stage: 1, combo: 2 });
  });
});

describe('RunSummary', () => {
  const run = { score: 1240, stage: 3, combo: 7, bricks: 88, pulses: 6, frames: 60 * 95 };

  it('shows the run, flags new records and quotes the standing one otherwise', () => {
    const html = renderToStaticMarkup(
      <RunSummary
        t={getStrings('en')}
        difficultyLabel="Hard"
        run={run}
        improved={{ score: true, stage: false, combo: false }}
        record={{ score: 1240, stage: 5, combo: 9 }}
      />,
    );
    expect(html).toContain('Run summary — Hard');
    expect(html).toContain('1,240');
    expect(html).toContain('x7');
    expect(html).toContain('1:35');
    expect(html.match(/New record!/g)).toHaveLength(1);
    expect(html).toContain('Record 5');
    expect(html).toContain('Record x9');
    expect(html).not.toContain('Record 1,240');
  });

  it('drops the flag once the stored record has moved past this run', () => {
    const html = renderToStaticMarkup(
      <RunSummary
        t={getStrings('en')}
        difficultyLabel="Hard"
        run={run}
        improved={{ score: true, stage: true, combo: false }}
        record={{ score: 2000, stage: 3, combo: 9 }}
      />,
    );
    expect(html.match(/New record!/g)).toHaveLength(1);
    expect(html).toContain('Record 2,000');
  });

  it('is fully localized in Japanese', () => {
    const html = renderToStaticMarkup(
      <RunSummary
        t={getStrings('ja')}
        difficultyLabel="ハード"
        run={run}
        improved={{ score: false, stage: true, combo: true }}
        record={{ score: 5000, stage: 3, combo: 7 }}
      />,
    );
    expect(html).toContain('今回の結果（ハード）');
    expect(html).toContain('自己ベスト 5,000');
    expect(html.match(/記録更新！/g)).toHaveLength(2);
    // Text nodes only: the class names legitimately contain "Record".
    expect(html).not.toMatch(/>[^<]*(Record|record|Bricks|Play time|Score|Stage)/);
  });
});
