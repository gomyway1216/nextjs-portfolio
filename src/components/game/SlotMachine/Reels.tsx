'use client';

import { useEffect, useRef, useState } from 'react';
import { PHYSICAL_STOPS, REELS, type Stops } from './engine';
import { mod, planReels, reelPosition, reelSpeed, spinDuration } from './reelMotion';
import { SlotSymbol } from './Symbols';
import styles from './SlotMachine.module.css';

/** Cells per rendered strip: the 22 stops plus the first 3 again, so wrapping is seamless. */
const STRIP_CELLS = PHYSICAL_STOPS + 3;
/** Above this speed (cells per second) a reel is drawn motion-blurred. */
const BLUR_SPEED = 14;
/** With prefers-reduced-motion the reels jump to the result after this pause. */
export const REDUCED_MOTION_SETTLE_MS = 250;

const translate = (position: number) => `translate3d(0, ${(-(mod(position) / STRIP_CELLS) * 100).toFixed(4)}%, 0)`;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface ReelsProps {
  /** Physical stop on the payline for each reel (the target while spinning). */
  stops: Stops;
  /** Bump for every spin; 0 = not spun yet. Must never repeat. */
  spinId: number;
  /** Let the last reel spin longer (7-7 on the first two reels). */
  anticipation: boolean;
  /** Reels whose payline symbol is part of the win, lit up once settled. */
  winningReels: readonly number[];
  onSettled?: () => void;
  /** Accessible description of the reel window. */
  label: string;
}

export const Reels = ({ stops, spinId, anticipation, winningReels, onSettled, label }: ReelsProps) => {
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Initial positions render into the markup once; afterwards the animation
  // loop owns the transforms (the JSX value never changes, so React leaves them).
  const [initialPositions] = useState(() => stops.map((s) => mod(s - 1)));
  const positionsRef = useRef<number[]>(initialPositions);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  const [settled, setSettled] = useState(true);
  const [trackedSpinId, setTrackedSpinId] = useState(spinId);
  if (trackedSpinId !== spinId) {
    setTrackedSpinId(spinId);
    setSettled(spinId === 0);
  }

  useEffect(() => {
    if (spinId === 0) return;
    const plans = planReels(positionsRef.current, stops, anticipation);
    const total = spinDuration(plans);

    const draw = (t: number) => {
      plans.forEach((plan, r) => {
        const position = reelPosition(plan, t);
        positionsRef.current[r] = position;
        const el = stripRefs.current[r];
        if (!el) return;
        el.style.transform = translate(position);
        el.dataset.blur = t < plan.durationMs && reelSpeed(plan, t) > BLUR_SPEED ? 'true' : 'false';
      });
    };
    const finish = () => {
      positionsRef.current = stops.map((s) => mod(s - 1));
      setSettled(true);
      onSettledRef.current?.();
    };

    let raf = 0;
    let timer = 0;
    if (prefersReducedMotion()) {
      draw(total);
      timer = window.setTimeout(finish, REDUCED_MOTION_SETTLE_MS);
    } else {
      let t0: number | null = null;
      const tick = (now: number) => {
        if (t0 === null) t0 = now;
        const t = now - t0;
        draw(Math.min(t, total));
        if (t < total) raf = window.requestAnimationFrame(tick);
        else finish();
      };
      raf = window.requestAnimationFrame(tick);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [spinId, stops, anticipation]);

  return (
    <div className={styles.reelWindow} role="img" aria-label={label} data-spinning={settled ? 'false' : 'true'}>
      {REELS.map((reel, r) => (
        <div key={r} className={styles.reel}>
          <div
            ref={(el) => {
              stripRefs.current[r] = el;
            }}
            className={styles.strip}
            style={{ transform: translate(initialPositions[r]) }}
            data-reel={r}
          >
            {Array.from({ length: STRIP_CELLS }, (_, i) => (
              <div key={i} className={styles.cell}>
                <SlotSymbol id={reel[i % PHYSICAL_STOPS].symbol} className={styles.cellSymbol} />
              </div>
            ))}
          </div>
          <div
            className={`${styles.winFrame} ${settled && winningReels.includes(r) ? styles.winFrameOn : ''}`}
            aria-hidden="true"
          />
        </div>
      ))}
      <div className={styles.payline} aria-hidden="true" />
    </div>
  );
};
