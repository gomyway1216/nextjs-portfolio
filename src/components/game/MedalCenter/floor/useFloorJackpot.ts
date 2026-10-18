'use client';

/**
 * The floor jackpot as a page sees it: its medals now, live, and its last wins.
 *
 * Two sources tell the page the pool, and both carry its version (`v`, which
 * every change counts up):
 *
 * - the Realtime Database's live mirror (`medalFloor/jackpot`, public to
 *   read), written by the server after each change, as the floor's feed is;
 * - the floor jackpot's route, read from the pool itself.
 *
 * The page shows whichever it heard is the later. Until the mirror answers
 * with a pool, the page asks the route every 30 seconds: where the mirror
 * cannot be listened to (a browser it is blocked in, a site whose rules are
 * not deployed, a build without Firebase), and where it has nothing yet (no
 * report has fed the pool since it was set up), or nothing any more. While it
 * is live, the route is still asked every two minutes: a mirror the server
 * could not write is behind the pool, and the page does not stay behind with
 * it. The route is asked once as the page opens in any case, for the last
 * wins. Nothing is asked while the page is hidden.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FLOOR_JACKPOT_PATH, JACKPOT_WINS_SHOWN, jackpotFrom, type FloorJackpotView, type JackpotWinShown } from '@/lib/medalFloor/jackpot';
import { fetchJackpot } from './api';

/** While the mirror is not live, the route is asked this often. */
export const JACKPOT_POLL_MS = 30_000;
/** While it is, the route is still asked this often, in case the mirror has fallen behind. */
export const JACKPOT_RECHECK_MS = 120_000;

export interface FloorJackpotState {
  /** The medals in the pool, or null until it is known. */
  amount: number | null;
  /** How many times it has been won. */
  seq: number;
  /** The version of what is shown: of the two sources, the later wins. -1 before either has said. */
  v: number;
  /** Its last wins, newest first. */
  wins: JackpotWinShown[];
  /** True while the live mirror holds the pool as shown (or a later one): the route need only be asked now and then. */
  live: boolean;
  /** True when the floor could not be reached and nothing is known. */
  unavailable: boolean;
  /** The server's clock less this device's, for "2 h ago". */
  skew: number;
}

export const JACKPOT_START: FloorJackpotState = { amount: null, seq: 0, v: -1, wins: [], live: false, unavailable: false, skew: 0 };

/** Something a page heard of the pool. */
export type JackpotHeard =
  /** The route answered (`at`: this device's clock as it did). */
  | { kind: 'route'; view: FloorJackpotView; at: number }
  /** The route could not be asked. */
  | { kind: 'failed' }
  /** The live mirror said what it holds: the database's value, nothing (null) where there is no pool in it yet. */
  | { kind: 'live'; value: unknown }
  /** The database refused or dropped the listener. */
  | { kind: 'lost' };

const withWin = (wins: JackpotWinShown[], last: JackpotWinShown | null): JackpotWinShown[] =>
  last && !wins.some((win) => win.at === last.at && win.tag === last.tag) ? [last, ...wins].slice(0, JACKPOT_WINS_SHOWN) : wins;

/**
 * The pool as the page shows it, after hearing one more thing of it. Of the
 * route and the mirror, the later (by `v`) is shown; the mirror is live only
 * while it holds the pool as shown or a later one. A mirror with nothing in it,
 * or behind what the route said, is not live, and the page asks the route.
 */
export function nextJackpot(state: FloorJackpotState, heard: JackpotHeard): FloorJackpotState {
  switch (heard.kind) {
    case 'route': {
      const { view } = heard;
      const skew = view.now - heard.at;
      if (!view.available) return { ...state, unavailable: state.amount === null, skew };
      // The route always has the whole list of the last wins.
      const next = { ...state, wins: view.wins, unavailable: false, skew };
      if (view.v < state.v) return next;
      return { ...next, amount: view.amount, seq: view.seq, v: view.v, live: state.live && view.v === state.v };
    }
    case 'failed':
      return { ...state, unavailable: state.amount === null };
    case 'live': {
      const live = jackpotFrom(heard.value);
      // Nothing in the mirror (no report has fed the pool since it was set up), or something that is not a pool: not live.
      if (!live) return { ...state, live: false };
      // Behind what the page has from the route: a mirror the server could not write. Not live; the route is asked.
      if (live.v < state.v) return { ...state, live: false };
      return { ...state, amount: live.amount, seq: live.seq, v: live.v, live: true, unavailable: false, wins: withWin(state.wins, live.last) };
    }
    case 'lost':
      return { ...state, live: false };
  }
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
  const [state, setState] = useState<FloorJackpotState>(JACKPOT_START);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const askedAt = useRef(0);
  const hear = useCallback((heard: JackpotHeard) => setState((was) => nextJackpot(was, heard)), []);

  const ask = useCallback(() => {
    askedAt.current = Date.now();
    void (async () => {
      try {
        hear({ kind: 'route', view: await fetchJackpot(), at: Date.now() });
      } catch {
        hear({ kind: 'failed' });
      }
    })();
  }, [hear]);

  useEffect(() => {
    ask();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!stateRef.current.live || Date.now() - askedAt.current >= JACKPOT_RECHECK_MS) ask();
    }, JACKPOT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [ask]);

  useEffect(() => {
    let stop: () => void = () => {};
    let gone = false;
    void listenToJackpot(
      (value) => {
        if (!gone) hear({ kind: 'live', value });
      },
      () => {
        if (!gone) hear({ kind: 'lost' });
      },
    ).then((unsubscribe) => {
      if (gone) unsubscribe();
      else stop = unsubscribe;
    });
    return () => {
      gone = true;
      stop();
    };
  }, [hear]);

  return state;
}
