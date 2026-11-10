import { describe, expect, it } from 'vitest';

import { getDateKey } from '@/components/game/DailyMovePuzzle/engine';
import { getStrings } from '@/components/game/DailyMovePuzzle/i18n';
import {
  MAX_ATTEMPTS,
  MAX_STORED_DAYS,
  createStatsSession,
  emptyStore,
  isDateKey,
  parseStore,
  previousDateKey,
  recordHint,
  recordSolve,
  recordWrongPick,
  serializeStore,
  summarize,
  type StatsStore,
} from '@/components/game/DailyMovePuzzle/stats';

const storeWith = (days: Record<string, [number, boolean?]>): StatsStore => ({
  results: Object.fromEntries(
    Object.entries(days).map(([key, [attempts, hinted]]) => [
      key,
      { attempts, hinted: hinted === true },
    ]),
  ),
  progress: null,
});

describe('date keys', () => {
  it('accepts real calendar days only', () => {
    expect(isDateKey('2026-07-08')).toBe(true);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-7-8')).toBe(false);
    expect(isDateKey('__proto__')).toBe(false);
    expect(isDateKey(20260708)).toBe(false);
  });

  it('steps back across month, year and leap-day boundaries', () => {
    expect(previousDateKey('2026-07-08')).toBe('2026-07-07');
    expect(previousDateKey('2026-03-01')).toBe('2026-02-28');
    expect(previousDateKey('2028-03-01')).toBe('2028-02-29');
    expect(previousDateKey('2026-01-01')).toBe('2025-12-31');
  });

  it('agrees with the engine date key format', () => {
    expect(isDateKey(getDateKey(new Date(2026, 0, 5)))).toBe(true);
    expect(previousDateKey(getDateKey(new Date(2026, 0, 5)))).toBe(
      getDateKey(new Date(2026, 0, 4)),
    );
  });
});

describe('recording a day', () => {
  const day = '2026-07-08';

  it('records a clean first-tap solve as one attempt', () => {
    const store = recordSolve(emptyStore(), day);
    expect(store.results[day]).toEqual({ attempts: 1, hinted: false });
    expect(store.progress).toBeNull();
  });

  it('counts each different wrong square once', () => {
    let store = recordWrongPick(emptyStore(), day, 3);
    store = recordWrongPick(store, day, 3);
    store = recordWrongPick(store, day, 7);
    expect(store.progress).toEqual({ dateKey: day, wrong: [3, 7], hinted: false });
    expect(recordSolve(store, day).results[day]).toEqual({ attempts: 3, hinted: false });
  });

  it('returns the same store when a wrong square is repeated', () => {
    const store = recordWrongPick(emptyStore(), day, 3);
    expect(recordWrongPick(store, day, 3)).toBe(store);
  });

  it('ignores indices that are not board squares', () => {
    const store = emptyStore();
    expect(recordWrongPick(store, day, 9)).toBe(store);
    expect(recordWrongPick(store, day, -1)).toBe(store);
    expect(recordWrongPick(store, day, 1.5)).toBe(store);
  });

  it('flags a solve made after the hint was shown', () => {
    let store = recordHint(emptyStore(), day);
    expect(recordHint(store, day)).toBe(store);
    store = recordWrongPick(store, day, 2);
    expect(recordSolve(store, day).results[day]).toEqual({ attempts: 2, hinted: true });
  });

  it('keeps the first result when the day is solved again', () => {
    let store = recordWrongPick(emptyStore(), day, 1);
    store = recordSolve(store, day);
    expect(recordSolve(store, day)).toBe(store);
    expect(recordWrongPick(store, day, 5)).toBe(store);
    expect(recordHint(store, day)).toBe(store);
    expect(store.results[day]).toEqual({ attempts: 2, hinted: false });
  });

  it("does not carry yesterday's unfinished taps into today", () => {
    let store = recordWrongPick(emptyStore(), '2026-07-07', 1);
    store = recordHint(store, '2026-07-07');
    store = recordWrongPick(store, day, 4);
    expect(store.progress).toEqual({ dateKey: day, wrong: [4], hinted: false });
    store = recordSolve(store, day);
    expect(store.results).toEqual({ [day]: { attempts: 2, hinted: false } });
  });

  it('does not mutate the store it is given', () => {
    const store = recordWrongPick(emptyStore(), day, 1);
    const snapshot = JSON.parse(JSON.stringify(store));
    recordWrongPick(store, day, 2);
    recordHint(store, day);
    recordSolve(store, day);
    expect(store).toEqual(snapshot);
  });

  it('drops the oldest days beyond the storage cap', () => {
    const results: StatsStore['results'] = {};
    let key = '2026-07-07';
    for (let i = 0; i < MAX_STORED_DAYS; i += 1) {
      results[key] = { attempts: 1, hinted: false };
      key = previousDateKey(key);
    }
    const oldest = Object.keys(results).sort()[0];
    const store = recordSolve({ results, progress: null }, day);
    expect(Object.keys(store.results)).toHaveLength(MAX_STORED_DAYS);
    expect(store.results[oldest]).toBeUndefined();
    expect(store.results[day]).toBeDefined();
  });
});

