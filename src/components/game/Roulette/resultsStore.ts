/**
 * Persists the results board (winning numbers) in localStorage so it survives
 * reloads and switching tabs.
 *
 * A tiny external store read through useSyncExternalStore: the server snapshot
 * is empty, so the SSR markup and the hydration render agree, and the saved
 * history appears right after hydration. localStorage is read once and cached;
 * `storage` events keep several open tabs in sync. Persisting is best-effort —
 * if storage is unavailable (private mode, blocked, quota) the board still
 * works in memory for the session.
 */

import { POCKET_COUNT } from './engine';
import { HISTORY_LIMIT, pushResult } from './history';

export const ROULETTE_RESULTS_STORAGE_KEY = 'roulette-results-v1';

export interface ResultsSnapshot {
  /** Winning numbers, newest first (at most HISTORY_LIMIT). */
  results: readonly number[];
  /** Total spins recorded — monotonic, used to key board rows. */
  spinCount: number;
}

const EMPTY: ResultsSnapshot = { results: [], spinCount: 0 };

/** Parses a stored value, dropping anything that is not a pocket number. */
export function parseStoredResults(raw: string | null): ResultsSnapshot {
  if (!raw) return EMPTY;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (!data || typeof data !== 'object') return EMPTY;
  const { results, spinCount } = data as { results?: unknown; spinCount?: unknown };
  if (!Array.isArray(results)) return EMPTY;
  const valid = results
    .filter((n): n is number => Number.isInteger(n) && n >= 0 && n < POCKET_COUNT)
    .slice(0, HISTORY_LIMIT);
  // Only a safe integer can keep counting (+1 stops changing past 2^53), so a
  // corrupted or absurd value is repaired to the number of stored results.
  const count =
    typeof spinCount === 'number' &&
    Number.isSafeInteger(spinCount) &&
    spinCount < Number.MAX_SAFE_INTEGER &&
    spinCount >= valid.length
      ? spinCount
      : valid.length;
  return valid.length === 0 && count === 0 ? EMPTY : { results: valid, spinCount: count };
}

export interface ResultsStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ResultsSnapshot;
  getServerSnapshot: () => ResultsSnapshot;
  /** Adds a winning number to the top of the board and saves it. */
  record: (n: number) => void;
  /** Empties the board and removes the saved history. */
  clear: () => void;
}

type EventSource = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export function createResultsStore(
  getStorage: () => Storage | null,
  events: EventSource | null,
  key: string = ROULETTE_RESULTS_STORAGE_KEY,
): ResultsStore {
  let cache: ResultsSnapshot | null = null;
  // False after a failed save: the cache then holds spins that storage lacks,
  // so the cache (not storage) stays the source of truth until a save succeeds.
  let inSync = true;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  /** The saved history, or null when storage cannot be read. */
  const load = (): ResultsSnapshot | null => {
    try {
      const storage = getStorage();
      return storage ? parseStoredResults(storage.getItem(key)) : null;
    } catch {
      return null;
    }
  };

  const read = (): ResultsSnapshot => {
    if (cache === null) cache = load() ?? EMPTY;
    return cache;
  };

  const write = (next: ResultsSnapshot) => {
    cache = next;
    try {
      const storage = getStorage();
      if (next.spinCount === 0) storage?.removeItem(key);
      else storage?.setItem(key, JSON.stringify({ results: next.results, spinCount: next.spinCount }));
      inSync = true;
    } catch {
      // Persisting is best-effort; the in-memory board still updates.
      inSync = false;
    }
    notify();
  };

  // Another tab changed (or cleared) the saved history: re-read on next access.
  const onStorage = (event: Event) => {
    const changed = (event as StorageEvent).key;
    if (changed !== null && changed !== key) return;
    cache = null;
    notify();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) events?.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          events?.removeEventListener('storage', onStorage);
          // Unwatched, the cache can miss other tabs' writes (e.g. while the
          // play tab is unmounted), so re-read storage on the next mount.
          if (inSync) cache = null;
        }
      };
    },
    getSnapshot: read,
    getServerSnapshot: () => EMPTY,
    record(n) {
      // Build on the latest saved history, not the cached snapshot: another
      // tab may have saved a spin whose `storage` event has not arrived yet.
      // localStorage has no compare-and-set, but this shrinks the race to the
      // synchronous read → write below.
      const current = (inSync ? load() : null) ?? read();
      write({ results: pushResult(current.results, n), spinCount: current.spinCount + 1 });
    },
    clear() {
      write(EMPTY);
    },
  };
}

const browserStorage = (): Storage | null => (typeof window === 'undefined' ? null : window.localStorage);

/** The app-wide store backed by `window.localStorage`. */
export const resultsStore = createResultsStore(browserStorage, typeof window === 'undefined' ? null : window);
