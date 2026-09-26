'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { WHEEL_ORDER, colorOf } from './engine';
import {
  INITIAL_POSE,
  SLICE_DEG,
  WHEEL_GEOMETRY as G,
  frameAt,
  planSpin,
  type BallFrame,
  type SpinPlan,
  type WheelPose,
} from './ballPhysics';
import styles from './Roulette.module.css';

interface WheelProps {
  /** Target pocket number (0-36). */
  result: number | null;
  /**
   * Spin counter — bump on every new spin (even if `result` repeats) so the
   * wheel re-animates. 0 = no spin yet. Must never repeat a previous value.
   */
  spinId: number;
  /** Called once the ball has settled and the wheel has stopped. */
  onSettled?: () => void;
  /** Maximum rendered width in CSS px (the wheel shrinks to fit its container). */
  size?: number;
  /** Localized aria-label for the settled result (given the pocket number). */
  resultLabel?: (n: number) => string;
  /** Localized aria-label while idle / spinning. */
  idleLabel?: string;
}

export const SPIN_DURATION_MS = 5600;
/** With prefers-reduced-motion the wheel jumps to the result after a short pause. */
export const REDUCED_MOTION_SETTLE_MS = 350;

const VB = 300;
const C = VB / 2;
const R = VB / 2;
/** Motion-blur streak lengths, as fractions of the spin duration. */
const STREAK_LAGS = [0.009, 0.0045];

const colorFill: Record<string, string> = {
  red: '#c8102e',
  black: '#17171c',
  green: '#0f7a3d',
};
const pocketFill: Record<string, string> = {
  red: '#8e0b20',
  black: '#0c0c10',
  green: '#0a5a2c',
};

const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

/** Compass angle (0 = 12 o'clock, clockwise) → SVG point at radius `r` (fraction of R). */
function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [C + r * R * Math.sin(rad), C - r * R * Math.cos(rad)];
}

