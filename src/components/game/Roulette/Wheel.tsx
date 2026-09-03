'use client';

import { useEffect, useRef, useState } from 'react';
import { WHEEL_ORDER, POCKET_COUNT, colorOf } from './engine';

interface WheelProps {
  /** Target pocket number (0-36). */
  result: number | null;
  /**
   * Monotonic spin counter — bump on every new spin (even if `result`
   * repeats) so the wheel re-animates. 0 = no spin yet.
   */
  spinId: number;
  /** Called once the spin animation settles. */
  onSettled?: () => void;
  size?: number;
  /** Localized aria-label for the settled result (given the pocket number). */
  resultLabel?: (n: number) => string;
  /** Localized aria-label while idle / spinning. */
  idleLabel?: string;
}

const SLICE_DEG = 360 / POCKET_COUNT;
const WHEEL_TURNS = 6;
const BALL_TURNS = 11; // ball travels the opposite way, faster
const SPIN_DURATION_MS = 3800;

const colorFill: Record<string, string> = {
  red: '#d11f2a',
  black: '#1a1a1f',
  green: '#0f7a3d',
};

export const Wheel = ({ result, spinId, onSettled, size = 300, resultLabel, idleLabel }: WheelProps) => {
  const [rotation, setRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);
  // Tracks whether the ball is still in motion, so the aria-label can announce
  // the settled result. Distinct from `hasSpun` (used to enable CSS transitions
  // after the first spin), which never turns back off.
  const [isSpinning, setIsSpinning] = useState(false);
  const prevSpinId = useRef<number>(0);
  const settleTimer = useRef<number | null>(null);

  useEffect(() => {
    if (spinId === 0 || result === null || spinId === prevSpinId.current) return;
    prevSpinId.current = spinId;
    setIsSpinning(true);

    const indexOnWheel = WHEEL_ORDER.indexOf(result);
    // We want the chosen slice to end up at the top (pointer at 12 o'clock).
    // Slice i sits centered at angle (i + 0.5) * SLICE_DEG when rotation = 0.
    // To rotate it to top we need the wheel rotated by -(i + 0.5) * SLICE_DEG.
    const targetWithinTurn = -(indexOnWheel + 0.5) * SLICE_DEG;
    // Always advance forward and add full turns for visual effect.
    setRotation((current) => {
      const currentMod = ((current % 360) + 360) % 360;
      const delta = ((targetWithinTurn - currentMod) % 360 + 360) % 360;
      return current + delta + WHEEL_TURNS * 360;
    });
    // The ball counter-rotates and lands over the same slice: because the
    // ball sits in the OUTER static frame, to appear over the winning pocket
    // (which ends at the top) the ball must point straight up (0deg within
    // the turn), spinning the opposite direction for realism.
    setBallRotation((current) => {
      const currentMod = ((current % 360) + 360) % 360;
      // target 0 (top) going negative (counter-clockwise)
      const delta = ((0 - currentMod) % 360 + 360) % 360; // positive forward
      return current - (BALL_TURNS * 360 - delta);
    });

    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      setIsSpinning(false);
      onSettled?.();
    }, SPIN_DURATION_MS);

    return () => {
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
    };
  }, [spinId, result, onSettled]);

  const radius = size / 2;
  const innerRadius = radius * 0.46;
  const labelRadius = radius * 0.79;
  const ballOrbit = radius * 0.9;
  const hasSpun = spinId !== 0;

  const slices = WHEEL_ORDER.map((n, i) => {
    const startAngle = i * SLICE_DEG - 90; // -90 so index 0 is at top
    const endAngle = (i + 1) * SLICE_DEG - 90;
    const midAngle = (startAngle + endAngle) / 2;
    const path = arcPath(radius, radius, innerRadius, radius - 4, startAngle, endAngle);
    const labelX = radius + Math.cos((midAngle * Math.PI) / 180) * labelRadius;
    const labelY = radius + Math.sin((midAngle * Math.PI) / 180) * labelRadius;
    return (
      <g key={`${n}-${i}`}>
        <path d={path} fill={colorFill[colorOf(n)]} stroke="rgba(0,0,0,0.5)" strokeWidth={0.5} />
        <text
          x={labelX}
          y={labelY}
          fill="#fff"
          fontSize={radius * 0.072}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${midAngle + 90}, ${labelX}, ${labelY})`}
        >
          {n}
        </text>
      </g>
    );
  });

  const spinTransition = `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.17, 0.84, 0.32, 1.0)`;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: size,
        aspectRatio: `${size} / ${size + 24}`,
        margin: '0 auto',
      }}
      role="img"
      aria-label={
        result !== null && !isSpinning
          ? resultLabel
            ? resultLabel(result)
            : `Roulette wheel showing ${result}`
          : idleLabel ?? 'Roulette wheel'
      }
    >
      {/* Pointer at top */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '11px solid transparent',
          borderRight: '11px solid transparent',
          borderTop: '18px solid var(--rl-gold, #e0a83c)',
          zIndex: 3,
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))',
        }}
      />

      {/* Rotating wheel */}
      <svg
        width="100%"
        viewBox={`0 0 ${size} ${size}`}
        style={{
          height: 'auto',
          marginTop: '8%',
          transform: `rotate(${rotation}deg)`,
          transition: hasSpun ? spinTransition : 'none',
          display: 'block',
        }}
      >
        <circle cx={radius} cy={radius} r={radius - 1} fill="#3a2410" />
        <circle cx={radius} cy={radius} r={radius - 3} fill="none" stroke="#e0a83c" strokeWidth={2} opacity={0.6} />
        {slices}
        <circle cx={radius} cy={radius} r={innerRadius} fill="#241608" stroke="#e0a83c" strokeWidth={2} />
        <circle cx={radius} cy={radius} r={innerRadius * 0.55} fill="#3a2410" />
        <circle cx={radius} cy={radius} r={innerRadius * 0.2} fill="#e0a83c" />
      </svg>

      {/* Ball layer — separate SVG so it can rotate independently */}
      <svg
        width="100%"
        viewBox={`0 0 ${size} ${size}`}
        style={{
          height: 'auto',
          position: 'absolute',
          left: 0,
          top: '8%',
          pointerEvents: 'none',
          transform: `rotate(${ballRotation}deg)`,
          transition: hasSpun ? spinTransition : 'none',
        }}
      >
        <circle
          cx={radius}
          cy={radius - ballOrbit}
          r={radius * 0.045}
          fill="#f8fafc"
          stroke="#94a3b8"
          strokeWidth={0.5}
        />
      </svg>
    </div>
  );
};

function arcPath(cx: number, cy: number, rInner: number, rOuter: number, startDeg: number, endDeg: number): string {
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const x1 = cx + rOuter * Math.cos(startRad);
  const y1 = cy + rOuter * Math.sin(startRad);
  const x2 = cx + rOuter * Math.cos(endRad);
  const y2 = cy + rOuter * Math.sin(endRad);
  const x3 = cx + rInner * Math.cos(endRad);
  const y3 = cy + rInner * Math.sin(endRad);
  const x4 = cx + rInner * Math.cos(startRad);
  const y4 = cy + rInner * Math.sin(startRad);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export const WHEEL_SPIN_MS = SPIN_DURATION_MS;
