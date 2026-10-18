'use client';

/**
 * The floor jackpot as a page sees it: its medals now, live, and its last wins.
 *
 * Live from the Realtime Database (`medalFloor/jackpot`, public to read), as
 * the floor's feed is. Until that answers, and wherever it cannot (a browser it
 * is blocked in, a site whose rules are not deployed yet, a build without
 * Firebase), the page asks the floor jackpot's route every 30 seconds instead.
 * The route is asked once as the page opens in any case, for the last wins.
 * Nothing is asked while the page is hidden.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FLOOR_JACKPOT_PATH, JACKPOT_WINS_SHOWN, jackpotFrom, type JackpotWinShown } from '@/lib/medalFloor/jackpot';
import { fetchJackpot } from './api';

export const JACKPOT_POLL_MS = 30_000;

export interface FloorJackpotState {
  /** The medals in the pool, or null until it is known. */
  amount: number | null;
  /** How many times it has been won. */
  seq: number;
  /** Its last wins, newest first. */
  wins: JackpotWinShown[];
  /** True while it comes live from the database. */
  live: boolean;
  /** True when the floor could not be reached. */
  unavailable: boolean;
  /** The server's clock less this device's, for "2 h ago". */
  skew: number;
}

/** Listens to the pool live. Resolves to a way to stop; calls `lost` when the database refuses or drops the listener. */
async function listenToJackpot(heard: (value: unknown) => void, lost: () => void): Promise<() => void> {
  try {
    const { isFirebaseClientConfigured } = await import('@/lib/firebaseConfig');
    if (!isFirebaseClientConfigured) return () => {};
    const [{ getFirebaseDatabase }, { onValue, ref }] = await Promise.all([import('@/lib/firebaseRealtimeDb'), import('firebase/database')]);
    return onValue(
      ref(getFirebaseDatabase(), FLOOR_JACKPOT_PATH),
      (snapshot) => heard(snapshot.val()),
      () => lost(),
    );
  } catch {
    lost();
    return () => {};
  }
}

export function useFloorJackpot(): FloorJackpotState {
  const [state, setState] = useState<FloorJackpotState>({ amount: null, seq: 0, wins: [], live: false, unavailable: false, skew: 0 });
  const liveRef = useRef(false);

  const ask = useCallback(() => {
    void (async () => {
      try {
        const view = await fetchJackpot();
        setState((was) => ({
          ...was,
          amount: view.available ? (liveRef.current ? was.amount : view.amount) : was.amount,
          seq: view.available && !liveRef.current ? view.seq : was.seq,
          wins: view.available ? view.wins : was.wins,
          unavailable: !view.available && was.amount === null,
          skew: view.now - Date.now(),
        }));
      } catch {
        setState((was) => ({ ...was, unavailable: was.amount === null }));
      }
    })();
  }, []);

  useEffect(() => {
    ask();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || liveRef.current) return;
      ask();
    }, JACKPOT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [ask]);

  useEffect(() => {
    let stop: () => void = () => {};
    let gone = false;
    void listenToJackpot(
      (value) => {
        if (gone) return;
        const live = jackpotFrom(value);
        if (!live) return;
        liveRef.current = true;
        const last = live.last;
        setState((was) => ({
          ...was,
          amount: live.amount,
          seq: live.seq,
          live: true,
          unavailable: false,
          // A new win heard live goes on top of the last wins.
          wins: last && !was.wins.some((win) => win.at === last.at && win.tag === last.tag) ? [last, ...was.wins].slice(0, JACKPOT_WINS_SHOWN) : was.wins,
        }));
      },
      () => {
        liveRef.current = false;
        setState((was) => ({ ...was, live: false }));
      },
    ).then((unsubscribe) => {
      if (gone) unsubscribe();
      else stop = unsubscribe;
    });
    return () => {
      gone = true;
      stop();
      liveRef.current = false;
    };
  }, []);

  return state;
}
