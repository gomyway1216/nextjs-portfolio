'use client';

import { type FC, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import styles from './ShogiTypefaceSelector.module.css';
import {
  SHOGI_TYPEFACE_DEFAULT,
  SHOGI_TYPEFACE_STORAGE_KEY,
  isShogiTypeface,
  type ShogiTypeface,
} from './shogiTypefacePreference';

export type { ShogiTypeface };

const STORAGE_KEY = SHOGI_TYPEFACE_STORAGE_KEY;
const DEFAULT_TYPEFACE: ShogiTypeface = SHOGI_TYPEFACE_DEFAULT;

/**
 * Apply the choice before the browser paints.
 *
 * The board (and this selector with it) mounts on the client — the page starts
 * on the setup screen, so no piece is ever in the server HTML. With a plain
 * `useEffect` the attribute lands in a LATER task than the commit that inserted
 * the pieces, so the first painted frame can show the default 清安風 face and
 * then swap: the typeface flash players report. A layout effect runs inside the
 * same commit, before paint, which makes that frame impossible.
 * This file is a Client Component, so the guard is not about server rendering:
 * it keeps the module importable from non-DOM tooling (jsdom-less unit tests,
 * any RSC-side type/import pass) where `useLayoutEffect` would warn.
 */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const OPTIONS: ReadonlyArray<{ value: ShogiTypeface; label: string }> = [
  // 「清安風」= brush-font approximation of 源兵衛清安, not the real typeface.
  { value: 'kiyoyasu', label: '清安風' },
  { value: 'ryoko', label: '菱湖' },
  { value: 'classic', label: '楷書' },
];

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

  // Sync the choice to <html data-shogi-typeface="...">, before paint.
  useIsomorphicLayoutEffect(() => {
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