function sectorPath(rIn: number, rOut: number, a0: number, a1: number): string {
  const [x1, y1] = polar(rOut, a0);
  const [x2, y2] = polar(rOut, a1);
  const [x3, y3] = polar(rIn, a1);
  const [x4, y4] = polar(rIn, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return [
    `M ${fmt(x1)} ${fmt(y1)}`,
    `A ${fmt(rOut * R)} ${fmt(rOut * R)} 0 ${large} 1 ${fmt(x2)} ${fmt(y2)}`,
    `L ${fmt(x3)} ${fmt(y3)}`,
    `A ${fmt(rIn * R)} ${fmt(rIn * R)} 0 ${large} 0 ${fmt(x4)} ${fmt(y4)}`,
    'Z',
  ].join(' ');
}

function arcPath(r: number, from: number, to: number): string {
  const [x1, y1] = polar(r, from);
  const [x2, y2] = polar(r, to);
  const sweep = to > from ? 1 : 0;
  return `M ${fmt(x1)} ${fmt(y1)} A ${fmt(r * R)} ${fmt(r * R)} 0 0 ${sweep} ${fmt(x2)} ${fmt(y2)}`;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const [INITIAL_BALL_X, INITIAL_BALL_Y] = polar(INITIAL_POSE.ballR, INITIAL_POSE.ball);
const INITIAL_BALL_TRANSFORM = `translate(${fmt(INITIAL_BALL_X)} ${fmt(INITIAL_BALL_Y)})`;
const INITIAL_SHADOW_TRANSFORM = `translate(${fmt(INITIAL_BALL_X + 1.2)} ${fmt(INITIAL_BALL_Y + 1.6)})`;
const INITIAL_HEAD_TRANSFORM = `rotate(${INITIAL_POSE.wheel}deg)`;

// Static wheel-head artwork (rotated as a whole) — computed once.
const HEAD_SLICES = WHEEL_ORDER.map((n, i) => {
  const center = i * SLICE_DEG;
  const a0 = center - SLICE_DEG / 2;
  const a1 = center + SLICE_DEG / 2;
  const [lx, ly] = polar((G.headOuter + G.numberInner) / 2, center);
  const [fx0, fy0] = polar(G.pocketInner, a1);
  const [fx1, fy1] = polar(G.headOuter, a1);
  return {
    n,
    color: colorOf(n),
    numberPath: sectorPath(G.numberInner, G.headOuter, a0, a1),
    pocketPath: sectorPath(G.pocketInner, G.numberInner, a0, a1),
    label: { x: fmt(lx), y: fmt(ly), rotate: `rotate(${fmt(center)} ${fmt(lx)} ${fmt(ly)})` },
    fret: { x1: fmt(fx0), y1: fmt(fy0), x2: fmt(fx1), y2: fmt(fy1) },
  };
});

const DIAMONDS = Array.from({ length: 8 }, (_, i) => {
  const angle = i * 45 + 22.5;
  const [x, y] = polar(G.deflector, angle);
  // Real wheels alternate upright and flat diamonds.
  const long = i % 2 === 0 ? 7 : 4.2;
  const wide = i % 2 === 0 ? 3.2 : 5;
  return {
    d: `M ${fmt(x)} ${fmt(y - long)} L ${fmt(x + wide)} ${fmt(y)} L ${fmt(x)} ${fmt(y + long)} L ${fmt(x - wide)} ${fmt(y)} Z`,
    transform: `rotate(${fmt(angle)} ${fmt(x)} ${fmt(y)})`,
  };
});

const TURRET_SPOKES = [0, 90, 180, 270].map((angle) => {
  const [x1, y1] = polar(0.07, angle);
  const [x2, y2] = polar(0.36, angle);
  return { x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2), knob: polar(0.36, angle).map(fmt) };
});

const WIN_OUTLINE = sectorPath(G.pocketInner, G.headOuter, -SLICE_DEG / 2, SLICE_DEG / 2);

export const Wheel = ({ result, spinId, onSettled, size = 300, resultLabel, idleLabel }: WheelProps) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const headRef = useRef<SVGSVGElement>(null);
  const ballRef = useRef<SVGGElement>(null);
  const shadowRef = useRef<SVGCircleElement>(null);
  const streakRefs = useRef<(SVGPathElement | null)[]>([]);
  const poseRef = useRef<WheelPose>(INITIAL_POSE);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  // `settled` flips back to false whenever a new spin starts (state adjusted
  // during render, React's recommended pattern for resetting on prop change).
  const [settled, setSettled] = useState(false);
  const [trackedSpinId, setTrackedSpinId] = useState(spinId);
  if (trackedSpinId !== spinId) {
    setTrackedSpinId(spinId);
    setSettled(false);
  }

  useEffect(() => {
    if (spinId === 0 || result === null) return;
    const plan: SpinPlan = planSpin(result, poseRef.current);

    const render = (frame: BallFrame, u: number) => {
      poseRef.current = { wheel: frame.wheel, ball: frame.ball, ballR: frame.ballR };
      if (headRef.current) headRef.current.style.transform = `rotate(${fmt(frame.wheel)}deg)`;
      const [x, y] = polar(frame.ballR, frame.ball);
      ballRef.current?.setAttribute('transform', `translate(${fmt(x)} ${fmt(y)}) scale(${fmt(1 + 0.45 * frame.lift)})`);
      const drop = 1.6 + 5 * frame.lift;
      shadowRef.current?.setAttribute('transform', `translate(${fmt(x + drop * 0.75)} ${fmt(y + drop)})`);
      shadowRef.current?.setAttribute('opacity', fmt(0.45 - 0.25 * frame.lift));

      // Motion-blur streaks while the ball is rolling fast; faded out as it
      // starts clattering over the frets.
      const fade = u < plan.uHit ? 1 : u < plan.uLand ? 1 - (u - plan.uHit) / (plan.uLand - plan.uHit) : 0;
      STREAK_LAGS.forEach((lag, i) => {
        const el = streakRefs.current[i];
        if (!el) return;
        const prev = frameAt(plan, u - lag);
        const span = Math.max(-60, Math.min(60, frame.ball - prev.ball));
        if (fade <= 0 || Math.abs(span) < 1.5) {
          el.setAttribute('opacity', '0');
          return;
        }
        el.setAttribute('d', arcPath(frame.ballR, frame.ball - span, frame.ball));
        el.setAttribute('opacity', fmt((i === 0 ? 0.16 : 0.28) * fade));
      });
    };

    const finish = () => {
      setSettled(true);
      onSettledRef.current?.();
    };

    let raf = 0;
    let timer = 0;
    if (prefersReducedMotion()) {
      render(frameAt(plan, 1), 1);
      timer = window.setTimeout(finish, REDUCED_MOTION_SETTLE_MS);
    } else {
      let t0: number | null = null;
      const tick = (now: number) => {
        if (t0 === null) t0 = now;
        const u = Math.min(1, (now - t0) / SPIN_DURATION_MS);
        render(frameAt(plan, u), u);
        if (u < 1) raf = window.requestAnimationFrame(tick);
        else finish();
      };
      raf = window.requestAnimationFrame(tick);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [spinId, result]);

  const shownResult = spinId !== 0 && settled ? result : null;
  const showResult = shownResult !== null;
  const id = (name: string) => `rl-${uid}-${name}`;

  return (
    <div
      className={styles.wheel}
      style={{ maxWidth: size }}
      role="img"
      aria-label={
        shownResult !== null
          ? resultLabel
            ? resultLabel(shownResult)
            : `Roulette wheel showing ${shownResult}`
          : idleLabel ?? 'Roulette wheel'
      }
      data-spinning={spinId !== 0 && result !== null && !settled ? 'true' : 'false'}
    >
      {/* Static bowl: wooden rim, ball track, apron with diamond deflectors */}
      <svg className={styles.wheelLayer} viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={id('rim')} cx="50%" cy="50%" r="50%">
            <stop offset="88%" stopColor="#6b3d17" />
            <stop offset="95%" stopColor="#4a2810" />
            <stop offset="100%" stopColor="#2a1607" />
          </radialGradient>
          <radialGradient id={id('track')} cx="50%" cy="45%" r="50%">
            <stop offset="80%" stopColor="#3b2412" />
            <stop offset="100%" stopColor="#1f1208" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={R - 0.5} fill={`url(#${id('rim')})`} />
        <circle cx={C} cy={C} r={G.trackOuter * R} fill={`url(#${id('track')})`} stroke="#c8962f" strokeWidth={1.2} />
        <circle cx={C} cy={C} r={G.trackInner * R} fill="#24160b" stroke="rgba(200,150,47,0.55)" strokeWidth={0.8} />
        {DIAMONDS.map((dm, i) => (
          <path key={i} d={dm.d} transform={dm.transform} fill="#e9c46a" stroke="#8a6414" strokeWidth={0.5} />
        ))}
      </svg>

      {/* Rotating wheel head — transformed directly by the animation loop */}
      <svg
        ref={headRef}
        className={`${styles.wheelLayer} ${styles.wheelHead}`}
        viewBox={`0 0 ${VB} ${VB}`}
        style={{ transform: INITIAL_HEAD_TRANSFORM }}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient id={id('cone')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8a5a2b" />
            <stop offset="70%" stopColor="#5b3716" />
            <stop offset="100%" stopColor="#3a2410" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={G.headOuter * R} fill="#1a0f06" stroke="#e0a83c" strokeWidth={1.4} />
        {HEAD_SLICES.map((s) => (
          <g key={s.n}>
            <path d={s.numberPath} fill={colorFill[s.color]} stroke="rgba(224,168,60,0.55)" strokeWidth={0.5} />
            <path d={s.pocketPath} fill={pocketFill[s.color]} />
            <text
              x={s.label.x}
              y={s.label.y}
              fill="#fff"
              fontSize={10.4}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
              transform={s.label.rotate}
            >
              {s.n}
            </text>
            <line {...s.fret} stroke="#d9b25f" strokeWidth={0.9} />
          </g>
        ))}
        <circle cx={C} cy={C} r={G.numberInner * R} fill="none" stroke="#d9b25f" strokeWidth={1} />
        <circle cx={C} cy={C} r={G.pocketInner * R} fill={`url(#${id('cone')})`} stroke="#e0a83c" strokeWidth={1.4} />
        <circle cx={C} cy={C} r={0.4 * R} fill="none" stroke="rgba(224,168,60,0.35)" strokeWidth={0.8} />
        {TURRET_SPOKES.map((sp, i) => (
          <g key={i}>
            <line x1={sp.x1} y1={sp.y1} x2={sp.x2} y2={sp.y2} stroke="#e9c46a" strokeWidth={3.2} strokeLinecap="round" />
            <circle cx={sp.knob[0]} cy={sp.knob[1]} r={3.6} fill="#f4d58d" stroke="#8a6414" strokeWidth={0.6} />
          </g>
        ))}
        <circle cx={C} cy={C} r={0.1 * R} fill="#e9c46a" stroke="#8a6414" strokeWidth={0.8} />
        <circle cx={C} cy={C} r={0.04 * R} fill="#fff3cf" />
      </svg>

      {/* Ball, motion blur, winning-pocket highlight and the marker */}
      <svg className={styles.wheelLayer} viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={id('ball')} cx="35%" cy="32%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#e5e7eb" />
            <stop offset="100%" stopColor="#9ca3af" />
          </radialGradient>
        </defs>
        <path
          d={WIN_OUTLINE}
          className={`${styles.winPocket} ${showResult ? styles.winPocketOn : ''}`}
          fill="rgba(224,168,60,0.18)"
          stroke="#ffd166"
          strokeWidth={2}
        />
        {STREAK_LAGS.map((_, i) => (
          <path
            key={i}
            ref={(el) => {
              streakRefs.current[i] = el;
            }}
            d=""
            fill="none"
            stroke="#f8fafc"
            strokeWidth={G.ball * R * 1.7}
            strokeLinecap="round"
            opacity={0}
          />
        ))}
        <circle ref={shadowRef} cx={0} cy={0} r={G.ball * R} fill="#000" opacity={0.45} transform={INITIAL_SHADOW_TRANSFORM} />
        <g ref={ballRef} transform={INITIAL_BALL_TRANSFORM} data-ball="true">
          <circle cx={0} cy={0} r={G.ball * R} fill={`url(#${id('ball')})`} stroke="#6b7280" strokeWidth={0.4} />
        </g>
        <path
          d={`M ${C - 8} 1 L ${C + 8} 1 L ${C} 17 Z`}
          fill="#e0a83c"
          stroke="#7a5510"
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