describe('summarize', () => {
  it('is all zeros for an empty record', () => {
    expect(summarize(emptyStore(), '2026-07-08')).toEqual({
      solved: 0,
      currentStreak: 0,
      bestStreak: 0,
      firstTry: 0,
      hinted: 0,
      distribution: [0, 0, 0, 0, 0],
    });
  });

  it('counts a streak that ends today', () => {
    const store = storeWith({
      '2026-07-06': [1],
      '2026-07-07': [2],
      '2026-07-08': [1],
    });
    const summary = summarize(store, '2026-07-08');
    expect(summary.currentStreak).toBe(3);
    expect(summary.bestStreak).toBe(3);
  });

  it('keeps the streak alive while today is still unsolved', () => {
    const store = storeWith({ '2026-07-06': [1], '2026-07-07': [2] });
    expect(summarize(store, '2026-07-08').currentStreak).toBe(2);
  });

  it('ends the streak after a missed day but remembers the best one', () => {
    const store = storeWith({
      '2026-06-29': [1],
      '2026-06-30': [1],
      '2026-07-01': [1],
      '2026-07-02': [1],
      '2026-07-06': [3],
    });
    const summary = summarize(store, '2026-07-08');
    expect(summary.currentStreak).toBe(0);
    expect(summary.bestStreak).toBe(4);
    expect(summary.solved).toBe(5);
  });

  it('runs a streak across a year boundary', () => {
    const store = storeWith({
      '2025-12-30': [1],
      '2025-12-31': [1],
      '2026-01-01': [1],
    });
    expect(summarize(store, '2026-01-01').currentStreak).toBe(3);
  });

  it('separates hinted solves from the attempt distribution', () => {
    const store = storeWith({
      '2026-07-01': [1],
      '2026-07-02': [1, true],
      '2026-07-03': [3],
      '2026-07-04': [5],
      '2026-07-05': [2, true],
    });
    const summary = summarize(store, '2026-07-05');
    expect(summary.distribution).toEqual([1, 0, 1, 0, 1]);
    expect(summary.firstTry).toBe(1);
    expect(summary.hinted).toBe(2);
    expect(summary.solved).toBe(5);
    expect(summary.currentStreak).toBe(5);
    expect(summary.hinted + summary.distribution.reduce((a, b) => a + b, 0)).toBe(summary.solved);
  });
});

describe('parseStore', () => {
  it('round-trips a store', () => {
    let store = recordSolve(recordWrongPick(emptyStore(), '2026-07-07', 2), '2026-07-07');
    store = recordHint(recordWrongPick(store, '2026-07-08', 6), '2026-07-08');
    expect(parseStore(serializeStore(store))).toEqual(store);
  });

  it('returns an empty store for missing or broken data', () => {
    expect(parseStore(null)).toEqual(emptyStore());
    expect(parseStore('')).toEqual(emptyStore());
    expect(parseStore('{not json')).toEqual(emptyStore());
    expect(parseStore('[1,2]')).toEqual(emptyStore());
    expect(parseStore('"text"')).toEqual(emptyStore());
  });

  it('drops malformed entries and keeps valid ones', () => {
    const parsed = parseStore(
      JSON.stringify({
        results: {
          '2026-07-08': { attempts: 2, hinted: true },
          '2026-07-09': { attempts: 0 },
          '2026-07-10': { attempts: 'two' },
          '2026-07-11': { attempts: 99 },
          '2026-02-30': { attempts: 1 },
          junk: { attempts: 1 },
          '2026-07-12': null,
        },
        progress: { dateKey: '2026-07-13', wrong: [1, 1, 12, 'x', 4], hinted: 'yes' },
      }),
    );
    expect(parsed.results).toEqual({
      '2026-07-08': { attempts: 2, hinted: true },
      '2026-07-11': { attempts: MAX_ATTEMPTS, hinted: false },
    });
    expect(parsed.progress).toEqual({ dateKey: '2026-07-13', wrong: [1, 4], hinted: false });
  });

  it('drops progress with an invalid date', () => {
    expect(
      parseStore(JSON.stringify({ results: {}, progress: { dateKey: 'today', wrong: [] } })).progress,
    ).toBeNull();
  });
});

