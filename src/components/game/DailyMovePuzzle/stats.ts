/**
 * Daily Move Puzzle record keeping.
 *
 * One result is kept per local calendar day: the FIRST solve of that day.
 * Its attempt count is the number of different wrong squares tapped that day
 * before the solve, plus one, so taking a tap back with Undo or starting over
 * with Reset does not improve the record. A solve made after the hint was
 * shown is flagged and reported separately.
 *
 * Everything here is pure; the component owns reading and writing storage.
 */

export interface DayResult {
  /** Different wrong squares tapped before the first solve, plus one. */
  attempts: number;
  /** True when the hint was shown at any point before the first solve. */
  hinted: boolean;
}

export interface DayProgress {
  dateKey: string;
  /** Different wrong squares tapped so far on `dateKey`. */
  wrong: number[];
  hinted: boolean;
}

export interface StatsStore {
  results: Record<string, DayResult>;
  /** The unsolved day in progress, if any. */
  progress: DayProgress | null;
}

export interface StatsSummary {
  /** Days with a recorded solve. */
  solved: number;
  /** Consecutive solved days ending today, or yesterday if today is unsolved. */
  currentStreak: number;
  bestStreak: number;
  /** Days solved on the first tap without the hint. */
  firstTry: number;
  /** Days solved after the hint was shown. */
  hinted: number;
  /** Unhinted solves by attempt count; index 0 is one attempt. */
  distribution: number[];
}

/** A puzzle has at most five empty squares, so at most five attempts. */
export const MAX_ATTEMPTS = 5;

/** Oldest days are dropped beyond this many results (over five years). */
export const MAX_STORED_DAYS = 2000;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatKey = (date: Date): string => {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** True for a `YYYY-MM-DD` key that names a real calendar day. */
export const isDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatKey(date) === value;
};

/** The calendar day before `dateKey` (which must be a valid key). */
export const previousDateKey = (dateKey: string): string => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return formatKey(new Date(y, m - 1, d - 1));
};

export const emptyStore = (): StatsStore => ({ results: {}, progress: null });

const isCellIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 9;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parses stored JSON, dropping anything malformed instead of throwing. */
export const parseStore = (raw: string | null | undefined): StatsStore => {
  if (!raw) return emptyStore();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyStore();
  }
  if (!isRecord(data)) return emptyStore();

  const results: Record<string, DayResult> = {};
  if (isRecord(data.results)) {
    for (const [key, value] of Object.entries(data.results)) {
      if (!isDateKey(key) || !isRecord(value)) continue;
      const { attempts } = value;
      if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 1) continue;
      results[key] = {
        attempts: Math.min(attempts, MAX_ATTEMPTS),
        hinted: value.hinted === true,
      };
    }
  }

  let progress: DayProgress | null = null;
  const rawProgress = data.progress;
  if (isRecord(rawProgress) && isDateKey(rawProgress.dateKey) && Array.isArray(rawProgress.wrong)) {
    progress = {
      dateKey: rawProgress.dateKey,
      wrong: Array.from(new Set(rawProgress.wrong.filter(isCellIndex))),
      hinted: rawProgress.hinted === true,
    };
  }

  return { results, progress };
};

export const serializeStore = (store: StatsStore): string => JSON.stringify(store);

const progressFor = (store: StatsStore, dateKey: string): DayProgress =>
  store.progress && store.progress.dateKey === dateKey
    ? store.progress
    : { dateKey, wrong: [], hinted: false };

/** Notes a wrong square for `dateKey`. No-op once that day has a result. */
export const recordWrongPick = (store: StatsStore, dateKey: string, index: number): StatsStore => {
  if (store.results[dateKey] || !isCellIndex(index)) return store;
  const progress = progressFor(store, dateKey);
  if (progress.wrong.includes(index)) return store;
  return { ...store, progress: { ...progress, wrong: [...progress.wrong, index] } };
};

/** Notes that the hint was shown on `dateKey`. No-op once that day has a result. */
export const recordHint = (store: StatsStore, dateKey: string): StatsStore => {
  if (store.results[dateKey]) return store;
  const progress = progressFor(store, dateKey);
  if (progress.hinted && store.progress === progress) return store;
  return { ...store, progress: { ...progress, hinted: true } };
};

/** Records the first solve of `dateKey`; later solves that day change nothing. */
export const recordSolve = (store: StatsStore, dateKey: string): StatsStore => {
  if (store.results[dateKey]) return store;
  const progress = progressFor(store, dateKey);
  const results: Record<string, DayResult> = {
    ...store.results,
    [dateKey]: {
      attempts: Math.min(progress.wrong.length + 1, MAX_ATTEMPTS),
      hinted: progress.hinted,
    },
  };
  const keys = Object.keys(results);
  if (keys.length > MAX_STORED_DAYS) {
    keys.sort();
    for (const key of keys.slice(0, keys.length - MAX_STORED_DAYS)) {
      delete results[key];
    }
  }
  return { results, progress: null };
};

/** Totals and streaks as of `todayKey`. */
export const summarize = (store: StatsStore, todayKey: string): StatsSummary => {
  const keys = Object.keys(store.results).sort();
  const distribution = new Array<number>(MAX_ATTEMPTS).fill(0);
  let hinted = 0;
  let bestStreak = 0;
  let run = 0;
  let previous: string | null = null;

  for (const key of keys) {
    const result = store.results[key];
    if (result.hinted) {
      hinted += 1;
    } else {
      distribution[Math.min(result.attempts, MAX_ATTEMPTS) - 1] += 1;
    }
    run = previous !== null && previousDateKey(key) === previous ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
    previous = key;
  }

  let currentStreak = 0;
  let cursor = store.results[todayKey] ? todayKey : previousDateKey(todayKey);
  while (store.results[cursor]) {
    currentStreak += 1;
    cursor = previousDateKey(cursor);
  }

  return {
    solved: keys.length,
    currentStreak,
    bestStreak,
    firstTry: distribution[0],
    hinted,
    distribution,
  };
};
