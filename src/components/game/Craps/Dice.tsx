'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dice } from './engine';
import { DICE_ROLL_MS, DIE_SIZE, TABLE_H, dieFrameAt, planThrow, type DieFrame } from './diceMotion';
import styles from './Craps.module.css';

/** Pip centres (viewBox 0–100) for each face. */
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

interface DieFaceProps {
  value: number;
  className?: string;
  title?: string;
}

/** A translucent red casino die showing `value`. */
export const DieFace = ({ value, className, title }: DieFaceProps) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    focusable="false"
    data-value={value}
  >
    <rect x={3} y={3} width={94} height={94} rx={18} fill="#c8102e" stroke="#7f0a1c" strokeWidth={3} />
    <rect x={10} y={8} width={80} height={22} rx={10} fill="#fff" opacity={0.14} />
    {PIPS[value].map(([cx, cy], i) => (
      <circle key={i} cx={cx} cy={cy} r={9} fill="#fff" stroke="#f1d5d9" strokeWidth={1} />
    ))}
  </svg>
);

/** With prefers-reduced-motion the dice land at once. */
export const REDUCED_MOTION_SETTLE_MS = 250;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Where the dice sit before the first roll (in the stickman's corner). */
const RESTING: [DieFrame, DieFrame] = [
  { x: 72, y: 44, z: 0, angle: -12, face: 5 },
  { x: 85, y: 45, z: 0, angle: 9, face: 2 },
];

const dieStyle = (f: DieFrame) => ({
  left: `${f.x}%`,
  top: `${(f.y / TABLE_H) * 100}%`,
  transform: `translate(-50%, -50%) rotate(${f.angle.toFixed(2)}deg) scale(${(1 + f.z * 0.035).toFixed(3)})`,
});
const shadowStyle = (f: DieFrame) => ({
  left: `${f.x + f.z * 0.35}%`,
  top: `${((f.y + f.z * 0.6) / TABLE_H) * 100}%`,
  opacity: Math.max(0.15, 0.5 - f.z * 0.03),
});

interface DiceTrayProps {
  /** The dice the engine rolled (target of the current throw). */
  dice: Dice | null;
  /** Bump for every roll; 0 = not rolled yet. Must never repeat. */
  rollId: number;
  onSettled?: () => void;
  label: string;
}

export const DiceTray = ({ dice, rollId, onSettled, label }: DiceTrayProps) => {
  const dieRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shadowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  const [settled, setSettled] = useState(true);
  const [trackedRollId, setTrackedRollId] = useState(rollId);
  if (trackedRollId !== rollId) {
    setTrackedRollId(rollId);
    setSettled(rollId === 0);
  }

  const placeDie = (i: number, frame: DieFrame) => {
    const die = dieRefs.current[i];
    const shadow = shadowRefs.current[i];
    if (die) {
      Object.assign(die.style, dieStyle(frame));
      die.dataset.face = String(frame.face);
    }
    if (shadow) {
      const s = shadowStyle(frame);
      shadow.style.left = s.left;
      shadow.style.top = s.top;
      shadow.style.opacity = String(s.opacity);
    }
  };

  // Dice cleared (e.g. the table was reset): gather them back in the corner.
  useEffect(() => {
    if (dice === null) RESTING.forEach((frame, i) => placeDie(i, frame));
  }, [dice]);

  useEffect(() => {
    if (rollId === 0 || dice === null) return;
    const plans = planThrow(dice);

    const draw = (u: number) => {
      plans.forEach((plan, i) => placeDie(i, dieFrameAt(plan, u)));
    };
    const finish = () => {
      setSettled(true);
      onSettledRef.current?.();
    };

    let raf = 0;
    let timer = 0;
    if (prefersReducedMotion()) {
      draw(1);
      timer = window.setTimeout(finish, REDUCED_MOTION_SETTLE_MS);
    } else {
      let t0: number | null = null;
      const tick = (now: number) => {
        if (t0 === null) t0 = now;
        const u = Math.min(1, (now - t0) / DICE_ROLL_MS);
        draw(u);
        if (u < 1) raf = window.requestAnimationFrame(tick);
        else finish();
      };
      raf = window.requestAnimationFrame(tick);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [rollId, dice]);

  return (
    <div className={styles.tray} role="img" aria-label={label} data-rolling={settled ? 'false' : 'true'}>
      <div className={styles.trayWall} aria-hidden="true" />
      {RESTING.map((frame, i) => (
        <div
          key={`shadow-${i}`}
          ref={(el) => {
            shadowRefs.current[i] = el;
          }}
          className={styles.dieShadow}
          style={{ ...shadowStyle(frame), width: `${DIE_SIZE}%` }}
          aria-hidden="true"
        />
      ))}
      {RESTING.map((frame, i) => (
        <div
          key={`die-${i}`}
          ref={(el) => {
            dieRefs.current[i] = el;
          }}
          className={styles.die}
          style={{ ...dieStyle(frame), width: `${DIE_SIZE}%` }}
          data-face={frame.face}
          data-die={i}
          aria-hidden="true"
        >
          {[1, 2, 3, 4, 5, 6].map((v) => (
            <DieFace key={v} value={v} className={styles.dieFace} />
          ))}
        </div>
      ))}
    </div>
  );
};
