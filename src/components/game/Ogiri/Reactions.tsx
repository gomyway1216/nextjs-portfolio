'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomView } from '@/lib/ogiri/types';
import {
  emptyReactionCounts,
  MAX_REACTION_BATCH,
  REACTION_EMOJI,
  REACTION_FLUSH_MS,
  REACTION_KINDS,
  REACTION_LABEL,
  reactionBursts,
  type ReactionCounts,
  type ReactionKind,
} from '@/lib/ogiri/reactions';
import styles from './Reactions.module.css';

type Float = { id: number; kind: ReactionKind; left: number; delay: number; drift: number };
const MAX_FLOATS = 40;

/** Phone buttons. Taps are counted locally and sent as one small batch every few seconds;
 * a failed batch is simply dropped because reactions are display only. */
export function ReactionBar({ code, view, reduced, onView }: {
  code: string;
  view: RoomView;
  reduced: boolean;
  onView: (view: RoomView) => void;
}) {
  const pending = useRef<ReactionCounts>(emptyReactionCounts());
  const turn = useRef(view.turn);
  const lastSent = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nextPop = useRef(0);
  const [pops, setPops] = useState<{ id: number; kind: ReactionKind; left: number }[]>([]);
  useEffect(() => {
    if (turn.current === view.turn) return;
    turn.current = view.turn;
    pending.current = emptyReactionCounts();
  }, [view.turn]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flush = useCallback(async () => {
    timer.current = undefined;
    const counts = pending.current;
    pending.current = emptyReactionCounts();
    if (!REACTION_KINDS.some((kind) => counts[kind] > 0)) return;
    lastSent.current = Date.now();
    try {
      const res = await fetch(`/api/ogiri/${code}/reactions`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counts, turn: turn.current }),
      });
      if (res.ok) onView(await res.json());
    } catch {
      // Display-only: never surface an error or retry a stale batch.
    }
  }, [code, onView]);
  const tap = useCallback((kind: ReactionKind) => {
    if (pending.current[kind] < MAX_REACTION_BATCH) pending.current[kind]++;
    if (!reduced) {
      const id = nextPop.current++;
      setPops((current) => [...current.slice(-11), { id, kind, left: 20 + Math.random() * 60 }]);
      setTimeout(() => setPops((current) => current.filter((pop) => pop.id !== id)), 900);
    }
    if (!timer.current)
      timer.current = setTimeout(() => void flush(), Math.max(300, lastSent.current + REACTION_FLUSH_MS - Date.now()));
  }, [reduced, flush]);
  return (
    <section className={styles.bar} aria-label="リアクション">
      {REACTION_KINDS.map((kind) => (
        <button key={kind} type="button" className={styles.button} aria-label={REACTION_LABEL[kind]} onClick={() => tap(kind)}>
          <span aria-hidden="true">{REACTION_EMOJI[kind]}</span>
          <small>{view.reactions?.[kind] ?? 0}</small>
        </button>
      ))}
      <span className={styles.pops} aria-hidden="true">
        {pops.map((pop) => (
          <i key={pop.id} style={{ left: `${pop.left}%` }}>{REACTION_EMOJI[pop.kind]}</i>
        ))}
      </span>
      <small className={styles.note}>連打OK・得点には入りません</small>
    </section>
  );
}

/** TV overlay: floats only the increase since the previous poll of the same turn, so a
 * reload or a late-joining TV doesn't replay old reactions. */
export function ReactionFloats({ view, reduced }: { view: RoomView; reduced: boolean }) {
  const previous = useRef<{ turn: string; counts: ReactionCounts } | null>(null);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [floats, setFloats] = useState<Float[]>([]);
  const counts = view.reactions;
  useEffect(() => {
    const before = previous.current;
    previous.current = { turn: view.turn, counts: counts ?? emptyReactionCounts() };
    if (!before || !counts || reduced) return;
    const burst = reactionBursts(before.turn === view.turn ? before.counts : null, counts);
    const added: Float[] = REACTION_KINDS.flatMap((kind) =>
      Array.from({ length: burst[kind] }, () => ({
        id: nextId.current++,
        kind,
        left: 4 + Math.random() * 88,
        delay: Math.random() * 1.2,
        drift: Math.round(Math.random() * 80 - 40),
      })),
    );
    if (!added.length) return;
    setFloats((current) => [...current, ...added].slice(-MAX_FLOATS));
    const ids = new Set(added.map((float) => float.id));
    // Every poll re-runs this effect, so removal timers live outside its cleanup.
    timers.current.add(setTimeout(() => setFloats((current) => current.filter((float) => !ids.has(float.id))), 4200));
  }, [counts, view.turn, reduced]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  if (!counts) return null;
  return (
    <>
      {!reduced && (
        <div className={styles.floats} aria-hidden="true">
          {floats.map((float) => (
            <i
              key={float.id}
              style={{ left: `${float.left}%`, animationDelay: `${float.delay}s`, ['--drift' as string]: `${float.drift}px` }}
            >
              {REACTION_EMOJI[float.kind]}
            </i>
          ))}
        </div>
      )}
      <p className={styles.tally} aria-label="みんなのリアクション">
        {REACTION_KINDS.map((kind) => (
          <span key={kind}>
            {REACTION_EMOJI[kind]} <b>{counts[kind]}</b>
          </span>
        ))}
      </p>
    </>
  );
}
