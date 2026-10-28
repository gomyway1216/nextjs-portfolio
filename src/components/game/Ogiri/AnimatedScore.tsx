'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import styles from './Ogiri.module.css';

const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(listener: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
const reducedMotion = () => window.matchMedia(motionQuery).matches;

/** Local presentation only: points and rankings always come from the server. */
export function AnimatedScore({
  value,
  from = 0,
  animate = true,
}: {
  value: number;
  from?: number;
  animate?: boolean;
}) {
  const prefersReduced = useSyncExternalStore(subscribeMotion, reducedMotion, () => true);
  const enabled = animate && !prefersReduced;
  const [counter, setCounter] = useState({ from, value, display: from });
  if (counter.from !== from || counter.value !== value) {
    setCounter({ from, value, display: from });
  }
  useEffect(() => {
    if (!enabled || from === value) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / 1000));
      const eased = 1 - (1 - progress) ** 3;
      setCounter((current) => current.from === from && current.value === value
        ? { ...current, display: Math.round(from + (value - from) * eased) }
        : current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [enabled, from, value]);
  const shown = enabled && from !== value ? counter.display : value;
  return (
    <span
      className={styles.scoreCounter}
      style={{ minWidth: `${Math.max(String(from).length, String(value).length)}ch` }}
      data-testid="score-count"
      data-score-from={from}
      data-score-final={value}
      data-counting={shown !== value}
    >
      {shown}
    </span>
  );
}
