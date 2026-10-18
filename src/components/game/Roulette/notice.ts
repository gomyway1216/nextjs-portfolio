'use client';

import { useSyncExternalStore } from 'react';
import { NOTICE_KEY } from './medalTable';

/**
 * The note shown once, that roulette plays with the medal center's medals now
 * and its old chips are retired. It is put away when the player says OK, or
 * when they first spin; and stays away on this device after that.
 */

const listeners = new Set<() => void>();
let putAway = false;

/** Whether the note has been put away, here or on an earlier visit. */
const seen = (): boolean => {
  if (putAway) return true;
  try {
    // Once seen, it is not read again: React asks on every drawing.
    putAway = window.localStorage.getItem(NOTICE_KEY) !== null;
    return putAway;
  } catch {
    return false;
  }
};

export const putNoticeAway = (): void => {
  if (putAway) return;
  putAway = true;
  try {
    window.localStorage.setItem(NOTICE_KEY, '1');
  } catch {
    // Put away for this page; shown again on the next visit.
  }
  for (const listener of [...listeners]) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
// On the server, and in the first drawing, it is shown: the browser's storage is asked by its gate before the page is
// painted, which hides it where it has been seen (MedalCenter/onceNote.tsx), so the table never moves for it.
const seenOnServer = () => false;

/** Whether the note is still to be shown. */
export const useNoticeShown = (): boolean => !useSyncExternalStore(subscribe, seen, seenOnServer);
