/**
 * The race card the machine shows now, for the Odds tab to work its figures
 * out from: the machine puts it here as it changes, and the tab listens. The
 * tab never reads the player's medals; this is all it is given.
 */

import { useSyncExternalStore } from 'react';
import { raceCard, type RaceCard } from './card';

/** The card the tab shows until the machine has one: a sample race, the same for everyone. */
export const SAMPLE_CARD: RaceCard = raceCard('sample', 1);

let shown: RaceCard | null = null;
const listeners = new Set<() => void>();

export const shownCard = {
  get: (): RaceCard | null => shown,
  set(card: RaceCard | null): void {
    if (card === shown) return;
    shown = card;
    for (const listener of [...listeners]) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

const none = (): RaceCard | null => null;

/** The card the machine shows, or null while it shows none. */
export const useShownCard = (): RaceCard | null => useSyncExternalStore(shownCard.subscribe, shownCard.get, none);
