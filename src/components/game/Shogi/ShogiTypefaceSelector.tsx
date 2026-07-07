'use client';

import { type FC, useEffect, useSyncExternalStore } from 'react';
import styles from './ShogiTypefaceSelector.module.css';

export type ShogiTypeface = 'kiyoyasu' | 'ryoko' | 'classic';

const STORAGE_KEY = 'shogi-koma-typeface';
const DEFAULT_TYPEFACE: ShogiTypeface = 'kiyoyasu';

const OPTIONS: ReadonlyArray<{ value: ShogiTypeface; label: string }> = [
  // 「清安風」= brush-font approximation of 源兵衛清安, not the real typeface.
  { value: 'kiyoyasu', label: '清安風' },
  { value: 'ryoko', label: '菱湖' },
  { value: 'classic', label: '楷書' },
];

function isShogiTypeface(value: string | null): value is ShogiTypeface {
  return value === 'kiyoyasu' || value === 'ryoko' || value === 'classic';
}

// Tiny module-level store so the choice survives remounts and reads
// localStorage only once.
let cachedTypeface: ShogiTypeface | null = null;
const listeners = new Set<() => void>();

function getTypeface(): ShogiTypeface {
  if (cachedTypeface === null) {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable (private mode etc.) — keep the default.
    }
    cachedTypeface = isShogiTypeface(stored) ? stored : DEFAULT_TYPEFACE;
  }
  return cachedTypeface;
}

function getServerTypeface(): ShogiTypeface {
  return DEFAULT_TYPEFACE;
}

function setTypeface(value: ShogiTypeface) {
  cachedTypeface = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Persisting is best-effort.
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Compact switch for the shogi piece kanji typeface. The choice is applied
 * as a data attribute on <html> (ShogiPiece.module.css keys off it, so all
 * pieces restyle instantly without re-rendering) and saved to localStorage.
 */
export const ShogiTypefaceSelector: FC = () => {
  const typeface = useSyncExternalStore(subscribe, getTypeface, getServerTypeface);

  // Sync the choice to <html data-shogi-typeface="...">.
  useEffect(() => {
    if (typeface === DEFAULT_TYPEFACE) {
      delete document.documentElement.dataset.shogiTypeface;
    } else {
      document.documentElement.dataset.shogiTypeface = typeface;
    }
  }, [typeface]);

  return (
    <div className={styles.wrapper} role="group" aria-label="駒の書体">
      <span className={styles.caption}>書体</span>
      {OPTIONS.map(option => (
        <button
          key={option.value}
          type="button"
          className={styles.option}
          data-active={typeface === option.value ? 'true' : 'false'}
          aria-pressed={typeface === option.value}
          onClick={() => setTypeface(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};
