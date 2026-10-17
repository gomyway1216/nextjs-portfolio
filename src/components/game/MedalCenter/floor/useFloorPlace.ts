'use client';

/**
 * A signed-in player's place on the floor, for the place card: asked once the
 * site knows who is signed in, and changed when they join, rename or leave.
 * Every call is made with a token of the player it was started for, and what
 * comes back for somebody who has since signed out is not shown.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FloorMe } from '@/lib/medalFloor/types';
import { FloorCallError, deleteMe, fetchMe, putMe } from './api';
import type { PlaceState } from './FloorParts';
import { announceFloorPlace } from './reporter';
import type { FloorStrings } from './strings';

/** The signed-in account the card is for (never a guest), or null. */
export interface FloorMember {
  uid: string;
  token: () => Promise<string>;
}

const stateOf = (me: FloorMe): PlaceState => (me.blocked ? { kind: 'blocked' } : me.joined && me.tag ? { kind: 'on', name: me.name, tag: me.tag } : { kind: 'off' });

/** Something heard for one account: shown only while that account is the one signed in. */
interface Heard<T> {
  uid: string;
  value: T;
}

export function useFloorPlace(member: FloorMember | null, settled: boolean, t: FloorStrings) {
  const uid = member?.uid ?? null;
  const [answer, setAnswer] = useState<Heard<PlaceState> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<Heard<string> | null>(null);
  const [said, setSaid] = useState('');
  const memberRef = useRef(member);
  const whose = useRef(uid);
  useEffect(() => {
    memberRef.current = member;
    whose.current = uid;
  });

  // Asked once for each account that signs in.
  useEffect(() => {
    const asking = memberRef.current;
    if (!uid || !asking || asking.uid !== uid) return;
    let gone = false;
    void (async () => {
      let state: PlaceState;
      try {
        const me = await fetchMe(await asking.token());
        state = stateOf(me);
        if (!gone) announceFloorPlace(uid, me.joined);
      } catch (error) {
        state = error instanceof FloorCallError && error.status === 403 ? { kind: 'guest' } : { kind: 'unavailable' };
      }
      if (!gone) setAnswer({ uid, value: state });
    })();
    return () => {
      gone = true;
    };
  }, [uid]);

  const state: PlaceState = !uid ? { kind: settled ? 'guest' : 'checking' } : answer?.uid === uid ? answer.value : { kind: 'checking' };

  const act = useCallback(
    async (run: (token: string) => Promise<FloorMe>, sayDone: (me: FloorMe) => string) => {
      const asking = memberRef.current;
      if (!asking) return;
      const forUid = asking.uid;
      setBusy(forUid);
      setProblem(null);
      try {
        const me = await run(await asking.token());
        if (whose.current !== forUid) return;
        setAnswer({ uid: forUid, value: stateOf(me) });
        announceFloorPlace(forUid, me.joined);
        setSaid(sayDone(me));
      } catch (error) {
        if (whose.current !== forUid) return;
        if (error instanceof FloorCallError && error.status === 400 && error.reason) setProblem({ uid: forUid, value: t.refusals[error.reason] });
        else if (error instanceof FloorCallError && error.status === 403) setAnswer({ uid: forUid, value: { kind: 'blocked' } });
        else setProblem({ uid: forUid, value: t.failed });
      } finally {
        setBusy((now) => (now === forUid ? null : now));
      }
    },
    [t],
  );

  const join = useCallback(
    (name: string | null) => {
      void act(
        (token) => putMe(token, name),
        (me) => t.joinedSay(me.name ?? t.defaultName(me.tag ?? '')),
      );
    },
    [act, t],
  );
  const leave = useCallback(() => {
    void act(
      (token) => deleteMe(token),
      () => t.leftSay,
    );
  }, [act, t]);

  return { state, busy: busy !== null && busy === uid, problem: problem && problem.uid === uid ? problem.value : null, said, join, leave };
}
