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
  const count =
    typeof spinCount === 'number' && Number.isInteger(spinCount) && spinCount >= valid.length
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
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const read = (): ResultsSnapshot => {
    if (cache === null) {
      let raw: string | null = null;
      try {
        raw = getStorage()?.getItem(key) ?? null;
      } catch {
        // Storage unavailable — start empty.
      }
      cache = parseStoredResults(raw);
    }
    return cache;
  };

  const write = (next: ResultsSnapshot) => {
    cache = next;
    try {
      const storage = getStorage();
      if (next.spinCount === 0) storage?.removeItem(key);
      else storage?.setItem(key, JSON.stringify({ results: next.results, spinCount: next.spinCount }));
    } catch {
      // Persisting is best-effort; the in-memory board still updates.
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
        if (listeners.size === 0) events?.removeEventListener('storage', onStorage);
      };
    },
    getSnapshot: read,
    getServerSnapshot: () => EMPTY,
    record(n) {
      const current = read();
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
