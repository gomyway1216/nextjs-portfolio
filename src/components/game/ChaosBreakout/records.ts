/**
 * Chaos Breakout — per-difficulty personal records.
 *
 * Pure bookkeeping plus a tiny store over localStorage. The global "Best" in
 * the HUD (useHighScore) is one number across every difficulty; this book
 * keeps the best score, stage and combo for each difficulty separately, on
 * this browser only.
 */

import type { Difficulty, GameState } from './engine';

export const RECORDS_KEY = 'chaos-breakout-records-v1';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

export interface DifficultyRecord {
  score: number;
  stage: number;
  combo: number;
}

export type RecordBook = Partial<Record<Difficulty, DifficultyRecord>>;

export interface RunResult extends DifficultyRecord {
  bricks: number;
  pulses: number;
  /** Simulated play time in 60fps-frame units. */
  frames: number;
}

export type Improved = Record<keyof DifficultyRecord, boolean>;

export const EMPTY_BOOK: RecordBook = Object.freeze({});

/** What a fresh run starts with — reaching only this is not a record. */
const BASELINE: DifficultyRecord = { score: 0, stage: 1, combo: 1 };

export const runResult = (state: GameState): RunResult => ({
  score: state.score,
  stage: state.stage,
  combo: state.stats.maxCombo,
  bricks: state.stats.bricksBroken,
  pulses: state.stats.chaosPulses,
  frames: state.stats.frames,
});

const wholeNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** Read a stored book, dropping anything that isn't a well-formed record. */
export const parseBook = (raw: string | null): RecordBook => {
  if (!raw) return EMPTY_BOOK;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_BOOK;
  }
  if (typeof data !== 'object' || data === null) return EMPTY_BOOK;
  const book: RecordBook = {};
  for (const difficulty of DIFFICULTIES) {
    const entry = (data as Record<string, unknown>)[difficulty];
    if (typeof entry !== 'object' || entry === null) continue;
    const { score, stage, combo } = entry as Record<string, unknown>;
    const record = {
      score: wholeNumber(score),
      stage: wholeNumber(stage),
      combo: wholeNumber(combo),
    };
    if (record.score === null || record.stage === null || record.combo === null) continue;
    book[difficulty] = record as DifficultyRecord;
  }
  return book;
};

/**
 * Fold a finished run into the book. Each field keeps its own best, so the
 * record score, stage and combo can come from three different runs.
 */
export const recordRun = (
  book: RecordBook,
  difficulty: Difficulty,
  run: DifficultyRecord,
): { book: RecordBook; improved: Improved } => {
  const previous = book[difficulty];
  const toBeat = previous ?? BASELINE;
  const improved: Improved = {
    score: run.score > toBeat.score,
    stage: run.stage > toBeat.stage,
    combo: run.combo > toBeat.combo,
  };
  const best = (key: keyof DifficultyRecord) =>
    previous ? Math.max(run[key], previous[key]) : run[key];
  return {
    book: {
      ...book,
      [difficulty]: { score: best('score'), stage: best('stage'), combo: best('combo') },
    },
    improved,
  };
};

/** Frames (60 per second) as m:ss, rounded down to the whole second. */
export const formatDuration = (frames: number): string => {
  const seconds = Math.max(0, Math.floor(frames / 60));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

type RecordStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface RecordsStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RecordBook;
  /** Save a finished run and report which of its figures beat the old record. */
  saveRun: (difficulty: Difficulty, run: DifficultyRecord) => Improved;
}

/**
 * A store shaped for useSyncExternalStore. The book is re-read from storage
 * on every access, so a run saved by another tab is merged rather than
 * overwritten. If storage can't be read or written, the book lives in memory
 * for the rest of the page's life.
 */
export const createRecordsStore = (getStorage: () => RecordStorage | null): RecordsStore => {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null = null;
  let cachedBook: RecordBook = EMPTY_BOOK;
  let memoryOnly = false;

  const read = (): RecordBook => {
    if (memoryOnly) return cachedBook;
    let raw: string | null;
    try {
      const storage = getStorage();
      if (!storage) return cachedBook;
      raw = storage.getItem(RECORDS_KEY);
    } catch {
      return cachedBook;
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedBook = parseBook(raw);
    }
    return cachedBook;
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === RECORDS_KEY) listener();
      };
      if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      };
    },
    getSnapshot: read,
    saveRun: (difficulty, run) => {
      const { book, improved } = recordRun(read(), difficulty, run);
      const raw = JSON.stringify(book);
      cachedRaw = raw;
      cachedBook = book;
      try {
        const storage = getStorage();
        if (storage) storage.setItem(RECORDS_KEY, raw);
        else memoryOnly = true;
      } catch {
        memoryOnly = true;
      }
      listeners.forEach((listener) => listener());
      return improved;
    },
  };
};

export const recordsStore = createRecordsStore(() =>
  typeof window === 'undefined' ? null : window.localStorage,
);

export const getServerBook = (): RecordBook => EMPTY_BOOK;
