/**
 * Daily Move Puzzle — what the board starts from after a reload. The result
 * shown on the board and the record panel are both read from the same stored
 * record, so they cannot disagree about today.
 */

import { describe, expect, it } from 'vitest';

import { getStrings } from '@/components/game/DailyMovePuzzle/i18n';
import {
  createStatsSession,
  emptyStore,
  parseStore,
  recordHint,
  recordSolve,
  recordWrongPick,
  restoreDay,
  serializeStore,
} from '@/components/game/DailyMovePuzzle/stats';

const TODAY = '2026-11-12';
const YESTERDAY = '2026-11-11';

/** A stand-in for localStorage that survives a "reload" (a new session over the same data). */
const fakeStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

describe('restoreDay', () => {
  it('starts a fresh day with nothing played', () => {
    expect(restoreDay(emptyStore(), TODAY)).toEqual({ solved: false, attempts: 0, wrong: [] });
  });

  it('brings back the wrong squares tapped before the reload, and counts them', () => {
    let store = recordWrongPick(emptyStore(), TODAY, 0);
    store = recordWrongPick(store, TODAY, 1);
    expect(restoreDay(store, TODAY)).toEqual({ solved: false, attempts: 2, wrong: [0, 1] });
  });

  it('agrees with the record once the puzzle is solved after a reload', () => {
    const storage = fakeStorage();
    const before = createStatsSession(storage, 'stats');
    before.update((store) => recordWrongPick(store, TODAY, 0));
    before.update((store) => recordWrongPick(store, TODAY, 1));

    // Reload: a new session over the same storage. One more wrong square, then the solve.
    const after = createStatsSession(storage, 'stats');
    const restored = restoreDay(after.current(), TODAY);
    after.update((store) => recordWrongPick(store, TODAY, 7));
    const solved = after.update((store) => recordSolve(store, TODAY));

    // The board counts the restored squares, the new wrong one and the solving tap…
    const shownAttempts = restored.attempts + 1 + 1;
    // …which is what the record holds (it used to show 2 against a recorded 4).
    expect(solved.results[TODAY].attempts).toBe(4);
    expect(shownAttempts).toBe(solved.results[TODAY].attempts);
  });

  it('shows a recorded solve as solved, with the recorded attempt count, after a reload', () => {
    let store = recordWrongPick(emptyStore(), TODAY, 3);
    store = recordHint(store, TODAY);
    store = recordSolve(store, TODAY);
    const reloaded = parseStore(serializeStore(store));
    const restored = restoreDay(reloaded, TODAY);
    expect(restored).toEqual({ solved: true, attempts: 2, wrong: [] });

    const en = getStrings('en');
    // Both lines of the page are built from the same number.
    expect(en.solvedIn(restored.attempts)).toContain('2 attempts');
    expect(en.todayResult(reloaded.results[TODAY].attempts, reloaded.results[TODAY].hinted)).toContain('2 attempts');
  });

  it("ignores another day's unfinished progress", () => {
    const store = recordWrongPick(emptyStore(), YESTERDAY, 4);
    expect(restoreDay(store, TODAY)).toEqual({ solved: false, attempts: 0, wrong: [] });
  });

  it("drops stored squares that are not open wrong squares of today's puzzle", () => {
    let store = recordWrongPick(emptyStore(), TODAY, 0);
    store = recordWrongPick(store, TODAY, 2);
    store = recordWrongPick(store, TODAY, 5);
    const isOpen = (index: number) => index !== 2;
    expect(restoreDay(store, TODAY, isOpen)).toEqual({ solved: false, attempts: 2, wrong: [0, 5] });
  });

  it('does not change the stored format', () => {
    let store = recordWrongPick(emptyStore(), TODAY, 0);
    restoreDay(store, TODAY);
    expect(serializeStore(store)).toBe(`{"results":{},"progress":{"dateKey":"${TODAY}","wrong":[0],"hinted":false}}`);
    store = recordSolve(store, TODAY);
    restoreDay(store, TODAY);
    expect(serializeStore(store)).toBe(`{"results":{"${TODAY}":{"attempts":2,"hinted":false}},"progress":null}`);
  });
});
