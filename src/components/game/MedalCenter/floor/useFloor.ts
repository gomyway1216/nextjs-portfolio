'use client';

/**
 * The floor as a page sees it: the moments on show, live, and the boards.
 *
 * The moments come straight from the Realtime Database (`medalFloor/feed`, the
 * one part of the floor its rules let anybody read), as the site's multiplayer
 * rooms do. Until that answers (and wherever it cannot: a browser it is
 * blocked in, a site whose rules are not deployed yet, a build without
 * Firebase), the page asks the floor's route every 30 seconds instead. The
 * boards always come from the route: after a page opens, whenever a new moment
 * arrives (a little later, so that a burst is one call), and every two minutes.
 * Nothing is asked while the page is hidden.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FLOOR_FEED_PATH, feedFrom } from '@/lib/medalFloor/feed';
import type { FloorFeedEntry, FloorSummary } from '@/lib/medalFloor/types';
import { fetchFloor, fetchOwnerFloor } from './api';

export const POLL_MS = 30_000;
export const BOARDS_MS = 120_000;
/** After a new moment, the boards are asked for this much later. */
const AFTER_MOMENT_MS = 8_000;

export interface FloorView {
  summary: FloorSummary | null;
  feed: FloorFeedEntry[];
  /** True while the moments come live from the database. */
  live: boolean;
  /** True when the last ask of the route failed, or it said the floor is not available. */
  unavailable: boolean;
  /** The server's clock less this device's, for "2 min ago". */
  skew: number;
  refresh: () => void;
}

/** Listens to the moments on show. Resolves to a way to stop; calls `lost` if the database refuses or drops the listener. */
export async function listenToFeed(heard: (feed: FloorFeedEntry[]) => void, lost: () => void): Promise<() => void> {
  try {
    const { isFirebaseClientConfigured } = await import('@/lib/firebaseConfig');
    if (!isFirebaseClientConfigured) return () => {};
    const [{ getFirebaseDatabase }, { onValue, ref }] = await Promise.all([import('@/lib/firebaseRealtimeDb'), import('firebase/database')]);
    return onValue(
      ref(getFirebaseDatabase(), FLOOR_FEED_PATH),
      (snapshot) => heard(feedFrom(snapshot.val())),
      () => lost(),
    );
  } catch {
    lost();
    return () => {};
  }
}

/**
 * `owner`: a way to get the owner's token, for the owner's view (every line,
 * hidden ones marked). Null for everybody else.
 */
export function useFloor(view: 'hub' | 'full', owner: (() => Promise<string>) | null = null, limit = view === 'hub' ? 8 : 40): FloorView {
  const [summary, setSummary] = useState<FloorSummary | null>(null);
  const [feed, setFeed] = useState<FloorFeedEntry[]>([]);
  const [live, setLive] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [skew, setSkew] = useState(0);
  const liveRef = useRef(false);
  const askedAt = useRef(0);
  const ownerRef = useRef(owner);
  useEffect(() => {
    ownerRef.current = owner;
  });
  const afterMoment = useRef<number | null>(null);
  const asOwner = owner !== null;

  const refresh = useCallback(() => {
    askedAt.current = Date.now();
    const asking = ownerRef.current;
    void (async () => {
      try {
        const next = asking ? await fetchOwnerFloor(await asking()) : await fetchFloor(view);
        setSummary(next);
        setSkew(next.now - Date.now());
        setUnavailable(!next.available);
        if (!liveRef.current) setFeed(next.feed.slice(0, limit));
      } catch {
        setUnavailable(true);
      }
    })();
  }, [view, limit]);

  // The route: now, and then every 30 seconds for the moments while they are not live, and for the boards every two minutes.
  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!liveRef.current || Date.now() - askedAt.current >= BOARDS_MS) refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
    // Asked again as the owner once the site knows it is them.
  }, [refresh, asOwner]);

  // The database, live.
  useEffect(() => {
    let stop: () => void = () => {};
    let gone = false;
    let first = true;
    void listenToFeed(
      (heard) => {
        if (gone) return;
        liveRef.current = true;
        setLive(true);
        setFeed(heard.slice(0, limit));
        // A new moment can change the boards: they are asked for a little later (not for the first answer, which is the page opening).
        if (!first && afterMoment.current === null) {
          afterMoment.current = window.setTimeout(() => {
            afterMoment.current = null;
            refresh();
          }, AFTER_MOMENT_MS);
        }
        first = false;
      },
      () => {
        liveRef.current = false;
        setLive(false);
      },
    ).then((unsubscribe) => {
      if (gone) unsubscribe();
      else stop = unsubscribe;
    });
    return () => {
      gone = true;
      stop();
      if (afterMoment.current !== null) window.clearTimeout(afterMoment.current);
      afterMoment.current = null;
      liveRef.current = false;
    };
  }, [refresh, limit]);

  return { summary, feed, live, unavailable, skew, refresh };
}
