import { describe, expect, it, vi } from 'vitest';

import { HISTORY_LIMIT } from '@/components/game/Roulette/history';
import {
  ROULETTE_RESULTS_STORAGE_KEY as KEY,
  createResultsStore,
  parseStoredResults,
} from '@/components/game/Roulette/resultsStore';

/** Minimal in-memory Storage. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const storageEvent = (key: string | null) => Object.assign(new Event('storage'), { key });

describe('parseStoredResults', () => {
  it('returns an empty board for missing or malformed data', () => {
    for (const raw of [null, '', 'not json', '42', 'null', '{}', '{"results":"1,2"}']) {
      expect(parseStoredResults(raw)).toEqual({ results: [], spinCount: 0 });
    }
  });

  it('keeps only pocket numbers and caps the history', () => {
    expect(parseStoredResults(JSON.stringify({ results: [5, 37, -1, 1.5, '7', 0, 36], spinCount: 9 }))).toEqual({
      results: [5, 0, 36],
      spinCount: 9,
    });
    const long = Array.from({ length: HISTORY_LIMIT + 20 }, (_, i) => i % 37);
    expect(parseStoredResults(JSON.stringify({ results: long, spinCount: 9999 })).results).toHaveLength(HISTORY_LIMIT);
  });

  it('never lets spinCount fall below the number of stored results', () => {
    expect(parseStoredResults(JSON.stringify({ results: [1, 2, 3], spinCount: 1 })).spinCount).toBe(3);
    expect(parseStoredResults(JSON.stringify({ results: [1, 2, 3] })).spinCount).toBe(3);
    expect(parseStoredResults(JSON.stringify({ results: [1, 2, 3], spinCount: 'x' })).spinCount).toBe(3);
  });
});

describe('createResultsStore', () => {
  it('starts from what is saved and reads storage only once', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ results: [17, 0], spinCount: 2 }) });
    const getItem = vi.spyOn(storage, 'getItem');
    const store = createResultsStore(() => storage, null);

    const first = store.getSnapshot();
    expect(first).toEqual({ results: [17, 0], spinCount: 2 });
    // Same object while unchanged (useSyncExternalStore requires a stable snapshot).
    expect(store.getSnapshot()).toBe(first);
    expect(getItem).toHaveBeenCalledTimes(1);
  });

  it('records newest-first, saves to storage and notifies subscribers', () => {
    const storage = memoryStorage();
    const store = createResultsStore(() => storage, null);
    const listener = vi.fn();
    store.subscribe(listener);

    store.record(32);
    store.record(15);

    expect(store.getSnapshot()).toEqual({ results: [15, 32], spinCount: 2 });
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual({ results: [15, 32], spinCount: 2 });
    expect(listener).toHaveBeenCalledTimes(2);

    // A fresh store (i.e. after a reload) sees the same history.
    expect(createResultsStore(() => storage, null).getSnapshot()).toEqual({ results: [15, 32], spinCount: 2 });
  });

  it('keeps counting spins past the history cap', () => {
    const storage = memoryStorage();
    const store = createResultsStore(() => storage, null);
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) store.record(i % 37);
    const { results, spinCount } = store.getSnapshot();
    expect(results).toHaveLength(HISTORY_LIMIT);
    expect(spinCount).toBe(HISTORY_LIMIT + 3);
  });

  it('clear() empties the board and removes the saved key', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ results: [4], spinCount: 1 }) });
    const store = createResultsStore(() => storage, null);
    store.clear();
    expect(store.getSnapshot()).toEqual({ results: [], spinCount: 0 });
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('still works in memory when storage is unavailable or full', () => {
    const blocked = createResultsStore(() => {
      throw new DOMException('denied', 'SecurityError');
    }, null);
    expect(blocked.getSnapshot()).toEqual({ results: [], spinCount: 0 });
    expect(() => blocked.record(7)).not.toThrow();
    expect(blocked.getSnapshot()).toEqual({ results: [7], spinCount: 1 });

    const full = memoryStorage();
    full.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    const store = createResultsStore(() => full, null);
    expect(() => store.record(9)).not.toThrow();
    expect(store.getSnapshot().results).toEqual([9]);

    const noStorage = createResultsStore(() => null, null);
    noStorage.record(1);
    expect(noStorage.getSnapshot().results).toEqual([1]);
  });

  it('picks up changes made in another tab', () => {
    const storage = memoryStorage();
    const events = new EventTarget();
    const store = createResultsStore(() => storage, events);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(store.getSnapshot().results).toEqual([]);

    // Another tab writes; this tab only hears about it through a storage event.
    storage.setItem(KEY, JSON.stringify({ results: [26, 3], spinCount: 2 }));
    events.dispatchEvent(storageEvent('some-other-key'));
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot().results).toEqual([]);

    events.dispatchEvent(storageEvent(KEY));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().results).toEqual([26, 3]);

    // localStorage.clear() in another tab reports key === null.
    storage.clear();
    events.dispatchEvent(storageEvent(null));
    expect(store.getSnapshot().results).toEqual([]);

    // Unsubscribing the last listener detaches from storage events.
    unsubscribe();
    events.dispatchEvent(storageEvent(KEY));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('serves an empty snapshot for server rendering', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ results: [8], spinCount: 1 }) });
    const store = createResultsStore(() => storage, null);
    expect(store.getServerSnapshot()).toEqual({ results: [], spinCount: 0 });
    expect(store.getSnapshot().results).toEqual([8]);
  });
});