describe('createStatsSession', () => {
  const day = '2026-07-08';
  const key = 'stats';

  const fakeStorage = (initial?: string) => {
    const data = new Map<string, string>();
    if (initial !== undefined) data.set(key, initial);
    const flags = { failWrites: false, failReads: false };
    return {
      data,
      flags,
      getItem: (k: string) => {
        if (flags.failReads) throw new Error('blocked');
        return data.get(k) ?? null;
      },
      setItem: (k: string, value: string) => {
        if (flags.failWrites) throw new Error('quota');
        data.set(k, value);
      },
    };
  };

  it('loads what is stored and saves changes', () => {
    const storage = fakeStorage(serializeStore(storeWith({ '2026-07-07': [2] })));
    const session = createStatsSession(storage, key);
    expect(session.current().results['2026-07-07']).toEqual({ attempts: 2, hinted: false });

    session.update((store) => recordSolve(store, day));
    expect(parseStore(storage.data.get(key)).results[day]).toEqual({ attempts: 1, hinted: false });
  });

  it("picks up another tab's saved result before applying a change", () => {
    const storage = fakeStorage();
    const session = createStatsSession(storage, key);
    session.update((store) => recordWrongPick(store, day, 3));

    // Another tab solves today's puzzle with two wrong squares.
    const other = createStatsSession(storage, key);
    other.update((store) => recordWrongPick(store, day, 5));
    other.update((store) => recordSolve(store, day));

    const after = session.update((store) => recordSolve(store, day));
    expect(after.results[day]).toEqual({ attempts: 3, hinted: false });
    expect(parseStore(storage.data.get(key)).results[day]).toEqual({ attempts: 3, hinted: false });
  });

  it('keeps the recording rules for the visit when writes start failing', () => {
    const storage = fakeStorage();
    storage.flags.failWrites = true;
    const session = createStatsSession(storage, key);

    session.update((store) => recordWrongPick(store, day, 3));
    session.update((store) => recordHint(store, day));
    const solved = session.update((store) => recordSolve(store, day));
    expect(solved.results[day]).toEqual({ attempts: 2, hinted: true });

    // Solving again after Reset must not replace the first result.
    expect(session.update((store) => recordSolve(store, day))).toBe(solved);
    expect(session.current()).toBe(solved);
    expect(storage.data.has(key)).toBe(false);
  });

  it('continues from the last good read when reads start failing', () => {
    const storage = fakeStorage(serializeStore(storeWith({ '2026-07-07': [1] })));
    const session = createStatsSession(storage, key);
    session.current();
    storage.flags.failReads = true;

    session.update((store) => recordWrongPick(store, day, 1));
    const solved = session.update((store) => recordSolve(store, day));
    expect(solved.results).toEqual({
      '2026-07-07': { attempts: 1, hinted: false },
      [day]: { attempts: 2, hinted: false },
    });
  });

  it('works in memory without any storage', () => {
    const session = createStatsSession(null, key);
    expect(session.current()).toEqual(emptyStore());
    session.update((store) => recordWrongPick(store, day, 2));
    expect(session.update((store) => recordSolve(store, day)).results[day]).toEqual({
      attempts: 2,
      hinted: false,
    });
  });
});

describe('record strings', () => {
  it('provides every record string in both languages', () => {
    for (const language of ['en', 'ja'] as const) {
      const t = getStrings(language);
      for (const text of [
        t.statsTitle,
        t.todayPending,
        t.statSolved,
        t.statCurrent,
        t.statBest,
        t.statFirstTry,
        t.distTitle,
        t.distHint,
        t.statsNote,
        t.todayResult(1, false),
        t.todayResult(3, true),
        t.distRow(1, 1),
        t.distRow(4, 2),
        t.distHintRow(0),
      ]) {
        expect(text.trim().length).toBeGreaterThan(0);
      }
      expect(t.todayResult(3, true)).not.toBe(t.todayResult(3, false));
      expect(t.distRow(4, 2)).toContain('4');
      expect(t.distRow(4, 2)).toContain('2');
    }
    expect(getStrings('en').infoBody).toHaveLength(getStrings('ja').infoBody.length);
  });
});
